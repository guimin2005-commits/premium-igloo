// ── /인벤토리 표시용 계산 — 보유 아이템 목록 글 + 이미지 카드 칸 ──
//    보유 판정은 itemEffects.js 의 ownedItemList(사이트 lib/ownedItems.js 와 같은 규칙)를 그대로 쓴다.
//    봇은 읽기만 한다 — 절대 저장하지 않는다.
import { Item, ShopItem, Purchase, UserXp } from "../db.js";
import { ownedItemList, pickCardSkin, pickCardScene, scenesOf, pickAvatarFrame, framesOf, withSeasonFrame, seasonFrameOf, skinsOf, seasonSkinOf, withSeasonSkin } from "../itemEffects.js";
import { isBoosterMember } from "../booster.js";
import { formatUntil } from "../botMessages.js";
import { goedamTicketInfo } from "../goedamTicket.js";
import { SEASONS, seasonEndMs } from "../leveling.js";
import { normalizeRarity } from "../rarity.js";

// 시즌 티어 테두리 이름 · 색 — 사이트 lib/itemEffects.js FRAMES · lib/voiceTiers.js 색과 같다
const FRAME_LABEL = { bronze: ["브론즈", "#a06a3c"], silver: ["실버", "#8d99a6"], gold: ["골드", "#c39220"], platinum: ["플래티넘", "#3f9e93"], diamond: ["다이아몬드", "#5a6ad8"], master: ["마스터", "#8557b0"], grandmaster: ["그랜드마스터", "#d8352a"], challenger: ["챌린저", "#2f9cf0"], igloo: ["이글루", "#e0609e"] };

const MAX_LINES = 25; // 설명 한도(4,096자) 안에 넉넉히 — 넘으면 "외 N개"
const MAX_BADGES = 3; // 사이트 lib/itemEffects.js MAX_BADGES 와 같다

