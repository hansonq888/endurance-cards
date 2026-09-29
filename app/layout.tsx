import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { Geist, Geist_Mono, Mona_Sans } from "next/font/google";
import localFont from "next/font/local";
import { SiteAnalytics } from "@/components/SiteAnalytics";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/** Secondary (contrast) face for labels and data around the card. */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Poster-style display face for headlines. */
const monaSans = Mona_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["wdth"],
});

const barlow = localFont({
  variable: "--font-card",
  src: [
    { path: "../assets/fonts/barlow-latin-500-normal.woff", weight: "500" },
    { path: "../assets/fonts/barlow-latin-700-normal.woff", weight: "700" },
    { path: "../assets/fonts/barlow-latin-800-normal.woff", weight: "800" },
  ],
});

export const metadata: Metadata = {
  title: { default: `${BRAND.name} — ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: "Turn your Strava history into a player card rated out of 99.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  // Large previews on X; the image itself comes from app/opengraph-image.tsx (profile pages use their card).
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${monaSans.variable} ${barlow.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <SiteAnalytics />
      </body>
    </html>
  );
}
