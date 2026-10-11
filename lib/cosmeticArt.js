// 📌 꾸미기 효과(카드 스킨 · 아바타 테두리) → 도트 아이콘 키(lib/itemArt.js) · 아이템 이름 · 아이템 그룹 — 한 곳에서.
//    추천 아이템 목록(lib/itemPresets.js)과 상점 관리 › 아이템 등록(효과를 고르면 비어 있는 이름 · 아이콘 · 그룹을 채운다)이 같이 쓴다.
//    서버 · 화면 양쪽에서 import 하므로 DB · React 의존이 없어야 한다.

import { SKIN_OF, FRAME_OF, TIER_FRAME_KEYS, FRAME_ALL, SKIN_RANK_ALL, normalizeEffects, skinsOf, framesOf } from "./itemEffects";

// 카드 스킨 키 → 그 스킨 전용 아이콘
const SKIN_ART = {
  gold: "skin-gold", aurora: "skin-aurora", ice: "skin-ice", crimson: "skin-crimson",
  newworld: "skin-newworld", chart: "skin-chart", airship: "skin-airship",
  hw_pumpkin: "skin-pumpkin-patch", hw_ghost: "skin-ghost-party", hw_witch: "skin-witch-night",
  hw_candy: "skin-candy-shop", hw_grave: "skin-moon-grave", hw_blackcat: "skin-black-cat",
};
// 꾸미기 테두리(할로윈 · A New World) → 그 테두리 전용 아이콘
const FRAME_ART = {
  hwf_pumpkin: "deco-pumpkin-mouth", hwf_crystal: "deco-crystal-ball", hwf_ghost: "deco-ghost-sheet", hwf_candy: "deco-wrapped-candy",
  hwf_mummy: "deco-mummy", hwf_window: "deco-haunted-window", hwf_blackcat: "deco-black-cat", hwf_patch: "deco-pumpkin-patch", hwf_party: "deco-ghost-party", hwf_witch: "deco-witch-night", hwf_shop: "deco-candy-shop", hwf_grave: "deco-moon-grave", nwf_world: "deco-new-world", nwf_chart: "deco-sea-chart", nwf_airship: "deco-airship",
};
const SEASON2_SKINS = ["newworld", "chart", "airship"];

// 카드 스킨 → 아이콘 키. rank_<등급> 은 등급 스킨 아이콘, rank_all · 모르는 키는 반짝 카드(card-skin)
export function artOfSkin(skinKey) {
  const k = String(skinKey || "");
  if (SKIN_ART[k]) return SKIN_ART[k];
  if (k.startsWith("rank_") && TIER_FRAME_KEYS.includes(k.slice(5))) return `tier-skin-${k.slice(5)}`;
  return "card-skin";
}

// 아바타 테두리 → 아이콘 키. 등급 키는 등급 테두리 아이콘, all · 모르는 키는 avatar-frame
export function artOfFrame(frameKey) {
  const k = String(frameKey || "");
  if (TIER_FRAME_KEYS.includes(k)) return `tier-frame-${k}`;
  if (FRAME_ART[k]) return FRAME_ART[k];
  return "avatar-frame";
}

// 테두리 그림(public/avatar-borders/<키>.svg) — all(등급 전체)은 그림 파일이 없다
export const frameImageOf = (frameKey) => (FRAME_OF[frameKey] ? `/avatar-borders/${frameKey}.svg` : "");

// 📌 옛 테두리 그림 → 도트 아이콘(2026-10-11 운영자 "등급 아바타 테두리 아이콘 적용 안 되는 것 좀 고쳐라").
//    예전 추천 아이템이 이미지 칸에 테두리 그림(/avatar-borders/<키>.svg)을 넣어 등록했고, 이미지가 아이콘보다 먼저 그려져 새 도트 아이콘이 안 보였다.
//    DB 는 그대로 둔다(바꾸면 새 아이콘을 모르는 실사이트 · 봇에 상자로 뜬다) — 그릴 때 그 그림을 테두리 아이콘 키로 바꾼다. 아니면 ""
const LEGACY_FRAME_IMG = /^\/avatar-borders\/([a-z0-9_]+)\.svg$/i;
export function legacyFrameArtOf(imageUrl) {
  const m = LEGACY_FRAME_IMG.exec(String(imageUrl || "").trim());
  return m ? artOfFrame(m[1].toLowerCase()) : "";
}

