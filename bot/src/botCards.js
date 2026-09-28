/* 📌 봇 메시지 이미지 카드 — 레벨업 · /레벨 · /랭크 · /출석체크 · 시즌 RANKER 발표를 PNG 로 그려 메시지에 붙인다(attachment://card.png).
   ⚠️ 아래 "공용 블록" 은 사이트 lib/botCards.js 와 글자 하나까지 같아야 한다 (봇은 별도 배포라 import 불가).
   renderCard(kind, data) → PNG Buffer | null — satori(요소 → SVG) → @resvg/resvg-js(SVG → PNG). 3초 안에 못 끝내면 null(글만 보낸다).
   fetchAvatarDataUri(url) → 디스코드 아바타 png 256 data URI | null (2초).
   글꼴: bot/assets/fonts/ 의 Pretendard(OFL) — 처음 한 번 읽어 둔다. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import satori from "satori";
import { renderAsync } from "@resvg/resvg-js";

// ═══ 공용 블록 시작 — lib/botCards.js 와 bot/src/botCards.js 의 이 구간은 글자 하나까지 같아야 한다 ═══

export const CARD_FONT = "Pretendard";
// 굵기 → 파일 (assets/fonts/ 아래)
export const CARD_FONT_FILES = [
  { weight: 500, file: "Pretendard-Medium.otf" },
  { weight: 700, file: "Pretendard-Bold.otf" },
  { weight: 900, file: "Pretendard-Black.otf" },
];

// 📌 가로 1200 기준 — 디스코드 임베드 안에서는 폭 400~520px(약 0.35~0.43배)로 줄어 보인다.
//    그래서 가장 작은 글자도 26px 이상, 핵심 숫자는 크게 둔다. /레벨 · /랭크는 같은 프로필 카드.
export const CARD_SIZE = {
  levelUp: { width: 1200, height: 630 },
  cmdLevel: { width: 1200, height: 630 },
  cmdRank: { width: 1200, height: 630 },
  cmdAttend: { width: 1200, height: 630 },
  rankerAnnounce: { width: 1200, height: 675 },
};
export const CARD_KINDS = Object.keys(CARD_SIZE);
export const isCardKind = (k) => Object.prototype.hasOwnProperty.call(CARD_SIZE, k);

// 📌 카드별 data 모양 — "?" 칸은 없으면 그 칸을 그리지 않는다.
//    avatar: 아바타 data URI(png · jpeg) — 없거나 못 받으면 이름 첫 글자 원형. 원격 주소는 받지 않는다(fetchAvatarDataUri 로 먼저 바꾼다)
//    progress: 다음 레벨까지 진행률 0~1 · need: 다음 레벨까지 남은 XP · 등급은 level 로 정한다(CARD_TIERS)
//    skin: 카드 스킨 키(CARD_SKINS) — 아이템 효과 cardSkin. 없거나 모르는 키면 기본 카드
export const CARD_FIELDS = {
  levelUp: ["avatar", "name", "level", "prevLevel", "xp", "need", "progress", "skin?"],
  cmdLevel: ["avatar", "name", "level", "xp", "need", "progress", "rank?", "total?", "skin?"],
  cmdRank: ["avatar", "name", "level", "xp", "need", "progress", "rank?", "total?", "skin?"],
  cmdAttend: ["avatar", "name", "amount", "streak", "bestStreak", "attendCount", "streakBonus?", "skin?"],
  rankerAnnounce: ["season", "seasonName", "top: [{ name, avatar, xp }] — 1위부터 최대 3명"],
};

// 📌 카드 스킨 — 아이템 효과 cardSkin 의 skin 키. 테두리 · 무늬만 바꾼다(바탕 톤 · 글자 · 사진 링 · 막대 · 등급 빛은 그대로).
//    ⚠️ 등급 색(오른쪽 위 빛 · 링 · 문장)과 헷갈리지 않게 스킨은 카드를 색으로 물들이거나 번지는 빛을 얹지 않는다
//    레벨업 · /레벨 · /랭크 · /출석체크 카드에만 — RANKER 발표는 스킨 없음. 모르는 키 · 빈 값은 기본 카드.
//    grid: 무늬("line" 격자 · "dot" 도트 · "hatch" 빗금) · tint/gridOp: 무늬 색 · 진하기
export const CARD_SKINS = {
  gold: { label: "골드", grid: "line", tint: "#f0cf7e", gridOp: 0.055 },
  aurora: { label: "오로라", grid: "line", tint: "#9ff0ff", gridOp: 0.04 },
  ice: { label: "아이스", grid: "dot", tint: "#bfe6ff", gridOp: 0.1 },
  crimson: { label: "크림슨", grid: "hatch", tint: "#ff5a76", gridOp: 0.045 },
};
export const CARD_SKIN_KEYS = Object.keys(CARD_SKINS);
export const SKIN_CARD_KINDS = ["levelUp", "cmdLevel", "cmdRank", "cmdAttend"];
export function cardSkinOf(key) {
  const k = String(key ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CARD_SKINS, k) ? { key: k, ...CARD_SKINS[k] } : null;
}

// 📌 등급 — lib/voiceTiers.js 의 VOICE_TIERS 사본(이름 · 영문 · 하한 레벨 · 색). 거기를 고치면 여기도 고칠 것.
export const CARD_TIERS = [
  { key: "iron", name: "아이언", en: "IRON", min: 1, c: "#8a8a8a" },
  { key: "bronze", name: "브론즈", en: "BRONZE", min: 90, c: "#a06a3c" },
  { key: "silver", name: "실버", en: "SILVER", min: 160, c: "#8d99a6" },
  { key: "gold", name: "골드", en: "GOLD", min: 240, c: "#c39220" },
  { key: "platinum", name: "플래티넘", en: "PLATINUM", min: 330, c: "#3f9e93" },
  { key: "diamond", name: "다이아몬드", en: "DIAMOND", min: 430, c: "#3f7fc4" },
  { key: "master", name: "마스터", en: "MASTER", min: 540, c: "#8557b0" },
  { key: "grandmaster", name: "그랜드마스터", en: "GRANDMASTER", min: 650, c: "#a03a6b" },
  { key: "challenger", name: "챌린저", en: "CHALLENGER", min: 760, c: "#c2452f" },
  { key: "igloo", name: "이글루", en: "IGLOO", min: 880, c: "#e91e3f" },
];

// 만렙 — lib/leveling.js getLevelByXp 의 상한과 같다. 여기서는 "다음 레벨까지" 대신 MAX 를 쓴다
export const CARD_MAX_LEVEL = 1000;

export function cardTierIndex(level) {
  const lv = Number(level) || 0;
  let idx = 0;
  for (let i = 0; i < CARD_TIERS.length; i++) if (lv >= CARD_TIERS[i].min) idx = i;
  return idx;
}

const INK = "#131313";
const ACCENT = "#e91e3f";
const W = (a) => `rgba(255,255,255,${a})`;

const int = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
};
const num = (v) => String(int(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const clamp01 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
};

// 등급 색 → 흰색(toWhite) / 검정 쪽으로 t 만큼 — app/components/TierEmblem.js 와 같은 계산
const mix = (hex, t, toWhite) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  if (!m) return hex;
  const f = (h) => {
    const v = parseInt(h, 16);
    return Math.round(v + ((toWhite ? 255 : 0) - v) * t).toString(16).padStart(2, "0");
  };
  return `#${f(m[1])}${f(m[2])}${f(m[3])}`;
};
const rgba = (hex, a) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : W(a);
};

const b64 = (s) => (typeof Buffer !== "undefined" ? Buffer.from(s, "utf8").toString("base64") : btoa(s));
const svgUri = (svg) => `data:image/svg+xml;base64,${b64(svg)}`;

// ── 글자 — 글꼴에 없는 글자(이모지 · 한자 등)는 satori 가 줄무늬 네모로 그린다. 그리기 전에 뺀다 ──
const EMOJI_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}‍︎️⃣]/gu;

/** has(codePoint) 가 있으면 글꼴에 있는 글자만, 없으면 이모지만 뺀다 */
export function cardText(s, has) {
  let t = String(s ?? "");
  t = typeof has === "function" ? Array.from(t).filter((ch) => /\s/.test(ch) || has(ch.codePointAt(0))).join("") : t.replace(EMOJI_RE, "");
  return t.replace(/\s+/g, " ").trim();
}

