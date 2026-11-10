import { fetchChapterPage } from "@/lib/mangadex";

// Serves page i of a MangaDex chapter. Resolving the at-home URL here (instead of baking it into the
// page) means images still load after MangaDex's ~15 minute URL expiry.
export async function GET(_req: Request, { params }: { params: Promise<{ chapter: string; i: string }> }) {
  const { chapter, i } = await params;
  try {
    const img = await fetchChapterPage(chapter, Number(i));
    return new Response(img.buf, {
      headers: { "Content-Type": img.type, "Cache-Control": "public, max-age=86400" },
    });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
