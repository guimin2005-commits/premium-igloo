// lib/achievements.js 검사 — node scripts/test-achievements.mjs
//    업적 표 · 재료(statsFromParts) · 깨기 판정 · 진행 막대 · 숨겨진 업적 가리기 · 희귀도 · 화면 모양(API 계약)을 본다. DB · 서버 없이 돈다.
import assert from "node:assert/strict";
import {
  ACHIEVEMENTS, ACHIEVEMENT_GROUPS, ACHIEVEMENT_UNITS, HIDDEN_TITLE,
  achievementOf, statsFromParts, statValue, isUnlocked, progressOf, rarityPct, rarityCounts, buildAchievementView, recordsSince,
} from "../lib/achievements.js";
import { isArtKey } from "../lib/itemArt.js";
import { VOICE_TIERS } from "../lib/voiceTiers.js";

let pass = 0;
const fails = [];
const test = (name, fn) => {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fails.push(name); console.log(`  FAIL ${name}\n       ${String(e?.message || e).split("\n").join("\n       ")}`); }
};
const section = (t) => console.log(`\n[${t}]`);
const def = (k) => { const d = achievementOf(k); assert.ok(d, `업적 없음: ${k}`); return d; };
const S = (over = {}) => ({ ...statsFromParts({}), ...over });

section("업적 표");
test("개수 30~45 · key 겹침 없음", () => {
  assert.ok(ACHIEVEMENTS.length >= 30 && ACHIEVEMENTS.length <= 45, `개수 ${ACHIEVEMENTS.length}`);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.key)).size, ACHIEVEMENTS.length);
});
test("그룹 · 단위 · 아이콘(도트 일러스트 key) · 숫자", () => {
  const groups = new Set(ACHIEVEMENT_GROUPS.map((g) => g.g));
  const stats = statsFromParts({});
  for (const a of ACHIEVEMENTS) {
    assert.ok(groups.has(a.group), `${a.key} 그룹 ${a.group}`);
    assert.ok(ACHIEVEMENT_UNITS.includes(a.unit), `${a.key} 단위 ${a.unit}`);
    assert.ok(isArtKey(a.icon), `${a.key} 아이콘 ${a.icon}`);
    assert.ok(a.stat in stats, `${a.key} 재료 ${a.stat}`);
    assert.ok(Number.isInteger(a.goal) && a.goal >= 1, `${a.key} 목표 ${a.goal}`);
    assert.ok(Number.isInteger(a.xp) && a.xp >= 0 && Number.isInteger(a.point) && a.point >= 0, `${a.key} 보상`);
    assert.ok(a.xp > 0 || a.point > 0, `${a.key} 보상 없음`);
    assert.ok(a.title && a.desc && !a.desc.includes("{n}"), `${a.key} 글`);
    assert.ok(a.title.length <= 12, `${a.key} 이름이 길다: ${a.title}`);
  }
});
test("모든 그룹에 업적이 있다", () => {
  for (const g of ACHIEVEMENT_GROUPS) assert.ok(ACHIEVEMENTS.some((a) => a.group === g.g), g.g);
});
test("숨겨진 업적 3개 이상 · 히든 그룹에만", () => {
  const hidden = ACHIEVEMENTS.filter((a) => a.hidden);
  assert.ok(hidden.length >= 3);
  for (const a of ACHIEVEMENTS) assert.equal(a.hidden, a.group === "hidden", a.key);
});
test("목표 숫자가 설명에 쉼표로 들어간다", () => {
  assert.equal(def("voice_10000").desc, "누적 음성 10,000분");
  assert.equal(def("lv_1000").desc, "레벨 1,000 달성");
  assert.equal(def("streak_30").desc, "연속 출석 30일");
});
test("등급 목표 = 등급 시작 레벨(lib/voiceTiers)", () => {
  const min = Object.fromEntries(VOICE_TIERS.map((t) => [t.key, t.min]));
  assert.equal(def("tier_gold").goal, min.gold);
  assert.equal(def("tier_diamond").goal, min.diamond);
  assert.equal(def("tier_igloo").goal, min.igloo);
});
test("같은 재료의 사슬 — 목표가 겹치지 않고, 어려울수록 보상이 크다(레벨 · 등급은 한 사슬)", () => {
  const by = new Map();
  for (const a of ACHIEVEMENTS.filter((x) => x.cmp === "ge" && !x.hidden)) {
    if (!by.has(a.stat)) by.set(a.stat, []);
    by.get(a.stat).push(a);
  }
  for (const [stat, list] of by) {
    const sorted = [...list].sort((x, y) => x.goal - y.goal);
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(sorted[i].goal > sorted[i - 1].goal, `${stat} 목표 겹침 ${sorted[i].key}`);
      assert.ok(sorted[i].xp >= sorted[i - 1].xp, `${stat} 보상 순서 ${sorted[i].key}`);
    }
    // 같은 그룹 안 화면 순서도 목표 오름차순(등급은 레벨 사슬 뒤에 따로)
    const plain = list.filter((a) => !a.key.startsWith("tier_"));
    for (let i = 1; i < plain.length; i++) assert.ok(plain[i].goal > plain[i - 1].goal, `${stat} 화면 순서 ${plain[i].key}`);
  }
});
test("보상 합이 경제를 흔들지 않는다(XP 250만 · 빙옥 100 아래)", () => {
  const xp = ACHIEVEMENTS.reduce((s, a) => s + a.xp, 0);
  const pt = ACHIEVEMENTS.reduce((s, a) => s + a.point, 0);
  console.log(`       합계 XP ${xp.toLocaleString()} · 빙옥 ${pt}`);
  assert.ok(xp < 2_500_000 && pt < 100);
  for (const a of ACHIEVEMENTS) assert.ok(a.xp <= 200_000 && a.point <= 10, `${a.key} 한 건이 너무 크다`);
});

