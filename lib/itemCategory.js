// 📌 분류(카테고리) 한 곳 — 2026-10-17 운영자 결정 「자동 + 바꾸기」.
//    예전엔 분류가 이름 머리말에 들어 있었다(「카드 스킨 · 골드」 → lib/itemName.js splitItemName 이 떼어 읽음). 운영자 "이름에 적어야 카테고리가
//    적용되는 방식이라 애매 … 따로 설정 가능하게 통합하자" → 이름은 짧은 이름만(「골드」), 분류는 따로(models/Item.js · ShopItem.js category).
//    · 자동(category "") — 꾸미기 효과(카드 배경 · 카드 테두리 · 프로필 테두리 · 프로필 배지), 아니면 유형 이름(lib/items.js — 아이템 · 역할 · 권한 · 꾸미기 · 기프트카드), 세트는 「세트」
//    · 바꾸기 — 관리자가 목록(CATEGORY_OPTIONS)에서 고르거나 직접 적은 글자(20자 — lib/items.js normalizeItemCategory)
//    · 옛 데이터 — category 가 비어 있는 동안은 이름 머리말을 분류로 읽고(카드 스킨 → 카드 테두리 · 아바타 테두리/테두리 → 프로필 테두리 · 배지 → 프로필 배지),
//      화면 이름은 머리말을 뗀 짧은 이름(shortNameOf). 옮기기는 scripts/migrate-item-categories.mjs
//    · 연결 상품(ShopItem.itemId)은 그 아이템의 분류를 따른다(상품 칸은 "" — 그룹과 같다). 직접 설정 상품 · 세트는 상품 자기 칸
//    순서: 직접 정한 분류 > 옛 이름 머리말 > 자동. 서버 · 클라이언트 둘 다 쓴다(DB · React 없음)
import { itemTypeLabel, normalizeItemCategory, ITEM_CATEGORY_MAX } from "./items";
import { ITEM_NAME_HEAD_RE, splitItemName } from "./itemName";

export { normalizeItemCategory as normalizeCategory, ITEM_CATEGORY_MAX as CATEGORY_MAX };

export const BUNDLE_CATEGORY = "세트";
// 꾸미기 효과 → 분류(lib/itemEffects.js TRIGGERS 꾸미기형 라벨과 같은 글자). 차례 = 한 아이템에 둘 이상일 때 앞의 것(인벤토리 invKindOf 와 같은 차례)
export const COSMETIC_CATEGORIES = ["카드 배경", "카드 테두리", "프로필 테두리", "프로필 배지"];
// 📌 관리자 「분류」 고르기 목록 — 꾸미기 넷 · 유형 이름 · 실물 · 세트. 목록에 없는 글자도 직접 적을 수 있다
export const CATEGORY_OPTIONS = [...COSMETIC_CATEGORIES, "꾸미기", "아이템", "역할", "권한", "기프트카드", "실물", BUNDLE_CATEGORY];

// 효과 목록 — 저장 모양(배열)과 관리 API 화면 모양({ list }) 둘 다 받는다
const fxListOf = (effects) => (Array.isArray(effects) ? effects : Array.isArray(effects?.list) ? effects.list : []);
const has = (fx, on, key) => fx.some((e) => e?.on === on && (!key || String(e?.[key] || "") !== ""));

// 📌 꾸미기 효과의 분류 — "" 이면 꾸미기 효과 없음. 받는 모양 셋:
//    아이템(effects) · 상품(cosmeticKeys { scene, skin, frame } — app/api/shop/items) · 인벤토리 칸(sceneKey · skinKey(s) · frameKey(s) · badgeId — lib/inventory.js)
export function cosmeticCategoryOf(it) {
  if (!it || it.type === "physical") return "";
  const fx = fxListOf(it.effects);
  const ck = it.cosmeticKeys && typeof it.cosmeticKeys === "object" ? it.cosmeticKeys : {};
  if (has(fx, "cardScene", "scene") || it.sceneKey || ck.scene) return "카드 배경";
  if (has(fx, "cardSkin", "skin") || it.skinKey || it.skinKeys?.length || ck.skin) return "카드 테두리";
  if (has(fx, "avatarFrame", "frame") || it.frameKey || it.frameKeys?.length || ck.frame) return "프로필 테두리";
  if (has(fx, "profileBadge") || it.badgeId) return "프로필 배지";
  return "";
}

