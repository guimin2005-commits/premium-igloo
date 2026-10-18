// 📌 머물수록 증가(voiceStay — 2026-10-18 마녀의 모래시계) 시험 — 봇 bot/src/features/voiceTime.js 를 가짜 디스코드 · 가짜 DB 로 그대로 돌린다.
//    DB · 디스코드에 닿지 않는다(db.js · voiceXp.js · botSettings.js 등은 시험용 몸으로 바꿔 끼운다). 사용 (저장소 루트에서): node scripts/test-voice-stay.mjs
//    보는 것: 같은 채널에 이어서 머문 초가 구간마다 voiceRate(staySec)로 넘어가는지 · 옮김 · 나감이면 0 · 세지 않는 동안 멈춤 ·
//            정지(XP 획득 중단)면 0 · 재시작 때 DB(UserXp.voiceStay)로 이어 감 · 복원 전 나감은 되살리지 않음 · 사이트 문구
import { registerHooks } from "node:module";
import assert from "node:assert/strict";

// ── 가짜 의존성 ──
const MOCKS = {
  "/bot/src/db.js": `
    const docs = globalThis.__docs;
    const match = (d, q) => Object.entries(q).every(([k, v]) => {
      if (k === "$or") return v.some((x) => match(d, x));
      if (k === "userId") return v && typeof v === "object" && v.$in ? v.$in.includes(d.userId) : d.userId === v;
      if (k === "voiceStay") return v.$exists ? d.voiceStay !== undefined : true;
      if (k.startsWith("voiceCycle")) return false;
      return true;
    });
    const q = (arr) => ({ lean: async () => arr.map((d) => JSON.parse(JSON.stringify(d))) });
    export const UserXp = {
      find: (query) => q([...docs.values()].filter((d) => match(d, query))),
      bulkWrite: async (ops) => {
        for (const op of ops) {
          const u = op.updateOne; const d = docs.get(u.filter.userId);
          if (!d) continue;
          if (u.update.$set) Object.assign(d, JSON.parse(JSON.stringify(u.update.$set)));
          if (u.update.$unset) for (const k of Object.keys(u.update.$unset)) delete d[k];
          if (u.update.$inc) for (const [k, v] of Object.entries(u.update.$inc)) d[k] = (d[k] || 0) + v;
        }
      },
    };`,
  "/bot/src/leveling.js": `export const kstToday = () => "2026-10-18"; export const VOICE_TIME_START = "2026-10-01";`,
  "/bot/src/channelConfigs.js": `export const getChannelPolicy = () => ({});`,
  "/bot/src/botSettings.js": `
    export const getSettings = () => ({ voiceIntervalSec: 300, voiceXp: 3000, muteMode: "block", resetOnLeave: false });
    export const getMuteMultiplier = (vs) => (vs.selfDeaf ? 0 : 1);
    export const isLevelOpen = () => globalThis.__open !== false;`,
  "/bot/src/features/voiceXp.js": `
    export const relieveMute = (m) => m;
    // 모래시계 하나(25분마다 +1% · 최대 20%) — 구간마다 받은 머문 초를 적는다
    export function voiceRate(member, channel, doc, s, n, staySec = 0) {
      globalThis.__rates.push({ user: member.id, ch: channel?.id, stay: staySec });
      return 3000;
    }
    export async function payVoiceCycle() {}`,
  "/bot/src/features/activity.js": `export const idleMinutes = () => null;`,
  "/bot/src/xpStop.js": `export const noteXpStop = () => {}; export const stopUntilOf = (d) => (d?.stop ? Date.now() + 1e9 : 0); export const notStopped = () => ({});`,
  "/bot/src/config.js": `export const config = { guildId: "g" };`,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "discord.js") return { url: `data:text/javascript,${encodeURIComponent(`export const Events = { VoiceStateUpdate: "vsu", GuildMemberRemove: "gmr" };`)}`, format: "module", shortCircuit: true };
    const r = nextResolve(specifier, context);
    const clean = r.url.replace(/\\/g, "/").replace(/\?.*$/, "");
    const hit = Object.keys(MOCKS).find((k) => clean.endsWith(k));
    if (hit) return { url: `data:text/javascript,${encodeURIComponent(MOCKS[hit])}`, format: "module", shortCircuit: true };
    return r;
  },
});

