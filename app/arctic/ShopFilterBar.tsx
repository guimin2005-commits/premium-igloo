"use client";

import React, { useEffect, useRef, useState } from "react";
import { ICON_PATHS } from "../components/Icons";
import type { PriceBucket } from "./priceBuckets";

// 📌 상점 목록 필터 줄 — 일반 탭 · 시즌 탭이 같은 한 벌 (국내 쇼핑몰식 한 줄 바).
//    PC: 왼쪽 토글 칩(재고 있음 · 구매 가능) + "가격 ▾" 칩(누르면 구간 목록), 오른쪽 개수 · 정렬.
//    폰: 왼쪽 "필터" 버튼(켜진 필터 수) → 아래에서 올라오는 시트, 오른쪽 개수 · 정렬.
//    📌 줄이 움직이지 않게(메모: tabs-never-move)
//       · 토글 칩은 체크 표시를 늘 그려 두고 색만 바꾼다 — 켜고 꺼도 폭 그대로.
//       · 글자가 바뀌는 가격 칩은 왼쪽 무리의 맨 끝 — 폭이 늘어도 옆 칩이 밀리지 않는다.
//       · 오른쪽 개수 · 정렬은 오른쪽 정렬 + 정렬 버튼 폭 고정(가장 긴 "낮은 가격순" + ▾ 실측 약 80px) — 자릿수 · 정렬 이름이 바뀌어도 그대로.
//       · 가격 구간이 없는 탭(상품 3개 미만)은 가격 칩만 빠진다 — 줄 높이 · 다른 칩 자리는 그대로.

export type ShopFilterValue = { price: string; inStock: boolean; afford: boolean };

const EMPTY: ShopFilterValue = { price: "all", inStock: false, afford: false };

const LINE = "border-[#e0e0e0]";
// 키보드로 왔을 때만 보이는 포커스 고리 — 칩 안 버튼(가격 · ×) · 정렬 · 목록 줄이 같이 쓴다
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/25";
const CHIP = `h-8 inline-flex items-center rounded-full border bg-white text-[13px] font-bold whitespace-nowrap transition-colors ${FOCUS}`;
const PANEL = "absolute top-full mt-2 z-40 rounded-2xl border border-[#ededed] bg-white py-2 shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)]";

const Caret = ({ open = false }: { open?: boolean }) => (
  <svg aria-hidden className={`w-3 h-3 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.6} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);
const Check = ({ className = "" }: { className?: string }) => (
  <svg aria-hidden className={`w-3.5 h-3.5 shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.check} />
  </svg>
);

// 켜고 끄는 칩 — 켜지면 잉크 테두리 · 잉크 체크. 꺼져도 체크 자리는 그대로(옅은 체크)
function ToggleChip({ on, onClick, children, className = "" }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`${CHIP} gap-1.5 pl-2.5 pr-3.5 ${on ? "border-[#131313] text-[#131313]" : `${LINE} text-[#5a5a5a] hover:border-[#a3a3a3] hover:text-[#131313]`} ${className}`}>
      <Check className={on ? "text-[#131313]" : "text-[#c4c4c4]"} />
      {children}
    </button>
  );
}

// 목록 한 줄(가격 구간 · 정렬) — 고른 것은 잉크 + 체크. 키보드는 ↑ ↓ 로 옮겨 다닌다(Tab 은 목록을 건너뛰어 다음 칸으로 → 목록이 닫힌다)
function OptionRow({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" role="option" aria-selected={on} tabIndex={-1} onClick={onClick}
      className={`w-full h-9 px-4 flex items-center justify-between gap-3 text-left text-[13px] font-bold whitespace-nowrap transition-colors outline-none hover:bg-black/[0.03] focus-visible:bg-black/[0.05] ${on ? "text-[#131313]" : "text-[#5a5a5a] hover:text-[#131313] focus-visible:text-[#131313]"}`}>
      {label}
      {on && <Check className="text-[#131313]" />}
    </button>
  );
}

// 📌 목록 팝오버(가격 · 정렬) 한 벌 — 바깥을 누르거나 Esc · Tab 으로 벗어나면 닫힌다.
//    · 키보드: 버튼에서 ↓ ↑ 로 열면 고른 항목(없으면 첫 항목)으로, 목록 안에서는 ↑ ↓ Home End 로 옮긴다.
//    · 고르거나 Esc 로 닫으면 포커스를 버튼으로 되돌린다(항목이 사라지며 포커스가 body 로 떨어지지 않게).
const optionsIn = (wrap: HTMLElement | null) => Array.from(wrap?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);

