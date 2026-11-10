import { searchManga } from "@/lib/mangadex";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return Response.json([]);
  try {
    return Response.json(await searchManga(q));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
