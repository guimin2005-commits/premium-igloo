"use client";

// 📌 유물 꾸미기 창(2026-11-02 운영자 시안 합격 "좋다" · 주사위 단추 추가) — 인벤토리 꾸미기에서 「사건의 지평선」 [꾸미기] 로 그 자리에 연다
//    배지 창(Inventory.js BadgeWindow)과 같은 판: 먹 #131313 · 옅은 격자 · 고른 코어 색 번짐 · 홈 칸 · 흰 알약 단추
//    PC: 왼쪽 미리보기 카드(글자 없음 · 움직임 + 이어지는 연출) · 오른쪽 코어 색 칸 넷 + 조각 네 줄(라벨 옆 고른 이름 · 칸엔 번호만) · 오른쪽 아래 [주사위] [적용]
//    폰: 바닥 창 — 미리보기 240 · 코어 색 · 같은 폭 밑줄 탭 넷(탭 줄 안 움직임) · 그 조각 1 · 2 · 3 · 아래 [주사위] [적용]
//    한 묶음: 코어 색 하나 + 조각마다 1 · 2 · 3(「안 씀」 없음). 고르면 미리보기가 바로 바뀌고 「적용」 한 번에 저장(바뀐 게 없으면 꺼짐)
//    주사위 — 코어 색 · 조각 넷을 무작위로 골라 미리보기에(저장은 「적용」)
import { useEffect, useMemo, useRef, useState } from "react";
import RelicLayers from "./RelicLayers";
import { CORE_KEYS, PIECES, NAMES2, RELIC_NAME, coreName, coreColors, normPick, randomPick } from "@/lib/relic";
import { relicPieceThumb } from "@/lib/relic/thumb";

