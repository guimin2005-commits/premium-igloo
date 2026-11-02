// 📌 유물 「사건의 지평선」(2026-11-02 운영자 확정 — 시즌 3 패스 최종 보상, 한 묶음) — 사이트 그리기 입구
//   한 묶음: 입으면 카드 배경 · 카드 테두리 · 레벨바 · 프로필 테두리 네 칸을 통째로 차지(다른 꾸미기와 섞어 입기 금지 — 운영자 "다른 거 못 끼게")
//   고르는 것: 코어 색 하나(void · white · gold · sakura) + 조각마다 1 · 2 · 3. 조각끼리 이어지는 연출 · 레벨업 효과는 늘 켜짐
//   그림 코드는 .claude/mockups/season3 시안을 옮겨 온 것(./horizon · ./vhorizon · ./hybrid · ./pieces — _port_relic.mjs). 이 파일은 겹 모으기만
//   relicLayers → { under, over, cells }: under = 카드 바탕 쪽(글자 뒤), over = 글자 위(사진 앞 그림 · 막대 · 테두리). 문자열은 SVG 조각 + <cells i/> 표식 — ./draw 가 캔버스에 그린다
import { resetCells, cellsSvg, cellsOf } from "./grid";
import { G, setGeo } from "./geo";
import { CORES, colorsOf, hzBg, hzFrame, hzBorder, hzBarCells, PCX, PCY } from "./horizon";
import { vBg } from "./vhorizon";
import { vDisk, vSlits, vBarFx } from "./hybrid";
import { plainBg, vWell, vWarp, vDebris, vVortex, vLensFrame, encroach, vHelix, vBolt, vLink, levelUpState, NAMES2, syncPieces } from "./pieces";

import { RELIC_KEY, RELIC_NAME, CORE_KEYS, normPick } from "./meta";

export { setGeo, levelUpState, NAMES2, RELIC_KEY, RELIC_NAME, CORE_KEYS, normPick };
export const coreName = (k) => (CORES[k] || CORES.void).name;
export const coreColors = (k) => colorsOf(CORE_KEYS.includes(k) ? k : "void");
export const PIECES = [["frame", "프로필 테두리"], ["border", "카드 테두리"], ["bg", "배경"], ["bar", "레벨바"]];
export const LOOP_MS = 64 * 110; // 한 바퀴 7.04초(시안 GIF 와 같다)
// 주사위 — 코어 색 · 조각 넷을 무작위로(지금과 똑같으면 한 번 더)
export const randomPick = (cur) => {
  const r3 = () => 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < 6; i++) {
    const p = { key: RELIC_KEY, core: CORE_KEYS[Math.floor(Math.random() * CORE_KEYS.length)], frame: r3(), border: r3(), bg: r3(), bar: r3() };
    if (!cur || ["core", "frame", "border", "bg", "bar"].some((k) => p[k] !== cur[k])) return p;
  }
  return normPick(cur);
};
// 인벤토리 미리보기 카드 자리(EquipCard 360 × 556 — 사진 가운데 (76, 76) 지름 68, 막대 28~332 · 가운데 339). 글자 자리 없음
export const PREVIEW_GEO = { W: 360, H: 556, CW: 120, CH: 185, R: 24, CX: 76, CY: 76, PR: 34, NX: 144, BX0: 28, BX1: 332, BY: 339, BW: 101, TEXT: [] };

