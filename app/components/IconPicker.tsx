"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ICON_PRESETS,
  ICON_PRESET_GROUPS,
  ICON_PRESET_PREFIX,
  ICON_MAX,
  presetKeyOf,
  ITEM_ARTS,
  ITEM_ART_GROUPS,
  ART_PREFIX,
  artKeyOf,
} from "@/lib/items";
import { PresetIcon, ArtIcon } from "./ItemIcon";

// 📌 아이콘 고르기 — 위는 이모지·짧은 글자 입력 한 칸 + 고른 아이콘 이름 한 줄, 아래는 탭(일러스트 · 일반 · 권한) + 격자.
//    일러스트를 누르면 "art:<key>", 선 프리셋은 "svg:<key>", 입력칸에 치면 그 글자. 고른 동안 입력칸은 비워 보인다.
//    고른 칸을 다시 누르면 해제.
//    일러스트 탭: 검색(이름 · 묶음 이름, 띄어쓰기 무시 — 묶음 상관없이 전부에서 찾음) + 묶음 알약 한 줄(가로 스크롤, 줄바꿈 없음) + 격자.
//      "전체"는 묶음마다 소제목(스크롤 중 위에 붙음), suggest(일러스트 key 목록)를 주면 맨 앞에 "추천" 묶음.
//    격자는 칸 최소 44px · 폭만큼 열이 늘어난다(auto-fill, 인라인 — 이 빌드는 임의 grid-template 클래스가 안 먹는다).
//    판 높이 고정(PANEL_H, 안에서 스크롤) · 이름 줄도 높이 고정 — 탭 · 묶음 · 검색을 바꿔도 탭 줄 · 아래 폼이 움직이지 않는다.
//    관리자 아이템 폼 / 상품 폼 / 상점 인라인 폼이 같이 쓴다 — 입력칸 스타일만 각자 넘긴다.
const DEFAULT_INPUT =
  "w-full bg-white border border-[#ededed] rounded-lg px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] placeholder:text-[#a3a3a3] disabled:bg-[#f4f3f2] disabled:text-[#8a8a8a]";

const ART_TAB = "art";
const TABS = [{ id: ART_TAB, label: "일러스트" }, ...ICON_PRESET_GROUPS.map((g) => ({ id: g.g, label: g.label }))];

const ALL = "all";
const SUGGEST = "suggest";
const CHIPS = [{ v: ALL, l: "전체" }, ...ITEM_ART_GROUPS.map((g) => ({ v: g.g, l: g.label }))];

// 판 높이 — 검색(36) · 알약(36) · 격자, 사이 8씩
const PANEL_H = 344;
const ROW_H = 36;
const GAP = 8;
const ART_GRID_H = PANEL_H - GAP - ROW_H - GAP - ROW_H - GAP;
const PRESET_GRID_H = PANEL_H - GAP;
const GRID_STYLE: React.CSSProperties = { gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))" };

const ART_BY_KEY = new Map(ITEM_ARTS.map((a) => [a.key, a]));
const PRESET_BY_KEY = new Map(ICON_PRESETS.map((p) => [p.key, p]));
const GROUP_LABEL = new Map(ITEM_ART_GROUPS.map((g) => [g.g, g.label]));
// 검색 — 소문자 · 띄어쓰기 없앰("골드카드" = "골드 카드"). 이름 · key · 묶음 이름에서 찾는다
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const HAY = new Map(ITEM_ARTS.map((a) => [a.key, norm(`${a.label} ${a.key} ${GROUP_LABEL.get(a.group) || ""}`)]));

type Section = { id: string; label: string; keys: string[] };

const cellClass = (on: boolean) =>
  `aspect-square rounded-lg border flex items-center justify-center transition-colors outline-none focus:outline-none focus-visible:border-[#131313] disabled:opacity-40 disabled:cursor-default ${
    on ? "border-[#131313] ring-2 ring-[#131313] bg-black/[0.04]" : "border-[#ededed] bg-white hover:border-[#a3a3a3]"
  }`;

