"use client";

import React from "react";
import { presetKeyOf, isPresetKey, itemTypeColor } from "@/lib/items";
import { ICON_PATHS } from "./Icons";

// 📌 아이템 아이콘 한 곳 — 인벤토리 슬롯·상점 카드·상품 상세·관리자 목록이 전부 이걸로 그린다.
//    우선순위: 이미지(둥근 사각) > 프리셋 SVG("svg:<key>") > 이모지·텍스트 > 유형 기본 SVG.
//    프리셋 목록·검증은 lib/items.js (서버도 같이 씀), 그림은 여기에만 둔다.

// 유형별 기본 모양 — role 방패 · perk 열쇠 · item 큐브 · physical 상자 · level(레벨 보상) 메달
const TYPE_DEFAULT: Record<string, string> = { role: "shield", perk: "key", item: "cube", physical: "box", level: "medal" };
export const defaultPresetOf = (type?: string) => TYPE_DEFAULT[type || ""] || "cube";

// 24×24 · 선 굵기 1.7. 채움형(번개·방패)은 fill, 나머지는 stroke — 기존 인벤토리 톤 그대로.
//    번개·상자·종·리본·메달·방패는 예전 InvIcon 의 path 를 그대로 옮겼다.
type Shape = { fill?: boolean; d: string[]; dash?: string; f?: string[] }; // f: 연하게 채우는 면(윗면·뚜껑)
const SHAPES: Record<string, Shape> = {
  bolt: { d: [ICON_PATHS.bolt] },
  shield: { fill: true, d: ["M12 2.6 20 5.4V12c0 4.6-3.4 7.6-8 9.2C7.4 19.6 4 16.6 4 12V5.4Z"] },
  key: { d: [ICON_PATHS.key] },
  // 블록 — 윗면을 연하게 채운 등각 큐브 (상자와 한눈에 구분되게)
  cube: { d: ["M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6Z", "M4 7.6 12 12l8-4.4M12 12v8.8"], f: ["M4 7.6 12 3.2 20 7.6 12 12Z"] },
  // 보물상자 — 둥근 뚜껑(연하게 채움) + 몸통 + 자물쇠 고리
  box: { d: ["M4 10.5V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v2.5", "M3.5 10.5h17v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z", "M10.5 10.5V14h3v-3.5"], f: ["M4 10.5V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v2.5Z"] },
  medal: { d: ["M12 9a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z", "M8.5 9 6.5 3h11l-2 6"] },
  star: { d: [ICON_PATHS.star] },
  crown: { d: ["M4.5 18.5h15", "M4.5 18.5 3.2 7.5l4.9 3.6L12 5l3.9 6.1 4.9-3.6-1.3 11Z"] },
  gem: { d: ["M7 4h10l4 5.2L12 20 3 9.2Z", "M3 9.2h18", "M9.5 9.2 12 20l2.5-10.8"] },
  flame: { d: [ICON_PATHS.flame] },
  bell: { d: [ICON_PATHS.bell] },
  ribbon: { d: ["M7 3h10v11l-5-3-5 3Z", "M9 16.5 7 21l5-2.6L17 21l-2-4.5"] },
  ticket: {
    d: [
      "M3.5 9V7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5V9a3 3 0 0 0 0 6v1.5A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5V15a3 3 0 0 0 0-6Z",
      "M14.5 6.5v11",
    ],
    dash: "2 2",
  },
  gift: { d: [ICON_PATHS.gift] },
  music: { d: [ICON_PATHS.music] },
  mic: { d: [ICON_PATHS.mic] },
  heart: { d: [ICON_PATHS.heart] },
  snow: { d: ["M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9", "M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"] },
  // ── 권한 ──
  unlock: { d: [ICON_PATHS.unlock] },
  lock: { d: [ICON_PATHS.lock] },
  // 인증 배지 — 8개 톱니 도장(중심 12,12 · 반지름 8.2 · 톱니 호 3.9) + 체크
  badge: { d: ["M12 3.8A3.9 3.9 0 0 1 17.8 6.2A3.9 3.9 0 0 1 20.2 12A3.9 3.9 0 0 1 17.8 17.8A3.9 3.9 0 0 1 12 20.2A3.9 3.9 0 0 1 6.2 17.8A3.9 3.9 0 0 1 3.8 12A3.9 3.9 0 0 1 6.2 6.2A3.9 3.9 0 0 1 12 3.8Z", "M8.8 12.2l2.2 2.2 4.4-4.6"] },
  door: { d: ["M6 21V4h10v17", "M3 21h18", "M13 12v.8"] },
  eye: { d: [ICON_PATHS.eye] },
  chat: { d: [ICON_PATHS.chat] },
  image: { d: [ICON_PATHS.image] },
  link: { d: [ICON_PATHS.link] },
  pin: { d: [ICON_PATHS.pin] },
  video: { d: [ICON_PATHS.video] },
  speaker: { d: [ICON_PATHS.speaker] },
  headset: { d: ["M4.5 14v-2a7.5 7.5 0 0 1 15 0v2", "M4.5 14H7v5H4.5ZM17 14h2.5v5H17Z", "M19.5 19a3 3 0 0 1-3 2.5H14"] },
  gear: { d: ["M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z", "M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"] },
  flag: { d: [ICON_PATHS.flag] },
  sparkles: { d: [ICON_PATHS.sparkles] },
  clock: { d: [ICON_PATHS.clock] },
  hand: { d: ["M7 11.5V6.5a1.5 1.5 0 0 1 3 0V11", "M10 11V4.5a1.5 1.5 0 0 1 3 0V11", "M13 11V5.5a1.5 1.5 0 0 1 3 0v6", "M16 11.5V8a1.5 1.5 0 0 1 3 0v6.5a6.5 6.5 0 0 1-6.5 6.5H11a6 6 0 0 1-4.9-2.5L3.8 15a1.6 1.6 0 0 1 2.5-2L7 14"] },
};

