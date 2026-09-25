"use client";

// 📌 관리자 영역 공용 UI — /admin 하위 · 글쓰기(/write) 모든 화면이 여기서 가져다 쓴다.
//
//    2026-09 전면 개편. 화면마다 머리 · 탭 · 입력칸 · 목록 모양이 제각각이고, 가운데 좁은 폭만 써서
//    "복잡하고 방정맞다, 좌우를 왜 안 쓰냐"는 지적을 받았다. 그래서 틀을 두 가지로 줄인다.
//      · 설정 화면 — 페이지 머리 + 탭 한 줄 → 패널(카드) 두 열 → 바뀐 게 있을 때만 뜨는 저장 줄
//      · 목록 화면 — 페이지 머리 + 탭 한 줄 → 검색 · 상태 토글 한 줄 → 전체 폭 표 → 누르면 오른쪽 상세 칸
//    폭은 화면 끝까지 쓴다(가운데 max-w 금지). 번호(01·02) · 빨간 큰 제목 · 격자 배경은 쓰지 않는다.
//
//    값: 잉크 #131313 · 본문 #5a5a5a · 메타 #8a8a8a · 비활성 #a3a3a3 · 선 #ededed · 들어간 면 #f2f2f2
//        조작 요소 테두리 #a3a3a3 · 강조 #e91e3f / 누름 #d01634. 모서리는 패널 rounded-2xl · 버튼/토글 rounded-full · 입력칸 rounded-lg.
//    톤은 "사무적인 공식문서" — 장식 대신 선과 여백으로 나눈다.

