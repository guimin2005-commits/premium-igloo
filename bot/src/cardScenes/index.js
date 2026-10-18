// 📌 카드 배경(2026-10-15 — 「카드 스킨」 = 카드 배경 + 카드 테두리). 카드 바탕 장면 전체를 바꾼다 — 카드 테두리(lib/cardSkins)는 그 위에 얹는다.
//    meta: { key, label, src(사이트 그림 — public/), w · h(그림 원래 크기 px), bg(그림 밖 바탕색), foot?(그림 맨 아래 줄 색 — 사이트 카드가 그림보다 길 때 아래를 잇는 색),
//            glow(등급 빛 세기 배율), bar(레벨 막대 모양 — "ghostTrail" | ""), clear?(봇 가로 카드 — 구석 글이 있는 카드에서 위에서 건너뛸 칸) }
//    그림 원본: scripts/gen-halloween-banner.mjs BANNER=ghostcard(.claude/mockups/ghost-event/cos/card-bg.png → public/card-scenes/sc_ghost.png)
//    ⚠️ 이 폴더는 lib/cardScenes/ 와 bot/src/cardScenes/ 에 같은 파일이 있다(봇은 따로 배포) — 한쪽을 고치면 다른 쪽도 글자 하나까지 똑같이.
//    이 파일 · <키>.js 는 화면도 import 한다 — 그림 데이터는 넣지 않는다. 봇 · 서버 이미지 카드 그림은 art.js(<키>.data.js — scripts/gen-card-scenes.mjs 가 만든다)
import * as sc_ghost from "./sc_ghost.js";

export const STRING_SCENES = { sc_ghost };
export const sceneMetaOf = (key) => (Object.prototype.hasOwnProperty.call(STRING_SCENES, key) ? STRING_SCENES[key].meta : null);
