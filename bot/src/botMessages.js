// ── 봇 메시지 템플릿 — 관리자 화면에서 고친 디자인 · 문구로 레벨업 · DM · 명령어 응답을 만든다 ──
//  ⚠️ 아래 "공용 블록" 은 사이트 lib/botMessages.js 와 글자 하나까지 같아야 한다 (봇은 별도 배포라 import 불가).
//     한쪽을 고치면 반드시 다른 쪽도 고칠 것.
//  · 60초마다 BotMessage 를 다시 읽는다 — 문서가 없는 키는 기본 디자인
//  · buildMessage(key, vars) → { content?, embeds?, allowedMentions } | null (꺼져 있거나 보낼 게 없으면 null)
//  · buildMessageWithCard(key, vars, cardData) → 위 모양 + files(card.png) — 카드 키(CARD_KEYS) · 카드 켜짐일 때 (bot/src/botCards.js)
//  · 관리자 테스트 발송(BotMessageTest)을 10초마다 관리자 DM 으로 보낸다
import mongoose from "mongoose";
import { EmbedBuilder } from "discord.js";
import { getSettings } from "./botSettings.js";
import { perksOf } from "./itemEffects.js";
import { config } from "./config.js";

// ⚠️ 사이트 lib/voiceTiers.js 의 VOICE_TIERS(이름 · 시작 레벨 · 색)를 옮긴 사본 — 한쪽만 고치지 말 것
const TIERS = [
  { key: "iron",        name: "아이언",       en: "IRON",        min: 1,   c: "#8a8a8a" },
  { key: "bronze",      name: "브론즈",       en: "BRONZE",      min: 90,  c: "#a06a3c" },
  { key: "silver",      name: "실버",         en: "SILVER",      min: 160, c: "#8d99a6" },
  { key: "gold",        name: "골드",         en: "GOLD",        min: 240, c: "#c39220" },
  { key: "platinum",    name: "플래티넘",     en: "PLATINUM",    min: 330, c: "#3f9e93" },
  { key: "diamond",     name: "다이아몬드",   en: "DIAMOND",     min: 430, c: "#3f7fc4" },
  { key: "master",      name: "마스터",       en: "MASTER",      min: 540, c: "#8557b0" },
  { key: "grandmaster", name: "그랜드마스터", en: "GRANDMASTER", min: 650, c: "#a03a6b" },
  { key: "challenger",  name: "챌린저",       en: "CHALLENGER",  min: 760, c: "#c2452f" },
  { key: "igloo",       name: "이글루",       en: "IGLOO",       min: 880, c: "#e91e3f" },
];

// 레벨 → 등급 { key, name, en, color }
export function tierOf(level) {
  const lv = toLevel(level);
  let t = TIERS[0];
  for (const x of TIERS) if (lv >= x.min) t = x;
  return { key: t.key, name: t.name, en: t.en, color: t.c };
}

// ═══ 공용 블록 시작 — lib/botMessages.js 와 bot/src/botMessages.js 의 이 구간은 글자 하나까지 같아야 한다 ═══

export const SITE_URL = "https://www.premiumigloo.com";
export const BRAND_COLOR = "#e91e3f";
const FOOTER_LEVEL = "고급 이글루 · SYSTEM : LEVEL";
const FOOTER_ARCTIC = "고급 이글루 · ARCTIC";
const LOGO = "{site}/logo.png";

// 📌 디스코드 한도 — 템플릿 원문도, 치환한 결과도 이 길이로 자른다
export const LIMITS = {
  content: 2000,
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footerText: 2048,
  authorName: 256,
  url: 1000,
  total: 6000, // 임베드 하나의 글자 합(제목 · 설명 · 필드 · 푸터 · 작성자)
};

export const MESSAGE_GROUPS = [
  { key: "channel", label: "채널 알림" },
  { key: "dm", label: "DM" },
  { key: "command", label: "명령어 응답" },
];

// 색 고르기 칸의 추천 값 — "tier" 는 레벨 등급 색(변수 level 이 있을 때)
export const COLOR_PRESETS = [
  { value: "tier", label: "등급 색" },
  { value: "#e91e3f", label: "강조" },
  { value: "#c39220", label: "골드" },
  { value: "#3f9e93", label: "민트" },
  { value: "#3f7fc4", label: "블루" },
  { value: "#8557b0", label: "퍼플" },
  { value: "#8a8a8a", label: "회색" },
  { value: "#131313", label: "잉크" },
];

// 진행 막대 — "▰▰▰▱▱▱▱▱▱▱ 30%". 100% 는 가득 찼을 때만 (99.6% 를 100% 로 올리지 않는다)
export function progressBar(ratio, width = 10, { percent = true } = {}) {
  const n = Number(ratio);
  const r = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  const w = Math.min(30, Math.max(1, Math.floor(Number(width)) || 10));
  const filled = r >= 1 ? w : Math.floor(r * w);
  const bar = "▰".repeat(filled) + "▱".repeat(w - filled);
  return percent ? `${bar} ${Math.floor(r * 100)}%` : bar;
}

// 날짜 → "2026.10.27 21:00" (KST)
export function formatUntil(d) {
  const t = d == null || d === "" ? NaN : new Date(d).getTime();
  if (!Number.isFinite(t)) return "";
  const k = new Date(t + 9 * 3600e3).toISOString();
  return `${k.slice(0, 4)}.${k.slice(5, 7)}.${k.slice(8, 10)} ${k.slice(11, 16)}`;
}

