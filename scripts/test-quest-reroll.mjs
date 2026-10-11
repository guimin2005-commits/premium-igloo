// 퀘스트 바꾸기(리롤) 검사 — node scripts/test-quest-reroll.mjs
//    lib/questKinds.js 공용 블록 computeQuestState(M, userId, opt) 의 opt.reroll · opt.paid · opt.dry · opt.over 와, 바꾸기 없이 조회하는 기존 동작,
//    lib/quests.js rerollQuestPaid(차감 → 바꾸기 → 실패 시 환불 · 원장)를 본다.
//    모델(M.DailyQuest · QuestClaim · UserXp · BotSetting · QuestPick · XpLog · ActivityStat · Purchase · WalletLog · Payout)과 지갑은 메모리 가짜 —
//    DB · 서버 없이 돈다(쓰기는 가짜 저장소에만. lib/quests.js 를 불러오려고 MONGODB_URI 에 연결되지 않는 주소를 넣는다 — 연결은 하지 않는다).
//    규칙: 1) 주기마다 BotSetting questReroll* 번(칸이 없으면 3 · 0 = 무료 없음 · 최대 5) · 무료
//          1b) 무료를 다 쓰면 그다음부터 회차마다 questRerollPrice* 빙옥(칸이 없으면 일일 1 · 주간 2 · 월간 3 · 0 = 유료 끔 · 최대 100) ·
//              유료 횟수 제한 없음(후보가 남는 한) · opt.paid 가 그 값과 같아야 진행(아니면 402) · rr 은 무료 · 유료 모두 오른다
//          2) 달성하지 않은(done=false) · 받지 않은 퀘스트만
//          3) 새 퀘스트 = 그 주기 후보(주기 시작 전에 만든 활성 퀘스트, 일일은 오늘 요일) 중 뽑기와 같은 순서의 첫째 —
//             지금 목록 · 이번 주기에 받은 것 · 이번 주기에 바꿔 버린 것(out) 제외. 후보가 없으면 can=false
//          4) 바꿔 버린 퀘스트는 빈자리 채우기 후보에서도 빠진다
//          5) 저장은 QuestPick { key, ids, rr } 가 읽은 그대로일 때만($set ids · rr+1, $addToSet out) — 아니면 409
//          6) dry 는 저장 없이 바뀐 상태(over)로 다시 센 결과 + rerolled.dry=true
//          7) rerollQuestPaid 는 유료 회차에 expectedPoint(화면이 본 pool[주기].reroll.price)가 지금 값과 같을 때만 뺀다(없으면 402 PRICE_REQUIRED · 다르면 409 PRICE_CHANGED) ·
//             저장한 뒤 다시 세기가 실패해도 바꾸기는 성공(뺀 빙옥을 되돌리지 않는다)
//    날짜 — 공용 블록의 KST 경계 함수가 지금 시각을 쓴다. 퀘스트 _id 의 만든 시각(ObjectId 앞 8자리)을 40일 전(어느 주기 시작보다도 앞)으로 만든다.
//    (KST 자정 · 월요일 0시 · 1일 0시를 지나는 순간에 돌리면 주기 키가 바뀌어 틀릴 수 있다)
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { computeQuestState, questPeriodKey, shuffleQuests } from "../lib/questKinds.js";

