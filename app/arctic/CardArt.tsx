import ItemIcon from "../components/ItemIcon";
import { itemTypeColor, artKeyOf, presetKeyOf } from "@/lib/items";
import { backdropSrc } from "@/lib/itemBackdrops";

// 📌 카드 그림 자리 — 상품 이미지 > 아이템 이미지 > 아이콘(ItemIcon: 프리셋 SVG·이모지·유형 기본).
//    배경은 등록 색을 연하게 깐 그라데이션이라 이미지 없는 상품도 서로 구분된다.
//    상점 목록 · 찜 · 장바구니 · 결제가 한 벌을 같이 쓴다 (한쪽만 imageUrl 을 보면 빈 회색 칸이 된다).
//    absolute 로 꽉 채우므로 부모는 relative overflow-hidden 이어야 한다.
//    stage: 상품 카드 · 상세처럼 큰 칸 — 아이콘을 칸 폭의 절반 가까이 키우고 아래에 도트 그림자를 깐다(사용자 결정 B안, 2026-09-29).
//           크기는 인라인 폭 46%(칸 폭 비례) 하나로 정한다 — 컨테이너 단위 · round() 같은 새 CSS 에 기대면 안 되는 브라우저에서
//           규칙이 통째로 빠져 아이콘이 원래 그림 크기(256px)로 칸을 가득 채웠다(2026-09-30 "아이템 비정상적으로 커짐").
//           이모지 아이콘은 글자라 폭 비례가 안 되므로 96px 고정. iconSize 는 쓰지 않는다.
//           장바구니 · 결제 썸네일처럼 작은 칸은 stage 없이 iconSize 로 그대로.
//    📌 배경 장면(it.backdrop — lib/itemBackdrops.js, 2026-09-30 "아이콘만 달랑 있어 없어 보인다" → 장면 24종 중 관리자가 고름):
//       stage 칸에서만 그라데이션 대신 64×64 도트 장면을 꽉 채워 깐다(image-rendering: pixelated — 키워도 도트가 번지지 않게).
//       상품 이미지가 있고 장면도 골랐으면(2026-10-01 "내가 등록한 이미지들의 배경도 적용") 장면 위에 이미지를 아이콘처럼 세운다 —
//       아이콘과 같은 폭 46% · 정사각 · object-contain(투명 PNG 물건 그림이 땅에 선다). 장면을 안 고른 이미지는 예전처럼 칸을 꽉 채운다. 작은 썸네일(stage 없음 — 장바구니 80px · 결제 56px · 구매 창 80px)은 장면을 쓰지 않는다:
//       깔아서 나란히 비교해 보니 64 → 56 · 80 은 정수 배율이 아니라 도트가 고르게 안 떨어져 자글자글했고,
//       28~36px 아이콘이 장면 무늬에 묻히며 가운데 정렬이라 땅에 서지도 않았다(2026-09-30 실측 비교 후 결정).
export default function CardArt({ it, imgClass = "", iconSize = 48, stage = false }: { it: any; imgClass?: string; iconSize?: number; stage?: boolean }) {
  const color = it?.color || itemTypeColor(it?.type);
  const img = it?.imageUrl || it?.itemImageUrl;
  const scene = stage ? backdropSrc(it?.backdrop) : "";
  if (img && !scene) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={img} alt={it.name || ""} className={`absolute inset-0 w-full h-full object-cover ${imgClass}`} />;
  }
  const bg = { background: `linear-gradient(160deg, ${color}33, ${color}0a)` };
  if (!stage) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={bg}>
        <ItemIcon icon={it?.icon} type={it?.type} size={iconSize} color={color} />
      </div>
    );
  }
  const icon = String(it?.icon || "");
  const emoji = !!icon && !artKeyOf(icon) && !presetKeyOf(icon) && !/^(art|svg):/.test(icon);
  // 아이콘 + 도트 그림자 한 덩어리 (배경이 있든 없든 같은 모양)
  const figure = (
    <div className={`flex flex-col items-center ${scene ? "shrink-0" : ""} ${imgClass}`} style={{ width: "46%", marginTop: scene ? "auto" : "-4%" }}>
      {/* 아이콘 — SVG(도트 · 프리셋)는 256 으로 그려 폭 100% 로 맞춘다(여백 없이). 이모지는 96px 고정 */}
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={it.name || ""} draggable={false} className="block w-full aspect-square object-contain select-none" />
      ) : emoji ? (
        <ItemIcon icon={icon} type={it?.type} size={96} color={color} />
      ) : (
        <ItemIcon icon={icon} type={it?.type} size={256} color={color} style={{ width: "100%", height: "auto" }} />
      )}
      {/* 도트 그림자 — 아이콘 폭의 3/4, 도트 칸 크기는 아이콘과 같다(12 × 3 칸). 색은 등록 색을 어둡게 */}
      <svg viewBox="0 0 12 3" aria-hidden className="block w-3/4 h-auto mt-[6%]" shapeRendering="crispEdges" style={{ fill: shade(color), opacity: scene ? SCENE_SHADOW_OPACITY : 0.18 }}>
        <rect x="2" y="0" width="8" height="1" />
        <rect x="0" y="1" width="12" height="1" />
        <rect x="2" y="2" width="8" height="1" />
      </svg>
    </div>
  );
  if (!scene) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={bg}>
        {figure}
      </div>
    );
  }
  return (
    // 장면이 오기 전에는 지금 바탕(등록 색 그라데이션)이 보인다 — 빈 회색 칸이 번쩍이지 않게
    <div className="absolute inset-0" style={bg}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={scene} alt="" aria-hidden draggable={false} decoding="async"
        className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none" style={{ imageRendering: "pixelated" }} />
      {/* 📌 그림자를 장면의 땅에 붙인다 — 덩어리 바닥(그림자 아래 끝)을 칸 가운데(bottom 50%)에서 칸 폭의 26.7% 아래(margin % 는 폭 기준)에 둔다.
             장면은 폭에 맞춰 덮이므로(정사각 · 4:3 모두 폭 기준 object-cover) 그림자는 늘 장면 64줄 중 44~49번째 줄에 놓인다
             = 카운터 · 제단 · 무대 · 섬 윗면 같은 땅 면(실측 42~50줄) 위. 정사각 칸 높이로는 68~77%.
             26.7% 는 배경 없는 칸의 가운데 정렬(marginTop -4%)과 같은 자리라 도트 · 프리셋 아이콘은 배경을 바꿔도 한 칸도 안 움직이고,
             이모지(96px 고정 — 칸 폭에 비례하지 않는다)도 가운데 정렬처럼 뜨거나 가라앉지 않고 같은 땅에 선다.
          📌 틀은 칸 맨 위(top 0)부터 그 땅 줄까지 세로로 잡고, 덩어리는 margin-top:auto 로 바닥에 붙인다.
             좁은 칸(약 147px 미만 — 320px 폰 2열 134px)에서 96px 이모지 덩어리가 틀보다 크면 auto 여백이 0 이 되어
             덩어리가 칸 위 끝에서 시작한다(위로 넘쳐 잘리지 않고 아래로 조금 내려앉음). justify-content: safe 는 안 받는 브라우저가 있어 쓰지 않는다 */}
      <div className="absolute inset-x-0 top-0 flex flex-col items-center" style={{ bottom: "50%", marginBottom: "-26.7%" }}>
        {figure}
      </div>
    </div>
  );
}

// 장면 위 그림자 진하기 — 무늬 있는 땅 위에서도 읽히게 기본 바탕(0.18)보다 조금 진하게
const SCENE_SHADOW_OPACITY = 0.3;

// 등록 색을 검정 쪽으로 65% 섞는다 — 그림자가 칸 바탕(같은 색을 옅게 깐 것)과 한 톤으로 어울리게. 모르는 형식이면 잉크색
function shade(hex: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
  if (!m) return "#131313";
  const d = (h: string) => Math.round(parseInt(h, 16) * 0.35).toString(16).padStart(2, "0");
  return `#${d(m[1])}${d(m[2])}${d(m[3])}`;
}
