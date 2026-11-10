// Server-side MangaDex client. MangaDex requires a real User-Agent and no CORS from browsers,
// so everything goes through our API routes.
import { SOURCE_LANGS } from "./langs";

const API = "https://api.mangadex.org";
export const UA = "MangaTL-course-demo/0.1 (non-commercial course project)";

// Explicit content (erotica, pornographic) is always hidden: it's excluded from every MangaDex
// query, and any manga/chapter/cover opened directly by id is checked before it's served.
const ALLOWED_RATINGS = ["safe", "suggestive"];

export class HiddenContentError extends Error {
  constructor() {
    super("This title is explicit and is hidden in this app.");
  }
}

// Turn an error into an API response: 403 for hidden content, 502 for MangaDex/network trouble.
export function errorResponse(e: unknown) {
  const hidden = e instanceof HiddenContentError;
  return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: hidden ? 403 : 502 });
}

// Rating checks are cached for an hour, so a title MangaDex re-rates as explicit is hidden soon after.
const RATING_TTL = 60 * 60 * 1000;
const mangaRatingCache = new Map<string, { rating: string; at: number }>();
const allowedChapters = new Map<string, number>(); // chapterId -> when its manga passed the check

function isChapterAllowed(chapterId: string) {
  const at = allowedChapters.get(chapterId);
  return at !== undefined && Date.now() - at < RATING_TTL;
}

async function assertMangaAllowed(mangaId: string, knownRating?: string) {
  const cached = mangaRatingCache.get(mangaId);
  let rating = knownRating ?? (cached && Date.now() - cached.at < RATING_TTL ? cached.rating : undefined);
  if (!rating) {
    const json = await md(`/manga/${mangaId}`, {});
    rating = json.data.attributes.contentRating as string;
  }
  mangaRatingCache.set(mangaId, { rating, at: Date.now() });
  if (!ALLOWED_RATINGS.includes(rating)) throw new HiddenContentError();
}

async function md(path: string, params: Record<string, string | string[]> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    for (const item of Array.isArray(v) ? v : [v]) qs.append(k, item);
  }
  const res = await fetch(`${API}${path}?${qs}`, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`MangaDex ${path} -> ${res.status}`);
  return res.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function pickTitle(attr: Any): string {
  const t = attr.title ?? {};
  return t.en ?? t["ja-ro"] ?? t.ja ?? Object.values(t)[0] ?? "Untitled";
}

export async function searchManga(q: string) {
  const json = await md("/manga", {
    title: q,
    limit: "24",
    "includes[]": "cover_art",
    "contentRating[]": ALLOWED_RATINGS,
    "order[relevance]": "desc",
  });
  return json.data.map((m: Any) => {
    const cover = m.relationships.find((r: Any) => r.type === "cover_art");
    const file = cover?.attributes?.fileName;
    return {
      id: m.id,
      title: pickTitle(m.attributes),
      year: m.attributes.year,
      rating: m.attributes.contentRating,
      langs: m.attributes.availableTranslatedLanguages ?? [],
      cover: file
        ? `/api/image?url=${encodeURIComponent(`https://uploads.mangadex.org/covers/${m.id}/${file}.256.jpg`)}`
        : null,
    };
  });
}

export async function getManga(id: string) {
  const json = await md(`/manga/${id}`, {});
  await assertMangaAllowed(id, json.data.attributes.contentRating);
  return { id, title: pickTitle(json.data.attributes) };
}

export type ChapterRow = {
  number: string;
  // Best chapter per language code ("en", "ja", "es", "es-la", "pt", "pt-br").
  byLang: Record<string, ChapterRef>;
};
export type ChapterRef = {
  id: string;
  title: string | null;
  pages: number;
  externalUrl: string | null;
  groups: string[];
};

export async function getChapters(mangaId: string): Promise<ChapterRow[]> {
  const all: Any[] = [];
  for (let offset = 0; offset < 4000; offset += 500) {
    const json = await md(`/manga/${mangaId}/feed`, {
      "translatedLanguage[]": ["en", ...SOURCE_LANGS],
      "contentRating[]": ALLOWED_RATINGS,
      "includes[]": "scanlation_group",
      "order[chapter]": "asc",
      limit: "500",
      offset: String(offset),
    });
    all.push(...json.data);
    if (json.data.length < 500) break;
  }
  const rows = new Map<string, ChapterRow>();
  for (const c of all) {
    const a = c.attributes;
    const num = a.chapter ?? "Oneshot";
    const ref: ChapterRef = {
      id: c.id,
      title: a.title,
      pages: a.pages,
      externalUrl: a.externalUrl,
      groups: c.relationships
        .filter((r: Any) => r.type === "scanlation_group")
        .map((r: Any) => r.attributes?.name)
        .filter(Boolean),
    };
    const row: ChapterRow = rows.get(num) ?? { number: num, byLang: {} };
    const lang: string = a.translatedLanguage;
    const existing = row.byLang[lang];
    // Prefer a chapter that actually has hosted pages.
    if (!existing || (existing.pages === 0 && ref.pages > 0)) row.byLang[lang] = ref;
    rows.set(num, row);
  }
  return [...rows.values()];
}

