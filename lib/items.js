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

// 📌 기본 제공 아이콘 세트 — icon 값이 "svg:<key>" 면 사이트가 그리는 SVG 프리셋이다.
//    그림은 app/components/ItemIcon.tsx 에 있고, 여기서는 목록·검증만 한다(서버에서도 import 하므로 React 금지).
export const ICON_PRESET_PREFIX = "svg:";
// 묶음 — 피커가 이 순서로 나눠 보여 준다. 새 아이콘은 반드시 g 를 준다
export const ICON_PRESET_GROUPS = [
  { g: "basic", label: "일반" },
  { g: "perk", label: "권한" },
];
export const ICON_PRESETS = [
  { key: "bolt", label: "번개" },
  { key: "shield", label: "방패" },
  { key: "key", label: "열쇠" },
  { key: "cube", label: "큐브" },
  { key: "box", label: "상자" },
  { key: "medal", label: "메달" },
  { key: "star", label: "별" },
  { key: "crown", label: "왕관" },
  { key: "gem", label: "보석" },
  { key: "flame", label: "불꽃" },
  { key: "bell", label: "종" },
  { key: "ribbon", label: "리본" },
  { key: "ticket", label: "티켓" },
  { key: "gift", label: "선물" },
  { key: "music", label: "음표" },
  { key: "mic", label: "마이크" },
  { key: "heart", label: "하트" },
  { key: "snow", label: "눈꽃" },
  // 권한 — 디스코드 기능(채널 출입·이미지·링크·음성·슬로우 모드 해제 등)을 나타내는 모양
  { key: "unlock", label: "열린 자물쇠", g: "perk" },
  { key: "lock", label: "자물쇠", g: "perk" },
  { key: "badge", label: "인증 배지", g: "perk" },
  { key: "door", label: "출입", g: "perk" },
  { key: "eye", label: "보기", g: "perk" },
  { key: "chat", label: "말풍선", g: "perk" },
  { key: "image", label: "이미지", g: "perk" },
  { key: "link", label: "링크", g: "perk" },
  { key: "pin", label: "고정", g: "perk" },
  { key: "video", label: "영상", g: "perk" },
  { key: "speaker", label: "스피커", g: "perk" },
  { key: "headset", label: "헤드셋", g: "perk" },
  { key: "gear", label: "설정", g: "perk" },
  { key: "flag", label: "깃발", g: "perk" },
  { key: "sparkles", label: "반짝", g: "perk" },
  { key: "clock", label: "시간", g: "perk" },
  { key: "hand", label: "손", g: "perk" },
].map((p) => ({ g: "basic", ...p }));
const PRESET_KEYS = new Set(ICON_PRESETS.map((p) => p.key));
export const isPresetKey = (k) => PRESET_KEYS.has(String(k || ""));
export const isPresetIcon = (icon) => {
  const s = String(icon ?? "");
  return s.startsWith(ICON_PRESET_PREFIX) && PRESET_KEYS.has(s.slice(ICON_PRESET_PREFIX.length));
};
// "svg:bolt" → "bolt", 프리셋이 아니면 ""
export const presetKeyOf = (icon) => (isPresetIcon(icon) ? String(icon).slice(ICON_PRESET_PREFIX.length) : "");

// 아이콘은 프리셋("svg:<key>") 또는 이모지 한두 개·짧은 텍스트 — 카드·인벤토리 칸에 큰 글자로 찍히므로 길이를 자른다
export const ICON_MAX = 8;
export const normalizeIcon = (v) => {
  const s = String(v ?? "").trim();
  // 프리셋 접두면 목록에 있는 key 만 통과 — 모르는 key 가 저장되면 카드에 "svg:…" 글자가 찍힌다
  if (s.startsWith(ICON_PRESET_PREFIX)) return isPresetIcon(s) ? s : "";
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

// 📌 ShopItem 에 복사해 두는 스냅샷 — Item 이 바뀌면 상품에도 같은 값을 다시 쓴다.
//    Item.imageUrl 은 ShopItem.itemImageUrl 로 간다. ShopItem.imageUrl 은 상품 고유 이미지라 여기서 건드리지 않는다.
export const SNAPSHOT_FIELDS = ["name", "description", "icon", "color", "type", "roleId", "roleName", "detachOnSeason"];
export const itemSnapshot = (item) => {
  const out = {};
  for (const k of SNAPSHOT_FIELDS) out[k] = item?.[k] ?? (k === "detachOnSeason" ? false : "");
  out.itemImageUrl = item?.imageUrl ?? "";
  return out;
};

// 📌 표시 값 하나로 합치기 — Item > ShopItem 스냅샷 > Purchase 스냅샷 > 기본.
//    이미지만은 상품 고유 이미지가 먼저다: shopItem.imageUrl > shopItem.itemImageUrl > item.imageUrl.
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
    imageUrl: shopItem?.imageUrl || shopItem?.itemImageUrl || item?.imageUrl || "",
    color: normalizeColor(pick("color")) || itemTypeColor(type),
    type,
  };
}
