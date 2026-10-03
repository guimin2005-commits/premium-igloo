// 📌 관리자 이상 활동(app/api/admin/activity) 집계 — 잠수로 음성 XP 를 쌓는 유저를 가려 보는 읽기 전용 셈.
//    모델 · 별칭(@/) import 없는 순수 파이프라인이다 — 라우트와 읽기 스크립트가 같은 식을 그대로 돌린다.
//
//    재료는 XpLog 뿐이다(60일 TTL · 2026-10-01 19:05 KST 부터). 실제로 있는 칸: userId · displayName · amount · reason · channelId · channelName · createdAt
//    · sec(음성 지급 한 줄의 실제 머문 초 — 봇 bot/src/features/voiceTime.js · xp.js 가 남긴다. 2026-10-04 전에는 그 주기 초)
//    · ctx(음성 줄에만, 봇이 그 주기에 본 음성 상황 — models/XpLog.js): n 채널 인원(본인 포함) · mute · deaf · live(화면 공유 · 캠) · idle(마지막 활동 뒤 분)
//    📌 ctx 가 있는 줄은 정확한 값 — 혼자 = n ≤ 1, 음소거 = mute, 헤드셋 끔 = deaf, 화면·캠 = live, 최장 무활동 = idle 의 최댓값.
//       헤드셋 · 화면·캠 비율은 ctx 줄 시간 기준(예전 줄은 모른다). 무활동은 봇이 켜진 시각 · 음성에 들어온 시각부터 잰다
//    ⚠ ctx 가 없는 예전 줄은 혼자 · 음소거를 있는 칸으로 미루어 센다(근사치 — 화면 칩은 이런 줄이 섞였을 때만)
//      · 혼자   — 같은 채널 같은 주기에 다른 유저의 voice 로그가 없었다. 음소거 막기 · 제외 채널 · 잠수 채널처럼
//                 XP 를 못 받은 사람은 로그가 없어 "없는 사람"으로 센다
//      · 음소거 — 그 주기 지급이 기본 음성 XP(BotSetting.voiceXp)보다 적었다. 가산(등급 · 강화 · 역할 · 채널 · 부스트 · 아이템)은
//                 전부 0 이상이라 음소거 감소(muteMode "reduce")가 아니면 기본값 아래로 내려가지 않는다.
//                 실측(10/1~10/3): 지급액이 1,000 미만 ↔ 2,000 이상으로 갈리고 그 사이는 0건. 막기(block) · 끔(off) 모드에서는 늘 0.
//                 가산이 아주 크거나 음소거 감소 완화(아이템 효과)로 깎임이 작아 기본값을 넘긴 주기는 못 잡는다(적게 센다)
//
//    음성 지급 — 2026-10-04 부터 사람마다 각자 5분(voiceIntervalSec)을 채우면 한 줄(sec 300), 다 못 채우고 나가거나 옮기면 머문 만큼 한 줄(sec 1~300).
//    그 전(10/1~10/4)은 봇이 주기마다 음성 채널 전원을 한 번에 돌았다 — 실측: 한 주기 로그는 최대 26초 안에 몰리고(중앙 6초), 같은 유저의 다음 로그는 280~320초 뒤.
//      · 주기 묶음 — 같은 채널에서 앞 로그와 그 로그 주기의 절반(300초면 150초) 넘게 떨어지면 새 주기. ctx 가 없는 옛 줄의 '혼자' 판정에만 쓴다
//      · 연속     — 다음 로그가 주기 × 1.5(300초면 450초) 안에 오면 이어진 것. 한 주기라도 비면 끊긴다(주기를 바꾼 그 사이는 앞 · 뒤 로그 주기 중 큰 쪽으로 잰다).
//                   📌 2026-10-04 채널을 옮겨도 끊지 않는다 — 옮길 때마다 지급 줄이 생기므로, 옆 채널에 1초 다녀오는 것으로 연속을 끊어 감출 수 없게
//    📌 간격 · 시간은 로그마다 그 로그의 주기(sec)로 센다 — 관리자가 주기를 바꿔도 지난 기록이 새 주기로 다시 묶이지 않는다.
//       sec 칸이 생기기 전 로그는 LEGACY_INTERVAL_SEC 로 친다.

