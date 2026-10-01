// 📌 추천 아이템 — 상점 관리 › 아이템 탭의 "추천 아이템" 창에서 골라 한 번에 등록하는 목록 (2026-09-28 사용자: "다 만들어", "밸런스 조절은 내가 할게").
//    · 효과 크기 · 조건은 임시 값 — 밸런스는 등록한 뒤 관리자가 아이템 수정에서 정한다. 설명은 비워 둔다(관리자가 채운다)
//    · 유형 "item"(꾸미기 줄은 "cosmetic") · 역할 없음 · 도트 아이콘("art:<키>" — lib/itemArt.js). 상점 상품은 만들지 않는다
//    · 등록은 app/api/admin/items/presets — 이름이 같은 아이템이 이미 있으면 건너뛴다(이름이 곧 키)
//    · 효과 모양은 lib/itemEffects.js normalizeEffects 를 그대로 통과하는 값만 둔다(on 값 · 필드 이름이 같아야 한다)
//    서버(route.js)와 화면 양쪽에서 import 하므로 DB · React 의존이 없어야 한다.

import { normalizeEffects, itemEffectLines } from "./itemEffects";
import { ITEM_ARTS, ITEM_ART_GROUPS } from "./itemArt";

const add = (on, amount, more) => ({ on, mode: "add", amount, ...more });
const pct = (on, amount, more) => ({ on, mode: "percent", amount, ...more });
// 시간대 · 요일 조건 (KST, 요일 0=일 … 6=토)
const NIGHT = { hourFrom: 22, hourTo: 2 };
const FRI_NIGHT = { days: [5], hourFrom: 18, hourTo: 24 };

