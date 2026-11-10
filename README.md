# MangaTL — read Japanese, Spanish & Portuguese manga in English

Proof-of-concept for a course challenge. Search a manga on MangaDex (or paste a MangaDex link):

- If an **English** chapter exists on MangaDex, read it (human scanlation).
- If only **Japanese, Spanish (es / es-la) or Portuguese (pt / pt-br)** exists, each page is sent to **Google Gemini** (free tier), which returns the speech-bubble
  boxes + English text, drawn as white boxes over the bubbles. Click a box to see the art/original underneath.
- If there's nothing readable, **upload your own Japanese pages** (drag-drop, file picker, or Ctrl+V a screenshot).

Translations are cached in your browser (localStorage), so re-opening a chapter doesn't spend quota.

> Reality check: MangaDex hosts very few Japanese raws (~35 titles). Good demo title: **Dragon Tofu**
> (has both Japanese and English chapters, so you can compare machine vs human translation).
> For Spanish, try **Spacedrum** (Spanish + English on every chapter).

## 1. Get a free Gemini API key (no card)

1. Go to https://aistudio.google.com/apikey and sign in with any Google account.
2. Accept the terms, click **Create API key**, and copy it.
3. That's it — no billing account. If the free quota runs out, the app shows an error; you can't be charged.

Note: on the free tier Google may use the images you send to improve their products.

## 2. Run locally

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local   # then paste your key after GEMINI_API_KEY=
npm run dev
```

Open http://localhost:3000.

If a model name stops working, set `GEMINI_MODEL` in `.env.local` to any free vision model listed in AI Studio
(e.g. a current "Flash" or "Flash-Lite" model).

## 3. Put it online (GitHub + Vercel, free, no card)

1. Create an empty repo on GitHub and push this folder to it.
2. Go to https://vercel.com, **Sign up with GitHub** (Hobby plan, free).
3. **Add New → Project**, import the repo. Under **Environment Variables** add `GEMINI_API_KEY` (and optionally
   `GEMINI_MODEL`). Click **Deploy**.
4. Share the `*.vercel.app` link. Every push to GitHub redeploys automatically.

Anyone with the link uses your free Gemini quota — fine for a demo.

## How it works

| Piece | File |
|---|---|
| MangaDex client (search, chapters, at-home pages, image fetch + required usage report) | `lib/mangadex.ts` |
| Image proxy (MangaDex blocks hotlinking) | `app/api/image/route.ts` |
| Gemini call → `[{box_2d, ja, en}]` | `app/api/translate/route.ts` |
| Reader with overlay + sequential translation | `components/Reader.tsx` |
| Pages: search, chapter list, reader, upload | `app/page.tsx`, `app/manga/[id]`, `app/read/[id]`, `app/upload` |

Adding another (non-paywalled) source later = add another client like `lib/mangadex.ts` that returns page image
URLs, and point the reader at it.

## Credits & rules

Data and images from [MangaDex](https://mangadex.org); scanlation groups are credited on every chapter. Per
MangaDex's rules this app has no ads and no paid features.
