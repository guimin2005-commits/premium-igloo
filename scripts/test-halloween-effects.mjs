// 할로윈 부스터 효과 검사 — node scripts/test-halloween-effects.mjs
//    📌 2026-10-14 할로윈 「유령 펭귄의 초대」 — 사탕 바구니(voiceCandy) · 호박불 랜턴(wispHunt) 효과와 핫타임.
//    DB · 디스코드 없이 돈다(순수 함수만). 봇 파일은 mongoose · discord.js 를 불러오므로 import 하지 않고 글자로 읽는다:
//      · 봇 bot/src/itemEffects.js 의 EFFECT_TRIGGERS ~ cleanEffects 구간을 잘라 그대로 실행해 사이트 normalizeEffects 와 결과를 견준다
//      · 할로윈 효과 공용 블록(CANDY_TIERS · WISP_CATCH_XP · pickCandyXp …)은 사이트 · 봇이 글자 그대로 같아야 한다(줄 끝 CRLF/LF 는 무시)
//      · 핫타임 공용 블록(lib/hotTime.js · bot/src/hotTime.js)도 글자 그대로 같아야 하고, 두 파일 다 순수라 직접 불러 hotTimeState 를 본다
//    규칙: 1) 새 효과 두 개의 정의(kind · modes · needs · channels · cap · noAmount · exact)가 사이트 · 봇이 같다
//          2) 정리: 맞는 값은 남기고 틀린 값(분 0 · 1441, 확률 0 · 101, 랜턴 크기 0)은 버린다 — 자르지 않는다(exact). 옛 효과의 자르기는 그대로
//          3) 문구: "음성 15분마다 100~3,000 XP" · "채팅 3% 도깨비불 · 잡으면 +500~1,500 XP · 주인 +300 XP"
//          4) 사탕: 100~3,000 정수, 2만 번 뽑으면 대략 80 / 19 / 1 % · 효과마다 구간 표(candyTiers — 2026-10-18) — 도깨비불: 500~1,500 정수
//          5) 핫타임: 10/16(금) ×2 · 10/19(월) ×1.5 · 10/31 23:59 KST ×2 · 11/01 00:00 KST ×1 · 꺼짐 ×1
//          6) 사탕 · 도깨비불 지급 코드에는 핫타임 배수가 없다 · UserXp.voiceCandySec 칸이 사이트 · 봇 모델에 같은 모양으로 있다
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import * as site from "../lib/itemEffects.js";
import * as siteHot from "../lib/hotTime.js";
import * as botHot from "../bot/src/hotTime.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e.message.split("\n").join("\n    ")}`);
  }
}
// start 줄부터 end 줄까지(둘 다 포함)
function between(src, start, end, label) {
  const a = src.indexOf(start);
  const b = a >= 0 ? src.indexOf(end, a + start.length) : -1;
  assert.ok(a >= 0 && b > a, `${label}: 표시(${start} … ${end})를 못 찾음`);
  return src.slice(a, b + end.length);
}
// 잘라 낸 순수 코드를 실행 — export 만 떼고 names 를 돌려받는다
const run = (code, names) => new Function(`${code.replace(/^export /gm, "")}\nreturn { ${names.join(", ")} };`)();

const BOT_FX = read("bot/src/itemEffects.js");
const HW_START_ = "// ── 할로윈 효과 공용 블록 시작";
const HW_END_ = "// ── 할로윈 효과 공용 블록 끝 ──";
const SITE_FX = read("lib/itemEffects.js");
const VOICE_ = read("bot/src/features/voiceXp.js");

