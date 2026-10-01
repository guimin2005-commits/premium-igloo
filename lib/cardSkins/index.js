// 📌 시즌 2 「A New World」 카드 스킨(2026-10) — SVG 문자열을 만드는 순수 함수 묶음.
//    deco(w, h, S, site) → { defs, under, over } — S: 크기 배율(사이트 프로필 카드 1 · 봇 카드 2.2), site: 사이트면 true(아바타 자리를 피한다)
//    사이트 app/components/SkinFrame.js 와 카드 그리기(lib/botCards.js · bot/src/botCards.js 의 SKIN_DECO)가 같이 쓴다.
//    ⚠️ 봇은 따로 배포라 bot/src/cardSkins/ 에 같은 파일 사본이 있다 — 여기를 고치면 거기도 똑같이.
//    등급 색과 헷갈리지 않게 카드를 칠하거나 번지게 하지 않는다 — 도트 칸 · 가는 선만(기존 스킨과 같은 기준)
import * as newworld from "./newworld.js";
import * as chart from "./chart.js";
import * as airship from "./airship.js";

export const STRING_SKINS = { newworld, chart, airship };