// ── 가짜 디스코드 · 시계 ──
let NOW = Date.parse("2026-10-18T12:00:00+09:00");
Date.now = () => NOW;
globalThis.setInterval = () => 0; // 기록은 손으로 부른다
const logs = [];
const origLog = console.log;
console.log = (...a) => logs.push(a.join(" "));
globalThis.__docs = new Map([["U", { userId: "U", level: 10 }]]);
globalThis.__rates = [];

function makeWorld() {
  const channels = new Map(["A", "B", "afk"].map((id) => [id, { id, name: id, parentId: "", members: { filter: () => ({ size: 1 }) } }]));
  const member = { id: "U", user: { bot: false, username: "u" }, displayName: "U" };
  const guild = { id: "g", afkChannelId: "afk", voiceStates: { cache: new Map() }, members: { cache: new Map([["U", member]]), fetch: async () => member }, channels: { cache: channels } };
  const handlers = {};
  const client = { guilds: { cache: new Map([["g", guild]]) }, on: (ev, fn) => { handlers[ev] = fn; } };
  const vsOf = (ch, extra = {}) => (ch ? { id: "U", channelId: ch, channel: channels.get(ch), member, guild, ...extra } : { id: "U", channelId: null, channel: null, member, guild });
  let cur = vsOf(null);
  const set = (ch, extra) => {
    const old = cur;
    cur = vsOf(ch, extra);
    if (ch) guild.voiceStates.cache.set("U", cur);
    else guild.voiceStates.cache.delete("U");
    handlers.vsu?.(old, cur);
  };
  return { client, guild, set, start: (ch) => { cur = vsOf(ch); if (ch) guild.voiceStates.cache.set("U", cur); } };
}

let n = 0;
const ok = (name, fn) => fn().then(() => { n++; origLog("  ✓", name); });
const lastStay = () => globalThis.__rates.at(-1)?.stay ?? null;
async function run(mod, mins) {
  for (let i = 0; i < Math.round((mins * 60) / 20); i++) {
    NOW += 20_000;
    await mod.flushVoiceTime();
  }
}

// ── 1번 프로세스 ──
const w1 = makeWorld();
const m1 = await import("../bot/src/features/voiceTime.js?p1");
m1.startVoiceTime(w1.client);

