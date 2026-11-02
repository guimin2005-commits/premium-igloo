// 📌 유물 멈춘 그림(data URL) — 인벤토리 칸 · 꾸미기 창 고르기 칸. 화면에서만 부른다(캔버스)
//   relicCardThumb: 미리보기 카드 한 장(글자 없음, 사진 자리 「닉」 대신 빈 원) · relicPieceThumb: 그 조각만 잘라(시안 relicui.mjs 와 같은 자리)
import { relicLayers, setGeo, normPick, PREVIEW_GEO } from "./index";
import { drawFrag } from "./draw";

const cache = new Map();
const keyOf = (...a) => JSON.stringify(a);
function render(pick, only, scale) {
  setGeo(PREVIEW_GEO);
  const p = normPick(pick), L = relicLayers(p.core, 0.3, 19, { ...p, pct: 0.49, only, link: false });
  const cv = document.createElement("canvas");
  cv.width = Math.round(360 * scale);
  cv.height = Math.round(556 * scale);
  const ctx = cv.getContext("2d");
  if (L.under) drawFrag(ctx, L.under, L.cells, scale);
  if (L.over) {
    const ov = document.createElement("canvas");
    ov.width = cv.width; ov.height = cv.height;
    drawFrag(ov.getContext("2d"), L.over, L.cells, scale);
    ctx.drawImage(ov, 0, 0);
  }
  return cv;
}
const CROP = { frame: [0, 0, 152, 152], border: [190, 0, 170, 170], bg: [0, 0, 250, 250], bar: [118, 287, 104, 104] };
export function relicPieceThumb(pick, piece, out = 160) {
  const k = keyOf("p", normPick(pick), piece, out);
  if (cache.has(k)) return cache.get(k);
  const cv = render(pick, piece, 2), [x, y, w, h] = CROP[piece];
  const o = document.createElement("canvas");
  o.width = out; o.height = out;
  const ctx = o.getContext("2d");
  if (piece === "border") { ctx.fillStyle = "#121216"; ctx.fillRect(0, 0, out, out); }
  if (piece === "frame") { ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.beginPath(); ctx.arc(((76 - x) / w) * out, ((76 - y) / h) * out, (34 / w) * out, 0, Math.PI * 2); ctx.fill(); }
  ctx.imageSmoothingEnabled = piece === "bg";
  ctx.drawImage(cv, x * 2, y * 2, w * 2, h * 2, 0, 0, out, out);
  const url = o.toDataURL("image/png");
  cache.set(k, url);
  return url;
}
export function relicCardThumb(pick, width = 120) {
  const k = keyOf("c", normPick(pick), width);
  if (cache.has(k)) return cache.get(k);
  const cv = render(pick, null, 1);
  const o = document.createElement("canvas");
  o.width = width * 2; o.height = Math.round((556 * width * 2) / 360);
  const ctx = o.getContext("2d");
  ctx.drawImage(cv, 0, 0, o.width, o.height);
  const url = o.toDataURL("image/png");
  cache.set(k, url);
  return url;
}
