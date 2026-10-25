// 📌 카드 배경(lib/cardScenes) 봇 · 서버용 그림 모듈 생성 — 장면 PNG 를 칸 하나 = BOT_PX px(봇 카드 폭 1200 = 120칸 × 10px)로 다시 찍어 base64 data URI 로 담는다.
//    ⚠️ 봇 · 서버 카드는 resvg 가 그리는데, satori <img> 는 image-rendering 을 넘기지 않아 늘리면 흐려진다 → 카드 폭 그대로(1:1)인 그림을 담는다.
//       (카드 SVG 안에 넣은 그림 SVG 속 PNG 는 resvg 가 아예 읽지 않는다 — 그래서 배경은 카드 바탕 SVG 와 따로 맨 아래 <img> 한 장)
//    실행: node scripts/gen-card-scenes.mjs   (그림을 고치면 다시 돌린다)
//    만드는 것: lib/cardScenes/<키>.data.js · bot/src/cardScenes/<키>.data.js(같은 파일 — 봇은 사이트 public/ 을 못 읽는다)
//    ⚠️ <키>.data.js 는 봇 · 서버 이미지 카드(lib/cardScenes/art.js → 봇 renderCard · app/api/shop/skin-card)만 읽는다(lib/botCards.js 는 import 하지 않는다). 화면이 import 하는 <키>.js · index.js 에는 그림을 넣지 않는다.
//    사이트 화면은 public/card-scenes/<키>.png(원래 크기 그림 — app/components/SceneBack) — 같은 칸인지 여기서 맞춰 본다(다르면 알린다)
//    📌 봇 가로 카드 두 벌(2026-10-15) — 장면은 사이트 세로 카드 글 자리에 맞춰 별 · 도깨비불을 비워 둔 그림이라 가로 카드 글 자리와 맞지 않는다.
//       pngTop(레벨업 · 역할 지급 — 위 0칸부터) · pngClear(나머지 — 위 meta.clear 칸부터) 각각 봇 카드 글 자리(bot 네모)에 걸친 별 · 반짝이 · 도깨비불을 그 줄 하늘색으로 지운다.
//       png 는 원래 그림 그대로(sceneSvg — 확인 그림)
import { createRequire } from "module";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(join(ROOT, "package.json"))("sharp");

// key: 배경 키(lib/cardScenes) · src: 원본 그림(칸 cell px 도트) · site: 사이트 그림(맞춰 보기만)
// bot: 봇 가로 카드(폭 1200) 글 자리 네모 [x0, y0, x1, y1](카드 px — 카드 위 끝부터) — top: 레벨업 · 역할 지급(LEVEL UP · Lv 줄 · 막대) · clear: 나머지(머리 · 본문 전부).
//   네모 밖(양옆 30px · 카드 위 끝 줄 · 오른쪽 위 구석 큰 반짝이 · 레벨업 사진 둘레)은 그림 그대로. 지우는 줄은 하늘(단색 · 체크 무늬 띠)만이어야 한다 — 오로라 · 달 · 숲에 걸치면 멈춘다
const SCENES = [
  {
    key: "sc_ghost", src: ".claude/mockups/ghost-event/cos/card-bg.png", cell: 3, site: "public/card-scenes/sc_ghost.png",
    bot: { top: [[30, 350, 1140, 630]], clear: [[30, 40, 1140, 120], [30, 120, 1170, 900]] },
  },
  // 📌 「바람의 클로버 언덕」(2026-10-25) — 봇 원본은 scripts/gen-clover-scene.mjs 가 만든 봇 벌(assets/card-scenes/sc_clover-bot.png — 하늘 · 구름 · 언덕만).
  //    사이트 그림(바람 리본 · 수정 · 잎 · 별)과 일부러 다르다 — 가로 카드 글 줄에 걸려서. 그래서 site 맞춰 보기 없음 · 지울 칸도 없음(bot 네모 없음)
  { key: "sc_clover", src: "assets/card-scenes/sc_clover-bot.png", cell: 3, bot: {} },
];
const BOT_PX = 10; // 봇 카드 폭 1200 ÷ 120칸

