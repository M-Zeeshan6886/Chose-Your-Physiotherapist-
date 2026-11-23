import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getAppName } from "@/lib/config";
import { LogoMark, Wordmark } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

// Runs before the page paints, so there is no light flash for dark-mode visitors.
const THEME_SCRIPT = `(function(){try{var m=localStorage.getItem("cyd_theme")||"system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.dataset.theme=d?"dark":"light";e.dataset.mode=m}catch(x){}})()`;

export function generateMetadata(): Metadata {
  const name = getAppName();
  return {
    title: { default: `${name}: find and contact a physiotherapist directly`, template: `%s | ${name}` },
    description: "Find your physiotherapist. Check their credentials. Compare your options. Contact them directly on WhatsApp.",
  };
}
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f9f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e191c" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const name = getAppName();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <header className="site">
          <div className="wrap">
            <Link href="/" className="logo"><LogoMark /><span><Wordmark name={name} /></span></Link>
            <nav>
              <Link href="/therapists">Find a physio</Link>
              <Link href="/test-guide">Test guide</Link>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site">
          <div className="wrap">
            <p>
              {name} connects patients with independent physiotherapists. We do not assign therapists and we take no commission.
              Appointments and fees are agreed directly between you and the physiotherapist.
            </p>
            <p className="small">Test version: therapists and reviews shown are demo data.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
