"use client";
import { useEffect, useState } from "react";
import Reader, { type ReaderPage } from "@/components/Reader";

const MAX_SIDE = 1800; // keep requests well under Vercel's 4.5 MB body limit

async function shrink(file: File): Promise<{ data: string; mimeType: string; url: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { data: url.split(",")[1], mimeType: "image/jpeg", url };
}

export default function Upload() {
  const [pages, setPages] = useState<ReaderPage[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);

  async function addFiles(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/")).slice(0, 30);
    if (!imgs.length) return;
    imgs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setBusy(true);
    setSkipped([]);
    const out: ReaderPage[] = [];
    const bad: string[] = [];
    for (const f of imgs) {
      try {
        const s = await shrink(f);
        out.push({ src: s.url, request: { data: s.data, mimeType: s.mimeType } });
      } catch {
        bad.push(f.name); // e.g. HEIC, which most browsers can't decode
      }
    }
    setSkipped(bad);
    if (out.length) setPages(out);
    setBusy(false);
  }

  // Paste a screenshot straight from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <>
      <h1>Translate your own pages</h1>
      <p className="muted">
        Drop Japanese, Spanish or Portuguese manga pages here (up to 30, ordered by filename), pick files, or paste a screenshot with
        Ctrl+V. Images are only sent to Gemini for translation and aren&apos;t stored.
      </p>
      <label
        className={`drop${over ? " over" : ""}`}
        style={{ display: "block" }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles([...e.dataTransfer.files]); }}
      >
        {busy ? "Preparing images…" : "Drop images here or click to choose"}
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])]);
            e.target.value = ""; // allow picking the same files again
          }}
        />
      </label>
      {skipped.length > 0 && (
        <p className="error">Couldn&apos;t read: {skipped.join(", ")} (try JPG/PNG/WEBP).</p>
      )}
      {pages.length > 0 && <Reader pages={pages} translate />}
    </>
  );
}
