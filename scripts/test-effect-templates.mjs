// 종류별 효과 문구(lib/itemEffects 「종류별 효과 문구」) 시험 — node scripts/test-effect-templates.mjs
//   1) 기본 틀로 적은 줄 = 예전 문구(틀 없음) 글자 그대로 — 효과 종류마다 · 조건(요일 · 시간대 · 채널) · 더하기 / %
//   2) 바꾼 틀 · 칸 채우기 · 「매일」 빼기 · 기본 효과(채팅 · 음성 · 출석 칸) · 타일
//   3) 정리 규칙(못 쓰는 칸 · 중괄호 · 기본과 같음 · 길이)
import assert from "node:assert/strict";
import {
  TRIGGERS, DEFAULT_EFFECT_TEMPLATES, TEMPLATE_KINDS, EFFECT_TEMPLATE_SAMPLES, EFFECT_TEMPLATE_MAX,
  describeEffect, setEffectTemplates, effectTemplatesNow, normalizeEffectTemplate, normalizeEffectTemplates,
  previewEffectTemplate, effectLinesOf, effectTilesOf, itemEffectLines, describeItemBasic,
} from "../lib/itemEffects.js";

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("  ✓", name); };

// 모든 틀 바꿀 수 있는 종류가 기본 틀 · 미리 보기 값을 갖는다
ok("종류마다 기본 틀 · 미리 보기 값", () => {
  const kinds = TRIGGERS.filter((t) => t.kind !== "cosmetic").map((t) => t.v);
  assert.deepEqual(TEMPLATE_KINDS, kinds);
  for (const on of kinds) {
    assert.ok(DEFAULT_EFFECT_TEMPLATES[on], `기본 틀 없음 ${on}`);
    assert.ok(EFFECT_TEMPLATE_SAMPLES[on], `미리 보기 값 없음 ${on}`);
  }
});

// 1) 기본 틀 = 예전 문구 — 틀 없음(예전 경로)과 기본 틀을 모두 「바꾼 것」처럼 넣은 경로를 비교한다
const variants = (on) => {
  const s = EFFECT_TEMPLATE_SAMPLES[on];
  const base = { on, ...s };
  const out = [base, { ...base, days: [0, 6] }, { ...base, days: [1], hourFrom: 22, hourTo: 2 }, { ...base, channelIds: ["1", "2"] }];
  if (["chat", "voice", "voiceParty"].includes(on)) out.push({ ...base, mode: base.mode === "percent" ? "add" : "percent" });
  return out;
};
ok("기본 틀로 적은 줄 = 예전 문구(종류 × 조건)", () => {
  setEffectTemplates({});
  const legacy = TEMPLATE_KINDS.flatMap((on) => variants(on).map((e) => describeEffect(e)));
  // 기본 틀을 그대로 넣으면 정리(normalize)가 「기본」으로 버린다 — 지금 틀을 직접 바꿔 강제로 틀 경로를 탄다
  globalThis.__igEffectTemplates.now = Object.assign(Object.create(null), DEFAULT_EFFECT_TEMPLATES);
  const viaTpl = TEMPLATE_KINDS.flatMap((on) => variants(on).map((e) => describeEffect(e)));
  setEffectTemplates({});
  assert.deepEqual(viaTpl, legacy);
});
ok("미리 보기(기본 틀) = 예전 문구", () => {
  setEffectTemplates({});
  for (const on of TEMPLATE_KINDS) assert.equal(previewEffectTemplate(on, ""), describeEffect({ on, ...EFFECT_TEMPLATE_SAMPLES[on] }), on);
});
ok("예전 문구 몇 개(글자 고정)", () => {
  setEffectTemplates({});
  assert.equal(describeEffect({ on: "voiceDaily", mode: "add", amount: 5000, minMinutes: 60 }), "매일 음성 60분 +5,000 XP");
  assert.equal(describeEffect({ on: "firstChat", mode: "add", amount: 100, days: [1] }), "첫 채팅 +100 XP · 월");
  assert.equal(describeEffect({ on: "chat", mode: "percent", amount: 50, days: [0, 6], hourFrom: 22, hourTo: 2 }), "채팅 XP +50% · 주말 22~2시");
  assert.equal(describeEffect({ on: "voiceCandy", mode: "add", amount: 1, minMinutes: 15 }), "음성 15분마다 100~3,000 XP");
  assert.equal(describeEffect({ on: "wispHunt", mode: "add", amount: 300, chance: 3 }), "채팅 3% 도깨비불 · 잡으면 +500~1,500 XP · 주인 +300 XP");
  assert.deepEqual(describeItemBasic({ chatBuffXp: 50, voiceBuffXp: 0, attendBuffXp: 3000 }), ["채팅 XP +50", "출석 XP +3,000"]);
});

