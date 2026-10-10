"use client";

import { FRAME_OF } from "@/lib/itemEffects";

// 📌 아바타 테두리 — 사진 위에 겹쳐 그리는 티어 테두리(public/avatar-borders/<키>.svg, scripts/gen-avatar-frames.mjs 가 그림).
//    그림은 128칸 정사각형, 가운데 구멍 지름 48칸 → 사진 지름(px)의 128/48 배로 사진 가운데에 둔다.
//    overlap: 구멍을 사진보다 살짝 작게(기본 0.92) — 테두리 안쪽 외곽선이 사진 가장자리에 걸쳐 틈이 보이지 않게.
//    부모는 position: relative(사진과 같은 가운데)여야 한다. 누르기 · 스크린리더에는 없는 장식
export const FRAME_GRID = 128;
export const FRAME_HOLE = 48;
export const frameSizeOf = (px, overlap = 0.92) => Math.round((px * overlap * FRAME_GRID) / FRAME_HOLE);

// 📌 그림이 가운데에서 뻗는 거리(칸, 128칸 기준) [위, 아래, 옆, 옆(테두리 몸만 — 반짝이 · 빛무리 빼고)]. 그림(scripts/gen-avatar-frames.mjs)을 고치면 다시 잰다(실행하면 끝에 찍힌다)
export const FRAME_REACH = {
  bronze: [0, 34, 30, 30], silver: [0, 35, 31, 31], gold: [0, 35, 32, 32], platinum: [0, 37, 32, 32], diamond: [0, 37, 33, 33],
  master: [36, 37, 47, 34], grandmaster: [47, 39, 35, 34], challenger: [41, 42, 49, 35], igloo: [46, 40, 52, 38],
};

// 📌 테두리를 낀 사람만 사진 칸에 더할 여백(px) — 카드 모서리에 잘리거나 옆 이름 · 칩에 닿지 않게(2026-10-06 "닉네임이나 표기 되는 걸 조금 수정").
//    box: 사진을 감싼 칸(진행 링) 지름, pad: 카드 안쪽 여백, gap: 옆 글자 칸까지 간격. 테두리가 없거나 작으면 undefined → 자리 그대로
//    카드 가장자리 쪽(위 · 왼쪽)은 반짝이까지 들게, 옆 글자 쪽(오른쪽)은 테두리 몸만 — 반짝이는 글자 칸에 살짝 걸쳐도 된다(2026-10-10 이글루만 칩이 3줄로 밀리던 것)
export function frameRoom(frame, px, { box, pad, gap }, overlap = 0.92) {
  const r = FRAME_REACH[frame];
  if (!r || !(px > 0)) return undefined;
  const k = frameSizeOf(px, overlap) / FRAME_GRID;
  const half = box / 2;
  const up = r[0] * k, side = r[2] * k, core = (r[3] ?? r[2]) * k;
  const room = {
    marginTop: Math.max(0, Math.ceil(up - half - pad + 2)),
    marginLeft: Math.max(0, Math.ceil(side - half - pad + 2)),
    marginRight: Math.max(0, Math.ceil(core - half - gap + 4)),
  };
  return room.marginTop || room.marginLeft || room.marginRight ? room : undefined;
}

/** @param {{ frame?: string, px: number, overlap?: number, className?: string, style?: import("react").CSSProperties }} props */
export default function AvatarFrame({ frame, px, overlap = 0.92, className = "", style }) {
  if (!frame || !FRAME_OF[frame] || !(px > 0)) return null;
  const size = frameSizeOf(px, overlap);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/avatar-borders/${frame}.svg`}
      alt=""
      aria-hidden
      draggable={false}
      width={size}
      height={size}
      className={`pointer-events-none select-none absolute left-1/2 top-1/2 max-w-none ${className}`}
      style={{ width: size, height: size, transform: "translate(-50%, -50%)", ...style }}
    />
  );
}