// "1,234" · 1234 · "Lv.128" → 숫자 (등급 색 판정용)
//   📌 숫자 아닌 글자를 전부 지우면 "Lv.128" 이 ".128"(=0.128) 이 되어 아이언으로 떨어진다 — 쉼표만 지우고 첫 숫자를 읽는다
function toLevel(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const m = String(v ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

export const tierColorOf = (level) => tierOf(level).color;

// 모든 키에 들어가는 변수
export const COMMON_VARS = [
  { name: "user", label: "멘션", sample: "@펭귄" },
  { name: "name", label: "표시 이름", sample: "펭귄" },
  { name: "username", label: "사용자명", sample: "penguin" },
  { name: "avatar", label: "아바타 주소", sample: "https://cdn.discordapp.com/embed/avatars/0.png" },
  { name: "server", label: "서버 이름", sample: "고급 이글루" },
  { name: "site", label: "사이트 주소", sample: SITE_URL },
];

// 필드 한 줄 — { name, value, inline }
const f = (name, value, inline = true) => ({ name, value, inline });

// 임베드 기본 모양 — 키마다 필요한 칸만 덮어쓴다
const embed = (o) => ({
  on: true,
  color: BRAND_COLOR,
  authorName: "",
  authorIcon: "",
  title: "",
  url: "",
  description: "",
  thumbnail: "",
  image: "",
  footerText: FOOTER_LEVEL,
  footerIcon: LOGO,
  timestamp: false,
  fields: [],
  ...o,
});

const BAR_SAMPLE = progressBar(0.135);

// 📌 메시지 목록 — 키 · 변수 이름은 계약서(3절) 고정. 다른 곳은 이 키와 변수로만 부른다.
//    defaults 는 관리자가 아직 저장하지 않았을 때 쓰는 기본 디자인.
//    카드 키(CARD_KEYS)는 기본으로 이미지 카드를 붙인다(card) — 임베드는 카드와 겹치지 않게 색 막대 · 한 줄 · 푸터만.
//    plainEmbed 는 카드를 끈 예전 모양 — 편집 화면에서 기본 모양 그대로 카드를 끄면 이것으로 바꿔 준다.
export const MESSAGE_DEFS = {
  // ── 채널 알림 ──
  levelUp: {
    group: "channel",
    label: "레벨업",
    desc: "레벨이 오르면 레벨업 채널에 보냅니다.",
    legacyKey: "levelupMessage",
    vars: [
      { name: "level", label: "새 레벨", sample: 128 },
      { name: "prevLevel", label: "이전 레벨", sample: 127 },
      { name: "xp", label: "누적 XP", sample: 1079200 },
      { name: "nextXp", label: "다음 레벨까지 남은 XP", sample: 15561 },
      { name: "tier", label: "등급", sample: "브론즈" },
      { name: "progressBar", label: "진행 막대", sample: BAR_SAMPLE },
    ],
    defaults: {
      enabled: true,
      card: true,
      content: "",
      embed: embed({
        color: "tier",
        description: "{user} 님이 **Lv.{level}** 에 올랐습니다.",
        timestamp: true,
      }),
    },
    plainEmbed: embed({
      color: "tier",
      title: "LEVEL UP",
      description: "{user} 님이 **Lv.{level}** 에 올랐습니다.\n`{progressBar}`  다음 레벨까지 {nextXp} XP",
      thumbnail: "{avatar}",
      timestamp: true,
      fields: [
        f("레벨", "Lv.{prevLevel} → **Lv.{level}**"),
        f("등급", "{tier}"),
        f("누적 XP", "{xp}"),
      ],
    }),
  },
  roleGrant: {
    group: "channel",
    label: "역할 지급",
    desc: "레벨 보상 역할을 받으면 보냅니다.",
    legacyKey: "roleGrantMessage",
    legacyEnabledKey: "roleGrantEnabled",
    vars: [
      { name: "role", label: "역할 이름", sample: "브론즈" },
      { name: "level", label: "레벨", sample: 90 },
    ],
    defaults: {
      enabled: true,
      content: "",
      embed: embed({
        color: "tier",
        title: "NEW ROLE",
        description: "{user} 님에게 **{role}** 역할이 지급되었습니다.\n> Lv.{level} 달성 보상",
        thumbnail: "{avatar}",
        timestamp: true,
      }),
    },
  },
  rankerAnnounce: {
    group: "channel",
    label: "시즌 RANKER 발표",
    desc: "시즌 결산 때 상위 3인을 알립니다.",
    vars: [
      { name: "season", label: "시즌 번호", sample: 1 },
      { name: "seasonName", label: "시즌 이름", sample: "UP!" },
      { name: "first", label: "1위 멘션", sample: "@북극곰" },
      { name: "second", label: "2위 멘션", sample: "@펭귄" },
      { name: "third", label: "3위 멘션", sample: "@물범" },
      { name: "firstXp", label: "1위 XP", sample: 48210000 },
      { name: "secondXp", label: "2위 XP", sample: 41870500 },
      { name: "thirdXp", label: "3위 XP", sample: 39002300 },
      { name: "role", label: "지급 역할", sample: "RANKER" },
    ],
    defaults: {
      enabled: true,
      card: true,
      content: "{first} {second} {third}",
      embed: embed({
        description: "시즌 {season} 상위 3인입니다. 축하합니다.",
        timestamp: true,
      }),
    },
    plainEmbed: embed({
      authorName: "SEASON {season} · {seasonName}",
      title: "RANKER",
      description: "시즌 {season} 상위 3인입니다. 축하합니다.",
      timestamp: true,
      fields: [
        f("🥇 1위", "{first}\n`{firstXp} XP`"),
        f("🥈 2위", "{second}\n`{secondXp} XP`"),
        f("🥉 3위", "{third}\n`{thirdXp} XP`"),
        f("지급 역할", "{role}", false),
      ],
    }),
  },

  // ── DM ──
  purchaseGranted: {
    group: "dm",
    label: "구매 지급 · 영구",
    desc: "영구 상품을 지급하면 DM 으로 보냅니다.",
    vars: [{ name: "item", label: "상품 이름", sample: "아이스 네임 컬러" }],
    defaults: {
      enabled: true,
      content: "",
      embed: embed({
        authorName: "ARCTIC",
        title: "지급 완료",
        url: "{site}/arctic/inventory",
        description: "**{item}** 지급이 완료되었습니다.",
        footerText: FOOTER_ARCTIC,
        timestamp: true,
        fields: [f("이용 기간", "영구")],
      }),
    },
  },
  purchaseGrantedTimed: {
    group: "dm",
    label: "구매 지급 · 기간제",
    desc: "기간제 상품을 지급하면 DM 으로 보냅니다.",
    vars: [
      { name: "item", label: "상품 이름", sample: "아이스 네임 컬러" },
      { name: "days", label: "이용 일수", sample: 30 },
      { name: "until", label: "만료 시각", sample: "2026.10.27 21:00" },
    ],
    defaults: {
      enabled: true,
      content: "",
      embed: embed({
        authorName: "ARCTIC",
        title: "지급 완료",
        url: "{site}/arctic/inventory",
        description: "**{item}** 지급이 완료되었습니다.\n기간이 끝나면 자동으로 회수됩니다.",
        footerText: FOOTER_ARCTIC,
        timestamp: true,
        fields: [f("이용 기간", "{days}일"), f("만료", "{until}")],
      }),
    },
  },
  renewed: {
    group: "dm",
    label: "기간 연장",
    desc: "기간제 상품을 연장하면 DM 으로 보냅니다.",
    vars: [
      { name: "item", label: "상품 이름", sample: "아이스 네임 컬러" },
      { name: "days", label: "추가 일수", sample: 30 },
      { name: "until", label: "새 만료 시각", sample: "2026.11.26 21:00" },
    ],
    defaults: {
      enabled: true,
      content: "",
      embed: embed({
        authorName: "ARCTIC",
        title: "연장 완료",
        url: "{site}/arctic/inventory",
        description: "**{item}** 이용 기간이 연장되었습니다.",
        footerText: FOOTER_ARCTIC,
        timestamp: true,
        fields: [f("추가", "+{days}일"), f("만료", "{until}")],
      }),
    },
  },
  expiryReminder: {
    group: "dm",
    label: "만료 임박",
    desc: "기간제 상품이 끝나기 전에 DM 으로 알립니다.",
    vars: [
      { name: "item", label: "상품 이름", sample: "아이스 네임 컬러" },
      { name: "until", label: "만료 시각", sample: "2026.10.27 21:00" },
      { name: "hoursLeft", label: "남은 시간(시간)", sample: 24 },
      { name: "renewUrl", label: "연장 주소", sample: `${SITE_URL}/arctic/inventory` },
    ],
    defaults: {
      enabled: true,
      content: "",
      embed: embed({
        color: "#c39220",
        authorName: "ARCTIC",
        title: "만료 예정",
        url: "{renewUrl}",
        description: "**{item}** 이용 기간이 곧 끝납니다.\n[연장하기]({renewUrl})",
        footerText: FOOTER_ARCTIC,
        timestamp: true,
        fields: [f("만료", "{until}"), f("남은 시간", "약 {hoursLeft}시간")],
      }),
    },
  },
  expired: {
    group: "dm",
    label: "기간 만료",
    desc: "기간이 끝나 회수하면 DM 으로 보냅니다.",
    vars: [
      { name: "item", label: "상품 이름", sample: "아이스 네임 컬러" },
      { name: "days", label: "이용 일수", sample: 30 },
    ],
    defaults: {
      enabled: true,
      content: "",
      embed: embed({
        color: "#8a8a8a",
        authorName: "ARCTIC",
        title: "기간 만료",
        description: "**{item}** 이용 기간({days}일)이 끝나 회수되었습니다.\n[다시 구매하기]({site}/arctic)",
        footerText: FOOTER_ARCTIC,
        timestamp: true,
      }),
    },
  },
  refunded: {
    group: "dm",
    label: "환불",
    desc: "환불로 회수하면 DM 으로 보냅니다.",
    vars: [{ name: "item", label: "상품 이름", sample: "아이스 네임 컬러" }],
    defaults: {
      enabled: true,
      content: "",
      embed: embed({
        color: "#8a8a8a",
        authorName: "ARCTIC",
        title: "환불 완료",
        description: "**{item}** 구매가 환불되었습니다.\n결제한 XP · 빙옥은 돌려드렸습니다.",
        footerText: FOOTER_ARCTIC,
        timestamp: true,
      }),
    },
  },

  // ── 명령어 응답 ──
  cmdLevel: {
    group: "command",
    label: "/레벨",
    desc: "/레벨 응답",
    vars: [
      { name: "level", label: "레벨", sample: 128 },
      { name: "xp", label: "누적 XP", sample: 1079200 },
      { name: "need", label: "다음 레벨까지 남은 XP", sample: 15561 },
      { name: "nextLevel", label: "다음 레벨", sample: 129 },
      { name: "progressBar", label: "진행 막대", sample: BAR_SAMPLE },
      { name: "tier", label: "등급", sample: "브론즈" },
    ],
    defaults: {
      enabled: true,
      card: true,
      content: "",
      embed: embed({
        color: "tier",
        description: "**Lv.{level}** · {tier}",
      }),
    },
    plainEmbed: embed({
      color: "tier",
      authorName: "{name}",
      authorIcon: "{avatar}",
      title: "Lv.{level}",
      description: "`{progressBar}`\nLv.{nextLevel} 까지 **{need} XP**",
      fields: [f("등급", "{tier}"), f("누적 XP", "{xp}")],
    }),
  },
  cmdRank: {
    group: "command",
    label: "/랭크",
    desc: "/랭크 응답",
    vars: [
      { name: "rank", label: "순위", sample: 12 },
      { name: "total", label: "전체 인원", sample: 1284 },
      { name: "level", label: "레벨", sample: 128 },
      { name: "xp", label: "누적 XP", sample: 1079200 },
      { name: "tier", label: "등급", sample: "브론즈" },
    ],
    defaults: {
      enabled: true,
      card: true,
      content: "",
      embed: embed({
        color: "tier",
        description: "{total}명 중 **{rank}위**입니다.",
      }),
    },
    plainEmbed: embed({
      color: "tier",
      authorName: "{name}",
      authorIcon: "{avatar}",
      title: "#{rank}",
      description: "{total}명 중 **{rank}위**입니다.",
      fields: [f("레벨", "Lv.{level}"), f("등급", "{tier}"), f("누적 XP", "{xp}")],
    }),
  },
  cmdAttend: {
    group: "command",
    label: "/출석체크",
    desc: "/출석체크 성공 응답",
    vars: [
      { name: "amount", label: "받은 XP", sample: 10000 },
      { name: "attendCount", label: "누적 출석", sample: 42 },
      { name: "streak", label: "연속 출석", sample: 5 },
      { name: "bestStreak", label: "최고 연속", sample: 12 },
      { name: "streakBonus", label: "연속 보너스 한 줄", sample: "연속 5일 보너스 +3,000 XP" },
    ],
    defaults: {
      enabled: true,
      card: true,
      content: "",
      embed: embed({
        description: "출석 완료 · **+{amount} XP**",
      }),
    },
    plainEmbed: embed({
      authorName: "{name}",
      authorIcon: "{avatar}",
      title: "출석 완료",
      description: "> {streakBonus}",
      fields: [f("받은 XP", "+{amount}"), f("연속 출석", "{streak}일"), f("누적 출석", "{attendCount}일")],
    }),
  },
  cmdAttendAlready: {
    group: "command",
    label: "/출석체크 · 이미 출석",
    desc: "오늘 이미 출석했을 때 (나만 보기)",
    vars: [{ name: "streak", label: "연속 출석", sample: 5 }],
    defaults: {
      enabled: true,
      content: "",
      embed: embed({
        color: "#8a8a8a",
        description: "오늘은 이미 출석했습니다.\n연속 **{streak}일** · 내일 다시 체크해 주세요.",
        footerText: "",
        footerIcon: "",
      }),
    },
  },
  cmdQuest: {
    group: "command",
    label: "/퀘스트",
    desc: "/퀘스트 응답",
    vars: [
      { name: "daily", label: "일일 목록", sample: "`완료` 출석 체크 · 10,000 XP\n`12/30` 채팅 30회 · 1,500 XP" },
      { name: "weekly", label: "주간 목록", sample: "`3/5` 음성 5시간 · 20,000 XP" },
      { name: "monthly", label: "월간 목록", sample: "`8/20` 출석 20일 · 빙옥 100" },
      { name: "claimable", label: "받을 보상 개수", sample: 1 },
    ],
    defaults: {
      enabled: true,
      content: "",
      embed: embed({
        authorName: "{name}",
        authorIcon: "{avatar}",
        title: "퀘스트",
        url: "{site}/level",
        description: "받을 보상 **{claimable}개**",
        fields: [f("일일", "{daily}", false), f("주간", "{weekly}", false), f("월간", "{monthly}", false)],
      }),
    },
  },
  cmdInventory: {
    group: "command",
    label: "/인벤토리",
    desc: "/인벤토리 응답",
    vars: [
      { name: "items", label: "보유 목록", sample: "**아이스 네임 컬러** · 2026.10.27 까지\n**XP 부스터** · 영구" },
      { name: "itemCount", label: "보유 개수", sample: 2 },
    ],
    defaults: {
      enabled: true,
      content: "",
      embed: embed({
        authorName: "{name}",
        authorIcon: "{avatar}",
        title: "인벤토리 · {itemCount}개",
        // 📌 레벨 쪽 가방으로 — /arctic/inventory 는 상점 비공개(shopPublic false)면 닫힌 화면이 나온다
        url: "{site}/level?tab=my&bag=1",
        description: "{items}",
        footerText: FOOTER_ARCTIC,
      }),
    },
  },
  cmdPass: {
    group: "command",
    label: "/시즌패스",
    desc: "/시즌패스 응답",
    vars: [
      { name: "season", label: "시즌 번호", sample: 2 },
      { name: "seasonName", label: "시즌 이름", sample: "A new world" },
      { name: "passTier", label: "현재 티어", sample: 7 },
      { name: "passMax", label: "마지막 티어", sample: 30 },
      { name: "passProgressBar", label: "진행 막대", sample: progressBar(0.23) },
      { name: "nextReward", label: "다음 보상", sample: "XP 20,000" },
      { name: "claimable", label: "받을 보상 개수", sample: 2 },
      { name: "premium", label: "프리미엄", sample: "해금" },
    ],
    defaults: {
      enabled: true,
      content: "",
      embed: embed({
        authorName: "SEASON {season} · {seasonName}",
        title: "시즌 패스",
        url: "{site}/level?tab=pass",
        description: "**{passTier}** / {passMax} 티어\n`{passProgressBar}`",
        thumbnail: "{avatar}",
        fields: [f("프리미엄", "{premium}"), f("받을 보상", "{claimable}개"), f("다음 보상", "{nextReward}")],
      }),
    },
  },
  levelClosed: {
    group: "command",
    label: "비공개 안내",
    desc: "레벨 비공개 기간에 명령어를 쓰면 보냅니다.",
    vars: [],
    defaults: {
      enabled: true,
      content: "",
      embed: embed({
        color: "#8a8a8a",
        title: "SYSTEM : LEVEL",
        description: "준비 중입니다. 공개 후 이용할 수 있습니다.",
      }),
    },
  },
};

export const MESSAGE_KEYS = Object.keys(MESSAGE_DEFS);

// 📌 이미지 카드를 붙일 수 있는 키 — lib/botCards.js · bot/src/botCards.js 의 CARD_KINDS 와 같다.
//    카드가 켜져 있으면(card) 봇이 PNG 를 그려 임베드 큰 이미지 자리에(임베드가 없으면 본문 아래 첨부로) 붙인다.
export const CARD_KEYS = ["levelUp", "cmdLevel", "cmdRank", "cmdAttend", "rankerAnnounce"];
export const isCardKey = (key) => CARD_KEYS.includes(key);

// 📌 예전 BotSetting 한 줄 문구의 기본값 — 이것과 같으면 관리자가 바꾼 적이 없는 것이라 새 기본 디자인을 쓴다
export const LEGACY_DEFAULTS = {
  levelUp: "🎉 {user} 님이 **Lv.{level}** 에 도달했습니다!",
  roleGrant: "🎖 {user} 님에게 **{role}** 역할이 지급되었습니다! (Lv.{level})",
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const str = (v, max) => (typeof v === "string" ? v : v == null ? "" : String(v)).replace(/\r\n?/g, "\n").slice(0, max);

// "#RGB" · "#rrggbb" · "tier" 만 받는다. 그 밖은 "" (색 없음)
function normColor(v) {
  const c = String(v ?? "").trim().toLowerCase();
  if (c === "tier") return "tier";
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  if (/^#[0-9a-f]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return "";
}

// 📌 어떤 입력이 와도 템플릿 모양으로 정리한다 — 관리자 저장(API) · 봇 캐시 · 미리보기가 같은 함수를 쓴다
//    card(이미지 카드)는 없으면 켜짐. key 를 주면 카드 키가 아닌 키는 false 로 정리한다
export function sanitizeTemplate(input, key) {
  const t = input && typeof input === "object" ? input : {};
  const e = t.embed && typeof t.embed === "object" ? t.embed : {};
  const fields = (Array.isArray(e.fields) ? e.fields : []).slice(0, LIMITS.fields).map((x) => ({
    name: str(x?.name, LIMITS.fieldName),
    value: str(x?.value, LIMITS.fieldValue),
    inline: !!x?.inline,
  }));
  return {
    enabled: t.enabled !== false,
    card: t.card !== false && (key === undefined || isCardKey(key)),
    content: str(t.content, LIMITS.content),
    embed: {
      on: e.on !== false,
      color: normColor(e.color),
      authorName: str(e.authorName, LIMITS.authorName),
      authorIcon: str(e.authorIcon, LIMITS.url),
      title: str(e.title, LIMITS.title),
      url: str(e.url, LIMITS.url),
      description: str(e.description, LIMITS.description),
      thumbnail: str(e.thumbnail, LIMITS.url),
      image: str(e.image, LIMITS.url),
      footerText: str(e.footerText, LIMITS.footerText),
      footerIcon: str(e.footerIcon, LIMITS.url),
      timestamp: !!e.timestamp,
      fields,
    },
  };
}

export function defaultTemplate(key) {
  const def = MESSAGE_DEFS[key];
  return def ? sanitizeTemplate(clone(def.defaults), key) : null;
}

// 📌 저장된 문서(doc)가 있으면 그것이 전부다(관리자가 비운 칸은 비운 그대로).
//    문서가 없으면 기본 디자인 — 이때 legacy(BotSetting 문서 또는 문구 문자열)를 주면
//    관리자가 예전에 바꿔 둔 한 줄 문구를 설명 첫 줄로 살리고, roleGrantEnabled=false 도 꺼짐으로 옮긴다.
//    카드가 생기기 전에 저장한 문서(card 없음)는 기본값(카드 키면 켜짐)을 따른다.
export function mergeTemplate(key, doc, { legacy } = {}) {
  const def = MESSAGE_DEFS[key];
  if (!def) return null;
  if (doc && typeof doc === "object") {
    const plain = typeof doc.toObject === "function" ? doc.toObject() : doc;
    const base = clone(def.defaults);
    return sanitizeTemplate({ ...base, ...plain, embed: { ...base.embed, ...(plain.embed || {}) } }, key);
  }
  const t = defaultTemplate(key);
  if (legacy && def.legacyKey) {
    const text = String((typeof legacy === "string" ? legacy : legacy[def.legacyKey]) || "").trim();
    if (text && text !== LEGACY_DEFAULTS[key]) {
      const lines = t.embed.description.split("\n");
      lines[0] = text;
      t.embed.description = str(lines.join("\n"), LIMITS.description);
    }
  }
  if (legacy && typeof legacy === "object" && def.legacyEnabledKey && legacy[def.legacyEnabledKey] === false) {
    t.enabled = false;
  }
  return t;
}

// 공통 변수 + 키 변수의 예시 값 — 미리보기 · 테스트 발송용
export function sampleVars(key) {
  const out = {};
  for (const v of COMMON_VARS) out[v.name] = v.sample;
  for (const v of MESSAGE_DEFS[key]?.vars || []) out[v.name] = v.sample;
  return out;
}

const VAR_RE = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// 숫자는 천 단위 쉼표, null · undefined 는 빈 글
//   📌 레벨 · 시즌 · 티어 번호는 쉼표 없이 — "Lv.1,000" 이 되지 않게
const RAW_NUMBER_VARS = new Set(["level", "prevLevel", "nextLevel", "season", "passTier", "passMax"]);
function fmtValue(v, name) {
  if (v == null) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    return RAW_NUMBER_VARS.has(name) ? String(v) : v.toLocaleString("ko-KR");
  }
  return String(v);
}

// 📌 {변수} 치환. 모르는 {이름} 은 그대로 둔다(오타가 미리보기에 보이게).
//    변수가 있는 줄에서 그 변수가 전부 비면 그 줄을 통째로 뺀다 — "> {streakBonus}" 처럼 없을 때 빈 줄 · 빈 인용이 남지 않게.
//    주소가 빈 링크 [글]() 도 뺀다.
function fill(src, vars) {
  if (!src) return "";
  const out = [];
  for (const line of String(src).replace(/\r\n?/g, "\n").split("\n")) {
    let known = 0;
    let filled = 0;
    const text = line
      .replace(VAR_RE, (m, name) => {
        if (!has(vars, name)) return m;
        known += 1;
        const v = fmtValue(vars[name], name);
        if (v !== "") filled += 1;
        return v;
      })
      .replace(/\[([^\]\n]*)\]\(\s*\)/g, "");
    if (known > 0 && filled === 0) continue;
    out.push(text);
  }
  return out.join("\n").trim();
}

function cut(s, n) {
  const v = String(s || "");
  if (v.length <= n) return v;
  if (n <= 1) return v.slice(0, Math.max(0, n));
  let head = v.slice(0, n - 1);
  if (/[\uD800-\uDBFF]$/.test(head)) head = head.slice(0, -1); // 이모지 반쪽이 남지 않게
  return `${head}…`;
}

// http(s) 주소만 통과 — 디스코드가 거절하는 주소를 넣으면 메시지 전체가 실패한다
function safeUrl(s) {
  const v = String(s || "").trim();
  if (!/^https?:\/\/[^\s<>"]+$/i.test(v) || v.length > LIMITS.url) return "";
  try {
    new URL(v);
    return v;
  } catch {
    return "";
  }
}

// 색 → "#rrggbb" 또는 "" (색 없음). "tier" 는 vars.level 의 등급 색, level 이 없으면 강조색
export function resolveColor(color, vars = {}) {
  const c = normColor(color);
  if (c === "tier") return vars.level != null && vars.level !== "" ? tierColorOf(vars.level) : BRAND_COLOR;
  return c;
}

// 임베드 하나의 글자 합이 6,000 을 넘으면 뒤 필드부터 빼고, 그래도 넘으면 설명을 줄인다 (본문인 설명을 먼저 지킨다)
function fitTotal(e) {
  const size = () =>
    e.title.length + e.description.length + e.authorName.length + e.footerText.length +
    e.fields.reduce((n, x) => n + x.name.length + x.value.length, 0);
  while (size() > LIMITS.total && e.fields.length) e.fields.pop();
  const over = size() - LIMITS.total;
  if (over > 0) e.description = cut(e.description, Math.max(0, e.description.length - over));
}

// 📌 템플릿 + 변수 → 디스코드에 보낼 모양 그대로(미리보기 · 봇 공용).
//    { enabled, content, embed: { color:"#rrggbb"|"", authorName, authorIcon, title, url, description,
//      thumbnail, image, footerText, footerIcon, timestamp, fields } | null, empty }
//    · 값이 빈 필드는 빠지고, 이름만 빈 필드는 보이지 않는 이름(zero-width space)으로 둔다.
//    · embed.on=false 이거나 보일 칸이 하나도 없으면 embed 는 null. content 도 비면 empty=true.
export function renderTemplate(template, vars = {}) {
  const t = sanitizeTemplate(template);
  const v = { ...(vars || {}) };
  if (v.site === undefined) v.site = SITE_URL;
  if (v.tier === undefined && v.level != null && v.level !== "") v.tier = tierOf(v.level).name;

  const out = { enabled: t.enabled, content: cut(fill(t.content, v), LIMITS.content), embed: null, empty: false };
  const e = t.embed;
  if (e.on) {
    const fields = [];
    for (const x of e.fields) {
      const value = cut(fill(x.value, v), LIMITS.fieldValue);
      if (!value) continue;
      fields.push({ name: cut(fill(x.name, v), LIMITS.fieldName) || "\u200b", value, inline: !!x.inline });
    }
    const r = {
      color: resolveColor(e.color, v),
      authorName: cut(fill(e.authorName, v), LIMITS.authorName),
      authorIcon: safeUrl(fill(e.authorIcon, v)),
      title: cut(fill(e.title, v), LIMITS.title),
      url: safeUrl(fill(e.url, v)),
      description: cut(fill(e.description, v), LIMITS.description),
      thumbnail: safeUrl(fill(e.thumbnail, v)),
      image: safeUrl(fill(e.image, v)),
      footerText: cut(fill(e.footerText, v), LIMITS.footerText),
      footerIcon: safeUrl(fill(e.footerIcon, v)),
      timestamp: !!e.timestamp,
      fields: fields.slice(0, LIMITS.fields),
    };
    fitTotal(r);
    const visible = r.title || r.description || r.fields.length || r.authorName || r.footerText || r.image || r.thumbnail;
    out.embed = visible ? r : null;
  }
  out.empty = !out.content && !out.embed;
  return out;
}

// ═══ 공용 블록 끝 ═══

// ── 모델 — 사이트 models/BotMessage.js · models/BotMessageTest.js 와 이름 · 모양 · 기본값이 같아야 한다 ──
//    (컬렉션 botmessages · botmessagetests. db.js 는 다른 작업이 맡고 있어 이 파일에서 정의한다)
const BotMessageFieldSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    value: { type: String, default: "" },
    inline: { type: Boolean, default: false },
  },
  { _id: false }
);

const BotMessageSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: true },
  card: { type: Boolean, default: true },
  content: { type: String, default: "" },
  embed: {
    on: { type: Boolean, default: true },
    color: { type: String, default: "" },
    authorName: { type: String, default: "" },
    authorIcon: { type: String, default: "" },
    title: { type: String, default: "" },
    url: { type: String, default: "" },
    description: { type: String, default: "" },
    thumbnail: { type: String, default: "" },
    image: { type: String, default: "" },
    footerText: { type: String, default: "" },
    footerIcon: { type: String, default: "" },
    timestamp: { type: Boolean, default: false },
    fields: { type: [BotMessageFieldSchema], default: [] },
  },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: "" },
});
export const BotMessage = mongoose.models.BotMessage || mongoose.model("BotMessage", BotMessageSchema);

