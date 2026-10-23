// ── 방구석 심야 괴담회 — 스테이지 채널 시청 기록 · 완청 추첨권 자동 지급 (2026-10-23) ──────────────────
//    📌 약속 문서 .claude/mockups/goedam/SPEC.md 「봇」 절 그대로:
//       · 60초마다 설정(Goedam, key "goedam-2026")을 다시 읽는다. 꺼져 있거나(enabled false) 채널(channelId)이 비면 기록 · 지급하지 않는다 —
//         운영진 미리보기와 상관없이 켜져 있을 때만
//       · voiceStateUpdate — 그 채널에 들어오면 구간을 열고, 나가거나 다른 채널로 옮기면 닫으며 그동안을 회차 창과 겹친 만큼만 센다. 봇 계정은 뺀다.
//         스테이지 채널도 voiceStateUpdate 가 온다(channelId) — 청중(suppressed)도 채널 안에 있으면 센다. 마이크 · 헤드셋 · 화면 · 발언자 여부는 보지 않는다
//       · 20초마다 열린 구간을 끊어(마지막으로 끊은 시각 ~ 지금) 회차 창 [startsAt, endsAt] 과 겹친 초를 GoedamWatch.seconds 에 $inc(upsert, userName 갱신)
//       · 회차 끝 + 60초가 지나면 완청(seconds ≥ ratio × 회차 길이) · grantedAt null 인 줄을 { grantedAt: null } 조건부로 세운 뒤 추첨권 Purchase N건(1장 = 1건)을 넣는다.
//         회차 끝 + 6시간이 지나면 그 회차는 더 보지 않는다. 추첨권 아이템(ticketItemId)이 비었거나 실사이트에 없으면 지급을 미룬다(다음 주기에 다시)
//       · DM 없음(운영자가 원하면 나중에)
//    📌 시작할 때(설정을 처음 읽은 뒤) 채널에 이미 있는 사람은 지금부터 구간을 연다. 봇이 꺼져 있던 동안은 못 센다(features/voiceTime.js 와 같다)
//    📌 겹침 계산(overlapMs · splitByScreenings) · 완청 판정(isFullWatch) · 설정 정리(normalizeGoedam)는 순수 함수로 내보낸다 — node 로 바로 확인할 수 있게
//    ⚠️ GoedamWatch 는 autoIndex 가 꺼져 있다(사이트 · 테스트 사이트가 같은 DB) — 첫 쓰기 직전에 createIndexes() 를 한 번(ensureWatchIndexes)
import { Events } from "discord.js";
import { Goedam, GoedamWatch, Purchase, Item } from "../db.js";
import { config } from "../config.js";
import { recordBotError } from "./heartbeat.js";

// 📌 세 갈래(사이트 · 봇 · 화면)가 같은 글자를 쓴다 — 약속 문서 「키 · 표식」
export const GOEDAM_KEY = "goedam-2026";
export const GOEDAM_TICKET_ITEM_ID = "goedam-ticket"; // 추첨권 지급 Purchase.itemId
const DEFAULT_TITLE = "방구석 심야 괴담회";
const DEFAULT_TICKET_NAME = "할로윈 추첨권";

const REFRESH_MS = 60 * 1000;
const FLUSH_MS = 20 * 1000;
// 한 구간 상한 — 20초마다 끊으므로 보통 20초 남짓. 프로세스가 멈췄다 깨어나 긴 공백이 한 번에 들어오지 않게(voiceTime.js 와 같은 값)
const SEG_MAX_MS = FLUSH_MS * 3;
const GRANT_DELAY_MS = 60 * 1000; // 회차 끝 + 60초부터 지급 — 마지막 20초 구간이 먼저 써지게
const GRANT_STOP_MS = 6 * 60 * 60 * 1000; // 회차 끝 + 6시간 뒤로는 그 회차를 보지 않는다
// 📌 못다 준 줄 살피기 — 표시(grantedAt)를 세운 뒤 추첨권을 넣다가 꺼지면(배포 SIGKILL) 표시만 남는다.
//    5분마다 그런 줄을 찾아 orderId 로 센 장 수가 granted 보다 모자라면 모자란 만큼 넣는다. 지금 넣는 중일 수 있는 줄(1분 안)은 건너뛴다
const AUDIT_MS = 5 * 60 * 1000;
const AUDIT_GRACE_MS = 60 * 1000;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

