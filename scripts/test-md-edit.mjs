// 📌 글쓰기 편집 동작(app/write/mdEdit.ts) · 본문 그리기(app/components/mdRender.ts) 시험 — DB 없이 순수 함수만.
//    사용 (저장소 루트에서): node scripts/test-md-edit.mjs   (Node 24 — .ts 를 그대로 읽는다)
import { registerHooks } from "node:module";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 확장자 없는 상대 경로(./mdRender)를 .ts 로 — 사이트(Next)는 확장자 없이 쓴다. @/ 는 저장소 루트
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) spec = pathToFileURL(path.join(ROOT, spec.slice(2))).href + (path.extname(spec) ? "" : ".js");
    try { return next(spec, ctx); } catch (e) {
      if (e?.code !== "ERR_MODULE_NOT_FOUND" || !spec.startsWith(".")) throw e;
      return next(spec + ".ts", ctx);
    }
  },
});
const E = await import("../app/write/mdEdit.ts");
const R = await import("../app/components/mdRender.ts");
const D = await import("../lib/noticeDiscord.js");

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log(`  FAIL ${name}\n       ${String(e?.message || e).split("\n").slice(0, 8).join("\n       ")}`); } };
// "|" 로 커서 · "[" "]" 로 선택을 적은 글 → { v, s, e }
const at = (src) => {
  const v = src.replace(/[|[\]]/g, "");
  if (src.includes("|")) { const s = src.indexOf("|"); return { v, s, e: s }; }
  const s = src.indexOf("["), e = src.indexOf("]") - 1;
  return { v, s, e };
};
// 결과를 같은 표기로
const show = (v, ed) => {
  const out = E.applyToValue(v, ed);
  if (ed.selStart === ed.selEnd) return out.slice(0, ed.selStart) + "|" + out.slice(ed.selStart);
  return out.slice(0, ed.selStart) + "[" + out.slice(ed.selStart, ed.selEnd) + "]" + out.slice(ed.selEnd);
};
const wrap = (src, mark = "**") => { const { v, s, e } = at(src); return show(v, E.toggleWrap(v, s, e, mark)); };
const block = (src, kind) => { const { v, s, e } = at(src); return show(v, E.setBlock(v, s, e, kind)); };
const enter = (src) => { const { v, s, e } = at(src); const ed = E.enterEdit(v, s, e); return ed ? show(v, ed) : null; };
const tab = (src, out = false) => { const { v, s, e } = at(src); const ed = E.indentEdit(v, s, e, out); return ed ? show(v, ed) : null; };

// ── 굵게 · 밑줄 · 취소선 · 강조
t("고른 글 굵게", () => assert.equal(wrap("안녕 [세상] 끝"), "안녕 **[세상]** 끝"));
t("굵은 글을 다시 누르면 벗김(안쪽 고름)", () => assert.equal(wrap("안녕 **[세상]** 끝"), "안녕 [세상] 끝"));
t("굵은 글을 다시 누르면 벗김(별까지 고름)", () => assert.equal(wrap("안녕 [**세상**] 끝"), "안녕 [세상] 끝"));
t("고른 글 앞뒤 빈칸은 밖으로", () => assert.equal(wrap("안녕[ 세상 ]끝"), "안녕 **[세상]** 끝"));
t("고른 게 없으면 커서 낱말", () => assert.equal(wrap("안녕 세|상 끝"), "안녕 **세|상** 끝"));
t("굵은 낱말 안 커서 → 벗김", () => assert.equal(wrap("안녕 **세|상** 끝"), "안녕 세|상 끝"));
t("빈 자리 → 빈 짝 사이 커서", () => assert.equal(wrap("안녕 | 끝"), "안녕 **|** 끝"));
t("밑줄 · 취소선 · 강조", () => {
  assert.equal(wrap("[a]", "__"), "__[a]__");
  assert.equal(wrap("[a]", "~~"), "~~[a]~~");
  assert.equal(wrap("[a]", "=="), "==[a]==");
});
t("여러 줄 — 줄마다 · 목록 기호는 밖 · 빈 줄 그대로", () => assert.equal(wrap("[* 하나\n\n* 둘]"), "[* **하나**\n\n* **둘**]"));
t("다른 서식 안에서는 벗기지 않고 더한다", () => assert.equal(wrap("__[밑줄]__"), "__**[밑줄]**__"));
t("커서 자리 서식 알기", () => {
  const { v, s } = at("가 **나|다** __라__");
  const a = E.activeAt(v, s);
  assert.equal(a.marks["**"], true);
  assert.equal(a.marks["__"], false);
  assert.equal(E.activeAt("## 제목", 3).block, "h2");
});

