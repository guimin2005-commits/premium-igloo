// 📌 디스코드 길드 멤버의 역할 목록 — 인벤토리(my-items)·내 XP(me) 가 같이 쓴다.
//    60초 인메모리 캐시. 404(서버 미입장)는 [] , 그 외 실패는 null("알 수 없음") 로 돌려준다.
let cache = { at: 0, byUser: new Map() };
const TTL = 60 * 1000;

export async function fetchMemberRoles(userId) {
  const now = Date.now();
  if (now - cache.at > TTL) cache = { at: now, byUser: new Map() };
  if (cache.byUser.has(userId)) return cache.byUser.get(userId);

  const GUILD_ID = process.env.DISCORD_GUILD_ID;
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (!GUILD_ID || !BOT_TOKEN || !userId) return null;

  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
      cache: "no-store",
    });
    if (res.status === 404) return [];
    if (!res.ok) return null;
    const data = await res.json();
    const roles = Array.isArray(data.roles) ? data.roles : [];
    cache.byUser.set(userId, roles);
    return roles;
  } catch {
    return null;
  }
}
