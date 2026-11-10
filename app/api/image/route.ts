import { coverMangaId, errorResponse, fetchCover } from "@/lib/mangadex";

// Proxies MangaDex cover art (MangaDex blocks hotlinking). Explicit titles' covers are refused.
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!coverMangaId(url)) return new Response("bad url", { status: 400 });
  try {
    const img = await fetchCover(url);
    if (!img.ok) return new Response("upstream error", { status: img.status });
    return new Response(img.buf, {
      headers: { "Content-Type": img.type, "Cache-Control": "public, max-age=86400" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