async function cellsOf(file, cell) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  if (W % cell || H % cell) throw new Error(`${file}: ${W}×${H} 가 칸 ${cell}px 로 나뉘지 않는다`);
  const cw = W / cell, ch = H / cell, out = Buffer.alloc(cw * ch * 4);
  let mixed = 0;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const o = ((y * cell) * W + x * cell) * 4;
    for (let j = 0; j < cell; j++) for (let i = 0; i < cell; i++) {
      const p = (((y * cell + j) * W) + x * cell + i) * 4;
      if (data[p] !== data[o] || data[p + 1] !== data[o + 1] || data[p + 2] !== data[o + 2] || data[p + 3] !== data[o + 3]) mixed++;
    }
    data.copy(out, (y * cw + x) * 4, o, o + 4);
  }
  if (mixed) throw new Error(`${file}: 칸 안 색이 다른 픽셀 ${mixed}개 — 도트 칸(${cell}px)이 아니다`);
  return { cw, ch, raw: out };
}

// 글 자리 비우기 — from: 카드 위 끝에 오는 장면 줄(칸) · boxes: 카드 px 네모. 줄마다 하늘색(가로 칸 짝 · 홀 따로 가장 많은 색 — 체크 무늬 띠도 그대로)과 다른 칸이 별 · 장식.
//   이어진 장식 칸 덩어리(8방향)가 네모에 한 칸이라도 걸치면 덩어리째 그 자리 하늘색으로 — 반쪽 반짝이가 남지 않게
function cleanCells(raw, cw, ch, from, boxes) {
  const out = Buffer.from(raw);
  const at = (x, y) => raw.readUInt32BE((y * cw + x) * 4);
  const sky = [], skyOk = [];
  for (let y = 0; y < ch; y++) {
    const row = [0, 1].map((par) => {
      const m = new Map();
      let n = 0;
      for (let x = par; x < cw; x += 2) { const c = at(x, y); m.set(c, (m.get(c) || 0) + 1); n++; }
      const [c, k] = [...m].sort((a, b) => b[1] - a[1])[0];
      return { c, ok: k >= n * 0.8 };
    });
    sky.push(row.map((r) => r.c));
    skyOk.push(row[0].ok && row[1].ok);
  }
  const deco = (x, y) => skyOk[y] && at(x, y) !== sky[y][x % 2];
  const hit = new Uint8Array(cw * ch);
  let rows0 = ch, rows1 = -1;
  for (const [x0, y0, x1, y1] of boxes) {
    const cx0 = Math.max(0, Math.floor(x0 / BOT_PX)), cx1 = Math.min(cw, Math.ceil(x1 / BOT_PX));
    const cy0 = Math.max(0, from + Math.floor(y0 / BOT_PX)), cy1 = Math.min(ch, from + Math.ceil(y1 / BOT_PX));
    for (let y = cy0; y < cy1; y++) {
      if (!skyOk[y]) throw new Error(`글 자리 줄 ${y} 이 하늘(단색 · 체크 무늬)이 아니다 — 네모를 줄일 것`);
      for (let x = cx0; x < cx1; x++) hit[y * cw + x] = 1;
    }
    rows0 = Math.min(rows0, cy0); rows1 = Math.max(rows1, cy1 - 1);
  }
  const seen = new Uint8Array(cw * ch);
  let cells = 0, blobs = 0;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    if (seen[y * cw + x] || !deco(x, y)) continue;
    const blob = [], stack = [[x, y]];
    seen[y * cw + x] = 1;
    while (stack.length) {
      const [px, py] = stack.pop();
      blob.push([px, py]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch || seen[ny * cw + nx] || !deco(nx, ny)) continue;
        seen[ny * cw + nx] = 1;
        stack.push([nx, ny]);
      }
    }
    if (!blob.some(([bx, by]) => hit[by * cw + bx])) continue;
    for (const [bx, by] of blob) out.writeUInt32BE(sky[by][bx % 2], (by * cw + bx) * 4);
    cells += blob.length; blobs++;
  }
  return { raw: out, cells, blobs, rows: [rows0, rows1] };
}

