// ── 음성 시간 · 음성 XP (사람마다 실제 접속 초) ──────────────────
//    📌 2026-10-03 "5분 단위 말고 실제 음성 시간으로" — 들어옴 · 나감 · 옮김 · 마이크/헤드셋 바뀜을 그 자리에서 재고(voiceStateUpdate),
//       20초마다 실제 초를 UserXp.voiceSeconds(랭킹 "음성 시간")에 더한다.
//    📌 2026-10-04 "개인별로 세어야지" · "5분 단위 지급은 똑같고, 다 못 채우고 나가면 그때 지급" — 음성 XP 도 여기서 사람마다 잰다.
//       한 바퀴 = 한 채널에서 쌓은 시간. 5분(voiceIntervalSec)을 채우면 1회분을 주고 다음 바퀴를 시작한다.
//       다 못 채우고 음성에서 나가거나 다른 채널로 옮기면 그때까지 머문 시간만큼 준다(features/voiceXp.js payVoiceCycle).
//       XP 는 구간마다 그때 상태로 계산해 더한다 — 1회분(voiceRate: 기본 · 등급 · 강화 · 부스트 · 아이템 효과) × 음소거 배율 × 구간 초 / 5분.
//       구간은 본인 상태가 바뀔 때 · 같은 채널에 누가 들어오거나 나갈 때 · 20초마다 끊는다 — 인원(음성 파티 · ctx.n)도 구간마다 그때 값.
//       음소거 막기 · 잠수 채널 · 제외 채널처럼 세지 않는 동안은 바퀴가 멈춰 있다(같은 채널에 있는 한 이어 간다).
//       나갔다가 20초 안에 같은 채널로 돌아오면 같은 바퀴로 이어진다(기록 주기 안이라 나감을 따로 보지 않는다 — 받는 양은 같다).
//       한 번 기록할 때 같은 사람에게 닫힌 바퀴가 여럿이면(채널을 자주 옮김) 하나로 합쳐 한 줄로 준다 — 지급 줄이 20초에 한 줄을 넘지 않게.
//    📌 세는 조건은 예전 음성 XP 주기와 같다 — 봇 · 잠수 채널 · 제외 채널(채널 정책) · 음소거 막기(완화 효과 반영) · 음성 XP 정지(voiceXpOff) ·
//       시즌 2 개시 전(VOICE_TIME_START)은 빼고, 레벨 비공개여도 쌓는다(XP 는 grantXp 가 막는다). 지급 XP 가 0 이어도 시간은 센다 — 시간은 시간.
//       설정 · 채널 정책 · 잠수 채널 · 아이템 효과는 이벤트 없이 바뀌므로 기록할 때마다 열린 구간을 끊어 다시 판정한다.
//    📌 진행 중인 바퀴는 기록할 때마다 UserXp.voiceCycle 에 적는다 — 봇이 재시작(배포)돼도 처음 기록할 때 읽어,
//       같은 채널에 그대로 있으면 이어 가고, 그 사이 나갔으면 그때까지 머문 만큼 준다. 꺼져 있던 동안(보통 수십 초)은 못 센다.
//       종료(SIGTERM) 때는 지급하지 않고 닫힌 바퀴까지 voiceCycle.pend 에 적어 둔다 — 지급 도중 끊겨 사라지지 않게(다음 기동 때 준다).
//       Railway 기본 설정은 SIGTERM 뒤 곧바로 SIGKILL 이라(RAILWAY_DEPLOYMENT_DRAINING_SECONDS=0) 마지막 기록 뒤 몇 초는 잃을 수 있다 — 그래서 기록 주기를 20초로 짧게 둔다
import { Events } from "discord.js";
import { UserXp } from "../db.js";
import { kstToday, VOICE_TIME_START } from "../leveling.js";
import { getChannelPolicy } from "../channelConfigs.js";
import { getSettings, getMuteMultiplier } from "../botSettings.js";
import { relieveMute, voiceRate, payVoiceCycle } from "./voiceXp.js";
import { idleMinutes } from "./activity.js";
import { config } from "../config.js";

