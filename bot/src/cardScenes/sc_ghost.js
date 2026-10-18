// 📌 카드 배경 「유령 펭귄의 밤」(sc_ghost) — 「유령 펭귄의 초대」 이벤트(2026-10). 오로라 · 달 · 별 · 도깨비불 · 숲 · 안개 · 눈밭 도트 장면(칸 3px, 360 × 558).
//    글 자리(이름 · LEVEL · 등급 · 막대 · 스탯)엔 별 · 눈송이가 없다. 레벨 막대는 「유령 꼬리」(ghostTrail — 짙은 테 상자 · 왼쪽 랜턴 · 꼬리 빛)
//    clear: 봇 가로 카드에서 오른쪽 위 구석(달 · 오로라)을 비울 때 위에서 건너뛸 칸 — /레벨 LEVEL 숫자 · /퀘스트 받을 보상 등 구석 글이 달 위에 얹히지 않게(가운데 정렬 레벨업 · 역할 지급은 건너뛰지 않는다)
//    foot: 그림 맨 아래 줄 색(눈밭) — 사이트 카드가 그림보다 길면 그림 아래를 이 색으로 카드 끝까지 잇는다(app/components/SceneBack)
export const meta = { key: "sc_ghost", label: "유령 펭귄의 밤", src: "/card-scenes/sc_ghost.png", w: 360, h: 558, bg: "#160f2e", foot: "#4a5590", glow: 0.6, bar: "ghostTrail", clear: 34 };
