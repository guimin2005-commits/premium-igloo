// 📌 카드 배경 「바람의 클로버 언덕」(sc_clover) — 친구 초대 「네잎클로버 덩굴」 한 벌 · 신화(2026-10-25). 해 진 뒤 바람 부는 클로버 언덕 도트 장면(칸 3px, 360 × 558).
//    움직이는 배경(사이트만): 평소엔 바람 리본 · 잠든 수정 · 잎이 흐르고, 17초마다 바람이 클로버 잎을 모아 마법진을 그려 금빛 네잎을 완성했다가 흩어진다.
//    anim: 사이트 겹(app/components/SceneBack) — base(바탕) → clouds(구름 띠 · CSS 로 오른쪽으로 끝없이 흐름, cloudSec 초에 한 바퀴 · 120칸) → live(움직이는 겹 · 무한 반복 webp).
//          움직임 줄이기는 멈춘 그림 src(평소 장면 — 마법진 없음). 그림은 scripts/gen-clover-scene.mjs 가 만든다
//    레벨 막대는 「덩굴 줄기」(cloverVine — 짙은 홈 안에서 자라는 줄기 · 위아래 번갈아 잎 · 끝에 세잎 봉오리)
//    봇 · 서버 가로 카드 그림은 하늘 · 구름 · 언덕만(바람 리본 · 수정 · 잎 · 별은 가로 카드 글 줄에 걸려 뺀 봇 벌 — scripts/gen-card-scenes.mjs)
//    clear: 60 — 구석 글이 있는 봇 카드(/레벨 · /랭크 · /출석체크 · /퀘스트 · /인벤토리 · /시즌패스)는 위 60칸을 건너뛰어 노을 띠 · 언덕 지평선이 아래에 걸리게(가운데 정렬 레벨업 · 역할 지급은 0칸부터)
export const meta = {
  key: "sc_clover",
  label: "바람의 클로버 언덕",
  src: "/card-scenes/sc_clover.png",
  w: 360,
  h: 558,
  bg: "#0e142d",
  foot: "#0d1b1e",
  glow: 0.6,
  bar: "cloverVine",
  clear: 60,
  anim: { base: "/card-scenes/sc_clover-base.png", clouds: "/card-scenes/sc_clover-clouds.png", live: "/card-scenes/sc_clover-live.webp", cloudSec: 86.4 },
};