section("재료 statsFromParts");
test("문서가 없으면 전부 0", () => {
  const s = statsFromParts({});
  for (const [k, v] of Object.entries(s)) assert.equal(v, 0, k);
});
test("레벨 = 지금 레벨과 최고 도달 레벨 중 큰 쪽", () => {
  assert.equal(statsFromParts({ user: { level: 120, maxLevel: 150 } }).level, 150);
  assert.equal(statsFromParts({ user: { level: 200, maxLevel: 0 } }).level, 200);
});
test("음성 분 = 초 ÷ 60 버림 · 연속 = 지금과 최고 중 큰 쪽", () => {
  const s = statsFromParts({ user: { voiceSeconds: 6000 * 60 + 59, attendStreak: 3, attendBestStreak: 12 } });
  assert.equal(s.voiceMin, 6000);
  assert.equal(s.streak, 12);
  assert.equal(statsFromParts({ user: { attendStreak: 9, attendBestStreak: 4 } }).streak, 9);
});
test("착용 — 빈 값 · none 은 착용 아님, 배지는 3개까지", () => {
  assert.equal(statsFromParts({ user: { cardSkinPick: "" } }).skinOn, 0);
  assert.equal(statsFromParts({ user: { cardSkinPick: "none" } }).skinOn, 0);
  assert.equal(statsFromParts({ user: { cardSkinPick: "gold" } }).skinOn, 1);
  // 카드 배경만 입어도 「카드 스킨 착용」(카드 스킨 = 카드 배경 · 카드 테두리 묶음)
  assert.equal(statsFromParts({ user: { cardScenePick: "sc_ghost" } }).skinOn, 1);
  assert.equal(statsFromParts({ user: { cardScenePick: "none", cardSkinPick: "" } }).skinOn, 0);
  assert.equal(statsFromParts({ user: { avatarFramePick: "rank_gold" } }).frameOn, 1);
  assert.equal(statsFromParts({ user: { badgePick: ["a", "b", "c", "d"] } }).badges, 3);
  assert.equal(statsFromParts({ user: { badgePick: [] } }).badges, 0);
});
test("순위는 XP 가 있을 때만", () => {
  assert.equal(statsFromParts({ user: { xp: 0 }, rank: 1 }).rank, 0);
  assert.equal(statsFromParts({ user: { xp: 10 }, rank: 4 }).rank, 4);
});
test("지난 시즌 — 시즌 수(같은 시즌 한 번) · 가장 좋았던 순위", () => {
  const s = statsFromParts({ user: { seasonHistory: [{ season: 2, rank: 15 }, { season: 3, rank: 7 }, { season: 3, rank: 9 }, { season: 0, rank: 1 }] } });
  assert.equal(s.seasons, 2);
  assert.equal(s.seasonBest, 7); // 시즌 번호 없는 줄(rank 1)은 기록이 아니다
  assert.equal(statsFromParts({ user: { seasonHistory: [{ season: 2, rank: 0 }] } }).seasonBest, 0);
});
test("활동 · 퀘스트 · 구매 · 음수 · 글자 숫자", () => {
  const s = statsFromParts({ act: { msg: "1200", reacted: -3, dawn: 4.9 }, quests: 11, buys: null });
  assert.equal(s.msg, 1200);
  assert.equal(s.reacted, 0);
  assert.equal(s.dawn, 4);
  assert.equal(s.quests, 11);
  assert.equal(s.buys, 0);
});

