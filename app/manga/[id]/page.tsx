"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ChapterRef, ChapterRow } from "@/lib/mangadex";

export default function MangaPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ title: string; chapters: ChapterRow[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/manga/${id}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setData(j);
      })
      .catch((e) => setError(String(e)));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading chapters…</p>;

  const readable = (c: ChapterRef | null) => c && c.pages > 0 && !c.externalUrl;

  return (
    <>
      <h1>{data.title}</h1>
      <p className="muted">
        <a href={`https://mangadex.org/title/${id}`} target="_blank">View on MangaDex</a>
      </p>
      {data.chapters.length === 0 && (
        <p>
          No English or Japanese chapters on MangaDex. <Link href="/upload">Upload your own Japanese pages</Link>.
        </p>
      )}
      <ul className="chapters">
        {data.chapters.map((row) => (
          <li key={row.number}>
            <span>
              <b>Ch. {row.number}</b>{" "}
              <span className="muted">{row.en?.title || row.ja?.title || ""}</span>
            </span>
            <span>
              {readable(row.en) ? (
                <>
                  <Link href={`/read/${row.en!.id}`}><span className="tag en">Read in English</span></Link>
                  {readable(row.ja) && (
                    <Link href={`/read/${row.ja!.id}`}><span className="tag ja">or machine-translate JA</span></Link>
                  )}
                </>
              ) : readable(row.ja) ? (
                <Link href={`/read/${row.ja!.id}`}><span className="tag ja">Translate from Japanese</span></Link>
              ) : row.en?.externalUrl ? (
                <a href={row.en.externalUrl} target="_blank"><span className="tag">Official English (external)</span></a>
              ) : (
                <Link href="/upload"><span className="tag">No pages here — upload yours</span></Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