const FLUSH_MS = 20_000;
// 한 구간 상한 — 기록할 때마다 끊으므로 보통 20초 남짓. 프로세스가 멈췄다 깨어나 긴 공백이 한 번에 들어오지 않게
const SEG_MAX_MS = FLUSH_MS * 3;

// userId → { since: 지금 구간 시작 ms(세지 않는 구간이면 null), member, ch: 채널, n: 구간을 연 때 그 채널 인원(봇 제외 · 본인 포함),
//            mult: 음소거 배율(0 = 세지 않음), mu · df · lv: 마이크 · 헤드셋 · 화면/캠 }
const sessions = new Map();
// userId → { ms: 아직 voiceSeconds 에 안 쓴 시간(1초 미만은 이월), member, pieces: 아직 XP 로 안 바꾼 구간 [{ ms, ch, n, mult, mu, df, lv }] }
const pending = new Map();
// userId → 열린 바퀴 { ch, chName, pc, sec, xp, muS, dfS, lvS, nS: { 인원: 초 }, idle: 그 바퀴 동안 가장 긴 무활동(분), member, dirty }
const cycles = new Map();
const dbCycle = new Set(); // DB(UserXp.voiceCycle)에 바퀴가 적혀 있(을 수 있)는 사람 — 다 주면 지운다
let closing = []; // 닫았지만 아직 못 준 바퀴 [{ userId, member, cycle }] — DB 정리가 실패하면 다음 기록 때 다시
const discard = new Set(); // 주지 않고 버릴 바퀴(음성 XP 정지 · 퇴장 초기화) — DB 에서도 지운다
const gone = new Set(); // 퇴장 초기화로 문서가 지워진 사람 — 지급이 문서를 되살리지 않게(음성에 다시 들어오면 뺀다)
const xpCarry = new Map(); // userId → 지급하고 남은 1 XP 미만 — 짧은 바퀴를 반복해도 반올림으로 늘거나 줄지 않게(서버를 나가 퇴장 초기화될 때만 지운다)
let guildRef = null;
let started = false;
let restored = false;
let flushing = null;

const flagsOf = (vs) => ({
  mu: !!(vs.selfMute || vs.serverMute),
  df: !!(vs.selfDeaf || vs.serverDeaf),
  lv: !!(vs.streaming || vs.selfVideo),
});
const headcount = (channel) => channel?.members?.filter((m) => !m.user.bot).size || 0;

// 이 음성 상태의 음소거 배율 — 0 이면 지금 시간으로 세지 않는다. 예전 음성 XP 주기의 대상 · 음소거 판정과 같은 규칙
function multOf(vs) {
  const member = vs?.member, channel = vs?.channel;
  if (!member || member.user?.bot || !channel) return 0;
  if (kstToday() < VOICE_TIME_START) return 0;
  if (channel.id === vs.guild?.afkChannelId) return 0;
  if (getChannelPolicy(channel).excluded) return 0;
  return Math.max(0, Number(relieveMute(getMuteMultiplier(vs), member, getSettings())) || 0);
}

function entry(userId) {
  let p = pending.get(userId);
  if (!p) pending.set(userId, (p = { ms: 0, member: null, pieces: [] }));
  return p;
}

// 닫힌 구간 하나 — 음성 시간(ms)과 XP 구간(pieces)에 같이 넣는다. 상태가 같은 연이은 구간은 합친다
function addPiece(userId, ms, seg, member) {
  if (!(ms > 0)) return;
  const t = Math.min(ms, SEG_MAX_MS);
  const p = entry(userId);
  p.ms += t;
  if (member) p.member = member;
  const last = p.pieces[p.pieces.length - 1];
  if (last && last.ch === seg.ch && last.n === seg.n && last.mult === seg.mult && last.mu === seg.mu && last.df === seg.df && last.lv === seg.lv) last.ms += t;
  else p.pieces.push({ ms: t, ch: seg.ch, n: seg.n, mult: seg.mult, mu: seg.mu, df: seg.df, lv: seg.lv });
}

