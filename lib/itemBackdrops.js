// 📌 상품 카드 배경(도트 장면 64×64) — public/backdrops/<key>.png. 관리자가 상품마다 고른다(ShopItem.backdrop, "" 이면 기본 바탕).
//    그림 원본은 작업 폴더의 장면 코드에서 뽑았다(2026-09-30 — "아이콘만 달랑 있어 없어 보인다" → "여러 개 제작").
//    화면은 image-rendering: pixelated 로 키운다(도트가 번지지 않게). 키를 바꾸면 저장된 상품의 배경이 사라지니 키는 고정.
export const BACKDROP_GROUPS = [
  { g: "arctic", label: "북극" },
  { g: "game", label: "게임" },
  { g: "season", label: "계절" },
  { g: "city", label: "도시 · 실내" },
  { g: "fantasy", label: "판타지" },
  { g: "special", label: "특별" },
];
export const BACKDROPS = [
  {
    key: "snowfield",
    label: "맑은 설원",
    group: "arctic"
  },
  {
    key: "igloo-village",
    label: "이글루 마을",
    group: "arctic"
  },
  {
    key: "pine-forest",
    label: "눈 내리는 숲",
    group: "arctic"
  },
  {
    key: "aurora-night",
    label: "오로라 밤",
    group: "arctic"
  },
  {
    key: "moon-ice",
    label: "달밤 호수",
    group: "arctic"
  },
  {
    key: "sunset-berg",
    label: "노을 빙산",
    group: "arctic"
  },
  {
    key: "ice-cave",
    label: "얼음 동굴",
    group: "arctic"
  },
  {
    key: "ocean-berg",
    label: "빙산 바다",
    group: "arctic"
  },
  {
    key: "crystal-altar",
    label: "크리스탈 제단",
    group: "arctic"
  },
  {
    key: "cozy-shop",
    label: "아늑한 상점",
    group: "game"
  },
  {
    key: "festival",
    label: "축제 밤",
    group: "game"
  },
  {
    key: "premium-gold",
    label: "빙옥 프리미엄",
    group: "game"
  },
  {
    key: "cherry-park",
    label: "벚꽃 공원",
    group: "season"
  },
  {
    key: "summer-beach",
    label: "여름 해변",
    group: "season"
  },
  {
    key: "autumn-forest",
    label: "가을 단풍 숲",
    group: "season"
  },
  {
    key: "neon-city",
    label: "네온 도시",
    group: "city"
  },
  {
    key: "cozy-cafe",
    label: "카페 창가",
    group: "city"
  },
  {
    key: "arcade",
    label: "오락실",
    group: "city"
  },
  {
    key: "castle-field",
    label: "성과 초원",
    group: "fantasy"
  },
  {
    key: "treasure-dungeon",
    label: "던전 보물방",
    group: "fantasy"
  },
  {
    key: "sky-island",
    label: "하늘섬",
    group: "fantasy"
  },
  {
    key: "outer-space",
    label: "우주",
    group: "special"
  },
  {
    key: "under-sea",
    label: "바닷속",
    group: "special"
  },
  {
    key: "concert-stage",
    label: "콘서트 무대",
    group: "special"
  }
];
export const BACKDROP_OF = Object.fromEntries(BACKDROPS.map((b) => [b.key, b]));
export const isBackdropKey = (k) => Object.prototype.hasOwnProperty.call(BACKDROP_OF, String(k || ""));
export const backdropSrc = (k) => (isBackdropKey(k) ? `/backdrops/${k}.png` : "");
