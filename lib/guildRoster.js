// 📌 길드 역할 · 멤버 명단 — 디스코드 REST(봇 토큰)로 서버 역할 전부와 멤버 전원을 읽는다. 읽기만 한다(역할을 바꾸지 않는다).
//    관리자 '역할 이전'(app/api/admin/role-migration)이 역할마다 보유 인원 · 보유자 목록을 셀 때 쓴다.
//    · 멤버는 GET /guilds/{길드}/members?limit=1000 을 after 로 끝까지 넘겨 모은다(봇 앱에 Server Members Intent 가 켜져 있어야 한다).
//    · 결과는 메모리에 짧게 둔다 — 미리보기 · 실행이 같은 명단을 보게(maxAgeMs 안이면 다시 묻지 않는다). 동시에 여러 번 부르면 요청 하나를 같이 기다린다.
//    · 429 는 retry_after 만큼 기다렸다 다시(최대 5번), 5xx · 시간 초과는 두 번까지 다시. 그래도 안 되면 오류를 던진다(받아 둔 옛 명단으로 대신하지 않는다 — 인원이 틀리면 안 되는 도구라).
//    서버리스는 인스턴스마다 캐시가 따로다 — 캐시는 속도용일 뿐, 맞는지는 매번 디스코드 기준.
const API = "https://discord.com/api/v10";
// 요청 하나(본문까지)의 한도 — 멤버 1,000명 한 쪽이 수백 KB 다. 보통 1~2초지만 느린 개발 서버에선 본문만 17초가 걸린 적이 있어 넉넉히
const TIMEOUT_MS = 30_000;
const MAX_PAGES = 100; // 멤버 10만 명까지 — 그 이상은 이 도구의 범위 밖
const DEFAULT_MAX_AGE = 3 * 60 * 1000;

let cached = null; // { at, roles, members, botId, botTop }
let inflight = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, token) {
  let retries5xx = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    let res;
    try {
      res = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bot ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      if (retries5xx++ < 2) { await sleep(800); continue; }
      throw new Error("디스코드에 연결하지 못했습니다.");
    }
    if (res.status === 429) {
      const body = await res.json().catch(() => null);
      const sec = Number(body?.retry_after) || Number(res.headers.get("retry-after")) || 1;
      if (attempt >= 5) throw new Error("디스코드 요청 제한에 걸렸습니다. 잠시 후 다시 시도해 주세요.");
      await sleep(Math.min(10, Math.max(0.2, sec)) * 1000 + 100);
      continue;
    }
    if (res.status >= 500) {
      if (retries5xx++ < 2) { await sleep(800); continue; }
      throw new Error(`디스코드 서버 오류(${res.status})`);
    }
    if (!res.ok) throw new Error(`디스코드 조회 실패(${res.status})`);
    // 📌 본문 받기도 시간 제한 안이다 — 멤버 1,000명 쪽이 늦게 오다 끊기면(TimeoutError) 연결 실패처럼 다시 묻는다
    try {
      return await res.json();
    } catch {
      if (retries5xx++ < 2) { await sleep(800); continue; }
      throw new Error("디스코드 응답을 끝까지 받지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }
  throw new Error("디스코드 조회 실패");
}

async function load() {
  const guildId = process.env.DISCORD_GUILD_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !token) throw new Error("봇 토큰 · 길드 ID 가 설정되지 않았습니다.");

  const [rawRoles, me] = await Promise.all([call(`/guilds/${guildId}/roles`, token), call(`/users/@me`, token)]);
  const roles = (Array.isArray(rawRoles) ? rawRoles : []).map((r) => ({
    id: String(r.id),
    name: String(r.name || ""),
    color: Number(r.color) || 0,
    position: Number(r.position) || 0,
    managed: !!r.managed,
    permissions: String(r.permissions || "0"),
  }));

  // 봇이 뗄 수 있는 선 — 봇이 가진 역할 중 가장 높은 자리. 그보다 아래(작은 position)만 뗄 수 있다
  const botMember = await call(`/guilds/${guildId}/members/${me.id}`, token);
  const posOf = new Map(roles.map((r) => [r.id, r.position]));
  const botTop = Math.max(0, ...(Array.isArray(botMember?.roles) ? botMember.roles : []).map((id) => posOf.get(String(id)) || 0));

  const members = [];
  let after = "0";
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await call(`/guilds/${guildId}/members?limit=1000&after=${after}`, token);
    const list = Array.isArray(rows) ? rows : [];
    for (const m of list) {
      const u = m?.user || {};
      members.push({
        id: String(u.id),
        name: String(m.nick || u.global_name || u.username || ""),
        bot: !!u.bot,
        roles: Array.isArray(m.roles) ? m.roles.map(String) : [],
      });
    }
    if (list.length < 1000) break;
    after = String(list[list.length - 1]?.user?.id || "");
    if (!after) break;
  }

  return { at: Date.now(), guildId, roles, members, botId: String(me.id), botTop };
}

// 반환: { at, guildId, roles: [{ id, name, color, position, managed, permissions }], members: [{ id, name, bot, roles }], botId, botTop }
//    maxAgeMs: 받아 둔 명단이 이보다 새것이면 그대로 쓴다. fresh: 새로 받는다(단 10초 안에 받은 것은 그대로 — 새로고침 연타로 디스코드를 두드리지 않게)
export async function getGuildRoster({ maxAgeMs = DEFAULT_MAX_AGE, fresh = false } = {}) {
  const age = cached ? Date.now() - cached.at : Infinity;
  if (cached && age < (fresh ? 10_000 : maxAgeMs)) return cached;
  if (inflight) return inflight;
  inflight = load()
    .then((r) => { cached = r; return r; })
    .finally(() => { inflight = null; });
  return inflight;
}