/** 글꼴(OTF · TTF) cmap → has(codePoint). 읽지 못하면 null */
export function fontCoverage(buf) {
  try {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const numTables = dv.getUint16(4);
    let cmap = -1;
    for (let i = 0; i < numTables; i++) {
      const r = 12 + i * 16;
      if (String.fromCharCode(u8[r], u8[r + 1], u8[r + 2], u8[r + 3]) === "cmap") cmap = dv.getUint32(r + 8);
    }
    if (cmap < 0) return null;
    // 표 고르기 — (3,10) 형식 12 가 있으면 그것, 없으면 (3,1)/(0,*) 형식 4
    let sub12 = -1;
    let sub4 = -1;
    const n = dv.getUint16(cmap + 2);
    for (let i = 0; i < n; i++) {
      const r = cmap + 4 + i * 8;
      const pid = dv.getUint16(r);
      const eid = dv.getUint16(r + 2);
      const off = cmap + dv.getUint32(r + 4);
      const fmt = dv.getUint16(off);
      if (fmt === 12 && (pid === 3 || pid === 0)) sub12 = off;
      else if (fmt === 4 && ((pid === 3 && eid === 1) || pid === 0)) sub4 = off;
    }
    const ranges = [];
    if (sub12 >= 0) {
      const groups = dv.getUint32(sub12 + 12);
      for (let i = 0; i < groups; i++) {
        const g = sub12 + 16 + i * 12;
        ranges.push([dv.getUint32(g), dv.getUint32(g + 4)]);
      }
    } else if (sub4 >= 0) {
      const seg = dv.getUint16(sub4 + 6) / 2;
      const ends = sub4 + 14;
      const starts = ends + seg * 2 + 2;
      const deltas = starts + seg * 2;
      const rangeOffs = deltas + seg * 2;
      for (let i = 0; i < seg; i++) {
        const end = dv.getUint16(ends + i * 2);
        const start = dv.getUint16(starts + i * 2);
        const delta = dv.getUint16(deltas + i * 2);
        const ro = dv.getUint16(rangeOffs + i * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let gid;
          if (ro === 0) gid = (c + delta) & 0xffff;
          else {
            const p = rangeOffs + i * 2 + ro + (c - start) * 2;
            gid = p + 1 < u8.byteLength ? dv.getUint16(p) : 0;
            if (gid) gid = (gid + delta) & 0xffff;
          }
          if (!gid) continue;
          const last = ranges[ranges.length - 1];
          if (last && last[1] === c - 1) last[1] = c;
          else ranges.push([c, c]);
        }
      }
    } else return null;
    ranges.sort((a, b) => a[0] - b[0]);
    return (cp) => {
      let lo = 0;
      let hi = ranges.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (cp < ranges[mid][0]) hi = mid - 1;
        else if (cp > ranges[mid][1]) lo = mid + 1;
        else return true;
      }
      return false;
    };
  } catch {
    return null;
  }
}

// ── 아바타 — 디스코드 아바타(png 256)를 data URI 로. 2초 안에 못 받으면 null (카드는 첫 글자 원형으로 그린다) ──
export async function fetchAvatarDataUri(url, timeoutMs = 2000) {
  // 📌 디스코드 CDN 주소만 받는다 — 아무 주소나 서버가 대신 받아 오게 두지 않는다
  let u = String(url || "");
  if (!/^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(u)) return null;
  // satori 는 webp · gif 를 못 읽는다 — png 256 으로 바꿔 받는다
  u = u.replace(/\.(webp|gif|jpg|jpeg)(?=\?|$)/i, ".png").replace(/([?&])size=\d+/i, "$1size=256");
  if (!/[?&]size=/.test(u)) u += (u.includes("?") ? "&" : "?") + "size=256";
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(u, ctrl ? { signal: ctrl.signal } : undefined);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 8 || bytes.length > 3 * 1024 * 1024) return null;
    // 파일 머리로 형식을 본다 — png · jpeg 만
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!png && !jpg) return null;
    let bin = "";
    if (typeof Buffer !== "undefined") bin = Buffer.from(bytes).toString("base64");
    else {
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      bin = btoa(bin);
    }
    return `data:image/${png ? "png" : "jpeg"};base64,${bin}`;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── 그림 조각(SVG) ──

// 등급 엠블럼 — app/components/TierEmblem.js 를 SVG 문자열로 옮긴 것(같은 도형 · 색). 날개 · 머리 보석이 닿지 않게 1px 여백
const HEX = (r) =>
  [-90, -30, 30, 90, 150, 210]
    .map((a) => {
      const rad = (a * Math.PI) / 180;
      return `${(24 + r * Math.cos(rad)).toFixed(2)},${(25 + r * Math.sin(rad)).toFixed(2)}`;
    })
    .join(" ");
