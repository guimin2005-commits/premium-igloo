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
//
//    2026-10 개편 부품(상점 관리 편의 · 일괄 편집 · 기능 검색):
//      · 여러 개 고르기   useSelection + DataTable/CardGrid selectable + BatchBar(아래 띠) · PickBox(고르기 칸)
//      · 정렬            Column.sortValue — 열 머리 오름 → 내림 → 기본(sortState · onSortChange) · sortRows
//      · 카드 보기        CardGrid + ViewToggle(「표 | 카드」) · useStoredState(보기 · 폭 기억)
//      · 붙는 상세 칸      DetailPane docked — 1280 이상은 목록 옆 열(폭 끌어 바꾸기), 그 아래는 예전 그대로
//      · 거르기          FilterButton(「거르기 · N」 판) · FilterSection · ChoiceChip · ActiveFilters(켠 거르기 칩 줄)
//      · 창 · 알림        FormSheet(입력 창) · useToast · useNotice(둘 다 효과음 포함) · sfxOk / sfxErr / sfxTick
//      · 떠나기 확인      registerLeaveGuard · useLeaveGuard · adminNavigate(코드로 화면을 옮기기 전에 그 화면의 「버리기」 확인을 거친다)
//
//    2026-10-17 상점 관리 정리(승인 시안 .claude/mockups/admin/shop-tidy):
//      · 상세 칸 묶음      DetailPane shaded(회색 바탕) + PaneSection(흰 판 · 머리 줄 · 접기 기억)
//      · 아래 띠          BatchBar(잉크 띠 — 「N개 선택 · 전체 선택 · 선택 해제」 + 자주 쓰는 단추 + 「⋯」) · PendingBar(저장 안 한 수정) · BarStack(둘을 한 덩어리로) · BarBtn
//      · 펼침 메뉴        MenuBtn(「희귀도 ▾」 같은 글자 단추) · MoreMenu(「⋯」) — 화면 위에 뜨는 판(덮개로 친다 · Esc · 바깥 누르기 · ↑ ↓)

import React, { useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ADMIN_USERS } from "@/lib/admins";
import { pickRowTarget, rowTargets, isNoopTarget, dropOf } from "@/lib/groupedDrop";
import type { DropLine, DropTarget } from "@/lib/groupedDrop";
import { playTone } from "@/lib/sfx";
import { openLogin } from "../components/LoginPrompt";

// ── 효과음 ─────────────────────────────────────────────────
//    📌 관리 화면 공용 소리 — 화면마다 따로 만들던 것(시즌 패스 · 봇 메시지 · 명예의 전당)과 같은 음. lib/sfx 의 playTone 하나로 울린다.
//       sfxOk: 저장 · 적용 성공(두 음 올라감) · sfxErr: 실패 · 막힘(낮은 두 음) · sfxTick: 가벼운 바꿈(고르기 · 펼치기 등)
export const sfxOk = () => [660, 880].forEach((f, i) => setTimeout(() => playTone(f, 0.1, "sine", 0.035), i * 80));
export const sfxErr = () => {
  playTone(300, 0.14, "square", 0.035);
  setTimeout(() => playTone(220, 0.2, "square", 0.035), 130);
};
export const sfxTick = () => playTone(740, 0.06, "sine", 0.03);

// ── 화면 폭 · 기억 ─────────────────────────────────────────
//    useMedia("(min-width: 1280px)") — 화면 폭 조건을 그대로 따라간다(서버 렌더에선 false)
export function useMedia(query: string) {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => typeof window !== "undefined" && !!window.matchMedia?.(query).matches, () => false);
}

//    📌 useStoredState(키, 처음 값) — 이 브라우저에만 남는 작은 기억(보기 「표 | 카드」 · 상세 칸 폭 · 펼친 그룹 등).
//       localStorage 를 못 쓰는 창(사생활 보호 · 막힘)에서는 조용히 처음 값으로 — 화면은 그대로 돈다(try/catch).
//       키가 null 이면 기억하지 않는 그냥 상태. 키가 바뀌면 그 키의 값을 다시 읽는다. 저장 이름은 "admin:<키>"
const STORE_PREFIX = "admin:";
function readStored<T>(key: string | null | undefined, fallback: T): T {
  if (!key || typeof window === "undefined") return fallback;
  try {
    const s = window.localStorage.getItem(STORE_PREFIX + key);
    return s == null ? fallback : (JSON.parse(s) as T);
  } catch {
    return fallback;
  }
}
export function useStoredState<T>(key: string | null | undefined, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [st, setSt] = useState(() => ({ key, value: readStored(key, initial) }));
  let cur = st;
  if (st.key !== key) {
    // 키가 바뀌었다 — 그 키의 값으로(렌더 중 조정: 앞 값을 한 번 그리지 않게)
    cur = { key, value: readStored(key, initial) };
    setSt(cur);
  }
  const set = useCallback((v: T | ((prev: T) => T)) => {
    setSt((prev) => {
      const value = typeof v === "function" ? (v as (p: T) => T)(prev.value) : v;
      if (prev.key) {
        try { window.localStorage.setItem(STORE_PREFIX + prev.key, JSON.stringify(value)); } catch {}
      }
      return { key: prev.key, value };
    });
  }, []);
  return [cur.value, set];
}

// 덮개(확인 · 알림 · 창 · 거르기 판)가 떠 있나 — 상세 칸의 Esc · 단축키가 그 창 차례로 양보한다.
//    📌 새 부품(FormSheet · FilterButton 판)은 data-admin-layer 를 단다 — 상세 칸 안에 그려져도 덮개로 친다
const isShown = (el: Element) => el.getClientRects().length > 0;
function overlayOpen() {
  if (typeof document === "undefined") return false;
  return (
    Array.from(document.querySelectorAll<HTMLElement>(".fixed.inset-0")).some((el) => !el.closest("[data-detail-pane]") && isShown(el)) ||
    Array.from(document.querySelectorAll<HTMLElement>("[data-admin-layer]")).some(isShown)
  );
}
// self 위에 다른 덮개가 있나 — z 가 더 높거나, 같은 z 에 문서에서 더 뒤(나중에 뜬 것). self 를 품은 판(조상)은 아래로 친다
function layerAbove(self: HTMLElement | null) {
  if (!self || typeof document === "undefined") return false;
  const zOf = (el: Element) => Number(getComputedStyle(el).zIndex) || 0;
  const z = zOf(self);
  return Array.from(document.querySelectorAll<HTMLElement>(".fixed.inset-0, [data-admin-layer]")).some((el) => {
    if (el === self || el.contains(self) || !isShown(el)) return false;
    const ez = zOf(el);
    return ez > z || (ez === z && !!(self.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
}

// 📌 덮개 누르기로 닫기 — 누름(pointerdown)과 뗌(click)이 둘 다 덮개 자체에서일 때만 닫는다(창 · 판 · 확인 · 알림 모두).
//    창 안 입력칸에서 글자를 긁어 고르다 창 밖에서 손을 떼면 click 이 덮개로 가 창이 닫히고 쓰던 것이 날아가던 것.
//    onClose 가 없으면(처리 중 등) 닫지 않는다. 받은 두 처리기를 덮개 요소에 그대로 펼친다({...backdrop})
// 📌 훅 없이 쓰는 같은 규칙 — 판을 직접 그리는 화면(상점 그룹 · 테마 관리 등)의 어두운 바깥에 {...backdropClose(onClose)}
export const backdropClose = (onClose?: () => void) => ({
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.dataset.down = e.target === e.currentTarget ? "1" : "";
  },
  onClick: (e: React.MouseEvent<HTMLElement>) => {
    const ok = e.currentTarget.dataset.down === "1" && e.target === e.currentTarget;
    e.currentTarget.dataset.down = "";
    if (ok) onClose?.();
  },
});
function useBackdrop(onClose?: () => void) {
  const down = useRef(false);
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      down.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      const ok = down.current && e.target === e.currentTarget;
      down.current = false;
      if (ok) onClose?.();
    },
  };
}

// ── 떠나기 확인(고친 채 다른 화면으로) ─────────────────────
//    📌 고친 것을 들고 있는 화면이 확인 하나를 걸어 두면, 코드로 화면을 옮기는 길(기능 검색 — adminNavigate)이 옮기기 전에 그 확인을 거친다.
//       (2026-10-17 — 기능 검색 결과를 누르면 router.push 로 바로 가 상점 관리 「버리기」 확인을 건너뛰거나, 그 확인이 검색 창 아래에 깔렸다)
//       registerLeaveGuard(fn) — fn(href) 가 true(가도 됨) · false(멈춤) 또는 그 Promise 로 답한다. 돌려준 함수로 뗀다.
//       useLeaveGuard(dirty, ask) — 화면이 떠 있는 동안 걸어 두고, 고친 게 있을 때(dirty)만 ask(href) 를 묻는다(없으면 바로 간다).
//         ask 는 확인 창을 띄운 뒤 Promise 로 답하거나(「버리기」 → true · 「취소」 → false),
//         창의 「버리기」가 직접 옮기게(router.push) 하고 바로 false 를 돌려도 된다.
//       adminNavigate(router, href) — 걸린 확인을 차례로 물은 뒤 router.push. 하나라도 멈추면 가지 않는다(false 를 돌려준다).
//       ⚠ 링크(<a>) 누르기 · 새로 고침은 화면이 따로 막는다(상점 관리 — 문서 click 캡처 · beforeunload). 이건 코드로 옮기는 길이다
export type LeaveGuard = (href: string) => boolean | Promise<boolean>;
const leaveGuards: LeaveGuard[] = [];
export function registerLeaveGuard(fn: LeaveGuard) {
  leaveGuards.push(fn);
  return () => {
    const i = leaveGuards.indexOf(fn);
    if (i >= 0) leaveGuards.splice(i, 1);
  };
}
// 걸린 확인을 차례로 — 하나라도 멈추거나(false) 던지면 멈춘다
export async function confirmLeave(href: string): Promise<boolean> {
  for (const guard of leaveGuards.slice()) {
    let ok = false;
    try {
      ok = await guard(href);
    } catch {
      ok = false;
    }
    if (!ok) return false;
  }
  return true;
}
export function useLeaveGuard(dirty: boolean, ask: (href: string) => boolean | Promise<boolean>) {
  // 걸어 두는 건 한 번 — 묻는 순간의 최신 dirty · ask 를 읽는다(고칠 때마다 떼었다 다시 걸지 않게)
  const live = useRef({ dirty, ask });
  useEffect(() => {
    live.current = { dirty, ask };
  });
  useEffect(() => registerLeaveGuard((href) => (live.current.dirty ? live.current.ask(href) : true)), []);
}
type PushRouter = { push: (href: string, options?: { scroll?: boolean }) => void };
export async function adminNavigate(router: PushRouter, href: string, options?: { scroll?: boolean }): Promise<boolean> {
  if (!(await confirmLeave(href))) return false;
  router.push(href, options);
  return true;
}

// 붙는 상세 칸(DetailPane docked)이 들어갈 자리 — AdminPage 가 본문 오른쪽에 둔다
const DockCtx = React.createContext<HTMLElement | null>(null);

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
  // 📌 붙는 상세 칸 자리 — 본문(+ 아래 띠) 오른쪽 열. 비어 있으면 폭 0 이라 예전 화면 그대로, 1280 미만은 아예 숨는다
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  return (
    <DockCtx.Provider value={dock}>
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
      <div className="flex-1 min-w-0 flex">
        {/* 왼쪽 — 본문 + 아래 띠(SaveBar · ActionBar · BatchBar 는 이 열 폭만 덮는다 — 붙는 상세 칸의 아래 단추를 가리지 않게) */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className={`admin-body flex-1 px-5 md:px-8 py-6 ${bodyClass}`}>{children}</div>
          {footer}
        </div>
        <div ref={setDock} className="hidden xl:block shrink-0 min-w-0" />
      </div>
    </div>
    </DockCtx.Provider>
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
//    📌 칸이 모자라면 줄을 바꿔 감싼다(기본 — 2026-10-17). 한 줄 가로 스크롤(스크롤 막대 숨김)은 마우스로 넘길 수 없어 뒤 보기가 안 보였다.
//       모서리는 20px — 한 줄(높이 40)이면 예전 알약 그대로, 두 줄이면 둥근 판. 줄 사이는 판 안쪽 여백과 같은 4px
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
    <div className={`inline-flex flex-wrap gap-y-1 max-w-full p-1 rounded-[20px] bg-[#f2f2f2] ${disabled ? "opacity-50 pointer-events-none" : ""} ${className}`} role="tablist">
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

// 📌 「표 | 카드」 — 목록 보기 바꾸기(같은 알약 토글). 고른 보기는 useStoredState(`view:<화면>`, "table") 로 화면마다 기억한다
export type ViewMode = "table" | "card";
const VIEW_OPTIONS: SegOption[] = [{ v: "table", l: "표" }, { v: "card", l: "카드" }];
export function ViewToggle({ value, onChange, className = "" }: { value: ViewMode; onChange: (v: ViewMode) => void; className?: string }) {
  return <Segmented options={VIEW_OPTIONS} value={value} onChange={(v) => onChange(v === "card" ? "card" : "table")} className={className} />;
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

// ── 아래 띠 높이 ───────────────────────────────────────────
//    📌 아래 띠(SaveBar · ActionBar · BatchBar)는 떠 있는 동안 제 높이를 --admin-bar 로 알린다 — 토스트(useToast)가 그만큼 위에 뜬다(띠와 겹치지 않게).
//       띠가 둘 떠 있으면 가장 높은 것으로, 하나가 내려가도 남은 띠의 높이가 그대로 남는다. 모두 내려가면 지운다
const barHeights = new Map<object, number>();
const putBarVar = () => {
  if (typeof document === "undefined") return;
  const h = Math.max(0, ...barHeights.values());
  const root = document.documentElement;
  if (h > 0) root.style.setProperty("--admin-bar", `${h}px`);
  else root.style.removeProperty("--admin-bar");
};
//    floatMd — 뜬 띠(BatchBar · PendingBar · BarStack)는 PC 에서 화면 아래와 떨어져 뜬다(그 틈만큼 더 알린다 — 토스트가 띠 위에 바짝 붙지 않게)
function useBarHeight(ref: React.RefObject<HTMLElement | null>, on = true, floatMd = 0) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const key = {};
    const put = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      const gap = h > 0 && floatMd && window.innerWidth >= 768 ? floatMd : 0;
      barHeights.set(key, h + gap);
      putBarVar();
    };
    put();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(put);
    ro?.observe(el);
    if (floatMd) window.addEventListener("resize", put);
    return () => {
      ro?.disconnect();
      if (floatMd) window.removeEventListener("resize", put);
      barHeights.delete(key);
      putBarVar();
    };
  }, [ref, on, floatMd]);
}

