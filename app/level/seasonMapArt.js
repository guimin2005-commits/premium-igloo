// 📌 「시즌」 진행 항로 지도 전용 도트(2026-11-02).
//    운영자 "어울리지도 않는 기존 도트들로 재활용하는 게 개열받네 · 도트 바꾸랬잖" → 1차(등대 · 천막 · 돛배 · 성) "장난감 같음" 반려 →
//    2차: 시즌 2 배너(public/banners/season2-pass-pc.png) 하늘 군도 그림결 — 배너 색(짙은 보라 테 · 연두 풀 + 흘러내린 이끼 · 황토 → 적갈 흙 층 · 늘어진 뿌리 · 둥근 나무 · 폭포).
//    시작 = 깃발 섬 · 이벤트 시작 = 작은 섬 세 벌(차례로 돌아감) · 내 자리 = 돛 단 하늘 배 · 시즌 종료 = 먼 보랏빛 섬(배너의 「새로운 세계」 — 성은 운영자 "성은 진짜 개패고 싶네" 반려). 평평한 단색 + 또렷한 테, 빛무리 없음.
//    글자 칸은 .claude/mockups/card-stats/mapart-gen.mjs 가 만든 것(고칠 땐 거기서 다시 만들어 붙인다). anchor = 길에 닿는 줄(섬 풀 윗줄 · 배 바닥)의 세로 비율
const PAL = {
  o: "#2a1840", // 테(배너 테)
  H: "#c9ef7c", g: "#5fbf4a", G: "#2a8a4c", D: "#1f7a52", // 풀
  e: "#e3a35a", E: "#b8693a", r: "#7e3f37", R: "#4f2a40", // 흙 · 나무
  w: "#9fd8ff", W: "#7ac0ef", c: "#ffffff", // 물 · 흰
  s: "#fff3ef", S: "#eebcd2", // 돛
  f: "#e8283f", F: "#a3122b", // 빨강
  a: "#f3ecff", A: "#c7b6ec", B: "#8f78c8", // 돌(성)
  y: "#ffd34d", // 불빛
  // 먼 섬(배너 저 멀리 보랏빛 섬 — 시즌 종료 「새로운 세계」): 밝은 면 → 어두운 면
  "1": "#e9bfdc", "2": "#d8a2cb", "3": "#b88cc2", "4": "#a483c3", "5": "#8f75b8", "6": "#7c68ac", "7": "#6a5ba0", "8": "#f6dcea",
};