const E_BODY = HEX(19);
const E_RIM = HEX(18.2);
const E_FIELD = HEX(14.6);
const E_OUTER = HEX(22.2);
const E_STAR = "M24 13.6l2.7 8.7 8.7 2.7-8.7 2.7L24 36.4l-2.7-8.7-8.7-2.7 8.7-2.7z";
const E_CROWN = "M15.2 31.4V19.8l4.9 4.5 3.9-7 3.9 7 4.9-4.5v11.6z";
function emblemGlyph(key, ink, accent) {
  const line = `fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (key) {
    case "iron": return `<path d="M17.6 25h12.8" ${line} stroke-width="2.8"/>`;
    case "bronze": return `<path d="M17.2 28.2 24 21.4l6.8 6.8" ${line} stroke-width="2.8"/>`;
    case "silver": return `<path d="M17.6 24.6 24 18.2l6.4 6.4M17.6 31 24 24.6l6.4 6.4" ${line} stroke-width="2.7"/>`;
    case "gold": return `<path d="M18.6 21.6 24 16.2l5.4 5.4M18.6 27.4 24 22l5.4 5.4M18.6 33.2 24 27.8l5.4 5.4" ${line} stroke-width="2.4"/>`;
    case "platinum": return `<path d="M24 16 32.2 25 24 34 15.8 25z" ${line} stroke-width="2.5"/>`;
    case "diamond": return `<path d="M24 15.2 33 25 24 34.8 15 25z" fill="${ink}"/>` + (accent ? `<path d="M15 25h18M24 15.2 20.9 25 24 34.8 27.1 25z" fill="none" stroke="${accent}" stroke-width="1" opacity="0.5"/>` : "");
    case "master": return `<path d="${E_STAR}" fill="${ink}"/>`;
    case "grandmaster": return `<path d="${E_STAR}" fill="${ink}"/>` + (accent ? `<circle cx="24" cy="25" r="2.1" fill="${accent}"/>` : "");
    case "challenger": return `<path d="${E_CROWN}" fill="${ink}"/>`;
    case "igloo": return `<path d="${E_CROWN}" fill="${ink}"/>` + (accent ? `<path d="M24 23.2l2.1 2.3-2.1 2.3-2.1-2.3z" fill="${accent}"/>` : "");
  }
  return "";
}
export function emblemSvg(tierIndex, size = 96) {
  const r = Math.min(CARD_TIERS.length - 1, Math.max(0, int(tierIndex)));
  const { key, c } = CARD_TIERS[r];
  const hi = mix(c, 0.5, true);
  const light = mix(c, 0.62, true);
  const lo = mix(c, 0.32, false);
  const deep = mix(c, 0.55, false);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 50 50" width="${size}" height="${size}">
<defs>
<linearGradient id="metal" x1="0.15" y1="0" x2="0.55" y2="1"><stop offset="0%" stop-color="${hi}"/><stop offset="48%" stop-color="${c}"/><stop offset="100%" stop-color="${lo}"/></linearGradient>
<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${light}"/><stop offset="55%" stop-color="${mix(c, 0.15, true)}"/><stop offset="100%" stop-color="${deep}"/></linearGradient>
<linearGradient id="field" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${mix(c, 0.22, false)}"/><stop offset="100%" stop-color="${mix(c, 0.06, true)}"/></linearGradient>
<radialGradient id="shine" cx="0.32" cy="0.18" r="0.72"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.42"/><stop offset="55%" stop-color="#ffffff" stop-opacity="0.08"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
</defs>
${r >= 7 ? `<path d="M7.4 16.4 0.9 25l6.5 8.6-1.9-8.6z" fill="url(#rim)"/><path d="M40.6 16.4 47.1 25l-6.5 8.6 1.9-8.6z" fill="url(#rim)"/>` : ""}
${r >= 6 ? `<polygon points="${E_OUTER}" fill="none" stroke="url(#rim)" stroke-width="1.3" stroke-linejoin="round"/>` : ""}
<polygon points="${E_BODY}" fill="url(#metal)" stroke-linejoin="round"/>
<polygon points="${E_RIM}" fill="none" stroke="url(#rim)" stroke-width="1.4" stroke-linejoin="round"/>
<polygon points="${E_FIELD}" fill="url(#field)" stroke="${deep}" stroke-opacity="0.55" stroke-width="0.9" stroke-linejoin="round"/>
<polygon points="${E_BODY}" fill="url(#shine)"/>
${r >= 8 ? `<path d="M24 0.6 27.4 3.9 24 7.4 20.6 3.9z" fill="url(#rim)"/><path d="M20.6 3.9h6.8M24 0.6v6.8" stroke="#ffffff" stroke-opacity="0.35" stroke-width="0.7"/>` : ""}
<g transform="translate(0 0.9)" opacity="0.55">${emblemGlyph(key, deep, null)}</g>
${emblemGlyph(key, "#ffffff", c)}
</svg>`;
}

// 진행 링 — 12시에서 시계 방향. 바탕 테는 흰색 10%
function ringSvg(size, stroke, pct, color) {
  const c = size / 2;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const p = clamp01(pct);
  const arc =
    p <= 0
      ? ""
      : `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(C * p).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#ffffff" stroke-opacity="0.1" stroke-width="${stroke}"/>${arc}</svg>`;
}

