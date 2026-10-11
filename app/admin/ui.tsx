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

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ADMIN_USERS } from "@/lib/admins";
import { pickRowTarget, rowTargets, isNoopTarget, dropOf } from "@/lib/groupedDrop";
import type { DropLine, DropTarget } from "@/lib/groupedDrop";
import { openLogin } from "../components/LoginPrompt";

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
  disabledValues,
}: {
  options: SegOption[];
  value: string;
  onChange?: (v: string) => void;
  hrefOf?: (v: string) => string;
  className?: string;
  disabled?: boolean;
  // 📌 지금 못 고르는 보기 — 흐리게만 그린다(폭 · 칸 수 그대로라 줄이 흔들리지 않는다). 눌림은 onChange 로 그대로 가서 화면이 이유를 알린다
  disabledValues?: string[];
}) {
  return (
    <div className={`inline-flex max-w-full overflow-x-auto no-bar p-1 rounded-full bg-[#f2f2f2] ${disabled ? "opacity-50 pointer-events-none" : ""} ${className}`} role="tablist">
      {options.map((o) => {
        const on = value === o.v;
        const off = !on && !!disabledValues?.includes(o.v);
        const cls = `shrink-0 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${on ? "bg-white text-[#131313] ring-1 ring-black/[0.06]" : off ? "text-[#5a5a5a] opacity-40 cursor-default" : "text-[#5a5a5a] hover:text-[#131313]"}`;
        const inner = (
          <>
            {o.l}
            {o.n != null && <span className={`text-[12px] tabular-nums ${on ? "text-[#8a8a8a]" : "text-[#a3a3a3]"}`}>{o.n}</span>}
          </>
        );
        return hrefOf ? (
          <Link key={o.v} href={hrefOf(o.v)} scroll={false} role="tab" aria-selected={on} className={cls}>{inner}</Link>
        ) : (
          <button key={o.v} type="button" role="tab" aria-selected={on} aria-disabled={off || undefined} onClick={() => onChange?.(o.v)} className={cls}>{inner}</button>
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

// ── 상태 따라 바뀌는 글자 ──────────────────────────────────
//    📌 "저장" ↔ "저장 중…"처럼 누르면 글자가 바뀌는 단추 · 이름 — 두 글자를 한 칸에 겹쳐 두고 긴 쪽 폭을 늘 잡는다.
//       글자 수가 달라 단추 폭이 줄었다 늘며 옆 단추 · 입력칸이 밀리던 것. 안 보이는 쪽은 자리만(invisible)
//       ⚠ 평소 글자(children)가 바뀐 글자(to)보다 길거나 같을 때만 쓴다 — "저장"처럼 짧으면 평소 단추가 넓어져 모습이 바뀐다(반려)
//       <Btn><SwapLabel swap={saving} to="연결 중…">티어 역할 연결</SwapLabel></Btn>
export function SwapLabel({ swap, to, children, align = "center" }: { swap: boolean; to: React.ReactNode; children: React.ReactNode; align?: "center" | "end" }) {
  const cell = "col-start-1 row-start-1";
  return (
    <span className={`inline-grid ${align === "end" ? "justify-items-end" : "justify-items-center"}`}>
      <span className={`${cell} ${swap ? "invisible" : ""}`} aria-hidden={swap || undefined}>{children}</span>
      <span className={`${cell} ${swap ? "" : "invisible"}`} aria-hidden={!swap || undefined}>{to}</span>
    </span>
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
      <style>{`@media (min-width: 768px) { .admin-savebar { padding-right: calc(2rem + var(--admin-pane, 0px)); } }`}</style>
      <div className="admin-savebar flex items-center gap-3 px-4 md:px-8 min-h-16 py-3">
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

// ── 아래 띠(고른 것에 하는 일) ──────────────────────────────
//    📌 여러 줄을 골라 한 번에 하는 일(상점 관리 › 아이템 그룹 지정 등)의 단추 줄 — 그 모드인 동안 화면 아래에 붙어
//       스크롤 위치와 상관없이 보인다(2026-10-11 운영자 "한참 아래로 내려갔다가 위에 와서 옮기기 버튼을 눌러야 한다").
//       SaveBar 와 같은 틀 — AdminPage footer 로 넘긴다. PC 는 본문 폭(왼쪽 메뉴 · 상세 칸을 피한다), 모바일은 하단 독 위에 뜬 판.
//       흐름 안에 붙어(sticky) 목록 맨 끝까지 내리면 마지막 줄 아래에 선다(가리지 않는다).
//       제 높이를 --admin-bar 로 알린다 — 토스트(useToast)가 그만큼 위에 뜬다(띠와 겹치지 않게)
export function ActionBar({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const put = () => root.style.setProperty("--admin-bar", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    put();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(put);
    ro?.observe(el);
    return () => { ro?.disconnect(); root.style.removeProperty("--admin-bar"); };
  }, []);
  return (
    <div ref={ref} className="sticky bottom-[84px] md:bottom-0 z-30 mx-3 md:mx-0 mb-3 md:mb-0 rounded-2xl md:rounded-none border md:border-x-0 md:border-b-0 border-[#ededed] bg-white shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] md:shadow-none">
      <style>{`@media (min-width: 768px) { .admin-actionbar { padding-right: calc(2rem + var(--admin-pane, 0px)); } }`}</style>
      <div className="admin-actionbar px-4 md:px-8 py-3">{children}</div>
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
// ── 끌어서 순서 바꾸기 ─────────────────────────────────────
//    DataTable 에 onReorder 를 주면 줄 앞에 손잡이가 붙는다(늘 켜짐 — 따로 '순서 바꾸기' 모드가 없다, 2026-10-11 운영자).
//    손잡이를 끌어 놓으면 새 순서(키 배열)를 올려 준다. 줄 누르기(onRowClick)와 함께 쓴다 — 손잡이 누르기는 줄로 가지 않는다.
//    마우스 · 터치 모두 Pointer Events. 손잡이만 touch-action:none 이라 모바일에서도 목록 스크롤은 그대로 된다.
//    손잡이에 포커스를 두고 ↑ ↓ 로도 한 칸씩 옮긴다. 화면 위 · 아래 끝으로 끌면 페이지가 따라 내려간다(autoScroll — 고정 창 안 목록은 끈다).
//    📌 칸(seg) — 같은 칸 줄끼리만 옮긴다(묶음 표에서 그룹 안 · 단위(그룹 덩어리 · 그룹 없는 줄)끼리). 줄에 data-drag-row + data-drag-seg, 감싼 틀에 data-drag-list
//       줄(data-drag-row)은 여러 줄을 감싼 틀이어도 된다(묶음 표의 덩어리 = <tbody> 하나) — 재는 건 그 틀, 움직이는 건 rowStyle 을 받은 줄들
//    onReorder(새 키 차례, 칸, 옮긴 키) — 옮긴 키의 새 앞 · 뒤 이웃으로 무엇을 어디에 놓았는지 안다(거른 목록에서도)
type DragView = { seg: string; from: number; to: number; dy: number; h: number };
const moveKey = (keys: string[], from: number, to: number) => {
  const next = keys.slice();
  const [k] = next.splice(from, 1);
  next.splice(to, 0, k);
  return next;
};
export function useRowDrag(
  segs: ReadonlyMap<string, string[]>,
  onReorder?: (keys: string[], seg: string, moved: string) => void,
  locked = false,
  { autoScroll = true }: { autoScroll?: boolean } = {},
) {
  const [view, setView] = useState<DragView | null>(null);
  // 끄는 동안의 값 — 매 프레임 바뀌므로 상태가 아니라 ref 에 둔다(자동 스크롤 루프가 읽는다)
  //    armed: 누른 뒤 실제로 6px 넘게 움직였는지 — 화면 끝 손잡이를 누르기만 해도 페이지가 저절로 흘러 줄이 옮겨지지 않게
  const st = useRef<{ seg: string; from: number; to: number; startY: number; lastY: number; downY: number; armed: boolean; tops: number[]; hs: number[]; raf: number } | null>(null);
  // 키보드로 옮긴 뒤 그 줄 손잡이로 포커스를 되돌린다 — 아래로 옮기면 React 가 그 줄을 떼었다 붙여 포커스가 날아간다
  const refocus = useRef<{ list: Element; key: string } | null>(null);
  useLayoutEffect(() => {
    const r = refocus.current;
    if (!r) return;
    refocus.current = null;
    r.list.querySelector<HTMLElement>(`[data-drag-key="${CSS.escape(r.key)}"]`)?.focus();
  });
  const keysOf = (seg: string) => segs.get(seg) || [];

  const compute = useCallback(() => {
    const s = st.current;
    if (!s) return;
    const n = s.tops.length;
    // 칸 밖으로는 못 나가게 — 표 틀(overflow-hidden)에 잘리지 않고, 다른 그룹 머리줄을 넘지 않게
    const minDy = s.tops[0] - s.tops[s.from];
    const maxDy = s.tops[n - 1] + s.hs[n - 1] - (s.tops[s.from] + s.hs[s.from]);
    const dy = Math.min(maxDy, Math.max(minDy, s.lastY + window.scrollY - s.startY));
    const center = s.tops[s.from] + s.hs[s.from] / 2 + dy;
    let to = s.from;
    // 같음도 넘긴 것으로 — 끝 줄까지 끌면 끄는 줄 가운데가 끝 줄 가운데와 딱 같아져(끌 수 있는 끝) 맨 끝 · 맨 앞 자리에 못 닿았다(2026-10-11 검토 — 두 줄 바꾸기도 안 됐다)
    for (let j = s.from + 1; j < n; j++) if (center >= s.tops[j] + s.hs[j] / 2) to = j;
    for (let j = s.from - 1; j >= 0; j--) if (center <= s.tops[j] + s.hs[j] / 2) to = j;
    s.to = to;
    setView({ seg: s.seg, from: s.from, to, dy, h: s.hs[s.from] });
  }, []);

  const tick = useCallback(() => {
    const s = st.current;
    if (!s) return;
    const edge = 72;
    const vh = window.innerHeight;
    const v = !autoScroll || !s.armed ? 0 : s.lastY < edge ? -Math.ceil((edge - s.lastY) / 6) : s.lastY > vh - edge ? Math.ceil((s.lastY - (vh - edge)) / 6) : 0;
    if (v) {
      window.scrollBy(0, v);
      compute();
    }
    s.raf = requestAnimationFrame(tick);
  }, [compute, autoScroll]);

  useEffect(() => () => { if (st.current) cancelAnimationFrame(st.current.raf); }, []);
  // 저장하는 동안(locked) 또는 손잡이가 사라지면 끌던 것을 정리한다 — 잡힌 손잡이가 통째로 빠지면 놓기 이벤트가 오지 않는다
  const enabled = !!onReorder && !locked;
  useEffect(() => {
    if (enabled) return;
    const s = st.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    st.current = null;
    setView(null);
  }, [enabled]);

  const finish = (commit: boolean) => {
    const s = st.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    st.current = null;
    setView(null);
    const keys = keysOf(s.seg);
    if (commit && onReorder && s.to !== s.from && s.from < keys.length && s.to < keys.length) onReorder(moveKey(keys, s.from, s.to), s.seg, keys[s.from]);
  };

  const handleProps = (seg: string, i: number) => ({
    "data-drag-key": keysOf(seg)[i],
    "aria-disabled": locked || undefined,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled || (e.pointerType === "mouse" && e.button !== 0)) return;
      const list = e.currentTarget.closest("[data-drag-list]");
      if (!list) return;
      const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-drag-row]")).filter((r) => (r.dataset.dragSeg ?? "") === seg);
      if (rows.length < 2 || !rows[i]) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const rects = rows.map((r) => r.getBoundingClientRect());
      st.current = { seg, from: i, to: i, startY: e.clientY + window.scrollY, lastY: e.clientY, downY: e.clientY, armed: false, tops: rects.map((r) => r.top + window.scrollY), hs: rects.map((r) => r.height), raf: 0 };
      setView({ seg, from: i, to: i, dy: 0, h: rects[i].height });
      st.current.raf = requestAnimationFrame(tick);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const s = st.current;
      if (!s) return;
      s.lastY = e.clientY;
      if (!s.armed && Math.abs(e.clientY - s.downY) > 6) s.armed = true;
      compute();
    },
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
    onLostPointerCapture: () => finish(true),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      // 줄로 가지 않게 — 줄의 Enter · 화살표 처리와 겹치지 않게
      e.stopPropagation();
      if (!enabled || !onReorder) return;
      const keys = keysOf(seg);
      const to = e.key === "ArrowUp" ? i - 1 : i + 1;
      if (to < 0 || to >= keys.length) return;
      e.preventDefault();
      const list = e.currentTarget.closest("[data-drag-list]");
      if (list) refocus.current = { list, key: keys[i] };
      onReorder(moveKey(keys, i, to), seg, keys[i]);
    },
  });

  // 끄는 줄은 손가락을 따라가고, 그 사이 줄들은 한 칸씩 비켜선다(같은 칸 줄만)
  const rowStyle = (seg: string, i: number): React.CSSProperties | undefined => {
    if (!view || view.seg !== seg) return undefined;
    const { from, to, dy, h } = view;
    if (i === from) return { transform: `translateY(${dy}px)`, position: "relative", zIndex: 2 };
    const ease = "transform 150ms ease";
    if (from < to && i > from && i <= to) return { transform: `translateY(${-h}px)`, transition: ease };
    if (to < from && i >= to && i < from) return { transform: `translateY(${h}px)`, transition: ease };
    return { transform: "translateY(0)", transition: ease };
  };
  const isLifted = (seg: string, i: number) => !!view && view.seg === seg && view.from === i;

  return { dragging: view != null, isLifted, handleProps, rowStyle };
}

// ── 묶음 표 줄 끌기(묶음을 넘나든다) ───────────────────────
//    📌 DataTable 에 groupOf + onRowDrop 를 주면 줄(묶음 안 줄 · 묶지 않은 줄) 손잡이는 이것으로 끈다(2026-10-11 운영자 — "바깥에 있는 걸 바로 그룹에 못 넣는다").
//       묶음 안 두 줄 사이 · 첫 줄 앞 = 그 묶음 안, 접힌 머리줄 위 = 그 덩어리 끝, 단위 사이 = 묶음 밖. 자리 셈은 lib/groupedDrop.js(node 검사).
//       모습은 useRowDrag 와 같다(끄는 줄은 손가락을 따라가고 그 사이 줄들이 비켜선다) + 놓을 묶음의 머리줄을 강조한다(그 묶음에 든다는 표시).
//       줄마다 data-drag-line(번호) — 감싼 틀(data-drag-list) 안에서 잰다. 머리줄 손잡이(덩어리째)는 useRowDrag 단위 칸 그대로.
//       6px 넘게 움직여야 놓기로 친다(누르기만 해도 그룹이 바뀌지 않게). ↑ ↓ 는 놓을 수 있는 자리를 한 칸씩
//    onRowDrop({ moved, group, after, before }) — group 있음: 그 묶음 안(이웃 = 그 묶음 줄 키, 둘 다 null = 덩어리 끝) · "": 단위 사이(이웃 = 단위 키)
export type TableRowDrop = { moved: string; group: string; after: string | null; before: string | null };
type LineView = { from: number; to: number; dy: number; h: number; target: DropTarget | null };
function useLineDrag(lines: DropLine[], onDrop: ((d: TableRowDrop) => void) | undefined, locked: boolean) {
  const [view, setView] = useState<LineView | null>(null);
  const st = useRef<{ from: number; lines: DropLine[]; to: number; target: DropTarget | null; startY: number; lastY: number; downY: number; armed: boolean; tops: number[]; hs: number[]; raf: number } | null>(null);
  const refocus = useRef<{ list: Element; key: string } | null>(null);
  useLayoutEffect(() => {
    const r = refocus.current;
    if (!r) return;
    refocus.current = null;
    r.list.querySelector<HTMLElement>(`[data-drag-key="${CSS.escape(r.key)}"]`)?.focus();
  });

  const compute = useCallback(() => {
    const s = st.current;
    if (!s) return;
    const n = s.tops.length;
    // 표 틀 밖으로는 못 나가게(useRowDrag 와 같다)
    const minDy = s.tops[0] - s.tops[s.from];
    const maxDy = s.tops[n - 1] + s.hs[n - 1] - (s.tops[s.from] + s.hs[s.from]);
    const raw = s.lastY + window.scrollY - s.startY;
    const dy = Math.min(maxDy, Math.max(minDy, raw));
    // over — 끄는 줄이 표 바닥에 닿은 뒤 손가락이 더 내려간 거리(표 아래로 끌어내면 맨 끝 덩어리에서도 빠진다)
    const pick = s.armed ? pickRowTarget(s.lines, s.from, { tops: s.tops, hs: s.hs, c: s.tops[s.from] + s.hs[s.from] / 2 + dy, over: Math.max(0, raw - maxDy) }) : null;
    s.target = pick ? pick.target : null;
    s.to = pick ? pick.to : s.from;
    setView({ from: s.from, to: s.to, dy, h: s.hs[s.from], target: s.target });
  }, []);

  const tick = useCallback(() => {
    const s = st.current;
    if (!s) return;
    const edge = 72;
    const vh = window.innerHeight;
    const v = !s.armed ? 0 : s.lastY < edge ? -Math.ceil((edge - s.lastY) / 6) : s.lastY > vh - edge ? Math.ceil((s.lastY - (vh - edge)) / 6) : 0;
    if (v) {
      window.scrollBy(0, v);
      compute();
    }
    s.raf = requestAnimationFrame(tick);
  }, [compute]);

  useEffect(() => () => { if (st.current) cancelAnimationFrame(st.current.raf); }, []);
  const enabled = !!onDrop && !locked;
  useEffect(() => {
    if (enabled) return;
    const s = st.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    st.current = null;
    setView(null);
  }, [enabled]);

  const finish = (commit: boolean) => {
    const s = st.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    st.current = null;
    setView(null);
    if (commit && onDrop && s.armed && s.target && !isNoopTarget(s.lines, s.from, s.target)) onDrop(dropOf(s.lines, s.from, s.target));
  };

  const handleProps = (i: number) => ({
    "data-drag-key": lines[i]?.key,
    "aria-disabled": locked || undefined,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled || (e.pointerType === "mouse" && e.button !== 0)) return;
      const list = e.currentTarget.closest("[data-drag-list]");
      if (!list) return;
      // 줄 번호 차례로 — 화면에 보이는 줄 모두(머리줄 포함)
      const els: HTMLElement[] = [];
      list.querySelectorAll<HTMLElement>("[data-drag-line]").forEach((el) => { els[Number(el.dataset.dragLine)] = el; });
      if (els.length !== lines.length || lines.length < 2) return;
      for (let k = 0; k < lines.length; k++) if (!els[k]) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const rects = els.map((r) => r.getBoundingClientRect());
      st.current = {
        from: i, lines, to: i, target: null, startY: e.clientY + window.scrollY, lastY: e.clientY, downY: e.clientY, armed: false,
        tops: rects.map((r) => r.top + window.scrollY), hs: rects.map((r) => r.height), raf: 0,
      };
      setView({ from: i, to: i, dy: 0, h: rects[i].height, target: null });
      st.current.raf = requestAnimationFrame(tick);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const s = st.current;
      if (!s) return;
      s.lastY = e.clientY;
      if (!s.armed && Math.abs(e.clientY - s.downY) > 6) s.armed = true;
      compute();
    },
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
    onLostPointerCapture: () => finish(true),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.stopPropagation();
      if (!enabled || !onDrop) return;
      const ts = rowTargets(lines, i);
      const k = ts.findIndex((t) => isNoopTarget(lines, i, t));
      const t = k < 0 ? null : ts[e.key === "ArrowUp" ? k - 1 : k + 1];
      if (!t) return;
      e.preventDefault();
      const list = e.currentTarget.closest("[data-drag-list]");
      if (list) refocus.current = { list, key: lines[i].key };
      onDrop(dropOf(lines, i, t));
    },
  });

  const lineStyle = (i: number): React.CSSProperties | undefined => {
    if (!view) return undefined;
    const { from, to, dy, h } = view;
    if (i === from) return { transform: `translateY(${dy}px)`, position: "relative", zIndex: 2 };
    const ease = "transform 150ms ease";
    if (from < to && i > from && i <= to) return { transform: `translateY(${-h}px)`, transition: ease };
    if (to < from && i >= to && i < from) return { transform: `translateY(${h}px)`, transition: ease };
    return { transform: "translateY(0)", transition: ease };
  };
  const isLifted = (i: number) => !!view && view.from === i;
  // 놓을 묶음(머리줄 강조) — 그 묶음 안 · 접힌 머리줄 위. 묶음 밖이면 null
  const dropGroup = view?.target && view.target.kind !== "out" ? view.target.group : null;

  return { dragging: view != null, handleProps, lineStyle, isLifted, dropGroup };
}

export function DragHandle(props: ReturnType<ReturnType<typeof useRowDrag>["handleProps"]>) {
  return (
    <button
      type="button"
      aria-label="끌어서 순서 바꾸기"
      {...props}
      className="touch-none cursor-grab active:cursor-grabbing aria-disabled:cursor-default aria-disabled:opacity-40 inline-flex items-center justify-center w-8 h-8 -my-1 shrink-0 rounded-lg text-[#8a8a8a] hover:bg-[#f2f2f2] hover:text-[#131313] outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40"
    >
      <svg aria-hidden viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor">
        <circle cx="7.5" cy="5" r="1.5" /><circle cx="12.5" cy="5" r="1.5" />
        <circle cx="7.5" cy="10" r="1.5" /><circle cx="12.5" cy="10" r="1.5" />
        <circle cx="7.5" cy="15" r="1.5" /><circle cx="12.5" cy="15" r="1.5" />
      </svg>
    </button>
  );
}

export type Column<T> = {
  key: string;
  label: React.ReactNode;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string; // 폭 등 (예: "w-24")
  mobile?: "title" | "meta" | "hide"; // 모바일 줄 카드에서의 자리 — 기본 meta
  wrap?: boolean; // 긴 글(메모 · 설명) 칸만 줄바꿈 허용 — 기본은 한 줄(짧은 칸이 두 줄로 꺾이지 않게)
};
// ── 묶음(그룹) 줄 ──────────────────────────────────────────
//    📌 DataTable 에 groupOf 를 주면 같은 키("" 아님)의 줄을 머리줄 하나 아래로 모은다. 머리줄은 그 묶음 첫 줄 자리 — rows 순서 그대로 그린다
//       (목록 순서 = 실제 순서, 2026-10-11 운영자 "이러면 안 되는 거잖아" — 예전엔 저장된 그룹 차례로 위에 모아 실제 순서와 달랐다).
//       부르는 쪽은 같은 묶음 줄을 붙여서 넘긴다(상점 관리 › 아이템 — lib/itemOrder.js 규칙). 떨어져 있으면 첫 줄 자리로 모아 그린다.
//       머리줄(이름 · 개수)을 누르면 펼치고 접는다(openGroups · onToggleGroup). onToggleGroup 이 없으면 모두 펼친 채(검색 중 등).
//       PC 표는 접힌 줄도 높이 0 · 안 보이게 그려 둔다 — 펼칠 때 열 폭이 다시 계산돼 표가 옆으로 흔들리지 않게(운영자가 매우 싫어함).
//       순서 바꾸기(onReorder) — 두 칸:
//         단위 칸 ""        묶음 머리줄(덩어리째 — 키 tableGroupKey(이름)) · 묶지 않은 줄을 단위 사이로(덩어리 한가운데로는 못 들어간다)
//         묶음 칸 "g:<이름>" 그 묶음 안에서만(tableGroupOfSeg 로 이름)
//       단위 하나 = PC 는 <tbody> 하나(끌 때 재는 틀 — 움직이는 건 그 안 줄들), 모바일은 <div> 하나.
//       onRowDrop 을 주면 줄(묶음 안 줄 · 묶지 않은 줄)은 묶음을 넘나든다(useLineDrag) — 머리줄(덩어리째)만 단위 칸(onReorder) 그대로.
//       groupLead — 머리줄 첫 열 자리에 그릴 것(그룹 지정의 묶음째 고르기 칸). 머리줄 이름 칸은 그 다음 열부터
//       📌 sectionOf(묶음 키 → 상위 이름) — 상위 그룹(그룹의 그룹, 2026-10-11). 같은 상위가 이어진 묶음들 위에 상위 머리줄 하나(끌기 없음 — 누르면 접고 편다).
//          부르는 쪽이 같은 상위의 묶음을 붙여 넘긴다(lib/itemOrder.js nestParents). 접힌 상위의 묶음은 머리줄까지 숨긴다(PC 는 줄 높이 0 — 열 폭 그대로).
//          closedSections: 접은 상위(기본 펼침), onToggleSection 이 없으면 늘 펼친 채(검색 중 등)
type RowEntry<T> = { kind: "row"; row: T; seg: string; si: number; inGroup: boolean; hidden: boolean; own: boolean; li: number };
type GroupEntry = { kind: "group"; key: string; count: number; open: boolean; li: number; hideHead: boolean };
type TableEntry<T> = RowEntry<T> | GroupEntry;
// own: 줄 자체가 끄는 줄(data-drag-row)인가 — 묶음 표의 묶지 않은 줄은 감싼 단위 틀이 끄는 줄이라 false
// li: 보이는 줄 번호(묶음을 넘나드는 끌기 — data-drag-line). 접힌 묶음의 줄 · 묶지 않은 표는 -1
// sec: 그 단위의 상위 그룹("" = 없음)
type TableUnit<T> = { key: string; ui: number; sec: string; entries: TableEntry<T>[] };
function GroupChevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={`w-4 h-4 shrink-0 text-[#8a8a8a] transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5l5 5-5 5" />
    </svg>
  );
}
const LOOSE_SEG = "";
const groupSeg = (g: string) => `g:${g}`;
const GROUP_KEY_PREFIX = "group:";
// 단위 칸에서 묶음 머리줄의 키 · 그 키의 묶음 이름(묶지 않은 줄 키면 null) · 묶음 칸의 이름(단위 칸이면 null)
export const tableGroupKey = (g: string) => `${GROUP_KEY_PREFIX}${g}`;
export const tableGroupOfKey = (key: string) => (key.startsWith(GROUP_KEY_PREFIX) ? key.slice(GROUP_KEY_PREFIX.length) : null);
export const tableGroupOfSeg = (seg: string) => (seg.startsWith("g:") ? seg.slice(2) : null);

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  selectedKeys,
  empty = "항목이 없습니다.",
  className = "",
  onReorder,
  reorderLocked = false,
  groupOf,
  openGroups,
  onToggleGroup,
  onRowDrop,
  groupLead,
  sectionOf,
  closedSections,
  onToggleSection,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  selectedKeys?: ReadonlySet<string>; // 여러 줄 고르기(그룹 지정 등) — 고른 줄을 selectedKey 와 같은 바탕으로
  empty?: React.ReactNode;
  className?: string;
  onReorder?: (keys: string[], seg: string, moved: string) => void; // 주면 줄 앞 손잡이로 끌어 옮긴다 — keys: 그 칸 줄들의 새 순서, moved: 옮긴 키
  reorderLocked?: boolean; // 저장하는 동안 — 손잡이는 그대로 두고(표가 흔들리지 않게) 끌기만 막는다
  groupOf?: (row: T) => string; // 묶음 키 — "" 이면 묶지 않는 그냥 줄(위 묶음 줄 설명)
  openGroups?: ReadonlySet<string>; // 펼친 묶음 키
  onToggleGroup?: (key: string) => void;
  onRowDrop?: (drop: TableRowDrop) => void; // 묶음 표 · onReorder 와 함께 — 줄 하나를 묶음 안 · 밖 · 다른 묶음으로(useLineDrag)
  groupLead?: (key: string, rows: T[]) => React.ReactNode; // 머리줄 첫 열 자리 — rows: 그 묶음의 (보이는) 줄
  sectionOf?: (groupKey: string) => string; // 묶음의 상위 그룹("" = 없음) — 위 상위 머리줄 설명
  closedSections?: ReadonlySet<string>; // 접은 상위
  onToggleSection?: (section: string) => void;
}) {
  const sortable = !!onReorder;
  // 그릴 차례 — 묶지 않으면 줄 그대로(flat). 묶으면 단위들(머리줄 + 묶음 줄들(접혔으면 hidden) · 묶지 않은 줄 하나)
  const grouped = !!groupOf;
  // 묶음을 넘나드는 줄 끌기 — 보이는 줄(머리줄 포함)을 위에서부터 lines 로
  const cross = sortable && grouped && !!onRowDrop;
  const segs = new Map<string, string[]>();
  const segPush = (seg: string, key: string) => {
    let list = segs.get(seg);
    if (!list) { list = []; segs.set(seg, list); }
    list.push(key);
    return list.length - 1;
  };
  const lines: DropLine[] = [];
  const linePush = (l: DropLine) => lines.push(l) - 1;
  const flat: RowEntry<T>[] = [];
  const units: TableUnit<T>[] = [];
  const members = new Map<string, T[]>();
  // 상위 머리줄의 수 — 든 묶음 수 · 줄 수
  const secInfo = new Map<string, { groups: number; rows: number }>();
  if (!groupOf) rows.forEach((row) => flat.push({ kind: "row", row, seg: LOOSE_SEG, si: segPush(LOOSE_SEG, rowKey(row)), inGroup: false, hidden: false, own: true, li: -1 }));
  else {
    for (const row of rows) {
      const g = groupOf(row) || "";
      if (!g) continue;
      const at = members.get(g);
      if (at) at.push(row);
      else members.set(g, [row]);
    }
    const placed = new Set<string>();
    for (const row of rows) {
      const g = groupOf(row) || "";
      if (!g) {
        const k = rowKey(row);
        const ui = segPush(LOOSE_SEG, k);
        const li = linePush({ key: k, head: false, group: "", open: false, unit: k });
        units.push({ key: k, ui, sec: "", entries: [{ kind: "row", row, seg: LOOSE_SEG, si: ui, inGroup: false, hidden: false, own: false, li }] });
        continue;
      }
      if (placed.has(g)) continue;
      placed.add(g);
      const list = members.get(g) || [];
      // 접은 상위 안의 묶음 — 머리줄까지 숨기고(끌 줄도 아님) 줄은 접힌 묶음처럼
      const sec = sectionOf ? sectionOf(g) || "" : "";
      const shut = !!sec && !!onToggleSection && !!closedSections?.has(sec);
      const open = !shut && (!onToggleGroup || !!openGroups?.has(g));
      const gk = tableGroupKey(g);
      const entries: TableEntry<T>[] = [{ kind: "group", key: g, count: list.length, open, hideHead: shut, li: shut ? -1 : linePush({ key: gk, head: true, group: g, open, unit: gk }) }];
      for (const m of list) {
        const mk = rowKey(m);
        const li = open ? linePush({ key: mk, head: false, group: g, open: false, unit: gk }) : -1;
        entries.push({ kind: "row", row: m, seg: groupSeg(g), si: segPush(groupSeg(g), mk), inGroup: true, hidden: !open, own: true, li });
      }
      if (sec) {
        const si = secInfo.get(sec) || { groups: 0, rows: 0 };
        secInfo.set(sec, { groups: si.groups + 1, rows: si.rows + list.length });
      }
      units.push({ key: gk, ui: segPush(LOOSE_SEG, gk), sec, entries });
    }
  }
  const dnd = useRowDrag(segs, onReorder, reorderLocked);
  const ld = useLineDrag(lines, cross ? onRowDrop : undefined, reorderLocked);
  if (rows.length === 0) return <EmptyRow>{empty}</EmptyRow>;
  const liftCls = "bg-white shadow-[0_14px_30px_-14px_rgba(0,0,0,0.35)]";
  const al = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");
  const titleCols = columns.filter((c) => c.mobile === "title");
  const metaCols = columns.filter((c) => c.mobile !== "title" && c.mobile !== "hide");
  const isSel = (k: string) => (selectedKey != null && selectedKey === k) || !!selectedKeys?.has(k);
  // 머리줄 안쪽 — 펼침 화살표 · 이름 · 개수
  const groupHead = (e: { key: string; count: number; open: boolean }) => (
    <>
      <GroupChevron open={e.open} />
      <span className="min-w-0 truncate font-bold text-[#131313]">{e.key}</span>
      <StatusChip className="shrink-0 tabular-nums">{e.count}</StatusChip>
    </>
  );
  const headCls = "w-full flex items-center gap-2 text-left outline-none";
  // 상위 머리줄 — 같은 상위가 이어진 첫 단위 앞에 하나(끌기 없음 · 누르면 접고 편다). 회색 띠 · 겹친 폴더 · 이름 · 「그룹 N」 · 줄 수
  const secStart = (k: number) => !!units[k]?.sec && (k === 0 || units[k - 1].sec !== units[k].sec);
  const sectionBody = (sec: string) => {
    const info = secInfo.get(sec) || { groups: 0, rows: 0 };
    const open = !onToggleSection || !closedSections?.has(sec);
    return (
      <>
        <GroupChevron open={open} />
        <svg aria-hidden viewBox="0 0 20 20" className="w-4 h-4 shrink-0 text-[#5a5a5a]" fill="none" stroke="currentColor" strokeWidth={1.7}>
          <path strokeLinejoin="round" d="M2.5 6.5V15a1 1 0 001 1h11M5 4.5h3l1.5 1.5H16a1 1 0 011 1V12a1 1 0 01-1 1H6a1 1 0 01-1-1V4.5z" />
        </svg>
        <span className="min-w-0 truncate font-black text-[#131313]">{sec}</span>
        <StatusChip className="shrink-0 tabular-nums">그룹 {info.groups}</StatusChip>
        <span className="shrink-0 text-[12px] font-bold text-[#8a8a8a] tabular-nums">{info.rows}</span>
      </>
    );
  };
  const sectionToggle = (sec: string, cls: string) =>
    onToggleSection ? (
      <button type="button" onClick={() => onToggleSection(sec)} aria-expanded={!closedSections?.has(sec)} className={`${headCls} ${cls} hover:bg-[#f0f0f0] focus-visible:bg-[#ebebeb]`}>{sectionBody(sec)}</button>
    ) : (
      <div className={`${headCls} ${cls}`}>{sectionBody(sec)}</div>
    );
  // 첫 칸 들여쓰기 — 묶음 안 줄은 머리줄 이름 글자와 맞춘다(왼쪽 여백 20 + 화살표 16 + 틈 8). 손잡이가 있으면 머리줄도 손잡이 칸 뒤에서 시작한다
  const firstPad = (inGroup: boolean) => (inGroup ? "pl-11" : "pl-5");
  // 📌 앞 고르기 칸(groupLead — 그룹 지정 모드의 첫 열)이 있으면 그 칸은 모든 줄이 같은 자리(pl-5), 묶음 들여쓰기는 다음 칸(이름)이 받는다 —
  //    머리줄 이름 글자와 맞춘다(pl-4 + 화살표 16 + 틈 8 = pl-10). 예전엔 고르기 칸이 들여쓰기(pl-11)를 받아 묶음 안 줄의 고르기 칸이 24px 밀리고,
  //    그 칸 폭이 넓어져(접힌 줄도 폭을 잡는다) 모든 줄 · 머리의 이름 칸이 그만큼 오른쪽으로 밀렸다(2026-10-11 운영자 — PC)
  const leadCol = !!groupLead && columns.length > 1;
  const padOf = (i: number, inGroup: boolean) => (i === 0 ? (leadCol ? "pl-5" : firstPad(inGroup)) : i === 1 && leadCol && inGroup ? "pl-10" : "pl-4");
  const stop = (ev: React.SyntheticEvent) => ev.stopPropagation();
  // 줄 끌기 — 묶음을 넘나들면(cross) 보이는 줄 번호(li · data-drag-line)로, 아니면 제 칸(seg · data-drag-row — own 인 줄만)으로
  const rowAttrs = (e: RowEntry<T>) => (cross ? { "data-drag-line": e.li } : e.own ? { "data-drag-row": "", "data-drag-seg": e.seg } : {});
  const rowHandle = (e: RowEntry<T>) => (cross ? ld.handleProps(e.li) : dnd.handleProps(e.seg, e.si));
  const rowMove = (e: RowEntry<T>) => (cross ? ld.lineStyle(e.li) : e.own ? dnd.rowStyle(e.seg, e.si) : undefined);
  const rowLifted = (e: RowEntry<T>) => (cross ? ld.isLifted(e.li) : e.own && dnd.isLifted(e.seg, e.si));
  const headAttrs = (e: GroupEntry) => (cross ? { "data-drag-line": e.li } : {});
  // 놓을 묶음 — 그 머리줄을 강조한다(바탕 + 왼쪽 잉크 줄)
  const dropOn = (g: string) => cross && ld.dropGroup === g;
  const dropBar = "shadow-[inset_3px_0_0_#131313]";
  // 머리줄 첫 열 자리(그룹 지정의 묶음째 고르기 칸) — 누르기가 펼치기로 가지 않게
  const leadOf = (g: string) => (groupLead ? groupLead(g, members.get(g) || []) : null);

  // PC 한 줄
  const rowTr = (e: RowEntry<T>, line: string, style: React.CSSProperties | undefined, lifted: boolean) => {
    const r = e.row;
    const k = rowKey(r);
    // 접힌 묶음의 줄 — 열 폭만 잡는다(높이 0 · 안 보임 · 누를 수 없음). 가로 여백은 펼친 줄과 같게
    if (e.hidden) {
      return (
        <tr key={k} aria-hidden>
          {sortable && <td className="p-0 w-10 pl-3" />}
          {columns.map((c, i) => (
            <td key={c.key} className={`p-0 ${c.wrap ? "" : "whitespace-nowrap"} ${padOf(i, true)} ${i === columns.length - 1 ? "pr-5" : ""} ${c.className || ""}`}>
              <div className="h-0 overflow-hidden invisible">{c.render(r)}</div>
            </td>
          ))}
        </tr>
      );
    }
    const sel = isSel(k);
    return (
      <tr
        key={k}
        {...rowAttrs(e)}
        style={style}
        onClick={onRowClick ? () => onRowClick(r) : undefined}
        tabIndex={onRowClick ? 0 : undefined}
        aria-selected={onRowClick ? sel : undefined}
        onKeyDown={onRowClick ? (ev) => { if (ev.target !== ev.currentTarget) return; if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onRowClick(r); } } : undefined}
        className={`${line} ${onRowClick ? "cursor-pointer outline-none focus-visible:bg-[#f2f2f2] focus-visible:shadow-[inset_3px_0_0_#131313]" : ""} ${sel ? "bg-[#f2f2f2]" : onRowClick ? "hover:bg-[#f7f7f7]" : ""} ${lifted ? liftCls : ""} transition-colors`}
      >
        {/* 손잡이 칸 — 손잡이 옆을 잘못 눌러도 상세 칸이 열리지 않게 칸째로 누르기를 막는다 */}
        {sortable && <td className="w-10 pl-3 py-3 align-middle cursor-default" onClick={stop}><DragHandle {...rowHandle(e)} /></td>}
        {columns.map((c, i) => (
          <td key={c.key} className={`py-3 align-middle ${c.wrap ? "" : "whitespace-nowrap"} ${al(c.align)} ${padOf(i, e.inGroup)} ${i === columns.length - 1 ? "pr-5" : ""} ${c.className || ""}`}>{c.render(r)}</td>
        ))}
      </tr>
    );
  };
  // PC 머리줄 — 손잡이(덩어리째 끌기) + 누르면 펼치고 접는 이름 칸. groupLead 가 있으면 첫 열 자리에 그것, 이름 칸은 둘째 열부터
  const headTr = (e: GroupEntry, ui: number, line: string, style: React.CSSProperties | undefined, lifted: boolean) => {
    const lead = columns.length > 1 ? leadOf(e.key) : null;
    const on = dropOn(e.key);
    const toggle = (pad: string) =>
      onToggleGroup ? (
        <button type="button" onClick={() => onToggleGroup(e.key)} aria-expanded={e.open} className={`${headCls} ${pad} py-3 hover:bg-[#f7f7f7] focus-visible:bg-[#f2f2f2]`}>{groupHead(e)}</button>
      ) : (
        <div className={`${headCls} ${pad} py-3`}>{groupHead(e)}</div>
      );
    return (
      <tr key={`group:${e.key}`} {...headAttrs(e)} style={style} className={`${line} ${on ? "bg-[#f2f2f2]" : ""} ${lifted ? liftCls : ""}`}>
        {sortable && <td className={`w-10 pl-3 py-3 align-middle cursor-default ${on ? dropBar : ""}`}><DragHandle {...dnd.handleProps(LOOSE_SEG, ui)} /></td>}
        {lead != null ? (
          <>
            <td className={`py-3 align-middle whitespace-nowrap pl-5 ${on && !sortable ? dropBar : ""} ${columns[0].className || ""}`} onClick={stop}>{lead}</td>
            <td colSpan={columns.length - 1} className="p-0">{toggle("pl-4 pr-5")}</td>
          </>
        ) : (
          <td colSpan={columns.length} className={`p-0 ${on && !sortable ? dropBar : ""}`}>{toggle("pl-5 pr-5")}</td>
        )}
      </tr>
    );
  };

  // 모바일 한 줄
  const rowCard = (e: RowEntry<T>) => {
    // 모바일은 열 폭이 없으니 접힌 줄은 그리지 않는다
    if (e.hidden) return null;
    const r = e.row;
    const k = rowKey(r);
    const sel = isSel(k);
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
    if (sortable) {
      // 손잡이(머리줄 손잡이 자리) + 누르는 몸통. 묶음 안 줄은 몸통을 머리줄 이름 글자에 맞춰 들인다(여백 32 + 손잡이 32 + 틈 8)
      return (
        <div key={k} {...rowAttrs(e)} style={rowMove(e)}
          className={`flex items-center gap-2 ${e.inGroup ? "pl-8" : "pl-2"} ${sel ? "bg-[#f2f2f2]" : "bg-white"} ${rowLifted(e) ? liftCls : ""}`}>
          <DragHandle {...rowHandle(e)} />
          {onRowClick ? (
            <button type="button" onClick={() => onRowClick(r)} className={`min-w-0 flex-1 block text-left py-3.5 pr-4 ${sel ? "" : "active:bg-[#f7f7f7]"}`}>{Body}</button>
          ) : (
            <div className="min-w-0 flex-1 py-3.5 pr-4">{Body}</div>
          )}
        </div>
      );
    }
    // 묶음 안 줄은 머리줄 이름 글자에 맞춰 들여 쓴다(여백 16 + 화살표 16 + 틈 8)
    const pad = e.inGroup ? "pl-10 pr-4" : "px-4";
    return onRowClick ? (
      <button key={k} type="button" onClick={() => onRowClick(r)} className={`block w-full text-left ${pad} py-3.5 ${sel ? "bg-[#f2f2f2]" : "active:bg-[#f7f7f7]"}`}>{Body}</button>
    ) : (
      <div key={k} className={`${pad} py-3.5`}>{Body}</div>
    );
  };
  // 모바일 머리줄 — 손잡이가 있으면 줄 손잡이와 같은 자리, 이름 칸은 그 뒤(groupLead 가 있으면 손잡이와 이름 칸 사이)
  const headCard = (e: GroupEntry, ui: number) => {
    const lead = leadOf(e.key);
    const leadEl = lead != null ? <span className="shrink-0 inline-flex" onClick={stop}>{lead}</span> : null;
    if (!sortable) {
      const pad = leadEl ? "min-w-0 flex-1 pr-4" : "px-4";
      const head = onToggleGroup ? (
        <button key={`group:${e.key}`} type="button" onClick={() => onToggleGroup(e.key)} aria-expanded={e.open} className={`${headCls} ${pad} py-3.5 text-[14px] active:bg-[#f7f7f7]`}>{groupHead(e)}</button>
      ) : (
        <div key={`group:${e.key}`} className={`${headCls} ${pad} py-3.5 text-[14px]`}>{groupHead(e)}</div>
      );
      return leadEl ? <div key={`group:${e.key}`} className="flex items-center gap-2 pl-4">{leadEl}{head}</div> : head;
    }
    const on = dropOn(e.key);
    return (
      <div key={`group:${e.key}`} {...headAttrs(e)} style={cross ? ld.lineStyle(e.li) : undefined} className={`flex items-center gap-2 pl-2 ${on ? `bg-[#f2f2f2] ${dropBar}` : "bg-white"}`}>
        <DragHandle {...dnd.handleProps(LOOSE_SEG, ui)} />
        {leadEl}
        {onToggleGroup ? (
          <button type="button" onClick={() => onToggleGroup(e.key)} aria-expanded={e.open} className={`${headCls} min-w-0 flex-1 pr-4 py-3.5 text-[14px] active:bg-[#f7f7f7]`}>{groupHead(e)}</button>
        ) : (
          <div className={`${headCls} min-w-0 flex-1 pr-4 py-3.5 text-[14px]`}>{groupHead(e)}</div>
        )}
      </div>
    );
  };

  // 묶은 표의 줄 위 선 — 첫 줄만 빼고 줄마다(divide-y 대신 — 접힌(높이 0) 줄이 끝에 오면 마지막 보이는 줄 아래 선이 표 테두리와 겹쳐 두 겹이 되던 것)
  let drawn = 0;
  const nextLine = () => (drawn++ > 0 ? "border-t border-[#ededed]" : "");
  return (
    <div className={`min-w-0 rounded-2xl border border-[#ededed] bg-white overflow-hidden ${dnd.dragging || ld.dragging ? "select-none" : ""} ${className}`}>
      {/* PC */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[13px]" data-drag-list={grouped || undefined}>
          <thead>
            <tr className="border-b border-[#ededed] text-[12px] text-[#5a5a5a]">
              {sortable && <th aria-label="순서" className="w-10 pl-3 py-2.5" />}
              {columns.map((c, i) => (
                <th key={c.key} className={`py-2.5 font-bold whitespace-nowrap ${al(c.align)} ${i === 0 ? "pl-5" : "pl-4"} ${i === columns.length - 1 ? "pr-5" : ""} ${c.className || ""}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          {grouped ? (
            // 단위마다 <tbody> — 끌 때 그 틀을 재고, 단위를 끌면 그 안 줄 모두에 같은 이동을 준다
            units.map((u, k) => {
              const us = dnd.rowStyle(LOOSE_SEG, u.ui);
              const ul = dnd.isLifted(LOOSE_SEG, u.ui);
              return (
                <React.Fragment key={`u:${u.key}`}>
                  {/* 상위 머리줄 — 끄는 단위(data-drag-row)가 아닌 따로 된 틀 */}
                  {secStart(k) && (
                    <tbody>
                      <tr className={`${nextLine()} bg-[#f7f7f7]`}>
                        <td colSpan={columns.length + (sortable ? 1 : 0)} className="p-0">{sectionToggle(u.sec, "pl-5 pr-5 py-2.5")}</td>
                      </tr>
                    </tbody>
                  )}
                  <tbody data-drag-row data-drag-seg={LOOSE_SEG}>
                    {u.entries.map((e) => {
                      if (e.kind === "group") return e.hideHead ? null : headTr(e, u.ui, nextLine(), us ?? (cross ? ld.lineStyle(e.li) : undefined), ul);
                      if (e.hidden) return rowTr(e, "", undefined, false);
                      return rowTr(e, nextLine(), us ?? rowMove(e), ul || rowLifted(e));
                    })}
                  </tbody>
                </React.Fragment>
              );
            })
          ) : (
            <tbody className="divide-y divide-[#ededed]" data-drag-list>
              {flat.map((e) => rowTr(e, "", dnd.rowStyle(e.seg, e.si), dnd.isLifted(e.seg, e.si)))}
            </tbody>
          )}
        </table>
      </div>
      {/* 모바일 — 줄 카드(묶으면 단위마다 틀 하나) */}
      <div className="md:hidden divide-y divide-[#ededed]" data-drag-list>
        {grouped
          ? units.map((u, k) => (
              <React.Fragment key={`u:${u.key}`}>
                {secStart(k) && <div className="bg-[#f7f7f7]">{sectionToggle(u.sec, "px-4 py-3 text-[14px]")}</div>}
                <div data-drag-row data-drag-seg={LOOSE_SEG} style={dnd.rowStyle(LOOSE_SEG, u.ui)}
                  // 접은 상위 안의 묶음 — 틀은 흐름에 두되(끌기가 그 자리를 잰다 — display:none 이면 위치가 0 이 되어 끄는 줄이 접은 상위 너머로 갔다) 높이 0 · 사이 줄 없이
                  className={`divide-y divide-[#ededed] ${dnd.isLifted(LOOSE_SEG, u.ui) ? liftCls : ""} ${u.entries.some((e) => e.kind === "group" && e.hideHead) ? "h-0 overflow-hidden !border-0" : ""}`}>
                  {u.entries.map((e) => (e.kind === "group" ? (e.hideHead ? null : headCard(e, u.ui)) : rowCard(e)))}
                </div>
              </React.Fragment>
            ))
          : flat.map((e) => rowCard(e))}
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
    const onKey = (e: KeyboardEvent) => {
      // 드롭다운이 먼저 받아 닫았으면(preventDefault) 칸은 그대로 — 한 번의 Esc 에 둘이 같이 닫혀 입력이 사라지던 것
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // 칸 위에 다른 덮개(확인 · 알림 · 미리보기 모달)가 떠 있으면 그 창 차례다
      const overlay = Array.from(document.querySelectorAll<HTMLElement>(".fixed.inset-0")).some(
        (el) => !el.closest("[data-detail-pane]") && el.getClientRects().length > 0
      );
      if (overlay) return;
      onClose();
    };
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
      {/* 📌 스크롤바 자리를 늘 잡는다 — 내용이 길어져 스크롤바가 생기면 폭이 줄어 탭 줄 · 칸이 옆으로 밀리던 것(인라인: 이 빌드는 임의 값 클래스 일부가 안 먹는다) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4" style={{ scrollbarGutter: "stable" }}>{children}</div>
      {footer && <div className="shrink-0 border-t border-[#ededed] px-5 py-3.5 flex flex-wrap items-center gap-2">{footer}</div>}
    </>
  );
  return (
    <>
      {/* PC — 오른쪽 칸 (목록을 가리지 않게 딤 없이) */}
      <aside data-detail-pane role="dialog" aria-modal="false" className="hidden md:flex fixed top-0 right-0 bottom-0 z-[60] flex-col bg-white border-l border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313]" style={{ width }}>
        {body}
      </aside>
      {/* 모바일 — 아래에서 올라오는 판 */}
      <div data-detail-pane className="md:hidden fixed inset-0 z-[120] flex items-end bg-black/40" onClick={onClose}>
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

// ── 짧은 결과 알림(토스트) ─────────────────────────────────
//    📌 자주 되풀이하는 가벼운 조작(끌어서 순서 저장 · 그룹 이름 바꾸기 등)은 [확인]을 누르지 않아도 사라지는 한 줄로.
//       놓치면 안 되는 결과 · 실패는 notify()(모달). toastEl 을 페이지 맨 끝에 한 번 렌더한다.
//       모바일은 하단 독 위, 창(z-125) · 확인 모달(z-130)보다 위에 뜬다. 누르기를 가로막지 않는다(pointer-events-none)
//       아래 띠(ActionBar)가 떠 있으면 그 높이(--admin-bar)만큼 위로 — 띠와 겹치지 않게
const TOAST_POS = `.admin-toast { bottom: calc(96px + var(--admin-bar, 0px)); } @media (min-width: 768px) { .admin-toast { bottom: calc(24px + var(--admin-bar, 0px)); } }`;
export function useToast() {
  const [toast, setToast] = useState<{ msg: string; error: boolean; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const show = useCallback((msg: string, isError = false) => {
    setToast({ msg, error: isError, id: Date.now() });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), isError ? 4000 : 2600);
  }, []);
  const toastEl = toast ? (
    <>
      <style>{TOAST_POS}</style>
      <div
        key={toast.id}
        role="status"
        aria-live="polite"
        className={`admin-toast fixed left-1/2 -translate-x-1/2 z-[135] pointer-events-none w-max max-w-[calc(100vw-2rem)] px-5 py-3 rounded-full border text-[13px] font-bold break-keep shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] ${
          toast.error ? "bg-white border-[#e91e3f] text-[#d01634]" : "bg-[#131313] border-[#131313] text-white"
        }`}
      >
        {toast.error ? "⚠ " : "✓ "}
        {toast.msg}
      </div>
    </>
  ) : null;
  return { toast: show, toastEl };
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
  confirmDisabled = false,
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
  confirmDisabled?: boolean; // 아직 고르지 않아 실행할 수 없을 때 — 확인 단추만 잠근다
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
          <Btn variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy || confirmDisabled}>{busy ? "처리 중…" : confirmLabel}</Btn>
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
        <button onClick={() => openLogin()} className="w-full h-11 bg-[#5865F2] hover:bg-[#4752C4] text-white text-[14px] font-bold rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]/40">
          디스코드 로그인
        </button>
      </main>
    ) : null;
  return { session, status, isAdmin, gate };
}
