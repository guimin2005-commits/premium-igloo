"use client";

import { useEffect, useRef } from "react";
import { ICON_PATHS } from "./Icons";

// 팝업이 쓰는 모션 · 격자 · 스크롤바 — 레벨 페이지 밖(내 정보 · ARCTIC)에서도 열리므로 틀이 직접 싣는다
const POP_CSS = `
@keyframes tierIn { from { opacity: 0; transform: translateY(16px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
.lux-grid-bg-dark { background-image: linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px); background-size: 46px 46px; -webkit-mask-image: radial-gradient(ellipse 90% 70% at 30% 0%, black 30%, transparent 100%); mask-image: radial-gradient(ellipse 90% 70% at 30% 0%, black 30%, transparent 100%); }
.pop-scroll { scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.22) transparent; }
.pop-snap { height: calc(100% - round(up, 100% - var(--pop-hm), 1px)); }
@media (width >= 40rem) { .pop-snap { width: calc(100% - 2 * round(up, (100% - min(var(--pop-w), 100%)) / 2, 1px)); height: calc(100% - 2 * round(up, (100% - var(--pop-h)) / 2, 1px)); } }
`;
// 📌 창을 정수 px 에 앉힌다(.pop-snap) — 가운데 맞춤이 홀수 폭 · 높이 화면에서 0.5px 에 떨어지면 테는 두 줄에 번지고 글자는 한 줄에 붙어
//    알약 글자가 위 · 오른쪽으로 1px 어긋나 보였다(2026-10-17 인벤토리 「일반」 알약). 창 크기를 화면 홀짝에 맞춰 1px 안쪽으로 줄여 여백을 정수로 만든다.
//    round() 를 못 읽는 브라우저는 아래 Tailwind 크기 그대로
const SNAP = {
  xl: { "--pop-w": "1100px", "--pop-h": "min(800px, 92vh)", "--pop-hm": "86dvh" },
  wide: { "--pop-w": "1024px", "--pop-h": "min(820px, 92vh)", "--pop-hm": "90dvh" },
  "": { "--pop-w": "768px", "--pop-h": "min(620px, 88vh)", "--pop-hm": "86dvh" },
};

