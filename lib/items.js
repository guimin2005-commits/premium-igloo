// 📌 아이템 표기의 단일 정의 — 유형 라벨·기본색·정규화·표시 우선순위를 여기서만 정한다.
//    예전에는 TYPE_BADGE 가 상점 본문 / 상품 상세 / 관리자 상품 화면에 세 번 복사돼 있었다.
//    서버(route.js)와 클라이언트(page.tsx) 양쪽에서 import 하므로 DB·React 의존이 없어야 한다.

export const ITEM_TYPES = ["role", "perk", "item", "physical"];

export const ITEM_TYPE_LABEL = {
  role: "역할",
  perk: "권한",
  item: "아이템",
  physical: "기프트카드",
};

export const ITEM_TYPE_COLOR = {
  role: "#e91e3f",
  perk: "#2f6fb0",
  item: "#3f9e93",
  physical: "#131313",
};

// 관리자 유형 선택 칩 등에서 그대로 쓰는 옵션 목록
export const ITEM_TYPE_OPTIONS = ITEM_TYPES.map((v) => ({ v, l: ITEM_TYPE_LABEL[v] }));

export const isItemType = (t) => ITEM_TYPES.includes(t);
export const itemTypeLabel = (t) => ITEM_TYPE_LABEL[t] || ITEM_TYPE_LABEL.item;
export const itemTypeColor = (t) => ITEM_TYPE_COLOR[t] || ITEM_TYPE_COLOR.item;

export const isHexColor = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || ""));

// 아이콘은 이모지 한두 개 또는 짧은 텍스트 — 카드·인벤토리 칸에 큰 글자로 찍히므로 길이를 자른다
export const ICON_MAX = 8;
export const normalizeIcon = (v) => {
  const s = String(v ?? "").trim();
  // 서로게이트 쌍(이모지)을 반으로 자르지 않게 코드포인트 단위로 센다
  return Array.from(s).slice(0, ICON_MAX).join("");
};

// 색은 "#rrggbb" 만 받는다. 그 외(빈 값 포함)는 "" 로 눕혀 유형 기본색이 쓰이게 한다
export const normalizeColor = (v) => {
  const s = String(v ?? "").trim();
  return isHexColor(s) ? s.toLowerCase() : "";
};

// 📌 서버 정규화 (관리자 아이템 등록 POST 가 쓴다). 반환 { ok, error } | { ok, data }
//    role/perk 는 roleId 필수, perk 는 detachOnSeason=false 강제, physical 은 roleId "".
export function normalizeItemPayload(b) {
  const name = String(b?.name ?? "").trim().slice(0, 40);
  if (!name) return { ok: false, error: "이름을 입력해 주세요." };

  const type = isItemType(b?.type) ? b.type : "item";
  const roleRequired = type === "role" || type === "perk";
  const roleId = type === "physical" ? "" : String(b?.roleId ?? "").trim();
  if (roleRequired && !roleId) {
    return { ok: false, error: "역할·권한 유형은 연결할 역할을 선택해야 합니다." };
  }

  const sortOrderNum = Number(b?.sortOrder);
  return {
    ok: true,
    data: {
      name,
      description: String(b?.description ?? "").trim().slice(0, 120),
      icon: normalizeIcon(b?.icon),
      imageUrl: String(b?.imageUrl ?? "").trim(),
      color: normalizeColor(b?.color),
      type,
      roleId,
      roleName: roleId ? String(b?.roleName ?? "").trim().slice(0, 60) : "",
      // 권한은 역할이 곧 기능이라 시즌에 떼면 기능이 사라진다. 역할 유형만 켤 수 있다.
      detachOnSeason: type === "role" && !!b?.detachOnSeason,
      visible: b?.visible !== false,
      sortOrder: Number.isFinite(sortOrderNum) ? Math.max(-999, Math.min(999, Math.round(sortOrderNum))) : 0,
    },
  };
}

// ShopItem 에 복사해 두는 스냅샷 필드 — Item 이 바뀌면 상품에도 같은 값을 다시 쓴다
export const SNAPSHOT_FIELDS = ["name", "description", "icon", "imageUrl", "color", "type", "roleId", "roleName", "detachOnSeason"];
export const itemSnapshot = (item) => {
  const out = {};
  for (const k of SNAPSHOT_FIELDS) out[k] = item?.[k] ?? (k === "detachOnSeason" ? false : "");
  return out;
};

// 📌 표시 값 하나로 합치기 — Item > ShopItem 스냅샷 > Purchase 스냅샷 > 기본.
//    각 인자는 lean 문서 또는 null. 반환 { name, description, icon, imageUrl, color, type }
export function displayOf({ item = null, shopItem = null, purchase = null } = {}) {
  const pick = (k) => {
    for (const src of [item, shopItem]) {
      const v = src?.[k];
      if (v != null && String(v) !== "") return v;
    }
    return "";
  };
  const type = isItemType(item?.type) ? item.type
    : isItemType(shopItem?.type) ? shopItem.type
    : isItemType(purchase?.itemType) ? purchase.itemType
    : "item";
  return {
    name: pick("name") || purchase?.itemName || itemTypeLabel(type),
    description: pick("description"),
    icon: pick("icon"),
    imageUrl: pick("imageUrl"),
    color: normalizeColor(pick("color")) || itemTypeColor(type),
    type,
  };
}
