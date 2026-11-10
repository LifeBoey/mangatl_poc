import { searchManga } from "@/lib/mangadex";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  if (!q) return Response.json([]);
  // Pornographic titles are hidden unless the client explicitly opts in.
  const includePorn = params.get("porn") === "1";
  try {
    return Response.json(await searchManga(q, includePorn));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
