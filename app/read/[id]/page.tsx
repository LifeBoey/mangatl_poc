"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Reader, { type ReaderPage } from "@/components/Reader";

type Chapter = {
  id: string; number: string | null; title: string | null; lang: string;
  externalUrl: string | null; mangaId?: string; groups: string[]; pages: string[];
};

export default function ReadPage() {
  const { id } = useParams<{ id: string }>();
  const [ch, setCh] = useState<Chapter | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/chapter/${id}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setCh(j);
      })
      .catch((e) => setError(String(e)));
  }, [id]);

  const needsTranslation = !!ch && ch.lang !== "en";
  const pages: ReaderPage[] = useMemo(
    () =>
      (ch?.pages ?? []).map((src, i) => ({
        src,
        request: { chapterId: id, page: i },
        cacheKey: `mangatl:${id}:${i}`,
      })),
    [ch, id],
  );

  if (error) return <p className="error">{error}</p>;
  if (!ch) return <p className="muted">Loading chapter…</p>;

  return (
    <>
      <p>
        {ch.mangaId && <Link href={`/manga/${ch.mangaId}`}>← Chapters</Link>}{" "}
        <b>Ch. {ch.number ?? "?"}</b> {ch.title}{" "}
        <span className={`tag ${ch.lang === "en" ? "en" : "ja"}`}>
          {needsTranslation ? `${ch.lang.toUpperCase()} → EN (machine)` : "EN (human scanlation)"}
        </span>
      </p>
      <p className="muted">
        Scanlation: {ch.groups.length ? ch.groups.join(", ") : "unknown / no group"} · via{" "}
        <a href={`https://mangadex.org/chapter/${id}`} target="_blank">MangaDex</a>
        {needsTranslation && " · Click a box to peek at the original Japanese."}
      </p>
      {ch.externalUrl && (
        <p>This chapter is hosted externally: <a href={ch.externalUrl} target="_blank">{ch.externalUrl}</a></p>
      )}
      <Reader pages={pages} translate={needsTranslation} />
    </>
  );
}
