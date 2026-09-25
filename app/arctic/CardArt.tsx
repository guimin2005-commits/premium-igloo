import ItemIcon from "../components/ItemIcon";
import { itemTypeColor } from "@/lib/items";

// 📌 카드 그림 자리 — 상품 이미지 > 아이템 이미지 > 아이콘(ItemIcon: 프리셋 SVG·이모지·유형 기본).
//    배경은 등록 색을 연하게 깐 그라데이션이라 이미지 없는 상품도 서로 구분된다.
//    상점 목록 · 찜 · 장바구니 · 결제가 한 벌을 같이 쓴다 (한쪽만 imageUrl 을 보면 빈 회색 칸이 된다).
//    absolute 로 꽉 채우므로 부모는 relative overflow-hidden 이어야 한다.
export default function CardArt({ it, imgClass = "", iconSize = 48 }: { it: any; imgClass?: string; iconSize?: number }) {
  const color = it?.color || itemTypeColor(it?.type);
  const img = it?.imageUrl || it?.itemImageUrl;
  if (img) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={img} alt={it.name || ""} className={`absolute inset-0 w-full h-full object-cover ${imgClass}`} />;
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: `linear-gradient(160deg, ${color}33, ${color}0a)` }}>
      <ItemIcon icon={it?.icon} type={it?.type} size={iconSize} color={color} />
    </div>
  );
}
