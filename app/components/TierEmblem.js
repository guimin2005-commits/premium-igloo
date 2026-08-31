"use client";

// 📌 등급 엠블럼 — 등급마다 형태가 다르다. 색만 다르면 사다리가 읽히지 않는다.
//    위로 갈수록 형태가 복잡해진다: 조각 → 방패 → 보석 → 별 → 왕관 → 이글루.
//    모두 currentColor 를 쓰므로 감싸는 쪽에서 등급색만 지정하면 된다.

const SHAPES = {
  // 1. 아이언 — 다듬지 않은 광석 조각
  iron: (
    <>
      <path d="M12 3.5 19 9.5 12 20.5 5 9.5Z" fill="currentColor" opacity="0.9" />
      <path d="M12 3.5 12 20.5" stroke="currentColor" strokeWidth="1" opacity="0.35" />
    </>
  ),
  // 2. 브론즈 — 기본 방패
  bronze: (
    <path
      d="M12 2.8 20 5.6V12c0 4.6-3.4 7.6-8 9.2C7.4 19.6 4 16.6 4 12V5.6Z"
      fill="currentColor"
      opacity="0.9"
    />
  ),
  // 3. 실버 — 방패 + 안쪽 갈매기
  silver: (
    <>
      <path d="M12 2.8 20 5.6V12c0 4.6-3.4 7.6-8 9.2C7.4 19.6 4 16.6 4 12V5.6Z" fill="currentColor" opacity="0.85" />
      <path d="M8.2 11.2 12 14.6l3.8-3.4" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </>
  ),
  // 4. 골드 — 방패 + 별
  gold: (
    <>
      <path d="M12 2.8 20 5.6V12c0 4.6-3.4 7.6-8 9.2C7.4 19.6 4 16.6 4 12V5.6Z" fill="currentColor" opacity="0.85" />
      <path d="M12 7.6l1.5 3.1 3.4.5-2.45 2.4.58 3.4L12 15.4l-3.03 1.6.58-3.4L7.1 11.2l3.4-.5Z" fill="#fff" opacity="0.9" />
    </>
  ),
  // 5. 플래티넘 — 육각 보석
  platinum: (
    <>
      <path d="M12 2.6 20 7.3v9.4L12 21.4 4 16.7V7.3Z" fill="currentColor" opacity="0.9" />
      <path d="M12 6.6 16.6 9.3v5.4L12 17.4 7.4 14.7V9.3Z" fill="none" stroke="#fff" strokeWidth="1.2" opacity="0.75" />
    </>
  ),
  // 6. 다이아몬드 — 면이 잡힌 보석
  diamond: (
    <>
      <path d="M12 2.8 18.8 9.2 12 21.2 5.2 9.2Z" fill="currentColor" opacity="0.9" />
      <path d="M5.2 9.2h13.6M12 2.8 9 9.2M12 2.8l3 6.4M9 9.2 12 21.2l3-12" stroke="#fff" strokeWidth="1" fill="none" opacity="0.7" />
    </>
  ),
  // 7. 마스터 — 사방으로 뻗는 별
  master: (
    <path
      d="M12 1.8c.9 5.6 3.7 8.4 9.3 9.3-5.6.9-8.4 3.7-9.3 9.3-.9-5.6-3.7-8.4-9.3-9.3 5.6-.9 8.4-3.7 9.3-9.3Z"
      fill="currentColor"
      opacity="0.92"
    />
  ),
  // 8. 그랜드마스터 — 큰 별 + 좌우 보조 별
  grandmaster: (
    <>
      <path d="M12 3.2c.8 4.7 3.1 7 7.8 7.8-4.7.8-7 3.1-7.8 7.8-.8-4.7-3.1-7-7.8-7.8 4.7-.8 7-3.1 7.8-7.8Z" fill="currentColor" opacity="0.92" />
      <path d="M4.4 17.2c.3 1.7 1.1 2.5 2.8 2.8-1.7.3-2.5 1.1-2.8 2.8-.3-1.7-1.1-2.5-2.8-2.8 1.7-.3 2.5-1.1 2.8-2.8Z" fill="currentColor" opacity="0.6" transform="translate(0,-2)" />
      <path d="M19.6 17.2c.3 1.7 1.1 2.5 2.8 2.8-1.7.3-2.5 1.1-2.8 2.8-.3-1.7-1.1-2.5-2.8-2.8 1.7-.3 2.5-1.1 2.8-2.8Z" fill="currentColor" opacity="0.6" transform="translate(0,-2)" />
    </>
  ),
  // 9. 챌린저 — 왕관
  challenger: (
    <>
      <path d="M2.6 7.4 7 11.6 12 4.2l5 7.4 4.4-4.2v10.4H2.6Z" fill="currentColor" opacity="0.92" />
      <rect x="2.6" y="19.2" width="18.8" height="2.2" rx="1.1" fill="currentColor" opacity="0.6" />
    </>
  ),
  // 10. 이글루 — 커뮤니티 그 자체
  igloo: (
    <>
      <path d="M2.6 19.2a9.4 8.2 0 0 1 18.8 0Z" fill="currentColor" opacity="0.92" />
      <path d="M9.4 19.2v-4.1a2.6 2.6 0 0 1 5.2 0v4.1Z" fill="#fff" opacity="0.9" />
      <path d="M4.2 14.6h15.6M8.6 9.9h6.8" stroke="#fff" strokeWidth="1" opacity="0.45" />
    </>
  ),
};

/** 등급 엠블럼 · tier = VOICE_TIERS 항목 */
export default function TierEmblem({ tier, size = 24, className = "", muted = false }) {
  const shape = SHAPES[tier?.key] || SHAPES.iron;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      style={{ color: tier?.c || "#8a8a8a", opacity: muted ? 0.45 : 1 }}
      aria-hidden
    >
      {shape}
    </svg>
  );
}
