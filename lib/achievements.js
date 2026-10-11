// 📌 업적(도전과제) — 목록 · 보상 · 진행도 계산 한 벌. 2026-10-11 운영자 "스팀의 도전과제 느낌"(예: 음성 10000분 달성하기 → 업적을 깬다).
//    순수 JS(DB · React 의존 없음) — 서버(app/api/xp/achievements) · 화면 · 검사(scripts/test-achievements.mjs)가 같이 쓴다.
//    · 새로 세는 값은 없다 — 이미 쌓이는 기록만 읽는다(statsFromParts 의 칸마다 출처를 적었다).
//    · 보상 숫자는 아래 ACHIEVEMENTS 표 한 곳뿐. XP 는 퀘스트와 같은 봇 지급 대기열(Payout source "achievement" — 레벨 · 등급 · 역할을 봇이 맞춘다),
//      빙옥은 사이트가 바로(lib/points addPoints · 원장 WalletLog kind "achievement").
//    · 조건을 이미 채운 기존 유저도 바로 깬 것으로 친다(소급). 보상은 "받기"를 눌러야 들어간다.
//    · 깬 기록(models/Achievement)은 실사이트(Vercel)에서만 쓴다 — 기록이 한 번 생기면 나중에 값이 내려가도(랭킹 · 최근 70일 메시지 · 시즌마다 비는 칸) 깬 채로 남는다.
//      퇴장 초기화로 UserXp 문서가 새로 생기면 안 받은 예전 기록은 없는 것으로 친다(recordsSince — 받은 기록은 남아 두 번 받지 않는다).
//    보상 눈금(2026-10 정책 기준): 일일 퀘스트 3,000~5,000 XP · 주간 10,000~20,000 XP(+1 빙옥) · 월간 50,000~100,000 XP(+3~5 빙옥) · 출석 7,000 XP.
//    업적은 평생 한 번이라 첫걸음 2,000~10,000 · 몇 주 10,000~30,000 · 몇 달 40,000~100,000(+1~3) · 끝판 120,000~200,000(+4~10).
//    전부 깨도 XP 약 193만 + 빙옥 70 — 만렙 누적(1억 3천만 XP)의 1.5% 정도
import { VOICE_TIERS } from "./voiceTiers.js";

// 📌 업적 켜기 · 끄기 — 2026-10-11 운영자 "업적은 추후에 하자 일단 나중에 빌드할 때 빼고 나중에 추가".
//    false 동안: /level 프로필 카드 아이콘 줄의 「업적」 칸 · 업적 창 · 달성 알림이 그려지지 않고(줄은 업적 전 인벤토리 · 시즌 패스 · 강화 그대로),
//    업적 조회 · 알림 · 받기 요청을 보내지 않으며, app/api/xp/achievements 는 GET · POST 모두 DB 를 건드리기 전에 404 { success:false } (기록 · 지급 없음).
//    코드 · 모델(models/Achievement) · 표는 그대로 둔다 — true 로 바꾸면 전부 돌아온다
export const ACHIEVEMENTS_ON = false;

export const ACHIEVEMENT_GROUPS = [
  { g: "level", label: "레벨" },
  { g: "voice", label: "음성" },
  { g: "attend", label: "출석" },
  { g: "chat", label: "채팅" },
  { g: "quest", label: "퀘스트" },
  { g: "enhance", label: "강화" },
  { g: "shop", label: "ARCTIC" },
  { g: "season", label: "시즌" },
  { g: "hidden", label: "히든" },
];

// 진행/목표 뒤 단위 — API 의 unit 은 이 중 하나
export const ACHIEVEMENT_UNITS = ["분", "일", "회", "레벨", ""];

// 숨겨진 업적이 잠겨 있을 때 보이는 이름
export const HIDDEN_TITLE = "숨겨진 업적";