// 지금 구간을 닫아(세는 구간이었으면 pending 에) 넣고 vs 기준으로 새 구간을 연다. 음성 채널이 없으면 세션을 끝낸다
function cut(userId, vs, now = Date.now()) {
  const s = sessions.get(userId);
  if (s && s.since != null) addPiece(userId, now - s.since, s, vs?.member || s.member);
  if (!vs?.channelId) {
    sessions.delete(userId);
    return;
  }
  const mult = multOf(vs);
  sessions.set(userId, { since: mult > 0 ? now : null, member: vs.member || s?.member || null, ch: vs.channelId, n: headcount(vs.channel), mult, ...flagsOf(vs) });
}

const newCycle = (ch, channel, member) => ({ ch, chName: channel?.name || "", pc: channel?.parentId || "", sec: 0, xp: 0, muS: 0, dfS: 0, lvS: 0, nS: {}, idle: 0, member, dirty: true });
const cycleOf = (v, member) => ({
  ch: String(v?.ch || ""),
  chName: v?.chName || "",
  pc: v?.pc || "",
  sec: Math.max(0, Number(v?.sec) || 0),
  xp: Math.max(0, Number(v?.xp) || 0),
  muS: Number(v?.muS) || 0,
  dfS: Number(v?.dfS) || 0,
  lvS: Number(v?.lvS) || 0,
  nS: v?.nS && typeof v.nS === "object" ? { ...v.nS } : {},
  idle: Math.max(0, Number(v?.idle) || 0),
  member,
  dirty: false,
});
const snapOf = (c) => ({ ch: c.ch, chName: c.chName, pc: c.pc, sec: c.sec, xp: c.xp, muS: c.muS, dfS: c.dfS, lvS: c.lvS, nS: c.nS, idle: c.idle });

// 같은 사람의 닫힌 바퀴 여럿을 하나로 — 초 · XP · 상황 시간은 더하고, 채널은 가장 오래 머문 곳
function mergeCycles(list) {
  const out = { ...list[0], nS: { ...list[0].nS } };
  let best = list[0];
  for (const c of list.slice(1)) {
    out.sec += c.sec;
    out.xp += c.xp;
    out.muS += c.muS;
    out.dfS += c.dfS;
    out.lvS += c.lvS;
    out.idle = Math.max(out.idle, c.idle);
    for (const [k, v] of Object.entries(c.nS)) out.nS[k] = (out.nS[k] || 0) + v;
    if (c.sec > best.sec) best = c;
    if (c.member) out.member = c.member;
  }
  return { ...out, ch: best.ch, chName: best.chName, pc: best.pc };
}

// 그 바퀴 동안 가장 오래였던 상황 — 퀘스트 음성 조건 · 관리 › 이상 활동이 이 값을 본다.
// 무활동(idle)은 그 바퀴 동안 음성에 있으면서 잰 가장 긴 값 — 나간 뒤에 재면 활동 기록이 지워져 봇이 켜진 시각부터로 잘못 잰다
function ctxOf(c) {
  const half = c.sec / 2;
  let n = 0;
  let best = -1;
  for (const [k, v] of Object.entries(c.nS)) if (v > best) [best, n] = [v, Number(k)];
  return { n, mute: c.muS > half, deaf: c.dfS > half, live: c.lvS > half, idle: Math.floor(c.idle) };
}

