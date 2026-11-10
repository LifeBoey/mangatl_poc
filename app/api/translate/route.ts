import { errorResponse, fetchChapterPage } from "@/lib/mangadex";

export const maxDuration = 60;

const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"];

const PROMPT = `This is a manga/comic page whose text is in Japanese, Spanish or Portuguese. Find every piece of text (speech bubbles, captions, narration, signs; skip tiny sound effects if unsure).
For each one return:
- box_2d: [ymin, xmin, ymax, xmax] of the text region, normalised to 0-1000
- original: the original text exactly as written
- en: a natural, concise English translation suitable for a comic speech bubble
Return them in reading order (right-to-left, top-to-bottom for Japanese; left-to-right, top-to-bottom otherwise). Return [] if there is no text.`;

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      box_2d: { type: "ARRAY", items: { type: "INTEGER" } },
      original: { type: "STRING" },
      en: { type: "STRING" },
    },
    required: ["box_2d", "original", "en"],
  },
};

// Drop malformed boxes, clamp to 0-1000 and make sure min < max (models sometimes swap them).
// The client keeps the original text in `ja` (older cached pages use that name), whatever the language.
function clean(b: { box_2d?: unknown; original?: unknown; ja?: unknown; en?: unknown }) {
  const orig = typeof b.original === "string" ? b.original : typeof b.ja === "string" ? b.ja : "";
  const box = b.box_2d;
  if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => Number.isFinite(n))) return [];
  if (typeof b.en !== "string" || !b.en.trim()) return [];
  const c = (n: number) => Math.min(1000, Math.max(0, n));
  const [a, x, d, y] = box.map(c);
  const [ymin, ymax] = a <= d ? [a, d] : [d, a];
  const [xmin, xmax] = x <= y ? [x, y] : [y, x];
  if (ymax - ymin < 5 || xmax - xmin < 5) return [];
  return [{ box_2d: [ymin, xmin, ymax, xmax], ja: orig, en: b.en.trim() }];
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: "GEMINI_API_KEY is not set on the server." }, { status: 500 });
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";

  let body: { chapterId?: string; page?: number; data?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }
  let data = body.data;
  let mimeType = body.mimeType ?? "image/jpeg";
  if (body.chapterId) {
    try {
      const img = await fetchChapterPage(body.chapterId, Number(body.page));
      data = Buffer.from(img.buf).toString("base64");
      mimeType = img.type;
    } catch (e) {
      return errorResponse(e); // 403 for explicit titles
    }
  }
  if (!data) return Response.json({ error: "no image" }, { status: 400 });

  // Free-tier models get overloaded / hit quota often: fall through a list until one answers.
  const models = [...new Set([model, ...FALLBACK_MODELS])];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = null;
  let ok = false;
  let sawQuota = false; // any model said 429 -> the user-facing problem is quota
  let lastStatus = 502;
  let lastMsg = "Could not reach Gemini";
  for (const m of models) {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: mimeType, data } }, { text: PROMPT }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA },
        }),
      });
    } catch {
      continue; // network error: try the next model
    }
    json = await res.json().catch(() => null);
    if (res.ok) { ok = true; break; }
    lastStatus = res.status;
    lastMsg = json?.error?.message ?? `Gemini error ${res.status}`;
    if (res.status === 429) sawQuota = true;
    if (![404, 429, 500, 503].includes(res.status)) break; // e.g. bad key: other models won't help
  }
  if (!ok) {
    return sawQuota
      ? Response.json({ error: "Free Gemini quota used up for now — wait a minute or try tomorrow." }, { status: 429 })
      : Response.json({ error: lastMsg }, { status: lastStatus });
  }
  // A 200 with no candidate (e.g. safety block) is an error, not "no text" — otherwise the client
  // would cache an empty page forever.
  const cand = json?.candidates?.[0];
  if (!cand?.content?.parts) {
    const why = json?.promptFeedback?.blockReason ?? cand?.finishReason ?? "empty response";
    return Response.json({ error: `Gemini returned no translation (${why})` }, { status: 502 });
  }
  const text: string = cand.content.parts.map((p: { text?: string }) => p.text ?? "").join("");
  try {
    const parsed = JSON.parse(text);
    return Response.json({ bubbles: Array.isArray(parsed) ? parsed.flatMap(clean) : [] });
  } catch {
    return Response.json({ error: "Gemini returned unreadable output", raw: text }, { status: 502 });
  }
}
