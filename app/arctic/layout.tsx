import ScrollTop from "./ScrollTop";

// 📌 ARCTIC 공용 틀 — 화면을 옮길 때 맨 위에서 시작하게(ScrollTop)만 얹는다
export default function ArcticLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ScrollTop />
      {children}
    </>
  );
}