// 봇 정리 함수 — EFFECT_TRIGGERS 부터 cleanEffects 끝까지(그 뒤 itemEffectList 설명 줄 앞)
const bot = run(
  between(BOT_FX, HW_START_, HW_END_, "봇 할로윈 블록(정리용)") + "\n" + between(BOT_FX, "const EFFECT_TRIGGERS = {", "// 아이템 하나의 효과 목록", "봇 정리 구간").replace("// 아이템 하나의 효과 목록", ""),
  ["EFFECT_TRIGGERS", "cleanEffects"]
);
const HW_START = "// ── 할로윈 효과 공용 블록 시작";
const HW_END = "// ── 할로윈 효과 공용 블록 끝 ──";
const siteHw = between(SITE_FX, HW_START, HW_END, "사이트 할로윈 블록");
const botHw = between(BOT_FX, HW_START, HW_END, "봇 할로윈 블록");
const botBlock = run(botHw, ["CANDY_TIERS", "CANDY_XP_RANGE", "WISP_CATCH_XP", "randXp", "pickCandyXp", "pickWispXp", "normalizeCandyTiers", "candyTiersOf", "candyRangeOf"]);

// 시험용 무작위 — 같은 씨앗이면 같은 수열(mulberry32)
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 정해 둔 값을 차례로 돌려주는 무작위
const seq = (...xs) => {
  let i = 0;
  return () => xs[Math.min(i++, xs.length - 1)];
};
const noId = (list) => list.map(({ id: _id, ...r }) => r);

console.log("\n[1] 효과 정의 — 사이트 TRIGGERS · 봇 EFFECT_TRIGGERS");
const FIELDS = ["kind", "modes", "needs", "channels", "cap", "noAmount", "exact", "tiers"];
for (const v of ["voiceCandy", "wispHunt"]) {
  test(`${v} 칸이 사이트 · 봇 같음 (${FIELDS.join(" · ")})`, () => {
    const s = site.TRIGGER_OF[v];
    const b = bot.EFFECT_TRIGGERS[v];
    assert.ok(s, "사이트에 없음");
    assert.ok(b, "봇에 없음");
    for (const k of FIELDS) assert.deepEqual(b[k], s[k], `${v}.${k}`);
  });
}
test("voiceCandy 정의 — 발동 · add · minMinutes · 음성 채널 · 크기 없음 · exact", () => {
  const t = site.TRIGGER_OF.voiceCandy;
  assert.equal(t.l, "음성 N분마다 무작위 XP");
  assert.deepEqual([t.kind, t.modes, t.needs, t.channels, t.noAmount, t.exact], ["trigger", ["add"], "minMinutes", "voice", true, true]);
});
test("wispHunt 정의 — 발동 · add · chance · 텍스트 채널 · exact", () => {
  const t = site.TRIGGER_OF.wispHunt;
  assert.equal(t.l, "채팅하면 도깨비불(확률)");
  assert.deepEqual([t.kind, t.modes, t.needs, t.channels, t.noAmount, t.exact], ["trigger", ["add"], "chance", true, undefined, true]);
});
test("사이트 · 봇 효과 종류 목록이 같음", () => {
  assert.deepEqual(Object.keys(bot.EFFECT_TRIGGERS).sort(), site.TRIGGERS.map((t) => t.v).sort());
});

