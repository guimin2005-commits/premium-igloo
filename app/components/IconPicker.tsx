"use client";

import React, { useState } from "react";
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

// 📌 아이콘 고르기 — 위는 이모지·짧은 글자 입력 한 칸, 아래는 탭(일러스트 · 일반 · 권한) + 격자.
//    일러스트를 누르면 "art:<key>", 선 프리셋은 "svg:<key>", 입력칸에 치면 그 글자. 고른 동안 입력칸은 비워 보인다.
//    탭 줄은 같은 폭 칸, 격자 판은 높이 고정(안에서 스크롤) — 탭을 바꿔도 탭 줄·아래 폼이 움직이지 않는다.
//    관리자 아이템 폼 / 상품 폼 두 벌이 같이 쓴다 — 입력칸 스타일만 각자 넘긴다.
const DEFAULT_INPUT =
  "w-full bg-white border border-[#ededed] rounded-lg px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] placeholder:text-[#a3a3a3] disabled:bg-[#f4f3f2] disabled:text-[#8a8a8a]";

const ART_TAB = "art";
const TABS = [{ id: ART_TAB, label: "일러스트" }, ...ICON_PRESET_GROUPS.map((g) => ({ id: g.g, label: g.label }))];

const cellClass = (on: boolean) =>
  `aspect-square rounded-lg border flex items-center justify-center transition-colors outline-none focus:outline-none disabled:opacity-40 disabled:cursor-default ${
    on ? "border-[#131313] ring-2 ring-[#131313] bg-black/[0.04]" : "border-[#ededed] bg-white hover:border-[#a3a3a3]"
  }`;

export default function IconPicker({
  value,
  onChange,
  color = "#131313",
  disabled = false,
  inputClassName,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  color?: string;
  disabled?: boolean;
  inputClassName?: string;
  className?: string;
}) {
  const selKey = presetKeyOf(value);
  const selArt = artKeyOf(value);
  const text = selKey || selArt ? "" : value || "";
  // 처음 탭 — 고른 아이콘이 있는 묶음, 없으면 일러스트
  const [tab, setTab] = useState<string>(() =>
    selArt ? ART_TAB : selKey ? ICON_PRESETS.find((p) => p.key === selKey)?.g || ART_TAB : ART_TAB,
  );

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

      {/* 탭 — 같은 폭 · 같은 굵기, 고른 탭은 밑줄과 글자색만 바뀐다 */}
      <div role="tablist" className="mt-2 grid border-b border-[#ededed]" style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}>
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

      {/* 격자 판 — 높이 고정, 넘치면 안에서 스크롤 */}
      <div role="tabpanel" className="overflow-y-auto overscroll-contain pt-2 pr-0.5" style={{ height: 228 }}>
        {tab === ART_TAB
          ? ITEM_ART_GROUPS.map((grp) => (
              <div key={grp.g} className="mb-2.5 last:mb-0">
                <p className="text-[10px] font-bold text-[#a3a3a3] mb-1.5">{grp.label}</p>
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                  {ITEM_ARTS.filter((a) => a.group === grp.g).map((a) => {
                    const on = selArt === a.key;
                    return (
                      <button
                        key={a.key}
                        type="button"
                        title={a.label}
                        aria-label={a.label}
                        aria-pressed={on}
                        disabled={disabled}
                        onClick={() => onChange(on ? "" : `${ART_PREFIX}${a.key}`)}
                        className={cellClass(on)}
                      >
                        <ArtIcon k={a.key} size={32} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          : (
              <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5">
                {ICON_PRESETS.filter((p) => p.g === tab).map((p) => {
                  const on = selKey === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
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
            )}
      </div>
    </div>
  );
}
