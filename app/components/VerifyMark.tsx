import { verifyBadge } from "@/lib/verifyBadge";

// 📌 인증 표시 한 벌 — 헤더 이름 옆 · 프로필 창 · 모바일 메뉴 · 내 정보가 같은 모양과 같은 색을 쓴다.
//    모양은 속이 찬 원 하나: 인증 = 체크 · 일부 인증 = 느낌표 · 미인증 = 엑스. 색 · 이름은 lib/verifyBadge 한 곳에서.
const PATHS = {
  ok: "M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z",
  partial: "M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z",
  none: "M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z",
};

// dark: 어두운 바탕 위(다크 페이지 · 잉크 카드). 흰 바탕이면 false — 대비가 높은 색으로
type Props = { isVerified?: boolean; hasScrimRole?: boolean; className?: string; dark?: boolean };

// 아이콘만 — 헤더 이름 옆
export function VerifyIcon({ isVerified, hasScrimRole, className = "w-4 h-4", dark = true }: Props) {
  const b = verifyBadge(isVerified, hasScrimRole, dark);
  return (
    <svg role="img" aria-label={b.label} viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${b.text} ${className}`}>
      <path fillRule="evenodd" clipRule="evenodd" d={PATHS[b.kind as keyof typeof PATHS]} />
    </svg>
  );
}

// 아이콘 + 이름 알약 — 프로필 창 · 모바일 메뉴 · 내 정보
export function VerifyBadge({ isVerified, hasScrimRole, className = "", dark = true }: Props) {
  const b = verifyBadge(isVerified, hasScrimRole, dark);
  return (
    <span className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-bold border ${b.cls} ${className}`}>
      <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 shrink-0">
        <path fillRule="evenodd" clipRule="evenodd" d={PATHS[b.kind as keyof typeof PATHS]} />
      </svg>
      {b.label}
    </span>
  );
}
