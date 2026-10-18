// 📌 글 속 아이템 태그(2026-10-18 운영자 "공지 글에서도 업데이트 좀 더 편리하게 작성할 수 있게 아이템? 태그? 느낌으로") — 화면 · 서버 공용(React · DB 없음)
//    본문 글자 [[item:<아이템 id>:<넣을 때 이름>]] — 글쓰기 편집기 「아이템」 단추가 넣는다(app/write/ItemTagDialog).
//    그리는 쪽(app/components/mdRender · FormattedText)이 글을 열 때 지금 아이템 값(GET /api/items/tags)으로 그린다 — 이름 · 아이콘 · 가격이 바뀌어도 따라간다.
//      · 문장 안 → 작은 알약(아이콘 · 이름 · 희귀도 색 테) · 태그만 있는 줄 → 큰 카드(아이콘 · 희귀도 · 분류 · 이름 · 효과 한 줄 · 가격)
//      · 판매 중인 상품이 있으면 누르면 상품 상세, 없으면 누를 수 없다 · 지워진 아이템은 태그의 이름만 회색 글자
//    이름 칸은 편집 칸에서 읽기 좋게 + 지워진 아이템일 때만 쓴다. 디스코드 공지(lib/noticeDiscord) · 알림 미리 보기는 이 이름을 굵게 · 글자로
export const ITEM_TAG_NAME_MAX = 40;
export const ITEM_TAG_MAX = 40; // 글 하나에서 읽어 그릴 아이템 수(넘는 태그는 이름 글자만)
// [[item:<24자 hex>:<이름>]] — 이름은 ] | 줄바꿈 없이 60자까지(없어도 된다). 구분은 「:」 — 「|」면 표 칸에서 쪼개졌다(표는 | 로 칸을 나눈다)
const TAG_SRC = "\\[\\[item:([0-9a-f]{24})(?::([^\\]\\n|]{0,60}))?\\]\\]";
export const itemTagRe = () => new RegExp(TAG_SRC, "g");
const SOLO_RE = new RegExp(`^\\s*${TAG_SRC}\\s*$`);

// 넣을 이름 정리 — ] [ | 줄바꿈은 빈칸으로, 40자까지
export const cleanItemTagName = (n) =>
  String(n ?? "").replace(/[[\]|\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, ITEM_TAG_NAME_MAX);
// 태그 글자 하나
export const itemTagOf = (id, name) => `[[item:${String(id)}:${cleanItemTagName(name)}]]`;
// 본문의 태그 아이템 id(나온 차례 · 중복 없이 · ITEM_TAG_MAX 까지)
export function itemTagIdsOf(text) {
  const out = [];
  for (const m of String(text || "").matchAll(itemTagRe())) {
    if (!out.includes(m[1])) out.push(m[1]);
    if (out.length >= ITEM_TAG_MAX) break;
  }
  return out;
}
// 태그만 있는 줄이면 { id, name } — 큰 카드로 그린다
export function soloItemTagOf(line) {
  const m = SOLO_RE.exec(String(line ?? ""));
  return m ? { id: m[1], name: m[2] || "" } : null;
}
// 태그 → 이름 글자(굵게 등은 부르는 쪽이 씌운다). 이름이 없으면 「아이템」
export const replaceItemTags = (text, wrap = (name) => name) =>
  String(text ?? "").replace(itemTagRe(), (_m, _id, name) => wrap(String(name || "").trim() || "아이템"));