let cfg = null; // normalizeGoedam 결과 — 아직 못 읽었거나 문서가 없으면 null
let guildRef = null;
let started = false;
let refreshing = false;
let busy = false; // 쓰기 · 지급이 도는 중 — 구간 끊기(sweep)는 그와 상관없이 20초마다
// userId → { since: 마지막으로 끊은 ms, name: 디스코드 username }
const sessions = new Map();
// "<userId>|<sid>" → { userId, sid, name, ms: 아직 GoedamWatch 에 안 쓴 시간(반올림 나머지는 이월) }
const pending = new Map();
const auditAt = new Map(); // sid → 마지막으로 못다 준 줄을 살핀 ms
const warned = new Set(); // 같은 경고를 주기마다 찍지 않게

// ── 순수 함수 ─────────────────────────────────

const numOr = (v, d) => {
  if (v == null || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, numOr(v, d)));
const msOf = (d) => {
  if (d == null || d === "") return NaN;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : NaN;
};

// 📌 설정 문서 → 봇이 쓰는 모양(문서가 없으면 null). 사이트 lib/goedam.js normalizeGoedamConfig 와 같은 범위로 자른다(장 수 1~10 · 비율 0.1~1).
//    시각이 틀렸거나(끝 ≤ 시작) sid 가 비거나 겹치는 회차는 뺀다 — 봇은 sid 를 새로 매기지 않는다(사이트가 저장 때 매긴다)
export function normalizeGoedam(doc) {
  if (!doc) return null;
  const seen = new Set();
  const screenings = [];
  for (const s of Array.isArray(doc.screenings) ? doc.screenings : []) {
    const sid = String(s?.sid || "").trim();
    const startsAt = msOf(s?.startsAt);
    const endsAt = msOf(s?.endsAt);
    if (!sid || seen.has(sid) || !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || !(endsAt > startsAt)) continue;
    seen.add(sid);
    screenings.push({
      sid,
      title: String(s?.title || "").trim(),
      startsAt,
      endsAt,
      tickets: Math.round(clamp(s?.tickets, 1, 10, 1)),
      // 0.01 단위로 — 사이트 lib/goedamRules.js ratioOf 와 같게(손으로 고친 0.333 같은 값도 화면 · 명단의 완청 판정과 갈리지 않게)
      ratio: Math.round(clamp(s?.ratio, 0.1, 1, 0.8) * 100) / 100,
    });
  }
  return {
    enabled: doc.enabled === true,
    title: String(doc.title || "").trim() || DEFAULT_TITLE,
    channelId: String(doc.channelId || "").trim(),
    ticketItemId: String(doc.ticketItemId || "").trim(),
    ticketItemName: String(doc.ticketItemName || "").trim(),
    screenings,
  };
}

// 구간 [from, to) 와 회차 창 [startsAt, endsAt) 이 겹친 ms — 안 겹치면 0. 시각은 ms(숫자 · Date 둘 다 된다)
export function overlapMs(from, to, startsAt, endsAt) {
  const a = Math.max(Number(from), Number(startsAt));
  const b = Math.min(Number(to), Number(endsAt));
  return b > a ? b - a : 0;
}

// 구간 하나를 회차마다 나눈다 — [{ sid, ms }] (겹친 회차만). 회차 창이 서로 겹쳐도 회차마다 따로 센다
export function splitByScreenings(from, to, screenings) {
  const out = [];
  if (!(Number(to) > Number(from))) return out;
  for (const s of screenings || []) {
    const ms = overlapMs(from, to, s.startsAt, s.endsAt);
    if (ms > 0) out.push({ sid: s.sid, ms });
  }
  return out;
}

