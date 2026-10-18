import { normalizeEffects, FRAME_ALL, SKIN_RANK_ALL, framesOf } from "@/lib/itemEffects";
import { CARD_SKIN_KEYS, CARD_SCENE_KEYS } from "@/lib/botCards";

// 📌 등록 아이템(models/Item)의 꾸미기 효과 — 적용 미리보기(app/arctic/CosmeticPreview)가 그릴 것.
//    { skin: 카드 테두리 키 | "", scene: 카드 배경 키 | "", badge: 프로필 배지 여부, frame: 프로필 테두리 키 | "", botCard: 봇 /레벨 카드도 그 꾸미기를 그리는지 } · 꾸미기가 없으면 null.
//    상품 상세(app/api/shop/items/[id]) · 시즌 패스 보상 칸(lib/seasonPass getPassState)이 같이 쓴다. 기프트카드는 효과 없음(itemEffectPartsOf 와 같은 기준)
//    📌 botCard — 실린 카드 테두리 · 카드 배경을 봇 카드(lib/botCards CARD_SKINS · CARD_SCENES)가 다 그릴 수 있을 때만(하나라도 못 그리면 기본 카드가 그 꾸미기인 척 보이므로 false).
//       미리보기는 그때 디스코드 카드(/api/shop/skin-card?skin=&scene=)를 부른다 — 배경만 있는 아이템은 skin 을 비우고 scene 만
export function cosmeticOf(item) {
  const fx = item && item.type !== "physical" ? normalizeEffects(item.effects) : [];
  const sk = fx.find((e) => e.on === "cardSkin")?.skin || "";
  const skin = sk === SKIN_RANK_ALL ? "rank_igloo" : sk; // 등급 전체(9종) 테두리 아이템은 맨 윗 등급 그림으로 미리 보인다(프로필 테두리 전체와 같다)
  // 카드 배경 — 카드 테두리와 따로 고르고 함께 입는다(한 아이템에 둘 다 있을 수 있다)
  const scene = fx.find((e) => e.on === "cardScene")?.scene || "";
  const badge = fx.some((e) => e.on === "profileBadge");
  const fr = fx.find((e) => e.on === "avatarFrame")?.frame || "";
  const frame = fr === FRAME_ALL ? "igloo" : fr; // 전체(9종) 아이템은 맨 윗 등급 그림으로 미리 보인다
  // 📌 frames — 한 아이템이 여러 테두리를 주면(전체 9종) 그 키들. 적용 미리보기가 줄로 다 보여 준다(2026-10-11 운영자 "여러개면 좀 잘 보이게")
  const frames = fr ? framesOf(fr) : [];
  return skin || scene || badge || frame
    ? { skin, scene, badge, frame, ...(frames.length > 1 ? { frames } : {}), botCard: (!!skin || !!scene) && (!skin || CARD_SKIN_KEYS.includes(skin)) && (!scene || CARD_SCENE_KEYS.includes(scene)) }
    : null;
}