export const ACTIVITY_PERIODS = { today: 1, "7d": 7, "30d": 30 }; // KST 날짜 경계, 오늘 포함 N일
export const ACTIVITY_SORTS = ["score", "voice", "dayMax", "streak", "alone", "muted", "deaf", "idle", "live", "chat", "xp"];
export const ACTIVITY_LIMIT = 100;
const TICK_GAP_RATIO = 0.5;
const STREAK_GAP_RATIO = 1.5;
// 📌 sec 칸이 없는 옛 음성 로그의 주기 — 그 로그들은 전부 300초 주기였다
//    (실측: voiceIntervalSec 300, 설정을 마지막으로 바꾼 10/1 19:05:35 KST 가 첫 음성 로그 19:05:41 보다 앞선다)
export const LEGACY_INTERVAL_SEC = 300;
const SEC = { $ifNull: ["$sec", LEGACY_INTERVAL_SEC] };
// ctx 가 실린 줄 — 봇은 n 을 늘 싣는다
const HAS_CTX = { $isNumber: "$ctx.n" };
const flag = (cond) => ({ $cond: [cond, 1, 0] });

const gapOver = (at, prev, ms) => ({ $or: [{ $eq: [prev, null] }, { $gt: [{ $subtract: [at, prev] }, ms] }] });

