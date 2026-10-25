// 📌 디스코드 서버 사람 수(봇 제외) — 순위의 전체 인원(lib/rankBoards.js rankTotalOf)에 쓴다. 봇 쪽은 bot/src/serverMembers.js(멤버 캐시로 센다)
//    2026-10-25 운영자 "서버 모든인원 포함해서 순위 계산해" — 예전 분모는 XP 기록(UserXp) 수라 서버에 있어도 기록이 없는 사람이 빠졌다.
//    멤버 목록을 봇 토큰으로 1000명씩 읽어 사람만 센다(10분 기억 · 같이 들어온 요청은 한 번만 읽는다).
//    📌 내 정보 · 랭킹 응답이 이 값을 기다리므로 디스코드가 느려도 붙잡히지 않게(lib/discordMember.js 와 같은 방식):
//       한 번에 4초까지만 기다리고, 실패하면(429 는 retry_after 만큼 · 그 밖은 1분) 다시 묻지 않고 지난 값을 쓴다.
//       지난 값도 없으면 0 — 부르는 쪽이 순위에 오른 수를 쓴다. 대략 인원(approximate_member_count)은 봇이 섞여 쓰지 않는다
//    📌 2026-10-25 같은 목록에서 부스터(lib/booster.js isBoosterMember — 부스터 역할 또는 premium_since)도 모은다(serverBoosterIds) —
//       랭킹 이름 옆 배지 · 시상대 테두리(lib/itemPerks.js badgesOfUsers · framesOfUsers)가 부스터 혜택 아이템(보유 (C))을 셀 수 있게. 따로 묻는 요청은 없다
import { isBoosterMember } from "./booster.js";

const TTL = 10 * 60 * 1000;
const TIMEOUT_MS = 4000;
const FAIL_WAIT = 60 * 1000;
let cache = { at: 0, count: 0, boosters: new Set() };
let blockedUntil = 0;
let loading = null;

async function readCount() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guild = process.env.DISCORD_GUILD_ID;
  if (!token || !guild) return { humans: 0, boosters: new Set() };
  const headers = { Authorization: `Bot ${token}` };
  let after = "0";
  let humans = 0;
  const boosters = new Set();
  for (let page = 0; page < 50; page++) {
    const r = await fetch(`https://discord.com/api/v10/guilds/${guild}/members?limit=1000&after=${after}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (r.status === 429) {
      const body = await r.json().catch(() => null);
      const wait = Math.max(1, Number(body?.retry_after) || Number(r.headers.get("retry-after")) || 60);
      throw Object.assign(new Error("members 429"), { waitMs: wait * 1000 });
    }
    if (!r.ok) throw new Error(`members ${r.status}`);
    const list = await r.json();
    for (const m of list) {
      if (m?.user?.bot) continue;
      humans++;
      if (m?.user?.id && isBoosterMember(m)) boosters.add(String(m.user.id));
    }
    if (list.length < 1000) return { humans, boosters };
    after = list[list.length - 1].user.id;
  }
  return { humans, boosters };
}

// 목록을 (다시) 읽는다 — 10분 안이면 기억한 값, 막힌 동안은 지난 값. 같이 들어온 요청은 한 번만 읽는다
function load() {
  const now = Date.now();
  if (cache.count > 0 && now - cache.at < TTL) return Promise.resolve(cache);
  if (now < blockedUntil) return Promise.resolve(cache);
  if (!loading) {
    loading = readCount()
      .then(({ humans, boosters }) => {
        if (humans > 0) cache = { at: Date.now(), count: humans, boosters };
        else blockedUntil = Date.now() + FAIL_WAIT;
        return cache;
      })
      .catch((e) => {
        blockedUntil = Date.now() + Math.max(FAIL_WAIT, Number(e?.waitMs) || 0);
        return cache;
      })
      .finally(() => { loading = null; });
  }
  return loading;
}

export async function serverMemberCount() {
  return (await load()).count;
}

// 📌 지금 부스팅 중인 사람(유저 ID Set) — 모르면(읽기 실패 · 토큰 없음) 지난 값, 처음부터 모르면 빈 Set
export async function serverBoosterIds() {
  return (await load()).boosters;
}
