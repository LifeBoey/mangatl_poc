"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type Bubble = { box_2d: number[]; ja: string; en: string };
export type ReaderPage = {
  src: string; // what the <img> shows
  request?: { chapterId?: string; page?: number; data?: string; mimeType?: string }; // body for /api/translate
  cacheKey?: string; // localStorage key so a page is only translated once per browser
};
type State = { status: "idle" | "working" | "done" | "error"; bubbles?: Bubble[]; error?: string };

function loadCache(key?: string): Bubble[] | null {
  if (!key) return null;
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function saveCache(key: string | undefined, b: Bubble[]) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(b));
  } catch {}
}

export default function Reader({ pages, translate }: { pages: ReaderPage[]; translate: boolean }) {
  const [states, setStates] = useState<State[]>([]);

  // Translate pages one at a time, in reading order, so the next pages are ready as you scroll.
  useEffect(() => {
    if (!translate) return;
    let cancelled = false;
    setStates(pages.map(() => ({ status: "idle" })));
    (async () => {
      for (let i = 0; i < pages.length && !cancelled; i++) {
        const p = pages[i];
        const set = (s: State) => !cancelled && setStates((prev) => prev.map((x, j) => (j === i ? s : x)));
        const cached = loadCache(p.cacheKey);
        if (cached) { set({ status: "done", bubbles: cached }); continue; }
        if (!p.request) continue;
        set({ status: "working" });
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch("/api/translate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(p.request),
            });
            const j = await res.json();
            if (res.status === 429 && attempt < 2) { await new Promise((r) => setTimeout(r, 20000)); continue; }
            if (!res.ok) throw new Error(j.error);
            saveCache(p.cacheKey, j.bubbles);
            set({ status: "done", bubbles: j.bubbles });
            break;
          } catch (e) {
            set({ status: "error", error: String(e instanceof Error ? e.message : e) });
            break;
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [pages, translate]);

  return (
    <div className="reader">
      {pages.map((p, i) => (
        <Page key={i} src={p.src} state={translate ? states[i] : undefined} index={i} />
      ))}
    </div>
  );
}

function Page({ src, state, index }: { src: string; state?: State; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [showOrig, setShowOrig] = useState<Record<number, boolean>>({});
  const [loaded, setLoaded] = useState(0); // re-fit text once the image has its real height

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const label =
    state?.status === "working" ? "Translating…" :
    state?.status === "idle" ? "Queued" :
    state?.status === "error" ? `Error: ${state.error}` :
    state?.status === "done" ? `${state.bubbles?.length ?? 0} bubbles` : null;

  return (
    <div className="page" ref={ref}>
      <img
        src={src}
        alt={`Page ${index + 1}`}
        loading={index < 3 ? "eager" : "lazy"}
        onLoad={() => setLoaded((n) => n + 1)}
      />
      {state?.bubbles?.map((b, k) => {
        // Japanese text is vertical (tall, narrow boxes); widen + pad around the centre so English fits.
        // Spanish/Portuguese boxes are already wide, so this mostly just adds padding for them.
        const [y0, x0, y1, x1] = b.box_2d;
        const cx = (x0 + x1) / 2;
        const half = Math.max((x1 - x0) / 2 + 15, 70);
        const xmin = Math.max(0, cx - half), xmax = Math.min(1000, cx + half);
        const ymin = Math.max(0, y0 - 10), ymax = Math.min(1000, y1 + 10);
        return (
          <FitBubble
            key={k}
            text={b.en}
            ja={b.ja}
            orig={!!showOrig[k]}
            refit={`${width}:${loaded}`}
            onClick={() => setShowOrig((s) => ({ ...s, [k]: !s[k] }))}
            style={{
              top: `${ymin / 10}%`, left: `${xmin / 10}%`,
              width: `${(xmax - xmin) / 10}%`, height: `${(ymax - ymin) / 10}%`,
            }}
          />
        );
      })}
      {label && <span className={`status${state?.status === "error" ? " error" : ""}`}>{label}</span>}
    </div>
  );
}

// Measures the rendered text and shrinks the font until every word fits inside the box,
// instead of guessing a size (which clipped long words like "surrender" -> "rrende").
function FitBubble(props: {
  text: string; ja: string; orig: boolean; refit: string;
  onClick: () => void; style: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const span = el?.firstElementChild as HTMLElement | null;
    if (!el || !span || !el.clientWidth || !el.clientHeight) return;
    // The span is a flex item, so it grows to at least its longest word; compare it to the box.
    const fits = () => span.offsetWidth <= el.clientWidth && span.offsetHeight <= el.clientHeight;
    el.style.overflowWrap = "normal";
    let size = 22;
    el.style.fontSize = `${size}px`;
    while (size > 7 && !fits()) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
    // Last resort for a tiny box: allow breaking inside words rather than hiding letters.
    if (!fits()) el.style.overflowWrap = "anywhere";
  }, [props.text, props.refit]);
  return (
    <div ref={ref} className={`bubble${props.orig ? " orig" : ""}`} title={props.ja} onClick={props.onClick} style={props.style}>
      <span>{props.text}</span>
    </div>
  );
}