const BotMessageTestSchema = new mongoose.Schema({
  key: { type: String, required: true },
  userId: { type: String, required: true },
  template: { type: mongoose.Schema.Types.Mixed, default: null }, // 저장 전 초안 — 있으면 이것으로, 없으면 저장된 디자인으로
  status: { type: String, default: "pending", index: true },       // pending → sending → sent | failed
  error: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now, index: { expires: 60 * 60 * 24 * 7 } }, // 7일 뒤 자동 삭제
  claimedAt: { type: Date, default: null }, // 봇이 선점(sending)한 시각 — 5분 넘게 멈추면 failed 로 돌린다
  sentAt: { type: Date, default: null },
});
export const BotMessageTest = mongoose.models.BotMessageTest || mongoose.model("BotMessageTest", BotMessageTestSchema);

// ── 캐시 ──────────────────────────────────
const REFRESH_MS = 60 * 1000;
const TEST_TICK_MS = 10 * 1000;
const STALE_MS = 5 * 60 * 1000;

let cache = new Map();

export async function refreshBotMessages() {
  try {
    const rows = await BotMessage.find({}).lean();
    cache = new Map(rows.map((r) => [r.key, r]));
  } catch (e) {
    console.error("봇 메시지 설정 갱신 오류:", e.message);
  }
}