console.log("\n[2] 정리 — 사이트 normalizeEffects · 봇 cleanEffects");
const CASES = [
  // [이름, 입력, 기대(id 뺀 것) — null 이면 버림]
  ["사탕 15분", { on: "voiceCandy", minMinutes: 15 }, { on: "voiceCandy", mode: "add", amount: 1, minMinutes: 15 }],
  ["사탕 — 크기 · % 는 무시(1 고정 · add)", { on: "voiceCandy", mode: "percent", amount: 999, minMinutes: "15" }, { on: "voiceCandy", mode: "add", amount: 1, minMinutes: 15 }],
  ["사탕 1분(아래 끝)", { on: "voiceCandy", minMinutes: 1 }, { on: "voiceCandy", mode: "add", amount: 1, minMinutes: 1 }],
  ["사탕 1440분", { on: "voiceCandy", minMinutes: 1440 }, { on: "voiceCandy", mode: "add", amount: 1, minMinutes: 1440 }],
  ["사탕 조건(평일 · 21~1시 · 채널)", { on: "voiceCandy", minMinutes: 15, days: [5, 1, 2, 3, 4], hourFrom: 21, hourTo: 1, channelIds: ["111", " 111 ", "222"] },
    { on: "voiceCandy", mode: "add", amount: 1, minMinutes: 15, days: [1, 2, 3, 4, 5], hourFrom: 21, hourTo: 1, channelIds: ["111", "222"] }],
  ["사탕 0분 → 버림", { on: "voiceCandy", minMinutes: 0 }, null],
  ["사탕 빈 분 → 버림", { on: "voiceCandy", minMinutes: "" }, null],
  ["사탕 분 없음 → 버림", { on: "voiceCandy" }, null],
  ["사탕 1441분 → 버림(자르지 않음)", { on: "voiceCandy", minMinutes: 1441 }, null],
  ["사탕 −5분 → 버림", { on: "voiceCandy", minMinutes: -5 }, null],
  ["랜턴 3% · 300", { on: "wispHunt", chance: 3, amount: 300 }, { on: "wispHunt", mode: "add", amount: 300, chance: 3 }],
  ["랜턴 % 방식 → add", { on: "wispHunt", mode: "percent", chance: "5", amount: "300" }, { on: "wispHunt", mode: "add", amount: 300, chance: 5 }],
  ["랜턴 1% · 100%(양끝)", { on: "wispHunt", chance: 1, amount: 1 }, { on: "wispHunt", mode: "add", amount: 1, chance: 1 }],
  ["랜턴 100%", { on: "wispHunt", chance: 100, amount: 300 }, { on: "wispHunt", mode: "add", amount: 300, chance: 100 }],
  ["랜턴 채널 · 주말", { on: "wispHunt", chance: 3, amount: 300, days: [0, 6], channelIds: ["333"] },
    { on: "wispHunt", mode: "add", amount: 300, chance: 3, days: [0, 6], channelIds: ["333"] }],
  ["랜턴 0% → 버림", { on: "wispHunt", chance: 0, amount: 300 }, null],
  ["랜턴 101% → 버림(자르지 않음)", { on: "wispHunt", chance: 101, amount: 300 }, null],
  ["랜턴 빈 확률 → 버림", { on: "wispHunt", chance: "", amount: 300 }, null],
  ["랜턴 크기 0 → 버림", { on: "wispHunt", chance: 3, amount: 0 }, null],
  ["랜턴 크기 없음 → 버림", { on: "wispHunt", chance: 3 }, null],
  // 옛 효과는 예전처럼 자른다(이번 변경과 무관해야 한다)
  ["옛 잭팟 101% → 100% 로 자름(그대로)", { on: "chatJackpot", chance: 101, amount: 1000 }, { on: "chatJackpot", mode: "add", amount: 1000, chance: 100 }],
  ["옛 하루 음성 0분 → 1분 으로 자름(그대로)", { on: "voiceDaily", minMinutes: 0, amount: 500 }, { on: "voiceDaily", mode: "add", amount: 500, minMinutes: 1 }],
];
for (const [name, input, want] of CASES) {
  test(name, () => {
    const s = noId(site.normalizeEffects([input]));
    const b = noId(bot.cleanEffects([input]));
    assert.deepEqual(s, want ? [want] : [], "사이트");
    assert.deepEqual(b, s, "봇 ≠ 사이트");
  });
}
test("여러 칸 섞어도 맞는 것만 남음(사이트 · 봇 같음)", () => {
  const list = CASES.map((c) => c[1]);
  const s = noId(site.normalizeEffects(list.slice(0, 20)));
  const b = noId(bot.cleanEffects(list.slice(0, 20)));
  assert.deepEqual(b, s);
  assert.equal(s.length, CASES.slice(0, 20).filter((c) => c[2]).length);
});

