// 📌 꾸미기 이름 머리말 나누기 — 프리셋 이름 "카드 스킨 · 새로운 세계" · "배지 · 섬" · "테두리 · X" 를
//    분류(작게 보일 글자) + 짧은 이름으로 나눈다. 2026-10-11 운영자 "인벤토리처럼 카테고리는 작게" · "ARCTIC 도 카드 스킨 ㅇㅈㄹ 다 새로".
//    인벤토리(app/components/Inventory.js invShortName · invKindOf)와 같은 규칙 — 머리말을 떼고 남는 글자가 없으면 원래 이름 그대로.
//    서버 · 클라이언트 둘 다 쓴다(React 없음)
//    📌 2026-10-15 「카드 스킨」은 묶음 이름 — 카드 배경 · 카드 테두리. 실DB 이름 「카드 스킨 · X」는 나중에 「카드 테두리 · X」로 바꾼다(운영자) —
//       그때까지 둘 다 카드 테두리로 읽는다. 「아바타 테두리」는 「프로필 테두리」로 부른다(옛 이름 · 맨 「테두리 · 」도 프로필 테두리)
//    📌 2026-10-17 분류는 따로 저장한다(models/Item.js · ShopItem.js category — 규칙 lib/itemCategory.js resolveCategory). 머리말은 옛 데이터 읽기용으로만 남는다 —
//       화면 분류는 API 의 categoryLabel · 이름은 shortName 을 쓴다(이 함수는 옛 호출 · 옛 이름 읽기 · 옮기기 스크립트가 쓴다)
export const ITEM_NAME_HEAD_RE = /^(카드\s*배경|카드\s*테두리|카드\s*스킨|프로필\s*테두리|아바타\s*테두리|프로필\s*배지|배지|테두리)\s*·\s*/;
const HEAD_KIND = {
  카드배경: "카드 배경", 카드테두리: "카드 테두리", 카드스킨: "카드 테두리",
  프로필테두리: "프로필 테두리", 아바타테두리: "프로필 테두리", 테두리: "프로필 테두리",
  프로필배지: "프로필 배지", 배지: "프로필 배지",
};

// { kind: "카드 배경" | "카드 테두리" | "프로필 테두리" | "프로필 배지" | "", short: 머리말 뗀 이름 }
export const splitItemName = (name) => {
  const n = String(name || "");
  const m = ITEM_NAME_HEAD_RE.exec(n);
  if (!m) return { kind: "", short: n };
  const short = n.slice(m[0].length).trim();
  return short ? { kind: HEAD_KIND[m[1].replace(/\s+/g, "")] || "", short } : { kind: "", short: n };
};
