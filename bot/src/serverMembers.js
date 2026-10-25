// 📌 서버 사람 수(봇 제외) — 순위의 전체 인원(rankBoards.js rankTotalOf)에 쓴다. 사이트는 lib/serverMembers.js(멤버 목록을 REST 로 센다)
//    2026-10-25 운영자 "서버 모든인원 포함해서 순위 계산해". 멤버를 다 받아 둔 뒤(켤 때 부스터 보상이 guild.members.fetch)면 캐시에서 사람만,
//    덜 받았으면(켠 직후) 서버 인원에서 캐시에 보이는 봇을 뺀 값
export function serverHumanCount(guild) {
  if (!guild) return 0;
  const cache = guild.members.cache;
  if (cache.size >= (guild.memberCount || 0)) return cache.filter((m) => !m.user.bot).size;
  return Math.max(0, (guild.memberCount || 0) - cache.filter((m) => m.user.bot).size);
}