console.log("\n[3] 문구");
const candy = site.normalizeEffects([{ on: "voiceCandy", minMinutes: 15 }])[0];
const wisp = site.normalizeEffects([{ on: "wispHunt", chance: 3, amount: 300 }])[0];
test("사탕 한 줄", () => assert.equal(site.describeEffect(candy), "음성 15분마다 100~3,000 XP"));
test("랜턴 한 줄", () => assert.equal(site.describeEffect(wisp), "채팅 3% 도깨비불 · 잡으면 +500~1,500 XP · 주인 +300 XP"));
test("사탕 · 시간대 조건", () => {
  const e = site.normalizeEffects([{ on: "voiceCandy", minMinutes: 15, hourFrom: 21, hourTo: 1 }])[0];
  assert.equal(site.describeEffect(e), "음성 15분마다 100~3,000 XP · 21~1시");
});
test("랜턴 · 채널 하나(#이름)", () => {
  const e = site.normalizeEffects([{ on: "wispHunt", chance: 3, amount: 1000, channelIds: ["9"] }])[0];
  assert.equal(site.describeEffect(e, "잡담"), "채팅 3% 도깨비불 · 잡으면 +500~1,500 XP · 주인 +1,000 XP · #잡담");
});
test("상세 타일 조각", () => {
  assert.deepEqual(site.effectParts(candy), { label: "음성 15분마다", amount: "100~3,000", unit: "XP", cond: [], once: false });
  assert.deepEqual(site.effectParts(wisp), { label: "채팅 3% 도깨비불 · 잡으면 +500~1,500 XP · 주인", amount: "+300", unit: "XP", cond: [], once: false });
});
test("아이템 효과 문장들(itemEffectLines)", () => {
  const item = { type: "item", effects: [{ on: "voiceCandy", minMinutes: 15 }, { on: "wispHunt", chance: 3, amount: 300 }] };
  assert.deepEqual(site.itemEffectLines(item), ["음성 15분마다 100~3,000 XP", "채팅 3% 도깨비불 · 잡으면 +500~1,500 XP · 주인 +300 XP"]);
});

