// 📌 글 속 아이템 태그(lib/itemTag · app/components/mdRender · lib/noticeDiscord) 시험 — DB 없이 순수 함수만.
//    사용 (저장소 루트에서): node scripts/test-item-tag.mjs   (Node 24 — .ts 를 그대로 읽는다)
import { registerHooks } from "node:module";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) spec = pathToFileURL(path.join(ROOT, spec.slice(2))).href + (path.extname(spec) ? "" : ".js");
    try { return next(spec, ctx); } catch (e) {
      if (e?.code !== "ERR_MODULE_NOT_FOUND" || !spec.startsWith(".")) throw e;
      return next(spec + ".ts", ctx);
    }
  },
});
const T = await import("../lib/itemTag.js");
const R = await import("../app/components/mdRender.ts");
const D = await import("../lib/noticeDiscord.js");

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log(`  FAIL ${name}\n       ${String(e?.message || e).split("\n").slice(0, 8).join("\n       ")}`); } };
const A = "6abdc0838fb054deb0c0773a", B = "6aba66fa9e777ba458ae5524";

t("태그 글자 · 이름 정리", () => {
  assert.equal(T.itemTagOf(A, "마녀의 밤"), `[[item:${A}:마녀의 밤]]`);
  assert.equal(T.itemTagOf(A, " a]b|c\n d "), `[[item:${A}:a b c d]]`);
  assert.equal(T.cleanItemTagName("가".repeat(50)).length, T.ITEM_TAG_NAME_MAX);
});
t("본문의 태그 id — 차례 · 중복 없이", () => {
  assert.deepEqual(T.itemTagIdsOf(`x [[item:${B}:b]] y [[item:${A}:a]] [[item:${B}:b2]] [[item:zz|no]]`), [B, A]);
  assert.deepEqual(T.itemTagIdsOf("태그 없음"), []);
});
t("태그만 있는 줄", () => {
  assert.deepEqual(T.soloItemTagOf(`  [[item:${A}:마녀의 밤]] `), { id: A, name: "마녀의 밤" });
  assert.deepEqual(T.soloItemTagOf(`[[item:${A}]]`), { id: A, name: "" });
  assert.equal(T.soloItemTagOf(`새 [[item:${A}:x]]`), null);
  assert.equal(T.soloItemTagOf(`- [[item:${A}:x]]`), null);
});
t("태그 → 이름(디스코드 · 미리 보기 글자)", () => {
  assert.equal(T.replaceItemTags(`새 [[item:${A}:마녀의 밤]] 들어옴`), "새 마녀의 밤 들어옴");
  assert.equal(T.replaceItemTags(`[[item:${A}]]`, (n) => `**${n}**`), "**아이템**");
});

t("그리기 — 문장 안 알약 자리", () => {
  const h = R.renderMarkdownHtml(`새 [[item:${A}:마녀의 밤]] 이 들어왔어요`);
  assert.match(h, new RegExp(`<span class='itag' data-itag='${A}' data-iname='마녀의 밤'><span class='font-bold'>마녀의 밤</span></span>`));
  assert.ok(!h.includes("data-solo"));
  assert.ok(h.startsWith("새 <span"));
});
t("그리기 — 태그만 있는 줄은 카드 자리(한 줄 덩어리 · 뒤 줄바꿈 없음)", () => {
  const h = R.renderMarkdownHtml(`위\n[[item:${A}:유령 펭귄의 초대]]\n아래`);
  assert.ok(h.includes(`<span class='itag block my-3' data-itag='${A}' data-iname='유령 펭귄의 초대' data-solo='1'>`));
  assert.ok(h.includes("</span></span>아래"), h);
});
t("그리기 — 이름 안 서식 기호 · 꺾쇠는 글자 그대로", () => {
  const h = R.renderMarkdownHtml(`[[item:${A}:**굵게** <b>&]] 끝`);
  assert.ok(h.includes("data-iname='**굵게** &lt;b&gt;&amp;'"), h);
  assert.ok(!h.includes("<strong>"), h);
});
t("그리기 — 다른 서식과 같이(굵게 · 링크 · 표 칸 · 목록)", () => {
  const h = R.renderMarkdownHtml(`**새 상품** [[item:${A}:a]] [사이트](https://example.com)`);
  assert.ok(h.includes("<strong>새 상품</strong>") && h.includes("data-itag") && h.includes("href='https://example.com'"), h);
  const tb = R.renderMarkdownHtml(`| 이름 | 값 |\n| --- | --- |\n| [[item:${A}:a]] | 1 |`);
  assert.ok(tb.includes(`data-itag='${A}'`) && tb.includes("<td"), tb);
  const li = R.renderMarkdownHtml(`- [[item:${A}:a]]`);
  assert.ok(li.includes(`data-itag='${A}'`) && !li.includes("data-solo"), li);
});
t("그리기 — 잘못된 태그는 글자 그대로", () => {
  const h = R.renderMarkdownHtml("[[item:abc:x]]");
  assert.ok(!h.includes("itag"), h);
});
t("디스코드 공지 — 태그는 굵은 이름", () => {
  const { text } = D.toDiscordText(`## 새 상품\n[[item:${A}:마녀의 밤]] 출시\n[[item:${B}:**별**]]`);
  assert.equal(text, "**새 상품**\n**마녀의 밤** 출시\n**별**");
});

console.log(`\n${fail ? "❌" : "✅"} ${pass} 통과 · ${fail} 실패`);
if (fail) process.exit(1);
