import { errorResponse, getChapters, getManga } from "@/lib/mangadex";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const manga = await getManga(id); // throws for explicit titles before listing chapters
    const chapters = await getChapters(id);
    return Response.json({ ...manga, chapters });
  } catch (e) {
    return errorResponse(e);
  }
}