// 사이트 코드의 "@/…" 별칭과 확장자 없는 import 를 node 에서도 풀어 준다(scripts/test-catalog-draft.mjs 와 같은 식)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    const spec = specifier.startsWith("@/") ? pathToFileURL(path.join(ROOT, specifier.slice(2))).href : specifier;
    try {
      return nextResolve(spec, context);
    } catch (e) {
      if (e?.code !== "ERR_MODULE_NOT_FOUND" && e?.code !== "ERR_UNSUPPORTED_DIR_IMPORT") throw e;
      for (const ext of [".js", "/index.js"]) {
        try { return nextResolve(spec + ext, context); } catch { /* 다음 후보 */ }
      }
      throw e;
    }
  },
});
// lib/mongodb.js 는 불러올 때 이 값이 있는지만 본다 — 늘 연결되지 않는 주소로 덮는다(실제 주소가 환경에 있어도 검사가 DB 에 닿지 않게)
process.env.MONGODB_URI = "mongodb://127.0.0.1:9/test-quest-reroll-never-connects";
const { rerollQuestPaid } = await import("../lib/quests.js");

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${String(e?.message || e).split("\n").join("\n       ")}`);
  }
}
const section = (t) => console.log(`\n[${t}]`);

// ── 가짜 DB ──
//    find/findOne(조건, 투영) → sort/limit/lean 체인 · updateOne(조건 일치 · $set/$setOnInsert/$addToSet · upsert) · aggregate(정해 둔 묶음).
//    조건: 같음(배열은 통째로 같음, 문서 칸이 배열이면 원소 포함) · $in(null 은 칸 없음도) · $gte. 모르는 연산자는 던진다(검사가 놓치지 않게)
const clone = (v) => structuredClone(v);
const isOp = (c) => c != null && typeof c === "object" && !Array.isArray(c) && !(c instanceof Date) && Object.keys(c).some((k) => k.startsWith("$"));
const same = (a, b) => {
  if (b === null || b === undefined) return a === null || a === undefined;
  if (b instanceof Date) return a != null && new Date(a).getTime() === b.getTime();
  if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (Array.isArray(a)) return a.some((x) => same(x, b));
  return a === b;
};
const cmp = (a, b) => {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  if (x === y) return 0;
  if (x == null) return -1;
  if (y == null) return 1;
  return x < y ? -1 : 1;
};
const condOk = (v, c) => {
  if (!isOp(c)) return same(v, c);
  return Object.entries(c).every(([op, arg]) => {
    if (op === "$in") return arg.some((x) => same(v, x));
    if (op === "$gte") return v != null && cmp(v, arg) >= 0;
    throw new Error(`가짜 DB: 모르는 조건 ${op}`);
  });
};
const hit = (doc, filter = {}) => Object.entries(filter).every(([k, c]) => condOk(doc[k], c));
const project = (doc, proj) => {
  const keys = Object.entries(proj || {}).filter(([k, v]) => k !== "_id" && v).map(([k]) => k);
  if (!keys.length) {
    const o = clone(doc);
    if (proj?._id === 0) delete o._id;
    return o;
  }
  const o = {};
  if (proj._id !== 0 && "_id" in doc) o._id = doc._id;
  for (const k of keys) if (k in doc) o[k] = clone(doc[k]);
  return o;
};
const query = (rows, proj, one) => {
  let sortBy = null;
  let lim = 0;
  const run = () => {
    let list = [...rows];
    if (sortBy) {
      const ks = Object.entries(sortBy);
      list.sort((a, b) => {
        for (const [k, d] of ks) {
          const r = cmp(a[k], b[k]);
          if (r) return r * d;
        }
        return 0;
      });
    }
    if (lim) list = list.slice(0, lim);
    list = list.map((d) => project(d, proj));
    return one ? list[0] ?? null : list;
  };
  const q = {
    sort(s) { sortBy = s; return q; },
    limit(n) { lim = n; return q; },
    lean() { return Promise.resolve(run()); },
    then(ok, bad) { return Promise.resolve(run()).then(ok, bad); },
  };
  return q;
};
const UPDATE_OPS = new Set(["$set", "$setOnInsert", "$addToSet"]);
function applyUpdate(doc, update, inserting) {
  for (const [op, fields] of Object.entries(update)) {
    if (!UPDATE_OPS.has(op)) throw new Error(`가짜 DB: 모르는 수정 ${op}`);
    if (op === "$setOnInsert" && !inserting) continue;
    for (const [k, v] of Object.entries(fields)) {
      if (op === "$addToSet") {
        if (!Array.isArray(doc[k])) doc[k] = [];
        if (!doc[k].some((x) => same(x, v))) doc[k].push(clone(v));
      } else doc[k] = clone(v);
    }
  }
}
function makeModel(name, store, log, { unique = null, aggregate = null } = {}) {
  const docs = store[name];
  return {
    find(filter, proj) {
      log.push({ m: name, op: "find", filter });
      return query(docs.filter((d) => hit(d, filter)), proj, false);
    },
    findOne(filter, proj) {
      log.push({ m: name, op: "findOne", filter });
      return query(docs.filter((d) => hit(d, filter)), proj, true);
    },
    async updateOne(filter, update, options = {}) {
      log.push({ m: name, op: "updateOne", filter: clone(filter), update: clone(update), options: { ...options } });
      const doc = docs.find((d) => hit(d, filter));
      if (doc) {
        const before = JSON.stringify(doc);
        applyUpdate(doc, update, false);
        return { acknowledged: true, matchedCount: 1, modifiedCount: JSON.stringify(doc) === before ? 0 : 1, upsertedCount: 0 };
      }
      if (!options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      const nd = {};
      for (const [k, c] of Object.entries(filter)) if (!isOp(c)) nd[k] = clone(c);
      applyUpdate(nd, update, true);
      if (unique && docs.some((d) => d[unique] === nd[unique])) {
        const e = new Error("E11000 duplicate key");
        e.code = 11000;
        throw e;
      }
      docs.push(nd);
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    },
    async aggregate(pipeline) {
      log.push({ m: name, op: "aggregate", pipeline });
      return clone(aggregate ? aggregate(pipeline) : []);
    },
  };
}
// ── 가짜 DB 끝 ──

// ── 세계 만들기 ──
const U = "100000000000000001";
const OTHER = "100000000000000002";
const KEYS = { daily: questPeriodKey("daily"), weekly: questPeriodKey("weekly"), monthly: questPeriodKey("monthly") };
const K = (per, u = U) => `${per}:${KEYS[per]}:${u}`;
const TODAY = KEYS.daily;
const TODAY_DOW = new Date(`${TODAY}T00:00:00Z`).getUTCDay();
const YESTERDAY = new Date(Date.parse(`${TODAY}T00:00:00Z`) - 86400e3).toISOString().slice(0, 10);
const NOW_S = Math.floor(Date.now() / 1000);
const OLD_S = NOW_S - 40 * 86400; // 달 시작은 많아야 31일 전 — 어느 주기 시작보다도 앞
let seq = 0;
const oidAt = (sec) => sec.toString(16).padStart(8, "0") + (++seq).toString(16).padStart(16, "0");
// 퀘스트 — 기본은 채팅 1000회(달성 안 됨). at: 만든 시각(초)
const Q = (name, o = {}) => {
  const { at = OLD_S, ...rest } = o;
  return {
    _id: oidAt(at), name, desc: "", period: "daily", reason: "chat", metric: "count",
    target: 1000, rewardXp: 100, rewardPoint: 0, enabled: true, order: 0, createdAt: new Date(at * 1000), ...rest,
  };
};
const many = (n, prefix, o = {}) => Array.from({ length: n }, (_, i) => Q(`${prefix}${i + 1}`, o));
// 오늘 채팅 5회 — 목표 5 이하인 채팅 퀘스트가 달성된다
const CHAT5 = [{ _id: { r: "chat", d: TODAY, h: 12 }, n: 5, xp: 50, s: 0 }];
const pickDoc = (per, ids, extra = {}) => ({ key: K(per), u: U, per, ids: [...ids], createdAt: new Date(), ...extra });
const pastDoc = (per, key, ids, agoDays = 1) => ({ key: `${per}:${key}:${U}`, u: U, per, ids: [...ids], createdAt: new Date(Date.now() - agoDays * 86400e3) });
const claimOf = (per, questId) => ({ userId: U, date: KEYS[per], questId, createdAt: new Date() });

function world({ quests = [], setting = {}, picks = [], claims = [], user = null, buckets = [] } = {}) {
  const store = {
    DailyQuest: quests.map(clone),
    QuestClaim: claims.map(clone),
    QuestPick: picks.map(clone),
    BotSetting: setting ? [{ key: "main", ...clone(setting) }] : [],
    UserXp: user ? [{ userId: U, ...clone(user) }] : [],
    XpLog: [], ActivityStat: [], Purchase: [], WalletLog: [], Payout: [],
  };
  const log = [];
  const M = Object.fromEntries(Object.keys(store).map((n) => [
    n,
    makeModel(n, store, log, { unique: n === "QuestPick" ? "key" : null, aggregate: n === "XpLog" ? () => buckets : null }),
  ]));
  return {
    M, store, log,
    mark: () => log.length,
    // key 를 주면 그 목록 문서 쓰기만(처음 여는 다른 주기의 빈 목록 저장은 빼고 볼 때)
    writesSince: (n, key = null) => log.slice(n).filter((l) => l.op === "updateOne" && (!key || l.filter?.key === key)),
    writes: () => log.filter((l) => l.op === "updateOne"),
    doc: (per, u = U) => store.QuestPick.find((d) => d.key === K(per, u)) || null,
    off: (id) => { store.DailyQuest.find((q) => q._id === id).enabled = false; },
    call: (opt) => computeQuestState(M, U, opt),
  };
}
// 뽑기 순서 — 공용 블록과 같은 식(유저 · 주기 시드로 섞고, 직전 주기에 받은 것일수록 뒤로). pastIds = 최근 주기부터
const rankOf = (per, cands, pastIds = []) => {
  const seen = new Map();
  pastIds.slice(0, 2).forEach((ids, i) => ids.forEach((id) => { if (!seen.has(id)) seen.set(id, 2 - i); }));
  return shuffleQuests(cands, K(per)).sort((x, y) => (seen.get(x._id) || 0) - (seen.get(y._id) || 0)).map((q) => q._id);
};
const rowsOf = (s, per) => s.quests.filter((q) => q.period === per);
const idsOf = (s, per) => rowsOf(s, per).map((q) => q.id).sort();
const sorted = (a) => [...a].sort();
const rowOf = (s, id) => s.quests.find((q) => q.id === id);
// 경쟁 — 바꾸기 저장($addToSet) 직전에 한 번 other() 를 끝까지 돌린다(같은 상태를 읽은 두 요청 중 다른 쪽이 먼저 저장한 꼴)
function raceOnce(w, other) {
  let fired = false;
  let res = null;
  const M = {
    ...w.M,
    QuestPick: {
      ...w.M.QuestPick,
      async updateOne(f, u, o) {
        if (!fired && u?.$addToSet) {
          fired = true;
          res = await other();
        }
        return w.M.QuestPick.updateOne(f, u, o);
      },
    },
  };
  return { M, other: () => res };
}

// ══════════════════════════════════════════════════════
section("기존 동작 — 바꾸기 없이 조회");

await test("처음 열면 뽑기 순서 앞 N개를 저장한다($setOnInsert · upsert · 유저 · 주기)", async () => {
  const qs = many(6, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3 } });
  const s = await w.call();
  const rank = rankOf("daily", qs);
  const d = w.doc("daily");
  assert.deepEqual(d.ids, rank.slice(0, 3));
  assert.equal(d.u, U);
  assert.equal(d.per, "daily");
  assert.equal("rr" in d || "out" in d, false, "처음 저장에 rr · out 을 쓰지 않는다");
  assert.deepEqual(idsOf(s, "daily"), sorted(rank.slice(0, 3)));
  const ins = w.writes().filter((x) => x.filter.key === K("daily"));
  assert.equal(ins.length, 1);
  assert.ok(ins[0].update.$setOnInsert && ins[0].options.upsert === true);
  assert.ok(w.writes().every((x) => x.m === "QuestPick"), "QuestPick 말고는 쓰지 않는다");
  // 퀘스트가 없는 주기도 빈 목록을 저장한다(예전 그대로)
  assert.deepEqual(w.doc("weekly").ids, []);
  assert.deepEqual(w.doc("monthly").ids, []);
});

await test("다시 열면 같은 목록 · 아무것도 쓰지 않는다", async () => {
  const qs = many(6, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3 } });
  const s1 = await w.call();
  const m = w.mark();
  const s2 = await w.call();
  assert.deepEqual(idsOf(s2, "daily"), idsOf(s1, "daily"));
  assert.equal(w.writesSince(m).length, 0);
});

await test("주기 시작 뒤에 만든 퀘스트 · 오늘 요일이 아닌 일일 퀘스트 · 꺼진 퀘스트는 뽑지 않는다(노출 0 = 후보 전부)", async () => {
  const ok1 = Q("보통1");
  const ok2 = Q("보통2");
  const fresh = Q("오늘 만든 것", { at: NOW_S });
  const otherDay = Q("다른 요일", { days: [(TODAY_DOW + 1) % 7] });
  const thisDay = Q("오늘 요일", { days: [TODAY_DOW] });
  const offQ = Q("꺼짐", { enabled: false });
  const w = world({ quests: [ok1, ok2, fresh, otherDay, thisDay, offQ], setting: { questPickDaily: 0 } });
  const s = await w.call();
  assert.deepEqual(idsOf(s, "daily"), sorted([ok1._id, ok2._id, thisDay._id]));
  assert.equal(s.pool.daily.total, 5); // 켜진 것 전부(후보가 아닌 것도) — 예전 그대로
  assert.equal(s.pool.daily.shown, 3);
  assert.equal(s.pool.daily.pick, 0);
});

await test("직전 주기에 받은 퀘스트는 뒤로 미룬다", async () => {
  const qs = many(6, "일일");
  const plain = rankOf("daily", qs);
  const last = plain.slice(0, 3); // 그냥 섞으면 앞에 올 것들을 직전 주기에 받았다고 둔다
  const w = world({ quests: qs, setting: { questPickDaily: 3 }, picks: [pastDoc("daily", YESTERDAY, last)] });
  const s = await w.call();
  assert.deepEqual(idsOf(s, "daily"), sorted(plain.slice(3)));
  assert.deepEqual(w.doc("daily").ids, rankOf("daily", qs, [last]).slice(0, 3));
});

await test("끄거나 지운 자리는 남은 후보의 뽑기 순서로 채워 저장한다(읽은 목록 그대로일 때만 · 자리 그대로)", async () => {
  const qs = many(6, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3 } });
  await w.call();
  const r = rankOf("daily", qs);
  w.off(r[1]);
  // 순서는 지금 후보(꺼진 것 빼고)를 같은 시드로 섞은 것 — 그중 지금 목록에 없는 첫째
  const fill = rankOf("daily", qs.filter((q) => q._id !== r[1])).find((id) => !r.slice(0, 3).includes(id));
  const m = w.mark();
  const s = await w.call();
  assert.deepEqual(w.doc("daily").ids, [r[0], fill, r[2]]);
  const wr = w.writesSince(m);
  assert.equal(wr.length, 1);
  assert.deepEqual(wr[0].filter, { key: K("daily"), ids: [r[0], r[1], r[2]] });
  assert.deepEqual(wr[0].update, { $set: { ids: [r[0], fill, r[2]] } });
  assert.deepEqual(idsOf(s, "daily"), sorted([r[0], fill, r[2]]));
});

await test("이번 주기에 받은 자리는 꺼도 채우지 않는다", async () => {
  const qs = many(6, "일일");
  const r = rankOf("daily", qs);
  const w = world({ quests: qs, setting: { questPickDaily: 3 }, picks: [pickDoc("daily", r.slice(0, 3))], claims: [claimOf("daily", r[1])] });
  w.off(r[1]);
  const m = w.mark();
  const s = await w.call();
  assert.equal(w.writesSince(m, K("daily")).length, 0);
  assert.deepEqual(w.doc("daily").ids, r.slice(0, 3));
  assert.deepEqual(idsOf(s, "daily"), sorted([r[0], r[2]]));
});

await test("이번 주기에 받은 퀘스트는 빈자리 채우는 후보로 쓰지 않는다", async () => {
  const qs = many(6, "일일");
  const r = rankOf("daily", qs);
  const w = world({ quests: qs, setting: { questPickDaily: 3 }, picks: [pickDoc("daily", r.slice(0, 3))], claims: [claimOf("daily", r[3])] });
  w.off(r[1]);
  await w.call();
  // 받은 것(r[3])을 앞에 두지 않게 — 지금 후보 순서에서 지금 목록 · 받은 것을 뺀 첫째
  const fill = rankOf("daily", qs.filter((q) => q._id !== r[1])).find((id) => !r.slice(0, 3).includes(id) && id !== r[3]);
  assert.deepEqual(w.doc("daily").ids, [r[0], fill, r[2]]);
  assert.notEqual(fill, r[3]);
});

await test("옛 공용 목록(u \"*\")은 그 주기 끝까지 이어 쓰고 내 목록으로 저장한다", async () => {
  const qs = many(5, "일일");
  const carried = [qs[4]._id, qs[0]._id, qs[2]._id];
  const legacy = { key: `daily:${KEYS.daily}:*`, u: "*", per: "daily", ids: [...carried], createdAt: new Date() };
  const w = world({ quests: qs, setting: { questPickDaily: 2 }, picks: [legacy] });
  const s = await w.call();
  assert.deepEqual(idsOf(s, "daily"), sorted(carried)); // 노출 개수(2)가 아니라 이어 쓴 3개 그대로
  assert.deepEqual(w.doc("daily").ids, carried);
  assert.deepEqual(w.store.QuestPick.find((d) => d.u === "*").ids, carried);
});

await test("pool — total · shown · pick 은 그대로, reroll { max, used, left, price, can } 이 붙는다", async () => {
  const qs = many(6, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3 } });
  const s = await w.call();
  assert.deepEqual(s.pool.daily, { total: 6, shown: 3, pick: 3, reroll: { max: 3, used: 0, left: 3, price: 0, can: true } });
  assert.deepEqual(s.pool.weekly, { total: 0, shown: 0, pick: 0, reroll: { max: 3, used: 0, left: 3, price: 0, can: false } });
  assert.ok(rowsOf(s, "daily").every((q) => q.rerollable === true));
  assert.equal("rerolled" in s || "rerollError" in s, false);
});

// ══════════════════════════════════════════════════════
section("규칙 1 — 주기마다 정한 횟수(칸 없으면 3 · 0 = 끔 · 최대 5) · 무료");

await test("BotSetting 에 칸이 없으면 3번", async () => {
  const w = world({ quests: many(4, "일일"), setting: { questPickDaily: 3 } });
  const s = await w.call();
  for (const per of ["daily", "weekly", "monthly"]) assert.equal(s.pool[per].reroll.max, 3, per);
});

await test("BotSetting 문서가 없어도 3번(노출 0 = 전부라 can=false)", async () => {
  const w = world({ quests: many(4, "일일"), setting: null });
  const s = await w.call();
  assert.deepEqual(s.pool.daily.reroll, { max: 3, used: 0, left: 3, price: 0, can: false });
  assert.equal(rowsOf(s, "daily").length, 4);
});

await test("값 다듬기 — 9 → 5 · -2 → 0 · 2.7 → 2 · \"3\" → 3 · null → 3 · \"abc\" → 0", async () => {
  const w = world({ setting: { questRerollDaily: 9, questRerollWeekly: -2, questRerollMonthly: 2.7 } });
  const s = await w.call();
  assert.deepEqual([s.pool.daily.reroll.max, s.pool.weekly.reroll.max, s.pool.monthly.reroll.max], [5, 0, 2]);
  const w2 = world({ setting: { questRerollDaily: "3", questRerollWeekly: null, questRerollMonthly: "abc" } });
  const s2 = await w2.call();
  assert.deepEqual([s2.pool.daily.reroll.max, s2.pool.weekly.reroll.max, s2.pool.monthly.reroll.max], [3, 3, 0]);
});

await test("2번 · 유료 끔(값 0)으로 두면 두 번 바꾸고, 다 쓰면 can=false · rerollable 없음 · 세 번째는 409(저장 안 함)", async () => {
  const qs = many(7, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 2, questRerollPriceDaily: 0 } });
  const s0 = await w.call();
  assert.deepEqual(s0.pool.daily.reroll, { max: 2, used: 0, left: 2, price: 0, can: true });
  const a = await w.call({ reroll: rowsOf(s0, "daily")[0].id });
  assert.ok(a.rerolled, JSON.stringify(a.rerollError));
  assert.equal(a.rerolled.cost, 0);
  assert.deepEqual(a.pool.daily.reroll, { max: 2, used: 1, left: 1, price: 0, can: true });
  const b = await w.call({ reroll: rowsOf(a, "daily")[0].id });
  assert.ok(b.rerolled, JSON.stringify(b.rerollError));
  assert.deepEqual(b.pool.daily.reroll, { max: 2, used: 2, left: 0, price: 0, can: false });
  assert.ok(rowsOf(b, "daily").every((q) => q.rerollable === false));
  const before = clone(w.doc("daily"));
  const m = w.mark();
  const c = await w.call({ reroll: rowsOf(b, "daily")[0].id });
  assert.equal(c.rerollError?.status, 409);
  assert.equal(c.rerolled, undefined);
  assert.equal(w.writesSince(m).length, 0);
  assert.deepEqual(w.doc("daily"), before);
  assert.equal(w.doc("daily").rr, 2);
  assert.equal(w.doc("daily").out.length, 2);
});

await test("무료 0 · 유료 값 0 = 끔 — can=false · rerollable 없음 · 바꾸기 409 · 저장 안 함", async () => {
  const qs = many(6, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 0, questRerollPriceDaily: 0 } });
  const s = await w.call();
  assert.deepEqual(s.pool.daily.reroll, { max: 0, used: 0, left: 0, price: 0, can: false });
  assert.ok(rowsOf(s, "daily").every((q) => q.rerollable === false));
  const m = w.mark();
  const r = await w.call({ reroll: rowsOf(s, "daily")[0].id });
  assert.equal(r.rerollError?.status, 409);
  assert.equal(w.writesSince(m).length, 0);
});

await test("관리자가 횟수를 줄여 이미 쓴 횟수보다 작아져도 left 는 0(음수 아님) · 유료 끔이면 409", async () => {
  const qs = many(6, "일일");
  const r = rankOf("daily", qs);
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 1, questRerollPriceDaily: 0 }, picks: [pickDoc("daily", r.slice(0, 3), { rr: 3, out: [r[5]] })] });
  const s = await w.call();
  assert.deepEqual(s.pool.daily.reroll, { max: 1, used: 3, left: 0, price: 0, can: false });
  const x = await w.call({ reroll: r[0] });
  assert.equal(x.rerollError?.status, 409);
});

await test("주기마다 따로 센다 — 일일을 다 써도 주간은 그대로", async () => {
  const ds = many(5, "일일");
  const ws = many(5, "주간", { period: "weekly" });
  const w = world({ quests: [...ds, ...ws], setting: { questPickDaily: 3, questPickWeekly: 2, questRerollDaily: 1, questRerollWeekly: 1 } });
  const s = await w.call();
  const a = await w.call({ reroll: rowsOf(s, "daily")[0].id });
  assert.ok(a.rerolled);
  assert.equal(a.pool.daily.reroll.left, 0);
  assert.deepEqual(a.pool.weekly.reroll, { max: 1, used: 0, left: 1, price: 0, can: true });
  assert.ok(rowsOf(a, "weekly").every((q) => q.rerollable));
  const b = await w.call({ reroll: rowsOf(a, "weekly")[0].id });
  assert.ok(b.rerolled);
  assert.equal(b.rerolled.period, "weekly");
  assert.equal(w.doc("daily").rr, 1);
  assert.equal(w.doc("weekly").rr, 1);
});

await test("무료 — 바꾸기는 QuestPick 한 줄 말고는 아무것도 쓰지 않는다(지갑 · 원장 · 지급 없음)", async () => {
  const qs = many(5, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3 } });
  const s = await w.call();
  const m = w.mark();
  const r = await w.call({ reroll: rowsOf(s, "daily")[0].id });
  assert.ok(r.rerolled);
  const wr = w.writesSince(m);
  assert.equal(wr.length, 1);
  assert.equal(wr[0].m, "QuestPick");
});

// ══════════════════════════════════════════════════════
section("규칙 2 — 달성하지 않은 · 받지 않은 퀘스트만");

await test("달성한(done) 퀘스트는 400 · rerollable=false · 저장 안 함", async () => {
  const done = Q("달성", { target: 3 });
  const rest = many(4, "일일");
  const w = world({ quests: [done, ...rest], setting: { questPickDaily: 3 }, picks: [pickDoc("daily", [done._id, rest[0]._id, rest[1]._id])], buckets: CHAT5 });
  const s = await w.call();
  const row = rowOf(s, done._id);
  assert.equal(row.done, true);
  assert.equal(row.claimable, true);
  assert.equal(row.rerollable, false);
  assert.equal(rowOf(s, rest[0]._id).rerollable, true, "달성 안 한 다른 퀘스트는 바꿀 수 있다");
  const m = w.mark();
  const r = await w.call({ reroll: done._id });
  assert.equal(r.rerollError?.status, 400);
  assert.equal(w.writesSince(m).length, 0);
  assert.deepEqual(w.doc("daily").ids, [done._id, rest[0]._id, rest[1]._id]);
});

await test("받은 퀘스트는 400 — 진행이 줄어 done 이 풀려도(받은 뒤 기록이 바뀐 경우)", async () => {
  const qs = many(5, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3 }, picks: [pickDoc("daily", [qs[0]._id, qs[1]._id, qs[2]._id])], claims: [claimOf("daily", qs[0]._id)] });
  const s = await w.call();
  const row = rowOf(s, qs[0]._id);
  assert.equal(row.done, false);
  assert.equal(row.claimed, true);
  assert.equal(row.rerollable, false);
  const m = w.mark();
  const r = await w.call({ reroll: qs[0]._id });
  assert.equal(r.rerollError?.status, 400);
  assert.equal(w.writesSince(m).length, 0);
});

await test("달성하고 받은 퀘스트도 400", async () => {
  const done = Q("달성", { target: 3 });
  const rest = many(4, "일일");
  const w = world({
    quests: [done, ...rest], setting: { questPickDaily: 3 }, buckets: CHAT5,
    picks: [pickDoc("daily", [done._id, rest[0]._id, rest[1]._id])], claims: [claimOf("daily", done._id)],
  });
  const r = await w.call({ reroll: done._id });
  assert.equal(r.rerollError?.status, 400);
  assert.equal(rowOf(r, done._id).claimable, false);
});

// ══════════════════════════════════════════════════════
section("규칙 3 — 새 퀘스트는 뽑기와 같은 순서의 첫째");

await test("지금 목록 다음 순서로 바꾸고(자리 그대로), 두 번째는 그다음", async () => {
  const qs = many(7, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 2 } });
  await w.call();
  const r = rankOf("daily", qs);
  assert.deepEqual(w.doc("daily").ids, r.slice(0, 3));
  const a = await w.call({ reroll: r[1] });
  assert.deepEqual(a.rerolled, { period: "daily", from: { id: r[1], name: qs.find((q) => q._id === r[1]).name }, to: { id: r[3], name: qs.find((q) => q._id === r[3]).name }, dry: false, cost: 0 });
  assert.deepEqual(w.doc("daily").ids, [r[0], r[3], r[2]]);
  assert.deepEqual(idsOf(a, "daily"), sorted([r[0], r[3], r[2]]));
  const b = await w.call({ reroll: r[3] });
  assert.equal(b.rerolled.to.id, r[4]);
  assert.deepEqual(w.doc("daily").ids, [r[0], r[4], r[2]]);
  assert.deepEqual(w.doc("daily").out, [r[1], r[3]]);
});

await test("직전 주기에 받은 퀘스트는 뒤로 — 안 받은 후보가 먼저 온다", async () => {
  const qs = many(6, "일일");
  const ids = qs.map((q) => q._id);
  // 지금 [0,1,2] · 남은 후보 3 · 4 · 5 중 3 · 4 는 직전 주기에 받았다
  const w = world({
    quests: qs, setting: { questPickDaily: 3, questRerollDaily: 3 },
    picks: [pickDoc("daily", ids.slice(0, 3)), pastDoc("daily", YESTERDAY, [ids[3], ids[4]])],
  });
  const a = await w.call({ reroll: ids[0] });
  assert.equal(a.rerolled.to.id, ids[5]);
  const b = await w.call({ reroll: ids[1] });
  assert.ok([ids[3], ids[4]].includes(b.rerolled.to.id));
});

await test("직전보다 그 전 주기에 받은 것이 먼저(최근일수록 뒤)", async () => {
  const qs = many(5, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({
    quests: qs, setting: { questPickDaily: 3, questRerollDaily: 2 },
    picks: [pickDoc("daily", ids.slice(0, 3)), pastDoc("daily", YESTERDAY, [ids[3]], 1), pastDoc("daily", "1999-01-01", [ids[4]], 2)],
  });
  const a = await w.call({ reroll: ids[0] });
  assert.equal(a.rerolled.to.id, ids[4]);
  const b = await w.call({ reroll: ids[1] });
  assert.equal(b.rerolled.to.id, ids[3]);
});

await test("이번 주기에 받은 퀘스트는 오지 않는다", async () => {
  const qs = many(5, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 2 }, picks: [pickDoc("daily", ids.slice(0, 3))], claims: [claimOf("daily", ids[3])] });
  const a = await w.call({ reroll: ids[0] });
  assert.equal(a.rerolled.to.id, ids[4]);
  assert.equal(a.pool.daily.reroll.can, false, "남은 후보가 받은 것뿐");
  const b = await w.call({ reroll: ids[1] });
  assert.equal(b.rerollError?.status, 409);
});

await test("다른 주기에 받은 퀘스트 기록은 막지 않는다(주간 키로 받은 건 일일 후보와 무관)", async () => {
  const qs = many(4, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3 }, picks: [pickDoc("daily", ids.slice(0, 3))], claims: [{ userId: U, date: KEYS.weekly, questId: ids[3], createdAt: new Date() }] });
  const a = await w.call({ reroll: ids[0] });
  assert.equal(a.rerolled?.to.id, ids[3]);
});

await test("주기 시작 뒤에 만든 · 오늘 요일이 아닌 · 꺼진 · 다른 주기 퀘스트는 오지 않는다", async () => {
  const cur = many(3, "일일");
  const fresh = Q("오늘 만든 것", { at: NOW_S });
  const otherDay = Q("다른 요일", { days: [(TODAY_DOW + 1) % 7] });
  const offQ = Q("꺼짐", { enabled: false });
  const weekly = Q("주간", { period: "weekly" });
  const good = Q("되는 것", { days: [TODAY_DOW] });
  const w = world({
    quests: [...cur, fresh, otherDay, offQ, weekly, good], setting: { questPickDaily: 3, questPickWeekly: 1, questRerollDaily: 2 },
    picks: [pickDoc("daily", cur.map((q) => q._id))],
  });
  const a = await w.call({ reroll: cur[0]._id });
  assert.equal(a.rerolled.to.id, good._id);
  assert.equal(a.pool.daily.reroll.can, false);
  const b = await w.call({ reroll: cur[1]._id });
  assert.equal(b.rerollError?.status, 409);
  assert.equal(b.rerollError.error, "바꿀 수 있는 퀘스트가 없습니다.");
});

await test("주간 · 월간도 주기 시작 뒤에 만든 퀘스트는 오지 않는다", async () => {
  const ws = many(2, "주간", { period: "weekly" });
  const ms = many(2, "월간", { period: "monthly" });
  const wFresh = Q("주간 새것", { period: "weekly", at: NOW_S });
  const mFresh = Q("월간 새것", { period: "monthly", at: NOW_S });
  const w = world({
    quests: [...ws, ...ms, wFresh, mFresh], setting: { questPickWeekly: 2, questPickMonthly: 2 },
    picks: [pickDoc("weekly", ws.map((q) => q._id)), pickDoc("monthly", ms.map((q) => q._id))],
  });
  const s = await w.call();
  assert.equal(s.pool.weekly.reroll.can, false);
  assert.equal(s.pool.monthly.reroll.can, false);
  assert.equal((await w.call({ reroll: ws[0]._id })).rerollError?.status, 409);
  assert.equal((await w.call({ reroll: ms[0]._id })).rerollError?.status, 409);
});

await test("후보가 없으면 can=false · rerollable 없음 · 바꾸기 409(저장 안 함)", async () => {
  const qs = many(3, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3 } });
  const s = await w.call();
  assert.deepEqual(s.pool.daily.reroll, { max: 3, used: 0, left: 3, price: 0, can: false });
  assert.ok(rowsOf(s, "daily").every((q) => q.rerollable === false));
  const m = w.mark();
  const r = await w.call({ reroll: qs[0]._id });
  assert.equal(r.rerollError?.status, 409);
  assert.equal(w.writesSince(m).length, 0);
});

await test("노출 개수 0(전부 노출) — 후보가 남지 않아 can=false · 409", async () => {
  const qs = many(5, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 0, questRerollDaily: 5 } });
  const s = await w.call();
  assert.equal(rowsOf(s, "daily").length, 5);
  assert.deepEqual(s.pool.daily.reroll, { max: 5, used: 0, left: 5, price: 0, can: false });
  const r = await w.call({ reroll: qs[0]._id });
  assert.equal(r.rerollError?.status, 409);
});

await test("다른 주기 퀘스트 id — 주간 퀘스트를 바꾸면 주간 목록 · 주간 횟수 · 주간 후보만", async () => {
  const ds = many(4, "일일");
  const ws = many(4, "주간", { period: "weekly" });
  const w = world({
    quests: [...ds, ...ws], setting: { questPickDaily: 3, questPickWeekly: 2, questRerollDaily: 1, questRerollWeekly: 1 },
    picks: [pickDoc("daily", ds.slice(0, 3).map((q) => q._id)), pickDoc("weekly", [ws[0]._id, ws[1]._id])],
  });
  const dailyBefore = clone(w.doc("daily"));
  const a = await w.call({ reroll: ws[0]._id });
  assert.equal(a.rerolled.period, "weekly");
  assert.ok([ws[2]._id, ws[3]._id].includes(a.rerolled.to.id), "주간 후보에서만");
  assert.deepEqual(w.doc("daily"), dailyBefore);
  assert.equal(a.pool.daily.reroll.left, 1);
  assert.equal(a.pool.weekly.reroll.left, 0);
  assert.equal(w.doc("weekly").rr, 1);
  assert.deepEqual(w.doc("weekly").out, [ws[0]._id]);
});

await test("지금 목록에 없는 퀘스트 id 는 404 — 안 뽑힌 후보 · 없는 id · 바꿔 버린 것 · 꺼진 받은 자리", async () => {
  const qs = many(6, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 3 }, picks: [pickDoc("daily", ids.slice(0, 3))], claims: [claimOf("daily", ids[2])] });
  w.off(ids[2]); // 받은 뒤 꺼진 자리 — 목록(ids)엔 남지만 행이 없다
  const m = w.mark();
  assert.equal((await w.call({ reroll: ids[4] })).rerollError?.status, 404);
  assert.equal((await w.call({ reroll: "ffffffffffffffffffffffff" })).rerollError?.status, 404);
  assert.equal((await w.call({ reroll: ids[2] })).rerollError?.status, 404);
  assert.equal(w.writesSince(m, K("daily")).length, 0);
  const a = await w.call({ reroll: ids[0] });
  assert.ok(a.rerolled);
  assert.equal((await w.call({ reroll: ids[0] })).rerollError?.status, 404);
});

await test("가져온 퀘스트 진행도는 다른 퀘스트처럼 주기 시작부터 센다", async () => {
  const cur = many(3, "일일");
  const easy = Q("쉬운 것", { target: 3 });
  const w = world({ quests: [...cur, easy], setting: { questPickDaily: 3 }, picks: [pickDoc("daily", cur.map((q) => q._id))], buckets: CHAT5 });
  const a = await w.call({ reroll: cur[0]._id });
  assert.equal(a.rerolled.to.id, easy._id);
  const row = rowOf(a, easy._id);
  assert.equal(row.current, 3);
  assert.equal(row.done, true);
  assert.equal(row.claimable, true);
  assert.equal(row.rerollable, false);
});

// ══════════════════════════════════════════════════════
section("규칙 4 — 바꿔 버린 퀘스트는 빈자리 채우기에도 안 쓴다");

await test("바꾼 뒤 다른 퀘스트를 끄면, 빈자리는 바꿔 버린 것을 빼고 채운다", async () => {
  const qs = many(5, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3 }, picks: [pickDoc("daily", ids.slice(0, 3))] });
  const a = await w.call({ reroll: ids[0] });
  const to = a.rerolled.to.id;
  const left = [ids[3], ids[4]].find((x) => x !== to);
  w.off(ids[1]);
  const s = await w.call();
  assert.deepEqual(w.doc("daily").ids, [to, left, ids[2]]);
  assert.ok(!idsOf(s, "daily").includes(ids[0]));
});

await test("바꿔 온 퀘스트를 꺼도 바꿔 버린 퀘스트는 돌아오지 않는다(남은 후보가 그것뿐이면 빈 채로)", async () => {
  const qs = many(4, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3 }, picks: [pickDoc("daily", ids.slice(0, 3))] });
  const a = await w.call({ reroll: ids[0] });
  assert.equal(a.rerolled.to.id, ids[3]);
  w.off(ids[3]);
  const m = w.mark();
  const s = await w.call();
  assert.equal(w.writesSince(m).length, 0);
  assert.deepEqual(w.doc("daily").ids, [ids[3], ids[1], ids[2]]);
  assert.deepEqual(idsOf(s, "daily"), sorted([ids[1], ids[2]]));
});

await test("빈자리는 out 을 빼고, 다음 바꾸기도 out 을 빼고 고른다", async () => {
  const qs = many(6, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 3 }, picks: [pickDoc("daily", ids.slice(0, 3), { rr: 1, out: [ids[3]] })] });
  w.off(ids[1]);
  await w.call();
  const filled = w.doc("daily").ids[1];
  assert.ok([ids[4], ids[5]].includes(filled));
  const a = await w.call({ reroll: ids[0] });
  const last = [ids[4], ids[5]].find((x) => x !== filled);
  assert.equal(a.rerolled.to.id, last);
  assert.equal(a.pool.daily.reroll.can, false, "남은 것은 out 뿐");
});

// ══════════════════════════════════════════════════════
section("규칙 5 — 읽은 { key, ids, rr } 그대로일 때만 저장 · 아니면 409");

await test("저장 모양 — 처음은 rr 없음/0 조건, $set ids · rr 1, $addToSet out", async () => {
  const qs = many(6, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 2 }, picks: [pickDoc("daily", ids.slice(0, 3))] });
  const m = w.mark();
  const a = await w.call({ reroll: ids[1] });
  const to = a.rerolled.to.id;
  const wr = w.writesSince(m, K("daily"));
  assert.equal(wr.length, 1);
  assert.deepEqual(wr[0].filter, { key: K("daily"), ids: ids.slice(0, 3), rr: { $in: [null, 0] } });
  assert.deepEqual(wr[0].update, { $set: { ids: [ids[0], to, ids[2]], rr: 1 }, $addToSet: { out: ids[1] } });
  const m2 = w.mark();
  const b = await w.call({ reroll: ids[2] });
  const wr2 = w.writesSince(m2);
  assert.deepEqual(wr2[0].filter, { key: K("daily"), ids: [ids[0], to, ids[2]], rr: 1 });
  assert.deepEqual(wr2[0].update, { $set: { ids: [ids[0], to, b.rerolled.to.id], rr: 2 }, $addToSet: { out: ids[2] } });
});

await test("rr: 0 으로 저장된 문서(스키마 기본값)도 처음 바꾸기가 된다", async () => {
  const qs = many(5, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3 }, picks: [pickDoc("daily", ids.slice(0, 3), { rr: 0, out: [] })] });
  const a = await w.call({ reroll: ids[0] });
  assert.ok(a.rerolled, JSON.stringify(a.rerollError));
  assert.equal(w.doc("daily").rr, 1);
});

await test("동시에 같은 퀘스트를 두 번 — 하나만 저장, 다른 하나는 409", async () => {
  const qs = many(6, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 2 }, picks: [pickDoc("daily", ids.slice(0, 3))] });
  const race = raceOnce(w, () => w.call({ reroll: ids[0] }));
  const late = await computeQuestState(race.M, U, { reroll: ids[0] });
  const early = race.other();
  assert.ok(early?.rerolled, "먼저 저장한 쪽은 바뀐다");
  assert.equal(late.rerollError?.status, 409);
  assert.equal(late.rerollError.error, "목록이 방금 바뀌었습니다. 다시 시도해 주세요.");
  const d = w.doc("daily");
  assert.equal(d.rr, 1);
  assert.deepEqual(d.out, [ids[0]]);
  assert.deepEqual(d.ids, [early.rerolled.to.id, ids[1], ids[2]]);
});

await test("동시에 다른 퀘스트를 바꿔도 두 번째는 409(횟수가 남아 있어도)", async () => {
  const qs = many(7, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 5 }, picks: [pickDoc("daily", ids.slice(0, 3))] });
  const race = raceOnce(w, () => w.call({ reroll: ids[1] }));
  const late = await computeQuestState(race.M, U, { reroll: ids[0] });
  assert.ok(race.other()?.rerolled);
  assert.equal(late.rerollError?.status, 409);
  assert.equal(w.doc("daily").rr, 1);
  assert.deepEqual(w.doc("daily").out, [ids[1]]);
});

await test("그 사이 목록이 바뀌었으면(다른 쪽 빈자리 채우기 등) 409 · 저장된 목록 그대로", async () => {
  const qs = many(6, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 2 }, picks: [pickDoc("daily", ids.slice(0, 3))] });
  const race = raceOnce(w, async () => { w.doc("daily").ids = [ids[0], ids[5], ids[2]]; });
  const r = await computeQuestState(race.M, U, { reroll: ids[0] });
  assert.equal(r.rerollError?.status, 409);
  assert.deepEqual(w.doc("daily").ids, [ids[0], ids[5], ids[2]]);
  assert.equal(w.doc("daily").rr, undefined);
});

await test("그 사이 횟수만 바뀌었어도 409", async () => {
  const qs = many(6, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 3 }, picks: [pickDoc("daily", ids.slice(0, 3), { rr: 1, out: [ids[5]] })] });
  const race = raceOnce(w, async () => { w.doc("daily").rr = 2; });
  const r = await computeQuestState(race.M, U, { reroll: ids[0] });
  assert.equal(r.rerollError?.status, 409);
  assert.deepEqual(w.doc("daily").ids, ids.slice(0, 3));
});

await test("빈자리가 있는 채로 바꾸기 — 먼저 채워 저장하고, 채운 목록을 조건으로 바꾼다(채운 것과 다른 퀘스트)", async () => {
  const qs = many(6, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3 }, picks: [pickDoc("daily", ids.slice(0, 3))] });
  w.off(ids[1]);
  const m = w.mark();
  const a = await w.call({ reroll: ids[0] });
  assert.ok(a.rerolled, JSON.stringify(a.rerollError));
  const wr = w.writesSince(m, K("daily"));
  assert.equal(wr.length, 2);
  const filled = wr[0].update.$set.ids[1];
  assert.deepEqual(wr[1].filter.ids, [ids[0], filled, ids[2]]);
  assert.notEqual(a.rerolled.to.id, filled);
  assert.deepEqual(w.doc("daily").ids, [a.rerolled.to.id, filled, ids[2]]);
  assert.deepEqual(w.doc("daily").out, [ids[0]]);
});

await test("빈자리 채우기와 바꾸기가 엇갈려도(다른 요청이 먼저 채우고 바꿈) 오래된 횟수 · out 으로는 저장되지 않는다(409)", async () => {
  const qs = many(7, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 3 }, picks: [pickDoc("daily", ids.slice(0, 3))] });
  w.off(ids[1]);
  // 늦은 요청이 빈자리를 채우려는 순간, 다른 요청이 먼저 채우고 ids[0] 을 바꿔 버린다
  let fired = false;
  let early = null;
  const M = {
    ...w.M,
    QuestPick: {
      ...w.M.QuestPick,
      async updateOne(f, u, o) {
        if (!fired && u?.$set && !u.$addToSet && !o?.upsert) {
          fired = true;
          early = await w.call({ reroll: ids[0] });
        }
        return w.M.QuestPick.updateOne(f, u, o);
      },
    },
  };
  const late = await computeQuestState(M, U, { reroll: ids[2] });
  assert.ok(early?.rerolled, JSON.stringify(early?.rerollError));
  assert.equal(late.rerollError?.status, 409);
  const d = w.doc("daily");
  assert.equal(d.rr, 1);
  assert.deepEqual(d.out, [ids[0]]);
  assert.ok(!d.ids.includes(ids[0]), "바꿔 버린 것이 돌아오지 않는다");
  assert.equal(new Set(d.ids).size, 3);
});

await test("거절해도 지금 상태(quests · pool · keys)를 함께 돌려준다", async () => {
  const qs = many(3, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3 } });
  const r = await w.call({ reroll: qs[0]._id });
  assert.equal(r.rerollError?.status, 409);
  assert.equal(rowsOf(r, "daily").length, 3);
  assert.ok(r.pool?.daily && r.keys?.daily === KEYS.daily);
});

// ══════════════════════════════════════════════════════
section("규칙 6 — dry(테스트 사이트)는 저장 없이 바뀐 상태만");

await test("dry — 아무것도 쓰지 않는다(문서 그대로)", async () => {
  const qs = many(6, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3 } });
  const s = await w.call();
  const before = clone(w.store.QuestPick);
  const m = w.mark();
  const id = rowsOf(s, "daily")[0].id;
  const r = await w.call({ reroll: id, dry: true });
  assert.ok(r.rerolled, JSON.stringify(r.rerollError));
  assert.equal(w.writesSince(m).length, 0);
  assert.deepEqual(w.store.QuestPick, before);
});

await test("dry 결과 — 바뀐 목록 · left 하나 줄어듦 · rerolled.dry=true · 바꿔 버린 것 없음", async () => {
  const qs = many(6, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 2 } });
  await w.call();
  const r0 = rankOf("daily", qs);
  const r = await w.call({ reroll: r0[0], dry: true });
  assert.equal(r.rerolled.dry, true);
  assert.equal(r.rerolled.to.id, r0[3]);
  assert.deepEqual(idsOf(r, "daily"), sorted([r0[3], r0[1], r0[2]]));
  assert.deepEqual(r.pool.daily.reroll, { max: 2, used: 1, left: 1, price: 0, can: true });
  assert.equal(r.rerolled.cost, 0);
  const back = await w.call();
  assert.deepEqual(idsOf(back, "daily"), sorted(r0.slice(0, 3)), "새로 열면 원래대로");
  assert.deepEqual(back.pool.daily.reroll, { max: 2, used: 0, left: 2, price: 0, can: true });
});

await test("dry 가 고르는 퀘스트 = 실제로 바꿀 때 고르는 퀘스트", async () => {
  const qs = many(6, "일일");
  const ids = qs.map((q) => q._id);
  const spec = { quests: qs, setting: { questPickDaily: 3 }, picks: [pickDoc("daily", ids.slice(0, 3)), pastDoc("daily", YESTERDAY, [ids[3]])] };
  const dry = await world(spec).call({ reroll: ids[1], dry: true });
  const real = await world(spec).call({ reroll: ids[1] });
  assert.equal(dry.rerolled.to.id, real.rerolled.to.id);
  assert.deepEqual(dry.quests, real.quests);
  assert.deepEqual(dry.pool, real.pool);
});

await test("dry 를 여러 번 해도 늘 같은 결과(저장하지 않았으니 처음부터)", async () => {
  const qs = many(6, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3 } });
  const s = await w.call();
  const id = rowsOf(s, "daily")[1].id;
  const a = await w.call({ reroll: id, dry: true });
  const b = await w.call({ reroll: id, dry: true });
  assert.deepEqual(a.rerolled, b.rerolled);
  assert.deepEqual(a.quests, b.quests);
});

await test("dry 다시 세기에서도 out 을 뺀다 — 남은 후보가 바꿔 버린 것뿐이면 can=false", async () => {
  const qs = many(4, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 3 }, picks: [pickDoc("daily", ids.slice(0, 3))] });
  const r = await w.call({ reroll: ids[0], dry: true });
  assert.equal(r.rerolled.to.id, ids[3]);
  assert.deepEqual(r.pool.daily.reroll, { max: 3, used: 1, left: 2, price: 0, can: false });
  assert.ok(rowsOf(r, "daily").every((q) => q.rerollable === false));
});

await test("처음 여는 유저의 dry — 처음 목록 저장(조회와 같음) 말고는 쓰지 않는다 · rr · out 없음", async () => {
  const qs = many(6, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3 } });
  const r0 = rankOf("daily", qs);
  const r = await w.call({ reroll: r0[0], dry: true });
  assert.ok(r.rerolled?.dry);
  assert.ok(w.writes().every((x) => x.update.$setOnInsert && !x.update.$set && !x.update.$addToSet));
  assert.deepEqual(w.doc("daily").ids, r0.slice(0, 3));
  assert.equal("rr" in w.doc("daily") || "out" in w.doc("daily"), false);
});

await test("dry 도 거절 규칙은 같다 — 달성 400 · 무료 0 · 값 0 은 409 · 없는 id 404 · 유료인데 opt.paid 없으면 402", async () => {
  const done = Q("달성", { target: 3 });
  const rest = many(4, "일일");
  const picks = [pickDoc("daily", [done._id, rest[0]._id, rest[1]._id])];
  const w = world({ quests: [done, ...rest], setting: { questPickDaily: 3 }, picks, buckets: CHAT5 });
  assert.equal((await w.call({ reroll: done._id, dry: true })).rerollError?.status, 400);
  assert.equal((await w.call({ reroll: rest[3]._id, dry: true })).rerollError?.status, 404);
  const w0 = world({ quests: [done, ...rest], setting: { questPickDaily: 3, questRerollDaily: 0, questRerollPriceDaily: 0 }, picks, buckets: CHAT5 });
  assert.equal((await w0.call({ reroll: rest[0]._id, dry: true })).rerollError?.status, 409);
  const w1 = world({ quests: [done, ...rest], setting: { questPickDaily: 3, questRerollDaily: 0 }, picks, buckets: CHAT5 });
  assert.equal((await w1.call({ reroll: rest[0]._id, dry: true })).rerollError?.status, 402);
  const ok = await w1.call({ reroll: rest[0]._id, dry: true, paid: 1 });
  assert.equal(ok.rerolled?.cost, 1, JSON.stringify(ok.rerollError));
});

// ══════════════════════════════════════════════════════
section("규칙 7 — 무료를 다 쓰면 그다음부터 유료(빙옥) · 공용 블록");

await test("칸이 없으면 값 일일 1 · 주간 2 · 월간 3 — 남은 무료가 있으면 price 0, 다 쓰면 그 값", async () => {
  const ds = many(5, "일일");
  const ws = many(5, "주간", { period: "weekly" });
  const ms = many(5, "월간", { period: "monthly" });
  const setting = { questPickDaily: 2, questPickWeekly: 2, questPickMonthly: 2 };
  const fresh = await world({ quests: [...ds, ...ws, ...ms], setting }).call();
  for (const per of ["daily", "weekly", "monthly"]) assert.deepEqual(fresh.pool[per].reroll, { max: 3, used: 0, left: 3, price: 0, can: true }, per);
  const picks = [
    pickDoc("daily", ds.slice(0, 2).map((q) => q._id), { rr: 3, out: [ds[4]._id] }),
    pickDoc("weekly", ws.slice(0, 2).map((q) => q._id), { rr: 3, out: [ws[4]._id] }),
    pickDoc("monthly", ms.slice(0, 2).map((q) => q._id), { rr: 3, out: [ms[4]._id] }),
  ];
  const s = await world({ quests: [...ds, ...ws, ...ms], setting, picks }).call();
  assert.deepEqual(s.pool.daily.reroll, { max: 3, used: 3, left: 0, price: 1, can: true });
  assert.deepEqual(s.pool.weekly.reroll, { max: 3, used: 3, left: 0, price: 2, can: true });
  assert.deepEqual(s.pool.monthly.reroll, { max: 3, used: 3, left: 0, price: 3, can: true });
  assert.ok(s.quests.every((q) => q.rerollable === true), "유료도 바꿀 수 있는 줄");
});

await test("값 다듬기 — 150 → 100 · -1 → 0 · 2.9 → 2 · \"4\" → 4 · null → 기본 · \"abc\" → 0", async () => {
  const s = await world({ setting: { questRerollDaily: 0, questRerollWeekly: 0, questRerollMonthly: 0, questRerollPriceDaily: 150, questRerollPriceWeekly: -1, questRerollPriceMonthly: 2.9 } }).call();
  assert.deepEqual([s.pool.daily.reroll.price, s.pool.weekly.reroll.price, s.pool.monthly.reroll.price], [100, 0, 2]);
  const s2 = await world({ setting: { questRerollDaily: 0, questRerollWeekly: 0, questRerollMonthly: 0, questRerollPriceDaily: "4", questRerollPriceWeekly: null, questRerollPriceMonthly: "abc" } }).call();
  assert.deepEqual([s2.pool.daily.reroll.price, s2.pool.weekly.reroll.price, s2.pool.monthly.reroll.price], [4, 2, 0]);
});

await test("무료 먼저 → 다음부터 값: 두 번째는 opt.paid 없으면 402(저장 안 함), 값을 내면 바뀌고 cost · rr 2", async () => {
  const qs = many(7, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 1, questRerollPriceDaily: 1 } });
  const s0 = await w.call();
  const a = await w.call({ reroll: rowsOf(s0, "daily")[0].id });
  assert.equal(a.rerolled?.cost, 0, "첫 번째는 무료");
  assert.deepEqual(a.pool.daily.reroll, { max: 1, used: 1, left: 0, price: 1, can: true });
  assert.ok(rowsOf(a, "daily").every((q) => q.rerollable === true));
  const before = clone(w.doc("daily"));
  const m = w.mark();
  const x = await w.call({ reroll: rowsOf(a, "daily")[1].id });
  assert.equal(x.rerollError?.status, 402);
  assert.equal(x.rerollError.error, "빙옥 1개가 필요합니다.");
  assert.equal(w.writesSince(m).length, 0);
  assert.deepEqual(w.doc("daily"), before);
  assert.ok(rowsOf(x, "daily").length === 3 && x.pool.daily, "거절해도 지금 상태를 돌려준다");
  const b = await w.call({ reroll: rowsOf(a, "daily")[1].id, paid: 1 });
  assert.ok(b.rerolled, JSON.stringify(b.rerollError));
  assert.equal(b.rerolled.cost, 1);
  assert.equal(b.rerolled.dry, false);
  assert.equal(w.doc("daily").rr, 2);
  assert.equal(w.doc("daily").out.length, 2);
  assert.deepEqual(b.pool.daily.reroll, { max: 1, used: 2, left: 0, price: 1, can: true });
});

await test("opt.paid 가 값과 다르면 402 — 0 · 값보다 큼 · 소수 · 글자", async () => {
  const qs = many(6, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 0, questRerollPriceDaily: 2 }, picks: [pickDoc("daily", ids.slice(0, 3))] });
  const m = w.mark();
  for (const paid of [undefined, 0, 1, 3, 1.5, "abc", null]) {
    const r = await w.call({ reroll: ids[0], paid });
    assert.equal(r.rerollError?.status, 402, String(paid));
    assert.equal(r.rerollError.error, "빙옥 2개가 필요합니다.");
  }
  assert.equal(w.writesSince(m, K("daily")).length, 0);
  const ok = await w.call({ reroll: ids[0], paid: 2 });
  assert.equal(ok.rerolled?.cost, 2);
});

await test("무료 0 · 값 있음 — 처음부터 유료(left 0 · price 값 · can)", async () => {
  const qs = many(5, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 0, questRerollPriceDaily: 5 } });
  const s = await w.call();
  assert.deepEqual(s.pool.daily.reroll, { max: 0, used: 0, left: 0, price: 5, can: true });
  assert.equal((await w.call({ reroll: rowsOf(s, "daily")[0].id })).rerollError?.status, 402);
  const r = await w.call({ reroll: rowsOf(s, "daily")[0].id, paid: 5 });
  assert.equal(r.rerolled?.cost, 5);
  assert.equal(w.doc("daily").rr, 1);
});

await test("유료 횟수 제한 없음 — 후보가 남는 한 회차마다 같은 값 · rr 계속 오름, 후보를 다 쓰면 can=false · 409(402 아님)", async () => {
  const qs = many(10, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 1, questRerollPriceDaily: 2 } });
  let s = await w.call();
  const costs = [];
  for (let i = 0; i < 7; i++) {
    const due = s.pool.daily.reroll.price;
    const r = await w.call({ reroll: rowsOf(s, "daily")[i % 3].id, paid: due });
    assert.ok(r.rerolled, `${i}: ${JSON.stringify(r.rerollError)}`);
    costs.push(r.rerolled.cost);
    assert.equal(w.doc("daily").rr, i + 1);
    assert.equal(r.pool.daily.reroll.used, i + 1);
    s = r;
  }
  assert.deepEqual(costs, [0, 2, 2, 2, 2, 2, 2]);
  assert.deepEqual(s.pool.daily.reroll, { max: 1, used: 7, left: 0, price: 2, can: false }, "후보 7개를 다 썼다");
  assert.ok(rowsOf(s, "daily").every((q) => q.rerollable === false));
  const m = w.mark();
  const end = await w.call({ reroll: rowsOf(s, "daily")[0].id, paid: 2 });
  assert.equal(end.rerollError?.status, 409);
  assert.equal(end.rerollError.error, "바꿀 수 있는 퀘스트가 없습니다.");
  const end2 = await w.call({ reroll: rowsOf(s, "daily")[0].id });
  assert.equal(end2.rerollError?.status, 409, "후보가 없으면 값을 안 내도 402 가 아니라 409");
  assert.equal(w.writesSince(m).length, 0);
});

await test("값 0 = 유료 끔 — 무료를 다 쓰면 can=false · price 0 · 409(다 썼습니다) · opt.paid 를 줘도", async () => {
  const qs = many(7, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 1, questRerollPriceDaily: 0 } });
  const s = await w.call();
  const a = await w.call({ reroll: rowsOf(s, "daily")[0].id });
  assert.ok(a.rerolled);
  assert.deepEqual(a.pool.daily.reroll, { max: 1, used: 1, left: 0, price: 0, can: false });
  const x = await w.call({ reroll: rowsOf(a, "daily")[0].id, paid: 1 });
  assert.equal(x.rerollError?.status, 409);
  assert.equal(x.rerollError.error, "이번 주기 바꾸기를 다 썼습니다.");
});

await test("남은 무료가 있으면 opt.paid 를 줘도 무료(cost 0) — 뺀 쪽이 되돌린다", async () => {
  const qs = many(6, "일일");
  const w = world({ quests: qs, setting: { questPickDaily: 3 } });
  const s = await w.call();
  const r = await w.call({ reroll: rowsOf(s, "daily")[0].id, paid: 1 });
  assert.equal(r.rerolled?.cost, 0);
  assert.equal(w.doc("daily").rr, 1);
});

await test("거절 순서 — 없는 id 404 · 달성 400 이 402 보다 먼저", async () => {
  const done = Q("달성", { target: 3 });
  const rest = many(4, "일일");
  const w = world({ quests: [done, ...rest], setting: { questPickDaily: 3, questRerollDaily: 0 }, picks: [pickDoc("daily", [done._id, rest[0]._id, rest[1]._id])], buckets: CHAT5 });
  assert.equal((await w.call({ reroll: done._id })).rerollError?.status, 400);
  assert.equal((await w.call({ reroll: rest[3]._id })).rerollError?.status, 404);
  assert.equal((await w.call({ reroll: rest[0]._id })).rerollError?.status, 402);
});

await test("주기마다 값이 따로 — 일일 무료가 남아도 주간은 다 쓰면 주간 값(2)", async () => {
  const ds = many(5, "일일");
  const ws = many(5, "주간", { period: "weekly" });
  const w = world({ quests: [...ds, ...ws], setting: { questPickDaily: 2, questPickWeekly: 2, questRerollWeekly: 1 }, picks: [pickDoc("weekly", [ws[0]._id, ws[1]._id], { rr: 1, out: [ws[4]._id] })] });
  const s = await w.call();
  assert.equal(s.pool.daily.reroll.price, 0);
  assert.equal(s.pool.weekly.reroll.price, 2);
  assert.equal((await w.call({ reroll: ws[0]._id, paid: 1 })).rerollError?.status, 402);
  const r = await w.call({ reroll: ws[0]._id, paid: 2 });
  assert.equal(r.rerolled?.cost, 2);
  assert.equal(r.rerolled.period, "weekly");
  assert.equal(w.doc("daily").rr, undefined, "일일은 그대로");
});

await test("관리자가 무료 횟수를 늘리면 다시 무료(price 0) · 줄이면 바로 유료", async () => {
  const qs = many(8, "일일");
  const ids = qs.map((q) => q._id);
  const picks = [pickDoc("daily", ids.slice(0, 3), { rr: 2, out: [ids[6], ids[7]] })];
  const up = await world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 3 }, picks }).call();
  assert.deepEqual(up.pool.daily.reroll, { max: 3, used: 2, left: 1, price: 0, can: true });
  const down = await world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 2 }, picks }).call();
  assert.deepEqual(down.pool.daily.reroll, { max: 2, used: 2, left: 0, price: 1, can: true });
});

await test("dry 유료 — 저장 안 함 · cost 값 · used 하나 오른 모습 · opt.paid 없으면 402", async () => {
  const qs = many(6, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 1 }, picks: [pickDoc("daily", ids.slice(0, 3), { rr: 1, out: [ids[5]] })] });
  await w.call(); // 주간 · 월간 빈 목록 저장(처음 열 때)을 먼저 끝낸다
  const before = clone(w.store.QuestPick);
  assert.equal((await w.call({ reroll: ids[0], dry: true })).rerollError?.status, 402);
  const r = await w.call({ reroll: ids[0], dry: true, paid: 1 });
  assert.ok(r.rerolled, JSON.stringify(r.rerollError));
  assert.equal(r.rerolled.dry, true);
  assert.equal(r.rerolled.cost, 1);
  assert.deepEqual(r.pool.daily.reroll, { max: 1, used: 2, left: 0, price: 1, can: true });
  assert.deepEqual(w.store.QuestPick, before);
});

await test("유료도 공용 블록은 QuestPick 한 줄만 쓴다(빙옥 · 원장은 부르는 쪽)", async () => {
  const qs = many(6, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 0 }, picks: [pickDoc("daily", ids.slice(0, 3))] });
  await w.call(); // 주간 · 월간 빈 목록 저장(처음 열 때)을 먼저 끝낸다
  const m = w.mark();
  const r = await w.call({ reroll: ids[0], paid: 1 });
  assert.ok(r.rerolled);
  const wr = w.writesSince(m);
  assert.equal(wr.length, 1);
  assert.equal(wr[0].m, "QuestPick");
});

await test("동시에 유료 두 번 — 하나만 저장, 다른 하나는 409(값을 냈어도)", async () => {
  const qs = many(7, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3, questRerollDaily: 0, questRerollPriceDaily: 1 }, picks: [pickDoc("daily", ids.slice(0, 3))] });
  const race = raceOnce(w, () => w.call({ reroll: ids[1], paid: 1 }));
  const late = await computeQuestState(race.M, U, { reroll: ids[0], paid: 1 });
  assert.equal(race.other()?.rerolled?.cost, 1);
  assert.equal(late.rerollError?.status, 409);
  assert.equal(w.doc("daily").rr, 1);
});

// ══════════════════════════════════════════════════════
section("rerollQuestPaid — 차감 → 바꾸기 → 실패 시 환불 · 원장 (lib/quests.js, 가짜 지갑)");

// 가짜 지갑 — take 는 조건부 차감(모자라면 null), refund 는 더하기. 부른 순서를 seq 에 남긴다
function purse(point, { failRefund = 0, failLog = false } = {}) {
  const p = { point, seq: [], logs: [], refundFails: failRefund };
  p.take = async (u, n) => {
    p.seq.push(`take ${n}`);
    if (!(p.point >= n)) return null;
    p.point -= n;
    return { point: p.point };
  };
  p.refund = async (u, n) => {
    p.seq.push(`refund ${n}`);
    if (p.refundFails > 0) {
      p.refundFails--;
      throw new Error("가짜 환불 실패");
    }
    p.point += n;
    return { point: p.point };
  };
  p.balance = async () => {
    p.seq.push("balance");
    return p.point;
  };
  p.log = async (x) => {
    p.seq.push("log");
    if (failLog) throw new Error("가짜 원장 실패");
    p.logs.push(x);
    return x;
  };
  return p;
}
// 여섯 칸을 늘 다 준다 — 하나라도 빠지면 진짜 DB 도우미를 부르게 되니 막는다
const depsOf = (w, p, { M = w.M, ...over } = {}) => {
  const deps = {
    state: (u) => computeQuestState(M, u),
    reroll: async (u, id, o) => {
      p.seq.push(`reroll paid=${o?.paid ?? 0}${o?.dry ? " dry" : ""}`);
      return computeQuestState(M, u, { reroll: id, ...o });
    },
    take: p.take, refund: p.refund, balance: p.balance, log: p.log,
    ...over,
  };
  assert.deepEqual(Object.keys(deps).sort(), ["balance", "log", "refund", "reroll", "state", "take"]);
  return deps;
};
const paidWorld = (setting = {}, n = 7) => {
  const qs = many(n, "일일");
  const ids = qs.map((q) => q._id);
  const w = world({ quests: qs, setting: { questPickDaily: 3, ...setting }, picks: [pickDoc("daily", ids.slice(0, 3))] });
  return { w, qs, ids, nameOf: (id) => qs.find((q) => q._id === id)?.name };
};
const quietErrors = async (fn) => {
  const orig = console.error;
  const lines = [];
  console.error = (...a) => lines.push(a.map(String).join(" "));
  try { return { value: await fn(), lines }; } finally { console.error = orig; }
};

await test("무료 회차 — 빼지 않음 · 원장 없음 · cost 0 · balance 지금 잔액", async () => {
  const { w, ids } = paidWorld();
  const p = purse(5);
  const r = await rerollQuestPaid(U, ids[0], { deps: depsOf(w, p) });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.data.rerolled.cost, 0);
  assert.deepEqual(r.data.balance, { point: 5 });
  assert.equal(p.point, 5);
  assert.deepEqual(p.seq, ["reroll paid=0", "balance"]);
  assert.equal(p.logs.length, 0);
  assert.equal(w.doc("daily").rr, 1);
});

await test("유료 회차 — 먼저 값만큼 빼고(take → reroll paid=값) 원장 한 줄 · balance 뺀 뒤 잔액", async () => {
  const { w, ids, nameOf } = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 2 });
  const p = purse(5);
  const r = await rerollQuestPaid(U, ids[1], { expectedPoint: 2, deps: depsOf(w, p) });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(p.seq, ["take 2", "reroll paid=2", "log"]);
  assert.equal(p.point, 3);
  assert.deepEqual(r.data.balance, { point: 3 });
  assert.equal(r.data.rerolled.cost, 2);
  assert.equal(r.data.rerollError, undefined);
  const to = r.data.rerolled.to.id;
  assert.deepEqual(p.logs, [{
    userId: U, currency: "point", amount: -2, kind: "quest-reroll",
    label: `일일 퀘스트 바꾸기: ${nameOf(ids[1])} → ${nameOf(to)}`,
    meta: { period: "daily", from: ids[1], to },
  }]);
  assert.equal(w.doc("daily").rr, 1);
});

await test("주간 유료 — 원장 이름이 \"주간 퀘스트 바꾸기: …\" · 주간 값", async () => {
  const ws = many(5, "주간", { period: "weekly" });
  const w = world({ quests: ws, setting: { questPickWeekly: 2, questRerollWeekly: 0 }, picks: [pickDoc("weekly", [ws[0]._id, ws[1]._id])] });
  const p = purse(10);
  const r = await rerollQuestPaid(U, ws[0]._id, { expectedPoint: 2, deps: depsOf(w, p) });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(p.logs[0].amount, -2);
  assert.ok(p.logs[0].label.startsWith("주간 퀘스트 바꾸기: 주간1 → "), p.logs[0].label);
  assert.equal(p.point, 8);
});

await test("잔액 부족 — 409 빙옥이 부족합니다 · 바꾸기 안 부름 · 목록 그대로 · 원장 없음 · 지금 상태를 돌려준다", async () => {
  const { w, ids } = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 3 });
  const before = clone(w.doc("daily"));
  const p = purse(2);
  const r = await rerollQuestPaid(U, ids[0], { expectedPoint: 3, deps: depsOf(w, p) });
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
  assert.equal(r.error, "빙옥이 부족합니다.");
  assert.deepEqual(p.seq, ["take 3"]);
  assert.equal(p.point, 2);
  assert.deepEqual(w.doc("daily"), before);
  assert.ok(Array.isArray(r.data?.quests) && r.data.pool?.daily, "화면이 목록을 그대로 쓸 수 있게");
});

await test("바꾸기 409(동시에 다른 요청이 먼저 바꿈) — 뺀 만큼 환불 · 원장은 먼저 바꾼 쪽 한 줄 · 오류 그대로", async () => {
  const { w, ids } = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 1 });
  const p = purse(5);
  const race = raceOnce(w, () => rerollQuestPaid(U, ids[1], { expectedPoint: 1, deps: depsOf(w, p) }));
  const late = await rerollQuestPaid(U, ids[0], { expectedPoint: 1, deps: depsOf(w, p, { M: race.M }) });
  const early = race.other();
  assert.equal(early?.ok, true, JSON.stringify(early?.error));
  assert.equal(late.ok, false);
  assert.equal(late.status, 409);
  assert.equal(late.error, "목록이 방금 바뀌었습니다. 다시 시도해 주세요.");
  assert.equal(p.point, 4, "한 번 몫만 빠졌다");
  assert.deepEqual(p.seq, ["take 1", "reroll paid=1", "take 1", "reroll paid=1", "log", "refund 1"]);
  assert.equal(p.logs.length, 1);
  assert.equal(w.doc("daily").rr, 1);
});

await test("동시에 두 번, 잔액은 한 번 몫뿐 — 하나는 바뀌고 다른 하나는 409 빙옥이 부족합니다(환불 없음)", async () => {
  const { w, ids } = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 1 });
  const p = purse(1);
  const race = raceOnce(w, () => rerollQuestPaid(U, ids[1], { expectedPoint: 1, deps: depsOf(w, p) }));
  const first = await rerollQuestPaid(U, ids[0], { expectedPoint: 1, deps: depsOf(w, p, { M: race.M }) });
  const second = race.other();
  assert.equal(first.ok, true, JSON.stringify(first.error));
  assert.equal(second?.ok, false);
  assert.equal(second.error, "빙옥이 부족합니다.");
  assert.equal(p.point, 0);
  assert.ok(!p.seq.some((x) => x.startsWith("refund")));
  assert.equal(p.logs.length, 1);
});

await test("바꾸기가 던지면 환불하고 다시 던진다", async () => {
  const { w, ids } = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 2 });
  const p = purse(5);
  const deps = depsOf(w, p, { reroll: async () => { p.seq.push("reroll"); throw new Error("가짜 DB 오류"); } });
  await assert.rejects(() => rerollQuestPaid(U, ids[0], { expectedPoint: 2, deps }), /가짜 DB 오류/);
  assert.equal(p.point, 5);
  assert.deepEqual(p.seq, ["take 2", "reroll", "refund 2"]);
  assert.equal(p.logs.length, 0);
});

await test("그사이 값이 바뀌면(바꾸기 402) — 환불 · 402 그대로 · 저장 안 함", async () => {
  const { w, ids } = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 1 });
  const p = purse(5);
  const deps = depsOf(w, p, {
    state: async (u) => {
      const s = await computeQuestState(w.M, u);
      w.store.BotSetting[0].questRerollPriceDaily = 3; // 읽은 뒤 관리자가 값을 바꿨다
      return s;
    },
  });
  const before = clone(w.doc("daily"));
  const r = await rerollQuestPaid(U, ids[0], { expectedPoint: 1, deps });
  assert.equal(r.ok, false);
  assert.equal(r.status, 402);
  assert.equal(r.error, "빙옥 3개가 필요합니다.");
  assert.equal(p.point, 5);
  assert.deepEqual(p.seq, ["take 1", "reroll paid=1", "refund 1"]);
  assert.deepEqual(w.doc("daily"), before);
  assert.equal(r.data.rerollError, undefined, "data 에는 rerollError 를 빼고 담는다");
});

await test("그사이 무료가 생기면(값보다 적게 씀) — 뺀 만큼 돌려주고 원장 없음 · cost 0", async () => {
  const { w, ids } = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 2 });
  const p = purse(5);
  const deps = depsOf(w, p, {
    state: async (u) => {
      const s = await computeQuestState(w.M, u);
      w.store.BotSetting[0].questRerollDaily = 1; // 읽은 뒤 무료 횟수가 생겼다(또는 주기가 바뀌었다)
      return s;
    },
  });
  const r = await rerollQuestPaid(U, ids[0], { expectedPoint: 2, deps });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.data.rerolled.cost, 0);
  assert.equal(p.point, 5);
  assert.deepEqual(p.seq, ["take 2", "reroll paid=2", "refund 2"]);
  assert.equal(p.logs.length, 0);
  assert.deepEqual(r.data.balance, { point: 5 });
});

await test("바꿀 수 없는 줄은 빼지 않고 그쪽 거절 — 달성 400 · 없는 id 404 · 후보 없음 409 · 유료 끔 409", async () => {
  const done = Q("달성", { target: 3 });
  const rest = many(4, "일일");
  const picks = [pickDoc("daily", [done._id, rest[0]._id, rest[1]._id])];
  const w = world({ quests: [done, ...rest], setting: { questPickDaily: 3, questRerollDaily: 0 }, picks, buckets: CHAT5 });
  const p = purse(10);
  assert.equal((await rerollQuestPaid(U, done._id, { deps: depsOf(w, p) })).status, 400);
  assert.equal((await rerollQuestPaid(U, rest[3]._id, { deps: depsOf(w, p) })).status, 404);
  assert.equal((await rerollQuestPaid(U, "", { deps: depsOf(w, p) })).status, 400, "id 가 비면 400(바꾸기 없는 조회로 새지 않게)");
  const full = world({ quests: many(3, "일일"), setting: { questPickDaily: 3, questRerollDaily: 0 } });
  const s = await full.call();
  assert.equal((await rerollQuestPaid(U, rowsOf(s, "daily")[0].id, { deps: depsOf(full, p) })).status, 409);
  const off = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 0 });
  assert.equal((await rerollQuestPaid(U, off.ids[0], { deps: depsOf(off.w, p) })).status, 409);
  assert.ok(!p.seq.some((x) => x.startsWith("take") || x.startsWith("refund")), p.seq.join(", "));
  assert.equal(p.point, 10);
});

await test("dry 유료 — 빼지 않음(take · refund 없음) · cost 값 · balance = 뺐을 때 잔액 · 저장 · 원장 없음", async () => {
  const { w, ids } = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 2 });
  await w.call(); // 주간 · 월간 빈 목록 저장(처음 열 때)을 먼저 끝낸다
  const before = clone(w.store.QuestPick);
  const p = purse(5);
  const r = await rerollQuestPaid(U, ids[0], { dry: true, expectedPoint: 2, deps: depsOf(w, p) });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.data.rerolled.dry, true);
  assert.equal(r.data.rerolled.cost, 2);
  assert.deepEqual(r.data.balance, { point: 3 });
  assert.equal(p.point, 5);
  assert.deepEqual(p.seq, ["balance", "reroll paid=2 dry"]);
  assert.equal(p.logs.length, 0);
  assert.deepEqual(w.store.QuestPick, before);
});

await test("dry 잔액 부족 — 409 빙옥이 부족합니다 · 바꾸기 안 부름", async () => {
  const { w, ids } = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 2 });
  const p = purse(1);
  const r = await rerollQuestPaid(U, ids[0], { dry: true, expectedPoint: 2, deps: depsOf(w, p) });
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
  assert.equal(r.error, "빙옥이 부족합니다.");
  assert.deepEqual(p.seq, ["balance"]);
  assert.deepEqual(r.data.balance, { point: 1 });
});

await test("dry 무료 회차 — cost 0 · balance 그대로 · 빼지 않음", async () => {
  const { w, ids } = paidWorld();
  const p = purse(0);
  const r = await rerollQuestPaid(U, ids[0], { dry: true, deps: depsOf(w, p) });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.data.rerolled.cost, 0);
  assert.deepEqual(r.data.balance, { point: 0 });
  assert.deepEqual(p.seq, ["reroll paid=0 dry", "balance"]);
});

await test("환불이 한 번 실패하면 한 번 더 — 두 번 다 실패하면 크게 남기고 오류는 그대로", async () => {
  const one = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 1 });
  const p1 = purse(5, { failRefund: 1 });
  const deps1 = depsOf(one.w, p1, { reroll: async () => ({ quests: [], pool: {}, rerollError: { status: 409, error: "목록이 방금 바뀌었습니다. 다시 시도해 주세요." } }) });
  const r1 = await rerollQuestPaid(U, one.ids[0], { expectedPoint: 1, deps: deps1 });
  assert.equal(r1.status, 409);
  assert.equal(p1.point, 5, "두 번째 환불로 돌아왔다");
  assert.deepEqual(p1.seq, ["take 1", "refund 1", "refund 1"]);
  const two = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 1 });
  const p2 = purse(5, { failRefund: 2 });
  const deps2 = depsOf(two.w, p2, { reroll: deps1.reroll });
  const { value: r2, lines } = await quietErrors(() => rerollQuestPaid(U, two.ids[0], { expectedPoint: 1, deps: deps2 }));
  assert.equal(r2.status, 409);
  assert.equal(p2.point, 4);
  assert.ok(lines.some((l) => l.includes("환불 실패")), "로그에 남긴다");
});

await test("원장 기록이 실패해도 바꾸기는 성공(빙옥은 빠진 채 · balance 그대로)", async () => {
  const { w, ids } = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 1 });
  const p = purse(3, { failLog: true });
  const r = await rerollQuestPaid(U, ids[0], { expectedPoint: 1, deps: depsOf(w, p) });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(p.point, 2);
  assert.deepEqual(r.data.balance, { point: 2 });
});

await test("잇달아 — 잔액 10 · 무료 1 · 값 3 · 후보 4개 → 무료 1 + 유료 3 → 잔액 1 · 원장 3줄 · 다음은 409 없습니다(안 뺌)", async () => {
  const { w } = paidWorld({ questRerollDaily: 1, questRerollPriceDaily: 3 });
  const p = purse(10);
  for (let i = 0; i < 4; i++) {
    const s = await w.call();
    assert.equal(s.pool.daily.reroll.price, i === 0 ? 0 : 3, "화면이 보는 이번 값");
    const r = await rerollQuestPaid(U, rowsOf(s, "daily")[0].id, { expectedPoint: s.pool.daily.reroll.price, deps: depsOf(w, p) });
    assert.equal(r.ok, true, `${i}: ${r.error}`);
    assert.equal(r.data.rerolled.cost, i === 0 ? 0 : 3);
  }
  assert.equal(p.point, 1);
  assert.equal(p.logs.length, 3);
  assert.ok(p.logs.every((l) => l.amount === -3 && l.kind === "quest-reroll"));
  const s = await w.call();
  assert.equal(s.pool.daily.reroll.can, false);
  const takes = p.seq.filter((x) => x.startsWith("take")).length;
  const end = await rerollQuestPaid(U, rowsOf(s, "daily")[0].id, { expectedPoint: 3, deps: depsOf(w, p) });
  assert.equal(end.status, 409);
  assert.equal(p.seq.filter((x) => x.startsWith("take")).length, takes, "후보가 없으면 빼지 않는다");
});

// 📌 값 가드(검토 2026-10-11) — 유료 회차는 화면이 보여 준 값(expectedPoint = pool[주기].reroll.price)이 지금 값과 같을 때만 뺀다.
//    값을 보여 주지 않는 화면(무료만 알던 레벨 화면)에서 누르거나 다른 탭에서 무료를 먼저 쓴 채 누르면 모르는 사이 빠지던 길을 막는다
await test("값 가드 — 유료 회차에 expectedPoint 가 없으면 402 PRICE_REQUIRED · 빼지 않음 · 저장 안 함", async () => {
  const { w, ids } = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 2 });
  await w.call(); // 주간 · 월간 빈 목록 저장(처음 열 때)을 먼저 끝낸다
  const before = clone(w.store.QuestPick);
  const p = purse(5);
  const r = await rerollQuestPaid(U, ids[0], { deps: depsOf(w, p) });
  assert.equal(r.ok, false);
  assert.equal(r.status, 402);
  assert.equal(r.code, "PRICE_REQUIRED");
  assert.equal(r.error, "빙옥 2개가 필요합니다.");
  assert.ok(Array.isArray(r.data?.quests) && r.data.pool?.daily?.reroll?.price === 2, "화면이 이번 값을 바로 알 수 있게");
  for (const blank of [null, "", "  "]) {
    const r2 = await rerollQuestPaid(U, ids[0], { expectedPoint: blank, deps: depsOf(w, p) });
    assert.equal(r2.code, "PRICE_REQUIRED", JSON.stringify(blank));
  }
  assert.deepEqual(p.seq, []);
  assert.equal(p.point, 5);
  assert.deepEqual(w.store.QuestPick, before);
});

await test("값 가드 — expectedPoint 가 지금 값과 다르면 409 PRICE_CHANGED · 빼지 않음 · 같으면(글자 \"2\" 도) 진행", async () => {
  const { w, ids } = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 2 });
  const p = purse(5);
  for (const v of [1, 3, "1", "abc", 0, -2]) {
    const r = await rerollQuestPaid(U, ids[0], { expectedPoint: v, deps: depsOf(w, p) });
    assert.equal(r.status, 409, String(v));
    assert.equal(r.code, "PRICE_CHANGED");
    assert.equal(r.error, "바꾸기 값이 바뀌었습니다. 다시 확인해 주세요.");
  }
  assert.deepEqual(p.seq, []);
  const ok = await rerollQuestPaid(U, ids[0], { expectedPoint: "2", deps: depsOf(w, p) });
  assert.equal(ok.ok, true, JSON.stringify(ok.error));
  assert.deepEqual(p.seq, ["take 2", "reroll paid=2", "log"]);
  assert.equal(p.point, 3);
});

await test("다른 탭에서 무료를 먼저 씀 — 이 화면은 아직 무료(0)로 알고 누름 → 409 PRICE_CHANGED · 빼지 않음 · 새 값(1)을 돌려준다", async () => {
  const { w, ids } = paidWorld({ questRerollDaily: 1, questRerollPriceDaily: 1 });
  const p = purse(5);
  const seen = await w.call(); // 두 탭이 같은 화면을 본다
  assert.equal(seen.pool.daily.reroll.price, 0);
  const a = await rerollQuestPaid(U, ids[0], { expectedPoint: seen.pool.daily.reroll.price, deps: depsOf(w, p) });
  assert.equal(a.ok, true, JSON.stringify(a.error));
  assert.equal(a.data.rerolled.cost, 0);
  const b = await rerollQuestPaid(U, ids[1], { expectedPoint: seen.pool.daily.reroll.price, deps: depsOf(w, p) });
  assert.equal(b.status, 409);
  assert.equal(b.code, "PRICE_CHANGED");
  assert.equal(b.data.pool.daily.reroll.price, 1);
  assert.equal(p.point, 5);
  assert.ok(!p.seq.some((x) => x.startsWith("take")), p.seq.join(", "));
  assert.equal(w.doc("daily").rr, 1);
});

await test("무료 회차는 expectedPoint 를 보지 않는다 — 없거나(지금 화면) 다른 값이어도 무료로 바꾼다", async () => {
  for (const v of [undefined, 0, 5]) {
    const { w, ids } = paidWorld();
    const p = purse(5);
    const r = await rerollQuestPaid(U, ids[0], { expectedPoint: v, deps: depsOf(w, p) });
    assert.equal(r.ok, true, `${v}: ${r.error}`);
    assert.equal(r.data.rerolled.cost, 0);
    assert.equal(p.point, 5);
    assert.ok(!p.seq.some((x) => x.startsWith("take")), p.seq.join(", "));
  }
});

await test("dry 도 같은 값 가드 — 없으면 402 · 다르면 409 · 잔액도 읽지 않음", async () => {
  const { w, ids } = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 2 });
  const p = purse(5);
  const r = await rerollQuestPaid(U, ids[0], { dry: true, deps: depsOf(w, p) });
  assert.equal(r.status, 402);
  assert.equal(r.code, "PRICE_REQUIRED");
  const r2 = await rerollQuestPaid(U, ids[0], { dry: true, expectedPoint: 1, deps: depsOf(w, p) });
  assert.equal(r2.code, "PRICE_CHANGED");
  assert.deepEqual(p.seq, []);
});

await test("저장한 뒤 다시 세기가 던져도 — 바꾸기 성공 · 환불 없음 · 원장 한 줄(바뀐 채로 공짜가 되지 않게)", async () => {
  const { w, ids } = paidWorld({ questRerollDaily: 0, questRerollPriceDaily: 2 });
  const p = purse(5);
  let saved = false;
  const M = {
    ...w.M,
    QuestPick: {
      ...w.M.QuestPick,
      async updateOne(f, u, o) {
        const res = await w.M.QuestPick.updateOne(f, u, o);
        if (u?.$addToSet && res?.modifiedCount > 0) saved = true;
        return res;
      },
    },
    DailyQuest: {
      ...w.M.DailyQuest,
      find(...a) {
        if (saved) throw new Error("가짜 DB 오류(다시 세기)");
        return w.M.DailyQuest.find(...a);
      },
    },
  };
  const { value: r, lines } = await quietErrors(() => rerollQuestPaid(U, ids[0], { expectedPoint: 2, deps: depsOf(w, p, { M }) }));
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(saved, true);
  assert.equal(r.data.rerolled.cost, 2);
  assert.equal(r.data.rerolled.from.id, ids[0]);
  assert.equal(p.point, 3);
  assert.ok(!p.seq.some((x) => x.startsWith("refund")), p.seq.join(", "));
  assert.equal(p.logs.length, 1);
  assert.equal(w.doc("daily").rr, 1);
  assert.ok(!w.doc("daily").ids.includes(ids[0]));
  assert.ok(lines.some((l) => l.includes("다시 세기 실패")), lines.join(" | "));
});

// ══════════════════════════════════════════════════════
section("옛 공용 목록(u \"*\")을 이어 쓰는 주기에서 바꾸기");

await test("조회로 내 목록이 생긴 뒤 바꾸기 — 내 목록에 저장 · 공용 목록은 그대로", async () => {
  const qs = many(5, "일일");
  const carried = [qs[4]._id, qs[0]._id, qs[2]._id];
  const legacy = { key: `daily:${KEYS.daily}:*`, u: "*", per: "daily", ids: [...carried], createdAt: new Date() };
  const w = world({ quests: qs, setting: { questPickDaily: 3 }, picks: [legacy] });
  await w.call();
  const a = await w.call({ reroll: carried[1] });
  assert.ok(a.rerolled, JSON.stringify(a.rerollError));
  assert.ok([qs[1]._id, qs[3]._id].includes(a.rerolled.to.id));
  assert.deepEqual(w.doc("daily").ids, [carried[0], a.rerolled.to.id, carried[2]]);
  assert.equal(w.doc("daily").rr, 1);
  assert.deepEqual(w.doc("daily").out, [carried[1]]);
  assert.deepEqual(w.store.QuestPick.find((d) => d.u === "*").ids, carried);
  assert.equal(w.store.QuestPick.find((d) => d.u === "*").rr, undefined);
});

await test("처음 여는 요청이 곧바로 바꾸기여도 된다(이어 쓴 목록을 저장한 뒤 바꾼다)", async () => {
  const qs = many(5, "일일");
  const carried = [qs[4]._id, qs[0]._id, qs[2]._id];
  const legacy = { key: `daily:${KEYS.daily}:*`, u: "*", per: "daily", ids: [...carried], createdAt: new Date() };
  const w = world({ quests: qs, setting: { questPickDaily: 3 }, picks: [legacy] });
  const a = await w.call({ reroll: carried[0] });
  assert.ok(a.rerolled, JSON.stringify(a.rerollError));
  assert.deepEqual(w.doc("daily").ids, [a.rerolled.to.id, carried[1], carried[2]]);
  assert.deepEqual(w.store.QuestPick.find((d) => d.u === "*").ids, carried);
});

await test("이어 쓰는 주기의 dry — 공용 목록 · 내 목록 모두 그대로", async () => {
  const qs = many(5, "일일");
  const carried = [qs[4]._id, qs[0]._id, qs[2]._id];
  const legacy = { key: `daily:${KEYS.daily}:*`, u: "*", per: "daily", ids: [...carried], createdAt: new Date() };
  const w = world({ quests: qs, setting: { questPickDaily: 3 }, picks: [legacy] });
  await w.call();
  const before = clone(w.store.QuestPick);
  const a = await w.call({ reroll: carried[0], dry: true });
  assert.ok(a.rerolled?.dry);
  assert.deepEqual(w.store.QuestPick, before);
});

await test("다른 유저 목록은 건드리지 않는다", async () => {
  const qs = many(5, "일일");
  const ids = qs.map((q) => q._id);
  const theirs = { key: K("daily", OTHER), u: OTHER, per: "daily", ids: ids.slice(0, 3), createdAt: new Date() };
  const w = world({ quests: qs, setting: { questPickDaily: 3 }, picks: [pickDoc("daily", ids.slice(0, 3)), theirs] });
  const a = await w.call({ reroll: ids[0] });
  assert.ok(a.rerolled);
  assert.deepEqual(w.doc("daily", OTHER), theirs);
});

// ══════════════════════════════════════════════════════
section("무작위 순서 — 조회 · 바꾸기 · dry · 끄기 · 켜기 · 받기를 섞어도 규칙이 지켜진다");

await test("세계 120개 × 25걸음 — 목록 안 겹침 · out 은 목록에 없음 · rr = out 수(유료 끔이면 ≤ 무료 횟수) · 값 · 받은 자리 유지 · 바꾼 퀘스트는 후보였다", async () => {
  let s = 20261011;
  const rnd = (n) => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) % n; };
  const PERS = ["daily", "weekly", "monthly"];
  const seen = { real: 0, dry: 0, refused: 0, holes: 0, paid: 0, unpaid: 0 };
  for (let t = 0; t < 120; t++) {
    const fresh = new Set();
    const quests = [];
    for (const per of PERS) {
      const c = 2 + rnd(7);
      for (let i = 0; i < c; i++) {
        const o = { period: per, target: rnd(4) === 0 ? 3 : 1000, order: rnd(3) };
        if (rnd(7) === 0) o.at = NOW_S;
        if (per === "daily" && rnd(5) === 0) o.days = [rnd(2) ? TODAY_DOW : (TODAY_DOW + 1) % 7];
        const q = Q(`${per}${i}`, o);
        if (o.at) fresh.add(q._id);
        quests.push(q);
      }
    }
    const max = { daily: rnd(4), weekly: rnd(4), monthly: rnd(4) };
    const price = { daily: rnd(3), weekly: rnd(3), monthly: rnd(3) };
    const setting = {
      questPickDaily: rnd(4), questPickWeekly: rnd(4), questPickMonthly: rnd(4),
      questRerollDaily: max.daily, questRerollWeekly: max.weekly, questRerollMonthly: max.monthly,
      questRerollPriceDaily: price.daily, questRerollPriceWeekly: price.weekly, questRerollPriceMonthly: price.monthly,
    };
    const picks = rnd(2) ? [pastDoc("daily", YESTERDAY, quests.filter((q) => q.period === "daily" && rnd(2)).map((q) => q._id))] : [];
    const w = world({ quests, setting, picks, buckets: CHAT5 });
    let st = await w.call();
    const claimedIds = new Set();
    const isCand = (id, per) => {
      const q = w.store.DailyQuest.find((x) => x._id === id);
      if (!q || !q.enabled || q.period !== per || fresh.has(id)) return false;
      return per !== "daily" || !q.days || q.days.includes(TODAY_DOW);
    };
    for (let step = 0; step < 25; step++) {
      const before = clone(w.store.QuestPick);
      const op = rnd(6);
      const rows = st.quests;
      const ctx = `세계 ${t} 걸음 ${step} 동작 ${op}`;
      if (op <= 1 && rows.length) {
        // 넷 중 셋은 바꿀 수 있는 행에서 고른다(거절만 쌓이지 않게)
        const ok = rows.filter((q) => q.rerollable);
        const row = ok.length && rnd(4) ? ok[rnd(ok.length)] : rows[rnd(rows.length)];
        const dry = op === 1;
        // 다섯 중 넷은 지금 값(pool.price — 무료면 0)을 내고, 하나는 틀린 값(값 + 1)을 낸다
        const due = st.pool[row.period].reroll.price;
        const paid = rnd(5) ? due : due + 1;
        const r = await w.call({ reroll: row.id, dry, paid });
        if (r.rerolled) {
          seen[dry ? "dry" : "real"]++;
          if (r.rerolled.cost > 0) seen.paid++;
          assert.equal(row.done || row.claimed, false, `${ctx}: 달성 · 받은 퀘스트를 바꿨다`);
          assert.equal(row.rerollable, true, `${ctx}: rerollable=false 인데 바뀌었다`);
          const per = row.period;
          assert.equal(r.rerolled.period, per, ctx);
          assert.equal(r.rerolled.cost, due, `${ctx}: cost 가 화면에 보인 값과 다르다`);
          if (due > 0) assert.equal(paid, due, `${ctx}: 값을 안 냈는데 유료로 바뀌었다`);
          assert.ok(isCand(r.rerolled.to.id, per), `${ctx}: 후보가 아닌 퀘스트로 바뀌었다`);
          assert.ok(!claimedIds.has(`${per}:${r.rerolled.to.id}`), `${ctx}: 이번 주기에 받은 퀘스트로 바뀌었다`);
          const old = before.find((d) => d.key === K(per));
          assert.ok(!(old?.out || []).includes(r.rerolled.to.id), `${ctx}: 바꿔 버린 퀘스트가 돌아왔다`);
          if (dry) assert.deepEqual(w.store.QuestPick, before, `${ctx}: dry 가 저장했다`);
          else {
            const now = w.doc(per);
            assert.equal(now.ids.filter((id, i) => id !== old.ids[i]).length, 1, `${ctx}: 한 자리만 바뀌어야`);
          }
        } else {
          seen.refused++;
          assert.ok(r.rerollError, ctx);
          assert.deepEqual(w.store.QuestPick, before, `${ctx}: 거절인데 저장했다`);
          if (r.rerollError.status === 402) {
            seen.unpaid++;
            assert.ok(due > 0 && paid !== due, `${ctx}: 값을 맞게 냈는데 402`);
          } else if (row.rerollable && !row.done) assert.fail(`${ctx}: rerollable 인데 거절(${r.rerollError.status} ${r.rerollError.error})`);
          if (row.rerollable && due > 0 && paid !== due) assert.equal(r.rerollError.status, 402, `${ctx}: 값을 틀리게 냈으면 402`);
        }
      } else if (op === 2) {
        const q = w.store.DailyQuest[rnd(w.store.DailyQuest.length)];
        q.enabled = !q.enabled;
      } else if (op === 3) {
        const c = rows.filter((q) => q.claimable);
        if (c.length) {
          const q = c[rnd(c.length)];
          w.store.QuestClaim.push(claimOf(q.period, q.id));
          claimedIds.add(`${q.period}:${q.id}`);
        }
      }
      const m0 = w.mark();
      st = await w.call();
      if (w.writesSince(m0).some((x) => x.update.$set && !x.update.$addToSet)) seen.holes++;
      for (const per of PERS) {
        const d = w.doc(per);
        if (!d) continue;
        assert.equal(new Set(d.ids).size, d.ids.length, `${ctx}: ${per} 목록 겹침`);
        const out = d.out || [];
        assert.ok(out.every((id) => !d.ids.includes(id)), `${ctx}: ${per} out 이 목록에 있다`);
        assert.equal(d.rr || 0, out.length, `${ctx}: ${per} rr ≠ out 수`);
        if (price[per] === 0) assert.ok((d.rr || 0) <= max[per], `${ctx}: ${per} 유료 끔인데 무료 횟수 넘침`);
        for (const key of claimedIds) {
          const [p, id] = key.split(":");
          if (p === per) assert.ok(d.ids.includes(id), `${ctx}: 받은 자리가 빠졌다`);
        }
        const pool = st.pool[per].reroll;
        const left = Math.max(0, max[per] - (d.rr || 0));
        assert.equal(pool.left, left, `${ctx}: ${per} left`);
        assert.equal(pool.used, d.rr || 0, `${ctx}: ${per} used`);
        assert.equal(pool.price, left > 0 ? 0 : price[per], `${ctx}: ${per} price`);
        if (!(left > 0) && price[per] === 0) assert.equal(pool.can, false, `${ctx}: ${per} 무료 다 쓰고 유료 끔인데 can`);
      }
    }
  }
  // 검사가 헛돌지 않았는지 — 바꾸기 · dry · 거절 · 빈자리 채우기가 충분히 일어났어야
  console.log(`       (바꿈 ${seen.real} · dry ${seen.dry} · 유료 ${seen.paid} · 402 ${seen.unpaid} · 거절 ${seen.refused} · 빈자리 채움 ${seen.holes})`);
  assert.ok(seen.real >= 100 && seen.dry >= 100 && seen.refused >= 100 && seen.holes >= 30 && seen.paid >= 50 && seen.unpaid >= 10, JSON.stringify(seen));
});

console.log(`\n${passed} 통과 · ${failures.length} 실패`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
