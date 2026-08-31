"use client";

// 📌 등급 엠블럼 — 등급마다 형태가 다르다. 색만 다르면 사다리가 읽히지 않는다.
//    위로 갈수록 형태가 복잡해진다: 조각 → 방패 → 보석 → 훈장 → 월계관 → 왕관 → 제관.
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
  // 7. 마스터 — 별이 박힌 원형 훈장. 보석(다이아) 다음 단계로 격을 올린다
  master: (
    <>
      <circle cx="12" cy="12" r="9.2" fill="currentColor" opacity="0.16" />
      <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.95" />
      <path
        d="M12 4.4 13.6 10.4 19.6 12 13.6 13.6 12 19.6 10.4 13.6 4.4 12 10.4 10.4Z"
        fill="currentColor"
        opacity="0.95"
      />
      <circle cx="12" cy="12" r="1.7" fill="#fff" opacity="0.9" />
    </>
  ),
  // 8. 그랜드마스터 — 월계관을 두른 별.
  //    마스터(원형 훈장)와 같은 계열이면서 한 급 위로 읽힌다.
  grandmaster: (
    <>
      {/* 좌우 월계 가지 */}
      <path d="M10.6 21C7.3 19.7 5.2 16.8 4.7 12.7c-.25-2 0-3.8.75-5.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
      <path d="M13.4 21c3.3-1.3 5.4-4.2 5.9-8.3.25-2 0-3.8-.75-5.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
      {/* 잎 — 좌 */}
      <ellipse cx="4.5" cy="15.1" rx="1.75" ry="0.95" transform="rotate(-52 4.5 15.1)" fill="currentColor" opacity="0.65" />
      <ellipse cx="4.6" cy="11.4" rx="1.7" ry="0.9" transform="rotate(-70 4.6 11.4)" fill="currentColor" opacity="0.65" />
      <ellipse cx="5.6" cy="8" rx="1.6" ry="0.9" transform="rotate(-84 5.6 8)" fill="currentColor" opacity="0.65" />
      {/* 잎 — 우 */}
      <ellipse cx="19.5" cy="15.1" rx="1.75" ry="0.95" transform="rotate(52 19.5 15.1)" fill="currentColor" opacity="0.65" />
      <ellipse cx="19.4" cy="11.4" rx="1.7" ry="0.9" transform="rotate(70 19.4 11.4)" fill="currentColor" opacity="0.65" />
      <ellipse cx="18.4" cy="8" rx="1.6" ry="0.9" transform="rotate(84 18.4 8)" fill="currentColor" opacity="0.65" />
      {/* 중앙 별 */}
      <path d="M12 4.2 13.75 9.6h5.65l-4.57 3.32 1.75 5.38L12 15l-4.58 3.3 1.75-5.38L4.6 9.6h5.65Z" fill="currentColor" opacity="0.95" />
      {/* 흰 포인트 — 별 중심과 월계관 매듭 */}
      <circle cx="12" cy="11.4" r="1.6" fill="#fff" opacity="0.9" />
      <path d="M10.6 20.9 12 19.8l1.4 1.1" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </>
  ),
  // 9. 챌린저 — 보석이 박힌 왕관 + 받침대
  challenger: (
    <>
      {/* 왕관 몸통 */}
      <path d="M2.4 8 6.7 12.2 12 4.6l5.3 7.6L21.6 8v9.4H2.4Z" fill="currentColor" opacity="0.95" />
      {/* 꼭짓점 보석 */}
      <circle cx="2.4" cy="6.5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="3.1" r="1.9" fill="currentColor" />
      <circle cx="21.6" cy="6.5" r="1.6" fill="currentColor" />
      {/* 왕관 띠 장식 */}
      <path d="M6.4 15h11.2" stroke="#fff" strokeWidth="0.9" opacity="0.5" />
      <circle cx="12" cy="12.6" r="1.5" fill="#fff" opacity="0.85" />
      {/* 받침대 */}
      <rect x="2.4" y="18.6" width="19.2" height="2.6" rx="1.3" fill="currentColor" opacity="0.72" />
    </>
  ),
  // 10. 이글루 — 사다리의 끝. 이글루 형상을 그리지 않고,
  //     챌린저(왕관) 위 단계로 읽히는 제관(帝冠)으로 간다.
  //     왕관에 아치와 보주를 얹고 광휘를 둘러 한 급 위임을 드러낸다.
  igloo: (
    <>
      {/* 광휘 */}
      <path
        d="M12 0.6v1.9M4.1 3.6l1.4 1.4M19.9 3.6l-1.4 1.4M1.4 10.4h1.8M20.8 10.4h1.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* 최상단 보주 */}
      <circle cx="12" cy="4.5" r="1.8" fill="currentColor" />
      {/* 제관 아치 — 두 겹 */}
      <path d="M5.9 13.2C6.7 8.7 9 6.4 12 6.4s5.3 2.3 6.1 6.8" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.9" strokeLinecap="round" />
      <path d="M8.8 13.2C9.2 9.7 10.3 8 12 8s2.8 1.7 3.2 5.2" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.45" strokeLinecap="round" />
      {/* 왕관 몸통 */}
      <path d="M3.4 11.4 7.1 15 12 9.2 16.9 15l3.7-3.6v7.2H3.4Z" fill="currentColor" opacity="0.95" />
      {/* 몸통 중앙 보석 */}
      <circle cx="12" cy="15.6" r="1.5" fill="#fff" opacity="0.9" />
      {/* 받침대 */}
      <rect x="2.9" y="19.6" width="18.2" height="2.6" rx="1.3" fill="currentColor" opacity="0.75" />
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