function usePopover() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const focusList = useRef(false);
  // 닫기 — 항목을 고르거나 × 로 풀 때는 refocus 로 버튼에 포커스를 되돌린다(바깥을 누른 경우는 그 자리 그대로)
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    if (focusList.current) {
      focusList.current = false;
      const opts = optionsIn(wrapRef.current);
      (opts.find((o) => o.getAttribute("aria-selected") === "true") || opts[0])?.focus();
    }
    const onDown = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    // Esc 는 문서 전체에서 — 클릭해도 포커스를 안 주는 브라우저(사파리)에서도 닫히게
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const inside = !!wrapRef.current?.contains(document.activeElement);
      setOpen(false);
      if (inside) btnRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    if (!open) {
      if (e.target === btnRef.current && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        focusList.current = true;
        setOpen(true);
      }
      return;
    }
    const opts = optionsIn(wrapRef.current);
    if (!opts.length) return;
    e.preventDefault();
    const i = opts.indexOf(document.activeElement as HTMLElement);
    const n = opts.length;
    const next = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1;
    opts[next]?.focus();
  };
  // Tab 으로 칸 밖에 포커스가 나가면 닫는다
  const onBlur = (e: React.FocusEvent) => {
    if (open && e.relatedTarget && !wrapRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
  };
  return { open, setOpen, wrapRef, btnRef, close, onKeyDown, onBlur };
}

