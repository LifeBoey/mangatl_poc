import { fetchMangadexImage, isMangadexImage } from "@/lib/mangadex";

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!isMangadexImage(url)) return new Response("bad url", { status: 400 });
  try {
    const img = await fetchMangadexImage(url);
    if (!img.ok) return new Response("upstream error", { status: img.status });
    return new Response(img.buf, {
      headers: { "Content-Type": img.type, "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return new Response("fetch failed", { status: 502 });
  }
}
