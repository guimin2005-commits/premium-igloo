// 📌 관리 › 제재 · 잠수 기록(app/api/admin/sanctions) · 제재 중 첫 확인 시간(lib/afkCheck.js ↔ bot/src/features/afkCheck.js) 시험.
//    시험용 DB "pi_sanctionstest_20261013" 에서만 돈다(실사이트 DB 는 읽지도 쓰지도 않는다). 끝나면 지운다.
//    사용 (저장소 루트에서): node scripts/test-sanctions-db.mjs
import { registerHooks } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DB = "pi_sanctionstest_20261013";
const MOCKS = {
  "/lib/mongodb.js": "export async function connectToDatabase() { return globalThis.__testMongoose; }",
  "/lib/apiAuth.js": "export async function denyIfNotAdmin() { return null; } export async function requireAdmin() { return { session: null, name: 'test', userId: '' }; } export const getSession = async () => null;",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const spec = specifier.startsWith("@/") ? pathToFileURL(path.join(ROOT, specifier.slice(2))).href : specifier;
    let r;
    try { r = nextResolve(spec, context); } catch (e) {
      if (e?.code !== "ERR_MODULE_NOT_FOUND" && e?.code !== "ERR_UNSUPPORTED_DIR_IMPORT") throw e;
      for (const ext of [".js", "/index.js"]) { try { r = nextResolve(spec + ext, context); break; } catch { /* 다음 */ } }
      if (!r) throw e;
    }
    const hit = Object.keys(MOCKS).find((k) => r.url.replace(/\\/g, "/").endsWith(k));
    if (hit) return { url: `data:text/javascript,${encodeURIComponent(MOCKS[hit])}`, format: "module", shortCircuit: true };
    return r;
  },
});
const readUri = () => {
  for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?MONGODB_URI\s*=\s*(.*)$/);
    if (m) { let v = m[1].trim(); if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1); return v; }
  }
  return "";
};

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log(`  ok   ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}\n       ${String(e?.message || e).split("\n").slice(0, 6).join("\n       ")}`); } };

// ── 사이트 · 봇 같은 식(DB 없이)
const L = await import("../lib/afkCheck.js");
await t("제재 중 첫 확인 — 30 → 25 → 20 → 15 → 10 → 10(바닥)", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map((n) => L.afkSanctionWaitMin(30, n)), [30, 25, 20, 15, 10, 10, 10]);
  assert.equal(L.afkSanctionWaitMin(8, 3), 8, "기본이 10분보다 짧으면 그 값이 바닥");
  assert.equal(L.afkSanctionWaitMin(undefined, 0), 30, "설정 없음 → 30분");
});
await t("봇 afkCheck.js 의 식이 사이트와 글자 그대로 같다", () => {
  const body = (src) => {
    const a = src.indexOf("export function afkSanctionWaitMin");
    return src.slice(a, src.indexOf("\n}", a) + 2).replace(/\r/g, "");
  };
  const site = fs.readFileSync(path.join(ROOT, "lib/afkCheck.js"), "utf8");
  const bot = fs.readFileSync(path.join(ROOT, "bot/src/features/afkCheck.js"), "utf8");
  assert.equal(body(bot), body(site));
  for (const k of ["SANCTION_STEP_MIN = 5", "SANCTION_FLOOR_MIN = 10"]) assert.ok(site.includes(k) && bot.includes(k), k);
});
await t("봇 · 사이트 UserXp 칸 · AfkLog 칸이 같다", () => {
  const site = fs.readFileSync(path.join(ROOT, "models/UserXp.js"), "utf8") + fs.readFileSync(path.join(ROOT, "models/AfkLog.js"), "utf8");
  const bot = fs.readFileSync(path.join(ROOT, "bot/src/db.js"), "utf8");
  for (const k of ["afkMoves: { type: Number, default: 0 }", "afkSanctionMoves: { type: Number, default: 0 }", "afkMovedAt: { type: Date, default: null }",
    "sanctioned: { type: Boolean, default: false }", "waitMin: { type: Number, default: 0 }", "nextWaitMin: { type: Number, default: 0 }", "expires: 60 * 60 * 24 * 365"]) {
    assert.ok(site.includes(k), "사이트 " + k);
    assert.ok(bot.includes(k), "봇 " + k);
  }
});