// ── 글자 크기 · 목록 · 번호 · 인용
t("큰 제목 켜기 · 커서 따라감", () => assert.equal(block("공지|입니다", "h1"), "# 공지|입니다"));
t("같은 제목 다시 → 끔", () => assert.equal(block("# 공지|입니다", "h1"), "공지|입니다"));
t("제목 크기 바꾸기", () => assert.equal(block("# 공지|", "h3"), "### 공지|"));
t("본문 → 제목 · 작은 글씨 떼기", () => {
  assert.equal(block("-# 작|게", null), "작|게");
  assert.equal(block("* 목록|", null), "* 목록|"); // 본문은 크기만 — 목록은 그대로
});
t("여러 줄 목록 켜기 · 끄기", () => {
  assert.equal(block("[하나\n둘]", "bullet"), "[* 하나\n* 둘]");
  assert.equal(block("[* 하나\n* 둘]", "bullet"), "[하나\n둘]");
});
t("번호 — 차례대로 · 빈 줄 건너뜀", () => assert.equal(block("[가\n\n나\n다]", "number"), "[1. 가\n\n2. 나\n3. 다]"));
t("목록 ↔ 번호 바꾸면 들여쓰기 유지", () => assert.equal(block("[* 가\n  * 나]", "number"), "[1. 가\n  2. 나]"));
t("빈 줄에서 목록 켜기", () => assert.equal(block("가\n|\n나", "bullet"), "가\n* |\n나"));
t("인용 켜기 · 끄기", () => {
  assert.equal(block("말|", "quote"), "> 말|");
  assert.equal(block("> 말|", "quote"), "말|");
});
t("선택 끝이 다음 줄 맨 앞이면 그 줄은 빼고", () => assert.equal(block("[가\n]나", "bullet"), "[* 가]\n나"));

// ── Enter · Tab
t("목록 줄 끝 Enter → 다음 항목", () => assert.equal(enter("* 하나|"), "* 하나\n* |"));
t("- 목록은 - 로 이어짐", () => assert.equal(enter("- 하나|"), "- 하나\n- |"));
t("번호 Enter → +1 · 아래 번호도 밀림", () => assert.equal(enter("1. 가|\n2. 나\n3. 다\n끝"), "1. 가\n2. |\n3. 나\n4. 다\n끝"));
t("항목 가운데 Enter → 뒤 글은 새 항목으로", () => assert.equal(enter("* 가|나"), "* 가\n* |나"));
t("빈 항목 Enter → 목록 끝", () => assert.equal(enter("* 하나\n* |"), "* 하나\n|"));
t("들여쓴 빈 항목 Enter → 한 단 내어씀", () => assert.equal(enter("* 하나\n  * |"), "* 하나\n* |"));
t("인용 Enter → 인용 이어짐 · 빈 인용 Enter → 끝", () => {
  assert.equal(enter("> 말|"), "> 말\n> |");
  assert.equal(enter("> 말\n> |"), "> 말\n|");
});
t("목록 아닌 줄 · 기호 앞 Enter 는 기본 동작", () => {
  assert.equal(enter("그냥 글|"), null);
  assert.equal(enter("|* 하나"), null);
});
t("Tab 들여쓰기 · Shift+Tab 내어쓰기", () => {
  assert.equal(tab("* 하|나"), "  * 하|나");
  assert.equal(tab("  * 하|나", true), "* 하|나");
  assert.equal(tab("그냥|"), null);
  assert.equal(tab("[* 가\n* 나]"), "[  * 가\n  * 나]");
});