// ── 저장 줄 ────────────────────────────────────────────────
//    바뀐 것이 있을 때만 화면 아래에 붙는다. 무엇이 바뀌었는지(changes) · 되돌리기 · 저장.
//    모바일은 하단 독 위에 뜬 판으로. 떠 있는 동안 제 높이를 --admin-bar 로 알린다(위 아래 띠 높이 — 토스트가 그 위에)
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
  const ref = useRef<HTMLDivElement>(null);
  const shown = dirty || !!note;
  useBarHeight(ref, shown);
  if (!shown) return null;
  const list = changes || [];
  return (
    <div ref={ref} className="sticky bottom-[84px] md:bottom-0 z-30 mx-3 md:mx-0 mb-3 md:mb-0 rounded-2xl md:rounded-none border md:border-x-0 md:border-b-0 border-[#ededed] bg-white/95 backdrop-blur-md shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] md:shadow-none">
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
//       제 높이를 --admin-bar 로 알린다 — 토스트(useToast)가 그만큼 위에 뜬다(띠와 겹치지 않게 · 위 아래 띠 높이)
export function ActionBar({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useBarHeight(ref);
  return (
    <div ref={ref} className="sticky bottom-[84px] md:bottom-0 z-30 mx-3 md:mx-0 mb-3 md:mb-0 rounded-2xl md:rounded-none border md:border-x-0 md:border-b-0 border-[#ededed] bg-white shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] md:shadow-none">
      <style>{`@media (min-width: 768px) { .admin-actionbar { padding-right: calc(2rem + var(--admin-pane, 0px)); } }`}</style>
      <div className="admin-actionbar px-4 md:px-8 py-3">{children}</div>
    </div>
  );
}

// ── 뜬 아래 띠(BatchBar · PendingBar · BarStack) ───────────
//    📌 2026-10-17 승인 시안(shop-tidy A) — 목록 열 아래에 뜬 판(16px 모서리 · 그림자). PC 는 목록 좌우 여백(32px)에 맞추고 화면 아래에서 20px 떠 있고,
//       모바일은 하단 독 위(ActionBar 와 같은 자리). 흐름 안에 붙어(sticky) 목록 맨 끝까지 내리면 마지막 줄 아래에 선다.
//       덮는 상세 칸(1280 미만 PC)이 열려 있으면 그 폭만큼 오른쪽을 비운다(--admin-pane). 제 높이 + 뜬 틈을 --admin-bar 로 알린다(토스트가 그 위에).
//    📌 BarStack — 띠 둘(저장 안 한 수정 · 고른 것)을 한 덩어리로 붙여 위아래로 쌓는다(따로 두면 둘 다 같은 자리에 붙어 겹친다).
//       안의 띠는 제자리 붙기를 하지 않고 덩어리가 붙는다. 안이 비면(둘 다 null) 자리도 차지하지 않는다.
//       <AdminPage footer={<BarStack><PendingBar … /><BatchBar … /></BarStack>}>
const FLOAT_GAP_MD = 20;
const FLOAT_CSS = `@media (min-width: 768px) { .admin-floatbar { margin-right: calc(2rem + var(--admin-pane, 0px)); } } .admin-barstack:empty { display: none; }`;
const FLOAT_WRAP = "admin-floatbar sticky bottom-[84px] md:bottom-5 z-30 mx-3 mb-3 md:ml-8 md:mb-5";
const BarStackCtx = React.createContext(false);
function FloatBar({ tone, label, children }: { tone: "ink" | "paper"; label?: string; children: React.ReactNode }) {
  const stacked = useContext(BarStackCtx);
  const ref = useRef<HTMLDivElement>(null);
  useBarHeight(ref, !stacked, FLOAT_GAP_MD);
  const panel = (
    <div
      role="region"
      aria-label={label}
      className={`min-w-0 rounded-2xl border shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] ${tone === "ink" ? "bg-[#131313] border-[#131313] text-white" : "bg-white border-[#131313] text-[#131313]"}`}
    >
      {children}
    </div>
  );
  if (stacked) return panel;
  return (
    <>
      <style>{FLOAT_CSS}</style>
      <div ref={ref} className={FLOAT_WRAP}>{panel}</div>
    </>
  );
}
export function BarStack({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useBarHeight(ref, true, FLOAT_GAP_MD);
  return (
    <BarStackCtx.Provider value>
      <style>{FLOAT_CSS}</style>
      {/* flex-col 의 gap 클래스가 안 먹는 빌드라(메모: tailwind-v4-quirks) 간격은 인라인 */}
      <div ref={ref} className={`admin-barstack ${FLOAT_WRAP} flex flex-col`} style={{ gap: 8 }}>{children}</div>
    </BarStackCtx.Provider>
  );
}

//    📌 잉크 띠 안 단추 — 기본은 옅은 흰 판(자주 쓰는 일), line 은 흰 테만(「전체 선택」 · 「선택 해제」처럼 고르기를 바꾸는 단추). 높이 36
const BAR_BTN = "inline-flex items-center justify-center gap-1.5 h-9 px-3.5 shrink-0 rounded-full text-[12px] font-bold whitespace-nowrap text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40 disabled:cursor-default";
const barBtnCls = (line: boolean) => `${BAR_BTN} ${line ? "bg-transparent ring-1 ring-inset ring-white/35 hover:ring-white/70 disabled:hover:ring-white/35" : "bg-white/10 hover:bg-white/20 disabled:hover:bg-white/10"}`;
export function BarBtn({ line = false, className = "", type = "button", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { line?: boolean }) {
  return <button type={type} {...rest} className={`${barBtnCls(line)} ${className}`} />;
}

// 자릿수가 바뀌어도 폭이 그대로인 수 칸 — 적어도 min 자리(9 로 채운 수)의 폭을 늘 잡는다(tabular-nums)
const holdDigits = (n: number, min = 3) => Number("9".repeat(Math.max(min, String(Math.max(0, Math.trunc(n))).length))).toLocaleString();
function HeldText({ text, ghost, align = "start" }: { text: React.ReactNode; ghost: React.ReactNode; align?: "start" | "center" }) {
  return (
    <span className={`inline-grid tabular-nums ${align === "center" ? "justify-items-center" : "justify-items-start"}`}>
      <span aria-hidden className="col-start-1 row-start-1 invisible">{ghost}</span>
      <span className="col-start-1 row-start-1">{text}</span>
    </span>
  );
}

// ── 고른 것 띠(일괄 편집) ──────────────────────────────────
//    📌 표 · 카드에서 여러 개를 고르면 화면 아래에 뜨는 잉크 띠(2026-10-17 승인 시안 A · B).
//       맨 앞 「N개 선택」 · 「전체 선택 · <total>」(onSelectAll — 다 골랐으면 잠김) · 「선택 해제」(onClear) → 자주 쓰는 단추(children) → 맨 끝 「⋯」(more — 위로 여는 메뉴).
//       앞 칸 셋은 수 자리를 잡아 둬(세 자리 이상) 고른 수 · 전체 수가 바뀌어도 단추가 밀리지 않는다. 고른 게 없으면(count 0) 그리지 않는다.
//       단추는 BarBtn · MenuBtn tone="bar" 로(기존 Btn 도 그대로 놓인다). 단추가 많으면 줄을 바꿔 감싼다(옆 스크롤 없음) — 폰은 앞 칸 셋 한 줄, 그 아래 줄에 단추들 + 「⋯」.
//       <BatchBar count={sel.size} total={rows.length} onSelectAll={…} onClear={sel.clear} more={[{ label: "삭제", danger: true, onSelect: … }]}>
//         <MenuBtn tone="bar" up label="희귀도" items={…} /><BarBtn onClick={…}>표시</BarBtn></BatchBar>
export function BatchBar({
  count,
  children,
  onClear,
  clearLabel = "선택 해제",
  total,
  onSelectAll,
  selectAllLabel = "전체 선택",
  more,
  moreDisabled = false,
  allSelected,
}: {
  count: number;
  children?: React.ReactNode;
  onClear: () => void;
  clearLabel?: string;
  total?: number; // 「전체 선택 · N」의 N(지금 거른 목록 수 등 — 부르는 쪽이 정한다)
  onSelectAll?: () => void;
  selectAllLabel?: string;
  more?: MenuItem[]; // 「⋯」 안 — 이름 바꾸기 · 복제 · 삭제처럼 덜 쓰는 일
  moreDisabled?: boolean;
  // 「전체 선택」을 잠글 때 — 안 주면 count >= total. 거른 목록 밖에 고른 줄이 남아 있으면 수만으로는 못 가린다(부르는 쪽이 「보이는 줄 = 고른 줄」을 넘긴다)
  allSelected?: boolean;
}) {
  if (count <= 0) return null;
  const all = allSelected ?? (total != null && count >= total);
  const wide = Math.max(count, total ?? 0);
  return (
    <FloatBar tone="ink" label="선택한 항목">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-3 md:pl-[18px]">
        {/* 폰 — 앞 칸 셋이 한 줄(w-full), 그 아래 줄에 단추들 + 「⋯」. PC — 한 줄 */}
        <div className={`min-w-0 flex flex-wrap items-center gap-2 ${children ? "w-full md:w-auto" : ""}`}>
          <p className="shrink-0 mr-1 text-[14px] font-black whitespace-nowrap" aria-live="polite">
            <HeldText text={`${count.toLocaleString()}개 선택`} ghost={`${holdDigits(wide)}개 선택`} />
          </p>
          {onSelectAll && total != null && (
            <BarBtn line onClick={onSelectAll} disabled={all} aria-label={`${selectAllLabel} ${total.toLocaleString()}개`}>
              <HeldText align="center" text={`${selectAllLabel} · ${total.toLocaleString()}`} ghost={`${selectAllLabel} · ${holdDigits(total)}`} />
            </BarBtn>
          )}
          <BarBtn line onClick={onClear}>{clearLabel}</BarBtn>
        </div>
        {children && (
          <div className="min-w-0 flex flex-wrap items-center gap-2">
            <span aria-hidden className="hidden md:block w-px h-6 mx-1 bg-white/20" />
            {children}
          </div>
        )}
        {more && more.length > 0 && <MoreMenu tone="bar" up items={more} disabled={moreDisabled} className="ml-auto" />}
      </div>
    </FloatBar>
  );
}

// ── 저장 안 한 수정 띠(전체 수정) ──────────────────────────
//    📌 상세 칸에서 고친 것을 저장하지 않고 다른 줄로 넘기거나 닫으면 그 수정이 쌓인다 — 쌓인 게 있을 때만 뜨는 흰 띠(2026-10-17 승인 시안 A ③).
//       빨간 점 · 「저장 안 한 수정 N개」 · 이름들(앞 셋 · 외 N — 한 줄로 자른다) · 「되돌리기」(onRevert) · 「모두 저장」(onSaveAll).
//       단추는 오른쪽 끝에 고정(글이 길어도 밀리지 않는다), 폰에서 자리가 모자라면 단추가 아랫줄 오른쪽으로 내려간다.
//       고른 것 띠(BatchBar)와 같이 뜨면 BarStack 으로 감싸 그 위에 쌓는다. saving — 단추를 잠그고 「저장 중…」
export function PendingBar({
  count,
  names = [],
  onRevert,
  onSaveAll,
  saving = false,
  label = "저장 안 한 수정",
  revertLabel = "되돌리기",
  saveLabel = "모두 저장",
}: {
  count: number;
  names?: string[];
  onRevert?: () => void;
  onSaveAll: () => void;
  saving?: boolean;
  label?: string;
  revertLabel?: string;
  saveLabel?: string;
}) {
  if (count <= 0) return null;
  const shown = names.filter(Boolean);
  const list = `${shown.slice(0, 3).join(" · ")}${shown.length > 3 ? ` 외 ${shown.length - 3}` : ""}`;
  return (
    <FloatBar tone="paper" label={label}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 pl-3.5 pr-2 py-2">
        {/* 글 칸 바탕 폭 9rem — 폰(375)에서도 점 · 「저장 안 한 수정 N개」와 단추 둘이 한 줄. 이름들만 남는 폭 안에서 잘린다 */}
        <p className="flex-1 basis-36 min-w-0 flex items-center gap-2.5 text-[13px]" aria-live="polite">
          <span aria-hidden className="shrink-0 w-2 h-2 rounded-full bg-[#e91e3f]" />
          <b className="shrink-0 font-black whitespace-nowrap tabular-nums">{label} {count.toLocaleString()}개</b>
          {list && <span className="min-w-0 truncate text-[12px] font-bold text-[#5a5a5a]">{list}</span>}
        </p>
        <div className="ml-auto shrink-0 flex items-center gap-2">
          {onRevert && <Btn variant="secondary" size="sm" onClick={onRevert} disabled={saving}>{revertLabel}</Btn>}
          <Btn size="sm" onClick={onSaveAll} disabled={saving}><SwapLabel swap={saving} to="저장 중…">{saveLabel}</SwapLabel></Btn>
        </div>
      </div>
    </FloatBar>
  );
}

// ── 펼침 메뉴(MenuBtn · MoreMenu) ──────────────────────────
//    📌 누르면 바로 그 일을 하는 메뉴 — 도구 줄 「⋯」(추천 아이템 · 그룹 관리 · 열 고르기 …) · 아래 띠 「희귀도 ▾」 · 「⋯」(이름 바꾸기 · 복제 · 삭제 …).
//       (상점 관리 안에만 있던 MenuBtn 을 공용으로 올렸다 — 같은 항목 모양 { key · label · icon · hint · on · stay · onSelect } 그대로 받는다)
//       판은 화면 위에 뜬다(body 로 띄운 fixed 판) — 상세 칸 · 창의 스크롤 칸 안에서도 잘리지 않는다. 스크롤 · 창 크기가 바뀌면 단추를 따라간다.
//       up: 위로 연다(아래 띠 안). 위 · 아래 자리가 모자라면 넓은 쪽으로 뒤집는다. align: 단추 왼쪽(start) · 오른쪽(end) 끝에 맞춘다(안 주면 화면 끝을 보고 고른다).
//       바깥 누르기 · Esc(뒤 칸 · 창이 같이 닫히지 않게 먼저 받는다) · Tab 으로 닫힌다. 키보드로 열면 첫 항목으로 — ↑ ↓ · Home · End 로 옮긴다.
//       항목: divider(그 항목 위에 선) · danger(빨간 글자) · disabled(흐리게 · 못 누름) · on(오른쪽 체크 — 켜고 끄는 항목) · stay(누르고도 판을 열어 둔다 — 열 고르기)
//       판은 data-admin-layer(덮개로 친다 — 상세 칸 Esc · Ctrl+S · Alt+↑ ↓ 가 양보) · 16px 모서리 · 그림자 하나.
//    MenuBtn  — 글자 단추 + ▾. tone="bar"(잉크 띠 안) · size(sm 32 · md 40 — 도구 줄) · active(값을 고른 상태 — 먹 테) ·
//               reserve(바뀌는 글자 후보들 — 가장 긴 폭을 늘 잡는다 · 「유형 · 전체 25」 ↔ 「유형 · 꾸미기 11」 에 단추 줄이 밀리지 않게)
//    MoreMenu — 「⋯」 동그라미 하나(aria-label 「더 보기」). tone="bar" · size 는 MenuBtn 과 같다
export type MenuItem = {
  key?: string;
  label: React.ReactNode;
  onSelect: () => void;
  icon?: React.ReactNode;
  hint?: React.ReactNode; // 오른쪽 옅은 글(개수 · 단축키)
  on?: boolean; // 주면 켜고 끄는 항목(menuitemcheckbox) — 켜지면 오른쪽 체크
  stay?: boolean;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
};
// onOpenChange — 열리고 닫힐 때(닫히면 펼친 하위 목록 접기 등 — 상점 「⋯」 「보이는 열 고르기」)
type MenuOpts = { items: MenuItem[]; up?: boolean; width?: number; align?: "start" | "end"; disabled?: boolean; className?: string; onOpenChange?: (open: boolean) => void };
const MENU_ITEM_SEL = '[data-menu-item]:not([aria-disabled="true"])';
const MENU_M = 16; // 화면 끝 여백
// 여는 단추 모양 — 글자 단추(MenuBtn) · 「⋯」(MoreMenu)
type MenuLook =
  | { kind: "label"; label: React.ReactNode; tone: "default" | "bar"; size: "sm" | "md"; active: boolean; reserve?: React.ReactNode[] }
  | { kind: "more"; label: string; tone: "default" | "bar"; size: "sm" | "md" };
const MENU_CHEVRON = (open: boolean, tone: "default" | "bar") => (
  <svg aria-hidden viewBox="0 0 24 24" className={`w-3 h-3 shrink-0 transition-transform ${tone === "bar" ? "text-white/60" : "text-[#8a8a8a]"} ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);
const MENU_DOTS = (
  <svg aria-hidden viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor">
    <circle cx="4.5" cy="10" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="15.5" cy="10" r="1.6" />
  </svg>
);
function MenuShell({
  items,
  up = false,
  width = 220,
  align,
  disabled = false,
  className = "",
  look,
  onOpenChange,
}: MenuOpts & { look: MenuLook }) {
  const [open, setOpen] = useState(false);
  const openCb = useRef(onOpenChange);
  useEffect(() => { openCb.current = onOpenChange; });
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current === open) return;
    opened.current = open;
    openCb.current?.(open);
  }, [open]);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const viaKey = useRef(false);
  const menuId = useId();
  // 판 자리 — 단추 아래(또는 위) 8px. 화면 밖으로 나가지 않게 폭 · 왼쪽 · 높이를 맞춘다
  const measure = useCallback((): React.CSSProperties | null => {
    const t = wrap.current?.querySelector<HTMLButtonElement>("button");
    if (!t) return null;
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.max(160, Math.min(width, vw - MENU_M * 2));
    const toEnd = align ? align === "end" : r.left + w > vw - MENU_M;
    const left = Math.max(MENU_M, Math.min(toEnd ? r.right - w : r.left, vw - MENU_M - w));
    const below = vh - r.bottom - 8 - MENU_M;
    const above = r.top - 8 - MENU_M;
    const goUp = up ? !(above < 160 && below > above) : below < 200 && above > below;
    const room = Math.max(120, Math.min(360, goUp ? above : below));
    return { position: "fixed", left, width: w, maxHeight: room, ...(goUp ? { bottom: vh - r.top + 8 } : { top: r.bottom + 8 }) };
  }, [width, align, up]);
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) wrap.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, []);
  const openNow = (kbd: boolean) => {
    viaKey.current = kbd;
    setPos(measure());
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const follow = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setPos(measure());
      });
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrap.current?.contains(t) || menu.current?.contains(t)) return;
      setOpen(false);
    };
    // 캡처로 먼저 받는다 — 같은 Esc 에 뒤의 상세 칸 · 창 · 거르기 판이 같이 닫히지 않게(preventDefault 를 보고 양보한다)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      close(true);
    };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, measure, close]);
  // 키보드로 열었으면 첫 항목으로
  useEffect(() => {
    if (!open || !viaKey.current) return;
    viaKey.current = false;
    menu.current?.querySelector<HTMLElement>(MENU_ITEM_SEL)?.focus({ preventScroll: true });
  }, [open]);
  const off = disabled || items.length === 0;
  // 📌 판 안 키 · 누르기는 바깥(React 트리로 이어진 줄 · 카드 · 상세 칸 단축키)으로 넘기지 않는다 — body 로 띄운 판이라도 React 이벤트는 단추 쪽 조상으로 올라간다
  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === "Tab") {
      e.preventDefault();
      close(true);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const list = Array.from(menu.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SEL) || []);
    if (list.length === 0) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    const n = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : e.key === "ArrowDown" ? (i + 1) % list.length : (i <= 0 ? list.length : i) - 1;
    list[n]?.focus({ preventScroll: true });
  };
  const pick = (it: MenuItem) => {
    if (it.disabled) return;
    // 판을 닫기 전에 단추로 포커스를 돌려 둔다 — 이 일이 창(FormSheet)을 열면 창이 닫힐 때 이 단추로 돌아온다
    if (!it.stay) close(true);
    it.onSelect();
  };
  const checks = items.some((it) => it.on !== undefined);
  const onTrigger = (e: React.MouseEvent<HTMLButtonElement>) => (open ? close(false) : openNow(e.detail === 0));
  const onTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowDown" || open || off) return;
    e.preventDefault();
    openNow(true);
  };
  const aria = { "aria-haspopup": "menu", "aria-expanded": open, "aria-controls": open ? menuId : undefined } as const;
  const text =
    look.kind === "label" && look.reserve && look.reserve.length > 0 ? (
      <span className="inline-grid justify-items-start">
        {look.reserve.map((r, i) => <span key={i} aria-hidden className="col-start-1 row-start-1 invisible">{r}</span>)}
        <span className="col-start-1 row-start-1">{look.label}</span>
      </span>
    ) : look.kind === "label" ? look.label : null;
  return (
    <div ref={wrap} className={`relative shrink-0 ${className}`}>
      {look.kind === "more" ? (
        <button
          type="button"
          {...aria}
          disabled={off}
          onClick={onTrigger}
          onKeyDown={onTriggerKey}
          aria-label={look.label}
          title={look.label}
          className={
            look.tone === "bar"
              ? `${barBtnCls(false)} !w-9 !px-0 ${open ? "!bg-white/20" : ""}`
              : `inline-flex items-center justify-center shrink-0 rounded-full border bg-white text-[#131313] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40 disabled:opacity-40 disabled:cursor-default ${look.size === "sm" ? "w-8 h-8" : "w-10 h-10"} ${open ? "border-[#131313]" : "border-[#a3a3a3] hover:border-[#131313]"}`
          }
        >
          {MENU_DOTS}
        </button>
      ) : look.tone === "bar" ? (
        <button type="button" {...aria} disabled={off} onClick={onTrigger} onKeyDown={onTriggerKey} className={barBtnCls(false)}>
          {text}
          {MENU_CHEVRON(open, "bar")}
        </button>
      ) : (
        <Btn variant="secondary" size={look.size} {...aria} disabled={off} onClick={onTrigger} onKeyDown={onTriggerKey} className={`tabular-nums ${look.active ? "!border-[#131313]" : ""}`}>
          {text}
          {MENU_CHEVRON(open, "default")}
        </Btn>
      )}
      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menu}
            id={menuId}
            data-admin-layer
            data-admin-menu
            role="menu"
            onKeyDown={onMenuKey}
            onClick={(e) => e.stopPropagation()}
            className="z-[128] py-1.5 rounded-2xl border border-[#ededed] bg-white text-[#131313] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] overflow-y-auto overscroll-contain"
            style={pos}
          >
            {items.map((it, i) => (
              <React.Fragment key={it.key ?? i}>
                {it.divider && i > 0 && <div role="separator" className="my-1.5 mx-3 border-t border-[#ededed]" />}
                <button
                  type="button"
                  data-menu-item
                  role={it.on !== undefined ? "menuitemcheckbox" : "menuitem"}
                  aria-checked={it.on !== undefined ? it.on : undefined}
                  aria-disabled={it.disabled || undefined}
                  tabIndex={-1}
                  onClick={() => pick(it)}
                  className={`w-full flex items-center gap-2.5 min-h-11 md:min-h-10 px-3.5 py-2 text-left text-[13px] font-bold transition-colors outline-none focus-visible:bg-[#f2f2f2] ${
                    it.disabled ? "opacity-40 cursor-default" : it.danger ? "text-[#d01634] hover:bg-[#f2f2f2]" : "text-[#131313] hover:bg-[#f2f2f2]"
                  }`}
                >
                  {it.icon && <span className="shrink-0 inline-flex items-center justify-center">{it.icon}</span>}
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.hint != null && it.hint !== "" && <span className="shrink-0 text-[11px] font-bold text-[#8a8a8a] tabular-nums">{it.hint}</span>}
                  {checks && (
                    <svg aria-hidden viewBox="0 0 16 16" className={`w-4 h-4 shrink-0 ${it.on ? "" : "invisible"}`} fill="none" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 8.5l3 3 6-7" />
                    </svg>
                  )}
                </button>
              </React.Fragment>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
export function MenuBtn({
  label,
  tone = "default",
  size = "sm",
  active = false,
  reserve,
  ...menu
}: MenuOpts & {
  label: React.ReactNode;
  tone?: "default" | "bar";
  size?: "sm" | "md";
  active?: boolean;
  reserve?: React.ReactNode[];
}) {
  return <MenuShell {...menu} look={{ kind: "label", label, tone, size, active, reserve }} />;
}
export function MoreMenu({ tone = "default", size = "md", label = "더 보기", ...menu }: MenuOpts & { tone?: "default" | "bar"; size?: "sm" | "md"; label?: string }) {
  return <MenuShell {...menu} look={{ kind: "more", label, tone, size }} />;
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

// ── 거르기 ─────────────────────────────────────────────────
//    📌 도구 줄의 「거르기」 단추 하나 → 펼침 판(children). 켠 거르기 수(count)를 「거르기 · N」으로 보인다.
//       PC(768 이상)는 단추 아래 뜬 판(바깥 누르기 · Esc 로 닫힘), 모바일은 아래에서 올라오는 판.
//       판 안은 FilterSection(이름 + 고르기 칩 줄) 들로 채운다. onClear 를 주면 켠 게 있을 때 판 아래 「지우기」.
//       단추 폭은 「거르기 · 00」(두 자리) 자리를 늘 잡는다 — 수가 생기거나 10을 넘어도 옆 칸이 밀리지 않게.
//       open · onOpenChange 를 주면 부르는 쪽이 열림을 쥔다(안 주면 혼자). align: 판을 단추 왼쪽(start) · 오른쪽(end)에 맞춘다(안 주면 화면 끝을 보고 고른다)
export function FilterButton({
  count = 0,
  label = "거르기",
  children,
  onClear,
  open: openProp,
  onOpenChange,
  align,
  className = "",
}: {
  count?: number;
  label?: string;
  children: React.ReactNode;
  onClear?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "end";
  className?: string;
}) {
  const [openInner, setOpenInner] = useState(false);
  const open = openProp ?? openInner;
  const setOpen = useCallback(
    (v: boolean) => {
      if (openProp === undefined) setOpenInner(v);
      onOpenChange?.(v);
    },
    [openProp, onOpenChange],
  );
  const [side, setSide] = useState<"start" | "end">("start");
  const wide = useMedia("(min-width: 768px)");
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // 판 안에서 연 펼침 메뉴(MenuBtn · MoreMenu — body 로 뜬 판)를 누른 것은 바깥으로 치지 않는다
    const onDown = (e: PointerEvent) => {
      if (!wide || !wrap.current || wrap.current.contains(e.target as Node)) return;
      if ((e.target as Element | null)?.closest?.("[data-admin-menu]")) return;
      setOpen(false);
    };
    // 판 안 드롭다운이 먼저 받아 닫았으면(preventDefault) 판은 그대로
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, wide, setOpen]);
  const toggle = () => {
    if (!open && !align && wrap.current) {
      // 판 폭(400)이 화면 오른쪽 끝을 넘으면 단추 오른쪽 끝에 맞춘다
      const r = wrap.current.getBoundingClientRect();
      setSide(r.left + 400 > window.innerWidth - 16 ? "end" : "start");
    }
    setOpen(!open);
  };
  const at = align || side;
  const sheetBackdrop = useBackdrop(() => setOpen(false));
  const clearBtn = onClear && count > 0 ? <Btn variant="ghost" size="sm" onClick={onClear}>지우기</Btn> : null;
  return (
    <div ref={wrap} className={`relative shrink-0 ${className}`}>
      <Btn variant="secondary" aria-expanded={open} aria-haspopup="dialog" onClick={toggle} className={count > 0 ? "!border-[#131313]" : ""}>
        <svg aria-hidden viewBox="0 0 20 20" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" d="M3 5h14M6 10h8M8.5 15h3" />
        </svg>
        <span className="inline-grid justify-items-start tabular-nums">
          <span className="col-start-1 row-start-1 invisible" aria-hidden>{label} · 00</span>
          <span className="col-start-1 row-start-1">{count > 0 ? `${label} · ${count}` : label}</span>
        </span>
      </Btn>
      {open &&
        (wide ? (
          <div
            data-admin-layer
            role="dialog"
            aria-label={label}
            className={`absolute top-full mt-2 ${at === "end" ? "right-0" : "left-0"} z-[70] flex flex-col rounded-2xl border border-[#ededed] bg-white text-[#131313] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)]`}
            style={{ width: 400, maxWidth: "calc(100vw - 2rem)", maxHeight: "70dvh" }}
          >
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
            {clearBtn && <div className="shrink-0 flex justify-end border-t border-[#ededed] px-3 py-2">{clearBtn}</div>}
          </div>
        ) : (
          <div data-admin-layer className="fixed inset-0 z-[125] flex items-end bg-black/40 overlay-in" {...sheetBackdrop}>
            <div role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()} className="w-full max-h-[88dvh] flex flex-col rounded-t-2xl bg-white text-[#131313] pb-[env(safe-area-inset-bottom)]">
              <div className="shrink-0 flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#ededed]">
                <h2 className="min-w-0 flex-1 text-[17px] font-black tracking-tight">{count > 0 ? `${label} · ${count}` : label}</h2>
                {clearBtn}
                <CloseBtn onClick={() => setOpen(false)} />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-3">{children}</div>
            </div>
          </div>
        ))}
    </div>
  );
}

// 거르기 판 안 한 묶음 — 이름 + 고르기 칩 줄(줄을 바꿔 감싼다 — 옆 스크롤 없음)
export function FilterSection({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-[#ededed] last:border-b-0">
      <p className="mb-2 text-[12px] font-bold text-[#5a5a5a]">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// 고르기 칩 — 켜면 잉크. 여럿 켤 수 있는 거르기 · 하나만 고르는 보기 모두(부르는 쪽이 on 을 정한다). n: 옆 개수
export function ChoiceChip({ on, onClick, children, n, disabled = false }: { on: boolean; onClick: () => void; children: React.ReactNode; n?: number; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[13px] font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 disabled:opacity-40 disabled:cursor-default ${
        on ? "bg-[#131313] border-[#131313] text-white" : "bg-white border-[#a3a3a3] text-[#5a5a5a] hover:border-[#131313] hover:text-[#131313]"
      }`}
    >
      {children}
      {n != null && <span className={`text-[12px] tabular-nums ${on ? "text-white/60" : "text-[#a3a3a3]"}`}>{n}</span>}
    </button>
  );
}

//    📌 켠 거르기 칩 줄 — 검색 · 도구 줄 아래. 칩(잉크 알약 · ×)을 누르면 그 거르기만 끈다. 둘 이상이면 끝에 「지우기」(모두 끔).
//       켠 게 없으면 그리지 않는다. 칩이 많으면 줄을 바꿔 감싼다.
export type ActiveFilter = { key: string; label: React.ReactNode; onRemove: () => void };
export function ActiveFilters({ items, onClear, className = "" }: { items: ActiveFilter[]; onClear?: () => void; className?: string }) {
  if (items.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 mb-4 ${className}`}>
      {items.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={f.onRemove}
          aria-label={typeof f.label === "string" ? `${f.label} 해제` : undefined}
          className="inline-flex max-w-full items-center gap-1.5 h-8 pl-3 pr-2 rounded-full bg-[#131313] text-white text-[12px] font-bold transition-colors hover:bg-[#3a3a3a] outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40"
        >
          <span className="min-w-0 truncate">{f.label}</span>
          <svg aria-hidden viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ))}
      {onClear && items.length > 1 && (
        <button type="button" onClick={onClear} className="h-8 px-2 rounded-full text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] outline-none focus-visible:underline">
          지우기
        </button>
      )}
    </div>
  );
}

// 닫기(×) 동그라미 — 상세 칸 · 창 · 판 머리 오른쪽
function CloseBtn({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label="닫기" className="shrink-0 w-9 h-9 rounded-full bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 disabled:opacity-40">
      <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
    </button>
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
//    📌 덩어리(blockOf — 2026-10-18 체크한 줄 한 번에 옮기기) — 누른 줄 키로 함께 옮길 키들(그 칸 차례 · 누른 줄 포함, 둘 이상)을 주면
//       놓을 때 그 줄들을 끈 줄이 간 자리에 차례 그대로 모아 끼운 새 차례를 onReorder(새 차례, 칸, 끈 키, 덩어리)로 올린다(제자리면 안 부른다).
//       끄는 동안 inBlock(키) · blockN(수) · liftKey(끈 키)로 표가 덩어리를 그린다(나머지 고른 줄 흐리게 · 끈 줄에 「N개」)
type DragView = { seg: string; from: number; to: number; dy: number; h: number; block: ReadonlySet<string> | null };
const moveKey = (keys: string[], from: number, to: number) => {
  const next = keys.slice();
  const [k] = next.splice(from, 1);
  next.splice(to, 0, k);
  return next;
};
// 덩어리째 — 끈 줄 하나를 to 로 옮긴 차례(next)에서, 끈 줄 앞에 있는 덩어리 밖 줄 수가 곧 덩어리를 끼울 번호. 덩어리는 원래 차례(keys) 그대로. 제자리면 null
const placeBlockKeys = (keys: string[], next: string[], to: number, block: ReadonlySet<string>) => {
  let at = 0;
  for (let j = 0; j < to; j++) if (!block.has(next[j])) at++;
  const rest = keys.filter((k) => !block.has(k));
  const out = [...rest.slice(0, at), ...keys.filter((k) => block.has(k)), ...rest.slice(at)];
  return out.every((k, j) => k === keys[j]) ? null : out;
};
// 덩어리로 칠 키들 — 둘 이상이고 누른 키가 들었을 때만(아니면 그 줄 하나)
const blockSetOf = (keys: readonly string[] | null | undefined, key: string) => (keys && keys.length > 1 && keys.includes(key) ? new Set(keys) : null);
export function useRowDrag(
  segs: ReadonlyMap<string, string[]>,
  onReorder?: (keys: string[], seg: string, moved: string, block?: string[]) => void,
  locked = false,
  { autoScroll = true, blockOf }: { autoScroll?: boolean; blockOf?: (seg: string, key: string) => readonly string[] | null } = {},
) {
  const [view, setView] = useState<DragView | null>(null);
  // 끄는 동안의 값 — 매 프레임 바뀌므로 상태가 아니라 ref 에 둔다(자동 스크롤 루프가 읽는다)
  //    armed: 누른 뒤 실제로 6px 넘게 움직였는지 — 화면 끝 손잡이를 누르기만 해도 페이지가 저절로 흘러 줄이 옮겨지지 않게
  //    block: 함께 옮기는 줄(덩어리 — 없으면 끈 줄 하나)
  const st = useRef<{ seg: string; from: number; to: number; startY: number; lastY: number; downY: number; armed: boolean; tops: number[]; hs: number[]; raf: number; block: ReadonlySet<string> | null } | null>(null);
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
    setView({ seg: s.seg, from: s.from, to, dy, h: s.hs[s.from], block: s.block });
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

  // 놓기 · ↑ ↓ 한 칸 — 덩어리면 덩어리째(제자리면 부르지 않는다), 아니면 그 줄 하나
  const commitMove = (keys: string[], from: number, to: number, seg: string, block: ReadonlySet<string> | null) => {
    if (!onReorder) return;
    const next = moveKey(keys, from, to);
    if (!block) return onReorder(next, seg, keys[from]);
    const out = placeBlockKeys(keys, next, to, block);
    if (out) onReorder(out, seg, keys[from], keys.filter((k) => block.has(k)));
  };
  const finish = (commit: boolean) => {
    const s = st.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    st.current = null;
    setView(null);
    const keys = keysOf(s.seg);
    if (commit && onReorder && s.to !== s.from && s.from < keys.length && s.to < keys.length) commitMove(keys, s.from, s.to, s.seg, s.block);
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
      const key = keysOf(seg)[i];
      const block = key != null ? blockSetOf(blockOf?.(seg, key), key) : null;
      st.current = { seg, from: i, to: i, startY: e.clientY + window.scrollY, lastY: e.clientY, downY: e.clientY, armed: false, tops: rects.map((r) => r.top + window.scrollY), hs: rects.map((r) => r.height), raf: 0, block };
      setView({ seg, from: i, to: i, dy: 0, h: rects[i].height, block });
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
      const up = e.key === "ArrowUp";
      const block = blockSetOf(blockOf?.(seg, keys[i]), keys[i]);
      // 📌 덩어리(체크한 줄)면 덩어리 끝에서 한 칸 — ↑ 는 맨 위 줄 위로, ↓ 는 맨 아래 줄 아래로(2026-10-18 운영자 — 가운데 줄에 손잡이가 있으면
      //    이웃이 같은 덩어리라 제자리로 읽혀 안 움직였다). 떨어진 덩어리는 그 끝 줄 자리로 모인다(placeBlockKeys). 덩어리가 아니면 그 줄 하나
      let from = i;
      if (block) {
        const at = keys.map((k, j) => (block.has(k) ? j : -1)).filter((j) => j >= 0);
        if (at.length) from = up ? at[0] : at[at.length - 1];
      }
      const to = up ? from - 1 : from + 1;
      if (to < 0 || to >= keys.length) return;
      e.preventDefault();
      const list = e.currentTarget.closest("[data-drag-list]");
      if (list) refocus.current = { list, key: keys[i] };
      commitMove(keys, from, to, seg, block);
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
  // 덩어리를 끄는 동안 — 든 키인가 · 몇 개인가(0 = 덩어리 아님) · 끈 키
  const inBlock = (key: string) => !!view?.block?.has(key);
  const blockN = view?.block?.size ?? 0;
  const liftKey = view ? keysOf(view.seg)[view.from] ?? null : null;

  return { dragging: view != null, isLifted, handleProps, rowStyle, inBlock, blockN, liftKey };
}

// ── 묶음 표 줄 끌기(묶음을 넘나든다) ───────────────────────
//    📌 DataTable 에 groupOf + onRowDrop 를 주면 줄(묶음 안 줄 · 묶지 않은 줄) 손잡이는 이것으로 끈다(2026-10-11 운영자 — "바깥에 있는 걸 바로 그룹에 못 넣는다").
//       묶음 안 두 줄 사이 · 첫 줄 앞 = 그 묶음 안, 접힌 머리줄 위 = 그 덩어리 끝, 단위 사이 = 묶음 밖. 자리 셈은 lib/groupedDrop.js(node 검사).
//       모습은 useRowDrag 와 같다(끄는 줄은 손가락을 따라가고 그 사이 줄들이 비켜선다) + 놓을 묶음의 머리줄을 강조한다(그 묶음에 든다는 표시).
//       줄마다 data-drag-line(번호) — 감싼 틀(data-drag-list) 안에서 잰다. 머리줄 손잡이(덩어리째)는 useRowDrag 단위 칸 그대로.
//       6px 넘게 움직여야 놓기로 친다(누르기만 해도 그룹이 바뀌지 않게). ↑ ↓ 는 놓을 수 있는 자리를 한 칸씩
//    onRowDrop({ moved, group, after, before }) — group 있음: 그 묶음 안(이웃 = 그 묶음 줄 키, 둘 다 null = 덩어리 끝) · "": 단위 사이(이웃 = 단위 키)
//    📌 block(2026-10-18 체크한 줄 한 번에 옮기기) — 고른 줄을 끌면 고른 줄 모두(표 차례 · moved 포함). 놓은 자리(group · after · before)는 끈 줄 하나의 자리 그대로라
//       이웃이 고른 줄일 수 있다 — 부르는 쪽이 전체 차례에서 그 틈을 찾아 덩어리를 뺀 나머지 차례에 끼운다(상점 관리 placeBlock)
export type TableRowDrop = { moved: string; group: string; after: string | null; before: string | null; block?: string[] };
type LineView = { from: number; to: number; dy: number; h: number; target: DropTarget | null; block: ReadonlySet<string> | null; key: string };
function useLineDrag(lines: DropLine[], onDrop: ((d: TableRowDrop) => void) | undefined, locked: boolean, blockOf?: (key: string) => readonly string[] | null) {
  const [view, setView] = useState<LineView | null>(null);
  const st = useRef<{ from: number; lines: DropLine[]; to: number; target: DropTarget | null; startY: number; lastY: number; downY: number; armed: boolean; tops: number[]; hs: number[]; raf: number; block: ReadonlySet<string> | null } | null>(null);
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
    setView({ from: s.from, to: s.to, dy, h: s.hs[s.from], target: s.target, block: s.block, key: s.lines[s.from]?.key ?? "" });
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

  // 덩어리면 놓은 자리에 덩어리 키(표 차례 — blockOf 가 준 차례)를 붙인다
  const withBlock = (d: TableRowDrop, block: ReadonlySet<string> | null): TableRowDrop => (block ? { ...d, block: [...block] } : d);
  const blockAt = (i: number) => (lines[i] ? blockSetOf(blockOf?.(lines[i].key), lines[i].key) : null);
  const finish = (commit: boolean) => {
    const s = st.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    st.current = null;
    setView(null);
    if (commit && onDrop && s.armed && s.target && !isNoopTarget(s.lines, s.from, s.target)) onDrop(withBlock(dropOf(s.lines, s.from, s.target), s.block));
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
      const block = blockAt(i);
      st.current = {
        from: i, lines, to: i, target: null, startY: e.clientY + window.scrollY, lastY: e.clientY, downY: e.clientY, armed: false,
        tops: rects.map((r) => r.top + window.scrollY), hs: rects.map((r) => r.height), raf: 0, block,
      };
      setView({ from: i, to: i, dy: 0, h: rects[i].height, target: null, block, key: lines[i].key });
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
      const up = e.key === "ArrowUp";
      const block = blockAt(i);
      // 📌 덩어리(체크한 줄)면 덩어리 끝 줄에서 한 칸 — ↑ 는 보이는 맨 위 줄, ↓ 는 맨 아래 줄 기준(useRowDrag 와 같다, 2026-10-18 운영자 — 가운데 줄 손잡이면
      //    바로 옆 자리의 이웃이 같은 덩어리 줄이라 놓아도 제자리로 읽혀 안 움직였다). 그 기준에서도 이웃이 덩어리 줄인 자리는 건너뛴다(놓아도 덩어리가 제자리)
      let from = i;
      if (block) {
        const at = lines.map((l, j) => (!l.head && block.has(l.key) ? j : -1)).filter((j) => j >= 0);
        if (at.length) from = up ? at[0] : at[at.length - 1];
      }
      const ts = rowTargets(lines, from);
      const k = ts.findIndex((t) => isNoopTarget(lines, from, t));
      if (k < 0) return;
      const touches = (t: DropTarget) => !!block && ((t.after != null && block.has(t.after)) || (t.before != null && block.has(t.before)));
      let j = up ? k - 1 : k + 1;
      while (j >= 0 && j < ts.length && touches(ts[j])) j += up ? -1 : 1;
      const t = ts[j];
      if (!t) return;
      e.preventDefault();
      const list = e.currentTarget.closest("[data-drag-list]");
      if (list) refocus.current = { list, key: lines[i].key };
      onDrop(withBlock(dropOf(lines, from, t), block));
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
  // 덩어리를 끄는 동안(useRowDrag 와 같은 셋)
  const inBlock = (key: string) => !!view?.block?.has(key);
  const blockN = view?.block?.size ?? 0;
  const liftKey = view ? view.key : null;

  return { dragging: view != null, handleProps, lineStyle, isLifted, dropGroup, inBlock, blockN, liftKey };
}

// 📌 count — 체크한 줄 덩어리를 끄는 동안 그 수(「N개」). 손잡이 오른쪽 위에 겹쳐 띄운다(자리를 차지하지 않아 줄이 밀리지 않는다 · 흰 테로 고르기 칸과 떨어져 보이게)
export function DragHandle({ count, ...props }: ReturnType<ReturnType<typeof useRowDrag>["handleProps"]> & { count?: number }) {
  return (
    <button
      type="button"
      aria-label="끌어서 순서 바꾸기"
      {...props}
      className="relative touch-none cursor-grab active:cursor-grabbing aria-disabled:cursor-default aria-disabled:opacity-40 inline-flex items-center justify-center w-8 h-8 -my-1 shrink-0 rounded-lg text-[#8a8a8a] hover:bg-[#f2f2f2] hover:text-[#131313] outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40"
    >
      <svg aria-hidden viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor">
        <circle cx="7.5" cy="5" r="1.5" /><circle cx="12.5" cy="5" r="1.5" />
        <circle cx="7.5" cy="10" r="1.5" /><circle cx="12.5" cy="10" r="1.5" />
        <circle cx="7.5" cy="15" r="1.5" /><circle cx="12.5" cy="15" r="1.5" />
      </svg>
      {count != null && count > 1 && (
        <span aria-hidden className="pointer-events-none absolute -top-2 left-5 z-[1] inline-flex items-center h-5 px-1.5 rounded-full bg-[#131313] text-white text-[11px] font-black leading-none tabular-nums whitespace-nowrap ring-2 ring-white">
          {count.toLocaleString()}개
        </span>
      )}
    </button>
  );
}

// ── 고르기 칸 ──────────────────────────────────────────────
//    📌 16px 네모 — 켜면 잉크(#131313) + 체크, 일부만(mixed) 켜면 가로줄. PickMark 는 그림만(감싼 것이 고르기 역할일 때),
//       PickBox 는 누르는 단추(role=checkbox · 32px 누름 자리). 누르기는 줄 · 카드로 가지 않는다(stopPropagation) — 상세 칸이 열리지 않게.
//       Shift 를 누른 채 누르면 글자가 긁혀 선택되지 않게 막는다. inset(기본): 누름 자리만큼 왼쪽 · 위아래를 당겨 줄 높이 · 글자 자리 그대로.
//       children 을 주면 네모 옆 글자까지 한 단추(「전체」 등)
export function PickMark({ on, mixed = false }: { on: boolean; mixed?: boolean }) {
  const fill = on || mixed;
  return (
    <span aria-hidden className={`inline-flex items-center justify-center w-4 h-4 shrink-0 rounded border transition-colors ${fill ? "bg-[#131313] border-[#131313] text-white" : "bg-white border-[#a3a3a3] group-hover/pick:border-[#131313]"}`}>
      {on ? (
        <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M3.5 8.5l3 3 6-7" /></svg>
      ) : mixed ? (
        <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" d="M4 8h8" /></svg>
      ) : null}
    </span>
  );
}
export function PickBox({
  on,
  mixed = false,
  onToggle,
  label = "선택",
  disabled = false,
  inset = true,
  children,
  className = "",
}: {
  on: boolean;
  mixed?: boolean;
  onToggle: (e: React.MouseEvent<HTMLButtonElement>) => void; // e.shiftKey — 범위 고르기
  label?: string; // 읽어 주는 이름(children 이 없을 때)
  disabled?: boolean;
  inset?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on ? true : mixed ? "mixed" : false}
      aria-label={children ? undefined : label}
      title={children || label === "선택" ? undefined : label}
      disabled={disabled}
      onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
      onClick={(e) => { e.stopPropagation(); onToggle(e); }}
      className={`group/pick inline-flex items-center shrink-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40 disabled:opacity-40 disabled:cursor-default ${
        children ? "gap-2 h-8 pl-2 pr-2.5 rounded-full text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313]" : "w-8 h-8 justify-center rounded-lg"
      } ${inset ? "-ml-2 -my-1" : ""} ${className}`}
    >
      <PickMark on={on} mixed={mixed} />
      {children}
    </button>
  );
}

// ── 여러 개 고르기 상태 ────────────────────────────────────
//    📌 const sel = useSelection(모든 키) → <DataTable {...sel.tableProps} /> · <CardGrid {...sel.tableProps} /> · <BatchBar count={sel.size} onClear={sel.clear}>
//       onToggleKey(키, { shift, range }) — 한 줄 켜고 끄기. Shift 범위(range: 표 · 카드가 화면 차례로 셈)면 그 범위를 누른 줄의 새 상태로 맞춘다.
//       onToggleAll(키들) — 모두 켜져 있으면 모두 끄고, 아니면 모두 켠다(머리줄 「전체」 · 그룹 머리줄).
//       validKeys(있으면) — 지워진 줄 같은 없는 키는 고른 것에서 뺀다(목록이 바뀌어도 띠 수가 맞게). 거른 결과가 아니라 전체 키를 넘긴다
export type ToggleOpts = { shift: boolean; range?: string[] };
export function useSelection(validKeys?: readonly string[]) {
  const [raw, setRaw] = useState<ReadonlySet<string>>(() => new Set());
  const selectedKeys = useMemo<ReadonlySet<string>>(() => {
    if (!validKeys) return raw;
    const ok = new Set(validKeys);
    let all = true;
    for (const k of raw) if (!ok.has(k)) { all = false; break; }
    return all ? raw : new Set([...raw].filter((k) => ok.has(k)));
  }, [raw, validKeys]);
  const onToggleKey = useCallback((key: string, opts?: ToggleOpts) => {
    setRaw((prev) => {
      const next = new Set(prev);
      const on = !prev.has(key);
      for (const k of opts?.shift && opts.range?.length ? opts.range : [key]) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }, []);
  const onToggleAll = useCallback((keys: readonly string[]) => {
    setRaw((prev) => {
      const all = keys.length > 0 && keys.every((k) => prev.has(k));
      const next = new Set(prev);
      for (const k of keys) {
        if (all) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }, []);
  const clear = useCallback(() => setRaw(new Set()), []);
  const replace = useCallback((keys: Iterable<string>) => setRaw(new Set(keys)), []);
  return {
    selectedKeys,
    size: selectedKeys.size,
    keys: () => [...selectedKeys],
    has: (k: string) => selectedKeys.has(k),
    onToggleKey,
    onToggleAll,
    clear,
    replace,
    tableProps: { selectable: true as const, selectedKeys, onToggleKey, onToggleAll },
  };
}
// 키들 중 몇 개가 골라졌나 — 머리줄 칸(모두 · 일부)
const pickStateOf = (keys: readonly string[], sel: ReadonlySet<string> | undefined) => {
  let n = 0;
  if (sel) for (const k of keys) if (sel.has(k)) n++;
  return { on: n > 0 && n === keys.length, mixed: n > 0 && n < keys.length };
};
// Shift 범위 — 기준(anchor)부터 누른 키까지 화면 차례(order)로. 기준이 안 보이면 범위 없음(한 줄만)
const rangeOf = (order: readonly string[], anchor: string | null, k: string) => {
  if (anchor == null || anchor === k) return undefined;
  const i = order.indexOf(anchor);
  const j = order.indexOf(k);
  return i < 0 || j < 0 ? undefined : order.slice(Math.min(i, j), Math.max(i, j) + 1);
};

// ── 정렬 ───────────────────────────────────────────────────
//    📌 Column.sortValue 를 주면 그 열 머리를 눌러 오름 → 내림 → 기본(넘긴 차례) 순으로 바뀐다. 빈 값(null · "" · NaN)은 늘 맨 끝.
//       글자는 한국어 · 숫자 섞임 차례(「테두리 2」 < 「테두리 10」), 같은 값은 원래 차례 그대로(안정 정렬).
//       sortRows(rows, columns, sort) — 카드 보기 등 표 밖에서도 같은 차례로
export type SortValue = string | number | boolean | Date | null | undefined;
export type SortState = { key: string; dir: "asc" | "desc" } | null;
const KO_SORT = typeof Intl !== "undefined" ? new Intl.Collator("ko", { numeric: true, sensitivity: "base" }) : null;
const sortKeyOf = (v: SortValue): string | number | null => {
  if (v == null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  const s = String(v).trim();
  return s ? s : null;
};
export function sortRows<T>(rows: T[], columns: readonly Column<T>[], sort: SortState): T[] {
  const get = sort ? columns.find((c) => c.key === sort.key)?.sortValue : undefined;
  if (!sort || !get) return rows;
  const dir = sort.dir === "desc" ? -1 : 1;
  return rows
    .map((row, i) => ({ row, i, v: sortKeyOf(get(row)) }))
    .sort((a, b) => {
      if (a.v == null || b.v == null) return a.v == null && b.v == null ? a.i - b.i : a.v == null ? 1 : -1;
      const c =
        typeof a.v === "number" && typeof b.v === "number"
          ? a.v - b.v
          : KO_SORT
            ? KO_SORT.compare(String(a.v), String(b.v))
            : String(a.v) < String(b.v) ? -1 : String(a.v) > String(b.v) ? 1 : 0;
      return c ? c * dir : a.i - b.i;
    })
    .map((x) => x.row);
}
// 다음 정렬 — 다른 열이면 오름, 같은 열이면 오름 → 내림 → 기본(null)
export const nextSort = (cur: SortState, key: string): SortState =>
  !cur || cur.key !== key ? { key, dir: "asc" } : cur.dir === "asc" ? { key, dir: "desc" } : null;
// 정렬 화살표 — 늘 자리를 잡는다(안 고른 열은 안 보이게) · 열 머리 폭이 정렬 따라 흔들리지 않게
function SortArrow({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={`w-3 h-3 shrink-0 ${dir ? "" : "invisible"} ${dir === "desc" ? "rotate-180" : ""}`} fill="currentColor">
      <path d="M6 2.5l4 5.5H2z" />
    </svg>
  );
}
// 모바일 정렬 단추(칩) 모양 — 열마다 칩 · 「정렬 · <지금>」 단추가 같다
const SORT_CHIP = "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30";
// 📌 모바일 정렬 고르기 — 정렬할 열이 MOBILE_SORT_CHIPS(4)를 넘으면 열마다 칩을 늘어놓지 않고(맨 위 줄이 몇 줄로 불어났다)
//    「정렬 · <지금>」 단추 하나 → 아래 판(FormSheet). 판: 기준(기본 순서 + 열) · 차례(오름 · 내림 — 기본 순서면 잠금).
//    고르면 바로 바뀐다(판은 그대로 — 기준에 이어 차례까지 고른다). 단추 폭은 가장 긴 글자 자리를 늘 잡는다(기준이 바뀌어도 줄었다 늘지 않게)
const MOBILE_SORT_CHIPS = 4;
function SortPicker({ options, sort, onChange }: { options: { key: string; label: React.ReactNode }[]; sort: SortState; onChange: (s: SortState) => void }) {
  const [open, setOpen] = useState(false);
  const cur = sort ? options.find((o) => o.key === sort.key) : undefined;
  const dir = cur && sort ? sort.dir : null;
  const text = (l: React.ReactNode) => <>정렬 · {l}</>;
  const pickKey = (key: string) => onChange(dir && cur?.key === key ? { key, dir } : { key, dir: "asc" });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
        className={`${SORT_CHIP} ${cur ? "bg-[#131313] text-white" : "bg-[#f2f2f2] text-[#5a5a5a]"}`}>
        <span className="inline-grid justify-items-start">
          {[{ key: "", label: "기본" as React.ReactNode }, ...options].map((o) => (
            <span key={`w:${o.key}`} aria-hidden className="col-start-1 row-start-1 invisible">{text(o.label)}</span>
          ))}
          <span className="col-start-1 row-start-1">{text(cur ? cur.label : "기본")}</span>
        </span>
        <SortArrow dir={dir} />
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="정렬">
        <FilterSection label="기준">
          <ChoiceChip on={!cur} onClick={() => onChange(null)}>기본 순서</ChoiceChip>
          {options.map((o) => (
            <ChoiceChip key={o.key} on={cur?.key === o.key} onClick={() => pickKey(o.key)}>{o.label}</ChoiceChip>
          ))}
        </FilterSection>
        <FilterSection label="차례">
          <ChoiceChip on={dir === "asc"} disabled={!cur} onClick={() => cur && onChange({ key: cur.key, dir: "asc" })}>오름차순</ChoiceChip>
          <ChoiceChip on={dir === "desc"} disabled={!cur} onClick={() => cur && onChange({ key: cur.key, dir: "desc" })}>내림차순</ChoiceChip>
        </FilterSection>
      </FormSheet>
    </>
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
  sortValue?: (row: T) => SortValue; // 주면 열 머리를 눌러 정렬(위 정렬 설명)
  sortLabel?: string; // 모바일 정렬 단추 글자 — label 이 글자가 아닐 때
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
// ── 여러 개 고르기 · 정렬(2026-10) ─────────────────────────
//    📌 selectable — 줄 앞(손잡이 다음)에 고르기 칸 열. selectedKeys 로 켜짐을 보이고, 칸을 누르면 onToggleKey(키, { shift, range }).
//       Shift+누르기 = 앞서 누른 줄부터 이 줄까지(화면 차례 — 접힌 묶음 줄은 빼고) range 로 넘긴다(useSelection 이 맞춘다).
//       머리 칸(PC 열 머리 · 모바일 맨 위 「전체」) = 넘긴 rows 전부(지금 거른 결과 — 접힌 묶음 줄 포함)를 onToggleAll.
//       묶음 머리줄 칸 = 그 묶음 줄 전부를 onToggleAll(일부만 골랐으면 가로줄). selectable 이면 groupLead 는 쓰지 않는다(그 자리가 이 칸).
//       칸 누르기는 줄 누르기(onRowClick — 상세 칸)로 가지 않는다. onRowClick 이 없으면 줄 누르기도 고르기다.
//       끌어 옮기기(onReorder · onRowDrop)와 함께면 고른 줄 손잡이 끌기 = 고른 줄 모두를 한 덩어리로(아래 체크한 줄 덩어리 — 올리는 값의 block)
//    📌 정렬 — Column.sortValue 가 있는 열 머리를 누르면 오름 → 내림 → 기본. 모바일은 맨 위 줄에 같은 정렬 단추(줄을 바꿔 감싼다) —
//       정렬할 열이 4개를 넘으면 「정렬 · <지금>」 단추 하나 → 아래 판(SortPicker).
//       sortState · onSortChange 를 주면 부르는 쪽이 쥔다(「기본 순서」 칩 · 기억 등), 안 주면 표 혼자. 정렬 중에는 끌어 옮기기를 잠근다
//       (손잡이는 자리를 지킨 채 흐리게 — 정렬된 차례로 저장되면 안 된다). 묶음 표는 묶음 안에서 정렬되고 묶음은 첫 줄 자리로 모인다.
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
  selectable = false,
  onToggleKey,
  onToggleAll,
  sortState,
  onSortChange,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  selectedKeys?: ReadonlySet<string>; // 여러 줄 고르기(그룹 지정 등) — 고른 줄을 selectedKey 와 같은 바탕으로. selectable 이면 고르기 칸 켜짐도 이것
  empty?: React.ReactNode;
  className?: string;
  onReorder?: (keys: string[], seg: string, moved: string, block?: string[]) => void; // 주면 줄 앞 손잡이로 끌어 옮긴다 — keys: 그 칸 줄들의 새 순서, moved: 옮긴 키, block: 고른 줄 덩어리째면 그 키들(keys 도 덩어리째 옮긴 차례)
  reorderLocked?: boolean; // 저장하는 동안 — 손잡이는 그대로 두고(표가 흔들리지 않게) 끌기만 막는다
  groupOf?: (row: T) => string; // 묶음 키 — "" 이면 묶지 않는 그냥 줄(위 묶음 줄 설명)
  openGroups?: ReadonlySet<string>; // 펼친 묶음 키
  onToggleGroup?: (key: string) => void;
  onRowDrop?: (drop: TableRowDrop) => void; // 묶음 표 · onReorder 와 함께 — 줄 하나를 묶음 안 · 밖 · 다른 묶음으로(useLineDrag)
  groupLead?: (key: string, rows: T[]) => React.ReactNode; // 머리줄 첫 열 자리 — rows: 그 묶음의 (보이는) 줄
  sectionOf?: (groupKey: string) => string; // 묶음의 상위 그룹("" = 없음) — 위 상위 머리줄 설명
  closedSections?: ReadonlySet<string>; // 접은 상위
  onToggleSection?: (section: string) => void;
  selectable?: boolean; // 고르기 칸 열(위 여러 개 고르기 설명)
  onToggleKey?: (key: string, opts: ToggleOpts) => void;
  onToggleAll?: (keys: string[]) => void;
  sortState?: SortState; // 주면 정렬을 부르는 쪽이 쥔다(null = 기본 순서)
  onSortChange?: (sort: SortState) => void;
}) {
  // 정렬 — 쥔 쪽이 없으면 표 혼자. 없는 열 · sortValue 없는 열을 가리키면 기본 순서
  const [innerSort, setInnerSort] = useState<SortState>(null);
  const sortWant = sortState !== undefined ? sortState : innerSort;
  const activeSort = sortWant && columns.some((c) => c.key === sortWant.key && c.sortValue) ? sortWant : null;
  const applySort = (next: SortState) => {
    if (sortState === undefined) setInnerSort(next);
    onSortChange?.(next);
  };
  const cycleSort = (key: string) => applySort(nextSort(activeSort, key));
  const shownRows = activeSort ? sortRows(rows, columns, activeSort) : rows;
  const dragLocked = reorderLocked || !!activeSort;
  // Shift 범위 고르기의 기준 — 마지막으로 누른 줄 키
  const [anchor, setAnchor] = useState<string | null>(null);
  const order: string[] = []; // 화면에 보이는 줄 키 차례(접힌 묶음 줄 빼고)
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
  // 그리는 차례의 줄 키 전부(접힌 묶음 줄 포함) — 체크한 줄 덩어리의 차례
  const drawKeys: string[] = [];
  const members = new Map<string, T[]>();
  // 상위 머리줄의 수 — 든 묶음 수 · 줄 수
  const secInfo = new Map<string, { groups: number; rows: number }>();
  if (!groupOf) shownRows.forEach((row) => {
    const k = rowKey(row);
    order.push(k);
    drawKeys.push(k);
    flat.push({ kind: "row", row, seg: LOOSE_SEG, si: segPush(LOOSE_SEG, k), inGroup: false, hidden: false, own: true, li: -1 });
  });
  else {
    for (const row of shownRows) {
      const g = groupOf(row) || "";
      if (!g) continue;
      const at = members.get(g);
      if (at) at.push(row);
      else members.set(g, [row]);
    }
    const placed = new Set<string>();
    for (const row of shownRows) {
      const g = groupOf(row) || "";
      if (!g) {
        const k = rowKey(row);
        order.push(k);
        drawKeys.push(k);
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
        if (open) order.push(mk);
        drawKeys.push(mk);
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
  // 📌 체크한 줄 덩어리(2026-10-18 운영자 "체크 표시 했으면 한 번에 옮겨져야지 왜 따로 움직여..?") — 고른 줄의 손잡이를 끌면
  //    이 표의 고른 줄 모두(그리는 차례 · 접힌 묶음 줄 포함, 둘 이상)가 한 덩어리로 간다. 묶음을 넘나드는 표는 고른 줄 전부, 칸 표(useRowDrag)는 그 칸의 고른 줄.
  //    안 고른 줄 · 머리줄(덩어리째)은 예전 그대로 그 하나만
  const pickedOn = (k: string) => selectable && !!selectedKeys?.has(k);
  const blockAll = selectable ? drawKeys.filter(pickedOn) : [];
  const lineBlockOf = (k: string) => (pickedOn(k) ? blockAll : null);
  const segBlockOf = (seg: string, k: string) => (pickedOn(k) ? (segs.get(seg) || []).filter(pickedOn) : null);
  const dnd = useRowDrag(segs, onReorder, dragLocked, { blockOf: segBlockOf });
  const ld = useLineDrag(lines, cross ? onRowDrop : undefined, dragLocked, lineBlockOf);
  if (shownRows.length === 0) return <EmptyRow>{empty}</EmptyRow>;
  const liftCls = "bg-white shadow-[0_14px_30px_-14px_rgba(0,0,0,0.35)]";
  const al = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");
  const titleCols = columns.filter((c) => c.mobile === "title");
  const metaCols = columns.filter((c) => c.mobile !== "title" && c.mobile !== "hide");
  const isSel = (k: string) => (selectedKey != null && selectedKey === k) || !!selectedKeys?.has(k);
  // 고르기 — 한 줄(Shift 면 범위) · 키 묶음(머리 칸 · 묶음 머리줄)
  const picked = (k: string) => !!selectedKeys?.has(k);
  const toggleKey = (k: string, ev: { shiftKey: boolean }) => {
    const shift = !!ev.shiftKey;
    const range = shift ? rangeOf(order, anchor, k) : undefined;
    setAnchor(k);
    onToggleKey?.(k, { shift, range });
  };
  const allKeys = selectable ? shownRows.map(rowKey) : [];
  const allPick = pickStateOf(allKeys, selectedKeys);
  const groupKeys = (g: string) => (members.get(g) || []).map(rowKey);
  const groupPick = (g: string) => {
    const keys = groupKeys(g);
    const s = pickStateOf(keys, selectedKeys);
    return <PickBox on={s.on} mixed={s.mixed} label={`${g} 선택`} onToggle={() => onToggleAll?.(keys)} />;
  };
  // 줄 누르기 — 상세(onRowClick). 없고 고르기 표면 고르기
  const clickRow: ((r: T, ev: { shiftKey: boolean }) => void) | undefined = onRowClick
    ? (r) => onRowClick(r)
    : selectable
      ? (r, ev) => toggleKey(rowKey(r), ev)
      : undefined;
  // 정렬 열 · 열 머리 글자
  const sortCols = columns.filter((c) => !!c.sortValue);
  const dirOf = (c: Column<T>) => (activeSort && activeSort.key === c.key ? activeSort.dir : null);
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
  const leadCol = !selectable && !!groupLead && columns.length > 1;
  // 📌 고르기 칸 열(selectable)도 같은 규칙 — 칸은 모든 줄이 같은 자리(pl-5), 첫 열이 묶음 들여쓰기(pl-10 = 머리줄 이름 글자)를 받는다
  const padOf = (i: number, inGroup: boolean) =>
    selectable
      ? i === 0 && inGroup ? "pl-10" : "pl-4"
      : i === 0 ? (leadCol ? "pl-5" : firstPad(inGroup)) : i === 1 && leadCol && inGroup ? "pl-10" : "pl-4";
  const stop = (ev: React.SyntheticEvent) => ev.stopPropagation();
  const pickTd = "w-px pl-5 pr-0 py-3 align-middle cursor-default";
  // 줄 끌기 — 묶음을 넘나들면(cross) 보이는 줄 번호(li · data-drag-line)로, 아니면 제 칸(seg · data-drag-row — own 인 줄만)으로
  const rowAttrs = (e: RowEntry<T>) => (cross ? { "data-drag-line": e.li } : e.own ? { "data-drag-row": "", "data-drag-seg": e.seg } : {});
  const rowHandle = (e: RowEntry<T>) => (cross ? ld.handleProps(e.li) : dnd.handleProps(e.seg, e.si));
  const rowMove = (e: RowEntry<T>) => (cross ? ld.lineStyle(e.li) : e.own ? dnd.rowStyle(e.seg, e.si) : undefined);
  const rowLifted = (e: RowEntry<T>) => (cross ? ld.isLifted(e.li) : e.own && dnd.isLifted(e.seg, e.si));
  // 덩어리를 끄는 동안 — 끈 줄 손잡이에 「N개」, 나머지 고른 줄은 흐리게(자리는 그대로 — 놓으면 그 줄들이 끈 자리로 모인다)
  const liftKey = ld.liftKey ?? dnd.liftKey;
  const liftN = ld.blockN || dnd.blockN;
  const dimCls = (k: string) => ((ld.inBlock(k) || dnd.inBlock(k)) && k !== liftKey ? "opacity-40" : "");
  const countOf = (k: string) => (k === liftKey && liftN > 1 ? liftN : undefined);
  const headAttrs = (e: GroupEntry) => (cross ? { "data-drag-line": e.li } : {});
  // 놓을 묶음 — 그 머리줄을 강조한다(바탕 + 왼쪽 잉크 줄)
  const dropOn = (g: string) => cross && ld.dropGroup === g;
  const dropBar = "shadow-[inset_3px_0_0_#131313]";
  // 머리줄 첫 열 자리(그룹 지정의 묶음째 고르기 칸) — 누르기가 펼치기로 가지 않게
  const leadOf = (g: string) => (groupLead && !selectable ? groupLead(g, members.get(g) || []) : null);

  // PC 한 줄
  const rowTr = (e: RowEntry<T>, line: string, style: React.CSSProperties | undefined, lifted: boolean) => {
    const r = e.row;
    const k = rowKey(r);
    // 접힌 묶음의 줄 — 열 폭만 잡는다(높이 0 · 안 보임 · 누를 수 없음). 가로 여백은 펼친 줄과 같게
    if (e.hidden) {
      return (
        <tr key={k} aria-hidden>
          {sortable && <td className="p-0 w-10 pl-3" />}
          {selectable && <td className="p-0 w-px pl-5" />}
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
        onClick={clickRow ? (ev) => clickRow(r, ev) : undefined}
        onMouseDown={clickRow && !onRowClick ? (ev) => { if (ev.shiftKey) ev.preventDefault(); } : undefined}
        tabIndex={clickRow ? 0 : undefined}
        aria-selected={clickRow ? sel : undefined}
        onKeyDown={clickRow ? (ev) => { if (ev.target !== ev.currentTarget) return; if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); clickRow(r, ev); } } : undefined}
        className={`${line} ${clickRow ? "cursor-pointer outline-none focus-visible:bg-[#f2f2f2] focus-visible:shadow-[inset_3px_0_0_#131313]" : ""} ${sel ? "bg-[#f2f2f2]" : clickRow ? "hover:bg-[#f7f7f7]" : ""} ${lifted ? liftCls : ""} ${dimCls(k)} transition-colors`}
      >
        {/* 손잡이 칸 — 손잡이 옆을 잘못 눌러도 상세 칸이 열리지 않게 칸째로 누르기를 막는다 */}
        {sortable && <td className="w-10 pl-3 py-3 align-middle cursor-default" onClick={stop}><DragHandle {...rowHandle(e)} count={countOf(k)} /></td>}
        {/* 고르기 칸 — 같은 까닭으로 칸째로 막는다(칸 누르기는 고르기만) */}
        {selectable && <td className={pickTd} onClick={stop}><PickBox on={picked(k)} onToggle={(ev) => toggleKey(k, ev)} /></td>}
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
        {selectable ? (
          // 고르기 표 — 고르기 칸 열 자리에 묶음째 고르기, 이름 칸은 그 다음 열부터(묶음 안 줄 첫 열 들여쓰기와 맞는다)
          <>
            <td className={`${pickTd} ${on && !sortable ? dropBar : ""}`} onClick={stop}>{groupPick(e.key)}</td>
            <td colSpan={columns.length} className="p-0">{toggle("pl-4 pr-5")}</td>
          </>
        ) : lead != null ? (
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
    if (selectable) {
      // 📌 고르기 표 — [손잡이] · 고르기 칸 · 누르는 몸통. 손잡이 · 칸은 모든 줄이 같은 자리(세로로 줄이 맞게),
      //    묶음 안 줄은 몸통만 머리줄 이름 글자에 맞춰 들인다(화살표 16 + 틈 8)
      return (
        <div key={k} {...(sortable ? rowAttrs(e) : {})} style={sortable ? rowMove(e) : undefined}
          className={`flex items-center gap-2 ${sortable ? "pl-2" : "pl-4"} ${sel ? "bg-[#f2f2f2]" : "bg-white"} ${sortable && rowLifted(e) ? liftCls : ""} ${dimCls(k)}`}>
          {sortable && <DragHandle {...rowHandle(e)} count={countOf(k)} />}
          <PickBox on={picked(k)} onToggle={(ev) => toggleKey(k, ev)} />
          {clickRow ? (
            <button type="button" onClick={(ev) => clickRow(r, ev)} onMouseDown={!onRowClick ? (ev) => { if (ev.shiftKey) ev.preventDefault(); } : undefined}
              className={`min-w-0 flex-1 block text-left py-3.5 pr-4 ${e.inGroup ? "pl-6" : ""} ${sel ? "" : "active:bg-[#f7f7f7]"}`}>{Body}</button>
          ) : (
            <div className={`min-w-0 flex-1 py-3.5 pr-4 ${e.inGroup ? "pl-6" : ""}`}>{Body}</div>
          )}
        </div>
      );
    }
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
    const lead = selectable ? groupPick(e.key) : leadOf(e.key);
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
              {selectable && (
                <th className="w-px pl-5 pr-0 py-2.5 text-left font-bold">
                  <PickBox on={allPick.on} mixed={allPick.mixed} label="전체 선택" onToggle={() => onToggleAll?.(allKeys)} />
                </th>
              )}
              {columns.map((c, i) => {
                const dir = dirOf(c);
                return (
                  <th
                    key={c.key}
                    aria-sort={c.sortValue ? (dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none") : undefined}
                    className={`py-2.5 font-bold whitespace-nowrap ${al(c.align)} ${i === 0 && !selectable ? "pl-5" : "pl-4"} ${i === columns.length - 1 ? "pr-5" : ""} ${c.className || ""}`}
                  >
                    {c.sortValue ? (
                      <button type="button" onClick={() => cycleSort(c.key)}
                        className={`inline-flex items-center gap-1 font-bold whitespace-nowrap outline-none transition-colors hover:text-[#131313] focus-visible:underline ${dir ? "text-[#131313]" : ""}`}>
                        {c.label}
                        <SortArrow dir={dir} />
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
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
                        <td colSpan={columns.length + (sortable ? 1 : 0) + (selectable ? 1 : 0)} className="p-0">{sectionToggle(u.sec, "pl-5 pr-5 py-2.5")}</td>
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
        {/* 맨 위 줄 — 열 머리가 없는 대신: 「전체」 고르기 · 정렬 단추(줄을 바꿔 감싼다) */}
        {(selectable || sortCols.length > 0) && (
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-2 pr-3 ${selectable ? (sortable ? "pl-2" : "pl-4") : "pl-4"}`}>
            {selectable && (
              <span className={`inline-flex ${sortable ? "pl-10" : ""}`}>
                <PickBox on={allPick.on} mixed={allPick.mixed} onToggle={() => onToggleAll?.(allKeys)}>전체</PickBox>
              </span>
            )}
            {sortCols.length > MOBILE_SORT_CHIPS ? (
              // 정렬할 열이 많으면 칩을 늘어놓지 않고 「정렬 · <지금>」 단추 하나 → 아래 판(SortPicker)
              <div className="ml-auto flex items-center">
                <SortPicker options={sortCols.map((c) => ({ key: c.key, label: c.sortLabel ?? c.label }))} sort={activeSort} onChange={applySort} />
              </div>
            ) : sortCols.length > 0 ? (
              <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                {sortCols.map((c) => {
                  const dir = dirOf(c);
                  return (
                    <button key={c.key} type="button" onClick={() => cycleSort(c.key)} aria-pressed={!!dir}
                      className={`${SORT_CHIP} ${dir ? "bg-[#131313] text-white" : "bg-[#f2f2f2] text-[#5a5a5a]"}`}>
                      {c.sortLabel ?? c.label}
                      <SortArrow dir={dir} />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
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

// ── 카드 보기 ──────────────────────────────────────────────
//    📌 표와 같은 목록을 그림 카드 격자로(「표 | 카드」의 카드). 카드 폭은 160~200px 안에서 화면 폭에 맞춰 열 수를 정한다(틈 16).
//       renderCard(줄, { selected, picked }) — 카드 안쪽만 그린다(틀 · 테두리 · 고르기 칸은 여기서).
//       onItemClick — 카드 누르기(상세 칸). 없고 selectable 이면 누르기 = 고르기.
//       고르기는 DataTable 과 같은 API(selectable · selectedKeys · onToggleKey · onToggleAll) — 칸은 카드 왼쪽 위, Shift 범위, 맨 위 「전체」.
//       groupOf 를 주면 묶음마다 소제목(이름 · 개수 · 묶음째 고르기 · 누르면 접고 펴기 — openGroups · onToggleGroup, 없으면 늘 펼침).
//       묶지 않은 줄("")은 소제목 없이 제자리 덩어리로. 정렬은 부르는 쪽이 sortRows 로 줄을 넘긴다(표와 같은 차례).
const CARD_GAP = 16;
// 열 수 — 카드 폭이 [min, max] 안에 드는 가장 적은 열(카드가 가장 크게). 둘 다 못 맞추면 범위에 더 가까운 쪽
const gridColsOf = (w: number, min: number, max: number) => {
  if (w <= 0) return 0;
  const cardW = (n: number) => (w - CARD_GAP * (n - 1)) / n;
  const lo = Math.max(1, Math.ceil((w + CARD_GAP) / (max + CARD_GAP)));
  const hi = Math.max(1, Math.floor((w + CARD_GAP) / (min + CARD_GAP)));
  if (lo <= hi) return lo;
  return Math.abs(min - cardW(lo)) <= Math.abs(cardW(hi) - max) ? lo : hi;
};
export function CardGrid<T>({
  items,
  itemKey,
  renderCard,
  onItemClick,
  selectedKey,
  selectable = false,
  selectedKeys,
  onToggleKey,
  onToggleAll,
  groupOf,
  openGroups,
  onToggleGroup,
  empty = "항목이 없습니다.",
  className = "",
  cardClassName = "",
  min = 160,
  max = 200,
}: {
  items: T[];
  itemKey: (item: T) => string;
  renderCard: (item: T, state: { selected: boolean; picked: boolean }) => React.ReactNode; // selected: 열린 것 또는 고른 것 · picked: 고른 것
  onItemClick?: (item: T) => void;
  selectedKey?: string | null; // 상세 칸에 열린 카드
  selectable?: boolean;
  selectedKeys?: ReadonlySet<string>;
  onToggleKey?: (key: string, opts: ToggleOpts) => void;
  onToggleAll?: (keys: string[]) => void;
  groupOf?: (item: T) => string;
  openGroups?: ReadonlySet<string>;
  onToggleGroup?: (key: string) => void;
  empty?: React.ReactNode;
  className?: string;
  cardClassName?: string;
  min?: number; // 카드 폭 하한(px)
  max?: number; // 카드 폭 상한(px)
}) {
  // 열 수 — 틀 폭을 재서(ResizeObserver 는 처음 붙일 때도 한 번 알린다 · 그리기 전에). 재기 전엔 CSS auto-fill
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(0);
  useLayoutEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setCols(gridColsOf(el.clientWidth, min, max)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, min, max]);
  const [anchor, setAnchor] = useState<string | null>(null);

  // 묶음 — 첫 줄 자리 차례(DataTable 과 같다). 묶지 않은 줄이 이어지면 소제목 없는 덩어리 하나
  type Sec = { key: string; group: string; items: T[] };
  const secs: Sec[] = [];
  if (!groupOf) secs.push({ key: "all", group: "", items });
  else {
    const byGroup = new Map<string, Sec>();
    for (const it of items) {
      const g = groupOf(it) || "";
      if (!g) {
        const last = secs[secs.length - 1];
        if (last && !last.group) last.items.push(it);
        else secs.push({ key: `loose:${itemKey(it)}`, group: "", items: [it] });
        continue;
      }
      const s = byGroup.get(g);
      if (s) s.items.push(it);
      else {
        const ns: Sec = { key: `group:${g}`, group: g, items: [it] };
        byGroup.set(g, ns);
        secs.push(ns);
      }
    }
  }
  const isOpen = (g: string) => !g || !onToggleGroup || !!openGroups?.has(g);
  const order: string[] = [];
  for (const s of secs) if (isOpen(s.group)) for (const it of s.items) order.push(itemKey(it));
  const allKeys = selectable ? items.map(itemKey) : [];
  const allPick = pickStateOf(allKeys, selectedKeys);
  const toggleKey = (k: string, ev: { shiftKey: boolean }) => {
    const shift = !!ev.shiftKey;
    const range = shift ? rangeOf(order, anchor, k) : undefined;
    setAnchor(k);
    onToggleKey?.(k, { shift, range });
  };
  const click: ((it: T, ev: { shiftKey: boolean }) => void) | undefined = onItemClick
    ? (it) => onItemClick(it)
    : selectable
      ? (it, ev) => toggleKey(itemKey(it), ev)
      : undefined;
  const gridStyle: React.CSSProperties = {
    display: "grid",
    gap: CARD_GAP,
    gridTemplateColumns: cols > 0 ? `repeat(${cols}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${min}px, 1fr))`,
  };

  const card = (it: T) => {
    const k = itemKey(it);
    const pk = !!selectedKeys?.has(k);
    const sel = (selectedKey != null && selectedKey === k) || pk;
    return (
      <div
        key={k}
        role={click ? "button" : undefined}
        tabIndex={click ? 0 : undefined}
        aria-pressed={click && !onItemClick ? pk : undefined}
        onClick={click ? (ev) => click(it, ev) : undefined}
        onMouseDown={click && !onItemClick ? (ev) => { if (ev.shiftKey) ev.preventDefault(); } : undefined}
        onKeyDown={click ? (ev) => { if (ev.target !== ev.currentTarget) return; if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); click(it, ev); } } : undefined}
        className={`relative min-w-0 rounded-2xl border bg-white overflow-hidden text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${
          sel ? "border-[#131313] ring-1 ring-[#131313]" : `border-[#ededed] ${click ? "hover:border-[#a3a3a3]" : ""}`
        } ${click ? "cursor-pointer" : ""} ${cardClassName}`}
      >
        {renderCard(it, { selected: sel, picked: pk })}
        {selectable && (
          <span className="absolute top-2 left-2 z-[1] inline-flex rounded-lg bg-white/90">
            <PickBox on={pk} inset={false} onToggle={(ev) => toggleKey(k, ev)} />
          </span>
        )}
      </div>
    );
  };
  // 묶음 소제목 — [묶음째 고르기] · 펼침 화살표 · 이름 · 개수. 고르기 칸은 카드 칸과 같은 가로 자리
  const head = (s: Sec) => {
    const open = isOpen(s.group);
    const keys = s.items.map(itemKey);
    const ps = pickStateOf(keys, selectedKeys);
    const inner = (
      <>
        <GroupChevron open={open} />
        <span className="min-w-0 truncate font-bold text-[#131313]">{s.group}</span>
        <StatusChip className="shrink-0 tabular-nums">{s.items.length}</StatusChip>
      </>
    );
    return (
      <div className="flex items-center gap-1 mb-3 pl-2 text-[14px]">
        {selectable && <PickBox on={ps.on} mixed={ps.mixed} inset={false} label={`${s.group} 선택`} onToggle={() => onToggleAll?.(keys)} />}
        {onToggleGroup ? (
          <button type="button" onClick={() => onToggleGroup(s.group)} aria-expanded={open}
            className="min-w-0 flex items-center gap-2 h-8 px-1 rounded-lg text-left outline-none hover:bg-[#f7f7f7] focus-visible:ring-2 focus-visible:ring-[#131313]/30">{inner}</button>
        ) : (
          <div className="min-w-0 flex items-center gap-2 h-8 px-1">{inner}</div>
        )}
      </div>
    );
  };

  return (
    <div ref={setEl} className={`min-w-0 ${className}`}>
      {items.length === 0 ? (
        <EmptyRow>{empty}</EmptyRow>
      ) : (
        <>
          {selectable && (
            <div className="flex items-center mb-3 pl-2">
              <PickBox on={allPick.on} mixed={allPick.mixed} inset={false} onToggle={() => onToggleAll?.(allKeys)}>전체</PickBox>
            </div>
          )}
          {secs.map((s, i) => (
            <section key={s.key} className={i > 0 ? "mt-6" : ""}>
              {s.group && head(s)}
              {isOpen(s.group) && <div style={gridStyle}>{s.items.map(card)}</div>}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

// ── 상세 칸 ────────────────────────────────────────────────
//    목록에서 한 줄을 누르면 PC 는 오른쪽에 붙는 칸(목록은 그대로 보이고 다른 줄을 눌러 바로 바꾼다),
//    모바일은 아래에서 올라오는 판. Esc 로 닫는다. 상세는 펼침이 아니라 팝업으로(관리 영역 원칙).
//    📌 docked(2026-10) — 1280 이상 · AdminPage 안이면 목록 옆에 붙은 열(덮지 않는다 · 페이지 머리 아래에서 화면 아래까지 · 스크롤해도 따라온다).
//       왼쪽 가장자리를 끌어 폭을 바꾸고(두 번 누르면 처음 폭 · 포커스 두고 ← → 로 24px 씩), 폭은 dockKey 마다 이 브라우저에 기억한다.
//       1280 미만은 예전 그대로(PC 오른쪽 덮는 칸 width · 모바일 아래 판). 아래 띠(SaveBar 등)는 목록 열 폭만 덮어 칸 아래 단추를 가리지 않는다.
//    nav — 머리에 ‹ › 와 「3 / 42」(index 는 0부터, -1 = 목록에 없음 「–」). Alt+↑ ↓ 로도 넘긴다(고르기 상자 안에선 안 함).
//    headerRight — 머리 오른쪽(‹ › · 닫기 앞)에 더 둘 것. onSave — Ctrl/⌘+S 로 부른다(칸 위에 창이 떠 있으면 그 창 차례 — 부르지 않는다).
//    📌 dirty — 저장 안 한 고친 것 표시(빨간 점). 넘기면(true · false) 점 자리를 늘 잡아 두고 깨끗할 땐 안 보이게만 —
//       점이 생기고 사라질 때 ‹ N / M › · 닫기가 옆으로 밀리지 않게(headerRight 로 점을 넣던 것). 안 넘기면 자리도 없다
//    Esc · 단축키는 칸 위에 덮개(확인 · 알림 · FormSheet · 거르기 판)가 있으면 양보한다.
//    📌 shaded(2026-10-17 승인 시안 shop-tidy ④) — 본문을 회색(#f2f2f2) 바탕으로, 그 위에 묶음마다 흰 판(PaneSection)을 쌓는다. 머리 · 아래 줄은 흰 그대로.
//       판 사이 간격은 PaneSection 이 잡는다(12px). 넘기지 않은 화면은 예전 모습 그대로(흰 바탕 · 안쪽 여백 20px). 모바일 아래 판도 같다
const DOCK_TOP = 72; // 사이트 위 줄 높이(PC)
const DOCK_MIN = 360;
const DOCK_MAX = 1200;
const DOCK_LIST_MIN = 480; // 끌어 넓힐 때 목록에 남길 폭
const NAV_BTN = "w-8 h-8 rounded-full inline-flex items-center justify-center text-[#5a5a5a] hover:text-[#131313] hover:bg-[#f2f2f2] outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-default";
export type PaneNav = { index: number; total: number; onPrev?: () => void; onNext?: () => void };
export function DetailPane({
  open,
  onClose,
  title,
  sub,
  badge,
  children,
  footer,
  width = 440,
  docked = false,
  dockKey,
  nav,
  headerRight,
  dirty,
  onSave,
  shaded = false,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  sub?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode; // 아래 고정 동작 줄
  width?: number; // 덮는 칸 폭 · 붙는 칸 처음 폭
  docked?: boolean; // 1280 이상에서 목록 옆에 붙는 열(위 설명)
  dockKey?: string; // 붙는 칸 폭을 기억할 이름(탭마다 따로 — 예 "shop-items")
  nav?: PaneNav; // ‹ › · 「3 / 42」
  headerRight?: React.ReactNode;
  dirty?: boolean; // 저장 안 한 고친 것 점(위 설명 — 넘기면 자리를 늘 잡는다)
  onSave?: () => void; // Ctrl/⌘+S
  shaded?: boolean; // 회색 바탕 + 흰 판(PaneSection) 묶음(위 설명)
}) {
  const dockEl = useContext(DockCtx);
  const wide = useMedia("(min-width: 1280px)");
  const dockOn = open && docked && wide && !!dockEl;
  const [savedW, setSavedW] = useStoredState<number>(docked ? `pane:${dockKey || "default"}` : null, width);
  const [dragW, setDragW] = useState<number | null>(null);
  const baseW = typeof savedW === "number" && Number.isFinite(savedW) ? savedW : width;
  const dockW = Math.round(Math.min(DOCK_MAX, Math.max(DOCK_MIN, dragW ?? baseW)));
  const asideRef = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; w: number; max: number; cur: number } | null>(null);
  // 단축키가 읽는 최신 값 — 칸이 열려 있는 동안 듣기를 다시 붙이지 않게(다른 창과의 듣는 차례가 흔들리지 않게)
  const live = useRef({ onClose, onSave, nav });
  useEffect(() => {
    live.current = { onClose, onSave, nav };
  });

  // 덮는 칸이 열려 있는 동안 본문(AdminPage)이 오른쪽을 비우도록 폭을 알린다(붙는 칸은 흐름 안이라 필요 없다)
  const overlayOn = open && !dockOn;
  useEffect(() => {
    if (!overlayOn) return;
    const root = document.documentElement;
    root.style.setProperty("--admin-pane", `${width}px`);
    return () => { root.style.removeProperty("--admin-pane"); };
  }, [overlayOn, width]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const { onClose: close, onSave: save, nav: nv } = live.current;
      const mod = e.ctrlKey || e.metaKey;
      // Ctrl/⌘+S — 브라우저 「페이지 저장」 대신 칸 저장. 칸 위에 창이 떠 있으면 그 창 차례
      if (save && mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!e.repeat && !overlayOpen()) save();
        return;
      }
      // Alt+↑ ↓ — 이전 · 다음
      if (nv && e.altKey && !mod && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        if (e.defaultPrevented || (e.target as HTMLElement | null)?.tagName === "SELECT" || overlayOpen()) return;
        const up = e.key === "ArrowUp";
        const ok = up ? nv.index > 0 : nv.index < nv.total - 1;
        const go = up ? nv.onPrev : nv.onNext;
        if (!go || !ok) return;
        e.preventDefault();
        go();
        return;
      }
      // 드롭다운이 먼저 받아 닫았으면(preventDefault) 칸은 그대로 — 한 번의 Esc 에 둘이 같이 닫혀 입력이 사라지던 것
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // 칸 위에 다른 덮개(확인 · 알림 · 미리보기 모달 · 창 · 거르기 판)가 떠 있으면 그 창 차례다
      if (overlayOpen()) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 붙는 칸 높이 — 칸 윗변(페이지 머리 아래 · 스크롤하면 위 줄 아래)부터 화면 아래까지. 아래 단추 줄이 늘 화면 안에
  useLayoutEffect(() => {
    if (!dockOn) return;
    const el = asideRef.current;
    if (!el) return;
    let raf = 0;
    const fit = () => {
      raf = 0;
      const top = Math.max(DOCK_TOP, el.parentElement ? el.parentElement.getBoundingClientRect().top : DOCK_TOP);
      el.style.height = `${Math.max(320, Math.round(window.innerHeight - top))}px`;
    };
    const req = () => { if (!raf) raf = requestAnimationFrame(fit); };
    fit();
    window.addEventListener("scroll", req, { passive: true });
    window.addEventListener("resize", req);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", req);
      window.removeEventListener("resize", req);
    };
  }, [dockOn]);

  // 폭 끌기 — 왼쪽 가장자리. 목록에 DOCK_LIST_MIN 은 남긴다. 놓을 때 기억
  const maxW = () => {
    const row = asideRef.current?.parentElement?.parentElement;
    return Math.max(DOCK_MIN, Math.min(DOCK_MAX, (row ? row.clientWidth : window.innerWidth) - DOCK_LIST_MIN));
  };
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: dockW, max: maxW(), cur: dockW };
    setDragW(dockW);
  };
  const moveResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.cur = Math.round(Math.min(d.max, Math.max(DOCK_MIN, d.w + d.x - e.clientX)));
    setDragW(d.cur);
  };
  const endResize = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragW(null);
    if (d.cur !== d.w) setSavedW(d.cur);
  };
  const keyResize = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    setSavedW(Math.min(maxW(), Math.max(DOCK_MIN, dockW + (e.key === "ArrowLeft" ? 24 : -24))));
  };
  const sheetBackdrop = useBackdrop(onClose);

  if (!open) return null;
  const prevOk = !!nav?.onPrev && nav.index > 0;
  const nextOk = !!nav?.onNext && nav.index < nav.total - 1;
  // 회색 바탕이면 머리 · 아래 줄과의 경계를 한 단계 진하게(#ededed 는 #f2f2f2 위에서 보이지 않는다)
  const edge = shaded ? "border-[#e0e0e0]" : "border-[#ededed]";
  const body = (
    <>
      <div className={`shrink-0 flex items-start gap-3 px-5 pt-5 pb-4 border-b ${edge}`}>
        <div className="min-w-0 flex-1">
          {badge && <div className="mb-2">{badge}</div>}
          <h2 className="text-[18px] font-black tracking-tight leading-snug break-keep">{title}</h2>
          {sub && <p className="mt-1 text-[13px] text-[#5a5a5a] break-keep">{sub}</p>}
        </div>
        {headerRight && <div className="shrink-0 flex items-center gap-2">{headerRight}</div>}
        {dirty !== undefined && (
          // 고친 것 점 자리 — 늘 잡아 둔다(‹ › 줄 높이에 맞춰 가운데)
          <span className="shrink-0 w-2 h-8 flex items-center">
            <span
              role={dirty ? "img" : undefined}
              aria-label={dirty ? "저장 안 함" : undefined}
              aria-hidden={dirty ? undefined : true}
              title={dirty ? "저장 안 함" : undefined}
              className={`w-2 h-2 rounded-full bg-[#e91e3f] ${dirty ? "" : "invisible"}`}
            />
          </span>
        )}
        {nav && (
          // 「3 / 42」 칸은 가장 긴 수 자리를 잡는다 — 넘길 때 ‹ › 가 흔들리지 않게
          <div className="shrink-0 flex items-center">
            <button type="button" aria-label="이전" disabled={!prevOk} onClick={() => nav.onPrev?.()} className={NAV_BTN}>
              <svg aria-hidden viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5l-5 5 5 5" /></svg>
            </button>
            <span className="text-center text-[12px] font-bold text-[#8a8a8a] tabular-nums" style={{ minWidth: `${String(nav.total).length * 2 + 3}ch` }}>
              {nav.index >= 0 ? nav.index + 1 : "–"} / {nav.total}
            </span>
            <button type="button" aria-label="다음" disabled={!nextOk} onClick={() => nav.onNext?.()} className={NAV_BTN}>
              <svg aria-hidden viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 5l5 5-5 5" /></svg>
            </button>
          </div>
        )}
        <CloseBtn onClick={onClose} />
      </div>
      {/* 📌 스크롤바 자리를 늘 잡는다 — 내용이 길어져 스크롤바가 생기면 폭이 줄어 탭 줄 · 칸이 옆으로 밀리던 것(인라인: 이 빌드는 임의 값 클래스 일부가 안 먹는다) */}
      <div
        data-pane-body={shaded ? "shaded" : undefined}
        className={`flex-1 min-h-0 overflow-y-auto ${shaded ? "bg-[#f2f2f2] p-3 md:p-3.5" : "px-5 py-4"}`}
        style={{ scrollbarGutter: "stable" }}
      >
        {children}
      </div>
      {/* 머리 · 아래 줄은 칸 판의 흰 바탕 그대로(모바일 판의 둥근 윗모서리를 덮지 않게 따로 칠하지 않는다) */}
      {footer && <div className={`shrink-0 border-t px-5 py-3.5 flex flex-wrap items-center gap-2 ${edge}`}>{footer}</div>}
    </>
  );
  if (dockOn && dockEl) {
    // 붙는 칸 — AdminPage 의 오른쪽 열 자리로(흐름 안 · 스크롤하면 위 줄 아래에 붙어 따라온다)
    return createPortal(
      <aside
        ref={asideRef}
        data-detail-pane
        role="dialog"
        aria-modal="false"
        aria-label={typeof title === "string" ? title : undefined}
        className={`sticky flex flex-col bg-white border-l ${edge} text-[#131313]`}
        style={{ top: DOCK_TOP, width: dockW, maxWidth: `calc(100vw - ${DOCK_LIST_MIN + 240}px)` }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="칸 폭"
          aria-valuenow={dockW}
          aria-valuemin={DOCK_MIN}
          aria-valuemax={DOCK_MAX}
          tabIndex={0}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onLostPointerCapture={endResize}
          onDoubleClick={() => setSavedW(width)}
          onKeyDown={keyResize}
          className="group/rs absolute top-0 bottom-0 -left-1.5 w-3 z-10 cursor-col-resize touch-none outline-none"
        >
          <span
            aria-hidden
            className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 transition-colors ${dragW != null ? "bg-[#131313]" : "bg-transparent group-hover/rs:bg-[#a3a3a3] group-focus-visible/rs:bg-[#131313]"}`}
            style={{ width: 2 }}
          />
        </div>
        {body}
      </aside>,
      dockEl,
    );
  }
  return (
    <>
      {/* PC — 오른쪽 칸 (목록을 가리지 않게 딤 없이) */}
      <aside data-detail-pane role="dialog" aria-modal="false" className={`hidden md:flex fixed top-0 right-0 bottom-0 z-[60] flex-col bg-white border-l ${edge} shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313]`} style={{ width }}>
        {body}
      </aside>
      {/* 모바일 — 아래에서 올라오는 판 */}
      <div data-detail-pane className="md:hidden fixed inset-0 z-[120] flex items-end bg-black/40" {...sheetBackdrop}>
        <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full max-h-[88dvh] flex flex-col rounded-t-2xl bg-white text-[#131313] pb-[env(safe-area-inset-bottom)]">
          {body}
        </div>
      </div>
    </>
  );
}

// ── 상세 칸 묶음(흰 판) ────────────────────────────────────
//    📌 shaded 상세 칸(회색 바탕) 위에 쌓는 묶음 하나(2026-10-17 승인 시안 shop-tidy ①) — 흰 판 · 각진 모서리 · 1px #e0e0e0 테.
//       머리 줄(높이 44 고정): 왼쪽 제목(14px) · 오른쪽 지금 값 한 줄(summary — 길면 잘린다, 머리 높이 · 제목 자리가 흔들리지 않게) · 접기 화살표.
//       collapsible — 머리 줄을 눌러 접고 편다(효과음 sfxTick). defaultOpen=false 면 처음에 접혀 있다(덜 쓰는 묶음).
//       storeKey — 접힘을 이 브라우저에 기억한다(useStoredState "sec:<키>" · 못 쓰는 창이면 조용히 처음 값). open · onOpenChange 를 주면 부르는 쪽이 쥔다
//       (저장할 때 접힌 묶음의 칸이 비었으면 펼쳐 보이기 등). 접힌 본문은 그려 둔 채 숨긴다(안 상태 · 입력이 그대로).
//       action — 머리 줄 오른쪽 끝에 둘 누르는 것(「아이템 수정 ›」 등 — 접기 단추 밖). changed — 제목 옆 빨간 점(넘기면 자리를 늘 잡는다).
//       flush — 본문 안쪽 여백 없이(미리보기 무대 등을 가장자리까지). 판 사이 12px · 본문 마지막 칸의 아래 여백은 여기서 맞춘다(Field 의 mb-4 가 겹치지 않게).
//       <DetailPane shaded …><PaneSection title="가격" summary="49,800 XP · 무제한" collapsible defaultOpen={false} storeKey="shop:prod:price">…</PaneSection></DetailPane>
//    (판 사이 — 같은 부모 안 마지막 <section> 만 빼고 아래 12px. 폼 끝의 숨은 제출 단추 같은 뒤 요소가 있어도 끝 판에 틈이 남지 않게 :last-of-type)
const PANE_SEC_CSS = ".admin-sec:not(:last-of-type){margin-bottom:12px}.admin-sec-body>:last-child{margin-bottom:0}";
export function PaneSection({
  title,
  summary,
  collapsible = false,
  defaultOpen = true,
  storeKey,
  open: openProp,
  onOpenChange,
  action,
  changed,
  flush = false,
  id,
  className = "",
  bodyClassName = "",
  children,
}: {
  title: React.ReactNode;
  summary?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  storeKey?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  action?: React.ReactNode;
  changed?: boolean;
  flush?: boolean;
  id?: string;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}) {
  const [stored, setStored] = useStoredState<boolean>(collapsible && storeKey ? `sec:${storeKey}` : null, defaultOpen);
  const isOpen = !collapsible || (openProp ?? stored !== false);
  const bodyId = useId();
  const toggle = () => {
    const next = !isOpen;
    sfxTick();
    if (openProp === undefined) setStored(next);
    onOpenChange?.(next);
  };
  const head = (
    <>
      {/* 제목은 제 폭을 먼저 잡고(제목 자체가 넘칠 때만 잘린다), 값 한 줄은 남는 폭 안에서 잘린다(flex-1 · 0 바탕) */}
      <span className="min-w-0 flex items-center gap-1.5">
        <span className="min-w-0 truncate text-[14px] font-black tracking-tight">{title}</span>
        {changed !== undefined && (
          <span aria-label={changed ? "바뀜" : undefined} aria-hidden={changed ? undefined : true} role={changed ? "img" : undefined} className={`shrink-0 w-1.5 h-1.5 rounded-full bg-[#e91e3f] ${changed ? "" : "invisible"}`} />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-right text-[12px] font-bold text-[#5a5a5a] tabular-nums">{summary}</span>
      {collapsible && (
        <svg aria-hidden viewBox="0 0 20 20" className={`w-4 h-4 shrink-0 text-[#8a8a8a] group-hover/sec:text-[#131313] transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 8l5 5 5-5" />
        </svg>
      )}
    </>
  );
  return (
    <section id={id} className={`admin-sec min-w-0 bg-white border border-[#e0e0e0] text-[#131313] ${className}`}>
      <style href="admin-pane-section" precedence="medium">{PANE_SEC_CSS}</style>
      <div className={`h-11 flex items-center gap-2 ${action ? "pr-3" : ""} ${isOpen ? "border-b border-[#ededed]" : ""}`}>
        {collapsible ? (
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={bodyId}
            onClick={toggle}
            className="group/sec min-w-0 flex-1 self-stretch flex items-center gap-2 px-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#131313]/30"
          >
            {head}
          </button>
        ) : (
          <div className="min-w-0 flex-1 self-stretch flex items-center gap-2 px-4">{head}</div>
        )}
        {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
      </div>
      <div id={bodyId} hidden={!isOpen} className={`admin-sec-body ${flush ? "" : "px-4 pt-3.5 pb-4"} ${bodyClassName}`}>
        {children}
      </div>
    </section>
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

// ── 목록 빈 상태 ───────────────────────────────────────────
export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="py-12 text-center text-[13px] text-[#5a5a5a] rounded-2xl border border-dashed border-[#e0e0e0]">{children}</div>;
}

// ── 결과 알림 모달 ─────────────────────────────────────────
//    notify() 로 띄우고, noticeEl 을 페이지 맨 끝에 한 번 렌더한다.
//    관리자 화면은 결과를 놓치면 안 되는 조작이 많아 토스트가 아니라 모달을 쓴다.
//    📌 효과음(2026-10-17) — useToast 와 같이 뜰 때마다 성공은 sfxOk, 실패(isError)는 sfxErr 를 같이 울린다(화면마다 감싸 울리던 것을 한 곳에서).
//       useNotice({ sound: false }) 로 화면째 끄거나, notify(글, 실패?, { sound: false }) 로 한 번만 끈다(이미 따로 울린 곳)
export function useNotice({ sound = true }: { sound?: boolean } = {}) {
  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false });
  const notify = useCallback(
    (message: string, isError = false, opts?: { sound?: boolean }) => {
      setPopup({ isOpen: true, message, isError });
      if (opts?.sound ?? sound) (isError ? sfxErr : sfxOk)();
    },
    [sound],
  );
  const close = useCallback(() => setPopup((p) => ({ ...p, isOpen: false })), []);
  const backdrop = useBackdrop(close);
  const noticeEl = popup.isOpen ? (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4 overlay-in" {...backdrop}>
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
//    📌 효과음(2026-10) — 뜰 때마다 성공은 sfxOk, 실패(isError)는 sfxErr 를 같이 울린다(화면마다 따로 만들던 소리를 한 곳에서).
//       useToast({ sound: false }) 로 화면째 끄거나, toast(글, 실패?, { sound: false }) 로 한 번만 끈다(이미 따로 울린 곳)
const TOAST_POS = `.admin-toast { bottom: calc(96px + var(--admin-bar, 0px)); } @media (min-width: 768px) { .admin-toast { bottom: calc(24px + var(--admin-bar, 0px)); } }`;
export function useToast({ sound = true }: { sound?: boolean } = {}) {
  const [toast, setToast] = useState<{ msg: string; error: boolean; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const show = useCallback((msg: string, isError = false, opts?: { sound?: boolean }) => {
    setToast({ msg, error: isError, id: Date.now() });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), isError ? 4000 : 2600);
    if (opts?.sound ?? sound) (isError ? sfxErr : sfxOk)();
  }, [sound]);
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
  const backdrop = useBackdrop(busy ? undefined : onCancel);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4 overlay-in" {...backdrop}>
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

// ── 입력 창(FormSheet) ─────────────────────────────────────
//    📌 일괄 편집 · 이름 바꾸기 · 설정 같은 작은 입력 창 — 화면마다 따로 만들던 창 틀을 한 벌로.
//       PC(640 이상)는 가운데 창(폭 width — 560~720 사이로 맞춘다), 모바일은 아래에서 올라오는 판(최대 88dvh).
//       머리(제목 · 한 줄 sub · 닫기) · 본문(children — 스크롤) · 아래 단추 줄(footer — 오른쪽 정렬). Esc · 바깥 누르기 · 닫기로 닫힌다.
//       busy — 처리하는 동안 닫기(Esc · 바깥 · ×)와 안의 입력 · 단추를 모두 잠근다(fieldset disabled).
//       onSubmit 을 주면 창이 <form> 이 된다 — 입력칸 Enter · footer 의 <Btn type="submit"> · Ctrl/⌘+S 가 onSubmit(busy 면 무시).
//       창 위에 확인 · 알림이 또 뜨면 Esc 는 그 창 차례. 닫히면 열기 전 포커스로 돌아간다.
//       flush — 본문 여백 · 본문 스크롤 없이(children 이 창 높이를 받아 칸마다 따로 스크롤 — 목록 + 편집 두 칸 창). 폭은 1080 까지
export function FormSheet({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  busy = false,
  width = 600,
  flush = false,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  busy?: boolean;
  width?: number; // PC 창 폭(560~720 · flush 면 1080 까지)
  flush?: boolean;
  onSubmit?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLElement | null>(null);
  const setBox = useCallback((el: HTMLElement | null) => { box.current = el; }, []);
  const live = useRef({ onClose, onSubmit, busy });
  useEffect(() => {
    live.current = { onClose, onSubmit, busy };
  });
  // 열 때 창으로 포커스(안에서 autoFocus 한 칸이 있으면 그대로), 닫을 때 열기 전 자리로
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const b = box.current;
    if (b && !b.contains(document.activeElement)) b.focus({ preventScroll: true });
    return () => { if (prev && prev.isConnected) prev.focus({ preventScroll: true }); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const { onClose: close, onSubmit: submit, busy: locked } = live.current;
      const mod = e.ctrlKey || e.metaKey;
      if (submit && mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s") {
        if (layerAbove(root.current)) return;
        e.preventDefault();
        if (!e.repeat && !locked) submit();
        return;
      }
      if (e.key !== "Escape" || e.defaultPrevented || layerAbove(root.current)) return;
      e.preventDefault();
      if (!locked) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const backdrop = useBackdrop(busy ? undefined : onClose);
  if (!open) return null;
  const w = Math.min(flush ? 1080 : 720, Math.max(560, width));
  const panelCls =
    "w-full max-h-[88dvh] sm:max-h-[84dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white border border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313] pb-[env(safe-area-inset-bottom)] sm:pb-0 outline-none";
  const label = typeof title === "string" ? title : undefined;
  const inner = (
    <>
      <div className="shrink-0 flex items-start gap-3 px-5 pt-5 pb-4 border-b border-[#ededed]">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-black tracking-tight leading-snug break-keep">{title}</h2>
          {sub && <p className="mt-1 text-[13px] text-[#5a5a5a] break-keep">{sub}</p>}
        </div>
        <CloseBtn onClick={onClose} disabled={busy} />
      </div>
      {flush ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <fieldset disabled={busy} className="flex-1 min-h-0 min-w-0 flex flex-col m-0 p-0 border-0">{children}</fieldset>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4" style={{ scrollbarGutter: "stable" }}>
          <fieldset disabled={busy} className="min-w-0 m-0 p-0 border-0">{children}</fieldset>
        </div>
      )}
      {footer && (
        <div className="shrink-0 border-t border-[#ededed] px-5 py-3.5">
          <fieldset disabled={busy} className="min-w-0 m-0 p-0 border-0">
            <div className="flex flex-wrap items-center justify-end gap-2">{footer}</div>
          </fieldset>
        </div>
      )}
    </>
  );
  const common = {
    ref: setBox,
    role: "dialog",
    "aria-modal": true,
    "aria-label": label,
    "aria-busy": busy || undefined,
    tabIndex: -1,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    className: panelCls,
    style: { maxWidth: w },
  } as const;
  return (
    <div ref={root} data-admin-layer className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in" {...backdrop}>
      {onSubmit ? (
        <form {...common} onSubmit={(e) => { e.preventDefault(); if (!busy) onSubmit(); }}>{inner}</form>
      ) : (
        <div {...common}>{inner}</div>
      )}
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