// 프리셋 한 개 — 피커 격자·드롭다운·목록에서 그대로 쓴다. 모르는 key 는 큐브.
export function PresetIcon({
  k,
  size = 24,
  color = "currentColor",
  className = "",
  style,
}: {
  k: string;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const shape = SHAPES[isPresetKey(k) ? k : "cube"];
  const common = { viewBox: "0 0 24 24", width: size, height: size, className, style, "aria-hidden": true as const };
  if (shape.fill) {
    return (
      <svg {...common} fill={color}>
        {shape.d.map((d, i) => <path key={i} d={d} opacity={k === "shield" ? 0.92 : 1} />)}
      </svg>
    );
  }
  return (
    <svg {...common} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {shape.f?.map((d, i) => <path key={"f" + i} d={d} fill={color} fillOpacity={0.28} stroke="none" />)}
      {shape.d.map((d, i) => <path key={i} d={d} strokeDasharray={shape.dash && i === shape.d.length - 1 ? shape.dash : undefined} />)}
    </svg>
  );
}

// 📌 아이템 아이콘 — 인벤토리·카드·상세·관리자 공용.
//    color 를 안 주면 유형 기본색(레벨 보상은 #ff5c77), dim 이면 35% 로 흐리게(만료·미지급).
export default function ItemIcon({
  icon = "",
  imageUrl = "",
  type = "",
  size = 24,
  color,
  dim = false,
  className = "",
  style,
}: {
  icon?: string;
  imageUrl?: string;
  type?: string;
  size?: number;
  color?: string;
  dim?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const c = color || (type === "level" ? "#ff5c77" : type ? itemTypeColor(type) : "currentColor");
  const opacity = dim ? 0.35 : 1;

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        className={`object-cover shrink-0 ${className}`}
        style={{ width: size, height: size, borderRadius: Math.max(6, size * 0.28), opacity, ...style }}
      />
    );
  }

  const key = presetKeyOf(icon);
  if (key) return <PresetIcon k={key} size={size} color={c} className={`shrink-0 ${className}`} style={{ opacity, ...style }} />;

  if (icon) {
    return (
      <span
        aria-hidden
        className={`inline-flex items-center justify-center leading-none select-none shrink-0 ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.82, opacity, ...style }}
      >
        {icon}
      </span>
    );
  }

  return <PresetIcon k={defaultPresetOf(type)} size={size} color={c} className={`shrink-0 ${className}`} style={{ opacity, ...style }} />;
}
