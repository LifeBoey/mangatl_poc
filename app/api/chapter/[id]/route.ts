import { getChapterInfo, getPageUrls } from "@/lib/mangadex";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const info = await getChapterInfo(id);
    const pages = info.externalUrl ? [] : await getPageUrls(id);
    return Response.json({
      ...info,
      // Browsers can't load MangaDex images directly, so serve them via our proxy.
      pages: pages.map((_u, i) => `/api/page/${id}/${i}`),
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
