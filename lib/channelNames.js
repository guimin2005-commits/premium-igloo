// 📌 디스코드 채널 이름 — 효과 문장에서 채널 하나만 지정한 효과를 "#채널이름" 으로 적을 때 쓴다(인벤토리 · 상품 상세).
//    길드 채널 목록을 필요할 때만 읽고 10분 인메모리 캐시(실패는 1분 — 그동안은 이름 없이 "지정 채널 1곳" 으로 적힌다).
//    동시에 여러 번 불러도 요청은 하나만 나간다.
let cache = { at: 0, ttl: 0, names: new Map() };
let inflight = null;

export async function channelNames() {
  const now = Date.now();
  if (now - cache.at < cache.ttl) return cache.names;
  if (inflight) return inflight;
  inflight = (async () => {
    const GUILD_ID = process.env.DISCORD_GUILD_ID;
    const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
    let names = new Map();
    let ttl = 60 * 1000;
    if (GUILD_ID && BOT_TOKEN) {
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, {
          headers: { Authorization: `Bot ${BOT_TOKEN}` },
          cache: "no-store",
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const list = await res.json();
          names = new Map((Array.isArray(list) ? list : []).map((c) => [String(c.id), String(c.name || "")]));
          ttl = 10 * 60 * 1000;
        }
      } catch {}
    }
    // 실패했어도 받아 둔 이름이 있으면 그대로 쓴다
    if (!names.size && cache.names.size) names = cache.names;
    cache = { at: Date.now(), ttl, names };
    return names;
  })().finally(() => { inflight = null; });
  return inflight;
}

// 효과 목록 중 채널 하나만 지정한 게 있을 때만 이름을 읽는다 — 없으면 빈 Map
export async function channelNamesFor(effectLists) {
  const need = (effectLists || []).some((list) => (Array.isArray(list) ? list : []).some((e) => e?.channelIds?.length === 1));
  return need ? channelNames() : new Map();
}