// 칸 그림 → 칸 하나 = BOT_PX px 팔레트 PNG(색 · 칸 네모가 그대로인지 맞춰 본다)
async function botPng(key, raw, cw, ch) {
  // 칸 하나 = BOT_PX px — 정수 배라 칸 경계가 그대로(가장 가까운 칸)
  const big = await sharp(raw, { raw: { width: cw, height: ch, channels: 4 } }).resize(cw * BOT_PX, ch * BOT_PX, { kernel: "nearest" }).raw().toBuffer();
  const png = await sharp(big, { raw: { width: cw * BOT_PX, height: ch * BOT_PX, channels: 4 } }).png({ compressionLevel: 9, palette: true, effort: 10, colours: 256, dither: 0 }).toBuffer();
  // 팔레트로 줄인 뒤 색이 그대로인지(256색 안이면 그대로여야 한다) · 칸이 BOT_PX 네모 그대로인지
  const back = await sharp(png).ensureAlpha().raw().toBuffer();
  if (Buffer.compare(back, big) !== 0) throw new Error(`${key}: 팔레트 PNG 가 원본 색과 다르다`);
  for (let y = 0; y < ch * BOT_PX; y++) for (let x = 0; x < cw * BOT_PX; x++) { const p = (y * cw * BOT_PX + x) * 4, q = (Math.floor(y / BOT_PX) * cw + Math.floor(x / BOT_PX)) * 4; if (big.readUInt32BE(p) !== raw.readUInt32BE(q)) throw new Error(`${key}: 칸이 ${BOT_PX}px 네모가 아니다 (${x}, ${y})`); }
  return png;
}

for (const s of SCENES) {
  const { cw, ch, raw } = await cellsOf(join(ROOT, s.src), s.cell);
  const { meta } = await import(pathToFileURL(join(ROOT, "lib", "cardScenes", `${s.key}.js`)).href);
  const png = await botPng(s.key, raw, cw, ch);
  // 봇 가로 카드 두 벌 — top: 위 0칸부터 · clear: 위 meta.clear 칸부터(lib/cardScenes/art.js layer 가 고른다)
  const top = cleanCells(raw, cw, ch, 0, s.bot?.top || []);
  const clear = cleanCells(raw, cw, ch, meta.clear || 0, s.bot?.clear || []);
  const pngTop = await botPng(`${s.key} top`, top.raw, cw, ch);
  const pngClear = await botPng(`${s.key} clear`, clear.raw, cw, ch);
  if (s.site && existsSync(join(ROOT, s.site))) {
    const site = await cellsOf(join(ROOT, s.site), s.cell).catch((e) => ({ err: e.message }));
    if (site.err || site.cw !== cw || site.ch !== ch || Buffer.compare(site.raw, raw) !== 0) console.warn(`⚠ ${s.site} 이 ${s.src} 과 칸이 다르다 — 사이트 그림도 다시 만들 것`, site.err || "");
  }
  const mod = `// 📌 카드 배경 「${s.key}」 그림(봇 · 서버 이미지 카드용) — scripts/gen-card-scenes.mjs 가 만든다(손으로 고치지 말 것).
//    ${cw} × ${ch}칸 · 칸 하나 = ${BOT_PX}px(${cw * BOT_PX} × ${ch * BOT_PX} — 봇 카드 폭 1200 에 1:1). 사이트 그림은 칸 ${s.cell}px(public/card-scenes/${s.key}.png).
//    png: 원래 그림 · pngTop: 레벨업 · 역할 지급(위 0칸부터) · pngClear: 나머지 봇 카드(위 ${meta.clear || 0}칸부터) — 두 벌은 봇 카드 글 자리의 별 · 반짝이 · 도깨비불을 하늘색으로 지운 그림
//    lib/cardScenes/art.js 만 읽는다(화면 · lib/botCards.js 는 import 하지 않는다 — 봇 renderCard · 서버 카드 경로가 buildCard opts.scene 으로 넣는다)
//    lib/cardScenes/${s.key}.data.js 와 bot/src/cardScenes/${s.key}.data.js 는 같은 파일이다
export const cw = ${cw};
export const ch = ${ch};
export const cell = ${s.cell};
export const px = ${BOT_PX};
export const png = "data:image/png;base64,${png.toString("base64")}";
export const pngTop = "data:image/png;base64,${pngTop.toString("base64")}";
export const pngClear = "data:image/png;base64,${pngClear.toString("base64")}";
`;
  for (const dir of [join(ROOT, "lib", "cardScenes"), join(ROOT, "bot", "src", "cardScenes")]) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${s.key}.data.js`), mod);
  }
  console.log(s.key.padEnd(10), `${cw}×${ch}칸`, "PNG", png.length, "B · top", pngTop.length, "B", `(줄 ${top.rows.join("~")} · 덩어리 ${top.blobs} · 칸 ${top.cells})`, "· clear", pngClear.length, "B", `(줄 ${clear.rows.join("~")} · 덩어리 ${clear.blobs} · 칸 ${clear.cells})`, "· 모듈", mod.length, "B");
}