// 완청 기준(초) — ratio × 회차 길이. 판정은 seconds ≥ 기준(소수 오차만 봐준다)
export const needSeconds = (s) => (Number(s.ratio) * (Number(s.endsAt) - Number(s.startsAt))) / 1000;
export const isFullWatch = (seconds, s) => Number(seconds) + 1e-6 >= needSeconds(s);

// 추첨권 주문 묶음 — 회차 · 사람마다 하나(1장 = 1건, 같은 orderId 로 ×N). 사이트 손 지급 · 인벤토리 묶음과 같은 글자
export const ticketOrderId = (sid, userId) => `goedam:${sid}:${userId}`;

// ── 구간 ─────────────────────────────────────

const nameOf = (member) => member?.user?.username || "";
// 기록하는 채널 — 꺼져 있거나 채널이 비면 ""(기록 안 함)
const activeChannel = () => (cfg?.enabled && cfg.channelId ? cfg.channelId : "");

function warnOnce(key, msg) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}

// 닫힌 구간 하나를 회차마다 겹친 만큼 pending 에 넣는다
function addSpan(userId, name, from, to) {
  if (!cfg) return;
  const start = Math.max(from, to - SEG_MAX_MS);
  for (const { sid, ms } of splitByScreenings(start, to, cfg.screenings)) {
    const key = `${userId}|${sid}`;
    let p = pending.get(key);
    if (!p) pending.set(key, (p = { userId, sid, name: "", ms: 0 }));
    p.ms += ms;
    if (name) p.name = name;
  }
}

// 열린 구간을 지금까지 끊어 넣고 그 자리에서 이어 간다
function cut(userId, now) {
  const s = sessions.get(userId);
  if (!s) return;
  addSpan(userId, s.name, s.since, now);
  s.since = now;
}
function close(userId, now) {
  cut(userId, now);
  sessions.delete(userId);
}
function open(userId, member, now) {
  if (sessions.has(userId)) return; // 같은 들어옴이 두 번 와도 처음 시각 그대로
  sessions.set(userId, { since: now, name: nameOf(member) });
}

// 지금 채널에 있는 사람(봇 제외)부터 센다 — 처음 읽은 때 · 채널이 바뀐 때 · 20초마다(들어옴을 놓친 사람)
function seed(now) {
  const ch = activeChannel();
  if (!ch || !guildRef) return;
  for (const [userId, vs] of guildRef.voiceStates.cache) {
    if (vs.channelId !== ch || vs.member?.user?.bot) continue;
    open(userId, vs.member, now);
  }
}

// 20초마다 — 열린 구간을 모두 끊고 놓친 이벤트를 메운다. 세션은 있는데 채널에 없으면(나감을 놓침) 지난 구간은 버린다(voiceTime.js 와 같다)
function sweep(now) {
  const ch = activeChannel();
  if (!ch) {
    for (const userId of [...sessions.keys()]) close(userId, now);
    return;
  }
  for (const [userId, s] of [...sessions]) {
    const vs = guildRef?.voiceStates.cache.get(userId);
    if (guildRef && vs?.channelId !== ch) {
      sessions.delete(userId);
      continue;
    }
    if (vs?.member) s.name = nameOf(vs.member) || s.name;
    cut(userId, now);
  }
  seed(now);
}

// 새 설정을 건다 — 바뀌기 전 설정(회차 · 채널)으로 지금까지를 먼저 센다. 채널이 바뀌었거나 켜고 꺼지면 구간을 새로 연다
function applyConfig(next) {
  const now = Date.now();
  const before = activeChannel();
  for (const userId of [...sessions.keys()]) cut(userId, now);
  cfg = next;
  const after = activeChannel();
  if (before === after) return;
  sessions.clear();
  if (after) seed(now);
  console.log(after ? `🎬 괴담회 시청 기록 켜짐 — 채널 ${after} (지금 ${sessions.size}명)` : "🎬 괴담회 시청 기록 꺼짐");
}