const SLOT_BG = "#0c0c0c";
const slotShadow = (on) => `${on ? "0 0 0 2px #ffffff" : "0 0 0 1px #262626"}, inset 2px 2px 0 rgba(0,0,0,0.55), inset -1px -1px 0 rgba(255,255,255,0.06)`;
const FOCUS = "outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70";
const same = (a, b) => ["core", "frame", "border", "bg", "bar"].every((k) => a?.[k] === b?.[k]);
const glowOf = (core) => { const n = parseInt(coreColors(core).p2.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0.24)`; };

// 미리보기 카드 — 360 × 556 판을 w 폭으로 줄여(인벤토리 무대 카드와 같은 자리 · 사진 (76, 76) 지름 68)
function PreviewCard({ pick, w, image, name }) {
  const k = w / 360;
  return (
    <div className="relative overflow-hidden shrink-0" style={{ width: w, height: Math.round(556 * k), borderRadius: 24 * k, boxShadow: "0 0 0 1px rgba(255,255,255,0.12), 0 18px 40px -18px rgba(0,0,0,0.85)" }}>
      <div className="absolute left-0 top-0 overflow-hidden" style={{ width: 360, height: 556, transform: `scale(${k})`, transformOrigin: "0 0", background: "#06050a" }}>
        <RelicLayers pick={pick} preview />
        <div className="absolute flex items-center justify-center" style={{ left: 42, top: 42, width: 68, height: 68, zIndex: 5 }}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" draggable={false} className="rounded-full object-cover" style={{ width: 68, height: 68 }} />
          ) : (
            <span className="rounded-full bg-white/10 flex items-center justify-center text-2xl font-black text-white/60" style={{ width: 68, height: 68 }}>{(name || "?").slice(0, 1)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
const Dice = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="4" y="4" width="16" height="16" rx="3.5" />
    <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" /><circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export default function RelicWindow({ cur, onClose, onSave, busy = false, onTone, image = "", name = "" }) {
  const [draft, setDraft] = useState(() => normPick(cur));
  const [tab, setTab] = useState("frame"); // 폰 조각 탭
  const saved = normPick(cur), dirty = !same(draft, saved);
  const closeRef = useRef(null);
  // 열리면 닫기 단추에 포커스, 닫히면 연 단추로 돌려준다 · Esc 는 이 창만(뒤 가방까지 가지 않게)
  useEffect(() => {
    const back = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => { if (back && typeof back.focus === "function") back.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key !== "Escape") return; e.stopPropagation(); onClose(); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  // 고르기 칸 그림 — 코어 색 · 조각 · 번호마다 한 장(조각만 그린다 — 다른 조각과 상관없다)
  const thumbs = useMemo(() => {
    if (typeof document === "undefined") return {};
    const out = {};
    for (const [p] of PIECES) out[p] = [1, 2, 3].map((n) => relicPieceThumb({ core: draft.core, frame: 1, border: 1, bg: 1, bar: 1, [p]: n }, p));
    return out;
  }, [draft.core]);
  const pickPiece = (p, n) => { if (draft[p] === n) return; setDraft((d) => ({ ...d, [p]: n })); onTone?.(); };
  const pickCore = (k) => { if (draft.core === k) return; setDraft((d) => ({ ...d, core: k })); onTone?.(); };
  const roll = () => { setDraft((d) => randomPick(d)); onTone?.(); };
  const apply = async () => { if (!dirty || busy) return; await onSave(draft); };

  const swatches = (size) => (
    <div className="flex gap-2.5">
      {CORE_KEYS.map((k) => {
        const c = coreColors(k), on = draft.core === k;
        return (
          <button key={k} type="button" aria-pressed={on} aria-label={coreName(k)} title={coreName(k)} onClick={() => pickCore(k)}
            className={`relative shrink-0 flex items-center justify-center transition-[filter] ${on ? "" : "hover:brightness-125"} ${FOCUS}`}
            style={{ width: size, height: size, background: SLOT_BG, boxShadow: slotShadow(on) }}>
            <span aria-hidden className="block rounded-full" style={{ width: size / 2, height: size / 2, background: c.p3, boxShadow: `inset 0 0 0 2px ${c.p1}` }}></span>
          </button>
        );
      })}
    </div>
  );
  const tile = (p, n, size, full = false) => {
    const on = draft[p] === n;
    return (
      <button key={n} type="button" aria-pressed={on} aria-label={`${n} ${NAMES2[p][n - 1]}`} title={NAMES2[p][n - 1]} onClick={() => pickPiece(p, n)}
        className={`relative shrink-0 overflow-hidden transition-[filter] ${on ? "" : "hover:brightness-125"} ${full ? "aspect-square w-full" : ""} ${FOCUS}`}
        style={{ ...(full ? {} : { width: size, height: size }), background: SLOT_BG, boxShadow: slotShadow(on) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumbs[p]?.[n - 1] && <img src={thumbs[p][n - 1]} alt="" draggable={false} className="block w-full h-full pointer-events-none" />}
        <span aria-hidden className={`absolute top-[5px] left-[7px] text-[10px] font-black leading-none tabular-nums pointer-events-none ${on ? "text-white" : "text-white/40"}`}>{n}</span>
      </button>
    );
  };
  const label = (head, val) => (
    <div className="flex items-baseline gap-2 h-[14px]">
      {head && <span className="text-[11px] font-bold leading-none text-white/45">{head}</span>}
      <span className="text-[12px] font-black leading-none text-white/90">{val}</span>
    </div>
  );
  const btnDice = (cls) => (
    <button type="button" onClick={roll} aria-label="무작위로 고르기" title="무작위"
      className={`shrink-0 rounded-full border border-white/15 text-white/70 hover:text-white hover:border-white/35 transition-colors flex items-center justify-center ${FOCUS} ${cls}`}>
      <Dice />
    </button>
  );
  const btnApply = (cls) => (
    <button type="button" onClick={apply} disabled={!dirty || busy}
      className={`rounded-full bg-white text-[#131313] text-[12px] font-black transition-[opacity,background-color] hover:bg-white/90 disabled:opacity-35 disabled:hover:bg-white ${FOCUS} ${cls}`}>
      적용
    </button>
  );

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={RELIC_NAME} aria-busy={busy || undefined} onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:w-auto sm:max-w-[940px] max-h-[92dvh] sm:max-h-[94vh] overflow-hidden rounded-t-2xl sm:rounded-2xl shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)] flex flex-col"
        style={{ background: "#131313", animation: "tierIn .32s cubic-bezier(0.16,1,0.3,1)" }}>
        <div aria-hidden className="absolute inset-0 lux-grid-bg-dark opacity-60 pointer-events-none"></div>
        <div aria-hidden className="absolute -top-28 -right-16 w-72 h-72 blur-[100px] rounded-full pointer-events-none" style={{ background: glowOf(draft.core), transition: "background-color .5s ease" }}></div>
        <div aria-hidden className="sm:hidden relative z-10 flex justify-center pt-2.5"><span className="w-10 h-1 rounded-full bg-white/20"></span></div>

        {/* 머리 — 배지 창과 같은 문법(아이콘 · 제목 · 닫기) */}
        <div className="relative z-10 shrink-0 px-5 sm:px-7 pt-4 sm:pt-7 flex items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-3">
            <svg aria-hidden viewBox="0 0 24 24" className="w-[22px] h-[22px] shrink-0 text-white/55" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="5" /><ellipse cx="12" cy="12" rx="10" ry="3.2" transform="rotate(-24 12 12)" />
            </svg>
            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-none truncate">{RELIC_NAME}</h3>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기"
            className="shrink-0 w-9 h-9 rounded-full border border-white/15 text-white/55 hover:text-white hover:border-white/35 transition-colors flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* PC */}
        <div className="hidden sm:flex relative z-10 gap-9 px-7 pt-6 pb-7">
          <PreviewCard pick={draft} w={360} image={image} name={name} />
          <div className="w-[488px] h-[556px] flex flex-col">
            <div>
              {label("코어 색", coreName(draft.core))}
              <div className="mt-2">{swatches(40)}</div>
            </div>
            <div className="mt-[22px] flex flex-col gap-3">
              {PIECES.map(([p, head]) => (
                <div key={p}>
                  {label(head, NAMES2[p][draft[p] - 1])}
                  <div className="mt-2 flex gap-2.5">{[1, 2, 3].map((n) => tile(p, n, 76))}</div>
                </div>
              ))}
            </div>
            <div className="mt-auto flex items-center justify-end gap-2">
              {btnDice("w-10 h-10")}
              {btnApply("h-10 px-7")}
            </div>
          </div>
        </div>

        {/* 폰 */}
        <div className="sm:hidden relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pt-5">
          <div className="flex justify-center"><PreviewCard pick={draft} w={240} image={image} name={name} /></div>
          <div className="mt-6">
            {label("코어 색", coreName(draft.core))}
            <div className="mt-2">{swatches(40)}</div>
          </div>
          <div role="tablist" className="mt-5 grid grid-cols-4 shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]">
            {PIECES.map(([p, head]) => (
              <button key={p} type="button" role="tab" aria-selected={tab === p} onClick={() => { setTab(p); onTone?.(); }}
                className={`py-2.5 text-[11px] font-black text-center ${tab === p ? "text-white shadow-[inset_0_-2px_0_#fff]" : "text-white/45"} ${FOCUS}`}>
                {head}
              </button>
            ))}
          </div>
          <div className="mt-3.5">{label("", NAMES2[tab][draft[tab] - 1])}</div>
          <div className="mt-2 grid grid-cols-3 gap-3 pb-4">{[1, 2, 3].map((n) => tile(tab, n, 0, true))}</div>
        </div>
        <div className="sm:hidden relative z-10 shrink-0 flex items-center gap-2 px-5 pt-3" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
          {btnDice("w-11 h-11")}
          {btnApply("flex-1 h-11")}
        </div>
      </div>
    </div>
  );
}