// 📌 템플릿 원문(content)에 직접 적은 역할 멘션 · @everyone 만 울린다.
//    이름 · 상품명 같은 변수 값에 섞여 들어온 @everyone · 역할 멘션은 울리지 않는다 (유저 멘션은 울린다)
function mentionsFor(raw) {
  const text = String(raw || "");
  const parse = ["users"];
  if (/@(everyone|here)\b/.test(text)) parse.push("everyone");
  const roles = [...new Set([...text.matchAll(/<@&(\d{5,25})>/g)].map((m) => m[1]))].slice(0, 100);
  return roles.length ? { parse, roles } : { parse };
}

// 렌더 결과 → EmbedBuilder (작성자 · 푸터는 글이 있을 때만, 주소는 제목이 있을 때만)
function toEmbed(r) {
  const e = new EmbedBuilder();
  if (r.color) e.setColor(parseInt(r.color.slice(1), 16));
  if (r.authorName) e.setAuthor(r.authorIcon ? { name: r.authorName, iconURL: r.authorIcon } : { name: r.authorName });
  if (r.title) {
    e.setTitle(r.title);
    if (r.url) e.setURL(r.url);
  }
  if (r.description) e.setDescription(r.description);
  if (r.thumbnail) e.setThumbnail(r.thumbnail);
  if (r.image) e.setImage(r.image);
  if (r.fields.length) e.addFields(r.fields);
  if (r.footerText) e.setFooter(r.footerIcon ? { text: r.footerText, iconURL: r.footerIcon } : { text: r.footerText });
  if (r.timestamp) e.setTimestamp();
  return e;
}