export async function refreshGoedam() {
  if (refreshing) return;
  refreshing = true;
  try {
    applyConfig(normalizeGoedam(await Goedam.findOne({ key: GOEDAM_KEY }).lean()));
  } catch (e) {
    console.error("괴담회 설정 갱신 오류:", e?.message || e); // 직전 값을 그대로 쓴다
  } finally {
    refreshing = false;
  }
}

// ── 쓰기 ─────────────────────────────────────

let indexJob = null;
const ensureWatchIndexes = () =>
  (indexJob ||= GoedamWatch.createIndexes().catch((e) => {
    indexJob = null;
    throw e;
  }));

// 쌓인 시간을 GoedamWatch 에 더한다 — 초 단위로 반올림해 쓰고 나머지(±0.5초)는 다음 번으로 넘긴다(연이어 머문 사람은 회차 길이가 그대로 맞는다).
//    📌 꺼진 뒤(enabled false)에도 켜져 있던 동안 잰 몫은 마저 쓴다 — 새로 재지는 않는다(sweep 이 구간을 닫았다)
//    📌 쓰기 실패 — 실패한 줄(writeErrors)만 되돌려 다음 번에 다시. 무엇이 들어갔는지 모르면(연결 오류) 전부 되돌린다:
//       응답만 잃은 경우 그만큼 두 번 셀 수 있지만, 덜 세어 완청을 놓치는 쪽보다 낫다(음성 시간과 반대 — 여기는 기준선 판정이라)
async function writePending(now) {
  const batch = [];
  for (const [key, p] of pending) {
    const sec = Math.round(p.ms / 1000);
    if (sec > 0) {
      batch.push({ key, p, sec });
      p.ms -= sec * 1000;
      continue;
    }
    // 더 늘 일이 없는 나머지는 버린다 — 채널에 없거나 회차가 끝났거나 지워졌다(맵이 쌓이지 않게)
    const s = cfg?.screenings.find((x) => x.sid === p.sid);
    if (!sessions.has(p.userId) || !s || now >= s.endsAt) pending.delete(key);
  }
  if (!batch.length) return;
  const at = new Date(now);
  const ops = batch.map(({ p, sec }) => ({
    updateOne: {
      filter: { eventKey: GOEDAM_KEY, sid: p.sid, userId: p.userId },
      update: {
        $inc: { seconds: sec },
        $set: { updatedAt: at, ...(p.name ? { userName: p.name } : {}) },
        $setOnInsert: { grantedAt: null, granted: 0, manual: false },
      },
      upsert: true,
    },
  }));
  try {
    await ensureWatchIndexes();
    await GoedamWatch.bulkWrite(ops, { ordered: false });
  } catch (e) {
    const errs = e?.writeErrors || e?.result?.getWriteErrors?.() || null;
    const failed = Array.isArray(errs) && errs.length ? errs.map((w) => w.index ?? w.err?.index) : batch.map((_, i) => i);
    for (const i of failed) {
      const b = batch[i];
      if (!b) continue;
      b.p.ms += b.sec * 1000;
      pending.set(b.key, b.p);
    }
    throw e;
  }
}

// ── 지급 ─────────────────────────────────────

// 지급할 추첨권 아이템 — { id, name } | null(비었거나 실사이트에 없음 — 지급을 미룬다). 이름은 설정의 스냅샷, 비었으면 아이템 이름
async function ticketItem() {
  const id = cfg?.ticketItemId || "";
  if (!OBJECT_ID_RE.test(id)) {
    warnOnce("ticket:none", "🎟️ 괴담회 추첨권 아이템이 지정되지 않아 지급을 미룹니다 (관리 › 괴담회)");
    return null;
  }
  const it = await Item.findById(id, { name: 1 }).lean();
  if (!it) {
    warnOnce(`ticket:${id}`, `🎟️ 괴담회 추첨권 아이템을 찾을 수 없어 지급을 미룹니다: ${id}`);
    return null;
  }
  return { id, name: cfg.ticketItemName || it.name || DEFAULT_TICKET_NAME };
}