export default function IconPicker({
  value,
  onChange,
  color = "#131313",
  disabled = false,
  inputClassName,
  className = "",
  suggest,
}: {
  value: string;
  onChange: (v: string) => void;
  color?: string;
  disabled?: boolean;
  inputClassName?: string;
  className?: string;
  suggest?: string[]; // 일러스트 key — "전체" 맨 앞 "추천" 묶음(목록에 없는 key 는 버림)
}) {
  const selKey = presetKeyOf(value);
  const selArt = artKeyOf(value);
  const text = selKey || selArt ? "" : value || "";
  // 처음 탭 — 고른 아이콘이 있는 묶음, 없으면 일러스트
  const [tab, setTab] = useState<string>(() =>
    selArt ? ART_TAB : selKey ? ICON_PRESETS.find((p) => p.key === selKey)?.g || ART_TAB : ART_TAB,
  );
  const [group, setGroup] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const q = norm(query);

  const suggestKey = (suggest || []).join(",");
  const suggested = useMemo(
    () => Array.from(new Set(suggestKey ? suggestKey.split(",") : [])).filter((k) => ART_BY_KEY.has(k)),
    [suggestKey],
  );

  // 보일 묶음 — 검색 중이면 전부에서 찾고(알약 무시), 아니면 고른 알약
  const sections = useMemo<Section[]>(() => {
    if (q) {
      return ITEM_ART_GROUPS.map((g) => ({
        id: g.g,
        label: g.label,
        keys: ITEM_ARTS.filter((a) => a.group === g.g && (HAY.get(a.key) || "").includes(q)).map((a) => a.key),
      })).filter((s) => s.keys.length > 0);
    }
    const groups = group === ALL ? ITEM_ART_GROUPS : ITEM_ART_GROUPS.filter((g) => g.g === group);
    const out: Section[] = groups.map((g) => ({ id: g.g, label: g.label, keys: ITEM_ARTS.filter((a) => a.group === g.g).map((a) => a.key) }));
    if (group === ALL && suggested.length > 0) out.unshift({ id: SUGGEST, label: "추천", keys: suggested });
    return out;
  }, [q, group, suggested]);
  // 소제목 — "전체" · 검색 결과에만(한 묶음만 볼 땐 알약이 이미 말해 준다)
  const showHeads = !!q || group === ALL;
  const chipOn = q ? ALL : group;

  // 📌 격자 스크롤 — 처음 · 탭을 바꾸면 고른 칸을 가운데로, 묶음 · 검색을 바꾸면 맨 위로.
  //    같은 값으로 다시 돌면(개발 모드 이중 실행) 그대로 둔다
  const scrollRef = useRef<HTMLDivElement>(null);
  const prev = useRef<{ tab: string; group: string; q: string } | null>(null);
  useLayoutEffect(() => {
    const box = scrollRef.current;
    const p = prev.current;
    prev.current = { tab, group, q };
    if (!box) return;
    if (p && p.tab === tab && p.group === group && p.q === q) return;
    let top = 0;
    if (!p || p.tab !== tab) {
      const cur = tab === ART_TAB ? selArt : selKey;
      const el = cur ? box.querySelector<HTMLElement>(`[data-k="${cur}"]`) : null;
      if (el) top = Math.max(0, el.offsetTop - (box.clientHeight - el.offsetHeight) / 2);
    }
    box.scrollTop = top;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, group, q]);

  // 📌 알약 줄 — 마우스 휠(세로)을 가로 스크롤로. 끝에 닿으면 페이지 스크롤로 넘긴다(React onWheel 은 막을 수 없어 직접 붙임)
  const chipsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chipsRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const next = Math.min(max, Math.max(0, el.scrollLeft + dy));
      if (next === el.scrollLeft) return;
      e.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [tab]);

  const pickGroup = (v: string, btn: HTMLButtonElement) => {
    setQuery("");
    setGroup(v);
    // 반쯤 가린 알약을 누르면 다 보이게 — 줄 안에서만 민다(페이지는 그대로)
    const row = chipsRef.current;
    if (row) {
      const l = btn.offsetLeft - 4;
      const r = btn.offsetLeft + btn.offsetWidth + 4 - row.clientWidth;
      if (l < row.scrollLeft) row.scrollLeft = l;
      else if (r > row.scrollLeft) row.scrollLeft = r;
    }
  };

  const selArtInfo = selArt ? ART_BY_KEY.get(selArt) : undefined;
  const selPresetInfo = selKey ? PRESET_BY_KEY.get(selKey) : undefined;

  const artCell = (k: string) => {
    const a = ART_BY_KEY.get(k);
    if (!a) return null;
    const on = selArt === k;
    return (
      <button
        key={k}
        type="button"
        data-k={k}
        title={a.label}
        aria-label={a.label}
        aria-pressed={on}
        disabled={disabled}
        onClick={() => onChange(on ? "" : `${ART_PREFIX}${k}`)}
        className={cellClass(on)}
      >
        <ArtIcon k={k} size={32} />
      </button>
    );
  };

  return (
    <div className={className}>
      <input
        type="text"
        value={text}
        maxLength={ICON_MAX}
        disabled={disabled}
        placeholder="🐧"
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName || DEFAULT_INPUT}
      />

      {/* 고른 아이콘 — 한 줄 · 높이 고정(안 골랐으면 빈 줄) */}
      <div className="h-7 flex items-center gap-1.5 min-w-0 text-[12px]" aria-live="polite">
        {selArtInfo ? (
          <>
            <ArtIcon k={selArt} size={16} className="shrink-0" />
            <span className="min-w-0 truncate font-bold text-[#131313]">{selArtInfo.label}</span>
            <span className="shrink-0 text-[#a3a3a3]">{GROUP_LABEL.get(selArtInfo.group)}</span>
          </>
        ) : selPresetInfo ? (
          <>
            <PresetIcon k={selKey} size={14} color={color} className="shrink-0" />
            <span className="min-w-0 truncate font-bold text-[#131313]">{selPresetInfo.label}</span>
          </>
        ) : null}
      </div>

      {/* 탭 — 같은 폭 · 같은 굵기, 고른 탭은 밑줄과 글자색만 바뀐다 */}
      <div role="tablist" className="grid border-b border-[#ededed]" style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              className={`h-9 -mb-px border-b-2 text-[12px] font-bold whitespace-nowrap transition-colors outline-none focus:outline-none ${
                on ? "border-[#131313] text-[#131313]" : "border-transparent text-[#a3a3a3] hover:text-[#5a5a5a]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 판 — 높이 고정, 격자만 안에서 스크롤 */}
      <div role="tabpanel" style={{ height: PANEL_H, paddingTop: GAP }}>
        {tab === ART_TAB ? (
          <>
            <label className="relative block" style={{ height: ROW_H }}>
              <svg aria-hidden viewBox="0 0 24 24" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a8a8a]" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="search"
                value={query}
                placeholder="검색"
                aria-label="일러스트 검색"
                onChange={(e) => setQuery(e.target.value)}
                // 폼 안이라 Enter 가 저장(제출)으로 가지 않게
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                  if (e.key === "Escape" && query) {
                    e.preventDefault();
                    setQuery("");
                  }
                }}
                className="w-full h-full pl-9 pr-3 rounded-full border border-[#a3a3a3] bg-white text-[14px] text-[#131313] outline-none placeholder:text-[#a3a3a3] focus:border-[#131313] focus:ring-2 focus:ring-[#131313]/10"
              />
            </label>

            {/* 묶음 알약 — 한 줄 고정, 넘치면 가로 스크롤(줄바꿈 없음). 검색 중엔 "전체"로 보인다 */}
            <div
              ref={chipsRef}
              className="relative flex items-center overflow-x-auto no-bar p-1 rounded-full bg-[#f2f2f2]"
              style={{ height: ROW_H, marginTop: GAP }}
            >
              {CHIPS.map((c) => {
                const on = chipOn === c.v;
                return (
                  <button
                    key={c.v}
                    type="button"
                    aria-pressed={on}
                    onClick={(e) => pickGroup(c.v, e.currentTarget)}
                    className={`shrink-0 h-7 px-3 rounded-full text-[12px] font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${
                      on ? "bg-white text-[#131313] ring-1 ring-black/[0.06]" : "text-[#5a5a5a] hover:text-[#131313]"
                    }`}
                  >
                    {c.l}
                  </button>
                );
              })}
            </div>

            <div ref={scrollRef} className="relative overflow-y-auto overscroll-contain" style={{ height: ART_GRID_H, marginTop: GAP }}>
              {sections.length === 0 ? (
                <div className="flex items-center justify-center text-[13px] text-[#a3a3a3]" style={{ height: "100%" }}>
                  없음
                </div>
              ) : (
                <div className="p-0.5">
                  {sections.map((s) => (
                    <div key={s.id} className="mb-2 last:mb-0">
                      {showHeads && (
                        <p className="sticky top-0 z-[1] h-7 flex items-center bg-white text-[11px] font-bold text-[#8a8a8a]">
                          {s.label}
                          <span className="ml-1 font-normal text-[#a3a3a3] tabular-nums">{s.keys.length}</span>
                        </p>
                      )}
                      <div className="grid gap-1.5" style={GRID_STYLE}>
                        {s.keys.map(artCell)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div ref={scrollRef} className="relative overflow-y-auto overscroll-contain" style={{ height: PRESET_GRID_H }}>
            <div className="p-0.5 grid gap-1.5" style={GRID_STYLE}>
              {ICON_PRESETS.filter((p) => p.g === tab).map((p) => {
                const on = selKey === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    data-k={p.key}
                    title={p.label}
                    aria-label={p.label}
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => onChange(on ? "" : `${ICON_PRESET_PREFIX}${p.key}`)}
                    className={cellClass(on)}
                  >
                    <PresetIcon k={p.key} size={20} color={color} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