// 📌 keepEmpty — 카드가 켜진 템플릿은 글이 전부 비어도 모양을 돌려준다(카드만 보낼 수 있게). 보낼 게 있는지는 sendable 로 본다
function toPayload(tpl, vars, { keepEmpty = false } = {}) {
  const r = renderTemplate(tpl, vars);
  if (r.empty && !keepEmpty) return null;
  const payload = { allowedMentions: mentionsFor(tpl.content) };
  if (r.content) payload.content = r.content;
  if (r.embed) payload.embeds = [toEmbed(r.embed)];
  return payload;
}

const sendable = (p) => !!(p && (p.content || p.embeds?.length || p.files?.length));

// ── 이미지 카드 (bot/src/botCards.js) ──────────────
//    📌 처음 쓸 때 불러온다 — 그림 모듈(@resvg/resvg-js 네이티브)을 못 불러와도 봇은 뜨고 글(임베드)만 보낸다
let cardsMod = null;
function loadCards() {
  if (!cardsMod) {
    cardsMod = import("./botCards.js").catch((e) => {
      console.error("[카드] 그림 모듈을 불러오지 못했습니다 — 카드 없이 보냅니다:", e?.message || e);
      return null;
    });
  }
  return cardsMod;
}

// 📌 한 번에 둘까지만 그린다 — 음성 지급 한 번에 여러 명이 레벨업해도 CPU 를 몰아 쓰지 않게. 기다리는 게 많으면 카드 없이 보낸다
const CARD_SLOTS = 2;
const CARD_QUEUE_MAX = 10;
let cardBusy = 0;
const cardWaiters = [];
async function withCardSlot(fn) {
  if (cardBusy < CARD_SLOTS) cardBusy += 1;
  else {
    if (cardWaiters.length >= CARD_QUEUE_MAX) return null;
    await new Promise((resolve) => cardWaiters.push(resolve)); // 끝난 쪽이 자리를 그대로 넘겨준다
  }
  try {
    return await fn();
  } finally {
    const next = cardWaiters.shift();
    if (next) next();
    else cardBusy -= 1;
  }
}