// 추첨권 count 건을 넣는다 — 약속 문서 「키 · 표식」의 모양 그대로(1장 = Purchase 1건, 지급 큐를 거치지 않는 completed · DM 없음)
async function insertTickets(row, s, item, count) {
  if (!(count > 0)) return;
  const at = new Date();
  const doc = {
    userId: row.userId,
    userName: row.userName || "",
    itemId: GOEDAM_TICKET_ITEM_ID,
    itemRef: item.id,
    itemName: item.name,
    itemType: "item",
    roleId: "",
    price: 0,
    payMethod: "xp",
    paidXp: 0,
    paidPoint: 0,
    days: 0,
    status: "completed",
    processedAt: at,
    orderId: ticketOrderId(s.sid, row.userId),
    adminNote: `괴담회 완청 · ${s.title || s.sid}`,
    createdAt: at,
  };
  await Purchase.insertMany(Array.from({ length: count }, () => ({ ...doc })));
}

// 이미 들어간 장 수를 orderId 로 세어 모자란 만큼만 넣는다 — 되돌린 뒤 다시 할 때 · 못다 준 줄을 채울 때 두 번 주지 않게. 돌려주는 값: 넣은 장 수
async function fillTickets(row, s, item, want) {
  const have = await Purchase.countDocuments({ userId: row.userId, orderId: ticketOrderId(s.sid, row.userId) });
  const short = Math.max(0, want - have);
  await insertTickets(row, s, item, short);
  return short;
}

// 못다 준 줄 — 표시(grantedAt)는 있는데 추첨권이 granted 보다 적은 줄(봇 지급만 — 손 지급(manual)은 사이트 몫)
async function auditScreening(s, item, now) {
  const rows = await GoedamWatch.find(
    { eventKey: GOEDAM_KEY, sid: s.sid, grantedAt: { $ne: null, $lte: new Date(now - AUDIT_GRACE_MS) }, manual: { $ne: true }, granted: { $gt: 0 } },
    { userId: 1, userName: 1, granted: 1 }
  ).lean();
  if (!rows.length) return;
  const counts = await Purchase.aggregate([
    { $match: { userId: { $in: rows.map((r) => r.userId) }, orderId: { $in: rows.map((r) => ticketOrderId(s.sid, r.userId)) } } },
    { $group: { _id: "$orderId", n: { $sum: 1 } } },
  ]);
  const have = new Map(counts.map((c) => [c._id, c.n]));
  for (const r of rows) {
    const short = Math.floor(Number(r.granted) || 0) - (have.get(ticketOrderId(s.sid, r.userId)) || 0);
    if (short <= 0) continue;
    await insertTickets(r, s, item, short);
    console.log(`🎟️ 괴담회 추첨권 채움: ${r.userName || r.userId} ← ${item.name} ×${short} (${s.title || s.sid})`);
  }
}

// 회차 하나 지급 — 완청 · 아직 안 받은 줄을 조건부로 세운 뒤(손 지급 · 다른 봇과 겹쳐도 한 번만) 추첨권을 넣는다.
//    넣지 못하면 표시를 되돌려 다음 주기에 다시(이미 들어간 건은 fillTickets 가 세어 모자란 만큼만). 실패하면 이 회차는 이번 주기에 멈춘다
async function grantScreening(s, item, now) {
  const need = needSeconds(s) - 1e-6;
  const rows = await GoedamWatch.find({ eventKey: GOEDAM_KEY, sid: s.sid, grantedAt: null, seconds: { $gte: need } }, { userId: 1, userName: 1, seconds: 1 }).lean();
  for (const r of rows) {
    const at = new Date();
    const claim = await GoedamWatch.updateOne(
      { _id: r._id, grantedAt: null, seconds: { $gte: need } },
      { $set: { grantedAt: at, granted: s.tickets, updatedAt: at } }
    );
    if (!claim.modifiedCount) continue; // 그새 다른 쪽(손 지급 · 다른 봇)이 세웠다
    try {
      const n = await fillTickets(r, s, item, s.tickets);
      console.log(`🎟️ 괴담회 추첨권 지급: ${r.userName || r.userId} ← ${item.name} ×${n} (${s.title || s.sid} · ${Math.floor(r.seconds)}초)`);
    } catch (e) {
      await GoedamWatch.updateOne({ _id: r._id, grantedAt: at, manual: { $ne: true } }, { $set: { grantedAt: null, granted: 0 } }).catch(() => {});
      throw e;
    }
  }
  if (now - (auditAt.get(s.sid) || 0) >= AUDIT_MS) {
    await auditScreening(s, item, now);
    auditAt.set(s.sid, now);
  }
}

