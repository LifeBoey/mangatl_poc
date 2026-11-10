"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = { id: string; title: string; year?: number; cover: string | null; langs: string[]; rating: string };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hidePorn, setHidePorn] = useState(true); // filter on by default

  async function go(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    // Pasted a MangaDex link? Jump straight there.
    const chapter = text.match(new RegExp(`mangadex\\.org/chapter/(${UUID})`, "i"));
    if (chapter) return router.push(`/read/${chapter[1]}`);
    const title = text.match(new RegExp(`mangadex\\.org/title/(${UUID})`, "i"));
    if (title) return router.push(`/manga/${title[1]}`);
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(text)}${hidePorn ? "" : "&porn=1"}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setResults(json);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1>Read Japanese manga in English</h1>
      <p className="muted">
        Search a series by name or paste a MangaDex link. If an English chapter exists we show it; if only Japanese
        exists we machine-translate it; if neither, <Link href="/upload">upload your own Japanese pages</Link>.
      </p>
      <form onSubmit={go}>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Frieren, or https://mangadex.org/title/…" autoFocus />
      </form>
      <label className="muted" style={{ display: "block", marginTop: 8 }}>
        <input type="checkbox" checked={hidePorn} onChange={(e) => setHidePorn(e.target.checked)} /> Hide pornographic
        content
      </label>
      {loading && <p className="muted">Searching…</p>}
      {error && <p className="error">{error}</p>}
      {results && results.length === 0 && <p className="muted">No results.</p>}
      <div className="grid">
        {results?.map((m) => (
          <Link key={m.id} href={`/manga/${m.id}`} className="card">
            {m.cover ? <img src={m.cover} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <img alt="" />}
            <div>
              <b>{m.title}</b> {m.year ? `(${m.year})` : ""}
              <br />
              {m.langs.includes("ja") && <span className="tag ja">JA</span>}
              {m.langs.includes("en") && <span className="tag en">EN</span>}
              {m.rating !== "safe" && <span className="tag">{m.rating}</span>}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
