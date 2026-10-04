"use client";

import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ICON_PATHS } from "./Icons";

// 📌 로그인 창 — 사이트 어디서든 같은 창 한 벌 (2026-10-04 승인: 흰 판 · 작은 PREMIUM IGLOO · "로그인" · Discord로 계속하기)
//    예전 어두운 창(ClientLayout)과 화면마다 따로 그린 '로그인 필요' 면을 이것 하나로 모은다.
//    창 상태(열림 · 비회원 문의)는 ClientLayout 의 isLoginModalOpen 이 들고 있고, 어디서든 openLogin() 으로 연다(창 이벤트).
//    PC 는 가운데 판(rounded-2xl), 폰(768 미만)은 아래에서 올라오는 시트(위 모서리 16px + 손잡이).
//    맥락(ARCTIC · 구매, 경매 · 입장)을 넘기면 맨 위에 작은 칩으로 어디서 왔는지 보인다.

export type LoginContext = { chip: string; label: string };

// 자주 쓰는 맥락 — 화면마다 글자를 따로 쓰면 같은 창이 곳마다 달라 보인다
export const LOGIN_CTX = {
  arcticBuy: { chip: "ARCTIC", label: "구매" },
  auction: { chip: "경매", label: "입장" },
} satisfies Record<string, LoginContext>;

export type OpenLoginOptions = {
  context?: LoginContext | null;
  /** 창을 닫으면(X · 바깥 · Esc) 부르는 것 — 경매방 직접 주소처럼 닫으면 다른 곳으로 보내야 할 때. 로그인하러 가거나 다른 화면으로 옮기면 부르지 않는다 */
  onClose?: () => void;
  /** 로그인하고 돌아올 곳 — 비우면 지금 화면. 경매 목록에서 방에 들어가려다 연 창이면 그 방으로 */
  returnTo?: string;
};

const OPEN_EVENT = "igloo:open-login";

// 어디서든 로그인 창을 연다 — 로그인 여부는 부르는 쪽이 본다(로그인돼 있으면 창은 그려지지 않는다)
export function openLogin(opts: OpenLoginOptions = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OpenLoginOptions>(OPEN_EVENT, { detail: opts }));
}

// ClientLayout 이 듣는다 — 돌려주는 함수로 듣기를 끝낸다
export function onLoginRequest(handler: (opts: OpenLoginOptions) => void) {
  const fn = (e: Event) => handler(((e as CustomEvent<OpenLoginOptions>).detail) || {});
  window.addEventListener(OPEN_EVENT, fn);
  return () => window.removeEventListener(OPEN_EVENT, fn);
}

const SHEET_CSS = `
@keyframes loginSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes loginPanelIn { from { opacity: 0; transform: translateY(10px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
.login-sheet { animation: loginSheetUp .32s cubic-bezier(0.22,1,0.36,1); }
@media (min-width: 768px) { .login-sheet { animation: loginPanelIn .26s cubic-bezier(0.16,1,0.3,1); } }
@media (prefers-reduced-motion: reduce) { .login-sheet { animation: none; } }
`;

// 판 하나 — 로그인 · 비회원 문의가 같이 쓴다(두 창이 같은 모양으로 이어지게)
//    스크롤 잠금은 루트의 "fixed inset-0" 을 보고 전역 ScrollLock 이 건다. ARCTIC 하단 독(z-92) · 상점 창(z-145)보다 위
function SheetFrame({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // 열리면 닫기 버튼에 포커스 — 키보드로 바로 닫을 수 있고 탭 순서가 창 안에서 시작한다
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[170] flex items-end md:items-center justify-center bg-black/40 backdrop-blur-[6px] md:p-4" onClick={onClose}>
      <style>{SHEET_CSS}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="login-sheet relative w-full md:max-w-[400px] max-h-[92dvh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)]"
      >
        {/* 폰 — 바텀시트 손잡이 */}
        <div aria-hidden className="md:hidden flex justify-center pt-2.5">
          <span className="w-10 h-1 rounded-full bg-[#e0e0e0]" />
        </div>
        {/* 머리 — 작은 워드마크 · 닫기 */}
        <div className="flex items-center justify-between pl-6 pr-4 pt-3 md:pt-5">
          <span className="text-[12px] font-black tracking-[0.22em] text-[#131313] select-none">PREMIUM IGLOO</span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#5a5a5a] hover:text-[#131313] hover:bg-[#f2f2f2] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/20">
            <svg aria-hidden viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} />
            </svg>
          </button>
        </div>
        <div className="px-6 pt-6 md:pt-7 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-7">{children}</div>
      </div>
    </div>
  );
}

