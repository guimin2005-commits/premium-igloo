// 📌 디스코드 길드 멤버 조회 — 로그인 세션(authOptions jwt) · 인벤토리(my-items) · 내 XP(me) 가 같이 쓴다.
//    예전엔 세 곳이 따로 디스코드에 물었다. 레벨 화면은 API 다섯 개를 한꺼번에 부르는데 그때마다 세션 확인까지 겹쳐
//    같은 멤버 조회가 한꺼번에 몰렸고, 디스코드가 429(요청 제한)로 막으면 역할 목록이 null 이 되어
//    역할로 가진 아이템(레벨 보상 · 역할 아이템)이 인벤토리에서 빠졌다가 새로고침하면 돌아왔다.
//    · 사람마다 60초 캐시. 같은 사람을 동시에 여러 번 물으면 요청 하나를 같이 기다린다.
//    · 404(서버 미입장)는 "absent".
//    · 그 밖의 실패(429 · 5xx · 시간 초과 · 네트워크)는 마지막으로 성공한 값(30분 이내)을 쓴다. 그것도 없으면 "unknown".
//    · 429 를 받으면 retry_after 동안은 디스코드에 묻지 않는다.
const TTL = 60 * 1000;
const STALE_MAX = 30 * 60 * 1000;
const TIMEOUT_MS = 4000;
const MAX_USERS = 5000;

const known = new Map(); // userId → { at, status: "ok" | "absent", member }
const inflight = new Map(); // userId → Promise
let blockedUntil = 0;

function remember(userId, entry) {
  known.delete(userId); // 다시 넣어 맨 뒤로 — 넘치면 오래된 것부터 지운다
  known.set(userId, { ...entry, at: Date.now() });
  if (known.size > MAX_USERS) known.delete(known.keys().next().value);
}
// at: 그 값을 디스코드에서 받은 시각. stale: 방금 조회가 실패해 예전 값(30분 이내)을 대신 준 것
const view = (e, stale = false) => ({ ...(e.status === "ok" ? { status: "ok", member: e.member } : { status: "absent" }), at: e.at, stale });

// 반환: { status: "ok", member, at, stale } | { status: "absent", at, stale } (서버에 없음) | { status: "unknown" } (확인 실패 · 받아 둔 값 없음)
//    stale 이면 로그인 판정(authOptions)은 믿지 않고 "이전 상태 유지 · 곧 재확인"으로 간다 — 인벤토리 · 순위표는 그대로 쓴다
//    fresh: 캐시를 건너뛰고 새로 묻는다(로그인 직후 — 방금 서버에 들어온 사람을 1분 전 "없음"으로 보지 않게)
export async function fetchGuildMember(userId, { fresh = false } = {}) {
  if (!userId) return { status: "unknown" };
  const hit = known.get(userId);
  if (!fresh && hit && Date.now() - hit.at < TTL) return view(hit);
  const fallback = () => (hit && Date.now() - hit.at < STALE_MAX ? view(hit, true) : { status: "unknown" });
  if (Date.now() < blockedUntil) return fallback();
  if (inflight.has(userId)) return inflight.get(userId);

  const GUILD_ID = process.env.DISCORD_GUILD_ID;
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (!GUILD_ID || !BOT_TOKEN) return { status: "unknown" };

  const job = (async () => {
    try {
      const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`, {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 404) {
        remember(userId, { status: "absent", member: null });
        return { status: "absent", at: Date.now(), stale: false };
      }
      if (res.status === 429) {
        const body = await res.json().catch(() => null);
        const sec = Number(body?.retry_after) || Number(res.headers.get("retry-after")) || 1;
        blockedUntil = Date.now() + Math.min(60, Math.max(1, sec)) * 1000;
        console.warn(`디스코드 멤버 조회 제한(429) — ${Math.ceil(sec)}초 동안 받아 둔 값을 씁니다`);
        return fallback();
      }
      if (!res.ok) return fallback();
      const member = await res.json();
      remember(userId, { status: "ok", member });
      return { status: "ok", member, at: Date.now(), stale: false };
    } catch {
      return fallback();
    } finally {
      inflight.delete(userId);
    }
  })();
  inflight.set(userId, job);
  return job;
}

// 역할 id 목록 — 서버에 없으면 [], 확인하지 못했으면 null("알 수 없음")
export async function fetchMemberRoles(userId) {
  return (await fetchMemberRoleInfo(userId)).roles;
}

// 역할 목록 + 받은 시각 · 예전 값 여부 — 인벤토리가 "역할 없음(확인 필요)"을 가를 때 쓴다
//    (역할을 받은 시각보다 먼저 찍힌 목록이거나 예전 값이면 없다고 단정하지 않는다)
export async function fetchMemberRoleInfo(userId) {
  const r = await fetchGuildMember(userId);
  const roles = r.status === "ok" ? (Array.isArray(r.member?.roles) ? r.member.roles : []) : r.status === "absent" ? [] : null;
  return { roles, at: r.at || 0, stale: !!r.stale };
}
