"use client";

// 📌 ARCTIC 로딩 뼈대 부품(2026-11-01 운영자 "그 로딩 뼈대 ARCTIC도 해") — LEVEL 탭 뼈대(app/level/LevelSkeletons.js)와 같은 결:
//    다 불러온 화면과 같은 틀 · 같은 크기로 미리 그려, 다 불러오면 그 자리에 그대로 채워진다(「불러오는 중...」 글자만 뜨다 화면이 튀던 것).
//    📌 기준은 로그인한 화면 · 평평한 단색 칸만(그라데이션 · 번지는 빛 없음) · 위에서 아래로 차례로 옅어졌다 진해진다(animate-pulse + 칸마다 늦춤)
//    화면마다의 뼈대는 이 폴더의 다른 파일(Home · Shop · Item · Cart · Checkout · Orders) — 여기는 칸 하나(Sk)와 상품 카드 한 장(CardSk)만

const wave = (i: number) => ({ animationDelay: `${Math.round(i * 90)}ms` });

// 칸 하나 — i: 늦춤 차례(위에서 아래로 0, 1, 2 …)
export function Sk({ className = "", i = 0, style }: { className?: string; i?: number; style?: React.CSSProperties }) {
  return <span aria-hidden className={`block animate-pulse bg-black/[0.06] ${className}`} style={{ ...wave(i), ...style }} />;
}

// 뼈대 묶음 — 화면 읽기 프로그램에 「불러오는 중」 한 번
export function SkWrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-label="불러오는 중" className={className}>
      {children}
    </div>
  );
}

// 📌 상품 카드 한 장(./ProductCard.tsx 와 같은 틀) — 정사각 그림(rounded-md) · 분류 칩(h-18 알약) · 이름 두 줄 · 가격(18px 굵게).
//    폭은 부르는 격자가 정한다(카드 자신의 폭 — 그림은 aspect-square)
const NAME_W = ["78%", "64%", "86%", "58%", "72%", "68%"];
export function CardSk({ i = 0 }: { i?: number }) {
  return (
    <div className="@container flex flex-col min-w-0">
      <Sk i={i} className="aspect-square w-full rounded-md" />
      <Sk i={i + 1} className="mt-2.5 @min-[180px]:mt-3 h-[18px] w-14 rounded-full" />
      <Sk i={i + 1} className="mt-2 h-[13px] rounded" style={{ width: NAME_W[i % NAME_W.length] }} />
      <Sk i={i + 2} className="mt-2.5 h-[17px] @min-[180px]:h-[18px] w-24 rounded" />
    </div>
  );
}
