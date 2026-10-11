// 📌 재화 도트 아이콘 — 빙옥 = 투명 구슬(2026-10-03 운영자가 고른 「A 투명 구슬」(.claude/mockups/currency6.html)을
//    2026-10-11 「유리 구슬」과 합친 판 — 밝게 빛나는 속 + 오른쪽 아래로 짙어지는 파란 테 · 또렷한 흰 반짝임 · 아래 안쪽 비치는 빛. 시안 .claude/mockups/빙옥-투명구슬+유리구슬.png 「합침 A」).
//    XP 는 lib/itemArt 의 "xp-bolt"(번개 도트)를 그대로 쓴다(XP 결정 그림은 운영자가 접음).
//    rows 의 글자 = pal 의 키, "." = 빈 칸(16 × 16, 실루엣 좌우 대칭 · 1칸 짙은 테 · 왼쪽 위 빛). 그리는 곳: app/level/page.js 시즌 패스 보상 칸(crispEdges · 정수 배율)
export const CURRENCY_PIXEL = {
  point: {
    pal: { o: "#142046", D: "#1f5aa8", M: "#3a9fe2", L: "#8fd9f6", H: "#d8f6ff", w: "#ffffff" },
    rows: [
      "................",
      ".....oooooo.....",
      "...ooLLLLLMoo...",
      "..oLHwwHHHLLMo..",
      ".oLHwwwHHHHHLMo.",
      ".oLHwwHHHHHHLMo.",
      "oLHHwHHHHHHHHLMo",
      "oLHHHHHHHHHHHLMo",
      "oLHHHHHHHHHHLLMo",
      "oMLHHHHHHHHLLMDo",
      ".oMLHHHHHHLLMDo.",
      ".oMLLHHHHLLHMDo.",
      "..oDMLLLLLHMDo..",
      "...ooDDMMMDoo...",
      ".....oooooo.....",
      "................",
    ],
  },
};