// 📌 활동 횟수(ActivityStat — 봇 bot/src/features/activityStats.js)에서 읽는 종류 · 새벽 시간대(KST 시, from ≤ h < to)
export const ACT_KINDS = ["msg", "reacted"];
export const DAWN_HOURS = [3, 6];

const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("ko-KR");
const TIER_MIN = Object.fromEntries(VOICE_TIERS.map((t) => [t.key, t.min]));

// 한 줄 — desc 의 {n} 은 목표 값(쉼표)으로 바꾼다. cmp "le" = 값이 1 이상이고 목표 이하(순위)
const A = (key, group, title, desc, icon, stat, goal, unit, xp, point, opt = {}) => ({
  key,
  group,
  title,
  desc: desc.replace("{n}", fmt(goal)),
  icon,
  stat,
  goal,
  unit,
  xp,
  point,
  hidden: !!opt.hidden,
  cmp: opt.cmp === "le" ? "le" : "ge",
});

// ═══ 업적 표 — 목표 · 보상 숫자는 여기에만 ═══
//    key 는 한 번 정하면 바꾸지 않는다(깬 기록 · 받은 기록이 key 로 남는다). 순서 = 화면 순서
//          key              group      title               desc                         icon                    stat          goal                 unit    XP       빙옥
export const ACHIEVEMENTS = [
  A("lv_50",           "level",   "새내기 펭귄",       "레벨 {n} 달성",              "xp-bolt",              "level",      50,                  "레벨", 10000,   0),
  A("lv_100",          "level",   "세 자릿수",         "레벨 {n} 달성",              "growth-serum",         "level",      100,                 "레벨", 20000,   0),
  A("lv_300",          "level",   "빙하 개척자",       "레벨 {n} 달성",              "promo-badge",          "level",      300,                 "레벨", 50000,   2),
  A("lv_500",          "level",   "극지 탐험가",       "레벨 {n} 달성",              "pass-rocket",          "level",      500,                 "레벨", 100000,  3),
  A("lv_1000",         "level",   "만렙",              "레벨 {n} 달성",              "star-shard",           "level",      1000,                "레벨", 200000,  10),
  A("tier_gold",       "level",   "골드 펭귄",         "골드 등급 도달",             "tier-frame-gold",      "level",      TIER_MIN.gold,       "레벨", 30000,   1),
  A("tier_diamond",    "level",   "다이아몬드 펭귄",   "다이아몬드 등급 도달",       "tier-frame-diamond",   "level",      TIER_MIN.diamond,    "레벨", 80000,   3),
  A("tier_igloo",      "level",   "이글루 그 자체",    "이글루 등급 도달",           "tier-frame-igloo",     "level",      TIER_MIN.igloo,      "레벨", 150000,  5),

  A("voice_100",       "voice",   "첫 수다",           "누적 음성 {n}분",            "music-earbuds",        "voiceMin",   100,                 "분",   3000,    0),
  A("voice_1000",      "voice",   "수다쟁이",          "누적 음성 {n}분",            "gamer-headset",        "voiceMin",   1000,                "분",   10000,   0),
  A("voice_10000",     "voice",   "목소리의 주인",     "누적 음성 {n}분",            "allnight-headset",     "voiceMin",   10000,               "분",   50000,   2),
  A("voice_50000",     "voice",   "살아있는 라디오",   "누적 음성 {n}분",            "veteran-mic",          "voiceMin",   50000,               "분",   150000,  5),

  A("attend_7",        "attend",  "일주일 출석",       "누적 출석 {n}일",            "attend-stamp",         "attend",     7,                   "일",   5000,    0),
  A("attend_30",       "attend",  "한 달 출석",        "누적 출석 {n}일",            "morning-hello",        "attend",     30,                  "일",   15000,   0),
  A("attend_100",      "attend",  "백일 기념",         "누적 출석 {n}일",            "hundred-cake",         "attend",     100,                 "일",   50000,   2),
  A("attend_365",      "attend",  "일 년 개근",        "누적 출석 {n}일",            "night-lantern",        "attend",     365,                 "일",   150000,  5),
  A("streak_7",        "attend",  "작심삼일 졸업",     "연속 출석 {n}일",            "friday-fire",          "streak",     7,                   "일",   10000,   0),
  A("streak_30",       "attend",  "꺼지지 않는 불꽃",  "연속 출석 {n}일",            "streak-shield",        "streak",     30,                  "일",   40000,   2),

  A("msg_100",         "chat",    "첫 인사",           "메시지 {n}회",               "chat-megaphone",       "msg",        100,                 "회",   3000,    0),
  A("msg_1000",        "chat",    "말 많은 펭귄",      "메시지 {n}회",               "radio",                "msg",        1000,                "회",   10000,   0),
  A("msg_10000",       "chat",    "채팅창 지박령",     "메시지 {n}회",               "scrim-mic",            "msg",        10000,               "회",   50000,   2),
  A("reacted_100",     "chat",    "인기 펭귄",         "반응 {n}번 받기",            "party-together",       "reacted",    100,                 "회",   10000,   0),

  A("quest_1",         "quest",   "첫 의뢰",           "퀘스트 보상 받기",           "quest-scroll",         "quests",     1,                   "회",   2000,    0),
  A("quest_10",        "quest",   "성실한 해결사",     "퀘스트 보상 {n}번",          "compass",              "quests",     10,                  "회",   10000,   0),
  A("quest_100",       "quest",   "베테랑 해결사",     "퀘스트 보상 {n}번",          "airship",              "quests",     100,                 "회",   40000,   1),
  A("quest_500",       "quest",   "전설의 해결사",     "퀘스트 보상 {n}번",          "portal",               "quests",     500,                 "회",   120000,  4),

  A("chat_enh_5",      "enhance", "단련된 입담",       "채팅 강화 +{n}",             "forge-coupon",         "chatEnh",    5,                   "",     10000,   0),
  A("chat_enh_10",     "enhance", "입담 완성",         "채팅 강화 +{n}",             "cooldown-hourglass",   "chatEnh",    10,                  "",     30000,   1),
  A("voice_enh_5",     "enhance", "단련된 목청",       "음성 강화 +{n}",             "soundproof-booth",     "voiceEnh",   5,                   "",     10000,   0),
  A("voice_enh_10",    "enhance", "목청 완성",         "음성 강화 +{n}",             "jackpot-slot",         "voiceEnh",   10,                  "",     30000,   1),

  A("buy_1",           "shop",    "첫 쇼핑",           "ARCTIC 첫 구매",             "starter-pack",         "buys",       1,                   "회",   5000,    0),
  A("buy_10",          "shop",    "단골 펭귄",         "ARCTIC 구매 {n}회",          "allround-set",         "buys",       10,                  "회",   20000,   1),
  A("buy_50",          "shop",    "큰손",              "ARCTIC 구매 {n}회",          "cashback-coin",        "buys",       50,                  "회",   60000,   3),
  A("skin_on",         "shop",    "새 옷",             "카드 스킨 착용",             "card-skin",            "skinOn",     1,                   "",     3000,    0),
  A("frame_on",        "shop",    "액자 속 펭귄",      "아바타 테두리 착용",         "avatar-frame",         "frameOn",    1,                   "",     3000,    0),
  A("badge_3",         "shop",    "훈장 세 개",        "프로필 배지 {n}개 달기",     "profile-badge",        "badges",     3,                   "",     5000,    0),

  A("pass_premium",    "season",  "프리미엄 승객",     "프리미엄 패스 해금",         "sky-island",           "passPremium", 1,                  "",     10000,   0),
  A("season_1",        "season",  "시즌 완주",         "시즌 결산 기록 남기기",      "pioneer-flag",         "seasons",    1,                   "",     20000,   1),
  A("rank_10",         "season",  "명예의 10인",       "랭킹 {n}위 안",              "weekend-sword",        "rank",       10,                  "",     50000,   2,  { cmp: "le" }),
  A("rank_3",          "season",  "시상대",            "랭킹 {n}위 안",              "month-trophy",         "rank",       3,                   "",     100000,  3,  { cmp: "le" }),

  // 숨겨진 업적 key 는 조건이 드러나지 않는 번호 — 잠긴 동안에도 응답에 key 는 실린다
  A("hidden_1",        "hidden",  "정상",              "랭킹 {n}위",                 "tier-skin-igloo",      "rank",       1,                   "",     50000,   3,  { cmp: "le", hidden: true }),
  A("hidden_2",        "hidden",  "시즌의 얼굴",       "시즌을 {n}위 안으로 마치기", "tier-skin-challenger", "seasonBest", 10,                  "",     50000,   3,  { cmp: "le", hidden: true }),
  A("hidden_3",        "hidden",  "영원한 불꽃",       "연속 출석 {n}일",            "welcome-fairy",        "streak",     100,                 "일",   80000,   5,  { hidden: true }),
  A("hidden_4",        "hidden",  "새벽 4시의 펭귄",   "새벽 3~6시 메시지 {n}회",    "owl-charm",            "dawn",       100,                 "회",   10000,   0,  { hidden: true }),
  A("hidden_5",        "hidden",  "빙옥 부자",         "빙옥 {n}개 모으기",          "binok-pickaxe",        "point",      50,                  "",     20000,   0,  { hidden: true }),
];