// key: 목록 키(화면 선택 · 요청 본문). art 가 없으면 key 가 곧 도트 아이콘 키
//   chatBuffXp · voiceBuffXp · attendBuffXp: 기본 효과(채팅 · 음성 1회당, 출석 시 +N XP), effects: 추가 효과
const LIST = [
  // ── 시간대 ──
  { key: "owl-charm", name: "올빼미 부적", effects: [pct("chat", 30, NIGHT)] },
  { key: "early-bird", name: "얼리버드", effects: [add("chat", 200, { hourFrom: 6, hourTo: 9 }), add("voice", 200, { hourFrom: 6, hourTo: 9 })] },
  { key: "lunch-box", name: "점심 수다", effects: [add("chat", 100, { hourFrom: 12, hourTo: 14 })] },
  { key: "radio", name: "퇴근길 라디오", effects: [add("voice", 300, { hourFrom: 18, hourTo: 22 })] },
  { key: "night-lantern", name: "새벽 순찰대", effects: [pct("voice", 50, { hourFrom: 2, hourTo: 6 })] },
  // ── 요일 ──
  { key: "weekend-sword", name: "주말 전사", effects: [pct("voice", 20, { days: [0, 6] })] },
  { key: "friday-fire", name: "불금 부스터", effects: [pct("chat", 30, FRI_NIGHT), pct("voice", 30, FRI_NIGHT)] },
  { key: "monday-vaccine", name: "월요병 백신", effects: [add("firstChat", 3000, { days: [1] })] },
  { key: "wednesday-coffee", name: "수요일의 쉼표", effects: [add("attend", 2000, { days: [3] })] },
  // ── 채널 ── 내전 마이크의 채널은 관리자가 아이템 수정에서 지정한다(비워 두면 모든 음성 채널)
  { key: "scrim-mic", name: "내전 마이크", effects: [add("voice", 500)] },
  { key: "chat-megaphone", name: "수다방 확성기", effects: [pct("chat", 50)] },
  { key: "gamer-headset", name: "게이머 헤드셋", effects: [pct("voice", 25)] },
  { key: "music-earbuds", name: "음악방 이어폰", effects: [add("voice", 200)] },
  // ── 출석 · 누적 ──
  { key: "attend-stamp", name: "개근 도장", effects: [add("attendEvery", 20000, { everyN: 7 })] },
  { key: "month-trophy", name: "한 달 개근상", effects: [add("attendEvery", 100000, { everyN: 30 })] },
  { key: "hundred-cake", name: "백일 케이크", effects: [add("attendEvery", 300000, { everyN: 100 })] },
  { key: "veteran-mic", name: "장기 근속 마이크", effects: [add("voiceDaily", 10000, { minMinutes: 180 })] },
  { key: "allnight-headset", name: "철야 헤드셋", effects: [add("voiceDaily", 30000, { minMinutes: 360 })] },
  { key: "morning-hello", name: "굿모닝 인사", effects: [add("firstChat", 2000, { hourFrom: 6, hourTo: 10 })] },
  { key: "growth-serum", name: "성장 촉진제", effects: [add("levelUp", 3000)] },
  // ── 묶음 ──
  { key: "allround-set", name: "올라운더 세트", chatBuffXp: 100, voiceBuffXp: 200, attendBuffXp: 2000 },
  { key: "starter-pack", name: "시즌 스타터 팩", effects: [pct("chat", 20), pct("voice", 20), add("attendEvery", 20000, { everyN: 7 })] },
  { key: "night-set", name: "야행성 세트", effects: [pct("chat", 40, NIGHT), pct("voice", 40, NIGHT)] },
  // ── 상시 ──
  { key: "forge-coupon", name: "강화 할인권", effects: [pct("enhanceDiscount", 10)] },
  { key: "cashback-coin", name: "ARCTIC 캐시백", effects: [pct("shopCashback", 3)] },
  { key: "binok-pickaxe", name: "빙옥 채굴기", effects: [add("attendPoint", 5)] },
  { key: "promo-badge", name: "승급 보너스", effects: [pct("tierPointBonus", 20)] },
  { key: "quest-scroll", name: "퀘스트 보너스권", effects: [pct("questBonus", 20)] },
  { key: "pass-rocket", name: "패스 가속기", effects: [pct("passBoost", 10)] },
  { key: "cooldown-hourglass", name: "쿨타임 단축", effects: [add("cooldownCut", 15, { seconds: 15 })] },
  { key: "soundproof-booth", name: "방음 부스", effects: [pct("muteRelief", 40)] },
  // ── 소모 · 확률 · 함께 ──
  { key: "streak-shield", name: "연속 출석 보호막", effects: [add("streakShield", 1)] },
  { key: "jackpot-slot", name: "잭팟 채팅", effects: [add("chatJackpot", 1000, { chance: 5 })] },
  { key: "lucky-clover", name: "럭키 출석", effects: [pct("attendLucky", 100, { chance: 10 })] },
  { key: "party-together", name: "함께라서", effects: [pct("voiceParty", 30, { minMembers: 3 })] },
  { key: "welcome-fairy", name: "환영 요정", effects: [add("welcomeReply", 1000)] },
  // ── 꾸미기 ── 카드 스킨은 스킨마다 한 개(그림은 같은 반짝 카드)
  { key: "card-skin-gold", art: "card-skin", type: "cosmetic", name: "카드 스킨 · 골드", effects: [add("cardSkin", 1, { skin: "gold" })] },
  { key: "card-skin-aurora", art: "card-skin", type: "cosmetic", name: "카드 스킨 · 오로라", effects: [add("cardSkin", 1, { skin: "aurora" })] },
  { key: "card-skin-ice", art: "card-skin", type: "cosmetic", name: "카드 스킨 · 아이스", effects: [add("cardSkin", 1, { skin: "ice" })] },
  { key: "card-skin-crimson", art: "card-skin", type: "cosmetic", name: "카드 스킨 · 크림슨", effects: [add("cardSkin", 1, { skin: "crimson" })] },
  { key: "profile-badge", type: "cosmetic", name: "프로필 배지", effects: [add("profileBadge", 1)] },
  // ── 시즌 2 「A New World」(2026-10) — 패스 보상: 카드 스킨 '새로운 세계' · 배지 '섬' · 한정 아이템 4 / 시즌 상점: 카드 스킨 2 · 특수 배지 4 ──
  { key: "card-skin-newworld", art: "card-skin", type: "cosmetic", name: "카드 스킨 · 새로운 세계", effects: [add("cardSkin", 1, { skin: "newworld" })] },
  { key: "card-skin-chart", art: "card-skin", type: "cosmetic", name: "카드 스킨 · 항해도", effects: [add("cardSkin", 1, { skin: "chart" })] },
  { key: "card-skin-airship", art: "card-skin", type: "cosmetic", name: "카드 스킨 · 비공정", effects: [add("cardSkin", 1, { skin: "airship" })] },
  { key: "badge-sky-island", art: "sky-island", type: "cosmetic", name: "배지 · 섬", effects: [add("profileBadge", 1)] },
  { key: "badge-compass", art: "compass", type: "cosmetic", name: "배지 · 나침반", effects: [add("profileBadge", 1)] },
  { key: "badge-airship", art: "airship", type: "cosmetic", name: "배지 · 비공정", effects: [add("profileBadge", 1)] },
  { key: "badge-portal", art: "portal", type: "cosmetic", name: "배지 · 차원문", effects: [add("profileBadge", 1)] },
  { key: "badge-pioneer-flag", art: "pioneer-flag", type: "cosmetic", name: "배지 · 개척 깃발", effects: [add("profileBadge", 1)] },
  { key: "sky-seed", name: "하늘섬 씨앗", effects: [add("attendEvery", 5000, { everyN: 3 })] },
  { key: "cloud-candy", name: "구름 솜사탕", effects: [add("voiceParty", 300, { minMembers: 4 })] },
  { key: "wind-pinwheel", name: "순풍 바람개비", effects: [pct("passBoost", 15), pct("questBonus", 10)] },
  { key: "star-shard", name: "별똥별 조각", effects: [add("chatJackpot", 3000, { chance: 3, hourFrom: 22, hourTo: 2 })] },
];