export const MAP_ART = {
  start: { anchor: 0.421, rows: [
    "....................o.........",
    "...................oyooo......",
    "...................oafffoo....",
    "......ooo..........oafffffooo.",
    "....ooHHHoo........oaffffffffo",
    "...oHHHHHggo.......oaFFFFFooo.",
    "..oHHHHHgggGo......oaFFFoo....",
    "..oHHHgggggGo......oaooo......",
    ".oHHHggggggGGo.....oao........",
    ".oHHHgggggGGGo.....oao........",
    ".oHHgggggGGGGo.....oao........",
    "..ogggggGGGGo......oao........",
    "..oggggGGGGGo......oao........",
    "...oGGGGGGGo.......oao........",
    "....ooGrGoo........oao........",
    "..ooooErooooooooooooaooooooo..",
    ".oHHHHErHHHHHHHHHHHHHHHgggggo.",
    "ogggggggggggggggggggggggGGGGGo",
    "ogggggggggggggggggggggGGGGGGGo",
    "oeEeEGeeeeeeDeeeeeeeEDEEEGEDEo",
    ".oeEeGeeeeeeeeeeeeeEeEEEEGEEo.",
    ".oEeEDeeeeeeeeeeeeeeEEEEEGEEo.",
    "..ooeEeeeeeeeeeeeeeEEEEEEDoo..",
    "...oEEEEEEEEEEEEEEEErrrrrro...",
    "....oEEEEEEEEEEEEEErrrrrro....",
    ".....oEEEEEEEEEEEErrrrrro.....",
    "......oEEEEEEEEEEEErrrro......",
    ".......oEEEEEEEEEErrrro.......",
    "........orrrrrrrrRRRRo........",
    ".........orrrrrrrRRrro........",
    ".........orrrrrrrRRrro........",
    ".........orroorrroorro........",
    ".........orrooRRroorro........",
    ".........orro.orrooRRo........",
    ".........oRRo.orrooRRo........",
    ".........oRRo.oRRooRo.........",
    ".........oRo..oRRooRo.........",
    ".........oRo..oRRo.o..........",
  ] },
  isles: [
    { anchor: 0.355, rows: [
    ".......ooo..............",
    ".....ooHHHoo............",
    "....oHHHHgggo..ooo......",
    "....oHHHgggGo.oHHHo.....",
    "...oHHHggggGGoHHHggo....",
    "...oHHggggGGGHHggggGo...",
    "...oHggggGGGGHHgggGGo...",
    "....ogggGGGGoHgggGGGo...",
    "....ogGGGGGGooggGGGo....",
    ".....ooGrGoo..oGrGo.....",
    "..oooooErooooooErooooo..",
    ".oHHHHHErHHHHHHErHHgggo.",
    "oggggggggggggggggggGGGGo",
    "oggggggggggggggggGGGGGGo",
    "oeEeeeeGGeeeeeeeEEEEGEEo",
    ".oeEeeeDGeeeeeeeeEEEGEo.",
    ".oEeEeeeDeeeeeeeEEEEDEo.",
    "..ooeEeeeeeeeeeEEEEEoo..",
    "...oEEEEEEEEEEEErrrro...",
    "....oEEEEEEEEEErrrro....",
    ".....oEEEEEEEErrrro.....",
    "......oorrrrrrRRoo......",
    ".......orrrrrrRRo.......",
    "........orrrrRrro.......",
    "........orrRRorro.......",
    "........orroooRRo.......",
    "........oRRo.oRRo.......",
    "........oRRo.oRo........",
    "........oRo..oRo........",
    "........oRo...o.........",
    ".........o..............",
  ] },
    { anchor: 0.394, rows: [
    ".........ooo..........",
    ".......ooHHHoo........",
    "......oHHHHHggo.......",
    ".....oHHHHHgggGo......",
    ".....oHHHgggggGo......",
    "....oHHHggggggGGo.....",
    "....oHHHgggggGGGo.....",
    "....oHHgggggGGGGo.....",
    ".....ogggggGGGGo......",
    ".....oggggGGGGGo......",
    "......oGGGGGGGo.......",
    ".......ooGrGoo........",
    "..oooooooErooooooooo..",
    ".oHHHHHHHErHHHHHHgggo.",
    "ogggggggggggggggggGGGo",
    "ogggggggggggggggGGGcwo",
    "oeEeGeeeeeeeeeeGDEEwWo",
    ".oeEGeeeeeeeeeeGDEEwWo",
    ".oEeDeeeeeeeeeEDEEEwWo",
    "..oEEEEEEEEEEEErrrrwWo",
    "...oEEEEEEEEEErrrrowWo",
    "....ooEEEEEEErrrooowWo",
    ".....orrrrrrrrRRo.owWo",
    "......orrrrrrRRo..owWo",
    ".......orrrrRoo...owWo",
    ".......orrRRro....owWo",
    ".......orrorro....owWo",
    ".......oRRorro....owWo",
    ".......oRooRRo....owWo",
    ".......oRooRRo....owWo",
    "........o.oRo.....owWo",
    "..........oRo.....owWo",
    "...........o.......oo.",
  ] },
    { anchor: 0.355, rows: [
    "............ooo.........",
    "..........ooHHHoo.......",
    ".....ooo.oHHHHgggo......",
    "....oHHHooHHHgggGo......",
    "...oHHHggHHHggggGGooo...",
    "..oHHggggHHggggGGGHHgo..",
    "..oHHgggGHggggGGGHHggGo.",
    "..oHgggGGGgggGGGGHggGGo.",
    "...oggGGGogGGGGGGggGGGo.",
    "....oGrGo.ooGrGoooGrGo..",
    "..oooEroooooErooooEroo..",
    ".oHHHErHHHHHErHHHHErggo.",
    "oggggggggggggggggggGGGGo",
    "oggggggggggggggggGGGGGGo",
    "oeEeeeeGDeeeeeeGGEEEEEEo",
    ".oeEeeeGeeeeeeeGGEEEEEo.",
    ".oEeEeeDeeeeeeeDDEEEEEo.",
    "..oEEEEEEEEEEEErrrrrro..",
    "...oEEEEEEEEEEEErrrro...",
    "....ooEEEEEEEEErrroo....",
    "......orrrrrrrRRRo......",
    ".......oorrrrRRoo.......",
    "........orrrrrRo........",
    ".........orRRoo.........",
    ".........orro...........",
    ".........orro...........",
    ".........oRRo...........",
    ".........oRRo...........",
    ".........oRo............",
    ".........oRo............",
    "..........o.............",
  ] },
  ],
  ship: { anchor: 0.839, rows: [
    "..............orffffffo............",
    "..............orffffoo.............",
    "............ooorFFoo...............",
    "...........osssrsSSo...............",
    "...........osssrsSSo...............",
    "........oooosssrsSSoooo............",
    ".......osssssssrsssSSSSo...........",
    ".......osssssssrsssSSSSSo..........",
    ".......oSSSSSSSrSSSSSSSSSo.........",
    "......ossssssssrsssSSSSSSo.........",
    "......ossssssssrsssSSSSSSSo........",
    "......ossssssssrsssSSSSSSSo........",
    "......oSSSSSSSSrSSSSSSSSSSo........",
    ".....osssssssssrsssSSSSSSSo........",
    ".....osssssssssrsssSSSSSSSo........",
    ".....osssssssssrsssSSSSSSo.........",
    ".....oSSSSSSSSSrSSSSSSSSSo.........",
    "....ossssssssssrsssSSSSSo..........",
    "....ossssssssssrsssSSSSo...........",
    "...o.oooooooooorooooooo.o..o....oo.",
    "..oroorooroorooroorooroorooro..orro",
    ".ooroorooroorooroorooroorooroooeeo.",
    "orrrrrrrrrrrrrrrrrrrrrrrrrrrrreeo..",
    "oeeeeeeeeeeeeeeeeeeeeeeeeeeeEEoo...",
    ".oeeeeeeeeeeeeeeeeeeeeeeeeeeEEo....",
    "..oEEEyyEEEEyyEEEEyyEEEEyyEEEo.....",
    "...oEEEEEEEEEEEEEEEEEEEEEEEoo......",
    "....ooorrrrrrrrrrrrrrrrrooo........",
    ".......orrrrrrrrrrrrrooo...........",
    "........ooorrrrrrrroo..............",
    "...........oooooooo................",
  ] },
  castle: { anchor: 0.364, rows: [
    "......................4.....................",
    "......................4.....................",
    ".....................345....................",
    ".....................345....................",
    "...................4444555..................",
    ".....................345....................",
    ".....................345....................",
    ".....................345....................",
    ".....................385....................",
    "..........2..........385....................",
    ".........223.........345........2...........",
    "........22233........345.......223..........",
    ".......2222333..2....345......22233.........",
    "......222223333223...345.....2222333.2......",
    ".....22222233333233..345....22222333323.....",
    "....2222222333333333.345...2222223333333....",
    ".111111111111111111111111111111111222222222.",
    "22222222222222222222222222222232333133333333",
    ".222222222222222222222222222232333383333333.",
    "..2222222222222222222222222222323338333333..",
    "....333333333333333333333333343444484444....",
    "....333333333333333333333333434444484444....",
    "......33333333333333333333333444444844......",
    "......44444444444444444444445455555855......",
    "........4444444444444444444545555558........",
    "..........444444444444444454555555.8........",
    "..........555555555555555556666666.8........",
    "............55555555555555666666...8........",
    ".............555555555555656666....8........",
    "..............5555555555556666.....8........",
    "..............7666666666677777.....8........",
    "..............7766666666777777.....8........",
    "..............777..666677..777.....8........",
    "..............777...7777...777.....8........",
    "..............777...777....777.....8........",
    "..............777...777....777.....8........",
    "..............777...777....777.....8........",
    "..............77....777....777.....8........",
    "..............77....777....77......8........",
    "..............7.....777....77......8........",
    "....................77.....7.......8........",
    "....................77.............8........",
    "....................7..............8........",
    "...................................8........",
  ] },
};

// 글자 칸 → 사각형(가로로 이어진 같은 색은 한 칸으로)
function rectsOf(rows) {
  const out = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || !PAL[ch]) { x++; continue; }
      let e = x + 1;
      while (e < row.length && row[e] === ch) e++;
      out.push({ x, y, w: e - x, c: PAL[ch] });
      x = e;
    }
  });
  return out;
}

// 그림 하나 — scale: 한 칸 픽셀 수(정수만 — 칸이 고르게). anchored: 길 위 점(부모 0 × 0 칸)에 기준 줄을 맞춰 세운다
export function MapPix({ art, scale = 2, anchored = false }) {
  const w = art.rows[0].length, h = art.rows.length;
  const svg = (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} width={w * scale} height={h * scale} shapeRendering="crispEdges" className="block">
      {rectsOf(art.rows).map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />)}
    </svg>
  );
  if (!anchored) return svg;
  return <span className="absolute left-0 top-0 z-[2]" style={{ transform: `translate(-50%, -${(art.anchor * 100).toFixed(1)}%)` }}>{svg}</span>;
}
export const isleArt = (n = 0) => MAP_ART.isles[((n % MAP_ART.isles.length) + MAP_ART.isles.length) % MAP_ART.isles.length];
