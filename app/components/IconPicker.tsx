"use client";

import React from "react";
import { ICON_PRESETS, ICON_PRESET_GROUPS, ICON_PRESET_PREFIX, ICON_MAX, presetKeyOf } from "@/lib/items";
import { PresetIcon } from "./ItemIcon";

// 📌 아이콘 고르기 — 위는 이모지·짧은 글자 입력 한 칸, 아래는 기본 제공 SVG 격자.
//    격자를 누르면 "svg:<key>", 입력칸에 치면 그 글자. 프리셋이 선택된 동안 입력칸은 비워 보인다.
//    관리자 아이템 폼 / 상품 폼 두 벌이 같이 쓴다 — 입력칸 스타일만 각자 넘긴다.
const DEFAULT_INPUT =
  "w-full bg-white border border-[#dedddb] rounded-lg px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] placeholder:text-[#a3a3a3] disabled:bg-[#f4f3f2] disabled:text-[#8a8a8a]";

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
  const text = selKey ? "" : value || "";

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
      {/* 묶음별 격자 — 일반 / 권한. 라벨은 작게 한 줄 */}
      {ICON_PRESET_GROUPS.map((grp) => (
        <div key={grp.g} className="mt-2">
          <p className="text-[10px] font-bold text-[#a3a3a3] mb-1.5">{grp.label}</p>
          <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5">
            {ICON_PRESETS.filter((p) => p.g === grp.g).map((p) => {
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
                  className={`aspect-square rounded-lg border flex items-center justify-center transition-colors outline-none focus:outline-none disabled:opacity-40 disabled:cursor-default ${
                    on ? "border-[#131313] ring-2 ring-[#131313] bg-black/[0.04]" : "border-[#dedddb] bg-white hover:border-[#a3a3a3]"
                  }`}
                >
                  <PresetIcon k={p.key} size={20} color={color} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