console.log("\n[4] 보상 값 — 할로윈 효과 공용 블록");
test("공용 블록이 사이트 · 봇 글자 그대로 같음", () => assert.equal(botHw, siteHw));
test("CANDY_TIERS — 80% 100~800 · 19% 800~1,500 · 1% 1,500~3,000", () => {
  assert.deepEqual(site.CANDY_TIERS, [{ w: 80, min: 100, max: 800 }, { w: 19, min: 800, max: 1500 }, { w: 1, min: 1500, max: 3000 }]);
  assert.deepEqual(botBlock.CANDY_TIERS, site.CANDY_TIERS);
  assert.deepEqual(site.CANDY_XP_RANGE, [100, 3000]);
  assert.deepEqual(botBlock.CANDY_XP_RANGE, site.CANDY_XP_RANGE);
});
test("WISP_CATCH_XP — 500~1,500", () => {
  assert.deepEqual(site.WISP_CATCH_XP, [500, 1500]);
  assert.deepEqual(botBlock.WISP_CATCH_XP, site.WISP_CATCH_XP);
});
test("사탕 — 정해 둔 무작위로 양끝 · 구간 경계", () => {
  for (const pick of [site.pickCandyXp, botBlock.pickCandyXp]) {
    assert.equal(pick(() => 0), 100);
    assert.equal(pick(() => 0.9999999), 3000);
    assert.equal(pick(seq(0.7999, 0.9999999)), 800); // 첫 구간 끝
    assert.equal(pick(seq(0.8, 0)), 800); // 둘째 구간 처음
    assert.equal(pick(seq(0.9899, 0.9999999)), 1500);
    assert.equal(pick(seq(0.99, 0)), 1500); // 셋째 구간 처음
    assert.equal(pick(() => 1), 3000); // 틀린 무작위(1)도 양끝 안
    assert.equal(pick(() => NaN), 100);
  }
});
test("사탕 2만 번 — 100~3,000 정수 · 대략 80 / 19 / 1 %", () => {
  const N = 20000;
  for (const [who, pick] of [["사이트", site.pickCandyXp], ["봇", botBlock.pickCandyXp]]) {
    const rand = seeded(20261014);
    const n = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      const v = pick(rand);
      assert.ok(Number.isInteger(v) && v >= 100 && v <= 3000, `${who}: ${v}`);
      n[v <= 800 ? 0 : v <= 1500 ? 1 : 2]++; // 경계 값(800 · 1,500)은 앞 구간으로 — 비율에는 거의 영향 없다
    }
    const pct = n.map((x) => (x / N) * 100);
    assert.ok(Math.abs(pct[0] - 80) < 2 && Math.abs(pct[1] - 19) < 2 && Math.abs(pct[2] - 1) < 0.5, `${who}: ${pct.map((p) => p.toFixed(1)).join(" / ")}`);
    console.log(`      ${who}: ${pct.map((p) => p.toFixed(1)).join(" / ")} %`);
  }
});
test("Math.random 그대로 2만 번 — 범위 안", () => {
  for (let i = 0; i < 20000; i++) {
    const v = site.pickCandyXp();
    assert.ok(Number.isInteger(v) && v >= 100 && v <= 3000, String(v));
  }
});
test("도깨비불 — 500~1,500 정수 · 양끝", () => {
  for (const pick of [site.pickWispXp, botBlock.pickWispXp]) {
    assert.equal(pick(() => 0), 500);
    assert.equal(pick(() => 0.9999999), 1500);
    assert.equal(pick(() => 1), 1500);
    const rand = seeded(7);
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const v = pick(rand);
      assert.ok(Number.isInteger(v) && v >= 500 && v <= 1500, String(v));
      sum += v;
    }
    assert.ok(Math.abs(sum / 20000 - 1000) < 15, `평균 ${sum / 20000}`);
  }
});

console.log("\n[5] 핫타임");
const HOT = { hotTimeOn: true, hotTimeFrom: "2026-10-16T00:00:00+09:00", hotTimeUntil: "2026-11-01T00:00:00+09:00", hotTimeWeekdayMult: 1.5, hotTimeWeekendMult: 2 };
const at = (iso) => new Date(iso).getTime();
test("공용 블록이 사이트 · 봇 글자 그대로 같음", () => {
  const s = between(read("lib/hotTime.js"), "// ── 공용 블록 시작", "// ── 공용 블록 끝 ──", "사이트 핫타임");
  const b = between(read("bot/src/hotTime.js"), "// ── 공용 블록 시작", "// ── 공용 블록 끝 ──", "봇 핫타임");
  assert.equal(b, s);
});
const HOT_CASES = [
  ["10/16 00:00 KST(금, 시작)", HOT, "2026-10-16T00:00:00+09:00", 2, true],
  ["10/16 12:00 KST(금)", HOT, "2026-10-16T12:00:00+09:00", 2, true],
  ["10/18 KST(일)", HOT, "2026-10-18T20:00:00+09:00", 2, true],
  ["10/19 KST(월)", HOT, "2026-10-19T12:00:00+09:00", 1.5, true],
  ["10/22 KST(목)", HOT, "2026-10-22T23:59:00+09:00", 1.5, true],
  ["10/31 23:59 KST(토)", HOT, "2026-10-31T23:59:00+09:00", 2, true],
  ["11/01 00:00 KST(끝 — 안 듦)", HOT, "2026-11-01T00:00:00+09:00", 1, false],
  ["10/15 23:59 KST(시작 전)", HOT, "2026-10-15T23:59:59+09:00", 1, false],
  ["꺼짐", { ...HOT, hotTimeOn: false }, "2026-10-17T12:00:00+09:00", 1, false],
  ["설정 없음", null, "2026-10-17T12:00:00+09:00", 1, false],
];
for (const [name, s, iso, mult, on] of HOT_CASES) {
  test(`${name} → ×${mult}`, () => {
    for (const [who, m] of [["사이트", siteHot], ["봇", botHot]]) {
      const st = m.hotTimeState(s, at(iso));
      assert.equal(st.mult, mult, `${who} mult`);
      assert.equal(st.on, on, `${who} on`);
      assert.equal(m.hotTimeMult(s, at(iso)), mult, `${who} hotTimeMult`);
    }
  });
}