// 끝 + 60초 ~ 끝 + 6시간 회차를 지급한다(켜져 있을 때만). 그 회차의 아직 못 쓴 초가 있으면 다 쓴 뒤로 미룬다
async function grantDue(now) {
  if (!cfg?.enabled) return;
  const due = cfg.screenings.filter((s) => now >= s.endsAt + GRANT_DELAY_MS && now < s.endsAt + GRANT_STOP_MS);
  if (!due.length) return;
  const item = await ticketItem();
  if (!item) return;
  warned.clear(); // 아이템이 돌아왔다 — 다음에 또 비면 다시 알린다
  for (const s of due) {
    if ([...pending.values()].some((p) => p.sid === s.sid && Math.round(p.ms / 1000) > 0)) continue;
    try {
      await grantScreening(s, item, now);
    } catch (e) {
      console.error(`🎟️ 괴담회 추첨권 지급 오류 (${s.title || s.sid}):`, e?.message || e);
      recordBotError(e);
    }
  }
}

// ── 주기 ─────────────────────────────────────

function tick() {
  const now = Date.now();
  try {
    sweep(now);
  } catch (e) {
    console.error("괴담회 시청 구간 오류:", e?.message || e);
  }
  if (busy) return; // 앞 쓰기가 아직 돈다 — 구간은 위에서 끊어 두었으니 다음 번에 같이 쓴다
  busy = true;
  (async () => {
    try {
      await writePending(now);
    } catch (e) {
      console.error("괴담회 시청 기록 쓰기 오류:", e?.message || e);
      recordBotError(e);
    }
    await grantDue(now);
  })()
    .catch((e) => console.error("괴담회 지급 주기 오류:", e?.message || e))
    .finally(() => {
      busy = false;
    });
}

// ClientReady 에서 켠다 — 설정을 처음 읽으면 채널에 이미 있는 사람부터 센다(applyConfig)
export function startGoedamWatch(client) {
  if (started) return;
  started = true;
  guildRef = client.guilds.cache.get(config.guildId) || null;

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (newState.guild?.id !== config.guildId) return;
    const ch = activeChannel();
    if (!ch) return;
    const userId = newState.id;
    const member = newState.member || oldState.member;
    if (!userId || member?.user?.bot) return;
    if (!guildRef) guildRef = newState.guild;
    const was = oldState.channelId === ch;
    const is = newState.channelId === ch;
    if (was === is) return; // 그 채널 안에서 마이크 · 화면 · 발언자/청중이 바뀐 것(또는 다른 채널끼리) — 구간은 그대로
    const now = Date.now();
    if (was) close(userId, now); // 나감 · 다른 채널로 옮김
    if (is) open(userId, member, now); // 들어옴(다른 채널에서 옮겨 옴 포함)
  });

  refreshGoedam();
  setInterval(refreshGoedam, REFRESH_MS);
  setInterval(tick, FLUSH_MS);
  console.log(`✅ 괴담회 시청 기록 시작 — 스테이지 채널 머문 시간 ${FLUSH_MS / 1000}초마다 기록 · 회차 끝 + 60초 완청 추첨권 지급 (설정 1분 주기)`);
}
