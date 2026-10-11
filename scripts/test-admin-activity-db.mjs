// 📌 관리 › 이상 활동(2026-10-11 "조회 중 오류" — DB 정렬 한도) — 음성 셈 JS 판(voiceActivityRows)이 DB 판(voicePipeline)과 같은 값을 내는지,
//    그리고 라우트(app/api/admin/activity)가 끝까지 도는지 실제 MongoDB 시험용 DB 에서 본다.
//    시험용 DB "pi_activitytest_20261011" 에서만 돈다(URI 안의 기본 DB = 실사이트는 읽지도 쓰지도 않는다). 끝나면(성공 · 실패 모두) 지운다.
//    사용 (저장소 루트에서): node scripts/test-admin-activity-db.mjs
import { registerHooks } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DB = "pi_activitytest_20261011";
const MOCKS = {
  "/lib/mongodb.js": "export async function connectToDatabase() { return globalThis.__testMongoose; }",
  "/lib/apiAuth.js": "export async function denyIfNotAdmin() { return null; } export async function requireAdmin() { return { session: null, name: 'test', userId: '' }; } export const getSession = async () => null;",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const spec = specifier.startsWith("@/") ? pathToFileURL(path.join(ROOT, specifier.slice(2))).href : specifier;
    let r;
    try {
      r = nextResolve(spec, context);
    } catch (e) {
      if (e?.code !== "ERR_MODULE_NOT_FOUND" && e?.code !== "ERR_UNSUPPORTED_DIR_IMPORT") throw e;
      for (const ext of [".js", "/index.js"]) {
        try { r = nextResolve(spec + ext, context); break; } catch { /* 다음 후보 */ }
      }
      if (!r) throw e;
    }
    const hit = Object.keys(MOCKS).find((k) => r.url.replace(/\\/g, "/").endsWith(k));
    if (hit) return { url: `data:text/javascript,${encodeURIComponent(MOCKS[hit])}`, format: "module", shortCircuit: true };
    return r;
  },
});

function readMongoUri() {
  const text = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?MONGODB_URI\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return "";
}

const mongoose = (await import("mongoose")).default;
globalThis.__testMongoose = mongoose;
const conn = mongoose.connection;
const onTestDb = () => conn?.db?.databaseName === TEST_DB && conn.name === TEST_DB;
const guard = () => { if (!onTestDb()) throw new Error(`⛔ 붙은 DB 가 ${TEST_DB} 가 아님(${conn?.db?.databaseName}) — 중단`); };
const uri = readMongoUri();
if (!uri) { console.error(".env.local 에 MONGODB_URI 가 없습니다."); process.exit(2); }
await mongoose.connect(uri, { dbName: TEST_DB, serverSelectionTimeoutMS: 20000 });
if (!onTestDb()) { console.error("⛔ 시험용 DB 가 아님 — 끝냄"); await mongoose.disconnect().catch(() => {}); process.exit(2); }