await ok("들어와 이어서 머물면 머문 초가 쌓인다(구간 시작 때 값)", async () => {
  w1.set("A");
  await run(m1, 30);
  const s = lastStay();
  assert.ok(s >= 29 * 60 - 1 && s <= 30 * 60, `30분쯤이어야 ${s}`);
});
await ok("세지 않는 동안(헤드셋 끔 — 막기)은 멈춘다 · 다시 켜면 이어 간다", async () => {
  const before = lastStay();
  w1.set("A", { selfDeaf: true });
  await run(m1, 15);
  w1.set("A", { selfDeaf: false });
  await run(m1, 1);
  const s = lastStay();
  assert.ok(s >= before && s <= before + 80, `멈춘 15분은 안 쌓여야 ${before} → ${s}`);
});
await ok("DB 에 머문 초가 적힌다(같은 채널 · 시각)", async () => {
  const d = globalThis.__docs.get("U");
  assert.equal(d.voiceStay?.ch, "A");
  assert.ok(d.voiceStay.sec > 1800, `${d.voiceStay.sec}`);
});
await ok("다른 채널로 옮기면 0 부터", async () => {
  w1.set("B");
  await run(m1, 2);
  const s = lastStay();
  assert.ok(s <= 120, `옮긴 뒤 ${s}`);
});
await ok("나갔다 같은 채널로 다시 오면 0 부터 · 나가면 DB 기록도 지운다", async () => {
  await run(m1, 10);
  w1.set(null);
  await run(m1, 1);
  assert.equal(globalThis.__docs.get("U").voiceStay, undefined, "나간 뒤 DB 기록이 남음");
  w1.set("B");
  await run(m1, 1);
  assert.ok(lastStay() <= 60, `다시 온 뒤 ${lastStay()}`);
});
await ok("XP 획득 중단 중에는 0 · 끝나면 그때부터 새로", async () => {
  await run(m1, 30);
  globalThis.__docs.get("U").stop = true;
  await run(m1, 60);
  delete globalThis.__docs.get("U").stop;
  await run(m1, 1);
  assert.ok(lastStay() <= 60, `중단이 끝난 직후 ${lastStay()}`);
});
await ok("멈춘 채 10분이 넘어도 at 을 새로 적어 둔다(재시작 때 안 지워지게)", async () => {
  await run(m1, 40);
  w1.set("B", { selfDeaf: true });
  const at0 = Date.parse(globalThis.__docs.get("U").voiceStay.at);
  await run(m1, 12);
  const at1 = Date.parse(globalThis.__docs.get("U").voiceStay.at);
  assert.ok(at1 - at0 >= 5 * 60 * 1000, `at 이 새로 적히지 않음 ${at1 - at0}`);
  w1.set("B", { selfDeaf: false });
  await run(m1, 1);
});

// ── 재시작(2번 프로세스) — 같은 채널에 그대로 있으면 이어 간다 ──
const keep = globalThis.__docs.get("U").voiceStay.sec;
await ok("재시작 뒤 같은 채널이면 DB 머문 초에서 이어 간다", async () => {
  NOW += 15_000; // 꺼져 있던 동안
  const w2 = makeWorld();
  w2.start("B");
  const m2 = await import("../bot/src/features/voiceTime.js?p2");
  m2.startVoiceTime(w2.client);
  globalThis.__rates = [];
  await run(m2, 1);
  const first = globalThis.__rates[0]?.stay;
  assert.ok(first >= keep - 1, `복원 직후 구간도 이어진 값이어야 ${first} (DB ${keep})`);
  assert.ok(lastStay() >= keep + 30, `${lastStay()} vs ${keep}`);
});
await ok("복원 전에 끊고 다시 들어오면 되살리지 않는다", async () => {
  const sec = globalThis.__docs.get("U").voiceStay.sec;
  assert.ok(sec > 60);
  const w3 = makeWorld();
  w3.start("B");
  const m3 = await import("../bot/src/features/voiceTime.js?p3");
  m3.startVoiceTime(w3.client);
  NOW += 5_000;
  w3.set(null); // 첫 기록(복원) 전에 끊김
  NOW += 3_000;
  w3.set("B");
  globalThis.__rates = [];
  await run(m3, 1);
  assert.ok(lastStay() <= 60, `끊긴 뒤인데 ${lastStay()}`);
});

// ── 사이트 문구 · 정리 ──
const fx = await import("../lib/itemEffects.js");
await ok("사이트 — 정리 · 문구 · 타일", async () => {
  const e = fx.normalizeEffects([{ id: "a", on: "voiceStay", mode: "percent", amount: 1, minMinutes: 25, maxPct: 20 }])[0];
  assert.equal(e.maxPct, 20);
  assert.equal(fx.normalizeEffects([{ id: "a", on: "voiceStay", mode: "percent", amount: 1, minMinutes: 25 }]).length, 0, "최대 없으면 버린다");
  assert.equal(fx.describeEffect(e), "음성 25분마다 XP +1% · 최대 20%");
  assert.deepEqual(fx.effectTilesOf({ type: "item", effects: [e] })[0].cond, ["최대 20%"]);
});

console.log = origLog;
console.log(`ok ${n}`);