// ── 라우트(시험용 DB)
const mongoose = (await import("mongoose")).default;
globalThis.__testMongoose = mongoose;
const conn = mongoose.connection;
const guard = () => { if (conn?.db?.databaseName !== TEST_DB) throw new Error(`⛔ 붙은 DB 가 ${TEST_DB} 가 아님`); };
const uri = readUri();
if (!uri) { console.error(".env.local 에 MONGODB_URI 가 없습니다."); process.exit(2); }
await mongoose.connect(uri, { dbName: TEST_DB, serverSelectionTimeoutMS: 20000 });
try {
  guard();
  const UserXp = (await import("../models/UserXp.js")).default;
  const AfkLog = (await import("../models/AfkLog.js")).default;
  const BotSetting = (await import("../models/BotSetting.js")).default;
  const now = Date.now(), H = 3600e3;
  await BotSetting.collection.insertOne({ key: "main", afkCheckSanctionMin: 30, afkCheckFirstMin: 60, afkCheckReplyMin: 5, afkCheckOn: true });
  await UserXp.collection.insertMany([
    { userId: "100000000000000001", displayName: "서냥", username: "suj03", voiceXpOff: false, xpStopFrom: new Date(now - 30 * H), xpStopUntil: new Date(now - 2 * H), xpStopBy: "elahw.06", xpStopReason: "도배", afkMoves: 3, afkSanctionMoves: 3, afkMovedAt: new Date(now - H) },
    { userId: "100000000000000002", displayName: "정지", username: "stop", voiceXpOff: true, voiceXpOffAt: new Date(now - 5 * H), voiceXpOffBy: "elahw.06", xpStopUntil: null },
    { userId: "100000000000000003", displayName: "예약", username: "resv", xpStopFrom: new Date(now + 5 * H), xpStopUntil: new Date(now + 50 * H) },
    { userId: "100000000000000004", displayName: "일반", username: "norm", afkMoves: 2, afkSanctionMoves: 0, afkMovedAt: new Date(now - 3 * H) },
    { userId: "100000000000000005", displayName: "깨끗", username: "clean" },
  ]);
  await AfkLog.insertMany([
    { userId: "100000000000000001", displayName: "서냥", channelName: "수다방", sanctioned: true, waitMin: 20, moves: 3, sanctionMoves: 3, nextWaitMin: 15, createdAt: new Date(now - H) },
    { userId: "100000000000000004", displayName: "일반", channelName: "게임방", sanctioned: false, waitMin: 60, moves: 2, sanctionMoves: 0, nextWaitMin: 60, createdAt: new Date(now - 3 * H) },
  ]);
  const { GET, POST } = await import("../app/api/admin/sanctions/route.js");

  await t("GET — 제재 중 셋(끝났지만 해제 안 한 중단 · 음성 정지 · 예약) · 다음 첫 확인", async () => {
    guard();
    const res = await GET();
    const j = await res.json();
    assert.equal(res.status, 200, JSON.stringify(j));
    const s = j.data.sanctioned;
    assert.deepEqual(s.map((r) => r.userId).sort(), ["100000000000000001", "100000000000000002", "100000000000000003"]);
    const sy = s.find((r) => r.displayName === "서냥");
    assert.equal(sy.xpStop.status, "ended");
    assert.equal(sy.nextWaitMin, 15, "3회 → 15분");
    assert.equal(s[0].userId, "100000000000000001", "이동 많은 사람이 위");
    assert.equal(s.find((r) => r.displayName === "예약").xpStop.status, "reserved");
    assert.ok(s.find((r) => r.displayName === "정지").voiceOff, "음성 정지");
    assert.equal(s.find((r) => r.displayName === "정지").nextWaitMin, 30);
    assert.equal(j.data.rule.floorMin, 10);
  });
  await t("GET — 잠수 이동 목록 · 기록", async () => {
    guard();
    const j = await (await GET()).json();
    assert.deepEqual(j.data.moved.map((r) => r.displayName), ["서냥", "일반"], "최근 이동 순");
    assert.equal(j.data.moved[0].sanctioned, true);
    assert.equal(j.data.moved[1].sanctioned, false);
    assert.equal(j.data.logs.length, 2);
    assert.equal(j.data.logs[0].displayName, "서냥");
  });
  await t("POST resetAfk — 횟수만 0 · 기록은 남음 · 잘못된 요청 400 · 없는 유저 404", async () => {
    guard();
    const call = (body) => POST(new Request("http://localhost/api/admin/sanctions", { method: "POST", body: JSON.stringify(body) }));
    const ok = await call({ userId: "100000000000000001", action: "resetAfk" });
    assert.equal(ok.status, 200);
    const u = await UserXp.findOne({ userId: "100000000000000001" }).lean();
    assert.equal(u.afkMoves, 0);
    assert.equal(u.afkSanctionMoves, 0);
    assert.equal(await AfkLog.countDocuments({ userId: "100000000000000001" }), 1);
    const j = await (await GET()).json();
    assert.equal(j.data.sanctioned.find((r) => r.displayName === "서냥").nextWaitMin, 30, "지우면 다시 30분");
    assert.equal((await call({ userId: "abc", action: "resetAfk" })).status, 400);
    assert.equal((await call({ userId: "100000000000000001", action: "x" })).status, 400);
    assert.equal((await call({ userId: "199999999999999999", action: "resetAfk" })).status, 404);
  });
} catch (e) {
  fail++;
  console.log("FAIL (준비 중)", e);
} finally {
  try { guard(); await conn.db.dropDatabase(); console.log("시험용 DB 지움"); } catch (e) { console.log("⚠ 시험용 DB 지우기 실패:", e?.message); }
  await mongoose.disconnect().catch(() => {});
}
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