// 📌 꾸미기 아이템의 그릴 아이콘 — 옛 테두리 그림이거나 아이콘이 공용(비었음 · 반짝 카드 · 승급 배지 · 프로필 배지 · 테두리 공용)이면 그 스킨 · 테두리 전용 아이콘으로.
//    운영자가 따로 고른 아이콘 · 직접 올린 이미지는 그대로. it: { icon, imageUrl, skinKey?, skinKeys?, frameKey?, frameKeys? } → { icon, imageUrl }
const GENERIC_ICONS = new Set(["", "art:card-skin", "art:promo-badge", "art:profile-badge", "art:avatar-frame"]);
// 아이콘이 비었거나 공용(추천 아이템 기본값)인지 — 아니면 운영자가 고른 아이콘. ItemIcon 도 옛 테두리 그림을 이 기준으로 가른다
export const isGenericCosmeticIcon = (icon) => GENERIC_ICONS.has(String(icon || "").trim());
export function cosmeticIconOf(it) {
  const icon = String(it?.icon || ""), imageUrl = String(it?.imageUrl || "");
  const legacy = legacyFrameArtOf(imageUrl);
  if (imageUrl && !legacy) return { icon, imageUrl };
  // 📌 운영자가 고른 아이콘은 그대로 — 옛 테두리 그림이 같이 있으면 그림만 뗀다(그림이 고른 아이콘을 가리던 것이 처음 문제였다)
  if (!isGenericCosmeticIcon(icon)) return { icon, imageUrl: "" };
  const art = it?.skinKey ? artOfSkin(it.skinKey)
    : it?.frameKey ? artOfFrame(it.frameKey)
    : it?.frameKeys?.length > 1 ? artOfFrame(FRAME_ALL)
    : it?.skinKeys?.length > 1 ? artOfSkin(SKIN_RANK_ALL)
    : legacy;
  return art ? { icon: `art:${art}`, imageUrl: "" } : { icon, imageUrl };
}

// 📌 상품 그림도 같은 고르기로(2026-10-11) — 공용 반짝 카드 아이콘 · 옛 테두리 그림으로 등록된 꾸미기 상품(「아바타 테두리 · 전체」가 이글루로 보이던 것 등)이 제 도트 아이콘으로 보이게.
//    등록 아이템(models/Item) → 꾸미기 효과 키 { skin?, frame? } — 효과에 적힌 값 그대로(rank_all · all 도). 카드 스킨 · 아바타 테두리가 없으면 null.
//    상점 목록 API(app/api/shop/items)가 상품 · 세트 구성마다 cosmeticKeys 로 싣는다
export function cosmeticKeysOf(item) {
  if (!item || item.type === "physical") return null;
  const fx = normalizeEffects(item.effects);
  const skin = fx.find((e) => e.on === "cardSkin" && e.skin)?.skin || "";
  const frame = fx.find((e) => e.on === "avatarFrame" && e.frame)?.frame || "";
  const out = {};
  if (skinsOf(skin).length) out.skin = skin;
  if (framesOf(frame).length) out.frame = frame;
  return out.skin || out.frame ? out : null;
}
// 상품 · 세트 구성({ icon, imageUrl, itemImageUrl?, cosmeticKeys }) → 그릴 { icon, imageUrl } — 인벤토리(lib/inventory.js)와 같은 키 모양으로 cosmeticIconOf. 키가 없으면 null(상품 값 그대로)
export function productIconOf(it) {
  const k = it?.cosmeticKeys;
  if (!k || typeof k !== "object") return null;
  const skins = skinsOf(k.skin), frames = framesOf(k.frame);
  if (!skins.length && !frames.length) return null;
  return cosmeticIconOf({
    icon: it.icon, imageUrl: it.imageUrl || it.itemImageUrl,
    ...(skins.length > 1 ? { skinKeys: skins } : skins.length ? { skinKey: skins[0] } : {}),
    ...(frames.length > 1 ? { frameKeys: frames } : frames.length ? { frameKey: frames[0] } : {}),
  });
}

// 📌 효과 한 줄(on · skin · frame) → 새 아이템에 채울 값 { icon, name, group } (꾸미기가 아니거나 모르는 키면 null).
//    이름은 추천 아이템과 같은 꼴("카드 스킨 · <이름>" · "아바타 테두리 · <이름>"), 그룹은 시즌 2 · 등급 카드 스킨 · 등급 아바타 테두리 · 할로윈(기본 스킨은 그룹 없음)
export function cosmeticAutoOf(effect) {
  const on = effect?.on;
  if (on === "cardSkin") {
    const k = String(effect?.skin || "");
    const s = SKIN_OF[k];
    if (!s) return null;
    const group = k.startsWith("rank_") || k === SKIN_RANK_ALL ? "등급 카드 스킨" : k.startsWith("hw_") ? "할로윈" : SEASON2_SKINS.includes(k) ? "시즌 2" : "";
    return { icon: `art:${artOfSkin(k)}`, name: `카드 스킨 · ${s.l}`, group };
  }
  if (on === "avatarFrame") {
    const k = String(effect?.frame || "");
    if (k === FRAME_ALL) return { icon: `art:${artOfFrame(k)}`, name: "아바타 테두리 · 전체", group: "등급 아바타 테두리" };
    const f = FRAME_OF[k];
    if (!f) return null;
    const group = TIER_FRAME_KEYS.includes(k) ? "등급 아바타 테두리" : k.startsWith("hwf_") ? "할로윈" : k.startsWith("nwf_") ? "시즌 2" : "";
    return { icon: `art:${artOfFrame(k)}`, name: `아바타 테두리 · ${f.l}`, group };
  }
  return null;
}
