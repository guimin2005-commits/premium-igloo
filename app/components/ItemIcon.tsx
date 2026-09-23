"use client";

import React from "react";
import { presetKeyOf, isPresetKey, itemTypeColor } from "@/lib/items";

// 📌 아이템 아이콘 한 곳 — 인벤토리 슬롯·상점 카드·상품 상세·관리자 목록이 전부 이걸로 그린다.
//    우선순위: 이미지(둥근 사각) > 프리셋 SVG("svg:<key>") > 이모지·텍스트 > 유형 기본 SVG.
//    프리셋 목록·검증은 lib/items.js (서버도 같이 씀), 그림은 여기에만 둔다.

// 유형별 기본 모양 — role 방패 · perk 열쇠 · item 큐브 · physical 상자 · level(레벨 보상) 메달
const TYPE_DEFAULT: Record<string, string> = { role: "shield", perk: "key", item: "cube", physical: "box", level: "medal" };
export const defaultPresetOf = (type?: string) => TYPE_DEFAULT[type || ""] || "cube";

// 24×24 · 선 굵기 1.7. 채움형(번개·방패)은 fill, 나머지는 stroke — 기존 인벤토리 톤 그대로.
//    번개·상자·종·리본·메달·방패는 예전 InvIcon 의 path 를 그대로 옮겼다.
type Shape = { fill?: boolean; d: string[]; dash?: string };
const SHAPES: Record<string, Shape> = {
  bolt: { fill: true, d: ["M13.2 2 5 13.4h5.3L9.9 22l8.4-11.6H12.8Z"] },
  shield: { fill: true, d: ["M12 2.6 20 5.4V12c0 4.6-3.4 7.6-8 9.2C7.4 19.6 4 16.6 4 12V5.4Z"] },
  key: { d: ["M8 7.8a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4Z", "M12.2 12H21M17.5 12v3.2M20 12v2.4"] },
  cube: { d: ["M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6Z", "M4 7.6 12 12l8-4.4M12 12v8.8"] },
  box: { d: ["M3 8.5 12 4l9 4.5v7L12 20l-9-4.5Z", "M3 8.5 12 13l9-4.5M12 13v7"] },
  medal: { d: ["M12 9a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z", "M8.5 9 6.5 3h11l-2 6"] },
  star: { d: ["M12 3.4l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.9 1.1-6-4.4-4.2 6-.8Z"] },
  crown: { d: ["M4.5 18.5h15", "M4.5 18.5 3.2 7.5l4.9 3.6L12 5l3.9 6.1 4.9-3.6-1.3 11Z"] },
  gem: { d: ["M7 4h10l4 5.2L12 20 3 9.2Z", "M3 9.2h18", "M9.5 9.2 12 20l2.5-10.8"] },
  flame: { d: ["M12 3.5c.5 3.2 4.5 4.6 4.5 9a4.5 4.5 0 0 1-9 0c0-1.9.9-3.1 1.7-4 .2 1.2.8 2 1.6 2.4C10.6 8.7 10.6 6 12 3.5Z"] },
  bell: { d: ["M6 9a6 6 0 1 1 12 0c0 4 1.2 5.5 1.8 6.2.3.4 0 .9-.5.9H4.7c-.5 0-.8-.5-.5-.9C4.8 14.5 6 13 6 9Z", "M10 19.5a2 2 0 0 0 4 0"] },
  ribbon: { d: ["M7 3h10v11l-5-3-5 3Z", "M9 16.5 7 21l5-2.6L17 21l-2-4.5"] },
  ticket: {
    d: [
      "M3.5 9V7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5V9a3 3 0 0 0 0 6v1.5A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5V15a3 3 0 0 0 0-6Z",
      "M14.5 6.5v11",
    ],
    dash: "2 2",
  },
  gift: { d: ["M4.5 11.5h15V20h-15Z", "M3 7.5h18v4H3Z", "M12 7.5V20", "M12 7.5c-1-3.4-5.4-3.2-4.2 0M12 7.5c1-3.4 5.4-3.2 4.2 0"] },
  music: { d: ["M6.5 16a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z", "M17.5 14a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z", "M9 18.5V6l11-2.5v13"] },
  mic: { d: ["M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0Z", "M6 11a6 6 0 0 0 12 0", "M12 17v3.5M9 20.5h6"] },
  heart: { d: ["M12 20.2 4.6 12.8A4.4 4.4 0 0 1 10.8 6.6L12 7.8l1.2-1.2a4.4 4.4 0 0 1 6.2 6.2Z"] },
  snow: { d: ["M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9", "M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"] },
  // ── 권한 ──
  unlock: { d: ["M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z", "M8 11V7a4 4 0 0 1 7.6-1.7", "M12 15v2.5"] },
  lock: { d: ["M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z", "M8 11V7a4 4 0 0 1 8 0v4", "M12 15v2.5"] },
  badge: { d: ["M12 3.2l2 1.7 2.6-.4 1 2.4 2.4 1-.4 2.6 1.7 2-1.7 2 .4 2.6-2.4 1-1 2.4-2.6-.4-2 1.7-2-1.7-2.6.4-1-2.4-2.4-1 .4-2.6L3.7 12.5l1.7-2-.4-2.6 2.4-1 1-2.4 2.6.4Z", "M9 12.4l2 2 4-4.3"] },
  door: { d: ["M6 21V4h10v17", "M3 21h18", "M13 12v.8"] },
  eye: { d: ["M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z", "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"] },
  chat: { d: ["M4 5.5h16v10.5H9.5L5.5 19.5v-3.5H4Z", "M8.5 10.6v.8M12 10.6v.8M15.5 10.6v.8"] },
  image: { d: ["M4 5.5h16v13H4Z", "M4 15.5l4.5-4.5 3.5 3.5 2.5-2.5 5.5 5.5", "M16 8.7v.8"] },
  link: { d: ["M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.4 1.4", "M14 10a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.4-1.4"] },
  pin: { d: ["M9 3.5h6l-.6 6.5 3.1 3v1.5H6.5V13l3.1-3Z", "M12 14.5V21"] },
  video: { d: ["M3.5 7h11v10h-11Z", "M14.5 10.5 20.5 8v8l-6-2.5"] },
  speaker: { d: ["M4 9.5h3.5L12 5.5v13l-4.5-4H4Z", "M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.5a8 8 0 0 1 0 11"] },
  headset: { d: ["M4.5 14v-2a7.5 7.5 0 0 1 15 0v2", "M4.5 14H7v5H4.5ZM17 14h2.5v5H17Z", "M19.5 19a3 3 0 0 1-3 2.5H14"] },
  gear: { d: ["M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z", "M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"] },
  flag: { d: ["M6 21V4", "M6 4h11l-2.5 4 2.5 4H6"] },
  sparkles: { d: ["M12 4l1.8 4.7 4.7 1.8-4.7 1.8L12 17l-1.8-4.7L5.5 10.5l4.7-1.8Z", "M19 3.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z", "M5 16l.6 1.4 1.4.6-1.4.6L5 20l-.6-1.4L3 18l1.4-.6Z"] },
  clock: { d: ["M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z", "M12 7.5V12l3 2"] },
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