console.log("\n[4b] 효과마다 보상 구간 표(candyTiers — 2026-10-18)");
test("구간 표 정리 — 맞는 표 · 틀린 표(합 · 최소 > 최대 · 줄 수 · 확률 범위)", () => {
  for (const f of [site.normalizeCandyTiers, botBlock.normalizeCandyTiers]) {
    assert.deepEqual(f([{ w: "99.5", min: "100", max: "1000" }, { w: 0.5, min: 1000, max: 2000 }]), [{ w: 99.5, min: 100, max: 1000 }, { w: 0.5, min: 1000, max: 2000 }]);
    assert.deepEqual(f([{ w: 100, min: 100, max: 2000 }]), [{ w: 100, min: 100, max: 2000 }]);
    assert.equal(f([{ w: 90, min: 100, max: 1000 }]), null); // 합 90
    assert.equal(f([{ w: 100, min: 2000, max: 100 }]), null); // 최소 > 최대
    assert.equal(f([{ w: 100, min: -1, max: 100 }]), null);
    assert.equal(f([{ w: 0, min: 1, max: 2 }, { w: 100, min: 1, max: 2 }]), null); // 0%
    assert.equal(f(Array.from({ length: 6 }, () => ({ w: 100 / 6, min: 1, max: 2 }))), null); // 6줄
    assert.equal(f([]), null);
    assert.equal(f(null), null);
  }
});
test("효과 정리 — 맞는 표만 남김(사이트 · 봇 같음) · 다른 효과엔 없음", () => {
  const raw = [
    { on: "voiceCandy", minMinutes: 15, candyTiers: [{ w: 100, min: 100, max: 2000 }] },
    { on: "voiceCandy", minMinutes: 15, candyTiers: [{ w: 50, min: 100, max: 2000 }] },
    { on: "chat", amount: 50, candyTiers: [{ w: 100, min: 1, max: 2 }] },
  ];
  const s = noId(site.normalizeEffects(raw));
  assert.deepEqual(s, [
    { on: "voiceCandy", mode: "add", amount: 1, minMinutes: 15, candyTiers: [{ w: 100, min: 100, max: 2000 }] },
    { on: "voiceCandy", mode: "add", amount: 1, minMinutes: 15 },
    { on: "chat", mode: "add", amount: 50 },
  ]);
  assert.deepEqual(noId(bot.cleanEffects(raw)), s);
});
test("문구 · 뽑기 — 그 효과의 표로", () => {
  const e = site.normalizeEffects([{ on: "voiceCandy", minMinutes: 10, candyTiers: [{ w: 99, min: 100, max: 1000 }, { w: 1, min: 1000, max: 2000 }] }])[0];
  assert.equal(site.describeEffect(e), "음성 10분마다 100~2,000 XP");
  for (const pick of [site.pickCandyXp, botBlock.pickCandyXp]) {
    assert.equal(pick(() => 0.9999999, e.candyTiers), 2000);
    assert.equal(pick(seq(0.99, 0), e.candyTiers), 1000);
    assert.equal(pick(() => 0.5, [{ w: 1, min: 1, max: 2 }]), pick(() => 0.5)); // 틀린 표는 기본 표
  }
  assert.deepEqual(botBlock.candyTiersOf(e), e.candyTiers);
  assert.deepEqual(botBlock.candyTiersOf({}), botBlock.CANDY_TIERS);
});
test("봇 지급 — 그 간격을 정한 효과의 표로 뽑는다", () => {
  const fn = between(VOICE_, "async function giveVoiceCandy", "\n}\n", "giveVoiceCandy(표)");
  assert.ok(/const tiers = voiceCandyTiers\(member, \{ channel \}\);/.test(fn), "표 읽기 없음");
  assert.ok(/pickCandyXp\(Math\.random, tiers\)/.test(fn), "표로 뽑기 없음");
});

