"use client";

// 📌 관리자 영역 공용 UI — /admin 하위 모든 페이지가 여기서 가져다 쓴다.
//
//    이 파일이 생기기 전에는 SectionHead 가 4개 파일에 그대로 복사돼 있었고,
//    inputClass 는 값까지 갈라져 있었으며(bg-transparent vs bg-[#ffffff]),
//    같은 역할의 필터 칩이 화면마다 rounded-full / rounded-lg 로 달랐다.
//    복사본은 한쪽만 고쳐지면서 조용히 어긋난다 — 그래서 한 곳으로 모은다.
//
//    톤은 "사무적인 공식문서" 다. 화려한 장식 대신 헤어라인과 여백으로 나눈다.

import React, { useCallback, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { Reveal } from "../components/Lux";
import { ADMIN_USERS } from "@/lib/admins";

// ── 입력 ───────────────────────────────────────────────────
//    팔레트는 /level 대시보드와 같은 그레이지다 —
//    잉크 #131313, 보조 #5a5a5a / #8a8a8a / #a3a3a3, 강조 #e91e3f, 면 #e6e3de / #d2d1cf.
//    Tailwind 임의값은 리터럴이라 상수로 뽑아도 클래스에 못 쓰므로 값은 여기 주석으로만 남긴다.
export const inputClass =
  "w-full bg-transparent border border-black/10 rounded-lg px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] transition-colors placeholder:text-[#8a8a8a]";
export const fieldNote = "text-[10px] text-[#5a5a5a] mt-1.5";
export const labelClass = "block text-xs font-bold text-[#5a5a5a] mb-2";

// ── 섹션 머리 ──────────────────────────────────────────────
//    no 는 화면 안 순서표(01, 02 …). 눈으로 훑을 때 위치를 잡아 준다.
export function SectionHead({
  no,
  title,
  right,
}: {
  no: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-4 mb-2">
        <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">{no}</span>
        <div className="h-px flex-1 bg-gradient-to-r from-black/15 to-transparent"></div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg md:text-xl font-black text-[#131313] tracking-tight">{title}</h2>
        {right}
      </div>
    </div>
  );
}

// ── 필터 칩 ────────────────────────────────────────────────
//    목록 위에서 범위를 좁히는 용도. 모양을 하나로 고정한다 —
//    같은 일을 하는 칩이 화면마다 다르게 생기면 그것만으로 산만해진다.
export type ChipOption = { v: string; l: string };

export function FilterChips({
  options,
  value,
  onChange,
  className = "",
}: {
  options: ChipOption[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex gap-2 overflow-x-auto no-bar ${className}`}>
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`shrink-0 px-4 py-2 rounded-lg text-[11px] font-bold border transition-colors outline-none focus:outline-none ${
              on
                ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/40"
                : "text-[#5a5a5a] border-black/10 hover:text-[#131313]"
            }`}
          >
            {o.l}
          </button>
        );
      })}
    </div>
  );
}

// ── 목록 빈 상태 ───────────────────────────────────────────
//    헤어라인 사이의 한 줄. 카드로 감싸지 않는다.
export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-10 text-[#5a5a5a] text-sm border-y border-black/[0.06]">{children}</div>
  );
}

// ── 목록 껍데기 ────────────────────────────────────────────
//    위아래 헤어라인 + 행 사이 구분선. 관리자 목록은 전부 이 모양이다.
export function ListFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`divide-y divide-black/[0.06] border-y border-black/[0.06] ${className}`}>
      {children}
    </div>
  );
}

// ── 버튼 ───────────────────────────────────────────────────
//    primary  : 저장·등록처럼 그 화면의 주 행동
//    ghost    : 취소·닫기
//    danger   : 삭제·초기화처럼 되돌리기 어려운 것
const BTN: Record<string, string> = {
  primary: "bg-[#131313] text-white hover:bg-[#2a2a2a] disabled:opacity-40",
  ghost:
    "bg-transparent text-[#5a5a5a] border border-black/10 hover:text-[#131313] disabled:opacity-40",
  danger: "bg-[#e91e3f] text-white hover:bg-[#c8172f] disabled:opacity-40",
};

export function Btn({
  variant = "primary",
  className = "",
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  // 기본을 button 으로 둔다 — <form> 안에 무심코 놓았을 때 submit 으로 새로고침되는 걸 막는다.
  //    제출 버튼은 호출부에서 type="submit" 을 명시한다.
  return (
    <button
      type={type}
      {...rest}
      className={`px-5 py-2.5 rounded-lg text-[12px] font-bold transition-colors outline-none focus:outline-none disabled:cursor-default ${BTN[variant]} ${className}`}
    />
  );
}

// ── 토글 ───────────────────────────────────────────────────
export function Toggle({
  on,
  onClick,
  onLabel,
  offLabel,
  disabled,
  className = "md:max-w-md",
}: {
  on: boolean;
  onClick: () => void;
  onLabel: string;
  offLabel: string;
  disabled?: boolean;
  // grid 한 칸 안에 놓을 때는 ""(폭 제한 없음)를 넘겨 옆 입력칸과 길이를 맞춘다
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${inputClass} ${className} flex items-center justify-between text-left disabled:opacity-40 ${
        on ? "border-[#e91e3f]/40" : ""
      }`}
    >
      <span className={on ? "text-[#e91e3f] font-bold" : "text-[#5a5a5a]"}>
        {on ? onLabel : offLabel}
      </span>
      <span
        className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${
          on ? "bg-[#e91e3f]" : "bg-[#e6e3de]"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white ring-1 ring-black/15 shadow-sm transition-all ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        ></span>
      </span>
    </button>
  );
}

// ── 알림 모달 ──────────────────────────────────────────────
//    notify() 로 띄우고, noticeEl 을 페이지 맨 끝에 한 번 렌더한다.
//    관리자 화면은 결과를 놓치면 안 되는 조작이 많아 토스트가 아니라 모달을 쓴다.
export function useNotice() {
  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false });

  const notify = useCallback(
    (message: string, isError = false) => setPopup({ isOpen: true, message, isError }),
    []
  );
  const close = useCallback(() => setPopup((p) => ({ ...p, isOpen: false })), []);

  const noticeEl = popup.isOpen ? (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overlay-in">
      <div className="bg-[#ffffff] border border-black/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)]">
        <h2 className="text-xl font-bold text-[#131313] mb-3">{popup.isError ? "오류" : "완료"}</h2>
        <p className="text-sm text-[#5a5a5a] mb-8 break-keep whitespace-pre-line">{popup.message}</p>
        <button
          onClick={close}
          className="w-full py-3 bg-[#e6e3de] hover:bg-[#d2d1cf] text-[#131313] font-bold rounded-xl transition-colors outline-none focus:outline-none"
        >
          확인
        </button>
      </div>
    </div>
  ) : null;

  return { notify, noticeEl, close };
}

// ── 확인 모달 ──────────────────────────────────────────────
//    되돌리기 어려운 조작 앞에 세운다. window.confirm 은 무엇이 얼마나
//    바뀌는지 보여 줄 자리가 없어 관리자 화면에는 부족하다.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "확인",
  cancelLabel = "취소",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overlay-in">
      <div className="bg-[#ffffff] border border-black/10 rounded-3xl w-full max-w-sm p-8 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)]">
        <h2 className="text-xl font-bold text-[#131313] mb-3">{title}</h2>
        {body && <div className="text-sm text-[#5a5a5a] mb-8 break-keep">{body}</div>}
        <div className="flex gap-3">
          <Btn variant="ghost" onClick={onCancel} disabled={busy} className="flex-1 py-3">
            {cancelLabel}
          </Btn>
          <Btn
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 py-3"
          >
            {busy ? "처리 중..." : confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── 권한 가드 ──────────────────────────────────────────────
//    화면마다 ADMIN_USERS 를 하드코딩해 두던 것을 한 곳으로 모은다.
//    ⚠️ 이건 화면을 가리는 장치일 뿐이다. 실제 방어는 서버(API)에서
//       getServerSession + isAdminName 으로 한 번 더 해야 한다.
export function useAdminGuard() {
  const { data: session, status } = useSession();
  const isAdmin =
    status === "authenticated" && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const gate =
    status === "loading" ? (
      <div className="min-h-[60vh] flex items-center justify-center text-[#8a8a8a]">로딩 중...</div>
    ) : !isAdmin ? (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-[#131313] mb-2">권한 없음</h2>
        <p className="text-[#5a5a5a] text-sm mb-4">관리자 권한이 필요합니다.</p>
        <button
          onClick={() => signIn("discord")}
          className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4 outline-none focus:outline-none"
        >
          디스코드 로그인
        </button>
      </main>
    ) : null;

  return { session, status, isAdmin, gate };
}

// ── 페이지 머리 ────────────────────────────────────────────
//    제목의 앞 낱말은 잉크색, 나머지는 강조색 — 관리자 페이지 공통 표기다.
//    ⚠️ lux-grid-bg 는 전역 CSS 가 아니라 <LuxStyles /> 안에 정의돼 있다 —
//       이 컴포넌트를 쓰는 페이지는 LuxStyles 를 함께 렌더해야 배경 격자가 나온다.
//    폭은 페이지가 정한다. 여기서 못 박으면 본문 래퍼 폭과 좌측 정렬선이 어긋난다.
export function AdminHero({
  title,
  desc,
  width = "max-w-6xl",
  size = "sm",
}: {
  title: string;
  desc?: string;
  width?: string;
  // lg: 허브·상점처럼 페이지 첫 화면의 제목 / sm: 탭이 딸린 설정 화면의 제목
  size?: "lg" | "sm";
}) {
  const [head, ...rest] = title.split(" ");
  const lg = size === "lg";
  return (
    <section className="relative w-full pt-16 pb-10 md:pt-20 md:pb-12 px-6">
      <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
      <div className={`${width} mx-auto relative z-10`}>
        <Reveal>
          {/* 제목 위에 얹혀 있던 가로선 + 영문 라벨(eyebrow)은 뺐다 — 제목이 첫 줄이다 */}
          <h1 className={`font-black tracking-tighter leading-none ${lg ? "text-4xl md:text-5xl mb-4" : "text-2xl md:text-3xl mb-2.5"}`}>
            <span className="text-[#131313]">{head} </span>
            <span className="text-[#e91e3f]">{rest.join(" ") || "설정"}</span>
          </h1>
          {desc && <p className={`text-[#5a5a5a] leading-relaxed break-keep ${lg ? "text-sm md:text-base" : "text-[13px]"}`}>{desc}</p>}
        </Reveal>
      </div>
    </section>
  );
}

// ── 페이지 안 탭 ───────────────────────────────────────────
//    좌측 내비를 오가지 않고 바로 전환한다. 주소(?tab=)에 실려 새로고침·뒤로가기가 산다.
export function AdminTabs({
  tabs,
  current,
  hrefOf,
  width = "max-w-6xl",
}: {
  tabs: { id: string; short: string }[];
  current: string;
  hrefOf: (id: string) => string;
  // 본문 래퍼와 같은 값을 넘겨야 탭 줄과 본문의 왼쪽 끝이 맞는다
  width?: string;
}) {
  return (
    <div className="w-full px-6 pb-8">
      <div className={`${width} mx-auto flex gap-2 overflow-x-auto no-bar`}>
        {tabs.map((t) => {
          const active = current === t.id;
          return (
            <Link
              key={t.id}
              href={hrefOf(t.id)}
              scroll={false}
              className={`shrink-0 px-4 py-2 rounded-lg text-[12px] font-bold border transition-colors outline-none focus:outline-none ${
                active
                  ? "bg-[#131313] text-white border-[#131313]"
                  : "text-[#5a5a5a] border-black/10 hover:text-[#131313]"
              }`}
            >
              {t.short}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── 세부 탭 ────────────────────────────────────────────────
//    설정이 세로로 길게 늘어지지 않도록 한 묶음씩 보여 준다 (?sec=).
export function SubTabs({
  tabs,
  current,
  hrefOf,
}: {
  tabs: { id: string; label: string }[];
  current: string;
  hrefOf: (id: string) => string;
}) {
  if (tabs.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto no-bar mb-8">
      {tabs.map((s) => {
        const on = current === s.id;
        return (
          <Link
            key={s.id}
            href={hrefOf(s.id)}
            scroll={false}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-colors outline-none focus:outline-none ${
              on
                ? "bg-[#e91e3f]/15 text-[#e91e3f]"
                : "text-[#8a8a8a] hover:text-[#131313] hover:bg-black/[0.04]"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}

// ── 표 껍데기 ──────────────────────────────────────────────
//    좁은 화면에서 표가 넘칠 때 페이지가 아니라 표만 가로로 스크롤되게 한다.
export function TableScroll({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto no-bar -mx-6 px-6 md:mx-0 md:px-0">{children}</div>;
}