// 이름에 섞인 마크다운 기호가 굵게 · 기울임을 깨지 않게
const esc = (s) => String(s || "").replace(/([\\*_~|`>])/g, "\\$1");

// 📌 착용 중 — 사이트 app/api/shop/my-items 와 같은 규칙(lib/itemEffects.js perksOfItems · pickCardSkin · pickAvatarFrame · pickBadges).
//    카드 스킨: 가진 스킨(관리자 순서 · 기프트카드 제외) 중 UserXp.cardSkinPick 으로 직접 고른 것("" 안 고름 · "none" 끔 → 착용 없음). 같은 스킨 키 아이템은 모두 착용
//    카드 배경: 카드 스킨과 같은 규칙 — UserXp.cardScenePick(카드 테두리와 따로 고르고 함께 입는다)
//    아바타 테두리: 카드 스킨과 같은 규칙 — UserXp.avatarFramePick
//    배지: UserXp.badgePick 으로 직접 단 것 중 지금 가진 배지 효과 아이템만(유저가 정한 순서 · 중복 없이 · 최대 3). 배열이 아니면(안 고름) · [] 는 착용 없음
//    📌 2026-10-04 "3개까지만 달 수 있고, 직접 안 고른 유저는 자동으로도 달리지 않게" — 산 배지도 직접 달기 전에는 착용으로 치지 않는다
const effectsOf = (item) => (Array.isArray(item?.effects) ? item.effects : []);
const skinOf = (item) => (item?.type === "physical" ? "" : String(effectsOf(item).find((e) => e?.on === "cardSkin" && e.skin)?.skin || ""));
const sceneOf = (item) => (item?.type === "physical" ? "" : String(effectsOf(item).find((e) => e?.on === "cardScene" && e.scene)?.scene || ""));
const frameOf = (item) => (item?.type === "physical" ? "" : String(effectsOf(item).find((e) => e?.on === "avatarFrame" && e.frame)?.frame || ""));
const isBadge = (item) => item?.type !== "physical" && effectsOf(item).some((e) => e?.on === "profileBadge");
// 📌 단 배지 id — 사이트 lib/itemEffects.js pickBadges 와 같은 규칙. owned: 가진 배지 아이템 id, pick: UserXp.badgePick
export function pickBadgeIds(owned, pick) {
  if (!Array.isArray(pick)) return [];
  const have = new Set(owned);
  const out = [];
  for (const raw of pick) {
    const id = String(raw);
    if (have.has(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_BADGES) break;
  }
  return out;
}
async function wornOf(userId, owned) {
  const skins = [];
  const scenes = [];
  const frames = [];
  for (const { item } of owned) {
    for (const s of skinsOf(skinOf(item))) if (!skins.includes(s)) skins.push(s); // 등급 전체(rank_all) 아이템은 9종
    for (const c of scenesOf(sceneOf(item))) if (!scenes.includes(c)) scenes.push(c);
    for (const f of framesOf(frameOf(item))) if (!frames.includes(f)) frames.push(f); // 전체(all) 아이템은 9종
  }
  const badges = owned.filter(({ item }) => isBadge(item)).map(({ item }) => String(item._id));
  // 📌 시즌 티어 테두리(seasonFrame)는 아이템이 없어도 있을 수 있어 늘 읽는다
  const pick = await UserXp.findOne({ userId }, { cardSkinPick: 1, cardScenePick: 1, avatarFramePick: 1, badgePick: 1, seasonFrame: 1 }).lean();
  const skin = pickCardSkin(withSeasonSkin(skins, pick), pick?.cardSkinPick || ""); // 시즌 등급 카드 스킨(seasonFrame 등급)도 가진 것
  const scene = pickCardScene(scenes, pick?.cardScenePick || "");
  const frame = pickAvatarFrame(withSeasonFrame(frames, pick), pick?.avatarFramePick || "");
  // 직접 단 배지만 — 안 골랐으면 자동으로 달지 않는다(사이트 lib/itemEffects pickBadges 와 같다 — badgePick 순서대로 가진 것만 · 중복 없이 · 최대 3)
  // 시즌 티어 테두리 — 같은 테두리를 아이템으로도 가졌으면 따로 줄을 만들지 않는다(사이트와 같다)
  const sk = seasonFrameOf(pick);
  const season = sk && !frames.includes(sk) ? { key: sk, n: Number(pick.seasonFrame.season) || 0 } : null;
  // 시즌 등급 카드 스킨 — 같은 스킨을 아이템으로도 가졌으면 따로 줄을 만들지 않는다(사이트와 같다)
  const ss = seasonSkinOf(pick);
  const seasonSkin = ss && !skins.includes(ss) ? { key: ss, tier: sk, n: Number(pick.seasonFrame.season) || 0 } : null;
  return { skin, scene, frame, badges: new Set(pickBadgeIds(badges, pick?.badgePick)), season, seasonSkin };
}

/**
 * @param {import("discord.js").GuildMember} member
 * @returns {Promise<{ items: string, itemCount: number, bag: object[] }>}
 *   bag — 이미지 카드용(inventoryCardData): [{ name, type, icon, imageUrl, color, rarity, count, expiresAt, pending, worn }] (관리자 순서)
 */
export async function inventoryView(member) {
  // 📌 길드가 캐시에 없으면 interaction.member 가 날것(API) 모양이라 id 가 user.id 에, 역할이 id 배열에 있다
  const userId = member?.id || member?.user?.id;
  const [purchases, items, shopItems] = await Promise.all([
    Purchase.find(
      { userId, status: { $in: ["pending", "completed"] }, consumedAt: null }, // 다 쓴 보호막은 목록에서 뺀다
      { status: 1, itemRef: 1, itemId: 1, roleId: 1, itemType: 1, expiresAt: 1 }
    ).lean(),
    // effects · unitSale · durations — ×N 묶음 판정용(ownedItemList) · icon · imageUrl · color — 카드 아이콘 · rarity — 카드 칸 희귀도(2026-10-17, lean 이라 스키마에 없어도 온다)
    Item.find({}, { name: 1, type: 1, roleId: 1, visible: 1, sortOrder: 1, createdAt: 1, effects: 1, icon: 1, imageUrl: 1, color: 1, rarity: 1, boosterPerk: 1 })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean(),
    ShopItem.find({}, { itemId: 1, type: 1, roleId: 1, unitSale: 1, durations: 1 }).lean(),
  ]);
  const roles = member?.roles?.cache;
  const heldRoles = roles ? [...roles.keys()] : Array.isArray(member?.roles) ? member.roles.map(String) : null;
  // 서버 부스터면 부스터 혜택 아이템(boosterPerk)도 — 사이트 인벤토리 (C) 와 같다(../booster.js)
  const owned = ownedItemList({ purchases, items, shopItems, heldRoles, booster: isBoosterMember(member) });
  // 📌 2026-10-25 괴담회 추첨권은 추첨 마감에 끝난다(../goedamTicket.js — 사이트 lib/inventory.js 와 같다). 만료가 없거나 더 늦으면 마감으로 읽는다(DB 는 그대로)
  const tk = await goedamTicketInfo().catch(() => null);
  if (tk?.id && tk.closesAt) for (const o of owned) if (String(o.item?._id) === tk.id && (!o.expiresAt || new Date(o.expiresAt) > tk.closesAt)) o.expiresAt = tk.closesAt;
  const worn = await wornOf(userId, owned).catch(() => ({ skin: "", scene: "", frame: "", badges: new Set(), season: null, seasonSkin: null }));
  // 📌 시즌 티어 테두리(UserXp.seasonFrame) — 아이템이 아니어도 가진 것으로 한 줄(사이트 인벤토리의 꾸미기 카드와 같다). 다음 시즌 끝(그 결산이 덮어쓴다)
  if (worn.season) {
    const [label, color] = FRAME_LABEL[worn.season.key];
    const next = SEASONS.find((x) => x.number === worn.season.n + 1);
    owned.push({
      item: { _id: `season-frame:${worn.season.n}`, name: `프로필 테두리 · ${label}`, type: "cosmetic", icon: `art:tier-frame-${worn.season.key}`, imageUrl: "", color, effects: [{ on: "avatarFrame", frame: worn.season.key }] },
      expiresAt: next ? new Date(seasonEndMs(next)) : null,
      pending: false,
      count: 1,
      season: true,
    });
  }
  // 📌 시즌 등급 카드 스킨 — 시즌 티어 테두리와 같은 보상(사이트 인벤토리의 꾸미기 카드와 같다)
  if (worn.seasonSkin) {
    const [label, color] = FRAME_LABEL[worn.seasonSkin.tier];
    const next = SEASONS.find((x) => x.number === worn.seasonSkin.n + 1);
    owned.push({
      item: { _id: `season-skin:${worn.seasonSkin.n}`, name: `카드 테두리 · ${label} 등급`, type: "cosmetic", icon: `art:tier-skin-${worn.seasonSkin.tier}`, imageUrl: "", color, effects: [{ on: "cardSkin", skin: worn.seasonSkin.key }] },
      expiresAt: next ? new Date(seasonEndMs(next)) : null,
      pending: false,
      count: 1,
      season: true,
    });
  }

  // 📌 여러 개 가진 것(1개 단위 상품 · 소모품 — count)은 "**이름** ×N" — 쓰면 줄어드는 것이라 "영구"는 붙이지 않는다(사이트 인벤토리와 같은 표기).
  //    모두 기간제면 가장 빠른 만료(먼저 쓰이는 것)를 붙인다
  //    📌 2026-10-04 #127 — 역할 기간제는 역할을 준 시각부터 센다(features/grantQueue.js grantedEnd). 지급 대기인 기간제 한 건은 만료가 아직 임시라 날짜 대신 "지급 대기"만
  const lines = owned.slice(0, MAX_LINES).map(({ item, expiresAt, pending, count, season }) => {
    const name = `**${esc(item.name) || "아이템"}**`;
    if (count > 1) return `${name} ×${count}${expiresAt ? ` · ${formatUntil(expiresAt).slice(0, 10)} 까지` : ""}${pending ? " · 지급 대기" : ""}`;
    if (pending && expiresAt) return `${name} · 지급 대기`;
    const until = expiresAt ? `${formatUntil(expiresAt).slice(0, 10)} 까지` : season ? "다음 시즌까지" : "영구";
    return `${name} · ${until}${pending ? " · 지급 대기" : ""}`;
  });
  if (owned.length > MAX_LINES) lines.push(`외 ${(owned.length - MAX_LINES).toLocaleString("ko-KR")}개`);

  // 📌 2026-10-11 옛 테두리 그림(/avatar-borders/<키>.svg — 예전 추천 아이템이 이미지 칸에 넣었다)은 그 테두리 도트 아이콘으로(사이트 lib/cosmeticArt legacyFrameArtOf 와 같은 규칙 · DB 는 그대로)
  const TIER_KEYS = ["bronze", "silver", "gold", "platinum", "diamond", "master", "grandmaster", "challenger", "igloo"];
  const DECO_ART = {
    hwf_pumpkin: "deco-pumpkin-mouth", hwf_crystal: "deco-crystal-ball", hwf_ghost: "deco-ghost-sheet", hwf_candy: "deco-wrapped-candy",
    hwf_mummy: "deco-mummy", hwf_window: "deco-haunted-window", hwf_blackcat: "deco-black-cat", hwf_patch: "deco-pumpkin-patch", hwf_party: "deco-ghost-party", hwf_witch: "deco-witch-night", hwf_shop: "deco-candy-shop", hwf_grave: "deco-moon-grave", nwf_world: "deco-new-world", nwf_chart: "deco-sea-chart", nwf_airship: "deco-airship",
    evf_ghost: "deco-ghost-tail", evf_clover: "deco-clover", bsf_aura: "deco-booster-aura",
  };
  const legacyFrameArt = (url) => {
    const m = /^\/avatar-borders\/([a-z0-9_]+)\.svg$/i.exec(String(url || "").trim());
    if (!m) return "";
    const k = m[1].toLowerCase();
    return TIER_KEYS.includes(k) ? `tier-frame-${k}` : DECO_ART[k] || "avatar-frame";
  };
  const bag = owned.map(({ item, expiresAt, pending, count, stack, season }) => {
    const skin = skinOf(item);
    const scene = sceneOf(item);
    const frame = frameOf(item);
    // 옛 그림만 뗀다 — 운영자가 고른 아이콘이 있으면 그 아이콘, 비었거나 공용 아이콘이면 테두리 도트 아이콘(사이트 cosmeticIconOf 와 같은 순서)
    const legacy = legacyFrameArt(item.imageUrl);
    const generic = ["", "art:card-skin", "art:promo-badge", "art:profile-badge", "art:avatar-frame"].includes(String(item.icon || ""));
    return {
      name: item.name || "",
      type: item.type || "item",
      icon: legacy && generic ? `art:${legacy}` : item.icon || "",
      imageUrl: legacy ? "" : item.imageUrl || "",
      color: item.color || "",
      // 📌 2026-10-17 희귀도 — 아이템 문서가 있는 칸만(""·모르는 값 = 일반). 시즌 보상(아이템 문서 없음)은 null → 카드에서 예전 모습
      rarity: season ? null : normalizeRarity(item.rarity),
      count,
      stack: !!stack,
      expiresAt,
      pending: !!pending,
      worn: (!!worn.skin && skinsOf(skin).includes(worn.skin)) || (!!worn.scene && scenesOf(scene).includes(worn.scene)) || (!!worn.frame && framesOf(frame).includes(worn.frame)) || worn.badges.has(String(item._id)),
    };
  });

  return {
    items: lines.length ? lines.join("\n") : "보유한 아이템이 없습니다.",
    itemCount: owned.length,
    bag,
  };
}

/**
 * 📌 /인벤토리 이미지 카드 data(botCards.js cmdInventory 모양) — inventoryView 의 bag 으로 만든다.
 *    칸(cards.BAG_SLOTS)보다 많으면 착용 중인 것을 앞으로 당기고 마지막 칸은 "+n". 아이템 이미지는 보이는 칸만 받는다(1.5초 · 캐시) —
 *    못 받으면 유형 기본 아이콘. 남은 일수는 사이트 가방과 같은 올림(D-n)
 * @param {{ bag: object[], itemCount: number }} v
 * @param {string} name
 * @param {object} cards 그림 모듈(botCards.js) — buildMessageWithCard 가 넘겨준다
 */
export async function inventoryCardData(v, name, cards) {
  const slots = cards?.BAG_SLOTS || 12;
  const all = Array.isArray(v?.bag) ? v.bag : [];
  const list = all.length > slots ? [...all.filter((b) => b.worn), ...all.filter((b) => !b.worn)] : all;
  const shown = list.slice(0, all.length > slots ? slots - 1 : slots);
  const now = Date.now();
  const items = await Promise.all(
    shown.map(async (b) => {
      const image = b.imageUrl && cards?.fetchImageDataUri ? await cards.fetchImageDataUri(b.imageUrl).catch(() => null) : null;
      // 지급 대기인 기간제 한 건은 남은 일수를 달지 않는다(만료가 아직 임시 — 역할을 준 시각부터 센다, #127)
      const exp = b.expiresAt && !(b.pending && !(b.count > 1)) ? new Date(b.expiresAt).getTime() : 0;
      return {
        name: b.name,
        type: b.type,
        color: b.color,
        rarity: b.rarity ?? null,
        icon: b.imageUrl && !image ? "" : b.icon,
        image,
        count: b.count,
        stack: !!b.stack,
        pending: b.pending,
        worn: b.worn,
        days: exp ? Math.max(0, Math.ceil((exp - now) / 86400000)) : null,
      };
    })
  );
  return { name, total: v?.itemCount ?? all.length, items };
}