const BY_KEY = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));
export const achievementOf = (key) => BY_KEY.get(String(key || "")) || null;

const int = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const picked = (v) => typeof v === "string" && v !== "" && v !== "none";

// 📌 한 사람의 업적 재료 — 서버가 읽은 기록을 그대로 넘긴다(조회 · 받기 검증 · 희귀도 집계가 같은 식).
//    user    : UserXp 문서(없으면 전부 0)
//    act     : ActivityStat 합 { msg(메시지 — 쿨타임 무관), reacted(반응 받기), dawn(새벽 메시지) } — ⚠️ 70일 TTL 이라 최근 70일치
//    quests  : QuestClaim 건수(받은 퀘스트 보상 — 출석은 봇 자동 지급이라 기록이 없다)
//    buys    : ARCTIC 구매 줄 수(주문 묶음 + 상품 = 1건, 결제된 상태만 — lib/questKinds.js shop 과 같은 기준)
//              퀘스트 · 구매는 지금 UserXp 문서가 생긴 뒤 것만 센다(퇴장 초기화 뒤 다시 들어온 사람의 예전 몫 제외 — 서버가 거른다)
//    rank    : 지금 순위(xp 내림차순 · 동점 userId 오름차순, 1부터 — app/api/xp/me 와 같은 규칙). XP 가 0 이면 순위 없음(0)
export function statsFromParts({ user, act, quests, buys, rank } = {}) {
  const u = user || {};
  // 시즌 번호가 없는 줄은 기록이 아니다(app/api/xp/me seasonHistoryOf 와 같다)
  const hist = (Array.isArray(u.seasonHistory) ? u.seasonHistory : []).filter((h) => int(h?.season) > 0);
  const ranks = hist.map((h) => int(h?.rank)).filter(Boolean);
  return {
    // 최고 도달 레벨(봇이 $max 로 적는다) — XP 를 써서 내려가도 도달한 레벨 · 등급은 그대로
    level: Math.max(int(u.level), int(u.maxLevel)),
    // 누적 음성 시간(초 — 시즌이 바뀌어도 남는 통산, 2026-10-01부터)
    voiceMin: Math.floor(int(u.voiceSeconds) / 60),
    attend: int(u.attendCount),
    // 최고 연속 출석(지금 연속과 기록 중 큰 쪽)
    streak: Math.max(int(u.attendStreak), int(u.attendBestStreak)),
    msg: int(act?.msg),
    reacted: int(act?.reacted),
    dawn: int(act?.dawn),
    quests: int(quests),
    chatEnh: int(u.chatEnhance),
    voiceEnh: int(u.voiceEnhance),
    buys: int(buys),
    // 착용 — "" 안 고름 · "none" 끔은 착용이 아니다
    skinOn: picked(u.cardSkinPick) ? 1 : 0,
    frameOn: picked(u.avatarFramePick) ? 1 : 0,
    badges: Math.min(3, Array.isArray(u.badgePick) ? u.badgePick.filter(Boolean).length : 0),
    // 프리미엄 패스 해금(시즌마다 비는 칸 — 깬 기록은 남는다)
    passPremium: u.passUnlocked ? 1 : 0,
    // 지난 시즌 기록(봇 시즌 결산이 붙인다) — 시즌 수 · 가장 좋았던 순위(없으면 0)
    seasons: new Set(hist.map((h) => int(h.season))).size,
    seasonBest: ranks.length ? Math.min(...ranks) : 0,
    rank: int(u.xp) > 0 ? int(rank) : 0,
    point: int(u.point),
  };
}

