"use client";

import React, { useState, useRef, useEffect } from "react";

// 📌 커스텀 셀렉트 — 네이티브 <select>의 브라우저 기본 UI를 대체
//    theme "light": IGLOO SHOP 등 밝은 화면 / "dark": 관리자 화면
export type DropdownOption = {
  value: string;
  label: string;
  hint?: string;   // 우측 보조 텍스트
  color?: string;  // 좌측 점 색상 (디스코드 역할 등)
  indent?: boolean;
  group?: boolean; // 선택 불가한 구분 헤더
};

export default function Dropdown({
  value,
  options,
  onChange,
  placeholder = "선택하세요",
  theme = "dark",
  className = "",
  buttonClassName = "",
  maxHeight = 260,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  theme?: "light" | "dark";
  className?: string;
  buttonClassName?: string;
  maxHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value && !o.group);

  // 바깥 클릭 · Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const isLight = theme === "light";

  const button = isLight
    ? "w-full bg-white border border-[#e2e0dc] rounded-lg px-4 py-3 text-sm text-[#131313] hover:border-[#a3a3a3] focus:border-[#e91e3f]"
    : "w-full bg-transparent border border-white/10 rounded-lg px-4 py-3 text-sm text-white hover:border-white/25 focus:border-[#e91e3f]";
  const panel = isLight
    ? "bg-white border border-[#e2e0dc] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)]"
    : "bg-[#161616] border border-white/10 shadow-2xl";
  const itemBase = isLight
    ? "text-[#4b4b4b] hover:bg-[#f5f3f0]"
    : "text-gray-300 hover:bg-white/5";
  const itemActive = isLight
    ? "bg-[#e91e3f]/[0.08] text-[#e91e3f] font-bold"
    : "bg-[#e91e3f]/15 text-[#e91e3f] font-bold";
  const placeholderCls = isLight ? "text-[#a3a3a3]" : "text-gray-500";
  const caret = isLight ? "text-[#a3a3a3]" : "text-gray-400";
  const scrollbar = isLight
    ? "[&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#d6d3ce] [&::-webkit-scrollbar-thumb]:rounded-full"
    : "[&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#2a2a2a] [&::-webkit-scrollbar-thumb]:rounded-full";

  return (
    <div ref={ref} className={`relative ${open ? "z-50" : ""} ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${button} ${buttonClassName} flex items-center justify-between gap-3 text-left outline-none transition-colors`}
      >
        {selected ? (
          <span className="flex items-center gap-2.5 min-w-0">
            {selected.color && <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: selected.color }}></span>}
            <span className="font-bold truncate">{selected.label}</span>
            {selected.hint && <span className={`text-[10px] shrink-0 ${caret}`}>{selected.hint}</span>}
          </span>
        ) : (
          <span className={placeholderCls}>{placeholder}</span>
        )}
        <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${caret} ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          style={{ maxHeight }}
          className={`absolute top-full left-0 w-full mt-1.5 rounded-xl overflow-y-auto overflow-x-hidden z-50 ${panel} ${scrollbar}`}
        >
          {options.map((o, i) =>
            o.group ? (
              <div key={`g-${i}`} className={`px-4 py-2 text-[10px] font-black tracking-[0.15em] uppercase ${isLight ? "text-[#a3a3a3] bg-[#f5f3f0]" : "text-gray-400 bg-white/[0.03]"}`}>
                {o.label}
              </div>
            ) : (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${o.value === value ? itemActive : itemBase}`}
              >
                {o.color && <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: o.color }}></span>}
                <span className={`truncate ${o.indent ? "ml-4" : ""}`}>{o.label}</span>
                {o.hint && <span className={`ml-auto text-[10px] shrink-0 ${caret}`}>{o.hint}</span>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
