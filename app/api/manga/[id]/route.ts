import { getChapters, getManga } from "@/lib/mangadex";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [manga, chapters] = await Promise.all([getManga(id), getChapters(id)]);
    return Response.json({ ...manga, chapters });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