section("깨기 판정 · 진행 막대");
test("이상 조건 — 목표에 닿으면 깬다", () => {
  assert.equal(isUnlocked(def("voice_10000"), S({ voiceMin: 9999 })), false);
  assert.equal(isUnlocked(def("voice_10000"), S({ voiceMin: 10000 })), true);
  assert.equal(isUnlocked(def("tier_gold"), S({ level: 239 })), false);
  assert.equal(isUnlocked(def("tier_gold"), S({ level: 240 })), true);
});
test("순위 조건 — 순위가 있고 목표 이하", () => {
  assert.equal(isUnlocked(def("rank_10"), S({ rank: 0 })), false);
  assert.equal(isUnlocked(def("rank_10"), S({ rank: 10 })), true);
  assert.equal(isUnlocked(def("rank_10"), S({ rank: 11 })), false);
  assert.equal(isUnlocked(def("hidden_1"), S({ rank: 1 })), true);
  assert.equal(isUnlocked(def("hidden_2"), S({ seasonBest: 0 })), false);
  assert.equal(isUnlocked(def("hidden_2"), S({ seasonBest: 3 })), true);
});
test("진행 막대 — 목표에서 자르고, 순위 · 한 번짜리는 없음", () => {
  assert.deepEqual(progressOf(def("voice_10000"), S({ voiceMin: 6240 })), { goal: 10000, progress: 6240 });
  assert.deepEqual(progressOf(def("voice_100"), S({ voiceMin: 6240 })), { goal: 100, progress: 100 });
  assert.deepEqual(progressOf(def("rank_10"), S({ rank: 40 })), { goal: null, progress: null });
  assert.deepEqual(progressOf(def("buy_1"), S({ buys: 0 })), { goal: null, progress: null });
  assert.deepEqual(progressOf(def("skin_on"), S()), { goal: null, progress: null });
  assert.equal(statValue(def("msg_1000"), S({ msg: 77 })), 77);
});

section("희귀도");
test("rarityPct — 소수 한 자리 · 0명 · 100% 상한", () => {
  assert.equal(rarityPct(1, 3), 33.3);
  assert.equal(rarityPct(2, 3), 66.7);
  assert.equal(rarityPct(0, 0), 0);
  assert.equal(rarityPct(5, 4), 100);
});
test("rarityCounts — 지금 조건 또는 깬 기록(나간 사람 기록은 빼고)", () => {
  const rows = [
    { userId: "a", stats: S({ voiceMin: 200 }) },
    { userId: "b", stats: S({ voiceMin: 50 }) },
    { userId: "c", stats: S({ rank: 1, xp: 1 }) },
    { userId: "d", stats: S() },
  ];
  const persisted = new Map([["voice_100", new Set(["b", "gone"])], ["hidden_1", new Set(["a"])]]);
  const r = rarityCounts(rows, persisted);
  assert.equal(r.total, 4);
  assert.equal(r.counts.voice_100, 2); // a(지금) + b(기록) — gone 은 유저 목록에 없다
  assert.equal(r.counts.hidden_1, 2); // c(지금 1위) + a(예전 1위 기록)
  assert.equal(r.counts.voice_1000, 0);
  assert.equal(Object.keys(r.counts).length, ACHIEVEMENTS.length);
});

