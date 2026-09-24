import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = "https://pi-intake-agent.vercel.app";
const TITLE = "AI Intake for Personal Injury Law Firms | Answers 24/7";
const DESCRIPTION =
  "AI intake for personal injury law firms: answers every call in seconds, qualifies the case, runs a conflict check and sends the retainer. Try the demo.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Harbor Point Injury Law AI client intake",
  keywords: [
    "AI intake for personal injury law firms",
    "legal intake AI",
    "law firm answering service",
    "speed to lead law firm",
    "Lawmatics AI intake",
    "Retell AI law firm",
  ],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large", "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "AI Intake for Personal Injury Law Firms demo",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "AI intake demo: the call, the matter it opens and the speed it does it at" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/opengraph-image"] },
  category: "technology",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e13" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "AI Intake for Personal Injury Law Firms",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: SITE_URL,
              description: DESCRIPTION,
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Live demo" },
            }),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