export const statValue = (def, stats) => int(stats?.[def?.stat]);

// 조건을 지금 채웠나 — "le"(순위)는 순위가 있고 목표 이하, 나머지는 목표 이상
export function isUnlocked(def, stats) {
  if (!def) return false;
  const v = statValue(def, stats);
  return def.cmp === "le" ? v > 0 && v <= def.goal : v >= def.goal;
}

// 진행 막대 — 목표가 2 이상인 "이상" 조건만(순위 · 한 번이면 되는 것은 막대 없음). 진행은 목표에서 자른다
export function progressOf(def, stats) {
  if (!def || def.cmp === "le" || !(def.goal > 1)) return { goal: null, progress: null };
  return { goal: def.goal, progress: Math.min(statValue(def, stats), def.goal) };
}

// 희귀도 % — 소수 한 자리(0~100)
export function rarityPct(n, total) {
  const t = int(total);
  if (!t) return 0;
  return Math.min(100, Math.round((int(n) / t) * 1000) / 10);
}

// 📌 희귀도 재료 — 전체 유저(rows: [{ userId, stats }])마다 지금 조건을 채웠거나 깬 기록이 있으면 1명.
//    persisted: Map(key → Set(userId)) — 실사이트가 남긴 깬 기록(값이 내려간 뒤에도 가진 것으로 센다). 유저 목록에 없는 기록(나간 사람)은 세지 않는다
export function rarityCounts(rows, persisted) {
  const list = Array.isArray(rows) ? rows : [];
  const counts = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, 0]));
  for (const r of list) {
    for (const a of ACHIEVEMENTS) {
      if (isUnlocked(a, r?.stats) || persisted?.get?.(a.key)?.has?.(r?.userId)) counts[a.key] += 1;
    }
  }
  return { total: list.length, counts };
}

