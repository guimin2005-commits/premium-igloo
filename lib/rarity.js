// 📌 아이템 희귀도 — 일곱 등급(2026-10-17 운영자 "일반 고급 희귀 영웅 전설 신화로 ㄱㄱ" · "최고급 등급 유물도 넣고" · "우수는 걍 빼라").
//    Item.rarity 에 키를 저장한다("" = 아직 안 고름 → 일반으로 본다). 관리자 아이템 등록에서 고른다.
//    보이는 곳: 인벤토리 칸 · 상세 등급 알약 · 정렬 「희귀도순」 · 상품 상세 알약 · 봇 /인벤토리 카드 칸. 상점 카드에는 넣지 않는다(운영자 "템 클릭하면 그 안에서만").
//    칸 모양은 등급마다 이 표의 값으로만 그린다 — 이름 · 색 · 단계를 바꿀 때 여기 한 곳만 고친다.
//      c     등급 색(칸 아래 띠 · 알약 · 이름표) — 단색만(무지개 · 반짝이는 운영자 반려 "무지개는 뭐냐? 장난함?" · "반짝이 표시는 도대체 뭐야")
//      glow  칸 안쪽 아래에서 오르는 빛의 진하기(0 = 없음)
//      edge  칸 테를 등급 색으로(영웅부터)
export const RARITIES = [
  { v: "common", l: "일반", c: "#9aa3b2", glow: 0, edge: false },
  { v: "uncommon", l: "고급", c: "#3ccf6a", glow: 0, edge: false },
  { v: "rare", l: "희귀", c: "#45b4ff", glow: 0.18, edge: false },
  { v: "epic", l: "영웅", c: "#a35cff", glow: 0.28, edge: true },
  { v: "legendary", l: "전설", c: "#ffb020", glow: 0.36, edge: true },
  { v: "mythic", l: "신화", c: "#e0409a", glow: 0.42, edge: true }, // 진분홍 — 빨강(#ff3b5c)은 봇 카드 「착용」 빨간 테와 헷갈려 바꿈(10/17 운영자 "진분홍")
  { v: "relic", l: "유물", c: "#3fe0d0", glow: 0.46, edge: true },
];
export const RARITY_KEYS = RARITIES.map((r) => r.v);
const BY = Object.fromEntries(RARITIES.map((r, i) => [r.v, { ...r, rank: i }]));

// 저장 값 정리 — 모르는 값 · 빈 값은 ""(일반으로 본다)
export const normalizeRarity = (v) => (RARITY_KEYS.includes(String(v ?? "").trim()) ? String(v).trim() : "");
// 보이는 등급 — { v, l, c, glow, edge, rank } (안 고른 것은 일반)
export const rarityOf = (v) => BY[v] || BY.common;
// 등급 순서(0 = 일반 … 6 = 유물)
export const rarityRank = (v) => rarityOf(v).rank;