// ── 기타
t("구분선 — 빈 줄은 그 자리, 아니면 줄 아래", () => {
  assert.equal(show("가\n\n나", E.insertHr("가\n\n나", 2)), "가\n---\n|\n나");
  assert.equal(show("가나", E.insertHr("가나", 1)), "가나\n---\n|");
});
t("덩어리(이미지 · 표) — 앞뒤 줄 맞춤", () => {
  assert.equal(show("가나", E.insertBlockAt("가나", 1, 1, "![](https://a.png)")), "가\n![](https://a.png)|\n나");
  assert.equal(show("가\n", E.insertBlockAt("가\n", 2, 2, "X")), "가\nX|");
});
t("링크 · 주소 판정", () => {
  assert.equal(show("가", E.linkEdit(0, 1, "가", "https://x.com")), "[가](https://x.com)|");
  assert.equal(E.isUrl(" https://x.com/a?b=1 "), true);
  assert.equal(E.isUrl("x.com"), false);
});

// ── 본문 그리기
const html = (s, o) => R.renderMarkdownHtml(s, o);
t("기존 서식 그대로", () => {
  const h = html("**굵게** __밑줄__ ~~취소~~ ==강조== [링크](https://a.com) {코드}");
  for (const x of ["<strong>굵게</strong>", "class='underline'", "line-through", "text-[#e91e3f] font-bold", "href='https://a.com'", "copy-btn"]) assert.ok(h.includes(x), x);
});
t("목록 — 굵은 점 · 들여쓰기", () => {
  const h = html("* 하나\n  - 둘");
  assert.ok(h.includes("rounded-full bg-[#e91e3f]"), "점");
  assert.ok(h.includes("padding-left:1.4em"), "들여쓰기");
  assert.ok(!h.includes("·"), "옛 가는 점 없음");
});
t("제목 · 작은 글씨 · 인용 · 번호 · 구분선", () => {
  const h = html("# 큰\n## 중\n### 작\n-# 작은 글\n> 인용\n1. 첫째\n---");
  for (const x of ["text-[24px]", "text-[20px]", "text-[16.5px]", "text-[0.86em]", "border-l-[3px]", ">1.</span>", "border-t"]) assert.ok(h.includes(x), x);
});
t("덩어리 뒤에는 줄바꿈을 붙이지 않는다(빈 줄 방지) · 글 줄 사이는 그대로", () => {
  const h = html("가\n# 제목\n나\n다");
  assert.ok(/^가\n<span[^>]*>제목<\/span>나\n다$/.test(h), h);
});
t("빈 줄은 그대로 빈 줄", () => {
  const h = html("# 제목\n\n본문");
  assert.ok(/<\/span>\n본문$/.test(h), h);
});
t("어두운 바탕 제목은 흰 글자", () => assert.ok(html("# 제목", { dark: true }).includes("text-white")));
t("표 칸 머리 * 는 예전처럼 점 글자 · 표 뒤 줄바꿈 그대로", () => {
  const h = html("| * 가 | 나 |\n| --- | --- |\n| 1 | 2 |\n끝");
  assert.ok(h.includes("<th") && h.includes("·"), "칸 점");
  assert.ok(h.endsWith("</table>\n끝"), "표 뒤");
});
t("인용 아님: >_< · 날짜처럼 보이는 4자리 숫자", () => {
  assert.ok(!html(">_<").includes("border-l"), ">_<");
  assert.ok(!html("2026. 10. 11 공지").includes("tabular-nums"), "2026.");
});
t("꺾쇠 · 따옴표는 글자로", () => assert.ok(html("<script>alert('x')</script>").includes("&lt;script&gt;")));
t("제목 안 서식", () => assert.ok(html("# **굵은** 제목").includes("<strong>굵은</strong>")));

// ── 디스코드 공지로 보낼 글(lib/noticeDiscord.js toDiscordText)
t("디스코드 — 제목은 굵게 · 작은 글씨는 글자만 · 인용 · 목록 · 구분선 · 옛 막기", () => {
  const src = ["# 큰 제목", "## **중간**", "-# 작은 글", "> 인용", "* 점", "  - 들여쓴 점", "1. 번호", "---", ">_<", "==강조== {코드}"].join("\n");
  const want = ["**큰 제목**", "**중간**", "작은 글", "> 인용", "• 점", "  • 들여쓴 점", "1. 번호", "──────────", "\\>_<", "**강조** `코드`"].join("\n");
  assert.equal(D.toDiscordText(src).text, want);
});

console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
