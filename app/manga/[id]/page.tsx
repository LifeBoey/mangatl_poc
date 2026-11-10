"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ChapterRef, ChapterRow } from "@/lib/mangadex";
import { SOURCE_LANGS, langName } from "@/lib/langs";

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

  const readable = (c?: ChapterRef) => !!c && c.pages > 0 && !c.externalUrl;

  return (
    <>
      <h1>{data.title}</h1>
      <p className="muted">
        <a href={`https://mangadex.org/title/${id}`} target="_blank">View on MangaDex</a>
      </p>
      {data.chapters.length === 0 && (
        <p>
          No English, Japanese, Spanish or Portuguese chapters on MangaDex.{" "}
          <Link href="/upload">Upload your own pages</Link>.
        </p>
      )}
      <ul className="chapters">
        {data.chapters.map((row) => {
          const en = row.byLang.en;
          const sources = SOURCE_LANGS.filter((l) => readable(row.byLang[l]));
          const anyTitle = Object.values(row.byLang).find((c) => c.title)?.title ?? "";
          return (
            <li key={row.number}>
              <span>
                <b>Ch. {row.number}</b> <span className="muted">{anyTitle}</span>
              </span>
              <span>
                {readable(en) && (
                  <Link href={`/read/${en.id}`}><span className="tag en">Read in English</span></Link>
                )}
                {/* One button per source language that has hosted pages. */}
                {sources.map((l) => (
                  <Link key={l} href={`/read/${row.byLang[l].id}`}>
                    <span className="tag ja" title={`Machine-translate the ${langName(l)} chapter to English`}>
                      {readable(en) ? "or " : ""}translate from {langName(l)}
                    </span>
                  </Link>
                ))}
                {!readable(en) && !sources.length &&
                  (en?.externalUrl ? (
                    <a href={en.externalUrl} target="_blank"><span className="tag">Official English (external)</span></a>
                  ) : (
                    <Link href="/upload"><span className="tag">No pages here — upload yours</span></Link>
                  ))}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