// 바탕 — 잉크 + 등급 빛(오른쪽 위) + 왼쪽 위에서 번지는 옅은 격자. 레벨 대시보드 프로필 카드와 같은 문법
//   skin(cardSkinOf) 이 있으면 무늬를 바꾸고 스킨 장식(SKIN_DECO — 테두리 등)을 얹는다(바탕 톤은 그대로)
function bgSvg(w, h, glow, skin) {
  const grid = skin ? skin.grid : "line";
  let d = "";
  if (grid === "dot") {
    // 도트 — 28px 칸마다 4px 네모
    for (let x = 28; x < w; x += 28) for (let y = 28; y < h; y += 28) d += `M${x - 2} ${y - 2}h4v4h-4z`;
  } else if (grid === "hatch") {
    // 빗금 — 45° 가는 선
    for (let x = -h; x < w; x += 26) d += `M${x} 0L${x + h} ${h}`;
  } else {
    const step = 56;
    for (let x = step; x < w; x += step) d += `M${x} 0V${h}`;
    for (let y = step; y < h; y += step) d += `M0 ${y}H${w}`;
  }
  const tint = skin ? skin.tint : "#ffffff";
  const op = skin ? skin.gridOp : 0.05;
  const deco = skin && SKIN_DECO[skin.key] ? SKIN_DECO[skin.key](w, h) : null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1c1c"/><stop offset="0.6" stop-color="${INK}"/></linearGradient>
<radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${w * 0.86}" cy="${h * 0.3}" r="${w * 0.48}"><stop offset="0" stop-color="${glow}" stop-opacity="0.3"/><stop offset="0.72" stop-color="${glow}" stop-opacity="0"/></radialGradient>
<radialGradient id="fade" gradientUnits="userSpaceOnUse" cx="${w * 0.3}" cy="0" r="${w * 0.75}"><stop offset="0.3" stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
<mask id="m"><rect width="${w}" height="${h}" fill="url(#fade)"/></mask>
${deco ? deco.defs : ""}</defs>
<rect width="${w}" height="${h}" fill="url(#base)"/>
<rect width="${w}" height="${h}" fill="url(#glow)"/>
${deco ? deco.under : ""}${grid === "dot"
    ? `<path d="${d}" fill="${tint}" fill-opacity="${op}" mask="url(#m)"/>`
    : `<path d="${d}" stroke="${tint}" stroke-opacity="${op}" stroke-width="1.5" fill="none" mask="url(#m)"/>`}
${deco ? deco.over : ""}</svg>`;
}

// ── 스킨 장식 — (w, h) → { defs, under(무늬 아래), over(맨 위 — 테두리) }. 글자가 없는 가장자리(안쪽 14~40px)에만 그린다 ──
//    ⚠️ 카드 전체를 칠하는 번짐(방사형 빛 · 틴트 · 굵은 빛 띠)은 넣지 않는다 — 등급 빛(오른쪽 위)과 헷갈린다. 테두리 · 무늬 · 가는 선만
const rectPath = (x, y, ww, hh) => `M${x} ${y}h${ww}v${hh}h${-ww}z`;
const SKIN_DECO = {
  // 골드 — 금빛 이중 테 + 모서리 마름모
  gold: (w, h) => {
    const o = 14;
    const i = 24;
    const dia = (x, y, r) => `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`;
    return {
      defs: `<linearGradient id="gd" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${w}" y2="${h}"><stop offset="0" stop-color="#f7de9c"/><stop offset="0.45" stop-color="#b8862b"/><stop offset="0.7" stop-color="#e9c46a"/><stop offset="1" stop-color="#9c6e1e"/></linearGradient>`,
      under: "",
      over: `<rect x="${o}" y="${o}" width="${w - o * 2}" height="${h - o * 2}" fill="none" stroke="url(#gd)" stroke-width="3"/>
<rect x="${i}" y="${i}" width="${w - i * 2}" height="${h - i * 2}" fill="none" stroke="#f0cf7e" stroke-opacity="0.3" stroke-width="1.2"/>
<path d="${[[i, i], [w - i, i], [i, h - i], [w - i, h - i]].map(([x, y]) => dia(x, y, 7)).join("")}" fill="url(#gd)"/>`,
    };
  },
  // 오로라 — 맨 위를 흐르는 초록 · 파랑 · 보라 가는 빛 선(숫자 뒤로는 내려오지 않게) + 같은 빛의 가는 테.
  //   굵게 겹쳐 번지게 하면 등급 빛(플래티넘 · 다이아 · 마스터 색)처럼 보여 가는 선 하나만
  aurora: (w, h) => {
    const ribbon = (d, a) => `<path d="${d}" fill="none" stroke="url(#au)" stroke-width="3" stroke-opacity="${(0.16 * a).toFixed(3)}"/>`;
    return {
      defs: `<linearGradient id="au" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${w}" y2="0"><stop offset="0" stop-color="#2fe3a0"/><stop offset="0.5" stop-color="#38b4ff"/><stop offset="1" stop-color="#a879ff"/></linearGradient>`,
      under:
        ribbon(`M-80 ${h * 0.13}C${w * 0.2} ${h * 0.0} ${w * 0.42} ${h * 0.24} ${w * 0.64} ${h * 0.09}S${w * 0.93} ${h * 0.01} ${w + 80} ${h * 0.12}`, 1) +
        ribbon(`M-80 ${h * 0.24}C${w * 0.24} ${h * 0.12} ${w * 0.5} ${h * 0.3} ${w * 0.76} ${h * 0.17}S${w * 0.98} ${h * 0.13} ${w + 80} ${h * 0.2}`, 0.45),
      over: `<rect x="16" y="16" width="${w - 32}" height="${h - 32}" fill="none" stroke="url(#au)" stroke-opacity="0.7" stroke-width="2"/>`,
    };
  },
  // 아이스 — 도트 스킨. 도트 바탕 + 모서리를 두 칸 깎은 8px 픽셀 액자(위 · 왼쪽 밝게, 아래 · 오른쪽 어둡게) + 안쪽 4px 픽셀 선
  //   + 네 모서리 픽셀 눈송이
  ice: (w, h) => {
    // 모서리를 steps 칸 깎은 픽셀 테 — 칸 크기 P, 바깥 여백 o. { lt: 위 · 왼쪽, rb: 아래 · 오른쪽 } 경로
    const pixelFrame = (o, P, steps) => {
      const L = o;
      const T = o;
      const R = w - o;
      const B = h - o;
      const c = P * steps; // 깎은 폭
      let lt = rectPath(L + c, T, R - L - c * 2, P) + rectPath(L, T + c, P, B - T - c * 2);
      let rb = rectPath(L + c, B - P, R - L - c * 2, P) + rectPath(R - P, T + c, P, B - T - c * 2);
      // 계단 — 모서리마다 대각선으로 한 칸씩
      for (let s = 1; s < steps; s++) {
        const a = P * s;
        const b = c - a;
        lt += rectPath(L + a, T + b, P, P) + rectPath(R - a - P, T + b, P, P);
        rb += rectPath(L + a, B - b - P, P, P) + rectPath(R - a - P, B - b - P, P, P);
      }
      return { lt, rb };
    };
    const outer = pixelFrame(14, 8, 2);
    const inner = pixelFrame(30, 4, 2);
    // 픽셀 눈송이 7×7 (한 칸 4px) — 가운데를 비운 십자 + 가지 끝
    const FLAKE = ["...#...", ".#.#.#.", "..###..", "###.###", "..###..", ".#.#.#.", "...#..."];
    const flake = (cx, cy) => {
      let d = "";
      FLAKE.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") d += rectPath(cx + (x - 3.5) * 4, cy + (y - 3.5) * 4, 4, 4); }));
      return d;
    };
    const q = 52;
    const flakes = flake(q, q) + flake(w - q, q) + flake(q, h - q) + flake(w - q, h - q);
    return {
      defs: "",
      under: "",
      over:
        `<path d="${outer.lt}" fill="#cdeeff" fill-opacity="0.75"/><path d="${outer.rb}" fill="#79b4d8" fill-opacity="0.7"/>` +
        `<path d="${inner.lt + inner.rb}" fill="#b4e3ff" fill-opacity="0.18"/>` +
        `<path d="${flakes}" fill="#e6f6ff" fill-opacity="0.55"/>`,
    };
  },
  // 크림슨 — 붉은 빗금 무늬 + 가는 붉은 테 + 모서리 꺾쇠 (테 색은 이글루 등급색 #e91e3f 와 다르게)
  crimson: (w, h) => {
    const o = 14;
    const L = 48;
    const br =
      `M${o} ${o + L}V${o}H${o + L}M${w - o - L} ${o}H${w - o}V${o + L}` +
      `M${w - o} ${h - o - L}V${h - o}H${w - o - L}M${o + L} ${h - o}H${o}V${h - o - L}`;
    return {
      defs: "",
      under: "",
      over: `<rect x="${o}" y="${o}" width="${w - o * 2}" height="${h - o * 2}" fill="none" stroke="#ff5a76" stroke-opacity="0.45" stroke-width="1.5"/>
<path d="${br}" fill="none" stroke="#ff3a5c" stroke-width="5" stroke-linecap="square"/>`,
    };
  },
};

const checkSvg = (color, sw = 3.2) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48"><path d="M5 12.6l4.4 4.4L19 7.4" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const arrowSvg = (color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48"><path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// 📌 satori 는 글자 폭을 커닝 없이 재고(글자마다 따로) 그릴 때는 커닝을 넣는다 — "2,830,674" · "1,000" 처럼 커닝 쌍이 있는 글은
//    잰 폭보다 좁게 그려져 뒤에 빈틈이 생기고(누적 N  XP) 오른쪽 · 가운데 정렬이 어긋난다.
//    글자 사이에 WORD JOINER(U+2060 · 폭 0 · Pretendard 에 있음)를 끼워 커닝 쌍을 끊으면 잰 폭 = 그린 폭이 된다.
const WJ = "\u2060";
const unkern = (s) => Array.from(s).join(WJ);

