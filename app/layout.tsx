import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./Providers";
import ClientLayout from "./ClientLayout"; // 방금 분리한 UI 파일을 불러옵니다

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.premiumigloo.com"),
  title: "고급 이글루",
  description: "고급 이글루 공식 사이트",
  openGraph: {
    title: "고급 이글루",
    description: "고급 이글루 공식 사이트",
    url: "https://www.premiumigloo.com",
    siteName: "고급 이글루",
    type: "website",
    images: [{ url: "/logo.png", width: 500, height: 500, alt: "고급 이글루" }],
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
        // 첫 번째 코드의 핵심: 화면 밀림 방지를 위한 overflow-y-scroll 속성 및 전체 디자인 테마 적용
        className={`min-h-screen flex flex-col overflow-y-scroll bg-[#090909] text-white font-sans antialiased selection:bg-[#e91e3f] selection:text-white ${inter.className}`}
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