section("화면 모양 buildAchievementView");
const rarity = { total: 200, counts: { voice_100: 150, voice_1000: 40, hidden_1: 1 } };
test("계약 칸 · 총계", () => {
  const v = buildAchievementView({ stats: S({ voiceMin: 150 }), records: [], rarity, live: true });
  assert.deepEqual(Object.keys(v).sort(), ["claimLocked", "groups", "items", "newly", "total", "unlocked"].sort());
  assert.equal(v.total, ACHIEVEMENTS.length);
  assert.equal(v.unlocked, v.items.filter((i) => i.unlocked).length);
  assert.deepEqual(v.groups, ACHIEVEMENT_GROUPS.map(({ g, label }) => ({ g, label })));
  const keys = ["key", "group", "title", "desc", "icon", "hidden", "goal", "progress", "unit", "unlocked", "unlockedAt", "rarity", "reward", "claimed", "claimable"];
  for (const it of v.items) assert.deepEqual(Object.keys(it).sort(), [...keys].sort(), it.key);
  assert.equal(v.claimLocked, false);
});
test("소급 — 기록이 없어도 지금 조건을 채우면 깬 것 · 받을 수 있음", () => {
  const v = buildAchievementView({ stats: S({ voiceMin: 150 }), records: [], rarity, live: false });
  const it = v.items.find((i) => i.key === "voice_100");
  assert.equal(it.unlocked, true);
  assert.equal(it.unlockedAt, null);
  assert.equal(it.claimable, true);
  assert.equal(it.rarity, 75);
  assert.equal(v.claimLocked, true);
  assert.deepEqual(v.newly, []); // 테스트 사이트는 화면이 센다
});
test("진행 — 6,240 / 10,000분", () => {
  const v = buildAchievementView({ stats: S({ voiceMin: 6240 }), records: [], rarity, live: true });
  const it = v.items.find((i) => i.key === "voice_10000");
  assert.equal(it.unlocked, false);
  assert.equal(it.goal, 10000);
  assert.equal(it.progress, 6240);
  assert.equal(it.unit, "분");
  assert.equal(it.claimable, false);
  assert.deepEqual(it.reward, { xp: def("voice_10000").xp, point: def("voice_10000").point });
});
test("깬 기록은 값이 내려가도 깬 채 · 막대는 가득", () => {
  const at = new Date("2026-10-11T03:00:00Z");
  const v = buildAchievementView({ stats: S({ rank: 40, msg: 10 }), records: [{ key: "rank_10", unlockedAt: at }, { key: "msg_1000", unlockedAt: at }], rarity, live: true });
  const r10 = v.items.find((i) => i.key === "rank_10");
  assert.equal(r10.unlocked, true);
  assert.equal(r10.unlockedAt, at.toISOString());
  const m = v.items.find((i) => i.key === "msg_1000");
  assert.equal(m.progress, 1000);
});
test("받은 보상 — 받은 값 그대로 · 다시 받을 수 없음", () => {
  const v = buildAchievementView({
    stats: S({ voiceMin: 150 }),
    records: [{ key: "voice_100", unlockedAt: new Date(), seenAt: new Date(), claimedAt: new Date(), rewardXp: 1234, rewardPoint: 0 }],
    rarity,
    live: true,
  });
  const it = v.items.find((i) => i.key === "voice_100");
  assert.equal(it.claimed, true);
  assert.equal(it.claimable, false);
  assert.deepEqual(it.reward, { xp: 1234, point: 0 });
});
test("숨겨진 업적 — 깨기 전에는 이름 · 설명 · 아이콘 · 목표 · 보상을 가린다", () => {
  const v = buildAchievementView({ stats: S({ streak: 50 }), records: [], rarity, live: true });
  const it = v.items.find((i) => i.key === "hidden_3");
  assert.equal(it.hidden, true);
  assert.equal(it.title, HIDDEN_TITLE);
  assert.equal(it.desc, "");
  assert.equal(it.icon, "");
  assert.equal(it.goal, null);
  assert.equal(it.progress, null);
  assert.equal(it.unit, "");
  assert.deepEqual(it.reward, { xp: 0, point: 0 });
  assert.equal(it.claimable, false);
  assert.equal(typeof it.rarity, "number");
});
test("숨겨진 업적 — 깨면 전부 보인다", () => {
  const v = buildAchievementView({ stats: S({ streak: 100 }), records: [], rarity, live: true });
  const it = v.items.find((i) => i.key === "hidden_3");
  const d = def("hidden_3");
  assert.equal(it.hidden, false);
  assert.equal(it.title, d.title);
  assert.equal(it.desc, d.desc);
  assert.equal(it.icon, d.icon);
  assert.equal(it.goal, 100);
  assert.equal(it.progress, 100);
  assert.deepEqual(it.reward, { xp: d.xp, point: d.point });
  assert.equal(it.claimable, true);
});
test("희귀도 — 내가 깼는데 집계가 0명이면 나를 1명으로", () => {
  const v = buildAchievementView({ stats: S({ dawn: 100 }), records: [], rarity, live: true });
  assert.equal(v.items.find((i) => i.key === "hidden_4").rarity, 0.5); // 1 / 200
});
test("희귀도 — 집계가 없으면(첫 집계 실패) null — 0% · 100% 로 꾸미지 않는다", () => {
  const none = buildAchievementView({ stats: S({ dawn: 100 }), records: [], rarity: { total: 0, counts: {} }, live: true });
  assert.equal(none.items.find((i) => i.key === "hidden_4").rarity, null);
  assert.equal(none.items.find((i) => i.key === "voice_100").rarity, null);
  assert.equal(buildAchievementView().items[0].rarity, null);
});
test("숨겨진 업적 — 잠긴 동안 응답 어디에도 조건이 남지 않는다(key 는 번호)", () => {
  const v = buildAchievementView({ stats: S(), records: [], rarity, live: true });
  for (const d of ACHIEVEMENTS.filter((a) => a.hidden)) {
    assert.match(d.key, /^hidden_\d+$/, d.key);
    const it = v.items.find((i) => i.key === d.key);
    const txt = JSON.stringify(it);
    for (const leak of [d.title, d.desc, d.icon]) assert.ok(!txt.includes(`"${leak}"`), `${d.key} 에 ${leak} 이 보인다`);
    assert.equal(it.unit, "");
    assert.equal(it.goal, null);
    assert.deepEqual(it.reward, { xp: 0, point: 0 });
  }
});

