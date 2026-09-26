// ── 채널/카테고리 XP 정책 캐시 (대시보드 변경을 1분 주기로 반영) ──
import { ChannelConfig } from "./db.js";

const REFRESH_MS = 60 * 1000;
let byChannelId = new Map();

export async function refreshChannelConfigs() {
  try {
    const rows = await ChannelConfig.find().lean();
    byChannelId = new Map(rows.map((c) => [c.channelId, c]));
  } catch (e) {
    console.error("채널 설정 갱신 오류:", e.message);
  }
}

export function startChannelConfigLoop() {
  setInterval(refreshChannelConfigs, REFRESH_MS);
}

// 채널 자신 + 상위 카테고리 설정을 합산한 정책
// (하나라도 지급 제외면 제외, Boost는 합산)
// 스레드 · 포럼 글은 parentId 가 상위 채널이라 그 카테고리(parent.parentId)까지 본다
export function getChannelPolicy(channel) {
  const ids = [...new Set([channel.id, channel.parentId, channel.parent?.parentId].filter(Boolean))];
  let excluded = false;
  let boostXp = 0;
  for (const id of ids) {
    const c = byChannelId.get(id);
    if (!c) continue;
    if (c.excluded) excluded = true;
    boostXp += c.boostXp || 0;
  }
  return { excluded, boostXp };
}