export default function ShopFilterBar({
  buckets, value, onChange, showAfford, count, sort, sorts, onSort,
}: {
  /** 지금 탭의 가격 구간 (lib 는 ./priceBuckets) — 비면 가격 칩을 숨긴다 */
  buckets: PriceBucket[];
  /** price 는 고른 구간의 v, 없으면 "all" — 목록에 없는 값이면 고르지 않은 것으로 본다 */
  value: ShopFilterValue;
  onChange: (next: ShopFilterValue) => void;
  /** 구매 가능 칩 — 로그인했을 때만 */
  showAfford: boolean;
  count: number;
  sort: string;
  sorts: { v: string; l: string }[];
  onSort: (v: string) => void;
}) {
  const picked = buckets.find((b) => b.v === value.price) || null;
  const activeCount = (picked ? 1 : 0) + (value.inStock ? 1 : 0) + (showAfford && value.afford ? 1 : 0);

  const { open: priceOpen, setOpen: setPriceOpen, wrapRef: priceWrapRef, btnRef: priceBtnRef, close: closePrice, onKeyDown: priceKeyDown, onBlur: priceBlur } = usePopover();
  const { open: sortOpen, setOpen: setSortOpen, wrapRef: sortWrapRef, btnRef: sortBtnRef, close: closeSort, onKeyDown: sortKeyDown, onBlur: sortBlur } = usePopover();
  // 구간이 없는 탭으로 바뀌면(가격 칩이 빠지면) 열림 상태도 접는다 — 나중에 칩이 돌아올 때 목록이 저절로 열려 있지 않게
  if (priceOpen && buckets.length === 0) setPriceOpen(false);

  // 폰 시트 — 고르는 동안은 초안, [적용] 에서 한 번에 건다
  const [sheet, setSheet] = useState(false);
  const [draft, setDraft] = useState<ShopFilterValue>(EMPTY);
  const sheetBtnRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const openSheet = () => { setDraft({ ...value, price: picked ? picked.v : "all" }); setSheet(true); };
  // 📌 시트가 떠 있는 동안 — 포커스는 시트 안(Tab 이 시트 안에서만 돈다), Esc · md 폭 이상(시트가 숨는 폭)이면 닫는다.
  //    닫히면 "필터" 버튼으로 포커스를 되돌린다. 뒤 화면 스크롤 잠금은 전역 ScrollLock(fixed inset-0 오버레이 감지)이 한다 —
  //    body 에 overflow 를 직접 걸면 globals.css 경고대로 sticky 가 죽는다
  useEffect(() => {
    if (!sheet) return;
    const opener = sheetBtnRef.current;
    sheetRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSheet(false); return; }
      if (e.key !== "Tab" || !sheetRef.current) return;
      const f = Array.from(sheetRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input, [tabindex]:not([tabindex='-1'])"));
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === sheetRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (at === last || !sheetRef.current.contains(at))) { e.preventDefault(); first.focus(); }
    };
    const mq = window.matchMedia("(min-width: 768px)");
    const onMq = () => { if (mq.matches) setSheet(false); };
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
      opener?.focus({ preventScroll: true });
    };
  }, [sheet]);

  const setPrice = (v: string) => { onChange({ ...value, price: v }); closePrice(true); };
  const sortLabel = sorts.find((s) => s.v === sort)?.l ?? sorts[0]?.l;

  // 가격 구간 목록 — 단위가 바뀌는 자리(XP → 빙옥)에 가는 선
  const unitBreak = (i: number) => i > 0 && buckets[i].unit !== buckets[i - 1].unit;

  return (
    <>
      <div className="flex items-center gap-2 pb-4 md:pb-5 border-b border-[#ededed]">
        {/* 폰 — 필터 시트 버튼. 켜진 필터 수를 잉크 배지로 */}
        <button ref={sheetBtnRef} type="button" onClick={openSheet} aria-haspopup="dialog" aria-expanded={sheet}
          className={`md:hidden ${CHIP} gap-1.5 pl-3 ${activeCount ? "pr-1.5 border-[#131313] text-[#131313]" : `pr-3.5 ${LINE} text-[#5a5a5a]`}`}>
          <svg aria-hidden className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
          필터
          {activeCount > 0 && (
            <span className="min-w-[20px] h-5 px-1 rounded-full bg-[#131313] text-white text-[11px] font-black flex items-center justify-center tabular-nums">{activeCount}</span>
          )}
        </button>

        {/* PC — 토글 칩 · 가격 칩 */}
        <div className="hidden md:flex items-center gap-2 min-w-0">
          <ToggleChip on={value.inStock} onClick={() => onChange({ ...value, inStock: !value.inStock })}>재고 있음</ToggleChip>
          {showAfford && (
            <ToggleChip on={value.afford} onClick={() => onChange({ ...value, afford: !value.afford })}>구매 가능</ToggleChip>
          )}
          {buckets.length > 0 && (
            // 📌 가격 칩은 고르기 전 · 후 같은 버튼 하나(글자만 바뀐다) — 고른 뒤 × 만 옆에 붙는다.
            //    버튼이 바뀌어 사라지면 고르는 순간 포커스가 body 로 떨어진다
            <div ref={priceWrapRef} className="relative" onKeyDown={priceKeyDown} onBlur={priceBlur}>
              <span className={`${CHIP} ${picked ? "border-[#131313] text-[#131313]" : priceOpen ? "border-[#a3a3a3] text-[#131313]" : `${LINE} text-[#5a5a5a] hover:border-[#a3a3a3] hover:text-[#131313]`}`}>
                <button ref={priceBtnRef} type="button" onClick={() => setPriceOpen((o) => !o)}
                  aria-haspopup="listbox" aria-expanded={priceOpen} aria-label={picked ? `가격 ${picked.l}` : undefined}
                  className={`h-full flex items-center gap-1 pl-3.5 ${picked ? "pr-1 rounded-l-full" : "pr-3 rounded-full"} ${FOCUS}`}>
                  {picked ? picked.l : <>가격<span className="text-[#a3a3a3]"><Caret open={priceOpen} /></span></>}
                </button>
                {picked && (
                  <button type="button" onClick={() => { onChange({ ...value, price: "all" }); closePrice(true); }} aria-label="가격 해제"
                    className={`h-full pl-1 pr-2.5 flex items-center rounded-r-full text-[#5a5a5a] hover:text-[#131313] ${FOCUS}`}>
                    <svg aria-hidden className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
                  </button>
                )}
              </span>
              {priceOpen && (
                <div role="listbox" aria-label="가격" className={`${PANEL} left-0 min-w-[176px]`} style={{ animation: "menuDrop 0.2s cubic-bezier(0.16,1,0.3,1)" }}>
                  <OptionRow on={!picked} label="전체" onClick={() => setPrice("all")} />
                  {buckets.map((b, i) => (
                    <React.Fragment key={b.v}>
                      {unitBreak(i) && <div aria-hidden className="mx-4 my-1.5 h-px bg-[#ededed]" />}
                      <OptionRow on={picked?.v === b.v} label={b.l} onClick={() => setPrice(b.v)} />
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 개수 · 정렬 — 오른쪽 끝에 붙고 정렬 버튼은 폭 고정 */}
        <div className="ml-auto shrink-0 flex items-center gap-2">
          <span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums whitespace-nowrap">{count.toLocaleString()}개</span>
          <div ref={sortWrapRef} className="relative" onKeyDown={sortKeyDown} onBlur={sortBlur}>
            <button ref={sortBtnRef} type="button" onClick={() => setSortOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={sortOpen}
              className={`h-8 w-[84px] flex items-center justify-end gap-1 text-[13px] font-bold text-[#131313] whitespace-nowrap rounded-full ${FOCUS}`}>
              {sortLabel}
              <span className="text-[#a3a3a3]"><Caret open={sortOpen} /></span>
            </button>
            {sortOpen && (
              <div role="listbox" aria-label="정렬" className={`${PANEL} right-0 w-[148px]`} style={{ animation: "menuDrop 0.2s cubic-bezier(0.16,1,0.3,1)" }}>
                {sorts.map((s) => (
                  <OptionRow key={s.v} on={s.v === sort} label={s.l} onClick={() => { onSort(s.v); closeSort(true); }} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 폰 — 아래에서 올라오는 필터 시트 (화면 이동 없이 그 자리에서) */}
      {sheet && (
        <div className="md:hidden fixed inset-0 z-[145] flex items-end bg-black/40" onClick={() => setSheet(false)}>
          <div ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="필터" onClick={(e) => e.stopPropagation()}
            className="w-full max-h-[85dvh] flex flex-col rounded-t-2xl bg-white text-[#131313] pb-[env(safe-area-inset-bottom)] outline-none"
            style={{ animation: "filterSheetUp 0.3s cubic-bezier(0.16,1,0.3,1)" }}>
            <div className="shrink-0 h-14 pl-5 pr-3 flex items-center justify-between border-b border-[#ededed]">
              <h2 className="text-[16px] font-black">필터</h2>
              <button type="button" onClick={() => setSheet(false)} aria-label="닫기"
                className={`w-9 h-9 rounded-full flex items-center justify-center text-[#5a5a5a] hover:text-[#131313] hover:bg-black/[0.05] transition-colors ${FOCUS}`}>
                <svg aria-hidden className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-5 pb-6">
              {buckets.length > 0 && (
                <section className="mb-7">
                  <h3 className="text-[13px] font-black mb-3">가격</h3>
                  <div className="flex flex-wrap gap-2">
                    {buckets.map((b, i) => {
                      const on = draft.price === b.v;
                      return (
                        <React.Fragment key={b.v}>
                          {/* 단위가 바뀌면(XP → 빙옥) 줄을 바꾼다 */}
                          {unitBreak(i) && <span aria-hidden className="basis-full h-0" />}
                          <button type="button" aria-pressed={on} onClick={() => setDraft((d) => ({ ...d, price: on ? "all" : b.v }))}
                            className={`h-9 px-3.5 rounded-full border text-[13px] font-bold whitespace-nowrap transition-colors ${on ? "bg-[#131313] border-[#131313] text-white" : `bg-white ${LINE} text-[#5a5a5a]`}`}>
                            {b.l}
                          </button>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </section>
              )}
              <section>
                <h3 className="text-[13px] font-black mb-3">조건</h3>
                <div className="flex flex-wrap gap-2">
                  <ToggleChip className="!h-9" on={draft.inStock} onClick={() => setDraft((d) => ({ ...d, inStock: !d.inStock }))}>재고 있음</ToggleChip>
                  {showAfford && (
                    <ToggleChip className="!h-9" on={draft.afford} onClick={() => setDraft((d) => ({ ...d, afford: !d.afford }))}>구매 가능</ToggleChip>
                  )}
                </div>
              </section>
            </div>

            <div className="shrink-0 flex gap-2 px-5 py-3 border-t border-[#ededed]">
              <button type="button" onClick={() => setDraft(EMPTY)}
                className={`w-[104px] h-12 rounded-full border ${LINE} inline-flex items-center justify-center gap-1.5 text-[14px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors`}>
                <svg aria-hidden className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                초기화
              </button>
              <button type="button" onClick={() => { onChange({ ...draft, afford: showAfford && draft.afford }); setSheet(false); }}
                className="flex-1 h-12 rounded-full bg-[#131313] hover:bg-[#3a3a3a] text-white text-[14px] font-bold transition-colors">
                적용
              </button>
            </div>
          </div>
          <style dangerouslySetInnerHTML={{ __html: `@keyframes filterSheetUp { 0% { transform: translateY(100%); } 100% { transform: translateY(0); } }` }} />
        </div>
      )}
    </>
  );
}