// ── 요소 만들기 — h 를 감싼다. 자식 배열은 풀어서 넘긴다(React 의 key 경고가 나지 않게) ──
function kit(h) {
  const kids = (list) =>
    list
      .flat(Infinity)
      .filter((k) => k !== null && k !== undefined && k !== false && k !== "")
      .map((k) => (typeof k === "number" || typeof k === "string" ? unkern(String(k)) : k));
  // 📌 satori 는 자식이 둘 이상인 div 에 display:flex 를 요구한다 — 모든 칸을 flex 로 둔다
  //    letterSpacing 은 끼운 WORD JOINER 에도 붙는다 — 절반만 주면 보이는 글자 사이 간격이 적은 값 그대로다(끝 여백만 절반)
  const box = (style, ...children) =>
    h("div", { style: { display: "flex", ...style, ...(style.letterSpacing ? { letterSpacing: style.letterSpacing / 2 } : null) } }, ...kids(children));
  const img = (src, w, hh, style) => h("img", { src, width: w, height: hh, style: { width: w, height: hh, ...style } });
  // 한 줄 글자 — 넘치면 말줄임
  const line = (text, style) => box({ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...style }, text);
  return { box, img, line };
}

const initialOf = (name) => (Array.from(String(name || "").trim())[0] || "?").toUpperCase();

// 📌 flexShrink 0 — 옆 이름이 길면 줄어 타원이 되지 않게
function avatarEl(k, src, size, name) {
  if (typeof src === "string" && /^data:image\/(png|jpeg);base64,/i.test(src)) {
    return k.img(src, size, size, { borderRadius: size / 2, objectFit: "cover", flexShrink: 0 });
  }
  return k.box(
    {
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: size / 2,
      backgroundColor: "#2a2a2a",
      alignItems: "center",
      justifyContent: "center",
      fontSize: Math.round(size * 0.42),
      fontWeight: 900,
      color: W(0.62),
    },
    initialOf(name)
  );
}

// 사진 + 진행 링 + (아래 가운데) 배지
function ringAvatar(k, o) {
  const inset = o.stroke + o.gap;
  const inner = o.size - inset * 2;
  return k.box(
    { position: "relative", width: o.size, height: o.size, flexShrink: 0 },
    k.img(svgUri(ringSvg(o.size, o.stroke, o.pct, o.color)), o.size, o.size, { position: "absolute", left: 0, top: 0 }),
    k.box({ position: "absolute", left: inset, top: inset }, avatarEl(k, o.avatar, inner, o.name)),
    o.badge || null
  );
}

// 링 아래에 걸치는 등급 엠블럼 — 잉크 원(스킨이면 스킨 바탕색)을 깔아 링을 끊는다
function emblemBadge(k, ringSize, ti, size) {
  const pad = Math.round(size * 0.16);
  const outer = size + pad * 2;
  return k.box(
    {
      position: "absolute",
      left: (ringSize - outer) / 2,
      top: ringSize - outer * 0.62,
      width: outer,
      height: outer,
      borderRadius: outer / 2,
      backgroundColor: INK,
      alignItems: "center",
      justifyContent: "center",
    },
    k.img(svgUri(emblemSvg(ti, size)), size, size)
  );
}

const brand = (k, style) =>
  k.box(
    { alignItems: "center", fontSize: 26, fontWeight: 700, color: W(0.46), letterSpacing: 0.5, ...style },
    k.box({ width: 10, height: 10, backgroundColor: ACCENT, marginRight: 14 }),
    "고급 이글루 · SYSTEM : LEVEL"
  );

// 카드 틀 — k.skin(buildCard 가 정한 스킨)이 있으면 무늬 · 테두리를 그 스킨으로
function frame(k, kind, glow, ...children) {
  const { width, height } = CARD_SIZE[kind];
  return k.box(
    { width, height, position: "relative", backgroundColor: INK, color: "#ffffff", fontFamily: CARD_FONT, overflow: "hidden" },
    k.img(svgUri(bgSvg(width, height, glow, k.skin)), width, height, { position: "absolute", left: 0, top: 0 }),
    children
  );
}

// 막대 — 바탕 흰 10%, 채움은 강조색(대시보드와 같다). 아주 조금이라도 진행했으면 둥근 끝이 보이게 최소 폭
function bar(k, pct, height, color) {
  const p = clamp01(pct);
  return k.box(
    { width: "100%", height, borderRadius: height / 2, backgroundColor: W(0.1), overflow: "hidden" },
    p > 0 ? k.box({ width: `${Math.max(p * 100, 1.6)}%`, height, borderRadius: height / 2, backgroundColor: color }) : null
  );
}