const ART_GROUP_OF = Object.fromEntries(ITEM_ARTS.map((a) => [a.key, a.group]));
const GROUP_LABEL = Object.fromEntries(ITEM_ART_GROUPS.map((g) => [g.g, g.label]));

export const ITEM_PRESETS = LIST.map(({ art, ...p }) => {
  const k = art || p.key;
  return {
    chatBuffXp: 0, voiceBuffXp: 0, attendBuffXp: 0, effects: [],
    ...p,
    icon: `art:${k}`,
    // 창에서 묶어 보여 줄 이름 — 도트 아이콘 묶음(lib/itemArt.js ITEM_ART_GROUPS)을 그대로 쓴다
    group: GROUP_LABEL[ART_GROUP_OF[k]] || "",
  };
});
export const PRESET_OF = Object.fromEntries(ITEM_PRESETS.map((p) => [p.key, p]));

// 📌 기존 아이템 도트 아이콘 교체 — 이름으로 찾아 icon 만 바꾼다(다른 칸은 그대로)
export const PRESET_ICON_SWAPS = [
  { name: "XP Boost+", icon: "art:xp-potion" },
  { name: "출석 XP Boost+", icon: "art:attend-potion" },
  { name: "MUSIC 4", icon: "art:music-ticket" },
  { name: "슬로우 모드 : 해제", icon: "art:slowmode-off" },
];

// 등록 본문 — 관리자 아이템 등록 API(/api/admin/items POST)와 같은 모양. 서버는 normalizeItemPayload · normalizeEffects 로 다시 정리한다
export const presetPayload = (p) => ({
  name: p.name,
  description: "",
  icon: p.icon,
  imageUrl: "",
  color: "",
  type: p.type || "item",
  roleId: "",
  visible: true,
  effects: { chatBuffXp: p.chatBuffXp, voiceBuffXp: p.voiceBuffXp, attendBuffXp: p.attendBuffXp, list: p.effects },
});

// 효과 문구 — 인벤토리 · 관리자 목록과 같은 짧은 문장(itemEffectLines)
export const presetLines = (p) =>
  itemEffectLines({ type: p.type || "item", chatBuffXp: p.chatBuffXp, voiceBuffXp: p.voiceBuffXp, attendBuffXp: p.attendBuffXp, effects: normalizeEffects(p.effects) });
