import { normalizeEffects, FRAME_ALL, SKIN_RANK_ALL } from "@/lib/itemEffects";
import { CARD_SKIN_KEYS } from "@/lib/botCards";

// 📌 등록 아이템(models/Item)의 꾸미기 효과 — 적용 미리보기(app/arctic/CosmeticPreview)가 그릴 것.
//    { skin: 카드 스킨 키 | "", badge: 프로필 배지 여부, frame: 아바타 테두리 키 | "", botCard: 봇 /레벨 카드도 그 스킨을 그리는지 } · 꾸미기가 없으면 null.
//    상품 상세(app/api/shop/items/[id]) · 시즌 패스 보상 칸(lib/seasonPass getPassState)이 같이 쓴다. 기프트카드는 효과 없음(itemEffectPartsOf 와 같은 기준)
export function cosmeticOf(item) {
  const fx = item && item.type !== "physical" ? normalizeEffects(item.effects) : [];
  const sk = fx.find((e) => e.on === "cardSkin")?.skin || "";
  const skin = sk === SKIN_RANK_ALL ? "rank_igloo" : sk; // 등급 전체(9종) 스킨 아이템은 맨 윗 등급 그림으로 미리 보인다(테두리 전체와 같다)
  const badge = fx.some((e) => e.on === "profileBadge");
  const fr = fx.find((e) => e.on === "avatarFrame")?.frame || "";
  const frame = fr === FRAME_ALL ? "igloo" : fr; // 전체(9종) 아이템은 맨 윗 등급 그림으로 미리 보인다
  return skin || badge || frame ? { skin, badge, frame, botCard: !!skin && CARD_SKIN_KEYS.includes(skin) } : null;
}
