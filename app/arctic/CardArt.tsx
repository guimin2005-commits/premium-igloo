import ItemIcon from "../components/ItemIcon";
import { itemTypeColor } from "@/lib/items";

// 📌 카드 그림 자리 — 상품 이미지 > 아이템 이미지 > 아이콘(ItemIcon: 프리셋 SVG·이모지·유형 기본).
//    배경은 등록 색을 연하게 깐 그라데이션이라 이미지 없는 상품도 서로 구분된다.
//    상점 목록 · 찜 · 장바구니 · 결제가 한 벌을 같이 쓴다 (한쪽만 imageUrl 을 보면 빈 회색 칸이 된다).
//    absolute 로 꽉 채우므로 부모는 relative overflow-hidden 이어야 한다.
//    stage: 상품 카드 · 상세처럼 큰 칸 — 아이콘을 칸 폭의 절반 가까이 키우고 아래에 도트 그림자를 깐다(사용자 결정 B안, 2026-09-29).
//           크기는 칸 폭에 비례(globals.css .art-stage — 16의 배수로 내려 도트 칸이 고르게). iconSize 는 쓰지 않는다.
//           장바구니 · 결제 썸네일처럼 작은 칸은 stage 없이 iconSize 로 그대로.
export default function CardArt({ it, imgClass = "", iconSize = 48, stage = false }: { it: any; imgClass?: string; iconSize?: number; stage?: boolean }) {
  const color = it?.color || itemTypeColor(it?.type);
  const img = it?.imageUrl || it?.itemImageUrl;
  if (img) {
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
  return (
    <div className="art-stage absolute inset-0 flex items-center justify-center" style={bg}>
      <div className={`art-stage-icon flex flex-col items-center ${imgClass}`}>
        {/* 아이콘 — 256 으로 그려 폭 100% 로 맞춘다(도트 아이콘은 여백 없이, 이모지는 칸 폭 비례 글자 크기 — 아이콘 폭(46cqw)의 82%) */}
        <ItemIcon icon={it?.icon} type={it?.type} size={256} color={color} style={{ width: "100%", height: "auto", fontSize: "37.7cqw" }} />
        {/* 도트 그림자 — 아이콘 폭의 3/4, 도트 칸 크기는 아이콘과 같다(12 × 3 칸). 색은 등록 색을 어둡게 */}
        <svg viewBox="0 0 12 3" aria-hidden className="block w-3/4 h-auto mt-[6%]" shapeRendering="crispEdges" style={{ fill: shade(color), opacity: 0.18 }}>
          <rect x="2" y="0" width="8" height="1" />
          <rect x="0" y="1" width="12" height="1" />
          <rect x="2" y="2" width="8" height="1" />
        </svg>
      </div>
    </div>
  );
}

// 등록 색을 검정 쪽으로 65% 섞는다 — 그림자가 칸 바탕(같은 색을 옅게 깐 것)과 한 톤으로 어울리게. 모르는 형식이면 잉크색
function shade(hex: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
  if (!m) return "#131313";
  const d = (h: string) => Math.round(parseInt(h, 16) * 0.35).toString(16).padStart(2, "0");
  return `#${d(m[1])}${d(m[2])}${d(m[3])}`;
}
