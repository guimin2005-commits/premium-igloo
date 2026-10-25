// 📌 순위 기준 · 순위표 계산(사이트) — 사이트 랭킹(app/api/xp/leaderboard)이 쓴다. 봇 사본은 bot/src/rankBoards.js(아래 공용 블록 글자 그대로)
//    사이트는 models · mongoose 를 넘겨 부른다: monthBoard(RANK_MODELS, monthStart) — RANK_MODELS 는 app/api/xp/leaderboard 가 만든다

// ═══ 공용 블록 시작 — lib/rankBoards.js 와 bot/src/rankBoards.js 의 이 구간은 글자 하나까지 같아야 한다 ═══
// 📌 순위 기준 · 순위표 계산 — 사이트 랭킹(app/api/xp/leaderboard period)과 봇 /랭크 「기준」(bot/src/commands.js)이 같은 값을 쓰게 한 곳에 둔다.
//    2026-10-18 운영자 "/랭크 명령어 뒤에 [현재] [누적] [이번 달] [음성 시간] 도 쓸 수 있게". 봇은 별도 배포라 import 없이 모델을 넘겨받는다(M).
//    M = { UserXp, XpLog, Payout, Purchase, WalletLog, ObjectId(mongoose.Types.ObjectId) }

// 기준 — v: period 값 · l: 고르는 이름(/랭크 선택지) · title: 카드 큰 제목 · mode: 기준 글자(봇 메시지 변수 {mode})
export const RANK_PERIODS = [
  { v: "all", l: "현재", title: "서버 순위", mode: "현재 XP" },
  { v: "total", l: "누적", title: "누적 순위", mode: "누적 XP" },
  { v: "month", l: "이번 달", title: "이번 달 순위", mode: "이번 달 XP" },
  { v: "voice", l: "음성 시간", title: "음성 시간 순위", mode: "음성 시간" },
];
export const RANK_PERIOD_OF = Object.fromEntries(RANK_PERIODS.map((p) => [p.v, p]));
// 모르는 값은 현재
export const rankPeriodOf = (v) => RANK_PERIOD_OF[v] || RANK_PERIODS[0];
// 📌 2026-10-25 순위의 전체 인원 — 서버 사람 수(봇 제외)와 순위에 오른 수 중 큰 쪽. 운영자 "서버 모든인원 포함해서 순위 계산해".
//    XP 기록이 없는 멤버는 0 으로 맨 아래에 있는 셈이라 순위는 그대로, 「/ 전체」 · 「N명 중」 · 「상위 N%」의 분모만 늘어난다. 서버 인원을 모르면(0 · null) 순위에 오른 수
export const rankTotalOf = (count, members) => Math.max(Math.max(0, Number(count) || 0), Math.max(0, Number(members) || 0));