// 한 장 — t 0~1(한 바퀴), f 장 번호(막대 불티 섞기), ch { core, frame, border, bg, bar, pct(0~1), lv(levelUpState), linkT(XP 얻었을 때 연출 진행 0~1), link, only }
export function relicLayers(core, t, f, ch) {
  syncPieces();
  resetCells();
  const { W, H, CX, CY, PR } = G;
  const f2 = (n) => Math.round(n * 100) / 100;
  const L = ch.lv || null, tb = t + (L?.tb || 0), pct = L ? L.pct : Math.max(0.006, Math.min(1, ch.pct ?? 0.49)), sy = L ? L.sy : 1;
  const C = coreColors(core), cs = PR / 28, rot = (t + (L?.tr || 0)) * 360, ox = CX - PCX * cs, oy = CY - PCY * cs;
  const cellsAt = (g) => `<g>${cellsSvg(g, C, cs, ox, oy)}</g>`;
  // 배경 — 칸 판(카드 높이가 칸 정수배가 아니면 아래를 바탕색으로 잇는다) + 선
  const bgCells = cellsSvg(ch.bg === 1 ? hzBg({ s: 1, t: tb, streaks: false, threads: false }) : plainBg(ch.bg), C);
  const vbg = ch.bg === 1 ? vBg(C, { s: 1, t: tb, base: false, nStars: 200 }) : ch.bg === 2 ? vWell(C, { t: tb }) : vWarp(C, { t: tb });
  const base = `<rect x="0" y="0" width="${W}" height="${H}" fill="#06050a"/>`;
  // 프로필 — 사진 뒤(back) · 사진 앞(front)
  let back, front;
  if (ch.frame === 1) { const disk = vDisk(C, { rot: rot * 2, s: 1 }), px = hzFrame({ rot: rot * 2, s: 1, disk: false, shadow: false }); back = disk.back + cellsAt(px.back); front = cellsAt(px.front) + disk.front; }
  else { const v = ch.frame === 2 ? vDebris(C, { rot }) : vVortex(C, { rot }), px = hzFrame({ rot: rot * 2, s: 1, disk: false, shadow: false, lens: false }); back = v.back + cellsAt(px.back); front = cellsAt(px.front) + v.front; }
  const photo = `<circle cx="${f2(CX)}" cy="${f2(CY)}" r="${f2(PR)}" fill="#3e3e46"/>`;
  // 레벨바
  let bar;
  if (ch.bar === 1) { const { g: b1, ox: bx, oy: by } = hzBarCells(pct, { spark: f % 8 }); bar = `<g>${cellsSvg(b1, C, 3, G.BX0 - bx * 3, G.BY - (4 + by) * 3)}</g>${vBarFx(C, { pct, spark: f % 8 })}`; }
  else bar = ch.bar === 2 ? vHelix(C, { t, pct }) : vBolt(C, { t, pct });
  bar = sy <= 0.02 ? "" : sy < 1 ? `<g transform="translate(0 ${f2(G.BY)}) scale(1 ${f2(sy)}) translate(0 ${f2(-G.BY)})">${bar}</g>` : bar;
  // 카드 테두리
  let border;
  if (ch.border === 1) border = `<g>${cellsSvg(hzBorder({ pulse: 1 + 0.1 * Math.sin(Math.PI * 4 * t), tears: false }), C)}</g>${vSlits(C, { pulse: 1, t })}`;
  else if (ch.border === 2) border = vLensFrame(C, { t });
  else { const e = encroach(C, { t }); border = `<g>${cellsSvg(e.cells, C)}</g>${e.lines}`; }
  // 고르기 칸 그림 — 그 조각만
  if (ch.only === "bg") return { under: base + bgCells + vbg, over: "", cells: cellsOf() };
  if (ch.only) return { under: "", over: { frame: back + photo + front, border, bar }[ch.only], cells: cellsOf() };
  // 조각끼리 이어지는 연출 — XP 를 얻을 때만 한 번(ch.linkT 0~1 = 그 한 번의 진행, 없으면 안 돎 · 레벨업 중엔 쉼). 터지는 자리는 실제 막대 앞머리(pct)
  const link = ch.linkT == null || ch.link === false || L ? { under: "", over: "" } : vLink(C, { t: ch.linkT, pct });
  return {
    under: base + bgCells + vbg + back + link.under + (L?.under || "") + photo,
    over: (L?.veil || "") + front + bar + border + link.over + (L?.over || ""),
    cells: cellsOf(),
  };
}
