/* 📌 봇 메시지 이미지 카드 — 레벨업 · 역할 지급 · /레벨 · /랭크 · /출석체크 · /퀘스트 · /인벤토리 · /시즌패스 · 시즌 RANKER 발표를 PNG 한 장으로 그린다.
   ⚠️ bot/src/botCards.js 에 사본이 있다(봇은 별도 배포라 이 파일을 import 할 수 없다).
      아래 "공용 블록" 구간은 두 파일이 글자 하나까지 같아야 한다 — 한쪽을 고치면 반드시 다른 쪽도 고칠 것.
   buildCard(kind, data, h) 는 요소 트리만 만든다. h 는 주입 — 사이트는 React.createElement(next/og ImageResponse),
   봇은 { type, props } 를 만드는 작은 함수(satori → resvg). 그래서 같은 코드가 양쪽에서 같은 그림을 그린다.
   글꼴: Pretendard(OFL · assets/fonts/, 봇은 bot/assets/fonts/). satori 는 woff2 를 못 읽어 OTF 를 둔다.
   사이트 쓰임: app/api/admin/bot-messages/card/route.js (관리자 '봇 메시지' 미리보기) */

// 시즌 2 카드 스킨 그림(문자열 함수) — 봇은 bot/src/cardSkins 사본
import { STRING_SKINS } from "./cardSkins/index.js";

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
  roleGrant: { width: 1200, height: 630 }, // 레벨업 카드와 한 벌
  cmdLevel: { width: 1200, height: 630 },
  cmdRank: { width: 1200, height: 900 }, // 서버 순위표 — 10줄 + 내 줄이라 세로로 길다
  cmdAttend: { width: 1200, height: 630 },
  autoAttend: { width: 1200, height: 630 }, // 음성 자동 출석 — /출석체크 카드와 같은 그림(attendCard)
  rankerAnnounce: { width: 1200, height: 675 },
  cmdQuest: { width: 1200, height: 698 }, // 일일 · 주간 · 월간 세 칸 — 높이는 퀘스트가 가장 많은 칸에 맞춰 준다(cardSizeOf). 이 값은 가장 클 때(한 칸 4줄 — questHeight)
  cmdInventory: { width: 1200, height: 690 }, // 가방 6칸 × 2줄
  cmdPass: { width: 1200, height: 823 }, // 다음 보상 칸이 한 줄(PASS_SHOW)을 넘으면 두 줄 — 높이는 칸 수에 맞춰 준다(cardSizeOf). 이 값은 두 줄일 때
};
export const CARD_KINDS = Object.keys(CARD_SIZE);
export const isCardKind = (k) => Object.prototype.hasOwnProperty.call(CARD_SIZE, k);

// 📌 카드별 data 모양 — "?" 칸은 없으면 그 칸을 그리지 않는다.
//    avatar: 아바타 data URI(png · jpeg) — 없거나 못 받으면 이름 첫 글자 원형. 원격 주소는 받지 않는다(fetchAvatarDataUri 로 먼저 바꾼다)
//    progress: 다음 레벨까지 진행률 0~1 · need: 다음 레벨까지 남은 XP · 등급은 level 로 정한다(CARD_TIERS)
//    skin: 카드 스킨 키(CARD_SKINS) — 아이템 효과 cardSkin. 없거나 모르는 키면 기본 카드
export const CARD_FIELDS = {
  levelUp: ["avatar", "name", "level", "prevLevel", "xp", "need", "progress", "skin?"],
  //  roleColor: 디스코드 역할 색 "#rrggbb"(role.hexColor — "#000000" 은 색 없음 = 흰색) · level: 그 역할의 지급 레벨
  //  tier: 등급 키 · 번호(CARD_TIERS) — 없으면 역할 이름이 등급 이름일 때 그 등급. 등급 역할이면 역할 색 대신 등급 색 · 엠블럼
  roleGrant: ["avatar", "name", "role", "roleColor?", "level?", "tier?", "skin?"],
  cmdLevel: ["avatar", "name", "level", "xp", "need", "progress", "rank?", "total?", "skin?"],
  cmdRank: ["season", "seasonName", "total", "top: [{ rank, name, avatar, level, xp }] — 1위부터 최대 10명", "me?: { rank, name, avatar, level, xp }", "skin?"],
  cmdAttend: ["avatar", "name", "amount", "streak", "bestStreak", "attendCount", "streakBonus?", "skin?"],
  autoAttend: ["avatar", "name", "amount", "streak", "bestStreak", "attendCount", "streakBonus?", "skin?"],
  rankerAnnounce: ["season", "seasonName", "top: [{ name, avatar, xp }] — 1위부터 최대 3명"],
  //  item: { name, type, icon("art:키" · "svg:키" · 짧은 글자), image?(png · jpeg data URI — 원격 주소는 받지 않는다), color? } — 그림은 itemIconEl
  cmdQuest: ["name", "claimable", "periods: [{ key: daily|weekly|monthly, left: 초기화까지 ms, quests: [{ name, metric: count|minute|xp|day|run|channel|point, unit?: 회|분|일|곳|건|개|빙옥, current, target, rewardXp, rewardPoint, done, claimed, claimable }] }]", "skin?"],
  cmdInventory: ["name", "total", "items: [item + { count, days?: 남은 일수(영구면 없음), pending?, worn? }] — 앞에서 BAG_SLOTS 칸까지", "skin?"],
  cmdPass: ["season", "seasonName", "tier", "maxTier", "progress — 다음 티어까지 0~1", "need — 다음 티어까지 남은 XP", "claimFree", "claimPaid", "premium", "nextTier — 다음 보상 티어(다 넘었으면 0)", "next: [{ kind: xp|point|role|item, amount?, label?, premium, ...item }] — 그 티어의 무료 → 프리미엄 전부(최대 PASS_MAX)"],
};