/**
 * 카드 PNG 그리기 → { png, name } | null. 던지지 않는다.
 * cardData: 카드 data(CARD_FIELDS 모양) 또는 (cards 모듈) => data | Promise<data> — 함수면 카드가 켜져 있을 때만 부른다(아바타 받기 등)
 */
async function drawCard(key, cardData) {
  const m = await loadCards();
  if (!m || !cardData) return null;
  let data = null;
  try {
    data = typeof cardData === "function" ? await cardData(m) : cardData;
  } catch (e) {
    console.error(`[카드] ${key} 값 준비 오류:`, e?.message || e);
    return null;
  }
  if (!data) return null;
  const png = await withCardSlot(() => m.renderCard(key, data));
  return png ? { png, name: m.CARD_FILE } : null;
}

// 카드 붙이기 — 임베드가 있으면 그 큰 이미지 자리로, 없으면 본문 아래 첨부로
function attachCard(payload, card) {
  const out = { ...payload, files: [...(payload.files || []), { attachment: card.png, name: card.name }] };
  if (out.embeds?.length) out.embeds[0].setImage(`attachment://${card.name}`);
  return out;
}

// 카드용 아바타 — member · user 의 디스코드 아바타(png 256)를 data URI 로. 못 받으면 null(첫 글자 원형)
export async function cardAvatar(x) {
  const m = await loadCards();
  if (!m) return null;
  return m.fetchAvatarDataUri(avatarOf(x)).catch(() => null);
}

