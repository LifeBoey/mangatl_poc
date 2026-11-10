// Server-side MangaDex client. MangaDex requires a real User-Agent and no CORS from browsers,
// so everything goes through our API routes.
const API = "https://api.mangadex.org";
export const UA = "MangaTL-course-demo/0.1 (+https://github.com)";

const ALL_RATINGS = ["safe", "suggestive", "erotica", "pornographic"];

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
    "contentRating[]": ALL_RATINGS,
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
  return { id, title: pickTitle(json.data.attributes) };
}

export type ChapterRow = {
  number: string;
  en: ChapterRef | null;
  ja: ChapterRef | null;
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
  for (let offset = 0; offset < 2000; offset += 500) {
    const json = await md(`/manga/${mangaId}/feed`, {
      "translatedLanguage[]": ["ja", "en"],
      "contentRating[]": ALL_RATINGS,
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
    const row = rows.get(num) ?? { number: num, en: null, ja: null };
    const lang = a.translatedLanguage as "en" | "ja";
    const existing = row[lang];
    // Prefer a chapter that actually has hosted pages.
    if (!existing || (existing.pages === 0 && ref.pages > 0)) row[lang] = ref;
    rows.set(num, row);
  }
  return [...rows.values()];
}

export async function getChapterInfo(chapterId: string) {
  const json = await md(`/chapter/${chapterId}`, { "includes[]": ["scanlation_group", "manga"] });
  const c = json.data;
  const manga = c.relationships.find((r: Any) => r.type === "manga");
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

export async function getPageUrls(chapterId: string, fresh = false): Promise<string[]> {
  const hit = pageCache.get(chapterId);
  if (!fresh && hit && Date.now() - hit.at < PAGE_TTL) return hit.urls;
  const json = await md(`/at-home/server/${chapterId}`, {});
  const { baseUrl, chapter } = json;
  const urls = chapter.data.map((f: string) => `${baseUrl}/data/${chapter.hash}/${f}`);
  pageCache.set(chapterId, { urls, at: Date.now() });
  return urls;
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

// Only proxy MangaDex image hosts (avoid being an open proxy).
export function isMangadexImage(url: string) {
  try {
    const u = new URL(url);
    const h = u.hostname;
    return u.protocol === "https:" && (h.endsWith(".mangadex.network") || h === "mangadex.org" || h.endsWith(".mangadex.org"));
  } catch {
    return false;
  }
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
