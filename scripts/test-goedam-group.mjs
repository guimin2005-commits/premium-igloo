// 📌 게임 그룹 지원(lib/goedamGroup.js — 약속 문서 .claude/mockups/goedam-group/SPEC.md) 순수 계산 점검 — DB 없이 돈다(연결 · 쓰기 없음).
//    설정 정리 · 열림 판정 · 관리 저장 검사 · 글자 정리(이름 · 게임 · 언제 · 반려 사유) · 상품권 번호 붙여 넣기 · 참여 코드 · mid ·
//    화면 그룹 모양(남의 ID 가 안 나가는지) · 참여 판정 순서(why) · 그룹장 / 나가기 / 지원 입구 · 탭 숫자 · 관리 목록 차례 · 알림 문구 ·
//    지원 보너스(설정 장 수 0~20 · 추첨권 Purchase 모양 · 줄 대상 · 줄 수 있나(괴담회 켜짐 · 추첨 닫힘) · 관리 상세 칸),
//    그리고 DB 에 닿기 전에 끝나는 동작 거절(로그인 · 숫자 ID 아님 · 모르는 동작).
//    lib/goedamGroup.js 를 불러오려고 MONGODB_URI 에 연결되지 않는 주소를 넣는다 — 연결은 하지 않는다(scripts/test-quest-reroll.mjs 와 같은 식).
//    사용 (저장소 루트에서): node scripts/test-goedam-group.mjs
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 사이트 코드의 "@/…" 별칭과 확장자 없는 import 를 node 에서도 풀어 준다(scripts/test-catalog-draft.mjs 와 같은 식)
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

// 연결되지 않는 주소(불러오기만 — 연결 · 쓰기 없음) · mid 를 늘 같은 열쇠로
process.env.MONGODB_URI = "mongodb://127.0.0.1:9/test-goedam-group-never-connects";
process.env.NEXTAUTH_SECRET = "test-goedam-group-secret";

