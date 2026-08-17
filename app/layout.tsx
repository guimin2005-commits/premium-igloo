import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./Providers";
import ClientLayout from "./ClientLayout"; // 방금 분리한 UI 파일을 불러옵니다

const inter = Inter({ subsets: ["latin"] });

// 링크를 붙였을 때 사람들이 읽는 한 줄
const TAGLINE = "나의 활동이 곧 나의 자산이 되는 곳";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.premiumigloo.com"),
  title: "고급 이글루",
  description: TAGLINE,
  openGraph: {
    title: "고급 이글루",
    description: TAGLINE,
    url: "https://www.premiumigloo.com",
    // ⚠️ siteName 은 넣지 않는다 — 디스코드 링크 프리뷰 맨 위에 사이트 이름이 한 줄 더 붙어
    //    제목과 똑같은 글자가 두 번 보인다.
    type: "website",
    images: [{ url: "/logo.png", width: 500, height: 500, alt: "고급 이글루" }],
  },
  /* 📌 링크 프리뷰 기본값 — 이걸 안 주면 디스코드가 정사각 로고를 큼직하게 띄운다.
     summary 는 오른쪽 작은 썸네일이라 제목·설명이 먼저 읽힌다. */
  twitter: {
    card: "summary",
    title: "고급 이글루",
    description: TAGLINE,
    images: ["/logo.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "any", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // 두 번째 코드의 핵심: html 태그에 suppressHydrationWarning을 추가하여 hydration 경고 방지 (next-themes 등 사용 시 필수)
    <html lang="ko" suppressHydrationWarning>
      <body
        // 화면 밀림 방지는 html의 scrollbar-gutter: stable로 처리 (globals.css).
        // body에 overflow를 주면 사이트 전역 sticky가 죽으므로 여기엔 절대 넣지 않는다.
        className={`min-h-screen flex flex-col bg-[#090909] text-white font-sans antialiased selection:bg-[#e91e3f] selection:text-white ${inter.className}`}
      >
        <Providers>
          <Suspense fallback={null}>
            <ClientLayout>
              {children}
            </ClientLayout>
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}