export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getCumulativeXpByLevel } from "@/lib/leveling";
import UserXp from "@/models/UserXp";
import RoleConfig from "@/models/RoleConfig";
import XpBoost from "@/models/XpBoost";
import Purchase from "@/models/Purchase";
import Item from "@/models/Item";
import ShopItem from "@/models/ShopItem";
import BotSetting from "@/models/BotSetting";
import { settleTierPoints } from "@/lib/points";
import { fetchMemberRoles } from "@/lib/discordMember";
import { ownedItems } from "@/lib/ownedItems";
import { OWN_PURCHASE_QUERY, OWN_PURCHASE_FIELDS, PERK_ITEM_FIELDS } from "@/lib/itemPerks";
import { perksOfItems, discountedCost, pickCardSkin } from "@/lib/itemEffects";
import { buildEnhanceView } from "@/lib/enhance";

// ── [조회] 로그인한 유저 본인의 XP·레벨·순위 ──────────────────
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    await connectToDatabase();
    const doc = await UserXp.findOne({ userId: session.user.id }).lean();

    const xp = doc?.xp || 0;
    const level = doc?.level || 0;

    const now = new Date();
    const [above, total, heldRoles, buffCfgs, boostRows, myPurchases, itemsAll, shopItems, setting] = await Promise.all([
      UserXp.countDocuments({ xp: { $gt: xp } }),
      UserXp.countDocuments(),
      fetchMemberRoles(session.user.id),
      RoleConfig.find({ $or: [{ buffXp: { $gt: 0 } }, { attendBuffXp: { $gt: 0 } }] }, { roleId: 1, roleName: 1, buffXp: 1, attendBuffXp: 1 }).lean(),
      XpBoost.find({ startAt: { $lte: now }, endAt: { $gte: now } }, { name: 1, boostXp: 1, targetRoleId: 1, targetChannelId: 1 }).lean(),
      // 📌 보유 아이템 판정 재료 — 봇(bot/src/itemEffects.js)이 읽는 조건과 같게: 결제된 건(pending · completed), 기프트카드 · 소모된 건 제외
      //    (lib/itemPerks.js 와 같은 조건 — 상시 효과 · 배지도 이 판정으로 붙는다)
      Purchase.find(OWN_PURCHASE_QUERY(session.user.id), OWN_PURCHASE_FIELDS).lean(),
      Item.find({}, PERK_ITEM_FIELDS).sort({ sortOrder: 1, createdAt: 1 }).lean(),
      ShopItem.find({}, { itemId: 1 }).lean(),
      // 강화 정책 — 다음 단계 비용(할인 반영)을 여기서 함께 준다(app/api/xp/enhance 와 같은 값)
      BotSetting.findOne({ key: "main" }).lean(),
    ]);
    const owned = ownedItems({ purchases: myPurchases, items: itemsAll, shopItems, heldRoles });
    // 📌 상시 효과(강화 할인 · 캐시백 · 승급 빙옥 · 퀘스트 보상 …) · 프로필 배지 · 카드 스킨 — lib/itemPerks.js getPerks 와 같은 계산
    const perks = perksOfItems(owned);

    // 승급 보상 정산 — 봇이 레벨을 올리고, 그에 따른 POINT 는 사이트가 여기서 갚는다.
    //    pointTierPaid 조건부 갱신이라 몇 번을 불러도 한 번만 지급된다. 승급 빙옥 보너스(tierPointBonus)는 지급할 때 얹는다
    const tierGain = await settleTierPoints(session.user.id, level, { bonusPct: perks.tierPointBonus }).catch(() => 0);
    // 📌 획득 XP 계산 재료 — 봇 chatXp/voiceXp 의 가산 항목과 같은 것만 (채널 부스트는 채널마다 달라 뺀다)
    const held = new Set(heldRoles || []);
    const heldCfgs = buffCfgs.filter((c) => held.has(c.roleId));
    const buffs = heldCfgs.filter((c) => c.buffXp > 0).map((c) => ({ name: c.roleName || "역할", xp: c.buffXp }));
    // 출석 1회에만 붙는 역할 가산 (봇 getAttendBuffXp 와 같은 값) — 시뮬레이터 출석 줄이 읽는다
    let attendBuffXp = heldCfgs.reduce((s, c) => s + Math.max(0, Number(c.attendBuffXp) || 0), 0);
    // 📌 보유 아이템의 기본 효과 — 디스코드 역할과 무관하게 인벤토리에 가진 아이템(lib/ownedItems.js, 봇과 같은 판정).
    //    같은 아이템은 몇 번 사도 한 번. 역할 조회에 실패하면(null) 구매 건(A)만 본다. 조건 효과는 상황마다 달라 뺀다
    //    채팅 · 음성을 따로 정하므로 역할 버프(buffs — 둘 다에 붙는다)와 나눠 준다
    const itemBuffs = [];
    for (const it of owned) {
      if (it.type === "physical") continue;
      const chat = Math.max(0, Number(it.chatBuffXp) || 0);
      const voice = Math.max(0, Number(it.voiceBuffXp) || 0);
      if (chat > 0 || voice > 0) itemBuffs.push({ name: it.name || "아이템", chat, voice });
      attendBuffXp += Math.max(0, Number(it.attendBuffXp) || 0);
    }
    const boosts = boostRows
      .filter((b) => !b.targetChannelId && (!b.targetRoleId || held.has(b.targetRoleId)))
      .map((b) => ({ name: b.name || "부스트", xp: Math.max(0, Number(b.boostXp) || 0) }));

    const currentCum = getCumulativeXpByLevel(level);
    const nextCum = getCumulativeXpByLevel(level + 1);

    // 📌 다음 강화 비용(XP) — 강화 비용 할인(enhanceDiscount)을 반영한 값. 강화 API 가 실제로 빼는 값과 같다(빙옥은 이 값의 환산)
    const enh = buildEnhanceView(setting, doc);
    const enhanceNextCost = {
      chat: enh.chat.nextCost == null ? null : discountedCost(enh.chat.nextCost, perks.enhanceDiscount),
      voice: enh.voice.nextCost == null ? null : discountedCost(enh.voice.nextCost, perks.enhanceDiscount),
    };
    const { badges, cardSkin: _firstSkin, cardSkins, ...perkSums } = perks;
    // 📌 카드 스킨 — 유저가 인벤토리에서 고른 것(cardSkinPick), 안 골랐으면 관리자 순서상 첫 스킨, 끔이면 "" (봇 카드와 같은 규칙)
    const cardSkin = pickCardSkin(cardSkins, doc?.cardSkinPick || "");

    return NextResponse.json({
      success: true,
      data: {
        xp,
        level,
        rank: above + 1,
        total,
        point: (doc?.point || 0) + tierGain,
        // 이번 조회에서 새로 정산된 승급 보상 — 화면에서 알림으로 쓸 수 있다
        pointGain: tierGain,
        attendCount: doc?.attendCount || 0,
        // 통산 음성 참여 시간(초) — 시즌이 바뀌어도 이어진다
        voiceSeconds: doc?.voiceSeconds || 0,
        lastAttendDate: doc?.lastAttendDate || "",
        // 강화 단계(영구) — 레벨 페이지 강화 카드·시뮬레이터 기본값이 이 값을 읽는다 (lib/enhance.js)
        chatEnhance: Math.max(0, Math.floor(Number(doc?.chatEnhance) || 0)),
        voiceEnhance: Math.max(0, Math.floor(Number(doc?.voiceEnhance) || 0)),
        // 지금 내 역할 버프·부스트 — 채팅·음성 1회 지급에 더해지는 가산 (획득 XP 줄)
        buffXp: buffs.reduce((s, b) => s + b.xp, 0),
        buffs,
        // 보유 아이템의 기본 효과 — 채팅 1회당 · 음성 1회당 따로
        itemChatXp: itemBuffs.reduce((s, b) => s + b.chat, 0),
        itemVoiceXp: itemBuffs.reduce((s, b) => s + b.voice, 0),
        itemBuffs,
        attendBuffXp,
        boostXp: boosts.reduce((s, b) => s + b.xp, 0),
        boosts,
        // 상시 효과 합(상한 적용) — { enhanceDiscount, shopCashback, tierPointBonus, questBonus, passBoost, cooldownCut, muteRelief }
        perks: perkSums,
        // 강화 비용 할인 % 와 할인을 반영한 다음 단계 비용 { chat, voice } (최대 단계면 null) — 강화 창 비용 표시가 이 값을 쓴다
        enhanceDiscount: perks.enhanceDiscount,
        enhanceNextCost,
        // 프로필 배지(최대 3, 관리자 순서) [{ itemId, name, icon, imageUrl, color, type }] · 카드 스킨 키("" 이면 기본)
        badges,
        cardSkin,
        rolesSynced: heldRoles !== null,
        // 진행률 표시용: 현재 레벨 구간 내 진행 XP / 구간 총 XP
        levelProgress: {
          current: Math.max(0, xp - currentCum),
          required: Math.max(1, nextCum - currentCum),
          needToNext: Math.max(0, nextCum - xp),
        },
      },
    });
  } catch (e) {
    console.error("XP 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