// 글자 폭(em) — Pretendard Black 실측(숫자 0.64 · 쉼표 0.31 · 한글 0.86 · W 1.06)을 조금 넉넉히
const emOf = (ch) =>
  /[0-9]/.test(ch) ? 0.64
  : /[,.:;'|!iljI]/.test(ch) ? 0.31
  : /[#+]/.test(ch) ? 0.67
  : /[ᄀ-ᇿ㄰-㆏가-힯]/.test(ch) ? 0.88
  : /[WM]/.test(ch) ? 1.06
  : /[wm]/.test(ch) ? 0.92
  : /[A-Z]/.test(ch) ? 0.77
  : /[frt]/.test(ch) ? 0.43
  : /[a-z_]/.test(ch) ? 0.64
  : /\s/.test(ch) ? 0.23
  : 0.9;
const emWidth = (s) => {
  let em = 0;
  for (const ch of String(s)) em += emOf(ch);
  return em;
};
// 폭에 맞춰 글자 크기를 줄인다(min ~ max). ls: 글자 사이 간격(px) — 음수면 그만큼 더 들어간다
const fitSize = (text, width, max, ls = 0, min = 26) => {
  const n = Array.from(String(text)).length;
  return Math.max(min, Math.min(max, Math.floor((width - ls * n) / Math.max(emWidth(text), 0.1))));
};

// ── 카드 ──

// 레벨업 — 가운데 배치(2026-09 사용자 확정). 가운데 사진(등급 색 테두리 + 엠블럼), 그 아래 LEVEL UP(승급이면 옆에 알약) ·
//   Lv.이전 → Lv.새 레벨, 맨 아래 막대. 진행은 막대가 맡으므로 사진 테두리는 가득 채운 등급 색. 브랜드 줄 · 누적 XP 는 넣지 않는다("난잡하다")
function levelUpCard(k, kind, d, text) {
  const level = Math.max(1, int(d.level));
  const prev = d.prevLevel == null || d.prevLevel === "" ? level - 1 : int(d.prevLevel);
  const ti = cardTierIndex(level);
  const t = CARD_TIERS[ti];
  const tierUp = cardTierIndex(prev) < ti;
  const maxed = level >= CARD_MAX_LEVEL;
  const pct = maxed ? 1 : d.progress;
  const raw = text(d.name);
  const R = 250;
  return frame(
    k,
    kind,
    t.c,
    k.box(
      { position: "absolute", left: 0, right: 0, top: 46, justifyContent: "center" },
      ringAvatar(k, { size: R, stroke: 12, gap: 14, pct: 1, color: t.c, avatar: d.avatar, name: raw, badge: emblemBadge(k, R, ti, 72) })
    ),
    k.box(
      { position: "absolute", left: 88, right: 88, bottom: 100, flexDirection: "column", alignItems: "center" },
      k.box(
        { alignItems: "center", height: 44 },
        k.box({ fontSize: 30, fontWeight: 900, letterSpacing: 9, color: ACCENT, marginRight: tierUp ? 9 : -9 }, "LEVEL UP"),
        tierUp
          ? k.box(
              { marginLeft: 14, height: 40, paddingLeft: 16, paddingRight: 16, borderRadius: 20, backgroundColor: rgba(t.c, 0.22), border: `2px solid ${rgba(t.c, 0.7)}`, alignItems: "center", fontSize: 24, fontWeight: 900, color: "#ffffff" },
              `${t.name} 승급`
            )
          : null
      ),
      k.box(
        { alignItems: "center", marginTop: 6 },
        k.box({ fontSize: 50, fontWeight: 700, color: W(0.34), whiteSpace: "nowrap" }, `Lv.${num(prev)}`),
        k.img(svgUri(arrowSvg(W(0.34))), 44, 44, { marginLeft: 20, marginRight: 20 }),
        k.box({ fontSize: 88, fontWeight: 900, color: "#ffffff", whiteSpace: "nowrap", letterSpacing: -2 }, `Lv.${num(level)}`)
      )
    ),
    k.box({ position: "absolute", left: 88, right: 88, bottom: 56 }, bar(k, pct, 14, ACCENT))
  );
}

// 프로필(/레벨 · /랭크) — 내 정보의 잉크 헤더 게임 프로필. 사진 링 + 엠블럼 · 이름 · 등급, 오른쪽 큰 LEVEL,
//   아래 칸: 서버 순위(있을 때만) · 누적 XP · 다음 레벨까지, 맨 아래 막대(Lv.n → Lv.n+1)
function profileCard(k, kind, d, text) {
  const level = Math.max(1, int(d.level));
  const ti = cardTierIndex(level);
  const t = CARD_TIERS[ti];
  const tc = mix(t.c, 0.22, true);
  const raw = text(d.name);
  const hasRank = int(d.rank) > 0;
  const maxed = level >= CARD_MAX_LEVEL;
  const pct = maxed ? 1 : d.progress;
  const RING = 236;
  const INNER = 1200 - 144;
  const cells = [
    hasRank ? { l: "서버 순위", v: `#${num(d.rank)}`, sub: int(d.total) > 0 ? `/ ${num(d.total)}` : "" } : null,
    { l: "누적 XP", v: num(d.xp), sub: "" },
    maxed ? { l: "다음 레벨까지", v: "MAX", sub: "" } : { l: "다음 레벨까지", v: num(d.need), sub: "XP" },
  ].filter(Boolean);
  const cellW = Math.floor(INNER / cells.length);
  // 📌 칸마다 숫자 크기가 다르면 줄이 들쭉날쭉하다 — 가장 긴 값에 맞춘 한 크기로 쓴다(뒤 작은 글자 폭 · 칸 여백을 뺀다)
  const valSize = Math.min(...cells.map((c, i) => fitSize(c.v, cellW - (i ? 36 : 0) - 40 - (c.sub ? c.sub.length * 17 + 12 : 0), 64, -1)));
  const LV = 150;
  const lvSize = fitSize(num(level), 330, LV, -5);
  // 이름 칸 폭 — 사진 · 오른쪽 LEVEL 숫자(또는 LEVEL 글자)를 뺀 나머지. 이름은 58 → 40 까지 줄여 보고 그래도 길면 말줄임
  const nameW = INNER - RING - 48 - 32 - Math.max(150, Math.ceil(lvSize * emWidth(num(level)) - 5 * num(level).length));
  return frame(
    k,
    kind,
    t.c,
    k.box(
      { position: "absolute", left: 72, right: 72, top: 58, alignItems: "center" },
      ringAvatar(k, { size: RING, stroke: 13, gap: 13, pct, color: t.c, avatar: d.avatar, name: raw, badge: emblemBadge(k, RING, ti, 68) }),
      k.box(
        { flexDirection: "column", marginLeft: 48, flexGrow: 1, flexShrink: 1, minWidth: 0 },
        k.line(raw || "이름 없음", { fontSize: fitSize(raw || "이름 없음", nameW, 58, -1, 40), fontWeight: 900, letterSpacing: -1, color: "#ffffff" }),
        k.box(
          { alignItems: "center", marginTop: 16 },
          k.box({ fontSize: 42, fontWeight: 900, color: tc, whiteSpace: "nowrap" }, t.name),
          k.box({ fontSize: 26, fontWeight: 700, color: W(0.5), letterSpacing: 5, marginLeft: 14, marginTop: 4, whiteSpace: "nowrap" }, t.en)
        )
      ),
      k.box(
        { flexDirection: "column", alignItems: "flex-end", marginLeft: 32, flexShrink: 0 },
        k.box({ fontSize: 26, fontWeight: 900, letterSpacing: 8, color: W(0.42), marginRight: -4 }, "LEVEL"),
        k.box({ fontSize: lvSize, fontWeight: 900, lineHeight: 0.84, letterSpacing: -5, marginTop: 16 }, num(level))
      )
    ),
    k.box(
      { position: "absolute", left: 72, right: 72, top: 350, borderTop: `2px solid ${W(0.1)}` },
      cells.map((c, i) =>
        k.box(
          {
            width: cellW,
            flexDirection: "column",
            paddingTop: 26,
            paddingLeft: i === 0 ? 0 : 36,
            borderLeft: i === 0 ? "none" : `2px solid ${W(0.1)}`,
          },
          k.box({ fontSize: 28, fontWeight: 700, color: W(0.45) }, c.l),
          k.box(
            { alignItems: "flex-end", marginTop: 12 },
            k.box({ fontSize: valSize, fontWeight: 900, letterSpacing: -1, lineHeight: 1 }, c.v),
            c.sub ? k.box({ fontSize: 28, fontWeight: 700, color: W(0.5), marginLeft: 12, marginBottom: 2 }, c.sub) : null
          )
        )
      )
    ),
    // 막대 — 양끝에 지금 · 다음 레벨. 양쪽 글자 칸 폭을 고정해 막대 길이가 레벨 자릿수에 흔들리지 않게
    k.box(
      { position: "absolute", left: 72, right: 72, bottom: 54, alignItems: "center" },
      k.box({ width: 140, fontSize: 28, fontWeight: 900, color: W(0.75) }, `Lv.${num(level)}`),
      k.box({ width: INNER - 280 }, bar(k, pct, 16, ACCENT)),
      k.box({ width: 140, justifyContent: "flex-end", fontSize: 28, fontWeight: 900, color: W(0.4) }, maxed ? "MAX" : `Lv.${num(level + 1)}`)
    )
  );
}

// 출석 — 출석 완료 표시 · +받은 XP 크게 · 연속 보너스 한 줄 · 7칸 도장(이번 주기 진행) · 최고 연속 · 누적 출석
function attendCard(k, kind, d, text) {
  const raw = text(d.name);
  const streak = Math.max(0, int(d.streak));
  const today = streak > 0 ? ((streak - 1) % 7) + 1 : 0; // 이번 주기에서 오늘이 몇 번째 칸인지
  const week = streak > 0 ? Math.floor((streak - 1) / 7) + 1 : 1;
  const bonus = text(d.streakBonus);
  const amount = `+${num(d.amount)}`;
  const STAMP = 72;
  // 📌 출석은 등급과 상관없는 일 — 빛은 강조색 하나. 세 줄(위 · 가운데 · 아래)을 위아래로 벌려 보너스 줄이 없어도 가운데가 비지 않게
  return frame(
    k,
    kind,
    ACCENT,
    k.box(
      { position: "absolute", left: 72, right: 72, top: 56, bottom: 56, flexDirection: "column", justifyContent: "space-between" },
      // 윗줄 — 사진 · 이름 · 출석 완료
      k.box(
        { alignItems: "center" },
        avatarEl(k, d.avatar, 84, raw),
        k.line(raw || "이름 없음", { marginLeft: 26, marginRight: 24, fontSize: 40, fontWeight: 900, color: "#ffffff", flexShrink: 1, minWidth: 0 }),
        k.box(
          { marginLeft: "auto", height: 60, paddingLeft: 20, paddingRight: 26, borderRadius: 30, backgroundColor: ACCENT, alignItems: "center", flexShrink: 0 },
          k.img(svgUri(checkSvg("#ffffff")), 34, 34, { marginRight: 10 }),
          k.box({ fontSize: 28, fontWeight: 900, color: "#ffffff", whiteSpace: "nowrap" }, "출석 완료")
        )
      ),
      // 가운데 — 받은 XP, 그 아래 연속 보너스
      k.box(
        { flexDirection: "column", alignItems: "flex-start" },
        k.box(
          { alignItems: "flex-end" },
          k.box({ fontSize: fitSize(amount, 860, 150, -4), fontWeight: 900, lineHeight: 0.84, letterSpacing: -4 }, amount),
          k.box({ fontSize: 52, fontWeight: 900, color: W(0.5), marginLeft: 10, marginBottom: 2 }, "XP")
        ),
        bonus
          ? k.line(bonus, { marginTop: 26, height: 52, maxWidth: 1056, paddingLeft: 22, paddingRight: 22, borderRadius: 26, border: `2px solid ${rgba(ACCENT, 0.75)}`, backgroundColor: rgba(ACCENT, 0.14), alignItems: "center", fontSize: 28, fontWeight: 900, color: "#ff8a9d" })
          : null
      ),
      // 아랫줄 — 7칸 도장 · 최고 연속 · 누적 출석
      k.box(
        { alignItems: "flex-end" },
        k.box(
          { flexDirection: "column" },
          k.box(
            { alignItems: "center", fontSize: 28, fontWeight: 700, color: W(0.45) },
            "연속",
            k.box({ color: "#ffffff", fontWeight: 900, marginLeft: 10 }, `${num(streak)}일`),
            week > 1 ? k.box({ marginLeft: 14, color: W(0.35) }, `· ${week}주차`) : null
          ),
          k.box(
            { marginTop: 16 },
            [1, 2, 3, 4, 5, 6, 7].map((n) => {
              const done = n <= today;
              const isToday = n === today;
              return k.box(
                {
                  width: STAMP,
                  height: STAMP,
                  borderRadius: STAMP / 2,
                  marginRight: n < 7 ? 10 : 0,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: done ? (isToday ? ACCENT : rgba(ACCENT, 0.3)) : "transparent",
                  border: done ? `3px solid ${isToday ? "#ff5c77" : rgba(ACCENT, 0.3)}` : `3px solid ${W(0.14)}`,
                  fontSize: 28,
                  fontWeight: 900,
                  color: W(0.3),
                },
                done ? k.img(svgUri(checkSvg(isToday ? "#ffffff" : W(0.85))), 40, 40) : String(n)
              );
            })
          )
        ),
        k.box(
          { marginLeft: "auto" },
          [
            { l: "최고 연속", v: num(d.bestStreak) },
            { l: "누적 출석", v: num(d.attendCount) },
          ].map((c, i) =>
            k.box(
              { flexDirection: "column", paddingLeft: 34, marginLeft: i ? 34 : 0, borderLeft: `2px solid ${W(0.1)}` },
              k.box({ fontSize: 28, fontWeight: 700, color: W(0.45), whiteSpace: "nowrap" }, c.l),
              k.box(
                { alignItems: "flex-end", marginTop: 10 },
                k.box({ fontSize: fitSize(c.v, 150, 56, -1), fontWeight: 900, lineHeight: 1, letterSpacing: -1 }, c.v),
                k.box({ fontSize: 28, fontWeight: 700, color: W(0.45), marginLeft: 6, marginBottom: 4 }, "일")
              )
            )
          )
        )
      )
    )
  );
}

// 시즌 RANKER — SEASON n · 이름, RANKER, 1 · 2 · 3위 포디움(1위 가운데 높게) — 사진 · 이름 · XP
const MEDAL = ["#d4a531", "#a9b4bf", "#b8794a"];
function rankerCard(k, kind, d, text) {
  const { height } = CARD_SIZE[kind];
  const top = Array.isArray(d.top) ? d.top.slice(0, 3) : [];
  const season = int(d.season);
  const seasonName = text(d.seasonName);
  const COL = 340;
  const order = [1, 0, 2]; // 2위 · 1위 · 3위
  const podium = (i) => {
    const p = top[i];
    const first = i === 0;
    const av = first ? 160 : 124;
    const ring = av + 24;
    const color = MEDAL[i];
    const raw = p ? text(p.name) : "";
    const label = p ? raw || "이름 없음" : "—";
    const block = [132, 92, 60][i];
    return k.box(
      { width: COL, flexDirection: "column", alignItems: "center", marginLeft: first ? 20 : 0, marginRight: first ? 20 : 0 },
      k.box(
        { position: "relative", width: ring, height: ring },
        k.box({ position: "absolute", left: 0, top: 0, width: ring, height: ring, borderRadius: ring / 2, border: `6px solid ${p ? color : W(0.14)}` }),
        k.box({ position: "absolute", left: 12, top: 12 }, p ? avatarEl(k, p.avatar, av, raw) : k.box({ width: av, height: av, borderRadius: av / 2, backgroundColor: W(0.05) })),
        k.box(
          {
            position: "absolute",
            left: ring / 2 - 29,
            top: ring - 38,
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: p ? color : "#2a2a2a",
            border: `5px solid ${INK}`,
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            fontWeight: 900,
            color: p ? INK : W(0.4),
          },
          String(i + 1)
        )
      ),
      k.line(label, { marginTop: 30, maxWidth: COL - 24, fontSize: fitSize(label, COL - 24, first ? 40 : 34, 0, 28), fontWeight: 900, color: p ? "#ffffff" : W(0.3) }),
      k.box({ marginTop: 6, height: 36, fontSize: first ? 30 : 28, fontWeight: 700, color: W(0.55), alignItems: "center" }, p ? `${num(p.xp)} XP` : ""),
      k.box({
        marginTop: 20,
        width: "100%",
        height: block,
        borderTop: `4px solid ${p ? color : W(0.14)}`,
        backgroundImage: `linear-gradient(180deg, ${rgba(p ? color : "#ffffff", p ? 0.3 : 0.05)} 0%, ${rgba(p ? color : "#ffffff", 0)} 100%)`,
      })
    );
  };
  return frame(
    k,
    kind,
    MEDAL[0],
    k.box(
      { position: "absolute", left: 0, right: 0, top: 44, flexDirection: "column", alignItems: "center" },
      k.box(
        { maxWidth: 1056, alignItems: "center", fontSize: 28, fontWeight: 900, color: W(0.55), whiteSpace: "nowrap" },
        k.box({ letterSpacing: 6, flexShrink: 0 }, `SEASON ${season}`),
        seasonName ? k.line(`· ${seasonName}`, { marginLeft: 8, color: W(0.5), letterSpacing: 1, minWidth: 0, flexShrink: 1 }) : null
      ),
      k.box({ marginTop: 2, fontSize: 88, fontWeight: 900, letterSpacing: 18, marginRight: -9, lineHeight: 1.05 }, "RANKER")
    ),
    k.box({ position: "absolute", left: 0, right: 0, bottom: 0, height: height - 196, justifyContent: "center", alignItems: "flex-end" }, order.map(podium))
  );
}

/**
 * 카드 요소 트리 — kind: CARD_KINDS 중 하나, data: CARD_FIELDS 모양, h: (type, props, ...children) => 요소
 * opts.has(codePoint): 글꼴에 있는 글자인지(fontCoverage) — 주면 없는 글자를 빼고 그린다
 * data.skin: 카드 스킨 키(CARD_SKINS) — 레벨업 · /레벨 · /랭크 · /출석체크에만
 */
export function buildCard(kind, data, h, opts = {}) {
  if (!isCardKind(kind)) throw new Error(`알 수 없는 카드: ${kind}`);
  const k = kit(h);
  const d = data && typeof data === "object" ? data : {};
  // 스킨은 레벨업 · 프로필 · 출석 카드에만 (RANKER 발표는 기본)
  k.skin = SKIN_CARD_KINDS.includes(kind) ? cardSkinOf(d.skin) : null;
  const text = (s) => cardText(s, opts.has);
  if (kind === "levelUp") return levelUpCard(k, kind, d, text);
  if (kind === "cmdLevel" || kind === "cmdRank") return profileCard(k, kind, d, text);
  if (kind === "cmdAttend") return attendCard(k, kind, d, text);
  return rankerCard(k, kind, d, text);
}

// ── 샘플 — 관리자 미리보기 · 확인용. tierIndex(0~9) 등급 한가운데 레벨로 만든다. skin 을 주면 그 스킨(RANKER 제외) ──
//    누적 XP 는 lib/leveling.js 공식(0.075L³ + 55L² + 145L)을 샘플에만 옮겨 쓴다
const sampleXp = (lv) => (lv <= 0 ? 0 : Math.floor((3 * lv ** 3 + 2200 * lv ** 2 + 5800 * lv) / 40) - 200);
export function sampleCardData(kind, tierIndex = 1, avatar = null, skin = "") {
  if (skin && SKIN_CARD_KINDS.includes(kind)) return { ...sampleCardData(kind, tierIndex, avatar), skin };
  const ti = Number.isInteger(tierIndex) && tierIndex >= 0 && tierIndex < CARD_TIERS.length ? tierIndex : 1;
  const t = CARD_TIERS[ti];
  const next = CARD_TIERS[ti + 1];
  const level = next ? Math.round((t.min + next.min) / 2) : t.min + 40;
  const base = sampleXp(level);
  const step = sampleXp(level + 1) - base;
  const cur = Math.floor(step * 0.38);
  const me = { avatar, name: "펭귄", level, xp: base + cur, need: step - cur, progress: cur / step };
  if (kind === "levelUp") return { ...me, prevLevel: level - 1, xp: base + Math.floor(step * 0.06), need: step - Math.floor(step * 0.06), progress: 0.06 };
  if (kind === "cmdLevel") return me;
  if (kind === "cmdRank") return { ...me, rank: 12, total: 1284 };
  if (kind === "cmdAttend") return { avatar, name: "펭귄", amount: 10000, streak: 5, bestStreak: 12, attendCount: 42, streakBonus: "연속 5일 보너스 +3,000 XP" };
  return {
    season: 1,
    seasonName: "UP!",
    top: [
      { name: "북극곰", avatar: null, xp: 48210000 },
      { name: "펭귄", avatar, xp: 41870500 },
      { name: "물범", avatar: null, xp: 39002300 },
    ],
  };
}

// ═══ 공용 블록 끝 ═══

// ── 봇 전용 — 렌더러 ──

export const CARD_FILE = "card.png"; // 메시지 첨부 이름 — 임베드 image 는 "attachment://card.png"

const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/fonts");

// 📌 satori 는 fonts 배열 객체를 기준으로 글꼴 해석 결과를 캐시한다 — 같은 배열을 계속 넘긴다
let loaded = null;
function loadFonts() {
  if (loaded) return loaded;
  const fonts = CARD_FONT_FILES.map(({ weight, file }) => ({
    name: CARD_FONT,
    weight,
    style: "normal",
    data: fs.readFileSync(path.join(FONT_DIR, file)),
  }));
  loaded = { fonts, has: fontCoverage(fonts[0].data) };
  return loaded;
}

// satori 가 읽는 요소 모양 { type, props: { ...props, children } }
const h = (type, props, ...children) => ({
  type,
  props: { ...(props || {}), children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children },
});

/**
 * 카드 → PNG Buffer. 실패하거나 timeoutMs 안에 못 끝내면 null — 부르는 쪽은 글(임베드)만 보낸다.
 * data 의 avatar 는 data URI 여야 한다(fetchAvatarDataUri 로 먼저 받는다).
 */
export async function renderCard(kind, data, { timeoutMs = 3000 } = {}) {
  if (!isCardKind(kind)) return null;
  const ctrl = new AbortController();
  let timer;
  const work = (async () => {
    const { fonts, has } = loadFonts();
    const { width, height } = CARD_SIZE[kind];
    const svg = await satori(buildCard(kind, data, h, { has }), { width, height, fonts });
    if (ctrl.signal.aborted) return null;
    // 📌 시스템 글꼴을 읽지 않는다 — 글자는 satori 가 이미 도형으로 바꿨고, 윈도우에서는 글꼴 목록을 훑느라 2초가 걸린다
    const img = await renderAsync(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } }, ctrl.signal);
    return Buffer.from(img.asPng());
  })();
  work.catch(() => {}); // 시간 초과로 먼저 끝난 뒤의 실패가 처리되지 않은 거절로 남지 않게
  const late = new Promise((resolve) => {
    timer = setTimeout(() => {
      ctrl.abort();
      resolve(null);
    }, timeoutMs);
  });
  try {
    const png = await Promise.race([work, late]);
    if (!png) console.warn(`[카드] ${kind} — ${timeoutMs}ms 안에 못 그렸습니다. 글만 보냅니다.`);
    return png || null;
  } catch (e) {
    console.error(`[카드] ${kind} 그리기 실패:`, e?.message || e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