// 밀린 시간을 쓰고 바퀴를 진행 · 지급한다 — 20초 주기 · 종료(final) 때. 겹쳐 부르면 진행 중인 것을 같이 기다린다.
// 종료 때 이미 도는 기록이 있으면 그것이 끝난 뒤 한 번 더 돌린다(그 사이 구간도 적게)
export function flushVoiceTime({ final = false } = {}) {
  if (!started) return Promise.resolve();
  if (flushing) return final ? flushing.then(() => flushVoiceTime({ final })) : flushing;
  flushing = doFlush(final)
    .catch((e) => console.error("음성 시간 기록 오류:", e?.message || e))
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

async function doFlush(final) {
  const guild = guildRef;
  // 재시작 전 바퀴를 먼저 읽는다 — 읽기 전에 새 바퀴를 적으면 DB 의 진행분을 덮어쓴다. 실패하면 이번 기록은 통째로 미룬다(구간은 pending 에 그대로)
  if (!restored) {
    if (!guild) return;
    await restoreCycles(guild);
    restored = true;
  }
  const now = Date.now();
  const s = getSettings();
  const interval = Math.max(30, Number(s.voiceIntervalSec) || 300);
  if (guild) {
    // 열린 구간을 모두 끊어 다시 판정한다. 놓친 이벤트도 여기서 메운다 —
    // 세션은 있는데 음성에 없으면(나감을 놓침) 지난 구간은 버리고, 음성에 있는데 세션이 없으면 지금부터 센다
    for (const userId of [...sessions.keys()]) {
      const vs = guild.voiceStates.cache.get(userId);
      if (vs?.channelId) cut(userId, vs, now);
      else sessions.delete(userId);
    }
    for (const [userId, vs] of guild.voiceStates.cache) {
      if (!vs.channelId || sessions.has(userId) || vs.member?.user?.bot) continue;
      cut(userId, vs, now);
    }
  }

  // XP 로 바꿀 구간은 이번에 전부 가져간다
  const pieceOf = new Map();
  for (const [userId, p] of pending) {
    if (!p.pieces.length) continue;
    pieceOf.set(userId, { pieces: p.pieces, member: p.member });
    p.pieces = [];
  }

  // 음성 시간 — 초 단위로 쓰고 1초 미만 나머지는 다음 번으로 넘긴다
  const rows = [];
  for (const [userId, p] of [...pending]) {
    const sec = Math.floor(p.ms / 1000);
    if (sec <= 0) {
      if (!sessions.has(userId)) pending.delete(userId); // 음성에서 나간 사람의 1초 미만 나머지는 버린다(맵이 쌓이지 않게)
      continue;
    }
    rows.push({ userId, sec, member: p.member });
    p.ms -= sec * 1000;
    if (p.ms <= 0) pending.delete(userId);
  }

  const ids = new Set([...rows.map((r) => r.userId), ...pieceOf.keys(), ...cycles.keys(), ...closing.map((x) => x.userId)]);
  if (!ids.size && !discard.size) return;
  const giveBack = () => {
    rows.forEach((r) => (entry(r.userId).ms += r.sec * 1000));
    for (const [userId, { pieces, member }] of pieceOf) {
      const p = entry(userId);
      p.pieces = [...pieces, ...p.pieces];
      if (member && !p.member) p.member = member;
    }
  };

  // 📌 음성 XP 정지 · 레벨 · 강화는 쓰는 때 본다(관리자가 사이트에서 켜고 끄므로 이벤트가 없다). 문서가 없는 새 사람만 만들어 쓴다 —
  //    정지 조건과 upsert 를 한 쓰기에 같이 걸면 userId 유일 색인 때문에 E11000 이 난다
  let docs = [];
  try {
    if (ids.size) docs = await UserXp.find({ userId: { $in: [...ids] } }, { userId: 1, voiceXpOff: 1, level: 1, voiceEnhance: 1 }).lean();
  } catch (e) {
    giveBack(); // 읽기 실패 — 아무것도 안 썼으니 다음 번에 다시
    throw e;
  }
  const docOf = new Map(docs.map((d) => [d.userId, d]));
  const isOff = (userId) => docOf.get(userId)?.voiceXpOff === true;

  // ── 음성 XP 바퀴 진행 ──
  const touchIdle = (userId, c) => {
    if (sessions.get(userId)?.ch === c.ch) c.idle = Math.max(c.idle, idleMinutes(userId, now));
  };
  const close = (userId, c) => {
    touchIdle(userId, c);
    cycles.delete(userId);
    if (c.sec >= 1) closing.push({ userId, member: c.member, cycle: c });
    else if (dbCycle.has(userId)) discard.add(userId); // 1초도 안 된 바퀴는 주지 않고 DB 에서만 지운다
  };
  const full = (c) => c.sec >= interval - 1e-6;
  for (const [userId, { pieces, member: pm }] of pieceOf) {
    if (isOff(userId) || gone.has(userId)) continue; // 정지 · 퇴장 초기화 — 구간은 버리고 바퀴는 아래에서 지운다
    const member = guild?.members.cache.get(userId) || pm;
    if (!member) continue;
    const d = docOf.get(userId);
    for (const pc of pieces) {
      const channel = guild?.channels.cache.get(pc.ch) || null;
      let c = cycles.get(userId);
      if (c && c.ch !== pc.ch) {
        close(userId, c); // 다른 채널로 옮겼다 — 앞 채널에서 머문 만큼 준다
        c = null;
      }
      const rate = voiceRate(member, channel, d, s, pc.n) * pc.mult;
      let left = pc.ms / 1000;
      while (left > 0) {
        if (c && full(c)) {
          close(userId, c); // 이미 다 찬 바퀴(관리자가 주기를 줄였거나 이어 받은 바퀴) — 먼저 준다
          c = null;
        }
        if (!c) cycles.set(userId, (c = newCycle(pc.ch, channel, member)));
        const take = Math.min(left, interval - c.sec);
        c.sec += take;
        c.xp += (rate * take) / interval;
        if (pc.mu) c.muS += take;
        if (pc.df) c.dfS += take;
        if (pc.lv) c.lvS += take;
        c.nS[pc.n] = (c.nS[pc.n] || 0) + take;
        c.member = member;
        c.dirty = true;
        left -= take;
        if (full(c)) {
          close(userId, c); // 5분을 채웠다 — 1회분을 주고 다음 바퀴
          c = null;
        }
      }
    }
  }
  // 음성에서 나갔거나 다른 채널로 옮긴 사람의 바퀴 · 다 찬 바퀴는 닫는다(세지 않는 채널로 옮겨 구간이 없던 경우 포함). 정지된 사람은 주지 않고 버린다
  for (const [userId, c] of [...cycles]) {
    if (isOff(userId) || gone.has(userId)) {
      cycles.delete(userId);
      discard.add(userId);
      continue;
    }
    const ses = sessions.get(userId);
    if (!ses || ses.ch !== c.ch || full(c)) close(userId, c);
    else touchIdle(userId, c);
  }

  // ── 쓰기 1: 음성 시간 ──
  const ops = [];
  for (const r of rows) {
    const d = docOf.get(r.userId);
    if (d?.voiceXpOff === true || gone.has(r.userId)) continue;
    const names = r.member ? { username: r.member.user?.username || "", displayName: r.member.displayName || "" } : {};
    if (d) {
      ops.push({ updateOne: { filter: { userId: r.userId, voiceXpOff: { $ne: true } }, update: { $inc: { voiceSeconds: r.sec }, ...(r.member ? { $set: names } : {}) } } });
    } else if (guild?.members.cache.has(r.userId)) {
      // 📌 서버에 있는 사람만 새로 만든다 — 퇴장 초기화(features/leaveReset.js)로 지운 문서를 남은 초로 되살리지 않게
      ops.push({ updateOne: { filter: { userId: r.userId }, update: { $inc: { voiceSeconds: r.sec }, $set: { ...names, updatedAt: new Date() } }, upsert: true } });
    }
  }
  // 쓰기 실패는 되돌리지 않는다 — 일부만 들어갔을 수 있어 다시 쓰면 두 번 센다(바퀴 쓰기는 아래에서 따로 한다)
  if (ops.length) await UserXp.bulkWrite(ops, { ordered: false }).catch((e) => console.error("음성 시간 쓰기 오류:", e?.message || e));

  // 지급할 바퀴 — 사람마다 하나로 합친다. 정지된 사람(복원 · 재시도로 넘어온 바퀴 포함) · 퇴장 초기화된 사람 것은 버린다
  const payBy = new Map();
  for (const x of closing) {
    if (isOff(x.userId) || gone.has(x.userId)) continue;
    const g = payBy.get(x.userId) || { userId: x.userId, member: null, list: [] };
    g.list.push(x.cycle);
    if (x.member) g.member = x.member;
    payBy.set(x.userId, g);
  }

  // ── 쓰기 2: 진행 중인 바퀴(재시작 대비) — 열린 바퀴는 덮어쓰고, 닫았거나 버린 바퀴는 지운다. 몇 번을 다시 해도 같은 결과 ──
  //    종료(final) 때는 지급하지 않고 닫힌 바퀴를 pend 로 같이 적어 둔다 — 다음 기동 때 restoreCycles 가 준다
  const touched = new Set([...closing.map((x) => x.userId), ...discard]);
  for (const [userId, c] of cycles) if (c.dirty) touched.add(userId);
  const cycOps = [];
  const cycUsers = [];
  for (const userId of touched) {
    const c = cycles.get(userId);
    const pend = final && payBy.has(userId) ? [snapOf(mergeCycles(payBy.get(userId).list))] : null;
    if (c || pend) {
      const doc = { ...(c ? snapOf(c) : { sec: 0 }), ...(pend ? { pend } : {}), at: new Date(now) };
      cycOps.push({ updateOne: { filter: { userId }, update: { $set: { voiceCycle: doc } } } });
    } else if (dbCycle.has(userId)) cycOps.push({ updateOne: { filter: { userId }, update: { $unset: { voiceCycle: 1 } } } });
    else {
      discard.delete(userId); // DB 에 적힌 바퀴가 없다 — 지울 것도 없다
      continue;
    }
    cycUsers.push(userId);
  }
  const failed = new Set();
  if (cycOps.length) {
    try {
      await UserXp.bulkWrite(cycOps, { ordered: false });
    } catch (e) {
      const errs = e?.writeErrors || e?.result?.getWriteErrors?.() || null;
      if (Array.isArray(errs) && errs.length) errs.forEach((w) => failed.add(cycUsers[w.index ?? w.err?.index]));
      else cycUsers.forEach((u) => failed.add(u)); // 무엇이 들어갔는지 모른다 — 전부 다음 번에 다시(덮어쓰기 · 지우기라 두 번 해도 같다)
      // 들어갔을 수도 있는 덮어쓰기 — 나중에 닫힐 때 반드시 지우게 표시해 둔다(없는 칸을 지워도 해가 없다)
      cycOps.forEach((op, i) => op.updateOne.update.$set && dbCycle.add(cycUsers[i]));
      console.error("음성 바퀴 기록 오류:", e?.message || e);
    }
  }
  for (const userId of cycUsers) {
    if (failed.has(userId)) continue;
    const c = cycles.get(userId);
    if (c) c.dirty = false;
    if (c || (final && payBy.has(userId))) dbCycle.add(userId);
    else dbCycle.delete(userId);
    discard.delete(userId);
  }

  // ── 지급 — DB 정리가 끝난 바퀴만(재시작 때 같은 바퀴를 두 번 주지 않게). 실패한 사람은 다음 기록 때 다시. 종료 때는 주지 않는다(pend 로 적었다) ──
  closing = closing.filter((x) => failed.has(x.userId) && !isOff(x.userId) && !gone.has(x.userId));
  if (final) return;
  for (const { userId, member, list } of payBy.values()) {
    if (failed.has(userId) || !member) continue;
    const c = mergeCycles(list);
    const raw = c.xp + (xpCarry.get(userId) || 0);
    const amount = Math.max(0, Math.floor(raw + 1e-6)); // 소수 오차로 2000 이 1999 가 되지 않게
    if (raw - amount > 1e-6) xpCarry.set(userId, raw - amount);
    else xpCarry.delete(userId);
    try {
      await payVoiceCycle(member, { ...c, amount, ctx: ctxOf(c) });
    } catch (e) {
      console.error(`음성 XP 오류 (${member.displayName || userId}):`, e?.message || e);
    }
  }
}

// 📌 처음 기록할 때 — DB 에 남은 바퀴(재시작 전 진행 중이던 것 · 종료 때 적어 둔 닫힌 바퀴 pend)를 읽는다.
//    같은 채널에 그대로 있으면 이어 가고, 그 사이 나갔으면 그때까지 머문 만큼 준다. 서버에 없는 사람 것은 지우기만
async function restoreCycles(guild) {
  const docs = await UserXp.find({ $or: [{ "voiceCycle.sec": { $gt: 0 } }, { "voiceCycle.pend.0": { $exists: true } }] }, { userId: 1, voiceCycle: 1 }).lean();
  let kept = 0;
  let pays = 0;
  for (const d of docs) {
    dbCycle.add(d.userId);
    const v = d.voiceCycle || {};
    const vs = guild.voiceStates.cache.get(d.userId);
    const member = vs?.member || guild.members.cache.get(d.userId) || (await guild.members.fetch(d.userId).catch(() => null));
    if (!member) {
      discard.add(d.userId);
      continue;
    }
    let mine = 0;
    for (const p of Array.isArray(v.pend) ? v.pend : []) {
      const c = cycleOf(p, member);
      if (c.sec >= 1) {
        closing.push({ userId: d.userId, member, cycle: c });
        mine++;
      }
    }
    const c = cycleOf(v, member);
    if (c.sec > 0 && vs?.channelId && vs.channelId === c.ch) {
      c.dirty = true; // pend 를 뺀 모양으로 다시 적는다
      cycles.set(d.userId, c);
      kept++;
    } else if (c.sec >= 1) {
      closing.push({ userId: d.userId, member, cycle: c });
      mine++;
    } else if (!mine) discard.add(d.userId);
    pays += mine;
  }
  if (docs.length) console.log(`🔊 음성 바퀴 이어 받기 — ${kept}명 이어 감, ${pays}건 지급 대기`);
}

// ClientReady 에서 설정 · 채널 정책을 읽은 뒤에 켠다(판정이 그 값을 쓴다)
export function startVoiceTime(client) {
  if (started) return;
  guildRef = client.guilds.cache.get(config.guildId) || null;
  started = true;

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (newState.guild?.id !== config.guildId) return;
    const userId = newState.id;
    if (!userId || newState.member?.user?.bot) return;
    if (!guildRef) guildRef = newState.guild;
    if (newState.channelId) gone.delete(userId);
    const now = Date.now();
    cut(userId, newState, now); // 들어옴 · 나감 · 옮김 · 마이크/헤드셋 · 화면 공유 — 바뀔 때마다 끊어 다시 판정
    // 누가 들어오거나 나가면 그 채널 사람들의 구간도 끊는다 — 인원(음성 파티 · ctx.n)을 구간마다 그때 값으로
    if (oldState.channelId === newState.channelId) return;
    const chans = new Set([oldState.channelId, newState.channelId].filter(Boolean));
    for (const [id, ses] of [...sessions]) {
      if (id === userId || !chans.has(ses.ch)) continue;
      const vs = guildRef?.voiceStates.cache.get(id);
      if (vs?.channelId) cut(id, vs, now);
    }
  });

  // 서버에서 나가면 세션을 닫는다. 퇴장 초기화가 켜져 있으면 문서가 지워지므로 밀린 초 · 바퀴를 주지 않고 버린다(지급이 문서를 되살리지 않게).
  // 꺼져 있으면 다른 나감과 같이 머문 만큼 준다(다음 기록 때)
  client.on(Events.GuildMemberRemove, (member) => {
    if (member.guild?.id !== config.guildId) return;
    cut(member.id, null);
    if (!getSettings().resetOnLeave) return;
    gone.add(member.id);
    pending.delete(member.id);
    cycles.delete(member.id);
    closing = closing.filter((x) => x.userId !== member.id);
    xpCarry.delete(member.id);
    discard.add(member.id);
  });

  // 지금 음성에 있는 사람부터 센다
  if (guildRef) for (const [userId, vs] of guildRef.voiceStates.cache) if (vs.channelId && !vs.member?.user?.bot) cut(userId, vs);

  setInterval(() => flushVoiceTime(), FLUSH_MS);
  console.log(`✅ 음성 시간 · 음성 XP 시작 — 사람마다 실제 접속 초, ${FLUSH_MS / 1000}초마다 기록 (지금 음성 ${sessions.size}명)`);
}
