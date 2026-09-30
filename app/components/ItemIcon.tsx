"use client";

import React, { useMemo } from "react";
import { presetKeyOf, isPresetKey, itemTypeColor, artKeyOf } from "@/lib/items";
import { itemArtBody, ART_GRID } from "@/lib/itemArt";
import { ICON_PATHS } from "./Icons";

// 📌 아이템 아이콘 한 곳 — 인벤토리 슬롯·상점 카드·상품 상세·관리자 목록이 전부 이걸로 그린다.
//    우선순위: 이미지(둥근 사각) > 일러스트("art:<key>") > 프리셋 SVG("svg:<key>") > 이모지·텍스트 > 유형 기본 SVG.
//    프리셋 목록·검증은 lib/items.js (서버도 같이 씀), 선 프리셋 그림은 여기, 일러스트 그림은 lib/itemArt.js.

// 유형별 기본 모양 — role 방패 · perk 열쇠 · item 큐브 · cosmetic 반짝이 · physical 상자 · level(레벨 보상) 메달
const TYPE_DEFAULT: Record<string, string> = { role: "shield", perk: "key", item: "cube", cosmetic: "sparkles", physical: "box", level: "medal" };
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

// 📌 도트 일러스트(16×16) 한 개 — 자체 색이 있어 color 를 받지 않는다.
//    칸이 번지지 않게 정수 배율로만 그린다: n = round(size/16), n×16 이 size+6 을 넘으면 한 단계 작게(18·24→16, 28→32, 46·48→48).
//    자리는 요청한 size 그대로 차지하고 그림은 그 가운데 — 그림이 더 크면 음수 여백으로 양쪽에 고르게 넘친다(주변이 밀리지 않게).
//    그림 문자열은 lib/itemArt.js 가 목록에 있는 key 로만 만든다(사용자 입력이 섞이지 않음).
export function ArtIcon({
  k,
  size = 24,
  className = "",
  style,
}: {
  k: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  // 📌 그림 문자열은 key 가 같으면 그대로 — 목록이 다시 그려질 때마다 새로 만들지 않게
  const html = useMemo(() => ({ __html: itemArtBody(k) }), [k]);
  let n = Math.max(1, Math.round(size / ART_GRID));
  if (n > 1 && n * ART_GRID > size + 6) n -= 1;
  const px = n * ART_GRID;
  // 홀수 차이는 한쪽에 1px 더 — 반 픽셀 위치에 놓이면 칸 경계가 흐려진다
  const lead = Math.floor((size - px) / 2);
  const trail = size - px - lead;
  return (
    <svg
      viewBox={`0 0 ${ART_GRID} ${ART_GRID}`}
      width={px}
      height={px}
      shapeRendering="crispEdges"
      className={className}
      style={{ marginLeft: lead, marginRight: trail, marginTop: lead, marginBottom: trail, ...style }}
      aria-hidden
      dangerouslySetInnerHTML={html}
    />
  );
}

// 📌 아이템 아이콘 — 인벤토리·카드·상세·관리자 공용.
//    color 를 안 주면 유형 기본색(레벨 보상은 #ff5c77), dim 이면 35% 로 흐리게(만료·미지급 — 일러스트도 같이).
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

  const art = artKeyOf(icon);
  if (art) return <ArtIcon k={art} size={size} className={`shrink-0 ${className}`} style={{ opacity, ...style }} />;

  const key = presetKeyOf(icon);
  if (key) return <PresetIcon k={key} size={size} color={c} className={`shrink-0 ${className}`} style={{ opacity, ...style }} />;

  // 📌 목록에서 빠진 "art:…"/"svg:…" 값은 글자로 찍지 않고 유형 기본 모양으로
  if (icon && !/^(art|svg):/.test(icon)) {
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
