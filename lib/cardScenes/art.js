// 📌 카드 배경 그림 — 봇 · 서버 이미지 카드용. 사이트 화면은 쓰지 않는다(app/components/SceneBack — public/ 그림)
//    ⚠️ <키>.data.js(그림 base64)를 끌어온다 — 화면 코드 · lib/botCards.js 에서 import 하지 말 것(화면 묶음에 그림이 실린다).
//       봇 renderCard(bot/src/botCards.js 머리) · 서버 카드 경로(app/api/shop/skin-card)가 buildCard(kind, data, h, { scene: sceneLayer }) 로 넣는다.
//    bot/src/cardScenes/art.js 는 같은 파일
//    자리: 카드 폭 · 높이를 덮게(cover) 키우고 가로 가운데 · 위에 맞춘다(사이트 카드와 같은 기준 — 폭에 맞춰 위에서부터). 그림 밖은 meta.bg
//    sceneLayer(key, w, h, { clear }) → { src, x, y, width, height } — satori <img> 한 장(카드 맨 아래 겹). 폭 1200 카드면 그림 그대로(1:1 — satori 는 image-rendering 을
//       넘기지 않아 늘리면 흐려지므로 그림을 카드 폭으로 담았다 — scripts/gen-card-scenes.mjs)
//       clear: true 면 위에서 meta.clear 칸을 건너뛴다(카드 아래가 그림 밖으로 나가지 않는 만큼만) — 오른쪽 위 구석에 글이 있는 봇 카드(botCards frame)
//       그림은 봇 가로 카드 글 자리의 별 · 반짝이 · 도깨비불을 지운 벌 — clear 면 pngClear, 아니면 pngTop(scripts/gen-card-scenes.mjs bot 네모). 없으면 원래 그림 png
//    sceneSvg(key, w, h) → { defs, back } — SVG 문서 맨 위 겹에 바로 넣을 조각(확인 그림 · 따로 그릴 때 — 원래 그림 png. resvg 는 image-rendering="optimizeSpeed" 를 가장 가까운 칸으로 그린다).
//       ⚠️ 다른 SVG 를 <img> 로 넣은 그림 안의 PNG 는 resvg 가 읽지 않는다 — 카드 바탕 SVG(botCards bgSvg) 안에 넣지 말 것. SVG id 는 sc-<키>-
import { STRING_SCENES } from "./index.js";
import * as sc_ghost from "./sc_ghost.data.js";
import * as sc_clover from "./sc_clover.data.js";

const DATA = { sc_ghost, sc_clover };

const r2 = (n) => Math.round(n * 100) / 100;
function fit(art, w, h, skip = 0) {
  const W0 = art.cw * art.cell, H0 = art.ch * art.cell; // 사이트 그림 크기(px)
  const s = Math.max(w / W0, h / H0);
  const width = r2(W0 * s), height = r2(H0 * s);
  const y = -Math.min(Math.max(0, height - h), Math.round(Math.max(0, skip) * art.cell * s));
  return { x: r2((w - width) / 2), y, width, height };
}
const has = (k) => Object.prototype.hasOwnProperty.call(DATA, k) && Object.prototype.hasOwnProperty.call(STRING_SCENES, k);

// 키 → { meta, scene(w, h) → { defs, back }, layer(w, h) → { src, x, y, width, height } } — 그림 데이터가 있는 배경만
export const SCENE_ART = Object.fromEntries(
  Object.keys(STRING_SCENES).filter(has).map((k) => {
    const meta = STRING_SCENES[k].meta, art = DATA[k];
    const layer = (w, h, o = {}) => ({ src: (o.clear ? art.pngClear : art.pngTop) || art.png, ...fit(art, w, h, o.clear ? meta.clear || 0 : 0) });
    const scene = (w, h) => {
      const f = fit(art, w, h), id = `sc-${k}-cl`;
      return {
        defs: `<clipPath id="${id}"><rect width="${w}" height="${h}"/></clipPath>`,
        back:
          `<rect width="${w}" height="${h}" fill="${meta.bg}"/>` +
          `<g clip-path="url(#${id})"><image href="${art.png}" x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" preserveAspectRatio="none" image-rendering="optimizeSpeed"/></g>`,
      };
    };
    return [k, { meta, scene, layer }];
  })
);
export const sceneLayer = (key, w, h, o = {}) => (has(key) ? SCENE_ART[key].layer(w, h, o) : null);
export const sceneSvg = (key, w, h) => (has(key) ? SCENE_ART[key].scene(w, h) : null);