// 📌 카드 스킨 — 아이템 효과 cardSkin 의 skin 키. 테두리 · 무늬만 바꾼다(바탕 톤 · 글자 · 사진 링 · 막대 · 등급 빛은 그대로).
//    ⚠️ 등급 색(오른쪽 위 빛 · 링 · 문장)과 헷갈리지 않게 스킨은 카드를 색으로 물들이거나 번지는 빛을 얹지 않는다
//    레벨업 · 역할 지급 · /레벨 · /랭크 · /출석체크 · /퀘스트 · /인벤토리 · /시즌패스 카드에만 — RANKER 발표는 스킨 없음. 모르는 키 · 빈 값은 기본 카드.
//    grid: 무늬("line" 격자 · "dot" 도트 · "hatch" 빗금) · tint/gridOp: 무늬 색 · 진하기
export const CARD_SKINS = {
  gold: { label: "골드", grid: "line", tint: "#f0cf7e", gridOp: 0.055 },
  aurora: { label: "오로라", grid: "line", tint: "#9ff0ff", gridOp: 0.04 },
  ice: { label: "아이스", grid: "dot", tint: "#bfe6ff", gridOp: 0.1 },
  crimson: { label: "크림슨", grid: "hatch", tint: "#ff5a76", gridOp: 0.045 },
  // 시즌 2 「A New World」 — 그림은 cardSkins(사이트 lib/cardSkins · 봇 bot/src/cardSkins 같은 파일)
  newworld: { label: "새로운 세계", grid: "line", tint: "#ffe3c4", gridOp: 0.045 },
  chart: { label: "항해도", grid: "line", tint: "#e9d6ae", gridOp: 0.05 },
  airship: { label: "비공정", grid: "line", tint: "#b9c8ce", gridOp: 0.045 },
};
export const CARD_SKIN_KEYS = Object.keys(CARD_SKINS);
export const SKIN_CARD_KINDS = ["levelUp", "roleGrant", "cmdLevel", "cmdRank", "cmdAttend", "autoAttend", "cmdQuest", "cmdInventory", "cmdPass"];
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
// 스킨 장식 도구 — 사이트 프로필 카드(app/components/SkinFrame.js)와 같은 모양 말. 카드는 1200 폭이라 디스코드에서 약 0.4배로 보인다 —
//   장식 크기는 SK 배로 키워 프로필 카드와 같은 크기로 보이게
const SK = 2.2;
const r1 = (n) => Math.round(n * 10) / 10;
const diaPath = (x, y, r) => `M${r1(x)} ${r1(y - r)}L${r1(x + r)} ${r1(y)}L${r1(x)} ${r1(y + r)}L${r1(x - r)} ${r1(y)}Z`;
const star4 = (x, y, r) => `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;
// 스킨마다 같은 자리에 찍히도록 씨앗 고정 난수
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SKIN_DECO = {
  // 골드 — 금빛 이중 테 + 모서리 마름모 · 둥근 L 장식, 위아래 문장, 아래 두 모서리 부챗살, 반짝임
  gold: (w, h) => {
    const o = 14;
    const i = 24;
    const corner = `M0 38V12Q0 0 12 0H38M7 24V16Q7 7 16 7H24`;
    const corners = [[i + 6, i + 6, 1, 1], [w - i - 6, i + 6, -1, 1], [i + 6, h - i - 6, 1, -1], [w - i - 6, h - i - 6, -1, -1]]
      .map(([x, y, sx, sy]) => `<g transform="translate(${x} ${y}) scale(${sx * SK} ${sy * SK})"><path d="${corner}" fill="none" stroke="url(#gd)" stroke-opacity="0.8" stroke-width="1.3"/><circle cx="42" cy="0" r="1.3" fill="#f0cf7e" fill-opacity="0.75"/><circle cx="0" cy="42" r="1.3" fill="#f0cf7e" fill-opacity="0.75"/></g>`)
      .join("");
    const crest = (y, s) => {
      const ly = y + s * 5 * SK;
      return `<path d="M${w / 2 - 46 * SK} ${ly}H${w / 2 - 12 * SK}M${w / 2 + 12 * SK} ${ly}H${w / 2 + 46 * SK}" stroke="url(#gd)" stroke-opacity="0.6" stroke-width="2"/>` +
        `<circle cx="${w / 2 - 48 * SK}" cy="${ly}" r="${1.4 * SK}" fill="#f0cf7e" fill-opacity="0.75"/><circle cx="${w / 2 + 48 * SK}" cy="${ly}" r="${1.4 * SK}" fill="#f0cf7e" fill-opacity="0.75"/>` +
        `<path d="${diaPath(w / 2, y, 7 * SK)}" fill="url(#gd)"/><path d="${diaPath(w / 2, y, 2.6 * SK)}" fill="#1b1b1b" fill-opacity="0.85"/>`;
    };
    const rays = [10, 22, 34, 46, 58, 70, 80].map((a) => { const t = (a * Math.PI) / 180; return `M0 0L${r1(Math.cos(t) * 64)} ${r1(-Math.sin(t) * 64)}`; }).join("");
    const fans = [[i + 2, h - i - 2, 1], [w - i - 2, h - i - 2, -1]]
      .map(([x, y, sx]) => `<g transform="translate(${x} ${y}) scale(${sx * SK} ${SK})"><path d="${rays}" stroke="url(#gd)" stroke-opacity="0.3" stroke-width="0.8"/><path d="M52 0A52 52 0 0 0 0 -52M40 0A40 40 0 0 0 0 -40" fill="none" stroke="#f0cf7e" stroke-opacity="0.24" stroke-width="0.8"/></g>`)
      .join("");
    return {
      defs: `<linearGradient id="gd" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${w}" y2="${h}"><stop offset="0" stop-color="#f7de9c"/><stop offset="0.45" stop-color="#b8862b"/><stop offset="0.7" stop-color="#e9c46a"/><stop offset="1" stop-color="#9c6e1e"/></linearGradient>`,
      under: fans + `<path d="${star4(w - 70, h * 0.5, 14) + star4(w - 40, h * 0.58, 8) + star4(64, h * 0.66, 10)}" fill="#f7de9c" fill-opacity="0.5"/>`,
      over: `<rect x="${o}" y="${o}" width="${w - o * 2}" height="${h - o * 2}" fill="none" stroke="url(#gd)" stroke-width="3"/>
<rect x="${i}" y="${i}" width="${w - i * 2}" height="${h - i * 2}" fill="none" stroke="#f0cf7e" stroke-opacity="0.3" stroke-width="1.2"/>
${corners}<path d="${[[i, i], [w - i, i], [i, h - i], [w - i, h - i]].map(([x, y]) => diaPath(x, y, 7)).join("")}" fill="url(#gd)"/>${crest(o, 1)}${crest(h - o, -1)}`,
    };
  },
  // 오로라 — 밤하늘 별 · 위 테 아래를 흐르는 물결 선에서 드리우는 짧은 빛 커튼(가는 세로 빛줄) · 빛 테.
  //   굵게 겹쳐 번지게 하면 등급 빛(플래티넘 · 다이아 · 마스터 색)처럼 보여 가는 선 · 점만
  aurora: (w, h) => {
    const rand = seeded(7);
    const o = 16;
    const wave = (x) => o + 12 * SK + Math.sin((x / w) * Math.PI * 2.2 + 0.6) * 6 * SK;
    const wavePath = (dy) => {
      let d = "";
      for (let x = -10; x <= w + 10; x += 12) d += `${d ? "L" : "M"}${x} ${r1(wave(x) + dy)}`;
      return d;
    };
    let rays = "";
    for (let x = o + 18; x < w - o - 8; x += 11 * SK) {
      const len = (8 + rand() * 16) * SK;
      const band = x < w / 3 ? "g" : x < (w * 2) / 3 ? "b" : "p";
      rays += `<rect x="${r1(x - 0.9 * SK)}" y="${r1(wave(x))}" width="${r1(1.8 * SK)}" height="${r1(len)}" fill="url(#ray${band})"/>`;
    }
    let stars = "";
    for (let n = 0; n < 40; n++) {
      const x = o + 20 + rand() * (w - o * 2 - 40);
      const y = o + 30 + rand() * (h * 0.6);
      stars += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1((0.6 + rand() * 0.9) * SK)}" fill="#ffffff" fill-opacity="${r1(0.2 + rand() * 0.4)}"/>`;
    }
    const rayGrad = (id, c) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity="0.5"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>`;
    return {
      defs: `<linearGradient id="au" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${w}" y2="0"><stop offset="0" stop-color="#2fe3a0"/><stop offset="0.5" stop-color="#38b4ff"/><stop offset="1" stop-color="#a879ff"/></linearGradient>${rayGrad("rayg", "#2fe3a0")}${rayGrad("rayb", "#38b4ff")}${rayGrad("rayp", "#a879ff")}`,
      under: stars + rays +
        `<path d="${wavePath(0)}" fill="none" stroke="url(#au)" stroke-opacity="0.55" stroke-width="${1.4 * SK}"/>` +
        `<path d="${wavePath(9 * SK)}" fill="none" stroke="url(#au)" stroke-opacity="0.25" stroke-width="${0.8 * SK}"/>`,
      over: `<rect x="${o}" y="${o}" width="${w - o * 2}" height="${h - o * 2}" fill="none" stroke="url(#au)" stroke-opacity="0.7" stroke-width="2"/>` +
        `<path d="${star4(w - 70, h - 74, 11) + star4(w - 100, h - 58, 6)}" fill="#ffffff" fill-opacity="0.55"/>`,
    };
  },
  // 아이스 — 도트로 다시 그린 한 벌(2026-10-05) — 사이트 프로필 카드와 같은 그림 함수(cardSkins/ice.js)
  ice: (w, h) => STRING_SKINS.ice.deco(w, h, SK, false),
  // 크림슨 — 도트로 다시 그린 한 벌(2026-10-05) — 사이트 프로필 카드와 같은 그림 함수(cardSkins/crimson.js)
  crimson: (w, h) => STRING_SKINS.crimson.deco(w, h, SK, false),
  // 시즌 2 — 사이트 프로필 카드(SkinFrame)와 같은 그림 함수(S=SK 배율)
  newworld: (w, h) => STRING_SKINS.newworld.deco(w, h, SK, false),
  chart: (w, h) => STRING_SKINS.chart.deco(w, h, SK, false),
  airship: (w, h) => STRING_SKINS.airship.deco(w, h, SK, false),
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
  // 여러 줄 글자(최대 lines 줄, 넘치면 말줄임) — 줄이 바뀌어야 해서 WORD JOINER 를 끼우지 않는다(커닝 폭 차이는 숫자 정렬에서만 문제). 띄어쓰기에서만 줄을 바꾼다
  //    📌 가운데 맞춤은 textAlign 과 justifyContent 를 함께 — satori 는 한 줄짜리 글에 textAlign 만으로는 가운데로 보내지 않는다
  const para = (text, lines, style) =>
    h("div", { style: { display: "block", lineClamp: lines, wordBreak: "keep-all", overflow: "hidden", ...style } }, String(text ?? ""));
  return { box, img, line, para };
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

// 링 아래에 걸치는 등급 엠블럼 — 잉크 원(스킨이면 스킨 바탕색)을 깔아 링을 끊는다. icon 을 주면 엠블럼 대신 그것(역할 지급 — 등급이 아닌 역할의 방패)
function emblemBadge(k, ringSize, ti, size, icon) {
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
    icon || k.img(svgUri(emblemSvg(ti, size)), size, size)
  );
}

const brand = (k, style) =>
  k.box(
    { alignItems: "center", fontSize: 26, fontWeight: 700, color: W(0.46), letterSpacing: 0.5, ...style },
    k.box({ width: 10, height: 10, backgroundColor: ACCENT, marginRight: 14 }),
    "고급 이글루 · SYSTEM : LEVEL"
  );

// 카드 틀 — k.skin(buildCard 가 정한 스킨)이 있으면 무늬 · 테두리를 그 스킨으로. 크기는 k.size(buildCard 가 정한 cardSizeOf)
function frame(k, kind, glow, ...children) {
  const { width, height } = k.size || CARD_SIZE[kind];
  return k.box(
    { width, height, position: "relative", backgroundColor: INK, color: "#ffffff", fontFamily: CARD_FONT, overflow: "hidden" },
    k.img(svgUri(bgSvg(width, height, glow, k.skin)), width, height, { position: "absolute", left: 0, top: 0 }),
    children
  );
}