export async function getChapterInfo(chapterId: string) {
  const json = await md(`/chapter/${chapterId}`, { "includes[]": ["scanlation_group", "manga"] });
  const c = json.data;
  const manga = c.relationships.find((r: Any) => r.type === "manga");
  if (!manga) throw new Error("chapter has no manga");
  await assertMangaAllowed(manga.id, manga.attributes?.contentRating);
  allowedChapters.set(chapterId, Date.now());
  return {
    id: c.id,
    number: c.attributes.chapter,
    title: c.attributes.title,
    lang: c.attributes.translatedLanguage,
    externalUrl: c.attributes.externalUrl,
    mangaId: manga?.id,
    groups: c.relationships
      .filter((r: Any) => r.type === "scanlation_group")
      .map((r: Any) => r.attributes?.name)
      .filter(Boolean),
  };
}

// At-home server URLs expire after ~15 min, and /at-home/server is limited to 40 req/min,
// so cache them for 10 min and refresh on demand.
const pageCache = new Map<string, { urls: string[]; at: number }>();
const PAGE_TTL = 10 * 60 * 1000;
const MIN_REFRESH_GAP = 60 * 1000; // don't re-ask /at-home more than once a minute per chapter
const inflight = new Map<string, Promise<string[]>>(); // de-dupe concurrent lookups

export async function getPageUrls(chapterId: string, fresh = false): Promise<string[]> {
  const hit = pageCache.get(chapterId);
  const age = hit ? Date.now() - hit.at : Infinity;
  // A "fresh" request only refreshes if the cached URLs are older than a minute, so one dead
  // @Home node on a 30-page chapter can't trigger 30 /at-home calls (limit is 40/min).
  if (hit && age < PAGE_TTL && (!fresh || age < MIN_REFRESH_GAP)) return hit.urls;
  const pending = inflight.get(chapterId);
  if (pending) return pending;
  const p = (async () => {
    // Page images and translation reach here by chapter id alone, so check the rating first.
    if (!isChapterAllowed(chapterId)) await getChapterInfo(chapterId);
    const json = await md(`/at-home/server/${chapterId}`, {});
    const { baseUrl, chapter } = json;
    const urls: string[] = chapter.data.map((f: string) => `${baseUrl}/data/${chapter.hash}/${f}`);
    pageCache.set(chapterId, { urls, at: Date.now() });
    return urls;
  })();
  inflight.set(chapterId, p);
  try {
    return await p;
  } finally {
    inflight.delete(chapterId);
  }
}

// Fetch page i of a chapter; if the cached at-home URL has gone stale, refresh it once.
export async function fetchChapterPage(chapterId: string, i: number) {
  for (const fresh of [false, true]) {
    const urls = await getPageUrls(chapterId, fresh);
    if (!Number.isInteger(i) || i < 0 || i >= urls.length) throw new Error("page out of range");
    try {
      const img = await fetchMangadexImage(urls[i]);
      if (img.ok) return img;
    } catch {}
  }
  throw new Error("could not fetch page image from MangaDex");
}

// The generic image proxy only serves cover art (pages go through fetchChapterPage).
// Returns the manga id from a https://uploads.mangadex.org/covers/{mangaId}/{file} URL, or null.
export function coverMangaId(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/covers\/([0-9a-f-]{36})\/[^/]+$/i);
    return u.protocol === "https:" && u.hostname === "uploads.mangadex.org" && m ? m[1] : null;
  } catch {
    return null;
  }
}

export async function fetchCover(url: string) {
  const mangaId = coverMangaId(url);
  if (!mangaId) throw new Error("not a MangaDex cover url");
  await assertMangaAllowed(mangaId);
  return fetchMangadexImage(url);
}

// Fetch an image from the MangaDex@Home network and report the result, as MangaDex requires.
export async function fetchMangadexImage(url: string) {
  const start = Date.now();
  let res: Response | null = null;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
    const buf = await res.arrayBuffer();
    report(url, res.ok, res.headers.get("x-cache")?.startsWith("HIT") ?? false, buf.byteLength, Date.now() - start);
    return { ok: res.ok, status: res.status, buf, type: res.headers.get("content-type") ?? "image/jpeg" };
  } catch (e) {
    report(url, false, false, 0, Date.now() - start);
    throw e;
  }
}

function report(url: string, success: boolean, cached: boolean, bytes: number, duration: number) {
  if (new URL(url).hostname.endsWith("mangadex.org")) return; // reports only for @Home nodes
  fetch("https://api.mangadex.network/report", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ url, success, cached, bytes, duration }),
  }).catch(() => {});
}