import React, { useCallback, useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { ADMIN_USERS } from "@/lib/admins";

// ── 입력 ───────────────────────────────────────────────────
//    높이는 min-h 로 — 같은 클래스를 textarea 에 써도 줄 수만큼 자란다
export const inputClass =
  "w-full min-h-10 px-3 py-2 rounded-lg border border-[#a3a3a3] bg-white text-[14px] text-[#131313] outline-none transition-colors placeholder:text-[#a3a3a3] focus:border-[#131313] focus:ring-2 focus:ring-[#131313]/10 disabled:bg-[#f2f2f2] disabled:text-[#8a8a8a] disabled:border-[#e0e0e0]";
// 숫자 칸 — 폭을 내용에 맞춰 짧게 (설정 줄 안에서 단위 글자와 한 줄로 놓인다)
export const numClass = `${inputClass} !w-28 tabular-nums`;
export const fieldNote = "mt-1.5 text-[12px] text-[#5a5a5a] leading-relaxed break-keep";
export const labelClass = "block text-[13px] font-bold text-[#131313] mb-1.5";

// ── 페이지 틀 ──────────────────────────────────────────────
//    머리(구역명 · 제목 · 한 줄 설명 · 오른쪽 동작) + 탭 한 줄 + 본문. 좌우 여백만 두고 끝까지 쓴다.
export function AdminPage({
  section,
  title,
  desc,
  actions,
  tabs,
  children,
  footer,
  bodyClass = "",
}: {
  section?: string; // 제목 위 작은 구역명 (SYSTEM : LEVEL · ARCTIC · 운영 …)
  title: string;
  desc?: string;
  actions?: React.ReactNode;
  tabs?: React.ReactNode; // <AdminTabs /> 를 넘긴다
  children: React.ReactNode;
  footer?: React.ReactNode; // <SaveBar /> 처럼 본문 아래 붙는 것
  bodyClass?: string;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col bg-white text-[#131313]">
      <header className={`px-5 md:px-8 pt-6 ${tabs ? "" : "pb-5"} border-b border-[#ededed]`}>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="min-w-0">
            {section && <p className="text-[12px] font-bold text-[#8a8a8a]">{section}</p>}
            <h1 className={`${section ? "mt-1" : ""} text-[22px] md:text-[24px] font-black tracking-tight leading-tight`}>{title}</h1>
            {desc && <p className="mt-1.5 text-[13px] text-[#5a5a5a] break-keep">{desc}</p>}
          </div>
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {tabs}
      </header>
      {/* 상세 칸(DetailPane)이 열려 있으면 PC 에서 그 폭만큼 오른쪽을 비운다 — 칸이 표 오른쪽 열을 덮지 않게 */}
      <style>{`@media (min-width: 768px) { .admin-body { padding-right: calc(2rem + var(--admin-pane, 0px)); transition: padding-right .2s ease; } }`}</style>
      <div className={`admin-body flex-1 px-5 md:px-8 py-6 ${bodyClass}`}>{children}</div>
      {footer}
    </div>
  );
}

// 옛 이름 — 머리만 쓰던 화면용. 폭 · 크기 인자는 받되 쓰지 않는다(전체 폭 하나)
export function AdminHero({ title, desc }: { title: string; desc?: string; width?: string; size?: "lg" | "sm" }) {
  return (
    <header className="px-5 md:px-8 pt-6 pb-5 border-b border-[#ededed] bg-white">
      <h1 className="text-[22px] md:text-[24px] font-black tracking-tight leading-tight text-[#131313]">{title}</h1>
      {desc && <p className="mt-1.5 text-[13px] text-[#5a5a5a] break-keep">{desc}</p>}
    </header>
  );
}

// ── 탭 한 줄 ───────────────────────────────────────────────
//    페이지 안 이동은 이것 하나. 좌측 메뉴에 하위 탭을 또 두지 않는다(메뉴가 세 겹이 되던 것).
//    주소(?tab=)에 실려 새로고침 · 뒤로가기가 산다. 고른 탭은 빨간 밑줄.
export function AdminTabs({
  tabs,
  current,
  hrefOf,
  onSelect,
}: {
  tabs: { id: string; short: string; n?: number }[];
  current: string;
  hrefOf?: (id: string) => string;
  onSelect?: (id: string) => void; // 주소 없이 화면 안에서만 바꿀 때
  width?: string; // 옛 인자 — 무시
}) {
  return (
    <nav className="mt-4 -mb-px flex gap-5 md:gap-6 overflow-x-auto no-bar">
      {tabs.map((t) => {
        const active = current === t.id;
        const cls = `relative shrink-0 pb-3 text-[14px] font-bold whitespace-nowrap transition-colors outline-none focus-visible:underline ${active ? "text-[#131313]" : "text-[#5a5a5a] hover:text-[#131313]"}`;
        const inner = (
          <>
            {t.short}
            {t.n != null && t.n > 0 && <span className="ml-1.5 text-[12px] font-black text-[#e91e3f] tabular-nums">{t.n}</span>}
            {active && <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-[#e91e3f]" />}
          </>
        );
        return hrefOf ? (
          <Link key={t.id} href={hrefOf(t.id)} scroll={false} className={cls} aria-current={active ? "page" : undefined}>{inner}</Link>
        ) : (
          <button key={t.id} type="button" onClick={() => onSelect?.(t.id)} className={cls} aria-current={active ? "page" : undefined}>{inner}</button>
        );
      })}
    </nav>
  );
}

// ── 알약 토글(세그먼트) ────────────────────────────────────
//    같은 자리에서 보기를 바꾸는 선택 — 상태 필터 · 세 갈래 설정 · 화면 안 묶음 전환.
//    개수(n)는 옆에 옅게. 흰 알약이 고른 것.
export type SegOption = { v: string; l: string; n?: number };
export function Segmented({
  options,
  value,
  onChange,
  hrefOf,
  className = "",
  disabled = false,
}: {
  options: SegOption[];
  value: string;
  onChange?: (v: string) => void;
  hrefOf?: (v: string) => string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={`inline-flex max-w-full overflow-x-auto no-bar p-1 rounded-full bg-[#f2f2f2] ${disabled ? "opacity-50 pointer-events-none" : ""} ${className}`} role="tablist">
      {options.map((o) => {
        const on = value === o.v;
        const cls = `shrink-0 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${on ? "bg-white text-[#131313] ring-1 ring-black/[0.06]" : "text-[#5a5a5a] hover:text-[#131313]"}`;
        const inner = (
          <>
            {o.l}
            {o.n != null && <span className={`text-[12px] tabular-nums ${on ? "text-[#8a8a8a]" : "text-[#a3a3a3]"}`}>{o.n}</span>}
          </>
        );
        return hrefOf ? (
          <Link key={o.v} href={hrefOf(o.v)} scroll={false} role="tab" aria-selected={on} className={cls}>{inner}</Link>
        ) : (
          <button key={o.v} type="button" role="tab" aria-selected={on} onClick={() => onChange?.(o.v)} className={cls}>{inner}</button>
        );
      })}
    </div>
  );
}

// 옛 이름들 — 같은 알약 토글로 그린다 (화면마다 칩 모양이 달라지던 것을 한 벌로)
export type ChipOption = { v: string; l: string };
export function FilterChips({ options, value, onChange, className = "" }: { options: ChipOption[]; value: string; onChange: (v: string) => void; className?: string }) {
  return <Segmented options={options} value={value} onChange={onChange} className={className} />;
}
export function SubTabs({ tabs, current, hrefOf }: { tabs: { id: string; label: string }[]; current: string; hrefOf: (id: string) => string }) {
  if (tabs.length === 0) return null;
  return <Segmented options={tabs.map((t) => ({ v: t.id, l: t.label }))} value={current} hrefOf={hrefOf} className="mb-5" />;
}

// ── 패널(카드) ─────────────────────────────────────────────
//    설정 한 묶음 · 표 한 개를 담는 판. 머리(제목 · 한 줄 · 오른쪽 동작) + 본문.
//    flush: 본문 안쪽 여백 없이 — FieldRow · 표를 넣을 때
export function Panel({
  title,
  desc,
  right,
  children,
  flush = false,
  className = "",
  id,
}: {
  title?: React.ReactNode;
  desc?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`min-w-0 rounded-2xl border border-[#ededed] bg-white ${className}`}>
      {(title || right) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5 border-b border-[#ededed]">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-black tracking-tight">{title}</h2>}
            {desc && <p className="mt-0.5 text-[12px] text-[#5a5a5a] break-keep">{desc}</p>}
          </div>
          {right && <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>}
        </div>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

// 패널 두 열 — 넓은 화면(xl)에서 둘, 그보다 좁으면 하나
export function PanelGrid({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid grid-cols-1 xl:grid-cols-2 gap-5 items-start ${className}`}>{children}</div>;
}

// 옛 이름 — 패널 없이 섹션 제목만 쓰던 곳. 번호(no)는 받되 그리지 않는다
export function SectionHead({ title, right }: { no?: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <h2 className="text-[16px] font-black tracking-tight text-[#131313]">{title}</h2>
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

// ── 설정 줄 ────────────────────────────────────────────────
//    왼쪽 이름(180px) · 오른쪽 입력 · 그 아래 한 줄 도움말. 모바일은 위아래로.
//    changed: 저장 전 바뀐 값이면 이름 옆에 빨간 점
export function FieldRow({
  label,
  hint,
  children,
  changed = false,
  top = false,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  changed?: boolean;
  top?: boolean; // textarea 처럼 키가 큰 입력 — 이름을 위에 맞춘다
}) {
  return (
    // flex-col 에서는 gap 이 먹지 않는 빌드라(메모: tailwind-v4-quirks) 모바일 간격은 이름 칸의 mb 로
    <div className={`flex flex-col md:flex-row md:gap-5 px-5 py-3.5 border-b border-[#ededed] last:border-b-0 ${top ? "md:items-start" : "md:items-center"}`}>
      <div className={`md:w-[180px] shrink-0 mb-1.5 md:mb-0 flex items-center gap-1.5 text-[13px] font-bold ${top ? "md:pt-2.5" : ""}`}>
        {label}
        {changed && <span aria-label="바뀜" className="w-1.5 h-1.5 rounded-full bg-[#e91e3f]" />}
      </div>
      <div className="min-w-0 flex-1">
        {children}
        {hint && <p className={fieldNote}>{hint}</p>}
      </div>
    </div>
  );
}

// 숫자 + 단위 한 줄 — FieldRow 안에서 "[ 60 ] 초" 처럼
export function Inline({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-2 text-[13px] text-[#5a5a5a] ${className}`}>{children}</div>;
}

// ── 스위치 ─────────────────────────────────────────────────
export function Switch({ on, onChange, disabled = false, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 disabled:opacity-40 ${on ? "bg-[#131313]" : "bg-[#d4d4d4]"}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

// 옛 이름 — 스위치 + 상태 글자 (입력칸 모양 틀 없이)
export function Toggle({ on, onClick, onLabel, offLabel, disabled }: { on: boolean; onClick: () => void; onLabel: string; offLabel: string; disabled?: boolean; className?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Switch on={on} onChange={() => onClick()} disabled={disabled} label={on ? onLabel : offLabel} />
      <span className={`text-[13px] font-bold ${on ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{on ? onLabel : offLabel}</span>
    </span>
  );
}

// ── 버튼 ───────────────────────────────────────────────────
//    primary   : 그 화면의 주 행동(저장 · 등록) — 먹 알약
//    secondary : 보조(추가 · 내보내기 · 취소) — 테두리 알약
//    ghost     : 글자만(되돌리기 · 편집)
//    danger    : 삭제 · 초기화
const BTN: Record<string, string> = {
  primary: "bg-[#131313] text-white hover:bg-[#3a3a3a]",
  secondary: "bg-white text-[#131313] border border-[#a3a3a3] hover:border-[#131313]",
  ghost: "bg-transparent text-[#5a5a5a] hover:text-[#131313] hover:bg-[#f2f2f2]",
  danger: "bg-[#e91e3f] text-white hover:bg-[#d01634]",
};
export function Btn({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  // 기본을 button 으로 둔다 — <form> 안에 무심코 놓았을 때 submit 으로 새로고침되는 걸 막는다.
  return (
    <button
      type={type}
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40 disabled:opacity-40 disabled:cursor-default ${size === "sm" ? "h-8 px-3.5 text-[12px]" : "h-10 px-5 text-[13px]"} ${BTN[variant] || BTN.primary} ${className}`}
    />
  );
}

// ── 저장 줄 ────────────────────────────────────────────────
//    바뀐 것이 있을 때만 화면 아래에 붙는다. 무엇이 바뀌었는지(changes) · 되돌리기 · 저장.
//    모바일은 하단 독 위에 뜬 판으로.
export function SaveBar({
  dirty,
  changes,
  onSave,
  onReset,
  saving = false,
  saveLabel = "저장",
  note,
}: {
  dirty: boolean;
  changes?: string[]; // "음성 XP 3,000 → 0" 같은 한 줄들
  onSave: () => void;
  onReset?: () => void;
  saving?: boolean;
  saveLabel?: string;
  note?: React.ReactNode; // 바뀐 게 없을 때 대신 보일 한 줄(없으면 줄 자체를 숨긴다)
}) {
  if (!dirty && !note) return null;
  const list = changes || [];
  return (
    <div className="sticky bottom-[84px] md:bottom-0 z-30 mx-3 md:mx-0 mb-3 md:mb-0 rounded-2xl md:rounded-none border md:border-x-0 md:border-b-0 border-[#ededed] bg-white/95 backdrop-blur-md shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] md:shadow-none">
      <div className="flex items-center gap-3 px-4 md:px-8 min-h-16 py-3">
        <div className="min-w-0 flex-1">
          {dirty ? (
            <>
              <p className="text-[13px] font-black">변경 {list.length || ""}{list.length ? "개" : "사항 있음"}</p>
              {list.length > 0 && <p className="text-[12px] text-[#5a5a5a] truncate tabular-nums">{list.slice(0, 3).join(" · ")}{list.length > 3 ? ` 외 ${list.length - 3}` : ""}</p>}
            </>
          ) : (
            <p className="text-[12px] text-[#5a5a5a]">{note}</p>
          )}
        </div>
        {dirty && onReset && <Btn variant="ghost" onClick={onReset} disabled={saving}>되돌리기</Btn>}
        <Btn onClick={onSave} disabled={!dirty || saving}>{saving ? "저장 중…" : saveLabel}</Btn>
      </div>
    </div>
  );
}

// ── 목록 위 한 줄 ──────────────────────────────────────────
export function Toolbar({ children, right, className = "" }: { children?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2.5 mb-4 ${className}`}>
      {children}
      {right && <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "검색", className = "" }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <label className={`relative block w-full sm:w-72 ${className}`}>
      <svg aria-hidden viewBox="0 0 24 24" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a8a8a]" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 pl-10 pr-3.5 rounded-full border border-[#a3a3a3] bg-white text-[14px] text-[#131313] outline-none placeholder:text-[#a3a3a3] focus:border-[#131313] focus:ring-2 focus:ring-[#131313]/10"
      />
    </label>
  );
}

// ── 상태 칩 ────────────────────────────────────────────────
//    ok 완료 · warn 대기 · bad 취소/환불/경고 · info 안내 · neutral 그 밖 · ink 강조
const CHIP: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-[#e91e3f]/[0.08] text-[#d01634]",
  info: "bg-sky-50 text-sky-700",
  neutral: "bg-[#f2f2f2] text-[#5a5a5a]",
  ink: "bg-[#131313] text-white",
};
export function StatusChip({ tone = "neutral", children, className = "" }: { tone?: "ok" | "warn" | "bad" | "info" | "neutral" | "ink"; children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center h-6 px-2 rounded-full text-[11px] font-black whitespace-nowrap ${CHIP[tone] || CHIP.neutral} ${className}`}>{children}</span>;
}

// ── 표 ─────────────────────────────────────────────────────
//    PC 는 전체 폭 표, 모바일(md 미만)은 줄 카드. onRowClick 이 있으면 줄을 눌러 상세를 연다.
export type Column<T> = {
  key: string;
  label: React.ReactNode;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string; // 폭 등 (예: "w-24")
  mobile?: "title" | "meta" | "hide"; // 모바일 줄 카드에서의 자리 — 기본 meta
  wrap?: boolean; // 긴 글(메모 · 설명) 칸만 줄바꿈 허용 — 기본은 한 줄(짧은 칸이 두 줄로 꺾이지 않게)
};
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  empty = "항목이 없습니다.",
  className = "",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  empty?: React.ReactNode;
  className?: string;
}) {
  if (rows.length === 0) return <EmptyRow>{empty}</EmptyRow>;
  const al = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");
  const titleCols = columns.filter((c) => c.mobile === "title");
  const metaCols = columns.filter((c) => c.mobile !== "title" && c.mobile !== "hide");
  return (
    <div className={`min-w-0 rounded-2xl border border-[#ededed] bg-white overflow-hidden ${className}`}>
      {/* PC */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#ededed] text-[12px] text-[#5a5a5a]">
              {columns.map((c, i) => (
                <th key={c.key} className={`py-2.5 font-bold whitespace-nowrap ${al(c.align)} ${i === 0 ? "pl-5" : "pl-4"} ${i === columns.length - 1 ? "pr-5" : ""} ${c.className || ""}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ededed]">
            {rows.map((r) => {
              const k = rowKey(r);
              const sel = selectedKey != null && selectedKey === k;
              return (
                <tr
                  key={k}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={`${onRowClick ? "cursor-pointer" : ""} ${sel ? "bg-[#f2f2f2]" : onRowClick ? "hover:bg-[#f7f7f7]" : ""} transition-colors`}
                >
                  {columns.map((c, i) => (
                    <td key={c.key} className={`py-3 align-middle ${c.wrap ? "" : "whitespace-nowrap"} ${al(c.align)} ${i === 0 ? "pl-5" : "pl-4"} ${i === columns.length - 1 ? "pr-5" : ""} ${c.className || ""}`}>{c.render(r)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* 모바일 — 줄 카드 */}
      <div className="md:hidden divide-y divide-[#ededed]">
        {rows.map((r) => {
          const k = rowKey(r);
          const sel = selectedKey != null && selectedKey === k;
          const Body = (
            <>
              {titleCols.length > 0 && <div className="flex items-center gap-2 min-w-0 text-[14px] font-bold">{titleCols.map((c) => <span key={c.key} className="min-w-0">{c.render(r)}</span>)}</div>}
              {metaCols.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#5a5a5a]">
                  {metaCols.map((c) => <span key={c.key} className="min-w-0">{c.render(r)}</span>)}
                </div>
              )}
            </>
          );
          return onRowClick ? (
            <button key={k} type="button" onClick={() => onRowClick(r)} className={`block w-full text-left px-4 py-3.5 ${sel ? "bg-[#f2f2f2]" : "active:bg-[#f7f7f7]"}`}>{Body}</button>
          ) : (
            <div key={k} className="px-4 py-3.5">{Body}</div>
          );
        })}
      </div>
    </div>
  );
}

// ── 상세 칸 ────────────────────────────────────────────────
//    목록에서 한 줄을 누르면 PC 는 오른쪽에 붙는 칸(목록은 그대로 보이고 다른 줄을 눌러 바로 바꾼다),
//    모바일은 아래에서 올라오는 판. Esc 로 닫는다. 상세는 펼침이 아니라 팝업으로(관리 영역 원칙).
export function DetailPane({
  open,
  onClose,
  title,
  sub,
  badge,
  children,
  footer,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  sub?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode; // 아래 고정 동작 줄
  width?: number;
}) {
  // 열려 있는 동안 본문(AdminPage)이 오른쪽을 비우도록 폭을 알린다
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.style.setProperty("--admin-pane", `${width}px`);
    return () => { root.style.removeProperty("--admin-pane"); };
  }, [open, width]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const body = (
    <>
      <div className="shrink-0 flex items-start gap-3 px-5 pt-5 pb-4 border-b border-[#ededed]">
        <div className="min-w-0 flex-1">
          {badge && <div className="mb-2">{badge}</div>}
          <h2 className="text-[18px] font-black tracking-tight leading-snug break-keep">{title}</h2>
          {sub && <p className="mt-1 text-[13px] text-[#5a5a5a] break-keep">{sub}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 w-9 h-9 rounded-full bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="shrink-0 border-t border-[#ededed] px-5 py-3.5 flex flex-wrap items-center gap-2">{footer}</div>}
    </>
  );
  return (
    <>
      {/* PC — 오른쪽 칸 (목록을 가리지 않게 딤 없이) */}
      <aside role="dialog" aria-modal="false" className="hidden md:flex fixed top-0 right-0 bottom-0 z-[60] flex-col bg-white border-l border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313]" style={{ width }}>
        {body}
      </aside>
      {/* 모바일 — 아래에서 올라오는 판 */}
      <div className="md:hidden fixed inset-0 z-[120] flex items-end bg-black/40" onClick={onClose}>
        <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full max-h-[88dvh] flex flex-col rounded-t-2xl bg-white text-[#131313] pb-[env(safe-area-inset-bottom)]">
          {body}
        </div>
      </div>
    </>
  );
}

// 상세 칸 안의 이름 · 값 줄
export function DefRow({ k, children }: { k: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2.5 border-b border-[#ededed] last:border-b-0 text-[13px]">
      <dt className="w-24 shrink-0 text-[#5a5a5a]">{k}</dt>
      <dd className="min-w-0 flex-1 font-bold break-words">{children}</dd>
    </div>
  );
}

// ── 숫자 칸 줄(대시보드 · 요약) ────────────────────────────
export function StatRow({ items, className = "" }: { items: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: "bad" | "ok" }[]; className?: string }) {
  return (
    // 칸 사이 선은 1px 틈으로 — 2열(모바일) · 4열(PC)에서 모두 선이 한 겹으로 맞는다
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-px bg-[#ededed] rounded-2xl border border-[#ededed] overflow-hidden ${className}`}>
      {items.map((it, i) => (
        <div key={i} className="px-5 py-4 bg-white min-w-0">
          <p className="text-[12px] font-bold text-[#5a5a5a]">{it.label}</p>
          <p className={`mt-1.5 text-[24px] font-black tracking-[-0.02em] tabular-nums leading-none ${it.tone === "bad" ? "text-[#d01634]" : it.tone === "ok" ? "text-emerald-700" : ""}`}>{it.value}</p>
          {it.sub && <p className="mt-1.5 text-[12px] text-[#5a5a5a] truncate">{it.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ── 목록 빈 상태 · 껍데기 (옛 이름 유지) ───────────────────
export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="py-12 text-center text-[13px] text-[#5a5a5a] rounded-2xl border border-dashed border-[#e0e0e0]">{children}</div>;
}
export function ListFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-[#ededed] bg-white divide-y divide-[#ededed] overflow-hidden ${className}`}>{children}</div>;
}
// 좁은 화면에서 표가 넘칠 때 표만 가로로 스크롤
export function TableScroll({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto no-bar">{children}</div>;
}

// ── 결과 알림 모달 ─────────────────────────────────────────
//    notify() 로 띄우고, noticeEl 을 페이지 맨 끝에 한 번 렌더한다.
//    관리자 화면은 결과를 놓치면 안 되는 조작이 많아 토스트가 아니라 모달을 쓴다.
export function useNotice() {
  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false });
  const notify = useCallback((message: string, isError = false) => setPopup({ isOpen: true, message, isError }), []);
  const close = useCallback(() => setPopup((p) => ({ ...p, isOpen: false })), []);
  const noticeEl = popup.isOpen ? (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4 overlay-in" onClick={close}>
      <div role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="bg-white border border-[#ededed] rounded-2xl w-full max-w-sm p-6 shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313]">
        <p className={`text-[12px] font-black ${popup.isError ? "text-[#d01634]" : "text-emerald-700"}`}>{popup.isError ? "오류" : "완료"}</p>
        <p className="mt-2 text-[14px] leading-relaxed break-keep whitespace-pre-line">{popup.message}</p>
        <div className="mt-6 flex justify-end"><Btn onClick={close} autoFocus>확인</Btn></div>
      </div>
    </div>
  ) : null;
  return { notify, noticeEl, close };
}

// ── 확인 모달 ──────────────────────────────────────────────
//    되돌리기 어려운 조작 앞에 세운다.
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
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4 overlay-in" onClick={busy ? undefined : onCancel}>
      <div role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="bg-white border border-[#ededed] rounded-2xl w-full max-w-sm p-6 shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313]">
        <h2 className="text-[17px] font-black tracking-tight">{title}</h2>
        {body && <div className="mt-2 text-[13px] text-[#5a5a5a] leading-relaxed break-keep">{body}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Btn variant="ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</Btn>
          <Btn variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>{busy ? "처리 중…" : confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

// ── 권한 가드 ──────────────────────────────────────────────
//    ⚠️ 화면을 가리는 장치일 뿐이다. 실제 방어는 서버(API)에서 getServerSession + isAdminName 으로.
export function useAdminGuard() {
  const { data: session, status } = useSession();
  const isAdmin = status === "authenticated" && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);
  const gate =
    status === "loading" ? (
      <div className="flex-1 min-h-[60vh] flex items-center justify-center text-[13px] text-[#8a8a8a] bg-white">불러오는 중…</div>
    ) : !isAdmin ? (
      <main className="flex-1 w-full max-w-sm mx-auto px-6 py-40 text-center flex flex-col justify-center bg-white">
        <h2 className="text-[20px] font-black text-[#131313] mb-2">권한 없음</h2>
        <p className="text-[#5a5a5a] text-[14px] mb-6">관리자 권한이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full h-11 bg-[#5865F2] hover:bg-[#4752C4] text-white text-[14px] font-bold rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]/40">
          디스코드 로그인
        </button>
      </main>
    ) : null;
  return { session, status, isAdmin, gate };
}
