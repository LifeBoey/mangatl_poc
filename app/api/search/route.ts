import { errorResponse, searchManga } from "@/lib/mangadex";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return Response.json([]);
  try {
    return Response.json(await searchManga(q)); // explicit titles are always excluded
  } catch (e) {
    return errorResponse(e);
  }
}
