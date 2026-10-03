/* 📌 봇 메시지 템플릿 — 레벨업 · 역할 지급 · DM · 명령어 응답의 기본 디자인 · 변수 · 렌더 규칙
   ⚠️ bot/src/botMessages.js 에 사본이 있다(봇은 별도 배포라 이 파일을 import 할 수 없다).
      아래 "공용 블록" 구간은 두 파일이 글자 하나까지 같아야 한다 — 한쪽을 고치면 반드시 다른 쪽도 고칠 것.
   관리자 편집 화면(미리보기)과 저장 API(sanitizeTemplate)가 쓰고, 봇은 같은 규칙으로 임베드를 만든다.
   클라이언트에서도 import 하므로 mongoose · node 전용 모듈을 쓰지 않는다.
   저장: models/BotMessage.js(키마다 한 문서) · 테스트 발송 대기열: models/BotMessageTest.js */
import { getTier } from "@/lib/voiceTiers";

// 레벨 → 등급 { key, name, en, color } — lib/voiceTiers.js 의 VOICE_TIERS 기준
export function tierOf(level) {
  const t = getTier(toLevel(level));
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
      card: true,
      content: "",
      embed: embed({
        color: "tier",
        description: "{user} 님에게 **{role}** 역할이 지급되었습니다.",
        timestamp: true,
      }),
    },
    plainEmbed: embed({
      color: "tier",
      title: "NEW ROLE",
      description: "{user} 님에게 **{role}** 역할이 지급되었습니다.\n> Lv.{level} 달성 보상",
      thumbnail: "{avatar}",
      timestamp: true,
    }),
  },
  // 📌 음성 자동 출석 — /출석체크(cmdAttend)와 같은 변수 · 같은 카드. 채널은 레벨 설정의 출석 알림 채널(비우면 레벨업 채널)
  autoAttend: {
    group: "channel",
    label: "자동 출석",
    desc: "음성 자동 출석이 되면 출석 알림 채널에 보냅니다.",
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
        description: "{user} 님 출석 완료 · **+{amount} XP**",
        timestamp: true,
      }),
    },
    plainEmbed: embed({
      authorName: "{name}",
      authorIcon: "{avatar}",
      title: "출석 완료",
      description: "> {streakBonus}",
      timestamp: true,
      fields: [f("받은 XP", "+{amount}"), f("연속 출석", "{streak}일"), f("누적 출석", "{attendCount}일")],
    }),
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

  // 📌 사이트 공지 — 글쓰기에서 공지를 올리면 봇이 공지 채널(레벨 설정 noticeChannelId)에 보낸다(bot/src/features/noticeAnnounce.js).
  //    변수는 사이트가 글에서 만든다(lib/noticeDiscord.js). {mention} 은 글마다 고르는 멘션(없음 · @everyone · @here) — 울리는 건 그 선택만
  noticePost: {
    group: "channel",
    label: "공지",
    desc: "사이트 공지를 공지 채널에 보냅니다.",
    vars: [
      { name: "title", label: "제목", sample: "SYSTEM : LEVEL 시즌 2 안내" },
      { name: "summary", label: "본문 요약", sample: "시즌 2 **A New World** 가 시작됩니다.\n• 새 시즌 패스 · 스킨 3종\n• 출석 XP 조정" },
      { name: "url", label: "글 주소", sample: `${SITE_URL}/notice` },
      { name: "tag", label: "태그", sample: "업데이트" },
      { name: "banner", label: "배너 주소", sample: `${SITE_URL}/banners/season2-store-pc.png` },
      { name: "author", label: "작성자", sample: "운영진" },
      { name: "mention", label: "멘션", sample: "@everyone" },
    ],
    defaults: {
      enabled: true,
      content: "{mention}",
      embed: embed({
        authorName: "NOTICE · {tag}",
        title: "{title}",
        url: "{url}",
        description: "{summary}",
        image: "{banner}",
        footerText: "고급 이글루 공식 사이트",
        timestamp: true,
      }),
    },
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
  // 📌 시즌 종료 D-7 · D-1 18:00(KST) — 받을 수 있는데 안 받은 칸이 있는 유저에게만 (bot/src/features/passReminder.js).
  //    claimable 은 /시즌패스 · 사이트 패스 창의 "받을 보상" 수와 같다. 링크 버튼(시즌 패스 창)은 봇이 붙인다
  passUnclaimed: {
    group: "dm",
    label: "시즌 패스 미수령",
    desc: "시즌 종료 D-7 · D-1 오후 6시, 받지 않은 시즌 패스 보상이 있으면 DM 으로 알립니다.",
    vars: [
      { name: "season", label: "시즌 번호", sample: 2 },
      { name: "seasonName", label: "시즌 이름", sample: "A new world" },
      { name: "claimable", label: "받을 보상 개수", sample: 3 },
      { name: "daysLeft", label: "남은 날(D-day)", sample: 7 },
      { name: "until", label: "시즌 종료 시각", sample: "2026.12.31 23:59" },
    ],
    defaults: {
      enabled: true,
      content: "",
      embed: embed({
        color: "#c39220",
        authorName: "SEASON {season} · {seasonName}",
        title: "시즌 패스",
        url: "{site}/level?tab=pass",
        description: "받지 않은 보상이 **{claimable}개** 있습니다.\n시즌이 끝나면 사라집니다.",
        timestamp: true,
        fields: [f("종료", "{until}"), f("남은 기간", "D-{daysLeft}")],
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
      card: true,
      content: "",
      embed: embed({
        description: "퀘스트 · 받을 보상 **{claimable}개**",
      }),
    },
    plainEmbed: embed({
      authorName: "{name}",
      authorIcon: "{avatar}",
      title: "퀘스트",
      url: "{site}/level",
      description: "받을 보상 **{claimable}개**",
      fields: [f("일일", "{daily}", false), f("주간", "{weekly}", false), f("월간", "{monthly}", false)],
    }),
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
      card: true,
      content: "",
      embed: embed({
        description: "인벤토리 · **{itemCount}개**",
        footerText: FOOTER_ARCTIC,
      }),
    },
    plainEmbed: embed({
      authorName: "{name}",
      authorIcon: "{avatar}",
      title: "인벤토리 · {itemCount}개",
      // 📌 레벨 쪽 가방으로 — /arctic/inventory 는 상점 비공개(shopPublic false)면 닫힌 화면이 나온다
      url: "{site}/level?tab=my&bag=1",
      description: "{items}",
      footerText: FOOTER_ARCTIC,
    }),
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
      card: true,
      content: "",
      embed: embed({
        description: "시즌 패스 · **{passTier}** / {passMax} 티어",
      }),
    },
    plainEmbed: embed({
      authorName: "SEASON {season} · {seasonName}",
      title: "시즌 패스",
      url: "{site}/level?tab=pass",
      description: "**{passTier}** / {passMax} 티어\n`{passProgressBar}`",
      thumbnail: "{avatar}",
      fields: [f("프리미엄", "{premium}"), f("받을 보상", "{claimable}개"), f("다음 보상", "{nextReward}")],
    }),
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
export const CARD_KEYS = ["levelUp", "roleGrant", "cmdLevel", "cmdRank", "cmdAttend", "autoAttend", "rankerAnnounce", "cmdQuest", "cmdInventory", "cmdPass"];
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

// 📌 변수 하나를 템플릿 글에서 지운다(바로 뒤 띄어쓰기 하나까지). 값이 비면 그 줄을 통째로 빼는 규칙(fill)을 피할 때 —
//    사이트 공지의 멘션 '없음': "{mention} 새 공지" 가 줄째 사라지지 않고 "새 공지" 로 남게. 미리보기(사이트)와 봇이 같이 쓴다
export function dropVar(template, name) {
  const t = template && typeof template === "object" ? template : {};
  const e = t.embed && typeof t.embed === "object" ? t.embed : {};
  const re = new RegExp(`\\{${String(name).replace(/[^a-zA-Z0-9]/g, "")}\\} ?`, "g");
  const cut = (s) => (typeof s === "string" ? s.replace(re, "") : s);
  const embed = { ...e };
  for (const k of ["authorName", "title", "description", "footerText"]) embed[k] = cut(e[k]);
  if (Array.isArray(e.fields)) embed.fields = e.fields.map((x) => ({ ...x, name: cut(x?.name), value: cut(x?.value) }));
  return { ...t, content: cut(t.content), embed };
}

// ═══ 공용 블록 끝 ═══
