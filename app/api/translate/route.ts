import { fetchChapterPage } from "@/lib/mangadex";

export const maxDuration = 60;

const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"];

const PROMPT = `This is a manga/comic page. Find every piece of Japanese text (speech bubbles, captions, narration, signs; skip tiny sound effects if unsure).
For each one return:
- box_2d: [ymin, xmin, ymax, xmax] of the text region, normalised to 0-1000
- ja: the original Japanese text
- en: a natural, concise English translation suitable for a comic speech bubble
Return them in reading order (right-to-left, top-to-bottom). Return [] if there is no text.`;

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      box_2d: { type: "ARRAY", items: { type: "INTEGER" } },
      ja: { type: "STRING" },
      en: { type: "STRING" },
    },
    required: ["box_2d", "ja", "en"],
  },
};

// Drop malformed boxes, clamp to 0-1000 and make sure min < max (models sometimes swap them).
function clean(b: { box_2d?: unknown; ja?: unknown; en?: unknown }) {
  const box = b.box_2d;
  if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => Number.isFinite(n))) return [];
  if (typeof b.en !== "string" || !b.en.trim()) return [];
  const c = (n: number) => Math.min(1000, Math.max(0, n));
  const [a, x, d, y] = box.map(c);
  const [ymin, ymax] = a <= d ? [a, d] : [d, a];
  const [xmin, xmax] = x <= y ? [x, y] : [y, x];
  if (ymax - ymin < 5 || xmax - xmin < 5) return [];
  return [{ box_2d: [ymin, xmin, ymax, xmax], ja: typeof b.ja === "string" ? b.ja : "", en: b.en.trim() }];
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
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }
  if (!data) return Response.json({ error: "no image" }, { status: 400 });

  // Free-tier models get overloaded / hit quota often: fall through a list until one answers.
  const models = [...new Set([model, ...FALLBACK_MODELS])];
  let res: Response | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = null;
  for (const m of models) {
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: mimeType, data } }, { text: PROMPT }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA },
        }),
      });
      json = await res.json().catch(() => null);
    } catch {
      res = null; // network error: try the next model
      continue;
    }
    if (res.ok || ![404, 429, 500, 503].includes(res.status)) break;
  }
  if (!res || !res.ok) {
    res = res ?? new Response(null, { status: 502 });
    const msg = json?.error?.message ?? `Gemini error ${res.status}`;
    const quota = res.status === 429;
    return Response.json(
      { error: quota ? "Free Gemini quota used up for now — wait a minute or try tomorrow." : msg },
      { status: res.status },
    );
  }
  const text: string =
    json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "[]";
  try {
    const parsed = JSON.parse(text);
    return Response.json({ bubbles: Array.isArray(parsed) ? parsed.flatMap(clean) : [] });
  } catch {
    return Response.json({ error: "Gemini returned unreadable output", raw: text }, { status: 502 });
  }
}