// 음성 — 유저마다 받은 횟수 · 시간 · 혼자(횟수 · 시간) · 음소거 시간 · 음성 XP · 최장 연속 시간
//        + ctx 줄 횟수 · 시간 · 헤드셋 끔 시간 · 화면·캠 시간 · 최장 무활동(분). 시간은 초
export function voicePipeline({ since, baseXp }) {
  return [
    { $match: { reason: "voice", createdAt: { $gte: since } } },
    { $project: { _id: 0, u: "$userId", ch: "$channelId", at: "$createdAt", amount: 1, sec: SEC, ctx: 1 } },
    // 1) 채널마다 시각순 — 앞 로그와 이 로그 주기의 절반 넘게 떨어지면 새 주기(tick 번호는 누적 합)
    { $setWindowFields: { partitionBy: "$ch", sortBy: { at: 1 }, output: { prevAt: { $shift: { output: "$at", by: -1 } } } } },
    { $set: { nt: { $cond: [gapOver("$at", "$prevAt", { $multiply: ["$sec", 1000 * TICK_GAP_RATIO] }), 1, 0] } } },
    { $setWindowFields: { partitionBy: "$ch", sortBy: { at: 1 }, output: { tick: { $sum: "$nt", window: { documents: ["unbounded", "current"] } } } } },
    // 2) 같은 채널 같은 주기에 로그가 있는 사람들 — 나 하나면 혼자(예전 줄). ctx 줄은 봇이 본 값 그대로
    { $setWindowFields: { partitionBy: { ch: "$ch", t: "$tick" }, output: { mates: { $addToSet: "$u" } } } },
    {
      $set: {
        ex: flag(HAS_CTX),
        alone: flag({ $cond: [HAS_CTX, { $lte: ["$ctx.n", 1] }, { $lte: [{ $size: "$mates" }, 1] }] }),
        muted: flag({ $cond: [HAS_CTX, { $eq: ["$ctx.mute", true] }, { $and: [{ $gt: [baseXp, 0] }, { $lt: ["$amount", baseXp] }] }] }),
        deaf: flag({ $and: [HAS_CTX, { $eq: ["$ctx.deaf", true] }] }),
        live: flag({ $and: [HAS_CTX, { $eq: ["$ctx.live", true] }] }),
        idle: { $cond: [{ $and: [HAS_CTX, { $isNumber: "$ctx.idle" }] }, "$ctx.idle", null] }, // $max 는 null 을 건너뛴다
      },
    },
    // 3) 유저마다 시각순 — 주기 × 1.5 넘게 비면 새 연속 구간(run 번호는 누적 합). 채널을 옮긴 것으로는 끊지 않는다
    {
      $setWindowFields: {
        partitionBy: "$u",
        sortBy: { at: 1 },
        output: { pAt: { $shift: { output: "$at", by: -1 } }, pSec: { $shift: { output: "$sec", by: -1 } } },
      },
    },
    {
      $set: {
        nr: {
          $cond: [gapOver("$at", "$pAt", { $multiply: [{ $max: ["$sec", "$pSec"] }, 1000 * STREAK_GAP_RATIO] }), 1, 0],
        },
      },
    },
    { $setWindowFields: { partitionBy: "$u", sortBy: { at: 1 }, output: { run: { $sum: "$nr", window: { documents: ["unbounded", "current"] } } } } },
    {
      $group: {
        _id: { u: "$u", r: "$run" },
        n: { $sum: 1 },
        sec: { $sum: "$sec" },
        alone: { $sum: "$alone" },
        aloneSec: { $sum: { $multiply: ["$alone", "$sec"] } },
        mutedSec: { $sum: { $multiply: ["$muted", "$sec"] } },
        xp: { $sum: "$amount" },
        ex: { $sum: "$ex" },
        exSec: { $sum: { $multiply: ["$ex", "$sec"] } },
        deafSec: { $sum: { $multiply: ["$deaf", "$sec"] } },
        liveSec: { $sum: { $multiply: ["$live", "$sec"] } },
        idle: { $max: "$idle" },
      },
    },
    {
      $group: {
        _id: "$_id.u",
        n: { $sum: "$n" },
        sec: { $sum: "$sec" },
        alone: { $sum: "$alone" },
        aloneSec: { $sum: "$aloneSec" },
        mutedSec: { $sum: "$mutedSec" },
        xp: { $sum: "$xp" },
        streakSec: { $max: "$sec" },
        ex: { $sum: "$ex" },
        exSec: { $sum: "$exSec" },
        deafSec: { $sum: "$deafSec" },
        liveSec: { $sum: "$liveSec" },
        idle: { $max: "$idle" },
      },
    },
  ];
}

// 하루 최대(음성 시간, 초) · 채팅 수(XP 를 받은 채팅 — 쿨타임에 걸린 메시지는 로그가 없다) · 로그에 남은 이름
export function dailyPipeline({ since }) {
  return [
    { $match: { reason: { $in: ["voice", "chat"] }, createdAt: { $gte: since } } },
    {
      $group: {
        _id: { u: "$userId", d: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "+09:00" } } },
        v: { $sum: { $cond: [{ $eq: ["$reason", "voice"] }, SEC, 0] } },
        c: { $sum: { $cond: [{ $eq: ["$reason", "chat"] }, 1, 0] } },
        name: { $max: "$displayName" },
      },
    },
    { $group: { _id: "$_id.u", dayMax: { $max: "$v" }, chat: { $sum: "$c" }, name: { $max: "$name" } } },
  ];
}

// 📌 의심 점수 = 최장 연속 + 혼자 시간 + 음소거 시간 + 헤드셋 끔 시간 + 최장 무활동 (모두 시간 단위, 소수 첫째 자리)
//    오래 붙어 있을수록 · 혼자일수록 · 마이크 · 헤드셋을 끈 채일수록 · 아무것도 안 한 채 오래일수록 오른다.
//    함께 잠수하는 무리(혼자 0)는 최장 연속 · 음소거 · 헤드셋 · 무활동이 잡는다. 헤드셋 · 무활동은 ctx 줄에서만 센다
export const scoreOf = (r) => Math.round((r.streakSec + r.aloneSec + r.mutedSec + r.deafSec + r.idleSec) / 360) / 10;