let pass = 0, fail = 0;
const check = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${String(e?.message || e).split("\n").slice(0, 6).join("\n       ")}`); }
};

try {
  guard();
  const XpLog = (await import("../models/XpLog.js")).default;
  const BotSetting = (await import("../models/BotSetting.js")).default;
  const UserXp = (await import("../models/UserXp.js")).default;
  const A = await import("../lib/adminActivity.js");
  const { kstDaysStart } = await import("../lib/kst.js");
  await XpLog.init(); // createdAt 색인(라우트 hint) — 시험용 DB 에도 만든다

  // ── 가짜 기록 — 정해진 씨앗. 같은 시각 줄이 없게 1ms 씩 민다(같은 시각의 차례는 두 판 모두 정해져 있지 않다)
  let seed = 20261011;
  const R = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = (a) => a[Math.floor(R() * a.length)];
  const users = ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"];
  const chans = ["c1", "c2", "c3", ""];
  const now = Date.now();
  const startMs = now - 9 * 86400e3;
  const docs = [];
  const used = new Set();
  const stamp = (ms) => { let t = Math.floor(ms); while (used.has(t)) t++; used.add(t); return new Date(t); };
  for (const u of users) {
    let t = startMs + R() * 3600e3;
    while (t < now - 60e3) {
      // 음성 머묾 한 덩어리 — 5분 줄 여러 개(가끔 짧은 줄 · 채널 옮김 · 빈 주기)
      const ch = pick(chans);
      const len = 1 + Math.floor(R() * 30);
      let c = ch;
      for (let i = 0; i < len && t < now - 60e3; i++) {
        if (R() < 0.08) c = pick(chans);
        const legacy = R() < 0.25;
        const sec = legacy ? undefined : R() < 0.15 ? 1 + Math.floor(R() * 299) : 300;
        const hasCtx = !legacy && R() < 0.85;
        const doc = {
          userId: u, displayName: `이름${u}`, reason: "voice", channelId: c, channelName: c,
          amount: R() < 0.2 ? Math.floor(R() * 900) : 1000 + Math.floor(R() * 2000),
          createdAt: stamp(t),
        };
        if (sec !== undefined) doc.sec = sec;
        if (hasCtx) {
          doc.ctx = { n: 1 + Math.floor(R() * 4), mute: R() < 0.3, deaf: R() < 0.15, live: R() < 0.1 };
          if (R() < 0.8) doc.ctx.idle = Math.floor(R() * 120);
        }
        docs.push(doc);
        if (R() < 0.25) docs.push({ userId: u, displayName: `이름${u}`, reason: "chat", channelId: "t1", amount: 50 + Math.floor(R() * 450), createdAt: stamp(t - R() * 280e3) });
        t += (sec ?? 300) * 1000 + (R() < 0.06 ? 500e3 + R() * 900e3 : R() * 20e3);
      }
      t += 1800e3 + R() * 6 * 3600e3;
    }
    // 출석 줄(세지 않는다) · 기간 밖 채팅
    docs.push({ userId: u, reason: "attend", amount: 100, createdAt: stamp(now - R() * 86400e3) });
  }
  docs.push({ userId: "u9", reason: "chat", channelId: "t1", amount: 100, createdAt: stamp(now - 2 * 3600e3) }); // 채팅만 한 사람
  await XpLog.insertMany(docs);
  await BotSetting.collection.insertOne({ key: "main", voiceXp: 1000 });
  await UserXp.collection.insertMany(users.map((u) => ({ userId: u, displayName: `닉${u}`, username: `user_${u}` })));
  console.log(`가짜 기록 ${docs.length}줄`);

  const near = (a, b) => (a == null || b == null ? a === b : Math.abs(a - b) < 1e-6);
  const sameRows = (dbRows, jsRows) => {
    const key = (r) => String(r._id);
    const d = new Map(dbRows.map((r) => [key(r), r]));
    const j = new Map(jsRows.map((r) => [key(r), r]));
    assert.deepEqual([...j.keys()].sort(), [...d.keys()].sort(), "유저 목록이 다름");
    for (const [k, dr] of d) {
      const jr = j.get(k);
      for (const f of Object.keys(dr)) {
        if (f === "_id") continue;
        if (!near(dr[f], jr[f])) throw new Error(`${k}.${f}: DB ${dr[f]} ≠ JS ${jr[f]}`);
      }
      for (const f of Object.keys(jr)) if (!(f in dr) && jr[f] != null) throw new Error(`${k}.${f}: JS 에만 ${jr[f]}`);
    }
  };

  for (const [period, days] of Object.entries(A.ACTIVITY_PERIODS)) {
    await check(`음성 셈 DB 판 = JS 판 · ${period}`, async () => {
      guard();
      const since = kstDaysStart(days);
      const dbRows = await XpLog.aggregate(A.voicePipeline({ since, baseXp: 1000 }));
      const found = await XpLog.find(A.voiceFindFilter(since), A.VOICE_FIND_FIELDS).sort({ createdAt: 1 }).hint({ createdAt: 1 }).lean();
      const jsRows = A.voiceActivityRows(found, { since, baseXp: 1000 });
      assert.ok(dbRows.length > 0, "DB 판 결과가 비었음");
      sameRows(dbRows, jsRows);
    });
  }
  await check("기본 음성 XP 0 이면 예전 줄 음소거 0(DB 판과 같다)", async () => {
    guard();
    const since = kstDaysStart(7);
    const dbRows = await XpLog.aggregate(A.voicePipeline({ since, baseXp: 0 }));
    const found = await XpLog.find(A.voiceFindFilter(since), A.VOICE_FIND_FIELDS).sort({ createdAt: 1 }).lean();
    sameRows(dbRows, A.voiceActivityRows(found, { since, baseXp: 0 }));
  });
  await check("줄 차례가 섞여 들어와도 같은 값(시각순으로 다시 세운다 — 채팅은 앞 줄에서 세므로 시각순 입력이 전제)", async () => {
    guard();
    const since = kstDaysStart(30);
    const found = await XpLog.find(A.voiceFindFilter(since), A.VOICE_FIND_FIELDS).sort({ createdAt: 1 }).lean();
    const a = A.voiceActivityRows(found, { since, baseXp: 1000 });
    const voiceOnly = found.filter((d) => d.reason === "voice");
    assert.ok(voiceOnly.length > 0);
    // 채팅 줄 없이 음성 줄 차례만 거꾸로 — busy 를 뺀 값(n · sec · 혼자 · 연속)은 같아야 한다
    const b = A.voiceActivityRows([...voiceOnly].reverse(), { since, baseXp: 1000 });
    const c = A.voiceActivityRows(voiceOnly, { since, baseXp: 1000 });
    sameRows(c, b);
    assert.equal(a.length, c.length);
  });

  await check("라우트가 읽는 모양(voiceScanPipeline → fromVoiceScan)도 DB 판과 같다", async () => {
    guard();
    for (const days of [1, 7, 30]) {
      const since = kstDaysStart(days);
      const scanned = (await XpLog.aggregate(A.voiceScanPipeline(since)).hint({ createdAt: 1 })).map(A.fromVoiceScan);
      const dbRows = await XpLog.aggregate(A.voicePipeline({ since, baseXp: 1000 }));
      sameRows(dbRows, A.voiceActivityRows(scanned, { since, baseXp: 1000 }));
    }
  });
  await check("읽기 단계에 정렬(SORT)이 없다 — createdAt 색인 차례 그대로(정렬 한도에 안 걸린다)", async () => {
    guard();
    const ex = await XpLog.aggregate(A.voiceScanPipeline(kstDaysStart(30))).hint({ createdAt: 1 }).explain("queryPlanner");
    const text = JSON.stringify(ex);
    assert.ok(/IXSCAN/.test(text), "색인을 안 씀");
    assert.ok(!/"stage":"SORT"/.test(text), "SORT 단계가 있음");
  });

  // ── 라우트 끝까지(관리자 확인만 바꿔 끼움)
  const { GET } = await import("../app/api/admin/activity/route.js");
  for (const period of ["today", "7d", "30d"]) {
    await check(`라우트 GET period=${period} 성공 · 줄 모양`, async () => {
      guard();
      const res = await GET(new Request(`http://localhost/api/admin/activity?period=${period}&sort=score`));
      const j = await res.json();
      assert.equal(res.status, 200, JSON.stringify(j).slice(0, 200));
      assert.equal(j.success, true);
      assert.ok(Array.isArray(j.data.rows));
      if (period !== "today") assert.ok(j.data.rows.length > 0, "줄이 없음");
      for (const r of j.data.rows) {
        for (const f of ["voiceN", "voiceSec", "dayMaxSec", "streakSec", "aloneRate", "mutedRate", "score"]) assert.ok(Number.isFinite(r[f]), `${r.userId}.${f}`);
        assert.ok(r.displayName, "이름 없음");
      }
      // 채팅만 한 사람(u9)은 음성 0 으로 같이 나온다(예전과 같다)
      if (period !== "today") {
        const u9 = j.data.rows.find((r) => r.userId === "u9");
        assert.ok(u9 && u9.voiceN === 0 && u9.chatN === 1, `u9 ${JSON.stringify(u9)}`);
      }
    });
  }
} catch (e) {
  fail++;
  console.log("FAIL (준비 중)", e);
} finally {
  try { guard(); await conn.db.dropDatabase(); console.log("시험용 DB 지움"); } catch (e) { console.log("⚠ 시험용 DB 지우기 실패:", e?.message); }
  await mongoose.disconnect().catch(() => {});
}
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
