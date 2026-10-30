import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "souka 酒場",
  description: "모르는 사람과 마주 앉아 한 잔씩 따라 주는 온라인 혼술집 · 知らない誰かと向かい合って、一杯ずつ注ぎあう店",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1b130e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Dela+Gothic+One&family=Gowun+Dodum&family=M+PLUS+Rounded+1c:wght@500;800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