// 2) 바꾼 틀
ok("바꾼 틀 — 칸 채우기 · 조건은 뒤에", () => {
  setEffectTemplates({ voiceDaily: "매일 음성방 {분}분 머물면 {크기}", chat: "채팅할 때마다 {크기}" });
  assert.deepEqual(effectTemplatesNow(), { voiceDaily: "매일 음성방 {분}분 머물면 {크기}", chat: "채팅할 때마다 {크기}" });
  assert.equal(describeEffect({ on: "voiceDaily", mode: "add", amount: 5000, minMinutes: 60 }), "매일 음성방 60분 머물면 +5,000 XP");
  assert.equal(describeEffect({ on: "voiceDaily", mode: "add", amount: 5000, minMinutes: 60, days: [0, 6] }), "음성방 60분 머물면 +5,000 XP · 주말");
  assert.equal(describeEffect({ on: "chat", mode: "percent", amount: 50, hourFrom: 22, hourTo: 2 }), "채팅할 때마다 +50% · 22~2시");
  // 기본 효과 칸(chatBuffXp)도 채팅 틀
  assert.deepEqual(describeItemBasic({ chatBuffXp: 50 }), ["채팅할 때마다 +50"]);
  // 바꾸지 않은 종류는 그대로
  assert.equal(describeEffect({ on: "levelUp", mode: "add", amount: 1000 }), "레벨업마다 +1,000 XP");
  // 꾸미기는 틀이 없다
  assert.equal(describeEffect({ on: "cardSkin", skin: "gold" }), "카드 테두리 · 골드");
  setEffectTemplates({});
});
ok("아이템 줄 · 타일 — 직접 쓴 문구 > 틀 > 기본", () => {
  const item = { type: "item", chatBuffXp: 50, effects: [{ on: "levelUp", mode: "add", amount: 1000 }, { on: "cardSkin", skin: "gold", mode: "add", amount: 1 }] };
  setEffectTemplates({ levelUp: "레벨이 오르면 {크기}" });
  assert.deepEqual(effectLinesOf(item), ["채팅 XP +50", "레벨이 오르면 +1,000 XP"]);
  assert.deepEqual(itemEffectLines(item), ["채팅 XP +50", "레벨이 오르면 +1,000 XP", "카드 테두리 · 골드"]);
  const tiles = effectTilesOf(item);
  assert.equal(tiles.length, 2);
  assert.deepEqual({ label: tiles[0].label, amount: tiles[0].amount, line: tiles[0].line }, { label: "채팅 XP", amount: "+50", line: "채팅 XP +50" });
  assert.deepEqual({ label: tiles[1].label, amount: tiles[1].amount, unit: tiles[1].unit, line: tiles[1].line, custom: tiles[1].custom }, { label: "레벨이 오르면", amount: "+1,000", unit: "XP", line: "레벨이 오르면 +1,000 XP", custom: false });
  assert.deepEqual(effectLinesOf({ ...item, effectText: ["직접 쓴 줄"] }), ["직접 쓴 줄"]);
  setEffectTemplates({});
});
ok("타일(바꾼 틀) — 틀 안의 「 · 」 · 크기 없는 틀 · 조건은 따로", () => {
  setEffectTemplates({ voiceDaily: "매일 음성 {분}분 · {크기}", chat: "채팅할 때마다 {크기}", firstChat: "하루 첫 채팅 보너스" });
  const item = { type: "item", effects: [
    { on: "voiceDaily", mode: "add", amount: 5000, minMinutes: 60, days: [0, 6] },
    { on: "chat", mode: "percent", amount: 50, days: [0, 6], hourFrom: 22, hourTo: 2 },
    { on: "firstChat", mode: "add", amount: 100 },
  ] };
  const t = effectTilesOf(item).map((x) => [x.label, x.amount, x.unit, x.cond.join("|"), x.line]);
  assert.deepEqual(t, [
    ["음성 60분", "+5,000", "XP", "주말", "음성 60분 · +5,000 XP · 주말"],
    ["채팅할 때마다", "+50", "%", "주말|22~2시", "채팅할 때마다 +50% · 주말 22~2시"],
    ["하루 첫 채팅 보너스", "", "", "", "하루 첫 채팅 보너스"],
  ]);
  setEffectTemplates({});
});
ok("타일(틀 없음) = 예전 조각 + 줄", () => {
  setEffectTemplates({});
  const item = { type: "item", voiceBuffXp: 300, effects: [{ on: "chat", mode: "percent", amount: 50, days: [0, 6] }] };
  const tiles = effectTilesOf(item);
  assert.deepEqual(tiles.map((t) => [t.label, t.amount, t.unit, t.cond.join(","), t.line]), [
    ["음성 XP", "+300", "", "", "음성 XP +300"],
    ["채팅 XP", "+50", "%", "주말", "채팅 XP +50% · 주말"],
  ]);
});

