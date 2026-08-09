"use client";

// 📌 ARCTIC 워드마크 — 글자 자체가 로고
//    · 넓은 자간으로 얼음처럼 차갑고 정제된 인상
//    · 'I'를 크림슨 빙주(氷柱)로 대체해 고급 이글루의 포인트 컬러를 각인
//    · 위아래 헤어라인이 수평선처럼 글자를 감싼다
export default function ArcticLogo({
  size = 26,
  className = "",
  showRule = true,
}: {
  size?: number;
  className?: string;
  showRule?: boolean;
}) {
  // size는 글자 높이(px) 기준 — 나머지는 비율로 따라간다
  const letter = { fontSize: size, lineHeight: 1 };
  const shard = { width: Math.max(2, size * 0.1), height: size * 0.78 };

  return (
    <span
      className={`inline-flex flex-col items-center select-none ${className}`}
      aria-label="ARCTIC"
      role="img"
    >
      {showRule && (
        <span
          className="block bg-current opacity-20"
          style={{ height: 1, width: "100%", marginBottom: size * 0.16 }}
        />
      )}

      <span className="inline-flex items-center font-black" style={{ letterSpacing: size * 0.18 }}>
        <span style={letter}>ARCT</span>

        {/* 'I' 자리 — 크림슨 빙주 */}
        <span
          className="inline-block bg-[#e91e3f] shrink-0"
          style={{
            ...shard,
            marginLeft: size * 0.1,
            marginRight: size * 0.26,
            // 아래로 갈수록 좁아지는 고드름 실루엣
            clipPath: "polygon(0 0, 100% 0, 72% 100%, 28% 100%)",
          }}
          aria-hidden
        />

        <span style={letter}>C</span>
      </span>

      {showRule && (
        <span
          className="block bg-current opacity-20"
          style={{ height: 1, width: "100%", marginTop: size * 0.16 }}
        />
      )}
    </span>
  );
}