// 막대 — 바탕 흰 10%, 채움은 강조색(대시보드와 같다). 아주 조금이라도 진행했으면 둥근 끝이 보이게 최소 폭
//   color 가 "linear-gradient(…)" 면 그 결로 채운다(시즌 패스)
function bar(k, pct, height, color) {
  const p = clamp01(pct);
  const fill = String(color).startsWith("linear-gradient") ? { backgroundImage: color } : { backgroundColor: color };
  return k.box(
    { width: "100%", height, borderRadius: height / 2, backgroundColor: W(0.1), overflow: "hidden" },
    p > 0 ? k.box({ width: `${Math.max(p * 100, 1.6)}%`, height, borderRadius: height / 2, ...fill }) : null
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

// 상대 휘도(0~1) — sRGB 감마를 풀어 잰다
const lumOf = (hex) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  if (!m) return 1;
  const ch = (h) => {
    const v = parseInt(h, 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(m[1]) + 0.7152 * ch(m[2]) + 0.0722 * ch(m[3]);
};
// HSL 밝기(l)만 바꾼 색 — 색상 · 채도는 그대로
function withLightness(hex, l) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l0 = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r1, g1, b1] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const o = l - c / 2;
  return `#${[r1, g1, b1].map((v) => Math.round(Math.min(1, Math.max(0, v + o)) * 255).toString(16).padStart(2, "0")).join("")}`;
}
// 📌 잉크 바탕에서 보이는 역할 색 — "#rgb" · "#rrggbb" 만. "#000000"(디스코드 '색 없음') · 잘못된 값은 null(흰색으로 그린다).
//    휘도 0.15(잉크와 대비 약 3.5:1) 아래면 색상 · 채도는 두고 밝기만 4%씩 올린다(흰색을 섞으면 회색이 된다).
//    등급 색은 이 함수를 거치지 않는다(CARD_TIERS 그대로)
function visibleColor(v) {
  let c = String(v ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(c)) c = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  if (!/^#[0-9a-f]{6}$/.test(c) || c === "#000000") return null;
  if (lumOf(c) >= 0.15) return c;
  const n = [1, 2, 3].map((i) => parseInt(c.slice(i * 2 - 1, i * 2 + 1), 16) / 255);
  let l = (Math.max(...n) + Math.min(...n)) / 2;
  let out = c;
  while (lumOf(out) < 0.15 && l < 0.96) {
    l = Math.min(0.96, l + 0.04);
    out = withLightness(c, l);
  }
  return out;
}
// 📌 오른쪽 위 빛 — 밝은 역할 색(노랑 · 흰색 · 파스텔)은 같은 진하기로도 카드가 뿌옇게 떠서, 휘도 0.3(등급 빛 가운데 밝은 골드 · 실버 정도)까지
//    밝기만 4%씩 내린다. 색 없는 역할(null)은 회색 빛
function glowOf(c) {
  if (!c) return "#737373";
  if (lumOf(c) <= 0.3) return c;
  const n = [1, 2, 3].map((i) => parseInt(c.slice(i * 2 - 1, i * 2 + 1), 16) / 255);
  let l = (Math.max(...n) + Math.min(...n)) / 2;
  let out = c;
  while (lumOf(out) > 0.3 && l > 0.04) {
    l = Math.max(0.04, l - 0.04);
    out = withLightness(c, l);
  }
  return out;
}
// 등급 역할인지 → 등급 번호 | -1. tier(키 · 번호 · 이름)를 주면 그것, 없으면 역할 이름이 등급 이름(한글 · 영문)과 같을 때
function roleTierOf(tier, role) {
  const byName = (s) => {
    const v = String(s ?? "").trim().toLowerCase();
    return v ? CARD_TIERS.findIndex((t) => t.key === v || t.name === v || t.en.toLowerCase() === v) : -1;
  };
  const n = typeof tier === "number" ? tier : /^\d+$/.test(String(tier ?? "").trim()) ? Number(String(tier).trim()) : NaN;
  if (Number.isInteger(n) && n >= 0 && n < CARD_TIERS.length) return n;
  const a = byName(tier);
  return a >= 0 ? a : byName(role);
}

// 역할 지급 — 레벨업 카드와 한 벌(2026-10). 가운데 사진(역할 색 테두리 + 등급 역할이면 등급 엠블럼, 아니면 역할 색 방패) ·
//   NEW ROLE(레벨업의 LEVEL UP 자리) · 역할 이름 크게(앞에 역할 색 점) · 맨 아래 "Lv.n 달성 보상" 한 줄(레벨업 막대 자리).
//   역할 색: 등급 역할이면 등급 색 > 디스코드 역할 색(어두우면 밝혀서) > 흰색. 빛(오른쪽 위)도 그 색(너무 밝으면 낮춰서 — glowOf)
function roleGrantCard(k, kind, d, text) {
  const role = text(d.role) || "역할";
  const ti = roleTierOf(d.tier, role);
  const t = ti >= 0 ? CARD_TIERS[ti] : null;
  const tinted = t ? t.c : visibleColor(d.roleColor);
  const color = tinted || "#ffffff";
  const level = int(d.level);
  const raw = text(d.name);
  const R = 250;
  const DOT = 30;
  const GAP = 26;
  // 역할 이름 — 점 반대쪽에도 같은 폭을 비워 이름이 한가운데 오게. 88 에서 남은 폭(1024 - 56 × 2)에 맞춰 줄이고 52 아래로는 말줄임
  const nameSize = fitSize(role, 1200 - 88 * 2 - (DOT + GAP) * 2, 88, -2, 52);
  return frame(
    k,
    kind,
    // 등급 색은 그대로, 역할 색은 너무 밝으면 낮춰서, 색 없는 역할은 회색 빛 — 흰 빛은 카드 전체가 뿌옇게 뜬다
    t ? t.c : glowOf(tinted),
    k.box(
      { position: "absolute", left: 0, right: 0, top: 46, justifyContent: "center" },
      ringAvatar(k, {
        size: R,
        stroke: 12,
        gap: 14,
        pct: 1,
        color,
        avatar: d.avatar,
        name: raw,
        badge: t ? emblemBadge(k, R, ti, 72) : emblemBadge(k, R, 0, 72, glyph(k, "shield", color, 60)),
      })
    ),
    k.box(
      { position: "absolute", left: 88, right: 88, bottom: 100, flexDirection: "column", alignItems: "center" },
      k.box({ alignItems: "center", height: 44 }, k.box({ fontSize: 30, fontWeight: 900, letterSpacing: 9, color: ACCENT, marginRight: -9 }, "NEW ROLE")),
      k.box(
        { alignItems: "center", justifyContent: "center", maxWidth: "100%", height: 106, marginTop: 6, paddingRight: DOT + GAP },
        k.box({ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: color, marginRight: GAP, flexShrink: 0 }),
        k.line(role, { fontSize: nameSize, fontWeight: 900, letterSpacing: -2, color: "#ffffff", minWidth: 0, flexShrink: 1 })
      )
    ),
    // 📌 Lv 줄 — 레벨업 막대보다 글자가 높아 아래 스킨 장식(크림슨 산 · 새로운 세계 구름)에 닿지 않게 bottom 58
    level > 0
      ? k.box(
          { position: "absolute", left: 88, right: 88, bottom: 58, height: 40, alignItems: "center" },
          k.box({ flexGrow: 1, height: 2, backgroundColor: W(0.1) }),
          k.box({ marginLeft: 28, fontSize: 30, fontWeight: 900, color: W(0.8), whiteSpace: "nowrap" }, `Lv.${num(level)}`),
          k.box({ marginLeft: 12, marginRight: 28, fontSize: 30, fontWeight: 700, color: W(0.45), whiteSpace: "nowrap" }, "달성 보상"),
          k.box({ flexGrow: 1, height: 2, backgroundColor: W(0.1) })
        )
      : null
  );
}

// 프로필(/레벨) — 내 정보의 잉크 헤더 게임 프로필. 사진 링 + 엠블럼 · 이름 · 등급, 오른쪽 큰 LEVEL,
//   아래 칸: 서버 순위(있을 때만 — #n 옆에 '상위 n%') · 누적 XP · 다음 레벨까지, 맨 아래 막대(Lv.n → Lv.n+1)
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
    // 상위 % — 레벨 페이지 프로필과 같은 식(올림, 최소 1%)
    hasRank ? { l: "서버 순위", v: `#${num(d.rank)}`, sub: int(d.total) > 0 ? `상위 ${Math.max(1, Math.ceil((int(d.rank) / int(d.total)) * 100))}%` : "" } : null,
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

// /랭크 — 서버 순위표. 머리(SEASON n · 이름 / 순위 / 전체 인원) → 1~10위 줄(순위 · 사진 · 이름 · 등급 문장 + Lv · 누적 XP)
//   → 구분선 → 맨 아래 '나' 줄(10위 안이면 위 목록의 내 줄도 옅게 칠한다). 1~3위 순위 숫자는 RANKER 메달 색
function rankBoardCard(k, kind, d, text) {
  const top = Array.isArray(d.top) ? d.top.slice(0, 10) : [];
  const me = d.me && int(d.me.rank) > 0 ? d.me : null;
  const season = int(d.season);
  const seasonName = text(d.seasonName);
  const INNER = 1200 - 144;
  const ROW = 56;
  const NUM_W = 76;
  const AV = 40;
  const LV_W = 168;
  const XP_W = 250;
  const nameW = INNER - NUM_W - AV - 20 - LV_W - XP_W - 16;
  const row = (p, i, mine, big) => {
    const rank = int(p.rank) || i + 1;
    const raw = text(p.name);
    const label = raw || "이름 없음";
    const level = Math.max(1, int(p.level));
    const ti = cardTierIndex(level);
    const medal = rank <= 3 ? MEDAL[rank - 1] : null;
    const h = big ? 72 : ROW;
    // '나' 줄은 앞에 알약(약 90px)이 붙어 그만큼 좁다 — 이름 칸에서 뺀다
    const rowW = big ? INNER - 90 : INNER + 32;
    const nW = big ? nameW - 90 - 32 + 16 : nameW;
    return k.box(
      {
        width: rowW,
        height: h,
        alignItems: "center",
        paddingLeft: big ? 0 : 16,
        paddingRight: big ? 0 : 16,
        marginLeft: big ? 0 : -16,
        borderRadius: 14,
        backgroundColor: mine && !big ? W(0.06) : "transparent",
      },
      k.box(
        { width: NUM_W, fontSize: big ? 34 : 30, fontWeight: 900, color: medal || (mine ? "#ffffff" : W(0.5)), letterSpacing: -1 },
        big ? `#${num(rank)}` : String(rank)
      ),
      avatarEl(k, p.avatar, big ? 48 : AV, raw),
      k.line(label, { width: nW, marginLeft: 20, fontSize: fitSize(label, nW, big ? 34 : 30, 0, 24), fontWeight: mine ? 900 : 700, color: mine ? "#ffffff" : W(0.85) }),
      k.box(
        { width: LV_W, alignItems: "center", justifyContent: "flex-end" },
        k.img(svgUri(emblemSvg(ti, 30)), 30, 30),
        k.box({ marginLeft: 10, fontSize: 26, fontWeight: 700, color: W(0.6), whiteSpace: "nowrap" }, `Lv.${num(level)}`)
      ),
      k.box(
        { width: XP_W, justifyContent: "flex-end", alignItems: "flex-end", whiteSpace: "nowrap" },
        k.box({ fontSize: big ? 32 : 28, fontWeight: 900, letterSpacing: -0.5, color: mine ? "#ffffff" : W(0.9) }, num(p.xp)),
        k.box({ fontSize: 22, fontWeight: 700, color: W(0.45), marginLeft: 8, marginBottom: 2 }, "XP")
      )
    );
  };
  return frame(
    k,
    kind,
    MEDAL[0],
    k.box(
      { position: "absolute", left: 72, right: 72, top: 56, alignItems: "flex-end", justifyContent: "space-between" },
      k.box(
        { flexDirection: "column", minWidth: 0, flexShrink: 1 },
        season
          ? k.box(
              { alignItems: "center", fontSize: 26, fontWeight: 900, color: W(0.5), whiteSpace: "nowrap" },
              k.box({ letterSpacing: 6, flexShrink: 0 }, `SEASON ${season}`),
              seasonName ? k.line(`· ${seasonName}`, { marginLeft: 8, letterSpacing: 1, minWidth: 0, flexShrink: 1 }) : null
            )
          : null,
        k.box({ marginTop: 6, fontSize: 64, fontWeight: 900, letterSpacing: -1, lineHeight: 1.05 }, "서버 순위")
      ),
      int(d.total) > 0
        ? k.box({ fontSize: 30, fontWeight: 700, color: W(0.5), marginBottom: 8, whiteSpace: "nowrap", flexShrink: 0 }, `${num(d.total)}명`)
        : null
    ),
    k.box(
      { position: "absolute", left: 72, right: 72, top: 190, flexDirection: "column" },
      top.length
        ? top.map((p, i) => row(p, i, !!me && int(p.rank || i + 1) === int(me.rank), false))
        : k.box({ height: ROW, alignItems: "center", fontSize: 30, fontWeight: 700, color: W(0.4) }, "아직 순위가 없습니다")
    ),
    me
      ? k.box(
          { position: "absolute", left: 72, right: 72, bottom: 44, flexDirection: "column", borderTop: `2px solid ${W(0.1)}`, paddingTop: 18 },
          k.box(
            { alignItems: "center" },
            k.box(
              { height: 36, paddingLeft: 16, paddingRight: 16, marginRight: 18, borderRadius: 18, backgroundColor: ACCENT, alignItems: "center", fontSize: 22, fontWeight: 900, color: "#ffffff", flexShrink: 0 },
              "나"
            ),
            row(me, 0, true, true)
          )
        )
      : null
  );
}

// ── 아이템 · 보상 아이콘 (/인벤토리 · /시즌패스) ──
// 📌 선 아이콘(24×24 · 선 1.7) — app/components/ItemIcon.tsx 의 SHAPES(프리셋 "svg:<키>") 사본 + 카드 전용 몇 개(shieldCheck · crownFill · clock).
//    ItemIcon.tsx(· Icons.tsx ICON_PATHS)의 프리셋 그림을 고치거나 늘리면 여기도 같이 고칠 것 — 여기 없는 키는 유형 기본 모양으로 그린다.
//    fill: 채움형 · f: 연하게(28%) 채우는 면 · dash: 마지막 선 점선
const GLYPHS = {
  bolt: { d: ["M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"] },
  shield: { fill: true, d: ["M12 2.6 20 5.4V12c0 4.6-3.4 7.6-8 9.2C7.4 19.6 4 16.6 4 12V5.4Z"] },
  key: { d: ["M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"] },
  cube: { d: ["M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6Z", "M4 7.6 12 12l8-4.4M12 12v8.8"], f: ["M4 7.6 12 3.2 20 7.6 12 12Z"] },
  box: { d: ["M4 10.5V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v2.5", "M3.5 10.5h17v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z", "M10.5 10.5V14h3v-3.5"], f: ["M4 10.5V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v2.5Z"] },
  medal: { d: ["M12 9a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z", "M8.5 9 6.5 3h11l-2 6"] },
  star: { d: ["M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"] },
  crown: { d: ["M4.5 18.5h15", "M4.5 18.5 3.2 7.5l4.9 3.6L12 5l3.9 6.1 4.9-3.6-1.3 11Z"] },
  gem: { d: ["M7 4h10l4 5.2L12 20 3 9.2Z", "M3 9.2h18", "M9.5 9.2 12 20l2.5-10.8"] },
  flame: { d: ["M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z"] },
  bell: { d: ["M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"] },
  ribbon: { d: ["M7 3h10v11l-5-3-5 3Z", "M9 16.5 7 21l5-2.6L17 21l-2-4.5"] },
  ticket: { d: ["M3.5 9V7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5V9a3 3 0 0 0 0 6v1.5A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5V15a3 3 0 0 0 0-6Z", "M14.5 6.5v11"], dash: "2 2" },
  gift: { d: ["M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"] },
  music: { d: ["M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"] },
  mic: { d: ["M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"] },
  heart: { d: ["M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"] },
  snow: { d: ["M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9", "M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"] },
  unlock: { d: ["M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"] },
  lock: { d: ["M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"] },
  badge: { d: ["M12 3.8A3.9 3.9 0 0 1 17.8 6.2A3.9 3.9 0 0 1 20.2 12A3.9 3.9 0 0 1 17.8 17.8A3.9 3.9 0 0 1 12 20.2A3.9 3.9 0 0 1 6.2 17.8A3.9 3.9 0 0 1 3.8 12A3.9 3.9 0 0 1 6.2 6.2A3.9 3.9 0 0 1 12 3.8Z", "M8.8 12.2l2.2 2.2 4.4-4.6"] },
  door: { d: ["M6 21V4h10v17", "M3 21h18", "M13 12v.8"] },
  eye: { d: ["M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z"] },
  chat: { d: ["M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"] },
  image: { d: ["M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"] },
  link: { d: ["M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"] },
  pin: { d: ["M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"] },
  video: { d: ["M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"] },
  speaker: { d: ["M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"] },
  headset: { d: ["M4.5 14v-2a7.5 7.5 0 0 1 15 0v2", "M4.5 14H7v5H4.5ZM17 14h2.5v5H17Z", "M19.5 19a3 3 0 0 1-3 2.5H14"] },
  gear: { d: ["M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z", "M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"] },
  flag: { d: ["M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"] },
  sparkles: { d: ["M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"] },
  clock: { d: ["M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"] },
  hand: { d: ["M7 11.5V6.5a1.5 1.5 0 0 1 3 0V11", "M10 11V4.5a1.5 1.5 0 0 1 3 0V11", "M13 11V5.5a1.5 1.5 0 0 1 3 0v6", "M16 11.5V8a1.5 1.5 0 0 1 3 0v6.5a6.5 6.5 0 0 1-6.5 6.5H11a6 6 0 0 1-4.9-2.5L3.8 15a1.6 1.6 0 0 1 2.5-2L7 14"] },
  // ── 카드 전용 ──
  shieldCheck: { d: ["M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"] },
  crownFill: { fill: true, d: ["M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"] }, // 시즌 패스 프리미엄 왕관(사이트 패스 창 CROWN)
};
function glyphSvg(name, color, size, sw = 1.7) {
  const g = GLYPHS[name] || GLYPHS.cube;
  if (g.fill) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">${g.d.map((p) => `<path d="${p}" fill="${color}"/>`).join("")}</svg>`;
  const faces = (g.f || []).map((p) => `<path d="${p}" fill="${color}" fill-opacity="0.28" stroke="none"/>`).join("");
  const lines = g.d.map((p, i) => `<path d="${p}"${g.dash && i === g.d.length - 1 ? ` stroke-dasharray="${g.dash}"` : ""}/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${faces}${lines}</svg>`;
}
const glyph = (k, name, color, size, style) => k.img(svgUri(glyphSvg(name, color, size)), size, size, { flexShrink: 0, ...style });

// 유형 기본 모양 · 색 — app/components/ItemIcon.tsx TYPE_DEFAULT · lib/items.js ITEM_TYPE_COLOR 와 같다
const TYPE_GLYPH = { role: "shield", perk: "key", item: "cube", cosmetic: "sparkles", physical: "box", level: "medal" };
const TYPE_COLOR = { role: "#e91e3f", perk: "#2f6fb0", item: "#3f9e93", cosmetic: "#8557b0", physical: "#131313" };
// 아이템 색 — 등록한 색 > 유형 기본색. 잉크 바탕이라 너무 어두우면(기프트카드 #131313 등) 밝은 회색 (app/components/Inventory.js invAccentOf 와 같은 기준)
function itemAccent(it) {
  const c = /^#[0-9a-f]{6}$/i.test(String(it?.color || "")) ? it.color : TYPE_COLOR[it?.type] || TYPE_COLOR.item;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  const lum = (parseInt(m[1], 16) * 0.299 + parseInt(m[2], 16) * 0.587 + parseInt(m[3], 16) * 0.114) / 255;
  return lum < 0.18 ? "#d4d4d4" : c;
}

// 📌 아이템 아이콘 — 이미지(png · jpeg data URI) > 도트 그림("art:<키>" — art(키) → SVG 문자열, buildCard 의 opts.art) > 선 프리셋("svg:<키>")
//    > 짧은 글자 > 유형 기본 모양. app/components/ItemIcon.tsx 와 같은 순서. 이모지만인 아이콘 · 목록에 없는 키는 유형 기본 모양.
//    도트 그림은 16칸 그림이라 size 를 16 의 배수로 줘야 칸이 번지지 않는다. dim: 35%(지급 대기)
function itemIconEl(k, it, size, text, art, dim = false) {
  const style = { flexShrink: 0, ...(dim ? { opacity: 0.35 } : null) };
  const icon = String(it?.icon || "");
  if (typeof it?.image === "string" && /^data:image\/(png|jpeg);base64,/i.test(it.image)) {
    return k.img(it.image, size, size, { ...style, borderRadius: Math.max(6, Math.round(size * 0.28)), objectFit: "cover" });
  }
  const ak = icon.startsWith("art:") ? icon.slice(4) : "";
  const svg = ak && typeof art === "function" ? art(ak) : "";
  if (svg) return k.img(svgUri(svg), size, size, style);
  const color = itemAccent(it);
  const pk = icon.startsWith("svg:") ? icon.slice(4) : "";
  if (pk && GLYPHS[pk]) return glyph(k, pk, color, size, style);
  const t = icon && !/^(art|svg):/.test(icon) ? text(icon) : "";
  if (t) {
    return k.box(
      { ...style, width: size, height: size, alignItems: "center", justifyContent: "center", overflow: "hidden", whiteSpace: "nowrap", fontSize: fitSize(t, size, Math.round(size * 0.6)), fontWeight: 900, color },
      t
    );
  }
  return glyph(k, TYPE_GLYPH[it?.type] || "cube", color, size, style);
}

// 남은 시간 → "3일 5시간" · "5시간" · "12분"
const leftText = (ms) => {
  const m = Math.max(1, Math.floor((Number(ms) || 0) / 60000));
  if (m >= 1440) {
    const dd = Math.floor(m / 1440);
    const hh = Math.floor((m % 1440) / 60);
    return hh ? `${dd}일 ${hh}시간` : `${dd}일`;
  }
  return m >= 60 ? `${Math.floor(m / 60)}시간` : `${m}분`;
};
// 큰 수 줄여 쓰기 — 1만 이상 "12.3만" · 100만 이상 "1234만" · 1억 이상 "1.2억"(내림 — 진행이 다 찬 것처럼 보이지 않게). 좁은 칸에서만
const shortNum = (v) => {
  const n = int(v);
  if (Math.abs(n) >= 1e8) return `${Math.floor(n / 1e7) / 10}억`;
  if (Math.abs(n) >= 1e6) return `${Math.floor(n / 1e4)}만`;
  if (Math.abs(n) >= 1e4) return `${Math.floor(n / 1e3) / 10}만`;
  return num(n);
};

// 칸 바탕 — 거의 불투명한 잉크 판 위에 옅은 결. 스킨 장식 · 격자가 칸 안으로 비쳐 글자를 흐리지 않게
const PANEL = "rgba(25,25,25,0.9)";
const panelBg = (a, b = a) => ({ backgroundColor: PANEL, backgroundImage: `linear-gradient(160deg, ${a} 0%, ${b} 100%)` });

// 새 카드 머리(/퀘스트 · /인벤토리 · /시즌패스) — 위 작은 줄(caption) + 큰 제목, 오른쪽 right(아래 맞춤). /랭크 머리와 같은 크기
function cardHead(k, caption, title, right) {
  return k.box(
    { position: "absolute", left: 72, right: 72, top: 56, alignItems: "flex-end", justifyContent: "space-between" },
    k.box(
      { flexDirection: "column", minWidth: 0, flexShrink: 1 },
      caption,
      k.box({ marginTop: caption ? 6 : 0, fontSize: 64, fontWeight: 900, letterSpacing: -1, lineHeight: 1.05, whiteSpace: "nowrap" }, title)
    ),
    right
  );
}
const nameCaption = (k, name) => (name ? k.line(name, { maxWidth: 620, fontSize: 28, fontWeight: 700, color: W(0.5) }) : null);
// 오른쪽 큰 숫자 + 단위 (머리 오른쪽)
const headStat = (k, value, unit, color = "#ffffff") =>
  k.box(
    { alignItems: "flex-end", flexShrink: 0, marginLeft: 32, marginBottom: 2 },
    k.box({ fontSize: 64, fontWeight: 900, letterSpacing: -1, lineHeight: 1, color }, value),
    k.box({ fontSize: 30, fontWeight: 700, color: W(0.5), marginLeft: 4, marginBottom: 4 }, unit)
  );

// /퀘스트 — 머리(이름 · 퀘스트 · 받을 보상 n개) → 일일 · 주간 · 월간 세 칸. 칸 머리에 받을 수 있는 수(빨간 알) · 초기화까지 남은 시간,
//   그 아래 줄 목록(상자 없이 가는 선으로 나눔). 한 줄 = 왼쪽(이름 · 얇은 막대 · 진행/목표) · 오른쪽(보상 — 둘이면 XP 위 · 빙옥 아래, 하나면 가운데).
//   받을 수 있으면 이름 앞 빨간 점 · 보상 색, 끝났으면 초록 체크, 받은 줄은 흐리게. 칸마다 QUEST_SHOW 줄까지 — 넘으면 마지막 줄 "외 n개", 비었으면 "—".
//   상태 색은 사이트 퀘스트 목록(app/level)과 같은 말 — 받을 수 있으면 강조색, 끝났으면 초록. 카드 높이는 가장 긴 칸에 맞춘다(cardSizeOf)
export const QUEST_SHOW = 4;
const QUEST_TOP = 194; // 세 칸이 시작하는 높이
const QUEST_HEAD = 62; // 칸 머리 + 아래 여백
const QUEST_LINE = 2; // 목록 위 · 줄 사이 선
const QUEST_ROW = 96; // 퀘스트 한 줄(아래 선 포함)
const QUEST_SUB = 64; // "외 n개" · "—" 줄
const QUEST_BOTTOM = 56;
const QUEST_W = 336; // (1056 - 24 × 2) / 3
const GREEN = "#3ecf8e";
const XP_C = "#ff7d93"; // 보상 XP — 강조색을 잉크 위에서 읽히게 밝힌 것
const POINT_C = "#5ce0b2"; // 보상 빙옥 — 사이트 퀘스트 목록의 청록을 잉크 위에서 읽히게 밝힌 것
const PERIOD_LABEL = { daily: "일일", weekly: "주간", monthly: "월간" };
// 칸 하나의 목록 높이 — 비었으면 "—" 한 줄, QUEST_SHOW 를 넘으면 (QUEST_SHOW - 1)줄 + "외 n개"
const questListH = (n) => {
  const len = int(n);
  if (len <= 0) return QUEST_SUB;
  return len > QUEST_SHOW ? (QUEST_SHOW - 1) * QUEST_ROW + QUEST_SUB : len * QUEST_ROW;
};
// 가장 긴 칸의 목록 높이(위 선 포함)
const questListMax = (periods) => QUEST_LINE + Math.max(QUEST_SUB, ...periods.map((p) => questListH(Array.isArray(p?.quests) ? p.quests.length : 0)));
function questHeight(d) {
  const periods = Array.isArray(d?.periods) ? d.periods.slice(0, 3) : [];
  return QUEST_TOP + QUEST_HEAD + questListMax(periods) + QUEST_BOTTOM;
}

// 📌 줄 폭 — 칸 폭 336 = 왼쪽(막대 + PROG_GAP + 진행 PW) + RW_GAP + 보상 RW. 한 칸 안에서 RW · PW 를 같게 둬 막대 길이 · 글자 끝을 맞춘다.
//    보상은 shortNum("+1,500" · "+1.5만" · "+99.9만"), RW 는 그 칸에서 가장 긴 보상 폭(RW_MAX 까지 — 넘는 보상은 글자를 줄인다).
//    진행은 다 쓴 글("8,423/12,000분")이 남는 폭(막대 BAR_MIN 을 뺀 것)을 넘으면 줄여 쓰고("8,423/1.2만분"), 그래도 넘으면 글자를 줄인다(PROG_MIN 까지)
const RW_MAX = 140;
const RW_GAP = 14;
const RW_UNIT = 20; // 보상 단위(XP · 빙옥) 글자 크기
const rwSize = (n) => (n > 1 ? 24 : 26); // 보상 숫자 글자 크기 — 둘이면 조금 작게
const BAR_MIN = 56;
const PROG_GAP = 10;
const PROG_SIZE = 22;
const PROG_MIN = 16;
// 폭 어림 — emWidth 는 Black 실측보다 숫자가 2~3% 좁아 보상은 4% 넉넉히, "/" 는 기본값(0.9em)이 실측(0.4em)의 두 배라 따로 센다
const rwNumW = (t, size) => emWidth(t) * size * 1.04;
const rwW = (r, size) => rwNumW(r.t, size) + 4 + emWidth(r.u) * RW_UNIT;
const progW = (s, size = PROG_SIZE) => {
  const str = String(s);
  return (emWidth(str.replace(/\//g, "")) + 0.42 * (str.split("/").length - 1)) * size;
};
// 진행/목표 — 회 · 분은 단위까지, XP 는 1만 이상을 줄여 쓰고 단위는 뺀다. 회 · 분도 max 를 넘으면 1만 이상을 줄여 쓴다
function questProg(q, max = Infinity) {
  const target = Math.max(1, int(q.target));
  const cur = Math.min(target, Math.max(0, int(q.current)));
  if (q.metric === "xp") return `${shortNum(cur)}/${shortNum(target)}`;
  // unit — 퀘스트 계산이 정한 단위(사이트 lib/questKinds.js questUnit · 봇 views/quests.js 사본). 없으면 세는 방식으로
  const unit = q.unit && q.unit !== "XP" ? String(q.unit) : q.metric === "minute" ? "분" : "회";
  const full = `${num(cur)}/${num(target)}${unit}`;
  return progW(full) <= max ? full : `${shortNum(cur)}/${shortNum(target)}${unit}`;
}
// 보상 — 재화는 글자만. 0 이면 뺀다
const questRewards = (q) =>
  [
    int(q.rewardXp) > 0 ? { t: `+${shortNum(q.rewardXp)}`, u: "XP", c: XP_C } : null,
    int(q.rewardPoint) > 0 ? { t: `+${shortNum(q.rewardPoint)}`, u: "빙옥", c: POINT_C } : null,
  ].filter(Boolean);
// 한 칸의 폭 — rw: 보상 칸 · pw: 진행 글자 칸 · progs: 줄마다 진행 글
function questLayout(list) {
  const need = Math.max(
    Math.ceil(emWidth("—") * 26),
    ...list.map((q) => {
      const rs = questRewards(q);
      return Math.max(0, ...rs.map((r) => rwW(r, rwSize(rs.length))));
    })
  );
  const rw = Math.min(RW_MAX, Math.ceil(need));
  const progMax = QUEST_W - RW_GAP - rw - PROG_GAP - BAR_MIN;
  const progs = list.map((q) => questProg(q, progMax));
  const pw = Math.min(progMax, Math.ceil(Math.max(0, ...progs.map((s) => progW(s)))));
  return { rw, pw, progs };
}
function questRow(k, q, text, L, prog, last) {
  const target = Math.max(1, int(q.target));
  const cur = Math.min(target, Math.max(0, int(q.current)));
  const dim = !!q.claimed;
  const fin = !!(q.done || q.claimed);
  const rs = questRewards(q);
  const size = rwSize(rs.length);
  const unitW = (r) => emWidth(r.u) * RW_UNIT;
  // 칸보다 긴 보상 · 진행은 글자를 줄인다
  const rSize = (r) => (rwW(r, size) <= L.rw ? size : Math.max(16, Math.floor((L.rw - 4 - unitW(r)) / Math.max(rwNumW(r.t, 1), 0.1))));
  const pSize = progW(prog) <= L.pw ? PROG_SIZE : Math.max(PROG_MIN, Math.floor(L.pw / Math.max(progW(prog, 1), 0.1)));
  return k.box(
    { width: QUEST_W, height: QUEST_ROW, flexShrink: 0, alignItems: "center", borderBottom: last ? "none" : `${QUEST_LINE}px solid ${W(0.07)}` },
    // 왼쪽 — 이름(받을 수 있으면 빨간 점 · 끝났으면 초록 체크) · 막대 · 진행/목표
    k.box(
      { flexDirection: "column", width: QUEST_W - RW_GAP - L.rw, flexShrink: 0 },
      k.box(
        { alignItems: "center", height: 40 },
        q.claimable
          ? k.box({ width: 12, height: 12, borderRadius: 6, backgroundColor: ACCENT, marginRight: 10, flexShrink: 0 })
          : fin
            ? k.img(svgUri(checkSvg(dim ? rgba(GREEN, 0.6) : GREEN, 3.4)), 26, 26, { marginRight: 8, flexShrink: 0 })
            : null,
        k.line(text(q.name) || "퀘스트", { flexGrow: 1, flexShrink: 1, minWidth: 0, fontSize: 28, fontWeight: 900, color: dim ? W(0.4) : "#ffffff" })
      ),
      k.box(
        { alignItems: "center", height: 30 },
        k.box({ flexGrow: 1, flexShrink: 1, minWidth: 0 }, bar(k, cur / target, 6, fin ? (dim ? rgba(GREEN, 0.45) : GREEN) : ACCENT)),
        k.box({ width: L.pw, marginLeft: PROG_GAP, flexShrink: 0, justifyContent: "flex-end", fontSize: pSize, fontWeight: 700, color: W(dim ? 0.3 : 0.5), whiteSpace: "nowrap" }, prog)
      )
    ),
    // 오른쪽 — 보상. 받을 수 있는 줄만 보상 색
    k.box(
      { width: L.rw, marginLeft: RW_GAP, flexShrink: 0, flexDirection: "column", alignItems: "flex-end", justifyContent: "center" },
      rs.length
        ? rs.map((r) =>
            k.box(
              { alignItems: "flex-end", height: rs.length > 1 ? 32 : 36, whiteSpace: "nowrap" },
              k.box({ fontSize: rSize(r), fontWeight: 900, color: dim ? W(0.35) : q.claimable ? r.c : W(0.75) }, r.t),
              k.box({ fontSize: RW_UNIT, fontWeight: 700, color: W(dim ? 0.3 : 0.45), marginLeft: 4 }, r.u)
            )
          )
        : k.box({ fontSize: 26, fontWeight: 700, color: W(0.3) }, "—")
    )
  );
}
// 잉크 막 — 목록 자리(가로 72 ~ cw - 72, 세로 top ~ top + h)보다 VEIL_M 넓은 둥근 판을 흐려 가장자리를 번지게.
//   SVG 그림으로 그린다 — satori boxShadow 는 판 둘레에 밝은 실금이 남는다
const VEIL_M = 16;
const VEIL_B = 8; // 흐림 표준편차 — 판 밖 3배까지 번진다
function questVeil(k, cw, top, h) {
  const e = VEIL_B * 3;
  const w = cw - 72 * 2 + VEIL_M * 2;
  const vh = h + VEIL_M * 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w + e * 2}" height="${vh + e * 2}" viewBox="0 0 ${w + e * 2} ${vh + e * 2}">` +
    `<defs><filter id="v" x="0" y="0" width="${w + e * 2}" height="${vh + e * 2}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${VEIL_B}"/></filter></defs>` +
    `<rect x="${e}" y="${e}" width="${w}" height="${vh}" rx="24" fill="${INK}" fill-opacity="0.9" filter="url(#v)"/></svg>`;
  return k.img(svgUri(svg), w + e * 2, vh + e * 2, { position: "absolute", left: 72 - VEIL_M - e, top: top - VEIL_M - e });
}
function questCard(k, kind, d, text) {
  const periods = (Array.isArray(d.periods) ? d.periods : []).slice(0, 3);
  const claimable = Math.max(0, int(d.claimable));
  const sub = (child) => k.box({ height: QUEST_SUB, flexShrink: 0, alignItems: "center", fontSize: 26, fontWeight: 700, color: W(0.4) }, child);
  const column = (p, i) => {
    const list = Array.isArray(p?.quests) ? p.quests : [];
    const over = list.length > QUEST_SHOW;
    const shown = list.slice(0, over ? QUEST_SHOW - 1 : QUEST_SHOW);
    const n = list.filter((q) => q?.claimable).length;
    const L = questLayout(shown);
    return k.box(
      { width: QUEST_W, flexDirection: "column", marginLeft: i ? 24 : 0 },
      // 칸 머리 — 이름 · (받을 수 있는 수) · 초기화까지
      k.box(
        { alignItems: "center", height: 44, marginBottom: QUEST_HEAD - 44 },
        k.box({ fontSize: 32, fontWeight: 900, color: "#ffffff" }, PERIOD_LABEL[p?.key] || "퀘스트"),
        n > 0
          ? k.box({ marginLeft: 10, minWidth: 36, height: 36, paddingLeft: 10, paddingRight: 10, borderRadius: 18, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900, color: "#ffffff" }, String(n))
          : null,
        Number(p?.left) > 0
          ? k.box(
              { marginLeft: "auto", alignItems: "center", fontSize: 26, fontWeight: 700, color: W(0.5), whiteSpace: "nowrap" },
              glyph(k, "clock", W(0.45), 26, { marginRight: 6 }),
              leftText(p.left)
            )
          : null
      ),
      // 줄 목록
      k.box(
        { flexDirection: "column", borderTop: `${QUEST_LINE}px solid ${W(0.1)}` },
        list.length
          ? [
              shown.map((q, j) => questRow(k, q, text, L, L.progs[j], j === shown.length - 1 && !over)),
              over ? sub(`외 ${num(list.length - shown.length)}개`) : null,
            ]
          : sub("—")
      )
    );
  };
  return frame(
    k,
    kind,
    ACCENT,
    cardHead(
      k,
      nameCaption(k, text(d.name)),
      "퀘스트",
      k.box(
        { flexDirection: "column", alignItems: "flex-end", flexShrink: 0, marginLeft: 32 },
        k.box({ fontSize: 26, fontWeight: 700, color: W(0.45), whiteSpace: "nowrap" }, "받을 보상"),
        headStat(k, num(claimable), "개", claimable > 0 ? "#ffffff" : W(0.4))
      )
    ),
    // 📌 스킨 카드 — 줄에는 칸 바탕이 없어 스킨 장식(항해도 배 · 항로 · 해안 등)이 글자 뒤로 비친다. 목록 자리에만 잉크 막(가장자리는 흐리게)
    k.skin ? questVeil(k, k.size.width, QUEST_TOP + QUEST_HEAD, questListMax(periods)) : null,
    k.box({ position: "absolute", left: 72, right: 72, top: QUEST_TOP, alignItems: "flex-start" }, periods.map(column))
  );
}

// /인벤토리 — 머리(이름 · 인벤토리 · 보유 n개) → 가방 BAG_COLS × 2줄. 사이트 가방 칸(app/components/Inventory.js InvSlot)과 같은 말:
//   칸 바탕은 아이템 색 결, 아이콘 · 이름, 그 아래 상태 줄(착용 · ×N · 지급 대기 · D-n — 3일 이하 빨강). 착용 중(카드 스킨 · 단 배지)이면 칸 테두리 강조색.
//   남는 칸은 빈 칸, 보유가 칸보다 많으면 마지막 칸에 "+n". 칸에 들어갈 아이템 고르기 · 순서는 부르는 쪽(봇 views/inventory.js)이 정한다
export const BAG_SLOTS = 12;
const BAG_COLS = 6;
const BAG_W = 160;
const BAG_H = 212; // 아이콘 80 + 이름 두 줄 + 상태 한 줄
const BAG_GAP = 19; // (1056 - 160 × 6) / 5
function bagCard(k, kind, d, text, art) {
  const items = Array.isArray(d.items) ? d.items : [];
  const total = Math.max(items.length, int(d.total));
  const over = total > BAG_SLOTS;
  const shown = items.slice(0, over ? BAG_SLOTS - 1 : BAG_SLOTS);
  const cell = (style, ...children) => k.box({ width: BAG_W, height: BAG_H, borderRadius: 22, flexShrink: 0, ...style }, ...children);
  const slot = (it) => {
    const accent = itemAccent(it);
    const dead = !!it.pending;
    const days = it.days == null || it.days === "" ? null : Math.max(0, int(it.days));
    let status = [
      it.worn ? { k: "worn", t: "착용", c: "#ff7d93" } : null,
      int(it.count) > 1 ? { k: "count", t: `×${num(it.count)}`, c: W(0.6) } : null,
      dead ? { k: "pending", t: "지급 대기", c: W(0.45) } : null,
      days != null ? { k: "days", t: `D-${days}`, c: days <= 3 ? "#ff5c77" : W(0.6) } : null,
    ].filter(Boolean);
    // 한 줄(칸 안쪽 140)을 넘으면 차례로 줄인다 — '착용' 빼기(착용 칸은 테두리가 이미 강조색) → '지급 대기'를 '대기'로 → ×N 빼기 → 뒤에서부터 빼기.
    //   글자가 칸 끝에서 반쯤 잘려 보이지 않게
    const statusW = (list) => list.reduce((a, x, j) => a + emWidth(x.t) * 26 * 0.95 + (j ? 8 : 0), 0);
    const wide = () => statusW(status) > BAG_W - 20;
    if (wide() && it.worn) status = status.filter((x) => x.k !== "worn");
    if (wide() && dead) status = status.map((x) => (x.k === "pending" ? { ...x, t: "대기" } : x));
    if (wide()) status = status.filter((x) => x.k !== "count");
    while (status.length > 1 && wide()) status = status.slice(0, -1);
    return cell(
      {
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 22, // 아이콘이 모든 칸에서 같은 높이에 오게 위에서부터 쌓는다
        paddingLeft: 10,
        paddingRight: 10,
        ...(dead ? { backgroundColor: PANEL } : panelBg(rgba(accent, 0.2), rgba(accent, 0.05))),
        border: it.worn ? `3px solid ${ACCENT}` : `2px solid ${dead ? W(0.07) : rgba(accent, 0.3)}`,
      },
      itemIconEl(k, it, 80, text, art, dead),
      // 이름은 두 줄까지 — "카드 스킨 · 골드" 처럼 뒤에서 갈리는 이름이 한 줄 말줄임이면 모두 같아 보인다
      k.para(text(it.name) || "아이템", 2, { marginTop: 10, width: BAG_W - 20, textAlign: "center", justifyContent: "center", fontSize: 26, fontWeight: 900, lineHeight: 1.15, color: dead ? W(0.4) : W(0.9) }),
      status.length
        ? k.box(
            { marginTop: 2, maxWidth: BAG_W - 20, overflow: "hidden", whiteSpace: "nowrap", fontSize: 26, fontWeight: 700 },
            status.map((s, j) => k.box({ color: s.c, marginLeft: j ? 8 : 0, flexShrink: 0 }, s.t))
          )
        : null
    );
  };
  const cells = Array.from({ length: BAG_SLOTS }, (_, i) => {
    if (i < shown.length) return slot(shown[i] || {});
    if (over && i === BAG_SLOTS - 1) {
      return cell(
        { alignItems: "center", justifyContent: "center", ...panelBg(W(0.05)), border: `2px solid ${W(0.1)}`, fontSize: 44, fontWeight: 900, color: W(0.6) },
        `+${num(total - shown.length)}`
      );
    }
    return cell({ backgroundColor: "rgba(22,22,22,0.75)", border: `2px solid ${W(0.05)}` });
  });
  const rows = [cells.slice(0, BAG_COLS), cells.slice(BAG_COLS, BAG_COLS * 2)];
  return frame(
    k,
    kind,
    ACCENT,
    cardHead(k, nameCaption(k, text(d.name)), "인벤토리", headStat(k, num(total), "개")),
    k.box(
      { position: "absolute", left: 72, right: 72, top: 190, flexDirection: "column" },
      rows.map((r, i) => k.box({ marginTop: i ? 20 : 0 }, r.map((c, j) => k.box({ marginLeft: j ? BAG_GAP : 0 }, c))))
    )
  );
}

// /시즌패스 — 머리(SEASON n · 이름 · 시즌 패스 · 프리미엄 알약) → 티어(지금 / 전체) · 다음 티어까지 · 받을 보상(무료 · 프리미엄)
//   → 막대(지금 티어 → 다음 티어 — 이번 시즌에 번 XP 기준) → 다음 보상(다음 티어 하나의 무료 → 프리미엄 전부 — XP · 빙옥은 글자만, 역할 · 아이템은 아이콘 + 이름).
//   📌 다음 보상 머리에 티어를 한 번만 적고("다음 보상 · T8"), 칸은 한 줄 PASS_SHOW 칸 — 넘으면 무료 줄 · 프리미엄 줄 두 줄(사이트 티어 표의 트랙 결)로
//      카드가 길어진다(cardSizeOf). 색은 사이트 시즌 패스 창의 보라 → 분홍 결. 칸 머리는 사이트 티어 표와 같은 말(무료 · 왕관 프리미엄), 해금 전이면 자물쇠 + 흐리게
export const PASS_SHOW = 4; // 한 줄 칸 수 — 한 트랙 최대 보상 수(lib/seasonPass.js MAX_REWARDS)와 같다
export const PASS_MAX = PASS_SHOW * 2; // 다음 보상 칸 최대 — 한 티어의 무료 4 + 프리미엄 4 (bot/src/views/pass.js PASS_CARD_MAX 와 같다)
const PASS_TILE_H = 132;
const PASS_GAP = 16;
const PASS_H1 = 675; // 다음 보상이 한 줄일 때 카드 높이
// 📌 다음 보상 줄 — 다 합쳐 PASS_SHOW 칸 이하면 한 줄(무료 → 프리미엄), 넘으면 무료 줄 · 프리미엄 줄(트랙마다 최대 PASS_SHOW).
//    다 넘었거나(MAX) 티어가 없으면 비운다. 카드 크기(passHeight)와 그림(passCard)이 같은 줄을 본다
const passRows = (d) => {
  const maxTier = Math.max(0, int(d?.maxTier));
  if (maxTier === 0 || Math.max(0, int(d?.tier)) >= maxTier) return [];
  const list = (Array.isArray(d?.next) ? d.next : []).filter((r) => r && typeof r === "object");
  const free = list.filter((r) => !r.premium).slice(0, PASS_SHOW);
  const paid = list.filter((r) => !!r.premium).slice(0, PASS_SHOW);
  const all = [...free, ...paid];
  return !all.length ? [] : all.length <= PASS_SHOW ? [all] : [free, paid];
};
const passHeight = (d) => PASS_H1 + (passRows(d).length > 1 ? PASS_TILE_H + PASS_GAP : 0);
const PASS_A = "#9b6bff";
const PASS_B = "#e05bb5";
const PASS_GRAD = `linear-gradient(90deg, ${PASS_A} 0%, ${PASS_B} 100%)`;
function passCard(k, kind, d, text, art) {
  const maxTier = Math.max(0, int(d.maxTier));
  const tier = Math.max(0, int(d.tier));
  const maxed = maxTier > 0 && tier >= maxTier;
  const none = maxTier === 0; // 티어를 아직 안 만든 패스
  const premium = !!d.premium;
  const season = int(d.season);
  const seasonName = text(d.seasonName);
  const nextRows = passRows(d);
  const nextTier = maxed || none ? 0 : Math.max(0, int(d.nextTier)) || tier + 1;
  const INNER = 1056;
  const LEFT_W = 330;
  const cellW = Math.floor((INNER - LEFT_W) / 2);
  const tierSize = fitSize(String(tier), 200, 120, -4);
  const needV = none ? "—" : maxed ? "MAX" : num(d.need);
  const needSize = fitSize(needV, cellW - 36 - (maxed || none ? 0 : 52), 56, -1);
  const claim = [
    { l: "무료", v: Math.max(0, int(d.claimFree)) },
    { l: "프리미엄", v: Math.max(0, int(d.claimPaid)) },
  ];
  // 받을 보상 숫자 크기 — 두 자리 · 세 자리(안 받고 쌓인 티어)여도 칸(cellW - 왼쪽 여백 36) 안에 들게 줄인다
  const claimW = (fs) => claim.reduce((a, c, i) => a + (i ? 26 : 0) + emWidth(c.l) * 28 * 0.95 + 10 + emWidth(num(c.v)) * fs, 0);
  let claimSize = 56;
  while (claimSize > 36 && claimW(claimSize) > cellW - 36) claimSize -= 2;
  const TILE_W = Math.floor((INNER - PASS_GAP * (PASS_SHOW - 1)) / PASS_SHOW);
  const LABEL_W = TILE_W - 40 - 4 - 48 - 14; // 이름 칸 폭 — 칸 안쪽(좌우 여백 · 테두리 뺀 것) - 아이콘 - 사이
  const tile = (r, i) => {
    const paid = !!r.premium;
    const locked = paid && !premium;
    const label = text(r.label) || (r.kind === "role" ? "역할" : "아이템");
    // 📌 이름이 한 줄(28px)에 안 들면 두 줄(24px)로 — 잘라 숨기지 않게
    const oneLine = emWidth(label) * 28 <= LABEL_W;
    const money = r.kind === "xp" || r.kind === "point";
    const v = num(r.amount);
    return k.box(
      {
        width: TILE_W,
        height: PASS_TILE_H,
        marginLeft: i ? PASS_GAP : 0,
        flexDirection: "column",
        justifyContent: "space-between",
        paddingTop: 16,
        paddingBottom: 18,
        paddingLeft: 20,
        paddingRight: 20,
        borderRadius: 20,
        ...(paid
          ? { ...panelBg(rgba(PASS_A, 0.24), rgba(PASS_B, 0.12)), border: `2px solid ${rgba("#d6b4ff", 0.4)}` }
          : { ...panelBg(W(0.05)), border: `2px solid ${W(0.09)}` }),
      },
      // 📌 칸 머리 — 같은 티어뿐이라 T 번호 대신 트랙(무료 · 왕관 프리미엄)
      k.box(
        { alignItems: "center", height: 30 },
        paid ? glyph(k, "crownFill", "#d6b4ff", 26, { marginRight: 8 }) : null,
        k.box({ fontSize: 26, fontWeight: 900, color: paid ? rgba("#d6b4ff", 0.85) : W(0.5), whiteSpace: "nowrap" }, paid ? "프리미엄" : "무료"),
        locked ? glyph(k, "lock", W(0.5), 28, { marginLeft: "auto" }) : null
      ),
      k.box(
        { alignItems: money ? "flex-end" : "center", opacity: locked ? 0.45 : 1, height: 56 },
        money
          ? [
              k.box({ flexShrink: 0, fontSize: fitSize(v, TILE_W - 40 - Math.ceil(emWidth(r.kind === "xp" ? "XP" : "빙옥") * 26) - 8 - 14, 44, -1), fontWeight: 900, letterSpacing: -1, lineHeight: 1 }, v),
              k.box({ flexShrink: 0, fontSize: 26, fontWeight: 700, color: W(0.55), marginLeft: 8, marginBottom: 2 }, r.kind === "xp" ? "XP" : "빙옥"),
            ]
          : [
              r.kind === "role" ? glyph(k, "shieldCheck", "#ffffff", 48) : itemIconEl(k, r, 48, text, art),
              oneLine
                ? k.line(label, { marginLeft: 14, flexGrow: 1, flexShrink: 1, minWidth: 0, fontSize: 28, fontWeight: 900 })
                : k.para(label, 2, { marginLeft: 14, width: LABEL_W, flexShrink: 0, fontSize: 24, fontWeight: 900, lineHeight: 1.15, ...(/\s/.test(label) ? null : { wordBreak: "break-all" }) }),
            ]
      )
    );
  };
  return frame(
    k,
    kind,
    PASS_A,
    cardHead(
      k,
      season
        ? k.box(
            { alignItems: "center", fontSize: 26, fontWeight: 900, color: W(0.5), whiteSpace: "nowrap", maxWidth: 680 },
            k.box({ letterSpacing: 6, flexShrink: 0 }, `SEASON ${season}`),
            seasonName ? k.line(`· ${seasonName}`, { marginLeft: 8, letterSpacing: 1, minWidth: 0, flexShrink: 1 }) : null
          )
        : null,
      "시즌 패스",
      premium
        ? k.box(
            { height: 60, paddingLeft: 22, paddingRight: 26, borderRadius: 30, backgroundImage: PASS_GRAD, alignItems: "center", flexShrink: 0, marginLeft: 32, marginBottom: 4 },
            glyph(k, "crownFill", "#ffffff", 30, { marginRight: 10 }),
            k.box({ fontSize: 28, fontWeight: 900, color: "#ffffff", whiteSpace: "nowrap" }, "프리미엄")
          )
        : k.box(
            { height: 60, paddingLeft: 22, paddingRight: 26, borderRadius: 30, border: `2px solid ${W(0.2)}`, alignItems: "center", flexShrink: 0, marginLeft: 32, marginBottom: 4 },
            glyph(k, "lock", W(0.55), 30, { marginRight: 10 }),
            k.box({ fontSize: 28, fontWeight: 900, color: W(0.6), whiteSpace: "nowrap" }, "프리미엄 미해금")
          )
    ),
    // 티어 · 다음 티어까지 · 받을 보상
    k.box(
      { position: "absolute", left: 72, right: 72, top: 196, alignItems: "flex-end" },
      k.box(
        { width: LEFT_W, flexDirection: "column", flexShrink: 0 },
        k.box({ fontSize: 26, fontWeight: 900, letterSpacing: 8, color: W(0.42) }, "TIER"),
        k.box(
          { alignItems: "flex-end", marginTop: 12 },
          k.box({ fontSize: tierSize, fontWeight: 900, lineHeight: 0.84, letterSpacing: -4 }, String(tier)),
          k.box({ fontSize: 44, fontWeight: 700, color: W(0.4), marginLeft: 14, whiteSpace: "nowrap" }, `/ ${num(maxTier)}`)
        )
      ),
      k.box(
        { width: cellW, flexDirection: "column", paddingLeft: 36, borderLeft: `2px solid ${W(0.1)}` },
        k.box({ fontSize: 28, fontWeight: 700, color: W(0.45) }, "다음 티어까지"),
        k.box(
          { alignItems: "flex-end", marginTop: 12, height: 56 },
          k.box({ fontSize: needSize, fontWeight: 900, letterSpacing: -1, lineHeight: 1 }, needV),
          maxed || none ? null : k.box({ fontSize: 28, fontWeight: 700, color: W(0.5), marginLeft: 10, marginBottom: 2 }, "XP")
        )
      ),
      k.box(
        { width: cellW, flexDirection: "column", paddingLeft: 36, borderLeft: `2px solid ${W(0.1)}` },
        k.box({ fontSize: 28, fontWeight: 700, color: W(0.45) }, "받을 보상"),
        k.box(
          { alignItems: "flex-end", marginTop: 12, height: 56 },
          claim.map((c, i) =>
            k.box(
              { alignItems: "flex-end", marginLeft: i ? 26 : 0, flexShrink: 0 },
              k.box({ fontSize: 28, fontWeight: 700, color: W(0.5), marginRight: 10, marginBottom: 2 }, c.l),
              k.box({ fontSize: claimSize, fontWeight: 900, lineHeight: 1, color: c.v > 0 ? "#ffffff" : W(0.35) }, num(c.v))
            )
          )
        )
      )
    ),
    // 막대 — 지금 티어 → 다음 티어 (양쪽 글자 칸 폭 고정)
    k.box(
      { position: "absolute", left: 72, right: 72, top: 374, alignItems: "center" },
      k.box({ width: 96, fontSize: 28, fontWeight: 900, color: W(0.75) }, `T${num(tier)}`),
      k.box({ width: INNER - 192 }, bar(k, maxed ? 1 : d.progress, 16, PASS_GRAD)),
      k.box({ width: 96, justifyContent: "flex-end", fontSize: 28, fontWeight: 900, color: W(0.4) }, none ? "—" : maxed ? "MAX" : `T${num(tier + 1)}`)
    ),
    // 다음 보상 — 머리에 티어 한 번("다음 보상 · T8"), 한 줄이거나 무료 줄 · 프리미엄 줄(passRows). 없으면 "—"(다 넘었으면 MAX)
    k.box(
      { position: "absolute", left: 72, right: 72, top: 438, flexDirection: "column" },
      k.box(
        { alignItems: "center", marginBottom: 16, fontSize: 28, whiteSpace: "nowrap" },
        k.box({ fontWeight: 700, color: W(0.45) }, "다음 보상"),
        nextTier ? k.box({ marginLeft: 10, fontWeight: 700, color: W(0.3) }, "·") : null,
        nextTier ? k.box({ marginLeft: 10, fontWeight: 900, color: W(0.75) }, `T${num(nextTier)}`) : null
      ),
      nextRows.length
        ? k.box({ flexDirection: "column" }, nextRows.map((row, ri) => k.box({ marginTop: ri ? PASS_GAP : 0 }, row.map(tile))))
        : k.box({ height: PASS_TILE_H, borderRadius: 20, border: `2px solid ${W(0.06)}`, backgroundColor: PANEL, alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: maxed ? 900 : 700, color: W(0.35) }, maxed ? "MAX" : "—")
    )
  );
}

// 📌 카드 크기 — /퀘스트는 칸에 든 퀘스트 수에 따라 높이가 준다(가장 긴 칸 기준, CARD_SIZE 가 최대).
//    /시즌패스는 다음 보상이 한 줄이면 PASS_H1, 두 줄이면 CARD_SIZE. 나머지는 CARD_SIZE 그대로.
//    봇 renderCard · 사이트 미리보기가 그릴 때 이 값을 쓴다
export function cardSizeOf(kind, data) {
  const base = CARD_SIZE[kind];
  if (kind === "cmdQuest" && base) return { width: base.width, height: Math.min(base.height, questHeight(data)) };
  if (kind === "cmdPass" && base) return { width: base.width, height: Math.min(base.height, passHeight(data)) };
  return base;
}

/**
 * 카드 요소 트리 — kind: CARD_KINDS 중 하나, data: CARD_FIELDS 모양, h: (type, props, ...children) => 요소
 * opts.has(codePoint): 글꼴에 있는 글자인지(fontCoverage) — 주면 없는 글자를 빼고 그린다
 * opts.art(key): 도트 아이콘 SVG 문자열("art:<키>" 아이템 아이콘 — 사이트 lib/itemArt.js itemArtSvg, 봇은 그 사본). 없으면 유형 기본 모양
 * data.skin: 카드 스킨 키(CARD_SKINS) — SKIN_CARD_KINDS 에만
 */
export function buildCard(kind, data, h, opts = {}) {
  if (!isCardKind(kind)) throw new Error(`알 수 없는 카드: ${kind}`);
  const k = kit(h);
  const d = data && typeof data === "object" ? data : {};
  // 스킨은 SKIN_CARD_KINDS 에만 (RANKER 발표는 기본)
  k.skin = SKIN_CARD_KINDS.includes(kind) ? cardSkinOf(d.skin) : null;
  k.size = cardSizeOf(kind, d);
  const text = (s) => cardText(s, opts.has);
  const art = typeof opts.art === "function" ? opts.art : null;
  if (kind === "levelUp") return levelUpCard(k, kind, d, text);
  if (kind === "roleGrant") return roleGrantCard(k, kind, d, text);
  if (kind === "cmdLevel") return profileCard(k, kind, d, text);
  if (kind === "cmdRank") return rankBoardCard(k, kind, d, text);
  if (kind === "cmdAttend" || kind === "autoAttend") return attendCard(k, kind, d, text);
  if (kind === "cmdQuest") return questCard(k, kind, d, text);
  if (kind === "cmdInventory") return bagCard(k, kind, d, text, art);
  if (kind === "cmdPass") return passCard(k, kind, d, text, art);
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
  // 역할 지급 — 그 등급 역할을 그 등급 시작 레벨에 받은 것(관리자 미리보기 등급 칩 · 테스트 발송의 예시 변수 role · level 과 같다)
  if (kind === "roleGrant") return { avatar, name: "펭귄", role: t.name, roleColor: "", level: t.min, tier: t.key };
  if (kind === "cmdLevel") return { ...me, rank: 12, total: 1284 };
  if (kind === "cmdRank") {
    const names = ["북극곰", "물범", "바다표범", "해달", "흰올빼미", "순록", "북극여우", "일각고래", "바다코끼리", "흰곰"];
    const top = names.map((name, i) => {
      const lv = Math.max(1, level + 220 - i * 23);
      return { rank: i + 1, name, avatar: null, level: lv, xp: sampleXp(lv) + 12345 };
    });
    return { season: 2, seasonName: "A new world", total: 1284, top, me: { rank: 12, name: "펭귄", avatar, level, xp: base + cur } };
  }
  if (kind === "cmdAttend" || kind === "autoAttend") return { avatar, name: "펭귄", amount: 10000, streak: 5, bestStreak: 12, attendCount: 42, streakBonus: "연속 5일 보너스 +3,000 XP" };
  if (kind === "cmdQuest") {
    const H = 3600e3;
    const q = (name, metric, current, target, rewardXp, rewardPoint = 0, more = {}) => {
      const done = current >= target;
      return { name, metric, current, target, rewardXp, rewardPoint, done, claimed: false, claimable: done, ...more };
    };
    return {
      name: "펭귄",
      claimable: 2,
      periods: [
        {
          key: "daily",
          left: 5 * H + 42 * 60e3,
          quests: [
            q("출석", "minute", 60, 60, 10000, 0, { claimed: true, claimable: false }),
            q("오늘의 수다", "count", 5, 5, 1500),
            q("음성 1시간", "minute", 35, 60, 3000, 20),
            q("채팅 30회", "count", 12, 30, 2000),
          ],
        },
        {
          key: "weekly",
          left: 3 * 24 * H + 7 * H,
          quests: [q("주간 정수기", "count", 32, 50, 20000), q("출석 5일", "day", 5, 5, 0, 100, { unit: "일" }), q("음성 5시간", "minute", 300, 300, 15000, 0, { claimed: true, claimable: false })],
        },
        { key: "monthly", left: 18 * 24 * H + 3 * H, quests: [q("월간 이글루인", "xp", 423100, 1000000, 100000, 2), q("이글루 스타", "minute", 8423, 12000, 100000, 2)] },
      ],
    };
  }
  if (kind === "cmdInventory") {
    const it = (name, type, icon, more = {}) => ({ name, type, icon, count: 1, ...more });
    const items = [
      it("XP 물약", "item", "art:xp-potion", { count: 3 }),
      it("카드 스킨 · 골드", "cosmetic", "art:card-skin", { worn: true }),
      it("배지 · 섬", "cosmetic", "art:sky-island", { worn: true }),
      it("불꽃 방패", "item", "art:streak-shield", { count: 2, days: 2 }),
      it("음악 티켓", "perk", "art:music-ticket", { days: 27 }),
      it("게이머 헤드셋", "item", "art:gamer-headset"),
      it("네잎클로버", "item", "art:lucky-clover", { pending: true }),
      it("카드 스킨 · 오로라", "cosmetic", "art:card-skin"),
      it("로켓", "item", "art:pass-rocket", { days: 12 }),
      it("이글루 VIP", "role", "svg:crown"),
      it("출석 물약", "item", "art:attend-potion"),
      it("기프트카드", "physical", ""),
      it("개근 도장", "item", "art:attend-stamp"),
    ];
    return { avatar, name: "펭귄", total: items.length, items };
  }
  if (kind === "cmdPass") {
    return {
      season: 2,
      seasonName: "A new world",
      tier: 7,
      maxTier: 30,
      progress: 0.42,
      need: 17400,
      claimFree: 1,
      claimPaid: 2,
      premium: true,
      nextTier: 8,
      // 📌 두 줄(무료 줄 · 프리미엄 줄) — 관리자 미리보기 자리가 CARD_SIZE(두 줄 높이) 비율이라 샘플도 두 줄로 채운다
      next: [
        { kind: "xp", amount: 20000, premium: false },
        { kind: "point", amount: 300, premium: false },
        { kind: "item", label: "XP 물약", icon: "art:xp-potion", type: "item", premium: true },
        { kind: "role", label: "개척자", premium: true },
        { kind: "xp", amount: 50000, premium: true },
        { kind: "item", label: "로켓", icon: "art:pass-rocket", type: "item", premium: true },
      ],
    };
  }
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