const iso = (d) => {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
};
const msOf = (d) => {
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isFinite(t) ? t : NaN;
};

// 📌 지금 계정에 남은 깬 기록 — 퇴장 초기화(봇 leaveReset — UserXp 문서를 지우고 다시 들어오면 새 문서)를 넘지 않게.
//    sinceMs: 지금 UserXp 문서가 생긴 시각(_id 시각 — lib/season.js passSince 와 같은 기준). 문서가 없으면 Infinity(남는 기록 없음).
//    · 받은 기록은 늘 남긴다 — 같은 보상을 다시 받지 않게(다시 깨면 "받음"으로 보인다)
//    · 안 받은 기록은 문서가 생긴 뒤 깬 것만 — 나가기 전에 깨고 안 받은 보상은 사라진다(다시 채우면 새로 깬다)
export function recordsSince(records, sinceMs) {
  const since = Number(sinceMs);
  return (Array.isArray(records) ? records : []).filter((r) => {
    if (!r?.key) return false;
    if (r.claimedAt) return true;
    const t = msOf(r.unlockedAt);
    return Number.isFinite(t) && Number.isFinite(since) && t >= since;
  });
}

// 📌 화면에 주는 모양(API 계약 — app/api/xp/achievements GET 의 data).
//    records: 이 사람의 깬 기록(recordsSince 를 거친 것) [{ key, unlockedAt, seenAt, claimedAt, rewardXp, rewardPoint }] · rarity: rarityCounts 결과 · live: 실사이트(기록을 쓰는 곳)
//    · 깬 것 = 기록이 있거나 지금 조건을 채움(소급). 깬 뒤에는 막대를 가득 채워 보인다(기록이 남은 뒤 값이 내려가도)
//    · 숨겨진 업적은 깨기 전까지 이름 "숨겨진 업적" · 설명 · 아이콘 · 목표 · 진행 · 보상을 비운다(희귀도만 보인다)
//    · 희귀도 집계가 없으면(첫 집계 실패) rarity null — 화면은 "—"(0% · 100% 로 보이지 않게)
//    · 받은 보상은 그때 준 값(rewardXp · rewardPoint) — 표를 나중에 바꿔도 받은 기록은 그대로 보인다
//    · claimable 은 테스트 사이트에서도 같은 판정 — 누르면 서버가 LOCAL 로 거절한다(claimLocked)
//    · newly: 실사이트만 — 깬 기록 중 아직 안 본 것(seenAt 없음 · 이미 받은 것은 빼고). 테스트 사이트는 [] (화면이 localStorage 로 센다)
export function buildAchievementView({ stats, records, rarity, live } = {}) {
  const recs = new Map((Array.isArray(records) ? records : []).filter((r) => r?.key).map((r) => [r.key, r]));
  const total = int(rarity?.total);
  const items = ACHIEVEMENTS.map((def) => {
    const rec = recs.get(def.key);
    const unlocked = !!rec?.unlockedAt || isUnlocked(def, stats);
    const claimed = !!rec?.claimedAt;
    const masked = def.hidden && !unlocked;
    const bar = masked ? { goal: null, progress: null } : progressOf(def, stats);
    if (unlocked && bar.goal != null) bar.progress = bar.goal;
    // 희귀도 — 집계가 늦어 내가 깬 것이 0명으로 잡혀 있으면 나를 1명으로 센다
    const n = Math.max(int(rarity?.counts?.[def.key]), unlocked ? 1 : 0);
    const reward = masked
      ? { xp: 0, point: 0 }
      : claimed
        ? { xp: int(rec.rewardXp), point: int(rec.rewardPoint) }
        : { xp: int(def.xp), point: int(def.point) };
    return {
      key: def.key,
      group: def.group,
      title: masked ? HIDDEN_TITLE : def.title,
      desc: masked ? "" : def.desc,
      icon: masked ? "" : def.icon,
      hidden: masked,
      goal: bar.goal,
      progress: bar.progress,
      unit: masked ? "" : def.unit,
      unlocked,
      unlockedAt: iso(rec?.unlockedAt),
      rarity: total > 0 ? rarityPct(n, Math.max(total, n)) : null,
      reward,
      claimed,
      claimable: unlocked && !claimed && (int(def.xp) > 0 || int(def.point) > 0),
    };
  });
  return {
    total: items.length,
    unlocked: items.filter((i) => i.unlocked).length,
    groups: ACHIEVEMENT_GROUPS.map(({ g, label }) => ({ g, label })),
    items,
    newly: live ? ACHIEVEMENTS.filter((d) => { const r = recs.get(d.key); return !!r?.unlockedAt && !r.seenAt && !r.claimedAt; }).map((d) => d.key) : [],
    claimLocked: !live,
  };
}