// 📌 자동 분류 — 세트 → 「세트」, 꾸미기 효과 → 그 분류, 나머지 → 유형 이름(lib/items.js itemTypeLabel — 모르는 유형은 「아이템」)
export function autoCategoryOf(it) {
  const type = it?.type || it?.kind || "";
  if (type === "bundle") return BUNDLE_CATEGORY;
  return cosmeticCategoryOf(it) || itemTypeLabel(type);
}

// 📌 옛 이름 머리말의 분류 — 머리말이 없거나 떼면 남는 글자가 없으면 ""(lib/itemName.js splitItemName 과 같다).
//    「카드 스킨」은 묶음 이름(카드 배경 · 카드 테두리 — 2026-10-15)이라 효과가 카드 배경이면 카드 배경, 그 밖은 카드 테두리. auto = autoCategoryOf 값
export function legacyCategoryOf(name, auto = "") {
  const n = String(name || "");
  const m = ITEM_NAME_HEAD_RE.exec(n);
  if (!m) return "";
  const { kind } = splitItemName(n);
  if (!kind) return "";
  if (m[1].replace(/\s+/g, "") === "카드스킨" && auto === "카드 배경") return auto;
  return kind;
}

// 화면 이름 — 옛 머리말을 뗀 짧은 이름(머리말이 없으면 이름 그대로)
export const shortNameOf = (name) => splitItemName(String(name || "")).short;

// 📌 분류 정하기 — 직접 정한 분류 > 옛 이름 머리말 > 자동.
//    entity: { category?, name?, type?, effects? | cosmeticKeys? | sceneKey … } — 아이템 · 상품 · 인벤토리 칸 · { name, type } 무엇이든.
//    item(또는 entity.linkedItem): 연결 상품이면 연결 아이템을 넘긴다 — 그 아이템으로 정한다(상품 칸은 보지 않는다)
export function resolveCategory(entity, item = null) {
  const src = item || entity?.linkedItem || entity;
  const explicit = normalizeItemCategory(src?.category);
  if (explicit) return explicit;
  const auto = autoCategoryOf(src);
  return legacyCategoryOf(src?.name, auto) || auto;
}

// 📌 API 응답에 붙이는 칸 한 벌(app/api/admin/items · app/api/shop/items · items/[id]):
//    category      — 저장된 칸 그대로("" = 자동). 관리 폼은 이 값을 읽고 그대로 돌려보낸다(보이는 분류를 저장 칸으로 쓰지 않게)
//    categoryLabel — 화면에 찍을 분류(resolveCategory)
//    categoryAuto  — 「자동」이면 보일 분류(옛 머리말 > 자동) — 관리 폼의 「자동」 표시
//    shortName     — 화면에 찍을 이름(옛 머리말을 뗀 이름)
//    item: 연결 상품의 연결 아이템(없으면 entity 자기 값으로)
export function categoryFieldsOf(entity, item = null) {
  const src = item || entity;
  return {
    category: typeof entity?.category === "string" ? entity.category : "",
    categoryLabel: resolveCategory(src),
    categoryAuto: resolveCategory({ ...src, category: "" }),
    shortName: shortNameOf(entity?.name),
  };
}

// 📌 표시 원천 고르기(lib/items.js displayOf 와 같은 차례) — 등록 아이템 > 상품 > 구매 스냅샷(itemName · itemType).
//    세트 구성 건(purchase.bundleName)은 세트 상품을 보지 않는다(구성 아이템 · 구매 스냅샷만). type 을 주면 자동 분류의 유형을 그것으로(인벤토리 kind)
export function displayCategoryOf({ item = null, shopItem = null, purchase = null, type = "" } = {}) {
  const shop = purchase?.bundleName ? null : shopItem;
  const src = item || shop || { name: purchase?.itemName || "", type: purchase?.itemType || "item" };
  return resolveCategory(type ? { ...src, type } : src);
}