// 📌 팝업 틀 — 인벤토리 · 시즌 패스 · 강화가 같은 틀을 쓴다.
//    머리(아이콘 · 제목 · 수 · 닫기) → 알약 탭 → 본문(PC 왼쪽 요약 236px | 오른쪽 목록, 모바일은 위아래 바텀시트).
//    theme 은 바탕과 번짐 색만 바꾼다 — 시즌 패스는 보라.
//    스크롤 잠금은 루트의 "fixed inset-0" + z-[120] 을 보고 전역 ScrollLock 이 건다.
export const POP_THEME = {
  ink: { bg: "#131313", glow: "rgba(233,30,63,0.2)", grid: true },
  // 무늬 · 번짐 없는 잉크 — 강화 창(2026-10-11 "AI 같아서 별로" 뒤 단색으로)
  plain: { bg: "#131313" },
  // 격자만(번짐은 창이 glow 로 정한다) — 인벤토리(2026-10-11 "격자는 필요할 듯" · 번짐은 고른 아이템 색)
  inkGrid: { bg: "#131313", grid: true },
  pass: {
    bg: "linear-gradient(160deg, #2a1a4d 0%, #1a1233 42%, #120d22 100%)",
    glow: "rgba(155,107,255,0.4)",
    glow2: "rgba(255,122,198,0.16)",
    // 별빛 — 점 몇 개만 흩뿌린다
    dots: [
      "radial-gradient(1.5px 1.5px at 8% 22%, rgba(255,255,255,0.75), transparent 70%)",
      "radial-gradient(1px 1px at 19% 64%, rgba(255,255,255,0.55), transparent 70%)",
      "radial-gradient(1.5px 1.5px at 31% 12%, rgba(228,212,255,0.8), transparent 70%)",
      "radial-gradient(1px 1px at 46% 38%, rgba(255,255,255,0.45), transparent 70%)",
      "radial-gradient(1px 1px at 58% 8%, rgba(255,255,255,0.6), transparent 70%)",
      "radial-gradient(1.5px 1.5px at 67% 54%, rgba(228,212,255,0.6), transparent 70%)",
      "radial-gradient(1px 1px at 79% 18%, rgba(255,255,255,0.7), transparent 70%)",
      "radial-gradient(1px 1px at 88% 76%, rgba(255,255,255,0.5), transparent 70%)",
      "radial-gradient(1.5px 1.5px at 94% 40%, rgba(255,255,255,0.65), transparent 70%)",
      "radial-gradient(1px 1px at 38% 88%, rgba(228,212,255,0.55), transparent 70%)",
    ].join(","),
  },
  // 강화 — 불씨. 짙은 다홍 바탕에 주황 불티
  enh: {
    bg: "linear-gradient(160deg, #3a1411 0%, #1f0d0c 45%, #140a0a 100%)",
    glow: "rgba(255,84,54,0.36)",
    glow2: "rgba(255,170,64,0.14)",
    dots: [
      "radial-gradient(1.5px 1.5px at 12% 80%, rgba(255,176,96,0.85), transparent 70%)",
      "radial-gradient(1px 1px at 22% 58%, rgba(255,140,90,0.6), transparent 70%)",
      "radial-gradient(1.5px 1.5px at 35% 90%, rgba(255,200,120,0.7), transparent 70%)",
      "radial-gradient(1px 1px at 48% 70%, rgba(255,120,80,0.55), transparent 70%)",
      "radial-gradient(1px 1px at 61% 86%, rgba(255,190,110,0.7), transparent 70%)",
      "radial-gradient(1.5px 1.5px at 73% 62%, rgba(255,150,90,0.6), transparent 70%)",
      "radial-gradient(1px 1px at 84% 92%, rgba(255,200,130,0.75), transparent 70%)",
      "radial-gradient(1px 1px at 92% 74%, rgba(255,130,80,0.55), transparent 70%)",
    ].join(","),
  },
};
// glow: 번짐 색을 창이 정할 때(테마 번짐 대신) — 예: 인벤토리의 고른 아이템 색. "" 이면 번짐 없음
// corner: "2xl" 이면 창 모서리 16px(다른 패널과 같은 값 — 인벤토리 2026-10-11 「다듬은 잉크 판」). 기본은 예전 그대로 24px
// compact: 왼쪽 요약 판 없이 한 칸짜리 창(PC 최대 680px · 높이는 내용만큼, 모바일은 바텀시트 최대 88dvh) — 강화 창
// 📌 top — 왼쪽 · 오른쪽 칸 위에 전체 폭으로 까는 판(2026-10-15 인벤토리 「꾸미기」 장착 판). 있으면 본문이 칸마다가 아니라 한 번에 스크롤한다
//    size "xl" — PC 1100 × 800 · 폰은 기본과 같은 높이(인벤토리 — 모든 탭 같은 크기, 2026-10-17 운영자 "그냥 똑같은 크기로 맞추라니까"). size "wide" — 넓은 창(PC 1024 × 820, 인벤토리 — 2026-10-15 운영자 "인벤토리 창 크기 늘려도 되니까"). body — 왼쪽 · 오른쪽 칸 대신 본문을 통째로 맡긴다(인벤토리 「꾸미기」 옷장 — 스크롤도 그쪽이)
export const PopShell = ({ open, onClose, title, count, badge, icon, tabs, top, left, children, body, footer, theme = "ink", compact = false, corner = "3xl", glow, size = "", tabsWrap = false }) => {
  // 왼쪽 칸(상세) 폭 — 큰 창(xl · 1100)은 340, 그 밖은 236(2026-10-17 운영자 인벤토리 상세 칸 "이부분을 좀 더 늘려")
  //    tabsWrap — 폰에서 탭이 넘치면 숨은 가로 스크롤 대신 다음 줄로 접는다(인벤토리 — 「즐겨찾기」 탭이 늘 붙어 폰 폭을 넘는다). PC 는 그대로 한 줄
  const leftW = size === "xl" ? "sm:w-[340px]" : "sm:w-[236px]";
  const closeRef = useRef(null);
  // 열리면 닫기 버튼에 포커스 — 키보드로도 바로 닫고, 탭 순서가 팝업 안에서 시작한다
  useEffect(() => { if (open) closeRef.current?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const t = POP_THEME[theme] || POP_THEME.ink;
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(10,10,10,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full overflow-hidden flex flex-col shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)] ${compact ? "sm:max-w-[680px] max-h-[88dvh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-2xl" : `pop-snap ${size === "xl" ? "sm:max-w-[1100px] h-[86dvh] sm:h-[min(800px,92vh)]" : size === "wide" ? "sm:max-w-5xl h-[90dvh] sm:h-[min(820px,92vh)]" : "sm:max-w-3xl h-[86dvh] sm:h-[min(620px,88vh)]"} ${corner === "2xl" ? "rounded-t-2xl sm:rounded-2xl" : "rounded-t-3xl sm:rounded-3xl"}`}`}
        style={{ background: t.bg, animation: "tierIn .32s cubic-bezier(0.16,1,0.3,1)", ...(compact ? null : SNAP[size] || SNAP[""]) }}
      >
        <style>{POP_CSS}</style>
        {t.grid && <div aria-hidden className="absolute inset-0 lux-grid-bg-dark opacity-60 pointer-events-none"></div>}
        {t.dots && <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ backgroundImage: t.dots }}></div>}
        {/* 번짐 — glow 를 주면 테마 색 대신 그 색(인벤토리는 고른 아이템 색, 바뀔 때 부드럽게 넘어간다). glow "" 은 번짐 없음 */}
        {(glow != null ? glow : t.glow) && <div aria-hidden className="absolute -top-28 -right-16 w-80 h-80 blur-[100px] rounded-full pointer-events-none" style={{ background: glow != null ? glow : t.glow, transition: "background-color .5s ease" }}></div>}
        {t.glow2 && <div aria-hidden className="absolute -bottom-32 -left-20 w-80 h-80 blur-[110px] rounded-full pointer-events-none" style={{ background: t.glow2 }}></div>}

        {/* 모바일 바텀시트 손잡이 */}
        <div aria-hidden className="sm:hidden relative z-10 flex justify-center pt-2.5"><span className="w-10 h-1 rounded-full bg-white/20"></span></div>

        {/* 머리 */}
        <div className="relative z-10 shrink-0 px-5 sm:px-7 pt-4 sm:pt-6 flex items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-3">
            {icon && (
              <svg aria-hidden viewBox="0 0 24 24" className="w-[22px] h-[22px] shrink-0 text-white/55" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d={ICON_PATHS[icon]} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-none truncate">{title}</h3>
            {count != null && <span className="shrink-0 text-sm font-black text-white/40 tabular-nums">{count}</span>}
            {badge}
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 w-9 h-9 rounded-full border border-white/15 text-white/55 hover:text-white hover:border-white/35 transition-colors flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2"><path d={ICON_PATHS.close} strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* 탭 */}
        <div className={`relative z-10 shrink-0 ${compact ? "px-5 sm:px-9" : "px-5 sm:px-7 border-b border-white/[0.08]"} ${tabs ? (compact ? "pt-4 sm:pt-5 flex" : tabsWrap ? "py-1 sm:py-4 flex flex-wrap sm:flex-nowrap items-center gap-x-1.5 sm:overflow-x-auto no-bar" : "py-4 flex items-center gap-1.5 overflow-x-auto no-bar") : "pt-4"}`}>{tabs}</div>

        {/* 본문 — PC 는 왼쪽 요약 | 오른쪽 목록, 모바일은 위아래로 한 번에 스크롤. compact 는 한 칸 */}
        {compact ? (
          <div data-pop-body className="relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 sm:px-9 pt-6 sm:pt-8 pb-6 sm:pb-9">{children}</div>
        ) : body ? (
          <div data-pop-body className="relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden sm:overflow-hidden pop-scroll">{body}</div>
        ) : top ? (
          <div data-pop-body className="relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pop-scroll">
            <div className="px-5 sm:px-6 pt-5 sm:pt-6">{top}</div>
            <div className="sm:flex sm:items-start">
              <div className={`shrink-0 ${leftW} sm:self-stretch sm:border-r border-white/[0.08] px-5 sm:px-6 pt-1 pb-4 sm:pb-6 flex flex-col`}>{left}</div>
              <div data-pop-list className="min-w-0 flex-1 px-5 sm:px-6 pb-6 pt-1">{children}</div>
            </div>
          </div>
        ) : (
          <div data-pop-body className="relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden sm:overflow-hidden sm:flex">
            <div className={`shrink-0 ${leftW} sm:border-r border-white/[0.08] px-5 sm:px-6 pt-5 pb-4 sm:py-6 sm:overflow-y-auto sm:overflow-x-hidden no-bar flex flex-col`}>{left}</div>
            <div data-pop-list className="pop-scroll min-w-0 flex-1 px-5 sm:px-6 pb-6 pt-1 sm:py-6 sm:overflow-y-auto">{children}</div>
          </div>
        )}

        {footer}
      </div>
    </div>
  );
};

// 팝업 탭 — 흰 알약이 지금 고른 것
export const PopTab = ({ on, onClick, label, n }) => (
  <button
    type="button"
    onClick={onClick}
    className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
      on ? "bg-white text-[#131313]" : "bg-white/[0.06] text-white/60 hover:text-white"
    }`}
  >
    {label}
    {n != null && <span className={`tabular-nums text-[11px] font-black ${on ? "text-[#8a8a8a]" : "text-white/35"}`}>{n}</span>}
  </button>
);
