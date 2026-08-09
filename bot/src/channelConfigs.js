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
// (둘 중 하나라도 지급 제외면 제외, Boost는 합산)
export function getChannelPolicy(channel) {
  const own = byChannelId.get(channel.id);
  const parent = channel.parentId ? byChannelId.get(channel.parentId) : null;

  return {
    excluded: !!(own?.excluded || parent?.excluded),
    boostXp: (own?.boostXp || 0) + (parent?.boostXp || 0),
  };
}
