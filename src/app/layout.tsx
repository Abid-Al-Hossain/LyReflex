import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LyReflex — Visual Lyric Experience",
  description: "Upload any audio track and watch LyReflex transform your music into a stunning, synchronized visual journey. Powered by AI lyric analysis and curated imagery.",
  keywords: ["lyric visualizer", "music visualizer", "audio synced visuals", "lyreflex"],
  openGraph: {
    title: "LyReflex — Visual Lyric Experience",
    description: "Transform your music into a cinematic visual experience.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Register the clean passthrough SW to evict any stale cached SW */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