// 두 집계 + 이름을 유저 한 줄로. names: Map(userId → { displayName, username })
export function mergeActivity(voiceRows, dailyRows, names) {
  const byId = new Map();
  const row = (id) => {
    if (!byId.has(id)) {
      byId.set(id, {
        userId: id, voiceN: 0, voiceSec: 0, aloneN: 0, aloneSec: 0, mutedSec: 0, streakSec: 0, dayMaxSec: 0, chatN: 0, voiceXp: 0, logName: "",
        exactN: 0, exactSec: 0, deafSec: 0, liveSec: 0, idleSec: 0,
      });
    }
    return byId.get(id);
  };
  for (const v of voiceRows) {
    if (!v._id) continue;
    Object.assign(row(v._id), {
      voiceN: v.n || 0,
      voiceSec: v.sec || 0,
      aloneN: v.alone || 0,
      aloneSec: v.aloneSec || 0,
      mutedSec: v.mutedSec || 0,
      streakSec: v.streakSec || 0,
      voiceXp: v.xp || 0,
      exactN: v.ex || 0,
      exactSec: v.exSec || 0,
      deafSec: v.deafSec || 0,
      liveSec: v.liveSec || 0,
      idleSec: Math.max(0, Math.round((Number(v.idle) || 0) * 60)),
    });
  }
  for (const d of dailyRows) {
    if (!d._id) continue;
    Object.assign(row(d._id), { dayMaxSec: d.dayMax || 0, chatN: d.chat || 0, logName: d.name || "" });
  }
  return [...byId.values()].map((r) => {
    const n = names.get(r.userId) || {};
    return {
      userId: r.userId,
      displayName: n.displayName || r.logName || n.username || r.userId,
      username: n.username || "",
      voiceN: r.voiceN,
      voiceSec: r.voiceSec,
      dayMaxSec: r.dayMaxSec,
      streakSec: r.streakSec,
      aloneN: r.aloneN,
      aloneSec: r.aloneSec,
      aloneRate: r.voiceSec ? Math.round((r.aloneSec / r.voiceSec) * 1000) / 10 : 0, // % (시간 기준)
      mutedSec: r.mutedSec,
      mutedRate: r.voiceSec ? Math.round((r.mutedSec / r.voiceSec) * 1000) / 10 : 0, // % (시간 기준)
      // ctx 줄 — exactN 0 이면 헤드셋 · 무활동 · 화면·캠은 모른다(화면은 "—"). approx: 예전 줄이 섞여 혼자 · 음소거에 근사가 들었다
      exactN: r.exactN,
      approx: r.voiceN > r.exactN,
      deafSec: r.deafSec,
      deafRate: r.exactSec ? Math.round((r.deafSec / r.exactSec) * 1000) / 10 : 0, // % (ctx 줄 시간 기준)
      liveRate: r.exactSec ? Math.round((r.liveSec / r.exactSec) * 1000) / 10 : 0, // % (ctx 줄 시간 기준)
      idleSec: r.idleSec, // 최장 무활동
      chatN: r.chatN,
      voiceXp: r.voiceXp,
      score: scoreOf(r),
    };
  });
}

// 정렬 — 고른 값이 큰 순, 같으면 의심 점수 · 음성 시간 순
const SORT_KEY = {
  score: "score", voice: "voiceSec", dayMax: "dayMaxSec", streak: "streakSec", alone: "aloneRate", muted: "mutedRate",
  deaf: "deafRate", idle: "idleSec", live: "liveRate", chat: "chatN", xp: "voiceXp",
};
export function sortActivity(rows, sort) {
  const k = SORT_KEY[sort] || "score";
  return rows.slice().sort((a, b) => b[k] - a[k] || b.score - a.score || b.voiceSec - a.voiceSec || String(a.userId).localeCompare(String(b.userId)));
}
