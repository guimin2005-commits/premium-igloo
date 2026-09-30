"use client";

import React, { useState } from "react";
import { BACKDROP_GROUPS, BACKDROPS, BACKDROP_OF, isBackdropKey, backdropSrc } from "@/lib/itemBackdrops";

// 📌 상품 카드 배경 고르기 — 관리자 상품 폼(admin/shop) · 상점 인라인 폼(ArcticShopBody) 두 벌이 같이 쓴다(IconPicker 와 같은 방식).
//    접힌 한 줄(지금 고른 장면 · 이름 · ▾)을 누르면 아래로 격자가 펼쳐진다 — 폼이 길어지지 않게 평소엔 한 줄.
//    격자: "없음"(기본 바탕) 한 칸 + 묶음(BACKDROP_GROUPS)별 장면 칸. 칸은 40px 고정 — 폭이 좁으면 묶음이 다음 줄로 넘어갈 뿐 칸 크기는 그대로.
//    고른 칸은 테두리(ring)만 굵어진다 — 칸 크기 · 자리는 그대로(고를 때마다 격자가 흔들리지 않게).
//    칸 그림은 64×64 장면을 image-rendering: pixelated 로 줄여 보인다(카드와 같은 도트 결).
const DEFAULT_BTN =
  "w-full bg-white border border-[#ededed] rounded-lg px-3 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f]";

const cellClass = (on: boolean) =>
  `relative w-10 h-10 shrink-0 flex items-center justify-center rounded-lg overflow-hidden outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[#e91e3f] ${
    on ? "ring-2 ring-[#131313] ring-offset-2 ring-offset-white" : "ring-1 ring-black/10 hover:ring-[#a3a3a3]"
  }`;

const pixelated: React.CSSProperties = { imageRendering: "pixelated" };

// 장면 그림(또는 "없음"일 때 등록 색을 옅게 깐 기본 바탕 — 카드의 기본 바탕과 같은 그라데이션)
function Swatch({ k, color }: { k: string; color: string }) {
  const src = backdropSrc(k);
  if (!src) return <span aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${color}33, ${color}0a)` }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden draggable={false} loading="lazy" className="absolute inset-0 w-full h-full object-cover" style={pixelated} />;
}

export default function BackdropPicker({
  value,
  onChange,
  color = "#131313",
  buttonClassName,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  color?: string;
  buttonClassName?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const cur = isBackdropKey(value) ? BACKDROP_OF[value] : null;

  return (
    <div className={className}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className={`${buttonClassName || DEFAULT_BTN} flex items-center justify-between gap-3 text-left`}>
        <span className="flex items-center gap-2.5 min-w-0">
          {/* 20px — 글자 줄 높이와 같아 옆 입력칸들과 높이가 똑같다 */}
          <span className="relative w-5 h-5 shrink-0 rounded overflow-hidden ring-1 ring-black/10">
            <Swatch k={cur ? cur.key : ""} color={color} />
          </span>
          <span className="truncate">{cur ? cur.label : "없음"}</span>
        </span>
        <svg className={`w-3.5 h-3.5 shrink-0 text-[#a3a3a3] transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        // 묶음 칸들 — 넓으면 옆으로, 좁으면 다음 줄로 흐른다(칸 크기 고정). 줄 간격은 묶음마다 mb-3 — 끊는 줄(h-0)이 간격을 두 번 먹지 않게 gap-y 를 안 쓴다.
        //   마지막 줄의 mb-3 은 -mb-3 으로 되돌려 아래 칸과의 거리가 다른 입력칸과 같게
        <div className="mt-3 -mb-3 flex flex-wrap items-start gap-x-4">
          {/* "없음" — 묶음 이름 자리(빈 줄)를 똑같이 두어 옆 묶음의 칸과 윗줄을 맞춘다 */}
          <div className="shrink-0 mb-3">
            <p aria-hidden className="text-[10px] font-bold leading-none mb-1.5">&nbsp;</p>
            <button type="button" title="없음" aria-label="없음" aria-pressed={!cur} onClick={() => onChange("")} className={cellClass(!cur)}>
              <Swatch k="" color={color} />
              <span className="relative text-[10px] font-bold text-[#5a5a5a]">없음</span>
            </button>
          </div>
          {BACKDROP_GROUPS.map((grp, i) => (
            <React.Fragment key={grp.g}>
              {/* 📌 첫 묶음(북극 — 가장 많다)은 "없음" 옆 남은 폭을 채우고 그 안에서 줄을 바꾼다 — 좁은 폼에서 "없음"만 홀로 한 줄을 차지하지 않게.
                     폭을 0 에서 늘리는 칸이라 뒤 묶음이 같은 줄로 끼어들지 못하게 바로 뒤에서 줄을 끊는다(basis-full) */}
              <div className={i === 0 ? "min-w-0 mb-3" : "shrink-0 mb-3"} style={i === 0 ? { flex: "1 1 0%" } : undefined}>
                <p className="text-[10px] font-bold leading-none text-[#a3a3a3] mb-1.5">{grp.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {BACKDROPS.filter((b) => b.group === grp.g).map((b) => {
                    const on = cur?.key === b.key;
                    return (
                      <button key={b.key} type="button" title={b.label} aria-label={b.label} aria-pressed={on}
                        onClick={() => onChange(b.key)} className={cellClass(on)}>
                        <Swatch k={b.key} color={color} />
                      </button>
                    );
                  })}
                </div>
              </div>
              {i === 0 && <div aria-hidden className="basis-full h-0" />}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