// 📌 이 키가 쓰는 변수(공통 + 키 변수)는 호출하는 쪽이 빠뜨려도 빈 값으로 본다 —
//    "{streakBonus}" 같은 원문이 유저에게 그대로 보이지 않게. (모르는 {이름} 을 남기는 규칙은 오타용이라 선언된 변수엔 쓰지 않는다)
//    undefined 로 채워 두므로 tier 는 renderTemplate 이 level 로 계산하고, site 는 사이트 주소로 채워진다.
function withDeclaredVars(key, vars) {
  const base = {};
  for (const x of COMMON_VARS) base[x.name] = undefined;
  for (const x of MESSAGE_DEFS[key]?.vars || []) base[x.name] = undefined;
  return { ...base, ...(vars && typeof vars === "object" ? vars : {}) };
}

// 템플릿 고르기 + 모양 만들기 → { payload, card } | null (꺼진 키 · 보낼 게 없음). 던지지 않는다.
//   card: 카드 키이고 템플릿이 카드를 켰는지 — 켜져 있으면 글이 비어도 payload 를 돌려준다(카드만 보낼 수 있게)
function compose(key, vars) {
  if (!MESSAGE_DEFS[key]) {
    console.error(`알 수 없는 봇 메시지 키: ${key}`);
    return null;
  }
  const v = withDeclaredVars(key, vars);
  const make = (tpl) => {
    const card = isCardKey(key) && tpl.card === true;
    const payload = toPayload(tpl, v, { keepEmpty: card });
    return payload ? { payload, card } : null;
  };
  try {
    const tpl = mergeTemplate(key, cache.get(key), { legacy: getSettings() });
    if (!tpl || !tpl.enabled) return null;
    return make(tpl);
  } catch (e) {
    // 저장된 디자인이 디스코드 검증에 걸려도 알림 자체는 나가게 기본 디자인으로 한 번 더 만든다
    console.error(`봇 메시지 만들기 오류 (${key}) — 기본 디자인으로 보냅니다:`, e.message);
    try {
      return make(defaultTemplate(key));
    } catch {
      return null;
    }
  }
}

// 📌 보낼 메시지 만들기 — 관리자가 끈 키는 null(보내지 않는다). 던지지 않는다. 카드는 붙이지 않는다(buildMessageWithCard).
//    vars 에는 commonVars(member) 와 키 변수를 함께 넣는다: buildMessage("levelUp", { ...commonVars(member), level, … })
export function buildMessage(key, vars = {}) {
  const c = compose(key, vars);
  return c && sendable(c.payload) ? c.payload : null;
}

/**
 * 📌 카드 붙인 메시지 — 카드 키이고 템플릿이 카드를 켰으면 PNG 를 그려 files 에 붙이고 임베드 큰 이미지를 attachment:// 로.
 *    임베드가 꺼져 있으면 본문 + 파일. 그리기 실패 · 시간 초과 · 모듈 없음이면 카드 없이 buildMessage 와 같은 모양. 던지지 않는다.
 *    cardData: CARD_FIELDS 모양(bot/src/botCards.js) 또는 async (cards) => data — 함수면 카드가 켜져 있을 때만 부른다
 *    buildMessageWithCard("levelUp", { ...commonVars(member), level, … }, async () => ({ avatar: await cardAvatar(member), name, level, … }))
 */
export async function buildMessageWithCard(key, vars = {}, cardData = null) {
  const c = compose(key, vars);
  if (!c) return null;
  if (c.card && cardData) {
    const card = await drawCard(key, withSkin(key, vars, cardData));
    if (card) return attachCard(c.payload, card);
  }
  return sendable(c.payload) ? c.payload : null;
}

function avatarOf(x) {
  try {
    return x?.displayAvatarURL?.({ extension: "png", size: 256 }) || "";
  } catch {
    return "";
  }
}