// 📌 로그인 창 본문 — 맥락 칩 · 제목 · 한 줄 · Discord 단추 · 작은 링크 둘. 디스코드 로고 · 펭귄 같은 그림은 두지 않는다
export function LoginSheet({
  context, onClose, onLeave, onDiscord, onGuest, onDev,
}: {
  context?: LoginContext | null;
  onClose: () => void;
  /** 창 안의 링크로 다른 화면에 갈 때 — 연 쪽이 맡긴 닫기 할 일(경매 목록으로 보내기 등)은 하지 않고 조용히 닫는다 */
  onLeave?: () => void;
  onDiscord: () => void;
  onGuest: () => void;
  /** 로컬 개발 서버에서만 — 예전 레벨 화면에 있던 확인용 로그인 */
  onDev?: (() => void) | null;
}) {
  return (
    <SheetFrame label="로그인" onClose={onClose}>
      {context && (
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center h-5 px-2 rounded-full bg-[#131313] text-white text-[10px] font-black tracking-[0.08em] leading-none">{context.chip}</span>
          <span className="text-[12px] font-bold text-[#8a8a8a]">{context.label}</span>
        </div>
      )}
      <h2 className="text-[22px] font-black text-[#131313] tracking-tight leading-tight">로그인</h2>
      <p className="mt-1.5 text-[12px] text-[#5a5a5a]">고급 이글루 디스코드 계정</p>
      <button type="button" onClick={onDiscord}
        className="mt-7 w-full h-12 rounded-full bg-[#5865F2] hover:bg-[#4752C4] text-white text-[14px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]/40">
        Discord로 계속하기
      </button>
      <div className="mt-4 flex items-center justify-center gap-2 text-[12px] text-[#5a5a5a]">
        <button type="button" onClick={onGuest} className="underline underline-offset-4 hover:text-[#131313] transition-colors outline-none focus-visible:text-[#131313]">비회원 문의</button>
        <span aria-hidden className="text-[#a3a3a3]">·</span>
        <Link href="/policy" onClick={onLeave || onClose} className="underline underline-offset-4 hover:text-[#131313] transition-colors outline-none focus-visible:text-[#131313]">이용약관</Link>
      </div>
      {onDev && (
        <button type="button" onClick={onDev} className="mt-3 block mx-auto text-[11px] font-bold text-[#a3a3a3] hover:text-[#131313] underline underline-offset-4 transition-colors outline-none">로컬 확인용 로그인 (dev)</button>
      )}
    </SheetFrame>
  );
}

// 📌 비회원 문의 — 로그인 창과 같은 흰 판. 입력칸은 사이트 입력칸과 같은 모양(각진 칸 · 조작 테두리 #a3a3a3 · 폰 16px)
const FIELD = "w-full bg-white border border-[#a3a3a3] px-3.5 text-[16px] md:text-[14px] text-[#131313] outline-none focus:border-[#131313] transition-colors placeholder:text-[#8a8a8a]";

export function GuestInquirySheet({
  email, content, onEmail, onContent, onSubmit, onClose,
}: {
  email: string;
  content: string;
  onEmail: (v: string) => void;
  onContent: (v: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <SheetFrame label="비회원 문의" onClose={onClose}>
      <h2 className="text-[22px] font-black text-[#131313] tracking-tight leading-tight">비회원 문의</h2>
      {/* 간격은 마진으로 — 이 빌드는 세로 flex 의 gap 이 먹지 않을 때가 있다 */}
      <form onSubmit={onSubmit} className="mt-6">
        <input type="email" required placeholder="답변 받을 이메일 주소" value={email} onChange={(e) => onEmail(e.target.value)} className={`${FIELD} block h-11`} />
        <textarea required placeholder="문의 내용을 상세히 적어주세요." rows={5} value={content} onChange={(e) => onContent(e.target.value)} className={`${FIELD} block mt-3 py-3 leading-relaxed resize-none`} />
        <button type="submit"
          className="mt-6 w-full h-12 rounded-full bg-[#131313] hover:bg-[#3a3a3a] text-white text-[14px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30">
          문의 접수하기
        </button>
      </form>
    </SheetFrame>
  );
}
