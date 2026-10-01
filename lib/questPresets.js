// 📌 추천 퀘스트 — 관리 화면(/admin/bot 콘텐츠 › 퀘스트)의 "추천 퀘스트" 창에서 골라 한 번에 등록하는 목록 (2026-10-01 사용자: "퀘스트 좀 다양하게 추가해줘").
//    · 목표 · 보상은 임시 값 — 경제 기준(1 빙옥 = 10,000 XP · 음성 5분 2,000 XP · 채팅 50~500 XP · 출석 10,000 XP)에 맞춰
//      일일 2,000~5,000 XP < 주간 10,000~20,000 XP < 월간 50,000~100,000 XP. 빙옥은 주간 1 · 월간 3~5 만(귀하게)
//    · 기존 3개(오늘의 채팅 일일 채팅 횟수 · 주간 정수기 주간 음성 횟수 · 월간 이글루인 월간 전체 XP)와 이름 · 조건(대상 + 세는 방식 + 주기)이 겹치지 않는다
//    · 조건은 lib/questKinds.js normalizeQuestDoc 을 그대로 통과하는 값만 둔다
//    · 등록은 app/api/admin/quests/presets — 이름이 같은 퀘스트가 이미 있으면 건너뛴다(이름이 곧 키)
//    서버(route.js)와 화면 양쪽에서 import 할 수 있게 DB · React 의존이 없어야 한다.

import { questCondLabel, normalizeQuestDoc } from "./questKinds";

const NIGHT = { hourFrom: 22, hourTo: 2 };

// key: 목록 키(화면 선택 · 요청 본문)
const LIST = [
  // ── 일일 ──
  { key: "chatter", period: "daily", name: "수다쟁이", desc: "채팅으로 5,000 XP", reason: "chat", metric: "xp", target: 5000, rewardXp: 3000 },
  { key: "night-owl", period: "daily", name: "올빼미 순찰", desc: "밤 10시~새벽 2시 채팅 10번", reason: "chat", metric: "count", target: 10, ...NIGHT, rewardXp: 3000 },
  { key: "morning-call", period: "daily", name: "모닝콜", desc: "아침 6~10시 음성 30분", reason: "voice", metric: "minute", target: 30, hourFrom: 6, hourTo: 10, rewardXp: 3000 },
  { key: "voice-marathon", period: "daily", name: "수다 마라톤", desc: "오늘 음성 2시간", reason: "voice", metric: "minute", target: 120, rewardXp: 5000 },
  { key: "busy-penguin", period: "daily", name: "부지런한 펭귄", desc: "오늘 XP 40번 받기", reason: "any", metric: "count", target: 40, rewardXp: 3000 },
  { key: "lucky-proc", period: "daily", name: "행운 발동", desc: "아이템 효과 3번 터뜨리기", reason: "effect", metric: "count", target: 3, rewardXp: 2000 },
  { key: "three-days", period: "daily", name: "작심삼일 탈출", desc: "연속 출석 4일째", reason: "streak", metric: "day", target: 4, rewardXp: 3000 },
  // ── 주간 ──
  { key: "shopping", period: "weekly", name: "쇼핑 한 번", desc: "ARCTIC에서 하나 사기", reason: "shop", metric: "count", target: 1, rewardXp: 10000, rewardPoint: 1 },
  { key: "forge", period: "weekly", name: "대장간 방문", desc: "강화 1번", reason: "enhance", metric: "count", target: 1, rewardXp: 10000 },
  { key: "pass-step", period: "weekly", name: "패스 한 칸", desc: "시즌 패스 보상 받기", reason: "pass", metric: "count", target: 1, rewardXp: 10000 },
  { key: "workweek", period: "weekly", name: "주 5일 출근", desc: "이번 주 5일 출석", reason: "attend", metric: "day", target: 5, rewardXp: 20000, rewardPoint: 1 },
  { key: "daily-word", period: "weekly", name: "꾸준한 한마디", desc: "이번 주 6일 채팅", reason: "chat", metric: "day", target: 6, rewardXp: 15000 },
  { key: "night-radio", period: "weekly", name: "심야 라디오", desc: "밤 10시~새벽 2시 음성 3시간", reason: "voice", metric: "minute", target: 180, ...NIGHT, rewardXp: 20000 },
  // ── 월간 ──
  { key: "iron-penguin", period: "monthly", name: "철인 펭귄", desc: "연속 출석 14일", reason: "streak", metric: "day", target: 14, rewardXp: 80000, rewardPoint: 3 },
  { key: "regular", period: "monthly", name: "단골 손님", desc: "이번 달 ARCTIC 3건", reason: "shop", metric: "count", target: 3, rewardXp: 50000, rewardPoint: 3 },
  { key: "mic-master", period: "monthly", name: "마이크 장인", desc: "이번 달 음성 25시간", reason: "voice", metric: "minute", target: 1500, rewardXp: 100000, rewardPoint: 5 },
  { key: "pass-sprint", period: "monthly", name: "패스 질주", desc: "시즌 패스 보상 4개", reason: "pass", metric: "count", target: 4, rewardXp: 60000, rewardPoint: 3 },
];

export const QUEST_PRESETS = LIST.map((p) => ({ rewardPoint: 0, ...p }));

// 등록 본문 — 관리자 퀘스트 등록(app/api/daily-quest POST)과 같은 정리를 거친 저장 모양. order 는 등록하는 쪽이 채운다
export const questPresetDoc = (p) => normalizeQuestDoc({ ...p, enabled: true });

// 창에 보이는 한 줄 — "22~2시 채팅 10회 · +3,000 XP · +1 빙옥"
export function questPresetLine(p) {
  const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("ko-KR");
  return [
    questCondLabel(p),
    p.rewardXp > 0 ? `+${fmt(p.rewardXp)} XP` : "",
    p.rewardPoint > 0 ? `+${fmt(p.rewardPoint)} 빙옥` : "",
  ].filter(Boolean).join(" · ");
}