// 📌 카드 스킨(아이템 효과 cardSkin) — commonVars 가 심볼 칸에 실어 둔 멤버로 스킨을 찾아 카드 data 에 넣는다.
//    레벨업 · /레벨 · /랭크 · /출석체크만(RANKER 제외). data 에 skin 이 이미 있으면 그대로 둔다. 부르는 쪽은 고칠 게 없다
//    (vars 를 { ...commonVars(member), … } 로 만들면 심볼 칸도 함께 복사된다 — 템플릿 치환 · JSON 에는 드러나지 않는다)
const VARS_MEMBER = Symbol("member");
const SKIN_KEYS = new Set(["levelUp", "cmdLevel", "cmdRank", "cmdAttend"]);
function withSkin(key, vars, cardData) {
  const member = vars?.[VARS_MEMBER];
  if (!SKIN_KEYS.has(key) || !member) return cardData;
  return async (m) => {
    const data = typeof cardData === "function" ? await cardData(m) : cardData;
    if (!data || data.skin !== undefined) return data;
    const skin = perksOf(member).cardSkin;
    return skin ? { ...data, skin } : data;
  };
}

// 공통 변수 — member 는 GuildMember 또는 User (DM 대상이 서버에 없을 때)
export function commonVars(member, guild) {
  const user = member?.user || member || null;
  const g = guild || member?.guild || null;
  return {
    user: user?.id ? `<@${user.id}>` : "",
    name: member?.displayName || user?.globalName || user?.username || "",
    username: user?.username || "",
    avatar: avatarOf(member) || avatarOf(user),
    server: g?.name || "",
    site: SITE_URL,
    [VARS_MEMBER]: member || null, // 카드 스킨용(withSkin) — 글에는 쓰이지 않는다
  };
}

// ── 테스트 발송 대기열 ─────────────────────────
//    관리자 화면에서 "테스트 발송" 을 누르면 BotMessageTest 에 pending 이 쌓인다 → 요청한 관리자에게 예시 값으로 DM.
async function fetchMember(guild, userId) {
  if (!guild) return null;
  return guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
}

async function processTests(client) {
  // 보내다 꺼진 건(sending 에 멈춤)은 실패로 돌려 화면에 사유가 보이게 한다
  //   📌 기준은 선점 시각(claimedAt) — createdAt 으로 보면 봇이 꺼져 있던 동안 쌓인 옛 요청을 보내는 도중에 실패로 바꿔 버린다
  await BotMessageTest.updateMany(
    { status: "sending", claimedAt: { $lt: new Date(Date.now() - STALE_MS) } },
    { $set: { status: "failed", error: "보내는 중 중단되었습니다. 다시 시도해 주세요." } }
  );

  const rows = await BotMessageTest.find({ status: "pending" }).sort({ createdAt: 1 }).limit(10).lean();
  if (!rows.length) return;
  const guild = client.guilds.cache.get(config.guildId) || null;

  for (const t of rows) {
    // 선점 — pending → sending 에 성공한 쪽만 보낸다 (봇이 둘 떠 있어도 한 번만)
    const claimed = await BotMessageTest.findOneAndUpdate(
      { _id: t._id, status: "pending" },
      { $set: { status: "sending", claimedAt: new Date() } }
    );
    if (!claimed) continue;
    let delivered = false;
    try {
      if (!MESSAGE_DEFS[t.key]) throw new Error("알 수 없는 메시지입니다.");
      const user = await client.users.fetch(t.userId).catch(() => null);
      if (!user) throw new Error("디스코드에서 유저를 찾을 수 없습니다.");
      const member = await fetchMember(guild, t.userId);
      // 📌 저장 직후 누른 테스트가 1분 캐시의 옛 디자인으로 가지 않게 — 초안(template)이 있으면 그것, 없으면 DB 에서 바로 읽는다.
      //    꺼 둔 메시지도 모양은 볼 수 있게 enabled 는 보지 않는다.
      const tpl =
        t.template && typeof t.template === "object"
          ? mergeTemplate(t.key, t.template)
          : mergeTemplate(t.key, await BotMessage.findOne({ key: t.key }).lean(), { legacy: getSettings() });
      const vars = { ...sampleVars(t.key), ...commonVars(member || user, guild) };
      // 카드 키 · 카드 켜짐이면 샘플 카드(예시 레벨의 등급 · 요청한 관리자 이름 · 사진)를 붙인다. 못 그리면 글만
      const card = isCardKey(t.key) && tpl.card === true;
      let payload = toPayload(tpl, vars, { keepEmpty: card });
      if (card && payload) {
        const drawn = await drawCard(t.key, async (m) => {
          const data = m.sampleCardData(t.key, m.cardTierIndex(vars.level), await cardAvatar(member || user));
          if (t.key !== "rankerAnnounce" && vars.name) data.name = vars.name;
          return data;
        });
        if (drawn) payload = attachCard(payload, drawn);
      }
      if (!sendable(payload)) throw new Error("보낼 내용이 없습니다.");
      await user.send(payload);
      delivered = true;
      await BotMessageTest.updateOne({ _id: t._id, status: "sending" }, { $set: { status: "sent", sentAt: new Date(), error: "" } });
      console.log(`🧪 봇 메시지 테스트 발송: ${t.key} → ${member?.displayName || user.username}`);
    } catch (e) {
      // DM 은 이미 갔는데 상태 기록만 실패한 경우 — 실패로 덮어쓰지 않는다
      if (delivered) {
        console.error(`🧪 봇 메시지 테스트 상태 기록 오류 (${t.key}):`, e?.message || e);
        continue;
      }
      // 50007 = DM 차단
      const error = e?.code === 50007 ? "DM 이 막혀 있어 보내지 못했습니다." : String(e?.message || e).slice(0, 500);
      await BotMessageTest.updateOne({ _id: t._id }, { $set: { status: "failed", error } }).catch(() => {});
      console.error(`🧪 봇 메시지 테스트 발송 실패 (${t.key}):`, error);
    }
  }
}

let started = false;
let testTicking = false;

export function startBotMessageLoop(client) {
  if (started) return;
  started = true;
  refreshBotMessages();
  setInterval(refreshBotMessages, REFRESH_MS);

  // 틱이 겹치지 않게 잠근다 (DM 이 느리면 10초를 넘길 수 있다)
  const run = async () => {
    if (testTicking) return;
    testTicking = true;
    try {
      await processTests(client);
    } catch (e) {
      console.error("봇 메시지 테스트 대기열 오류:", e.message);
    } finally {
      testTicking = false;
    }
  };
  run();
  setInterval(run, TEST_TICK_MS);
  loadCards(); // 첫 카드가 늦지 않게 그림 모듈을 미리 불러 둔다(실패해도 봇은 그대로)
  console.log("✅ 봇 메시지 템플릿 시작 (1분 주기 갱신 · 테스트 발송 10초 주기)");
}