section("퇴장 초기화 — recordsSince");
test("받은 기록은 늘 남고, 안 받은 기록은 지금 문서가 생긴 뒤 것만", () => {
  const born = Date.parse("2026-10-10T00:00:00Z");
  const before = new Date(born - 1000), after = new Date(born + 1000);
  const recs = [
    { key: "voice_100", unlockedAt: before, claimedAt: before },
    { key: "voice_1000", unlockedAt: before, claimedAt: null },
    { key: "lv_50", unlockedAt: after, claimedAt: null },
    { key: "lv_100", unlockedAt: new Date(born), claimedAt: null },
    { key: "", unlockedAt: after },
    { key: "msg_100", unlockedAt: null, claimedAt: null },
  ];
  assert.deepEqual(recordsSince(recs, born).map((r) => r.key), ["voice_100", "lv_50", "lv_100"]);
  // 문서가 없으면(나간 뒤 안 돌아옴) 받은 기록만
  assert.deepEqual(recordsSince(recs, Infinity).map((r) => r.key), ["voice_100"]);
  // 문서 시각을 모르면(0) 전부
  assert.deepEqual(recordsSince(recs, 0).map((r) => r.key), ["voice_100", "voice_1000", "lv_50", "lv_100"]);
  assert.deepEqual(recordsSince(null, born), []);
});
test("버린 기록은 화면에서도 안 깬 것 — 다시 채우면 다시 깨고 받을 수 있다", () => {
  const born = Date.parse("2026-10-10T00:00:00Z");
  const recs = recordsSince([{ key: "voice_1000", unlockedAt: new Date(born - 5000), claimedAt: null }], born);
  const a = buildAchievementView({ stats: S({ voiceMin: 10 }), records: recs, rarity, live: true });
  assert.equal(a.items.find((i) => i.key === "voice_1000").unlocked, false);
  assert.deepEqual(a.newly, []);
  const b = buildAchievementView({ stats: S({ voiceMin: 1000 }), records: recs, rarity, live: true });
  assert.equal(b.items.find((i) => i.key === "voice_1000").claimable, true);
  // 받은 기록은 남아 다시 받을 수 없다
  const c = buildAchievementView({
    stats: S({ voiceMin: 1000 }),
    records: recordsSince([{ key: "voice_1000", unlockedAt: new Date(born - 5000), claimedAt: new Date(born - 4000), rewardXp: 10000 }], born),
    rarity,
    live: true,
  });
  assert.equal(c.items.find((i) => i.key === "voice_1000").claimable, false);
  assert.equal(c.items.find((i) => i.key === "voice_1000").claimed, true);
});
test("newly — 실사이트에서 깬 기록 중 안 본 것만(표 순서)", () => {
  const records = [
    { key: "voice_1000", unlockedAt: new Date(), seenAt: null },
    { key: "voice_100", unlockedAt: new Date(), seenAt: new Date() },
    { key: "lv_50", unlockedAt: new Date(), seenAt: null },
    { key: "lv_100", unlockedAt: new Date(), seenAt: null, claimedAt: new Date() }, // 알림 전에 받은 것 — 알림 없음
    { key: "nope", unlockedAt: new Date(), seenAt: null },
  ];
  assert.deepEqual(buildAchievementView({ stats: S(), records, rarity, live: true }).newly, ["lv_50", "voice_1000"]);
  assert.deepEqual(buildAchievementView({ stats: S(), records, rarity, live: false }).newly, []);
});
test("빈 입력에도 깨지지 않는다", () => {
  const v = buildAchievementView();
  assert.equal(v.total, ACHIEVEMENTS.length);
  assert.equal(v.unlocked, 0);
  assert.equal(v.claimLocked, true);
});

console.log(`\n${pass} ok · ${fails.length} fail`);
if (fails.length) process.exit(1);