const gg = await import("../lib/goedamGroup.js");

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${e?.message?.split("\n").join("\n       ")}`);
  }
}

const KST = (s) => new Date(`${s}+09:00`).getTime();
const cfgOf = (over = {}) => gg.normalizeGroupConfig({ enabled: true, ...over });
const NOW = KST("2026-10-30T12:00:00.000");
// 디스코드 숫자 ID 모양(17~20자리)
const A = "100000000000000001";
const B = "100000000000000002";
const C = "100000000000000003";
const D = "100000000000000004";
const groupOf = (over = {}) => ({
  _id: "65f000000000000000000001",
  code: "7K4QXM",
  name: "야간 괴담 파티",
  game: "Phasmophobia",
  when: new Date(KST("2026-10-31T22:00:00.000")),
  leaderId: A,
  members: [
    { userId: A, name: "연휘율", joinedAt: new Date(NOW) },
    { userId: B, name: "띠용", joinedAt: new Date(NOW) },
    { userId: C, name: "모브", joinedAt: new Date(NOW) },
  ],
  status: "open",
  reason: "",
  ...over,
});

console.log("설정 정리");
await test("문서 없음 → 기본값(꺼짐 · 10. 25. 00:00 ~ 11. 1. 00:00 KST · 4 · 10)", () => {
  const c = gg.normalizeGroupConfig(null);
  assert.equal(c.key, "goedam-group");
  assert.equal(c.enabled, false);
  assert.equal(c.startsAt.getTime(), KST("2026-10-25T00:00:00.000"));
  assert.equal(c.endsAt.getTime(), KST("2026-11-01T00:00:00.000"));
  assert.equal(c.minMembers, 4);
  assert.equal(c.maxMembers, 10);
  assert.equal(c.applyTickets, 5);
});
await test("지원 보너스 장 수 — 0~20 · 칸 없음 · 잘못된 값은 기본 5 · 0 은 0(안 줌)", () => {
  assert.equal(gg.normalizeGroupConfig({ applyTickets: 0 }).applyTickets, 0);
  assert.equal(gg.normalizeGroupConfig({ applyTickets: 20 }).applyTickets, 20);
  assert.equal(gg.normalizeGroupConfig({ applyTickets: 21 }).applyTickets, 20);
  assert.equal(gg.normalizeGroupConfig({ applyTickets: -3 }).applyTickets, 0);
  assert.equal(gg.normalizeGroupConfig({ applyTickets: 7.9 }).applyTickets, 7);
  assert.equal(gg.normalizeGroupConfig({ applyTickets: "8" }).applyTickets, 8);
  for (const v of [undefined, null, "", "x", true, false, NaN]) assert.equal(gg.normalizeGroupConfig({ applyTickets: v }).applyTickets, 5, `apply ${v}`);
  assert.deepEqual(gg.APPLY_TICKETS, { min: 0, max: 20 });
  assert.equal(gg.GROUP_DEFAULTS.applyTickets, 5);
});
await test("인원 범위 — 최소 2~20 · 최대 최소~50(최대는 최소보다 작아지지 않는다)", () => {
  assert.equal(gg.normalizeGroupConfig({ minMembers: 1 }).minMembers, 2);
  assert.equal(gg.normalizeGroupConfig({ minMembers: 99 }).minMembers, 20);
  assert.equal(gg.normalizeGroupConfig({ minMembers: 8, maxMembers: 3 }).maxMembers, 8);
  assert.equal(gg.normalizeGroupConfig({ maxMembers: 999 }).maxMembers, 50);
  assert.equal(gg.normalizeGroupConfig({ minMembers: 12 }).maxMembers, 12);
  assert.equal(gg.normalizeGroupConfig({ minMembers: "6", maxMembers: "7" }).maxMembers, 7);
  assert.equal(gg.normalizeGroupConfig({ minMembers: true }).minMembers, 4);
});
await test("잘못된 날짜 칸 → 기본 날짜", () => {
  const c = gg.normalizeGroupConfig({ startsAt: "아무 글자", endsAt: null });
  assert.equal(c.startsAt.getTime(), KST("2026-10-25T00:00:00.000"));
  assert.equal(c.endsAt.getTime(), KST("2026-11-01T00:00:00.000"));
});

console.log("열림");
await test("켜짐 · 시작 ≤ 지금 < 끝 — 시작은 들어가고 끝은 안 들어간다", () => {
  const c = cfgOf();
  assert.equal(gg.groupOpen(c, KST("2026-10-25T00:00:00.000")), true);
  assert.equal(gg.groupOpen(c, KST("2026-10-24T23:59:59.999")), false);
  assert.equal(gg.groupOpen(c, KST("2026-10-31T23:59:59.999")), true);
  assert.equal(gg.groupOpen(c, KST("2026-11-01T00:00:00.000")), false);
});
await test("꺼짐이면 기간 안이어도 닫힘", () => {
  assert.equal(gg.groupOpen(cfgOf({ enabled: false }), NOW), false);
});

console.log("관리 저장 검사");
const cur = gg.normalizeGroupConfig(null);
await test("온 칸만 — 바뀐 칸만 set 에", () => {
  const r = gg.checkConfigPatch(cur, { enabled: true, minMembers: 5 });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.set).sort(), ["enabled", "minMembers"]);
  assert.equal(r.set.minMembers, 5);
});
await test("날짜 글자 → Date · 잘못된 날짜 거절", () => {
  const r = gg.checkConfigPatch(cur, { startsAt: "2026-10-26T00:00:00+09:00" });
  assert.equal(r.ok, true);
  assert.ok(r.set.startsAt instanceof Date);
  assert.equal(gg.checkConfigPatch(cur, { startsAt: "nope" }).ok, false);
  assert.equal(gg.checkConfigPatch(cur, { endsAt: "" }).ok, false);
});
await test("시작 ≥ 끝 거절(지금 값과 섞어 본다)", () => {
  assert.equal(gg.checkConfigPatch(cur, { startsAt: "2026-11-09T00:00:00+09:00" }).ok, false);
  assert.equal(gg.checkConfigPatch(cur, { endsAt: "2026-10-20T00:00:00+09:00" }).ok, false);
});
await test("최소 인원 2~20 정수만", () => {
  for (const v of [1, 21, 3.5, "", null, true, "x"]) assert.equal(gg.checkConfigPatch(cur, { minMembers: v }).ok, false, `min ${v}`);
  assert.equal(gg.checkConfigPatch(cur, { minMembers: "6" }).ok, true);
});
await test("최대 인원 최소~50 — 새 최소와 같이 본다 · 최소만 올려 지금 최대보다 커지면 거절", () => {
  assert.equal(gg.checkConfigPatch(cur, { maxMembers: 3 }).ok, false);
  assert.equal(gg.checkConfigPatch(cur, { maxMembers: 51 }).ok, false);
  assert.equal(gg.checkConfigPatch(cur, { minMembers: 6, maxMembers: 6 }).ok, true);
  assert.equal(gg.checkConfigPatch(cur, { minMembers: 12 }).ok, false);
  assert.equal(gg.checkConfigPatch(cur, { minMembers: 12, maxMembers: 12 }).ok, true);
});
await test("지원 보너스 장 수 0~20 정수만 · 0 은 된다(안 줌)", () => {
  for (const v of [-1, 21, 2.5, "", null, true, false, "x"]) assert.equal(gg.checkConfigPatch(cur, { applyTickets: v }).ok, false, `apply ${v}`);
  for (const v of [0, 1, 5, 20, "10"]) {
    const r = gg.checkConfigPatch(cur, { applyTickets: v });
    assert.equal(r.ok, true, `apply ${v}`);
    assert.equal(r.set.applyTickets, Number(v));
  }
  assert.equal(gg.checkConfigPatch(cur, { applyTickets: 21 }).error, "지원 보너스 추첨권은 0~20장 사이 정수로 입력해 주십시오.");
  assert.equal("applyTickets" in gg.checkConfigPatch(cur, { enabled: true }).set, false);
});
await test("형식 — 객체 아님 · enabled 가 참거짓이 아니면 거절", () => {
  assert.equal(gg.checkConfigPatch(cur, null).ok, false);
  assert.equal(gg.checkConfigPatch(cur, []).ok, false);
  assert.equal(gg.checkConfigPatch(cur, { enabled: "true" }).ok, false);
  assert.equal(gg.checkConfigPatch(cur, {}).ok, true);
});

console.log("글자 정리");
await test("앞뒤 빈칸 · 겹친 빈칸 · 제어 글자 · 폭 없는 글자", () => {
  assert.equal(gg.cleanText("  야간   괴담\t파티 \n"), "야간 괴담 파티");
  assert.equal(gg.cleanText("a\u0000b​c‮d"), "a b c d");
  assert.equal(gg.cleanText(null), "");
});
await test("그룹 이름 1~20자 · 게임 1~30자(코드 포인트로 센다)", () => {
  assert.equal(gg.checkName("").error, "그룹 이름을 입력해 주세요");
  assert.equal(gg.checkName("   ").ok, false);
  assert.equal(gg.checkName("가".repeat(20)).ok, true);
  assert.equal(gg.checkName("가".repeat(21)).error, "그룹 이름은 20자까지입니다");
  assert.equal(gg.checkName("👻".repeat(20)).ok, true);
  assert.equal(gg.checkName("  야간 괴담 파티 ").value, "야간 괴담 파티");
  // 2026-10-25 게임은 정해진 목록(lib/goedamGames.js)에서만
  assert.equal(gg.checkGame("").error, "게임을 골라 주세요");
  assert.deepEqual(gg.checkGame("Phasmophobia"), { ok: true, value: "Phasmophobia" });
  assert.equal(gg.checkGame("  마인크래프트   공포탈출맵 ").value, "마인크래프트 공포탈출맵");
  assert.equal(gg.checkGame("리썰컴퍼니").ok, true);
  assert.equal(gg.checkGame("League of Legends").error, "목록에 있는 게임을 골라 주세요");
  assert.equal(gg.checkGame("phasmophobia").ok, false);
});
await test("언제(선택) — 비면 null · 날짜 글자면 시각 · 그 밖 거절", () => {
  assert.deepEqual(gg.checkWhen(null), { ok: true, value: null });
  assert.deepEqual(gg.checkWhen(""), { ok: true, value: null });
  assert.equal(gg.checkWhen(undefined).value, null);
  const w = gg.checkWhen("2026-10-31T22:00:00+09:00");
  assert.equal(w.ok, true);
  assert.equal(w.value.getTime(), KST("2026-10-31T22:00:00.000"));
  assert.equal(gg.checkWhen("내일 밤").error, "날짜가 올바르지 않습니다");
  assert.equal(gg.checkWhen({}).ok, false);
  assert.equal(gg.checkWhen("1900-01-01T00:00:00Z").ok, false);
});
await test("반려 사유 1~100자", () => {
  assert.equal(gg.checkReason("").ok, false);
  assert.equal(gg.checkReason("부계정 의심").value, "부계정 의심");
  assert.equal(gg.checkReason("가".repeat(100)).ok, true);
  assert.equal(gg.checkReason("가".repeat(101)).ok, false);
});
await test("표시 이름 스냅샷 — 정리 + 64자", () => {
  assert.equal(gg.cleanName("  띠용 "), "띠용");
  assert.equal([...gg.cleanName("가".repeat(80))].length, 64);
  assert.equal(gg.cleanName(undefined), "");
});

console.log("상품권 번호 붙여 넣기");
await test("줄마다 하나 · 앞뒤 빈칸 · 빈 줄 · 겹침 빼기(CRLF · CR 도)", () => {
  const r = gg.parseGiftCodes(" AAAA-1111 \r\n\r\nBBBB-2222\rAAAA-1111\n  \nCCCC-3333\n");
  assert.equal(r.ok, true);
  assert.deepEqual(r.codes, ["AAAA-1111", "BBBB-2222", "CCCC-3333"]);
  assert.equal(r.dup, 1);
});
await test("빈 글 · 500줄 넘음 · 한 줄 100자 넘음은 깎지 않고 거절", () => {
  assert.equal(gg.parseGiftCodes("\n  \n").ok, false);
  assert.equal(gg.parseGiftCodes(Array.from({ length: 500 }, (_, i) => `C${i}`).join("\n")).ok, true);
  assert.equal(gg.parseGiftCodes(Array.from({ length: 501 }, (_, i) => `C${i}`).join("\n")).ok, false);
  assert.equal(gg.parseGiftCodes("x".repeat(100)).ok, true);
  assert.equal(gg.parseGiftCodes("x".repeat(101)).ok, false);
});

console.log("참여 코드 · mid");
await test("코드 정리 — 소문자 · 빈칸 · 하이픈 · 대시 빼고 대문자(친구 초대와 같은 함수)", () => {
  assert.equal(gg.normalizeGroupCode(" 7k4-qxm "), "7K4QXM");
  assert.equal(gg.normalizeGroupCode("7K4—QXM"), "7K4QXM");
  assert.equal(gg.isGroupCode("7K4QXM"), true);
  for (const bad of ["7K4QX", "7K4QXMM", "7K4QX0", "7K4QXO", "7K4QX1", "7K4QXI", "", null]) assert.equal(gg.isGroupCode(bad), false, `code ${bad}`);
});
await test("새 코드 — 늘 6자 · 글자판 안", () => {
  for (let i = 0; i < 300; i++) assert.equal(gg.isGroupCode(gg.genGroupCode()), true);
});
await test("mid — 10자 16진 · 같은 그룹 · 같은 사람이면 같고 하나라도 다르면 다르다 · 열쇠가 다르면 다르다", () => {
  const g1 = "65f000000000000000000001";
  const g2 = "65f000000000000000000002";
  const m = gg.memberMid(g1, A);
  assert.match(m, /^[0-9a-f]{10}$/);
  assert.equal(gg.memberMid(g1, A), m);
  assert.notEqual(gg.memberMid(g1, B), m);
  assert.notEqual(gg.memberMid(g2, A), m);
  assert.notEqual(gg.memberMid(g1, A, "다른 열쇠"), m);
  assert.ok(!m.includes(A.slice(0, 6)));
});
await test("디스코드 숫자 ID 모양", () => {
  assert.equal(gg.isDiscordId(A), true);
  assert.equal(gg.isDiscordId("dev-user"), false);
  assert.equal(gg.isDiscordId("1234"), false);
  assert.equal(gg.isDiscordId(""), false);
});

console.log("화면 그룹 모양(G)");
await test("약속 문서 모양 그대로 · 그룹장 · 나 표시 · count", () => {
  const v = gg.groupView(groupOf(), B);
  assert.deepEqual(Object.keys(v).sort(), ["code", "count", "game", "members", "name", "reason", "status", "when"].sort());
  assert.equal(v.code, "7K4QXM");
  assert.equal(v.when, "2026-10-31T13:00:00.000Z");
  assert.equal(v.count, 3);
  assert.deepEqual(v.members.map((m) => [m.name, m.leader, m.me]), [["연휘율", true, false], ["띠용", false, true], ["모브", false, false]]);
  for (const m of v.members) assert.deepEqual(Object.keys(m).sort(), ["leader", "me", "mid", "name"]);
});
await test("남의 디스코드 ID · 그룹 _id 가 응답 어디에도 없다", () => {
  const s = JSON.stringify(gg.groupView(groupOf(), ""));
  for (const id of [A, B, C, "65f000000000000000000001"]) assert.ok(!s.includes(id), `leak ${id}`);
});
await test("빈 이름은 「이름 없음」 · 모르는 상태는 open · when 없으면 null", () => {
  const v = gg.groupView(groupOf({ members: [{ userId: A, name: "" }], status: "weird", when: null }), A);
  assert.equal(v.members[0].name, "이름 없음");
  assert.equal(v.status, "open");
  assert.equal(v.when, null);
});

console.log("참여 판정(why)");
const cfg = cfgOf();
await test("되는 경우 → \"\"", () => {
  assert.equal(gg.joinWhy({ cfg, group: groupOf(), viewerId: D, now: NOW }), "");
});
await test("순서 — guest → not-open → has-group → closed → full", () => {
  const closedFull = groupOf({ status: "review", members: Array.from({ length: 10 }, (_, i) => ({ userId: `2000000000000000${String(i).padStart(2, "0")}`, name: "x" })) });
  assert.equal(gg.joinWhy({ cfg, group: closedFull, viewerId: "", now: NOW }), "guest");
  assert.equal(gg.joinWhy({ cfg, group: closedFull, viewerId: "dev-user", now: NOW }), "guest");
  assert.equal(gg.joinWhy({ cfg: cfgOf({ enabled: false }), group: closedFull, viewerId: D, hasGroup: true, now: NOW }), "not-open");
  assert.equal(gg.joinWhy({ cfg, group: closedFull, viewerId: D, now: KST("2026-11-09T00:00:00.000") }), "not-open");
  assert.equal(gg.joinWhy({ cfg, group: closedFull, viewerId: D, hasGroup: true, now: NOW }), "has-group");
  assert.equal(gg.joinWhy({ cfg, group: closedFull, viewerId: D, now: NOW }), "closed");
  assert.equal(gg.joinWhy({ cfg, group: { ...closedFull, status: "open" }, viewerId: D, now: NOW }), "full");
});
await test("이미 그 그룹 멤버면 has-group · 반려 · 승인 그룹은 closed", () => {
  assert.equal(gg.joinWhy({ cfg, group: groupOf(), viewerId: B, now: NOW }), "has-group");
  assert.equal(gg.joinWhy({ cfg, group: groupOf({ status: "rejected" }), viewerId: D, now: NOW }), "closed");
  assert.equal(gg.joinWhy({ cfg, group: groupOf({ status: "approved" }), viewerId: D, now: NOW }), "closed");
});
await test("최대 인원 — 설정 값을 따른다(4명 그룹 · 최대 4 → full)", () => {
  const four = groupOf({ members: [...groupOf().members, { userId: D, name: "넷" }] });
  assert.equal(gg.joinWhy({ cfg: cfgOf({ minMembers: 2, maxMembers: 4 }), group: four, viewerId: "100000000000000009", now: NOW }), "full");
  assert.equal(gg.joinWhy({ cfg: cfgOf({ minMembers: 2, maxMembers: 5 }), group: four, viewerId: "100000000000000009", now: NOW }), "");
});
await test("거절 문구 — 약속 문서 §3 글자 그대로", () => {
  assert.deepEqual(gg.whyRefusal("guest"), { ok: false, status: 401, error: "로그인이 필요합니다" });
  assert.equal(gg.whyRefusal("not-open").error, "지원 기간이 아닙니다");
  assert.equal(gg.whyRefusal("has-group").error, "이미 다른 그룹에 있습니다");
  assert.equal(gg.whyRefusal("closed").error, "모집이 끝난 그룹입니다");
  assert.equal(gg.whyRefusal("full").error, "그룹이 꽉 찼습니다");
  assert.equal(gg.MSG.notFound, "그룹을 찾을 수 없습니다");
  assert.equal(gg.minMsg(4), "최소 4명부터 지원할 수 있습니다");
});

console.log("그룹장 · 나가기 · 지원 입구");
await test("그룹장 동작 — 그룹 없음 404 · 그룹장 아님 403 · 심사 중 · 승인 막힘 · open · rejected 통과", () => {
  assert.equal(gg.leaderRefusal(null, A).status, 404);
  assert.equal(gg.leaderRefusal(groupOf(), B).error, "그룹장만 할 수 있습니다");
  assert.equal(gg.leaderRefusal(groupOf({ status: "review" }), A).error, "심사 중인 그룹입니다");
  assert.equal(gg.leaderRefusal(groupOf({ status: "approved" }), A).error, "승인된 그룹입니다");
  assert.equal(gg.leaderRefusal(groupOf(), A), null);
  assert.equal(gg.leaderRefusal(groupOf({ status: "rejected" }), A), null);
});
await test("나가기 — 그룹장은 못 나감 · 심사 중 · 승인 막힘 · 멤버는 open · rejected 에서 통과", () => {
  assert.equal(gg.leaveRefusal(groupOf(), A).error, "그룹장은 나갈 수 없습니다");
  assert.equal(gg.leaveRefusal(groupOf({ status: "review" }), B).error, "심사 중인 그룹입니다");
  assert.equal(gg.leaveRefusal(groupOf({ status: "approved" }), B).error, "승인된 그룹입니다");
  assert.equal(gg.leaveRefusal(groupOf(), B), null);
  assert.equal(gg.leaveRefusal(groupOf({ status: "rejected" }), B), null);
  assert.equal(gg.leaveRefusal(null, B).error, "그룹을 찾을 수 없습니다");
});
await test("지원하기 — 그룹장 · 열림 · 인원 ≥ 최소", () => {
  const four = groupOf({ members: [...groupOf().members, { userId: D, name: "넷" }] });
  assert.equal(gg.submitRefusal({ cfg, group: groupOf(), viewerId: A, now: NOW }).error, "최소 4명부터 지원할 수 있습니다");
  assert.equal(gg.submitRefusal({ cfg, group: four, viewerId: A, now: NOW }), null);
  assert.equal(gg.submitRefusal({ cfg, group: four, viewerId: B, now: NOW }).error, "그룹장만 할 수 있습니다");
  assert.equal(gg.submitRefusal({ cfg, group: four, viewerId: A, now: KST("2026-11-09T00:00:00.000") }).error, "지원 기간이 아닙니다");
  assert.equal(gg.submitRefusal({ cfg, group: { ...four, status: "review" }, viewerId: A, now: NOW }).error, "심사 중인 그룹입니다");
  assert.equal(gg.submitRefusal({ cfg, group: { ...four, status: "rejected" }, viewerId: A, now: NOW }), null);
  assert.equal(gg.submitRefusal({ cfg: cfgOf({ minMembers: 3 }), group: groupOf(), viewerId: A, now: NOW }), null);
});
await test("탭 숫자(meta n) — 그룹장이고 지금 지원할 수 있을 때만 1", () => {
  const four = groupOf({ members: [...groupOf().members, { userId: D, name: "넷" }] });
  assert.equal(gg.metaCount({ cfg, group: four, viewerId: A, now: NOW }), 1);
  assert.equal(gg.metaCount({ cfg, group: { ...four, status: "rejected" }, viewerId: A, now: NOW }), 1);
  assert.equal(gg.metaCount({ cfg, group: four, viewerId: B, now: NOW }), 0);
  assert.equal(gg.metaCount({ cfg, group: groupOf(), viewerId: A, now: NOW }), 0);
  assert.equal(gg.metaCount({ cfg, group: { ...four, status: "review" }, viewerId: A, now: NOW }), 0);
  assert.equal(gg.metaCount({ cfg: cfgOf({ enabled: false }), group: four, viewerId: A, now: NOW }), 0);
  assert.equal(gg.metaCount({ cfg, group: null, viewerId: A, now: NOW }), 0);
  assert.equal(gg.metaCount({ cfg, group: four, viewerId: "", now: NOW }), 0);
});

console.log("관리");
await test("목록 차례 — 심사 중 먼저(지원 최근 순) · 그다음 만든 시각 최근 순", () => {
  const rows = [
    { id: "a", status: "open", createdAt: "2026-10-26T00:00:00.000Z" },
    { id: "b", status: "review", submittedAt: "2026-10-27T00:00:00.000Z", createdAt: "2026-10-25T00:00:00.000Z" },
    { id: "c", status: "approved", createdAt: "2026-10-28T00:00:00.000Z" },
    { id: "d", status: "review", submittedAt: "2026-10-29T00:00:00.000Z", createdAt: "2026-10-25T01:00:00.000Z" },
    { id: "e", status: "rejected", createdAt: "2026-10-27T00:00:00.000Z" },
  ];
  assert.deepEqual(gg.sortAdminGroups(rows).map((r) => r.id), ["d", "b", "c", "e", "a"]);
  assert.equal(rows[0].id, "a");
});
await test("목록 한 줄 모양 — 관리자에게는 그룹장 ID 를 준다", () => {
  const r = gg.adminRow({ ...groupOf(), submittedAt: null, reviewedAt: null, reviewedBy: "", createdAt: new Date(NOW) });
  assert.deepEqual(
    Object.keys(r).sort(),
    ["code", "count", "createdAt", "game", "id", "leader", "name", "reason", "reviewedAt", "reviewedBy", "status", "submittedAt", "when"].sort()
  );
  assert.deepEqual(r.leader, { id: A, name: "연휘율" });
  assert.equal(r.id, "65f000000000000000000001");
  assert.equal(r.count, 3);
  assert.equal(r.submittedAt, null);
});
await test("설정 모양 — 날짜는 ISO", () => {
  const c = gg.toAdminConfig(gg.normalizeGroupConfig(null));
  assert.deepEqual(c, {
    enabled: false,
    startsAt: "2026-10-24T15:00:00.000Z",
    endsAt: "2026-10-31T15:00:00.000Z",
    minMembers: 4,
    maxMembers: 10,
    applyTickets: 5,
    updatedAt: null,
  });
  assert.equal(gg.toAdminConfig(gg.normalizeGroupConfig({ applyTickets: 0 })).applyTickets, 0);
});
await test("알림 · 모자람 문구 — 약속 문서 §2 글자 그대로", () => {
  assert.deepEqual(gg.approveNotice("야간 괴담 파티"), {
    type: "축하",
    title: "게임 그룹 지원 승인",
    content: "「야간 괴담 파티」 지원이 승인되었습니다. 이벤트 › 게임 그룹 지원에서 문화상품권 번호를 확인하세요.",
  });
  assert.deepEqual(gg.rejectNotice("야간 괴담 파티", "부계정 의심"), {
    type: "안내",
    title: "게임 그룹 지원 반려",
    content: "「야간 괴담 파티」 지원이 반려되었습니다. 사유: 부계정 의심",
  });
  assert.equal(gg.shortMsg(4, 2), "상품권 번호가 모자랍니다 · 필요 4 · 남은 2");
});

console.log("지원 보너스");
const goedamCfg = { ticketItemId: "item-hw-ticket", ticketItemName: "할로윈 추첨권" };
await test("추첨권 Purchase — 주문 묶음 goedam:group:<userId> · 메모 「게임 그룹 지원」 · 괴담회 추첨권 아이템", () => {
  const at = new Date(NOW);
  const docs = gg.bonusPurchaseDocs({ goedam: goedamCfg, userId: B, userName: "띠용", n: 5, now: at });
  assert.equal(docs.length, 5);
  for (const d of docs) {
    assert.equal(d.orderId, `goedam:group:${B}`);
    assert.equal(d.adminNote, "게임 그룹 지원");
    assert.equal(d.itemRef, "item-hw-ticket");
    assert.equal(d.itemName, "할로윈 추첨권");
    assert.equal(d.userId, B);
    assert.equal(d.userName, "띠용");
    assert.equal(d.status, "completed");
    assert.equal(d.price, 0);
    assert.equal(d.createdAt, at);
  }
  assert.equal(gg.BONUS_SID, "group");
});
await test("추첨권 Purchase 장 수 — 10장 넘어도 깎이지 않는다(20장까지) · 0 · 잘못된 값은 0건", () => {
  for (const n of [1, 9, 10, 11, 19, 20]) assert.equal(gg.bonusPurchaseDocs({ goedam: goedamCfg, userId: A, n }).length, n, `n ${n}`);
  for (const n of [0, -2, null, undefined, "x"]) assert.equal(gg.bonusPurchaseDocs({ goedam: goedamCfg, userId: A, n }).length, 0, `n ${n}`);
  assert.equal(gg.bonusPurchaseDocs({ goedam: goedamCfg, userId: A, n: 3.7 }).length, 3);
  assert.ok(gg.bonusPurchaseDocs({ goedam: goedamCfg, userId: A, n: 20 }).every((d) => d.orderId === `goedam:group:${A}`));
});
await test("줄 대상 — 디스코드 숫자 ID · 겹침 빼기 · 이미 받은 사람 빼기 · 차례 그대로", () => {
  const ms = [...groupOf().members, { userId: B, name: "겹침" }, { userId: "dev-user", name: "테스트" }, { userId: "", name: "빈" }, null, { userId: D, name: "넷" }];
  assert.deepEqual(gg.bonusTargets(ms).map((m) => m.userId), [A, B, C, D]);
  assert.equal(gg.bonusTargets(ms).find((m) => m.userId === B).name, "띠용");
  assert.deepEqual(gg.bonusTargets(ms, new Set([A, C])).map((m) => m.userId), [B, D]);
  assert.deepEqual(gg.bonusTargets(null), []);
  assert.deepEqual(gg.bonusTargets(ms, new Set([A, B, C, D])), []);
});
await test("관리 상세 칸 — 받음 { tickets, grantedAt(ISO) } · 미지급 null", () => {
  assert.equal(gg.bonusView(null), null);
  assert.equal(gg.bonusView(undefined), null);
  assert.deepEqual(gg.bonusView({ userId: A, tickets: 5, grantedAt: new Date(NOW) }), { tickets: 5, grantedAt: new Date(NOW).toISOString() });
  assert.deepEqual(gg.bonusView({ tickets: "x", grantedAt: null }), { tickets: 0, grantedAt: null });
});
await test("줄 수 있나(설정만) — 지원하기는 괴담회 켜짐 · 지금 < 추첨 닫힘 · 추첨권 아이템, 관리자는 아이템만", () => {
  const closes = new Date(KST("2026-11-09T00:00:00.000"));
  const on = { ...goedamCfg, enabled: true, drawClosesAt: closes };
  assert.equal(gg.bonusBlock(on, { now: NOW }), "");
  assert.equal(gg.bonusBlock(on, { now: closes.getTime() - 1 }), "");
  // 그룹 기간 끝이 추첨 닫힘보다 늦게 저장돼도 닫힌 뒤엔 안 준다(lib/invite.js bonusOf 와 같다)
  assert.equal(gg.bonusBlock(on, { now: closes.getTime() }), "괴담회 추첨이 마감되었습니다.");
  assert.equal(gg.bonusBlock(on, { now: KST("2026-11-10T12:00:00.000") }), "괴담회 추첨이 마감되었습니다.");
  assert.equal(gg.bonusBlock({ ...on, enabled: false }, { now: NOW }), "괴담회가 꺼져 있습니다.");
  assert.equal(gg.bonusBlock({ ...on, ticketItemId: "" }, { now: NOW }), "추첨권 아이템이 지정되지 않았습니다.");
  // 관리자 다시 지급 — 꺼짐 · 닫힘은 덮어쓴다 · 아이템은 있어야 한다
  assert.equal(gg.bonusBlock({ ...on, enabled: false }, { admin: true, now: closes.getTime() + 1 }), "");
  assert.equal(gg.bonusBlock({ ...on, ticketItemId: "" }, { admin: true, now: NOW }), "추첨권 아이템이 지정되지 않았습니다.");
  assert.equal(gg.bonusBlock(null, { now: NOW }), "괴담회가 꺼져 있습니다.");
});
await test("다시 지급할 수 있는 상태 — 심사 중 · 승인 · 반려(모집 중은 아님)", () => {
  assert.deepEqual(gg.APPLIED_STATUS, ["review", "approved", "rejected"]);
  assert.equal(gg.APPLIED_STATUS.includes("open"), false);
});
await test("다시 지급 — 모르는 id 는 DB 에 닿기 전에 404", async () => {
  assert.deepEqual(await gg.regrantGroupBonus({ id: "not-an-id" }), { ok: false, status: 404, error: "그룹을 찾을 수 없습니다." });
});

console.log("DB 전에 끝나는 동작 거절");
await test("동작 목록", () => {
  assert.deepEqual(gg.GROUP_ACTIONS, ["create", "join", "leave", "kick", "edit", "disband", "submit"]);
});
await test("로그인 없음 401 · 숫자 ID 아님 403 · 모르는 동작 400(DB 에 닿지 않는다)", async () => {
  assert.deepEqual(await gg.groupAction({ action: "create", userId: "" }), { ok: false, status: 401, error: "로그인이 필요합니다" });
  assert.deepEqual(await gg.groupAction({ action: "create", userId: "dev-user" }), { ok: false, status: 403, error: "참여할 수 없는 계정입니다" });
  assert.equal((await gg.groupAction({ action: "toString", userId: A })).status, 400);
  assert.equal((await gg.groupAction({ action: "approve", userId: A })).status, 400);
});

console.log(`\n${passed} 통과 · ${failures.length} 실패`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failures.length ? 1 : 0);