// 3) 정리 규칙
ok("정리 — 못 쓰는 칸 · 중괄호 · 기본과 같음 · 길이 · 모르는 종류", () => {
  assert.equal(normalizeEffectTemplate("chat", "채팅 {분}분 {크기}").error, "「{분}」은(는) 이 효과에서 쓸 수 없습니다.");
  assert.ok(normalizeEffectTemplate("chat", "채팅 {크기").error);
  assert.deepEqual(normalizeEffectTemplate("chat", "  채팅 XP   {크기} "), { value: "", error: "" });
  assert.deepEqual(normalizeEffectTemplate("chat", ""), { value: "", error: "" });
  // 길이는 자르지 않고 막는다(잘라 저장하면 뒤의 {크기}가 빠졌다)
  assert.equal(normalizeEffectTemplate("chat", "가".repeat(57) + " {크기}").error, `${EFFECT_TEMPLATE_MAX}자까지 쓸 수 있습니다.`);
  assert.equal(normalizeEffectTemplate("chat", "가".repeat(54) + " {크기}").error, "");
  assert.ok(normalizeEffectTemplate("cardSkin", "x").error);
  const r = normalizeEffectTemplates({ chat: "채팅마다 {크기}", voice: "음성 {인원}", nope: "x", levelUp: DEFAULT_EFFECT_TEMPLATES.levelUp });
  assert.deepEqual(r.value, { chat: "채팅마다 {크기}" });
  assert.deepEqual(r.errors.map((e) => e.on), ["voice"]);
  // 지금 틀에 넣을 때는 잘못된 줄만 버린다
  setEffectTemplates({ chat: "채팅마다 {크기}", voice: "음성 {인원}" });
  assert.deepEqual(effectTemplatesNow(), { chat: "채팅마다 {크기}" });
  setEffectTemplates({});
  // 「toString」 같은 이름의 칸도 모르는 칸
  assert.ok(normalizeEffectTemplate("chat", "{toString} {크기}").error);
});

console.log(`ok ${n}`);
