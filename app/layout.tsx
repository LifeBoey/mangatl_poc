import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "MangaTL",
  description: "Read Japanese manga in English — MangaDex + Gemini proof of concept",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link href="/" className="brand">MangaTL</Link>
          <nav>
            <Link href="/">Search</Link>
            <Link href="/upload">Upload pages</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="foot">
          Manga data and images from <a href="https://mangadex.org" target="_blank">MangaDex</a>; credit to
          the scanlation groups listed on each chapter. Machine translation by Google Gemini. Course demo, no ads.
        </footer>
      </body>
    </html>
  );
}