console.log("\n[6] 봇 지급 코드 · 모델");
const VOICE = read("bot/src/features/voiceXp.js");
const CHAT = read("bot/src/features/chatXp.js");
const WISP = read("bot/src/features/wispHunt.js");
test("사탕 지급(giveVoiceCandy)에 핫타임 배수 없음 · grantXp reason effect", () => {
  const fn = between(VOICE, "async function giveVoiceCandy", "\n}\n", "giveVoiceCandy");
  assert.ok(!/hotTime/i.test(fn), "핫타임이 들어 있음");
  assert.ok(/grantXp\(member, xp, \{ reason: "effect"/.test(fn), "grantXp effect 없음");
  assert.ok(/voiceCandyMinutes\(member, \{ channel \}\)/.test(fn), "효과 · 조건 확인 없음");
});
test("사탕은 음성 XP 가 실제로 들어간 바퀴에서만(paid)", () => {
  assert.ok(/const paid = await grantXp\(member, /.test(VOICE));
  assert.ok(/if \(paid\) await giveVoiceCandy\(member, c\)/.test(VOICE));
});
test("핫타임 배수는 음성 기본 · 등급 · 강화에만(voiceRate) · 채팅 굴린 값에만", () => {
  assert.ok(/const core = \(base \+ getVoiceBracketBonus\(doc\?\.level \|\| 0\) \+ enhanceXp\) \* hotTimeMult\(s\);/.test(VOICE));
  assert.ok(/Math\.round\(rolled \* hotTimeMult\(s\)\)/.test(CHAT));
});
test("도깨비불 — 채팅 XP 가 들어간 메시지에서만 · 핫타임 없음", () => {
  const blk = between(CHAT, "if (got) {", "\n      }\n", "chatXp 도깨비불");
  assert.ok(/wispHuntXp\(message\.member, \{ channel: message\.channel \}\)/.test(blk));
  assert.ok(!/hotTime/i.test(blk));
  assert.ok(!/hotTime/i.test(WISP), "wispHunt.js 에 핫타임");
});
test("도깨비불 버튼 · 문구", () => {
  for (const s of ['const PREFIX = "wisp:"', "ButtonStyle.Success", '.setLabel("잡기")', "랜턴 주인은 잡을 수 없어요", "이미 잡혔어요", "도깨비불이 사라졌어요", "님이 도깨비불을 잡았어요!", "const NO_PINGS = { parse: [] }", "const LIFE_MS = 60_000", "const GAP_MS = 10 * 60_000"]) {
    assert.ok(WISP.includes(s), `없음: ${s}`);
  }
  assert.ok(/registerWispHunt\(client\)/.test(read("bot/src/index.js")), "index.js 연결 없음");
});
test("UserXp.voiceCandySec — 사이트 · 봇 모델에 같은 줄(설명 포함)", () => {
  const grab = (src, who) => {
    const i = src.indexOf("voiceCandySec: { type: Number, default: 0 },");
    assert.ok(i >= 0, `${who}: 칸 없음`);
    const lines = src.slice(0, i).split("\n");
    return lines.slice(-3).join("\n"); // 설명 두 줄 + 칸 줄 앞부분(들여쓰기)
  };
  assert.equal(grab(read("bot/src/db.js"), "봇"), grab(read("models/UserXp.js"), "사이트"));
});

console.log(`\n${failed ? "❌" : "✅"} ${passed} 통과 · ${failed} 실패`);
if (failed) process.exit(1);
