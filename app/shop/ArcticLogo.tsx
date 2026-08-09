"use client";

// 📌 ARCTIC 로고 — 빙산/눈결정 모티프의 마름모 마크 + 워드마크
//    고급 이글루(얼음)의 상점이라는 정체성을 크림슨 액센트로 잇는다
export function ArcticMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className="shrink-0" aria-hidden>
      {/* 바깥 마름모 — 얼음 결정 */}
      <path d="M16 2.5 29.5 16 16 29.5 2.5 16 16 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {/* 안쪽 빙산 실루엣 */}
      <path d="M16 9.5 22.5 20H9.5L16 9.5Z" fill="currentColor" fillOpacity="0.14" />
      <path d="M16 9.5 22.5 20H9.5L16 9.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      {/* 수면 라인 */}
      <path d="M7 23h18" stroke="#e91e3f" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// 브랜드 전체 (마크 + ARCTIC 워드마크)
export default function ArcticLogo({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <ArcticMark size={size} />
      <span className="font-black tracking-[0.22em] leading-none" style={{ fontSize: size * 0.62 }}>
        ARCTIC
      </span>
    </span>
  );
}