// KST 이번 달 1일 00:00 — lib/kst.js kstMonthStart 와 같은 값
const KST_MS = 9 * 60 * 60 * 1000;
export function rankMonthStart(now = Date.now()) {
  const n = new Date(Number(now) + KST_MS);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1, 0, 0, 0) - KST_MS);
}
// 누적 구간 시작 — 시즌 시작(ms · seasonStartMs(currentSeason()))과 내역 기준 시각(BotSetting.ledgerSince) 중 늦은 쪽
export function rankTotalSince(seasonStart, ledgerSince) {
  const season = new Date(seasonStart);
  const floor = ledgerSince ? new Date(ledgerSince) : null;
  return floor && !Number.isNaN(floor.getTime()) && floor > season ? floor : season;
}
// 음성 시간 글자 — "12시간 30분" · 1시간 미만 "30분" · 0 이면 "0분"(봇 카드 · 메시지)
export function voiceTimeText(sec) {
  const m = Math.floor(Math.max(0, Number(sec) || 0) / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h.toLocaleString("ko-KR")}시간 ${m % 60}분` : `${m}분`;
}
// 동점은 userId 오름차순(글자 비교 — Mongo 정렬 · $lt 와 같은 순서, 가입 순서 아님)
// 📌 2026-10-04 "규칙 하나로 맞추면, 같은 사람이 화면마다 다른 순위로 보이는 일이 없습니다" — 내 정보(app/api/xp/me) · 봇 /레벨 · /랭크도 이 규칙
const byXpThenId = (a, b) => b.xp - a.xp || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);

// 📌 관리자가 없앤 XP — [XP 제거] · 음수 수동 지급(app/api/xp/grant → 봇 processPayouts 가 반영해 paid) · 관리자 초기화(같은 라우트 mode reset).
//    현재(UserXp.xp)는 봇 · 초기화가 이미 깎는다. 이번 달은 XpLog + 지급 합이라 여기서 따로 뺀다(monthBoard).
//    XpLog 에 음수 줄을 쓰지 않는다 — 원장(app/api/xp/ledger)에 Payout 줄과 두 번 보이고, 퀘스트 · 패스 · 서포터즈도 XpLog 를 같이 센다.
//    유저가 쓴 XP(상점 결제 · 강화 · 패스 해금)와 다른 지급은 빼지 않는다 — 대기 · 처리 중은 아직 깎이지 않았으므로 paid 만
//    초기화는 kind "reset", 그 표시가 없던 예전 기록은 수동 지급 중 사유 "관리자 초기화…"(원장 HIDDEN_PAYOUT 과 같은 기준). 보유 0 이던 사람의 기록은 금액 0 이라 따로 잡는다
//    📌 2026-10-04 퇴장 초기화(봇 features/leaveReset.js)도 kind "reset" 을 남긴다 — 금액 0 · source "etc" · by "bot" · paid, 나간 시각.
//       kind "reset" 은 금액 부호와 상관없이 '그 시각까지 0'이고 획득(plus)에 넣지 않는다. 사유로만 잡는 예전 기록은 금액 0 이하일 때만 초기화
export const ADMIN_TAKE = [
  { source: { $in: ["manual", "admin"] }, amount: { $lt: 0 } },
  { kind: "reset" },
  { source: "manual", reason: /^관리자 초기화/ },
];
const IS_RESET = {
  $or: [
    { $eq: ["$kind", "reset"] },
    {
      $and: [
        { $lte: ["$amount", 0] },
        { $eq: ["$source", "manual"] },
        { $regexMatch: { input: { $ifNull: ["$reason", ""] }, regex: "^관리자 초기화" } },
      ],
    },
  ],
};

// 📌 이번 달 값 — 이번 달 XpLog(채팅 · 음성 · 출석 · 아이템 효과) + 이번 달 지급된(paid) 양수 XP 지급
//    (퀘스트 · 시즌 패스 · 관리자 지급 · 쿠폰 · 서포터즈 · 역할 환불 — 봇 processPayouts 는 UserXp.xp 만 올리고 XpLog 를 쓰지 않는다)
//    − 관리자 회수 · 초기화. 유저가 쓴 XP(상점 결제 · 강화 · 패스 해금)는 Payout 이 아니라 빼지 않는다.
//    시각 순으로 쌓는다: 회수는 0 아래로 내리지 않고(그 뒤에 번 XP 는 다시 쌓인다 — 보유 XP 가 0 에서 멈추는 것과 같다),
//    초기화(관리자 · 퇴장)는 금액과 상관없이 그 순간까지를 0 으로(보유 XP 를 통째로 지운 것 — 같은 달에 다시 들어와도 나가기 전 몫은 안 잡힌다).
//    📌 "회수는 그 달 지급분에서 먼저"(2ffb4b2)와 같은 값이다 — 지급분 u · 번 값 v 로 나눠 u 부터 깎아도 합(u + v)은 max(0, 합 − 회수)라
//       지급까지 더하는 지금은 한 값으로 센다(잘못 준 지급을 [XP 제거]로 되돌리면 그 지급이 빠질 뿐 채팅 · 음성으로 번 몫은 그대로).
//    집계는 XpLog 1번 + Payout 1번 + (회수 · 초기화가 있는 사람만) 구간별 XpLog 1번.
//    반환: [{ userId, xp, displayName }] — xp 내림차순 · userId 오름차순, 0 이하는 빠진다(이번 달 순위에 없음)
export async function monthBoard(M, monthStart) {
  const [logs, pays] = await Promise.all([
    M.XpLog.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      { $group: { _id: "$userId", xp: { $sum: "$amount" }, displayName: { $last: "$displayName" } } },
    ]),
    M.Payout.aggregate([
      {
        $match: {
          userId: { $nin: ["", null] },
          status: "paid",
          currency: { $ne: "point" },
          $and: [
            { $or: [{ paidAt: { $gte: monthStart } }, { createdAt: { $gte: monthStart } }] },
            { $or: [{ amount: { $gt: 0 } }, ...ADMIN_TAKE] },
          ],
        },
      },
      { $addFields: { at: { $ifNull: ["$paidAt", "$createdAt"] } } },
      { $match: { at: { $gte: monthStart } } },
      { $sort: { at: 1, _id: 1 } },
      {
        $group: {
          _id: "$userId",
          at: { $push: "$at" },
          amt: { $push: "$amount" },
          reset: { $push: IS_RESET },
          plus: { $sum: { $cond: [{ $and: [{ $gt: ["$amount", 0] }, { $not: [IS_RESET] }] }, "$amount", 0] } },
          takes: { $sum: { $cond: [{ $or: [{ $lte: ["$amount", 0] }, IS_RESET] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const byUser = new Map(); // userId → { xp, displayName }
  for (const l of logs) {
    if (!l._id) continue;
    byUser.set(l._id, { xp: l.xp || 0, displayName: l.displayName || "" });
  }
  // 양수 지급만 있는 사람 — 이번 달 로그 합에 지급 합을 더하면 끝
  for (const p of pays) {
    if (p.takes > 0) continue;
    const cur = byUser.get(p._id);
    byUser.set(p._id, { xp: (cur?.xp || 0) + p.plus, displayName: cur?.displayName || "" });
  }

  // 회수 · 초기화가 한 번이라도 있는 사람 — 지급 · 회수 시각으로 이번 달 XpLog 를 구간별로 나눠 합한 뒤 시각 순으로 쌓는다.
  //    구간 번호 = 그 로그 시각까지 지난 지급 · 회수 수(같은 시각의 로그는 그 지급 · 회수 뒤로 친다)
  const cuts = pays.filter((p) => p.takes > 0);
  if (cuts.length) {
    const users = cuts.map((c) => c._id);
    const times = cuts.map((c) => c.at);
    const segs = await M.XpLog.aggregate([
      { $match: { userId: { $in: users }, createdAt: { $gte: monthStart } } },
      {
        $group: {
          _id: {
            u: "$userId",
            s: {
              $size: {
                $filter: {
                  input: { $arrayElemAt: [{ $literal: times }, { $indexOfArray: [{ $literal: users }, "$userId"] }] },
                  as: "t",
                  cond: { $lte: ["$$t", "$createdAt"] },
                },
              },
            },
          },
          xp: { $sum: "$amount" },
        },
      },
    ]);
    const segBy = new Map();
    for (const r of segs) {
      if (!segBy.has(r._id.u)) segBy.set(r._id.u, new Map());
      segBy.get(r._id.u).set(r._id.s, r.xp);
    }
    for (const c of cuts) {
      const sums = segBy.get(c._id);
      let t = 0;
      for (let i = 0; i <= c.amt.length; i++) {
        t += sums?.get(i) || 0;
        if (i === c.amt.length) break;
        const a = c.amt[i];
        if (c.reset[i]) t = 0;
        else if (a > 0) t += a;
        else t = Math.max(0, t + a);
      }
      byUser.set(c._id, { xp: t, displayName: byUser.get(c._id)?.displayName || "" });
    }
  }

  return [...byUser]
    .map(([userId, v]) => ({ userId, xp: v.xp, displayName: v.displayName }))
    .filter((r) => r.xp > 0)
    .sort(byXpThenId);
}

// 📌 누적(period=total) — 이번 시즌 동안 얻은 XP 전부 = 지금 보유 XP(UserXp.xp) + 이번 시즌에 유저가 쓴 XP.
//    쓴 XP = 상점 결제 · 연장(Purchase, createdAt) − 취소 · 환불로 돌려받은 XP(revokedAt → processedAt → createdAt)
//            + 강화 · 패스 해금 비용(WalletLog enhance · pass-unlock 의 XP 쪽).
//    낸 값 식(hasSplit · 옛 건은 정가를 XP 로) · 테스트 초기화 환불 제외는 원장(app/api/xp/ledger) · 재화 통계(lib/adminEconomy)와 같다 —
//    빙옥으로 낸 몫은 XP 가 아니라 빠진다. ⚠ 원장 쪽 식을 바꾸면 여기도 같이 바꾼다.
//    관리자 회수 · 캐시백 회수는 더하지 않는다 — 보유 XP 에서 빠진 그대로 누적에서도 빠진다(10/1 결정).
//    세는 구간: 시즌 시작과 내역 기준 시각(BotSetting.ledgerSince) 중 늦은 쪽부터(rankTotalSince).
//    초기화(관리자 · 퇴장 — Payout kind "reset")가 있었던 사람은 마지막 초기화 시각부터, 퇴장 초기화로 문서가 다시 생긴 사람은 그 생성 시각부터(늦은 쪽) —
//    초기화가 보유 XP 를 통째로 지웠으므로 그 전에 쓴 것은 지금 값에 없다. 초기화 기록은 시작 시각으로만 쓰고 얻은 XP 에 더하지 않는다.
//    📌 검산: 전원 합 = 구간 안 발행(XpLog + 양수 지급 + 캐시백) − 관리자 회수 · 캐시백 회수 — 구간 시작 때 보유가 0 이고 구간 안 초기화가 없으면 같은 값(10/3 실측 차이 0)
//    집계는 Payout 1번(초기화 시각) + UserXp 2번(구간 안 생성 · 보유) + Purchase 2번 + WalletLog 1번. 캐시는 부르는 쪽이 감싼다(사이트 30초)
//    반환: [{ userId, xp(누적), name(없으면 ""), level, attendCount }] — xp 내림차순 · userId 오름차순, 0 이하는 빠진다
// 초기화 기록 — 원장 HIDDEN_PAYOUT 과 같은 두 표시. kind "reset" 은 금액과 상관없이, 사유로만 잡는 예전 기록은 금액 0 이하만(monthBoard IS_RESET 과 같다)
const RESET_PAYOUT = [{ kind: "reset" }, { source: "manual", reason: /^관리자 초기화/, amount: { $lte: 0 } }];
const hasSplit = {
  $or: [
    { $eq: ["$billed", true] },
    { $gt: [{ $ifNull: ["$paidXp", 0] }, 0] },
    { $gt: [{ $ifNull: ["$paidPoint", 0] }, 0] },
  ],
};
const paidXpOf = { $cond: [hasSplit, { $ifNull: ["$paidXp", 0] }, { $ifNull: ["$price", 0] }] };
const TEST_RESET = { adminNote: "관리자 테스트 초기화", billed: { $ne: true } };
const SPEND_KINDS = ["enhance", "pass-unlock"];

export async function totalBoard(M, since) {
  // 1) 사람마다 세기 시작하는 시각 — 구간 안의 마지막 초기화(XP 쪽 · 반영된 것만)와 지금 문서가 생긴 시각 중 늦은 쪽
  //    📌 2026-10-04 퇴장 초기화(bot features/leaveReset.js)도 문서를 지운 시각에 Payout(kind "reset" · 금액 0 · paid)을 남긴다 — 관리자 초기화와 같이 여기서 잡힌다.
  //       그 기록이 없던 예전 퇴장(또는 기록 쓰기가 실패한 퇴장)은 다시 생긴 문서의 생성 시각(_id)부터 센다.
  //       XP 를 쓰려면 잔액이 든 문서가 먼저 있어야 하므로 정상 지출은 생성 시각보다 앞서지 않는다(_id 는 초 단위로 내림)
  const [resets, born] = await Promise.all([
    M.Payout.aggregate([
      { $match: { userId: { $nin: ["", null] }, status: "paid", currency: { $ne: "point" }, $or: RESET_PAYOUT } },
      { $addFields: { at: { $ifNull: ["$paidAt", "$createdAt"] } } },
      { $match: { at: { $gte: since } } },
      { $group: { _id: "$userId", at: { $max: "$at" } } },
    ]),
    M.UserXp.find({ _id: { $gt: M.ObjectId.createFromTime(Math.floor(since.getTime() / 1000)) } }, { userId: 1 }).lean(),
  ]);
  const floor = new Map(resets.map((r) => [r._id, r.at]));
  for (const d of born) {
    const at = d._id.getTimestamp();
    const cur = floor.get(d.userId);
    if (d.userId && at > since && !(cur && cur >= at)) floor.set(d.userId, at);
  }
  const users = [...floor.keys()];
  const times = users.map((u) => floor.get(u));
  // 이 줄의 사람이 그 시각보다 앞선 줄은 버린다(같은 시각은 센다)
  const afterReset = users.length
    ? [{
        $match: {
          $expr: {
            $let: {
              vars: { i: { $indexOfArray: [{ $literal: users }, "$userId"] } },
              in: { $or: [{ $lt: ["$$i", 0] }, { $gte: ["$at", { $arrayElemAt: [{ $literal: times }, "$$i"] }] }] },
            },
          },
        },
      }]
    : [];

  // 2) 쓴 XP — 출처마다 사람별 합(결제 · 비용은 +, 돌려받은 것은 −)
  const [buys, backs, costs] = await Promise.all([
    M.Purchase.aggregate([
      { $match: { createdAt: { $gte: since }, userId: { $nin: ["", null] } } },
      { $project: { userId: 1, at: "$createdAt", v: paidXpOf } },
      { $match: { v: { $gt: 0 } } },
      ...afterReset,
      { $group: { _id: "$userId", v: { $sum: "$v" } } },
    ]),
    M.Purchase.aggregate([
      { $match: { status: { $in: ["cancelled", "refunded"] }, userId: { $nin: ["", null] }, $nor: [TEST_RESET] } },
      { $project: { userId: 1, at: { $ifNull: ["$revokedAt", { $ifNull: ["$processedAt", "$createdAt"] }] }, v: paidXpOf } },
      { $match: { at: { $gte: since }, v: { $gt: 0 } } },
      ...afterReset,
      { $group: { _id: "$userId", v: { $sum: { $multiply: ["$v", -1] } } } },
    ]),
    M.WalletLog.aggregate([
      { $match: { createdAt: { $gte: since }, kind: { $in: SPEND_KINDS }, currency: { $ne: "point" }, amount: { $ne: 0 } } },
      { $project: { userId: 1, at: "$createdAt", v: { $multiply: ["$amount", -1] } } },
      ...afterReset,
      { $group: { _id: "$userId", v: { $sum: "$v" } } },
    ]),
  ]);
  const spent = new Map();
  for (const r of [...buys, ...backs, ...costs]) {
    if (!r._id) continue;
    spent.set(r._id, (spent.get(r._id) || 0) + (r.v || 0));
  }

  // 3) 보유 XP 가 있거나 쓴 기록이 있는 사람 — 다 써서 보유 0 인 사람도 누적에는 선다
  const docs = await M.UserXp.find(
    { $or: [{ xp: { $gt: 0 } }, ...(spent.size ? [{ userId: { $in: [...spent.keys()] } }] : [])] },
    { userId: 1, displayName: 1, username: 1, xp: 1, level: 1, attendCount: 1 }
  ).lean();

  return docs
    .map((d) => ({
      userId: d.userId,
      xp: (d.xp || 0) + (spent.get(d.userId) || 0),
      name: d.displayName || d.username || "",
      level: d.level ?? 0,
      attendCount: d.attendCount || 0,
    }))
    .filter((r) => r.userId && r.xp > 0)
    .sort(byXpThenId);
}
// ═══ 공용 블록 끝 ═══
