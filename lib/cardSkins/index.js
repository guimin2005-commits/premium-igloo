// 📌 시즌 2 「A New World」 카드 스킨(2026-10) — SVG 문자열을 만드는 순수 함수 묶음.
//    deco(w, h, S, site) → { defs, under, over } — S: 크기 배율(사이트 프로필 카드 1 · 봇 카드 2.2), site: 사이트면 true(아바타 자리를 피한다)
//    사이트 app/components/SkinFrame.js 와 카드 그리기(lib/botCards.js · bot/src/botCards.js 의 SKIN_DECO)가 같이 쓴다.
//    ⚠️ 봇은 따로 배포라 bot/src/cardSkins/ 에 같은 파일 사본이 있다 — 여기를 고치면 거기도 똑같이.
//    등급 색과 헷갈리지 않게 카드를 칠하거나 번지게 하지 않는다 — 도트 칸 · 가는 선만(기존 스킨과 같은 기준)
import * as newworld from "./newworld.js";
import * as chart from "./chart.js";
import * as airship from "./airship.js";
import * as crimson from "./crimson.js";
import * as ice from "./ice.js";
// 📌 등급 카드 스킨 「랭크 깃발」 9종(키 rank_<등급>) — 시즌 티어 보상(UserXp.seasonFrame 등급) · 관리자 등록 아이템. 그림은 rank.js
import { RANK_SKINS, RANK_SKIN_KEYS } from "./rank.js";
// 📌 할로윈 시즌 카드 스킨 6종(2026-10 — 10/10 운영자 "카드 테두리는 진짜 다 예쁜데" 합격본) — 호박 밭 · 유령 파티 · 마녀의 밤 · 사탕 가게 · 달빛 묘지 · 검은 고양이
import * as hw_pumpkin from "./hw_pumpkin.js";
import * as hw_ghost from "./hw_ghost.js";
import * as hw_witch from "./hw_witch.js";
import * as hw_candy from "./hw_candy.js";
import * as hw_grave from "./hw_grave.js";
import * as hw_blackcat from "./hw_blackcat.js";
// 바닥 띠 그림이 레벨 페이지 카드 '1회 획득' 줄을 덮지 않게 — 카드가 아래에 더 비워 줄 높이(hwFloor.js floorRoom)
export { floorRoom } from "./hwFloor.js";

export { RANK_SKIN_KEYS };

export const STRING_SKINS = { newworld, chart, airship, crimson, ice, ...RANK_SKINS, hw_pumpkin, hw_ghost, hw_witch, hw_candy, hw_grave, hw_blackcat };
