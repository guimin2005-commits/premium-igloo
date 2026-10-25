import mongoose from "mongoose";
import Payout from "@/models/Payout";
import Purchase from "@/models/Purchase";
import Item from "@/models/Item";
import ShopItem from "@/models/ShopItem";
import ShopLock from "@/models/ShopLock";
import RoleConfig from "@/models/RoleConfig";
import { addPoints } from "@/lib/points";
import { logWallet } from "@/lib/wallet";
import { unitThingSet } from "@/lib/unitSale";
import { timingOf } from "@/app/api/shop/_lib/renewal";
import { rewardLabel, rewardShort, MAX_REWARD_DAYS } from "@/lib/seasonPass";
import { HOLD_MESSAGE } from "@/lib/eventPass";
import { catalogFind, isDraftMode } from "@/lib/catalogDraft";
import { effectLinesOf, describeRoleBuff } from "@/lib/itemEffects";
import { cosmeticOf } from "@/lib/itemCosmetic";
import { resolveCategory, shortNameOf } from "@/lib/itemCategory";
import { itemTypeLabel } from "@/lib/items";
import { channelNamesFor } from "@/lib/channelNames";
import { normalizeRarity } from "@/lib/rarity";

// 📌 단계 보상 지급 · 수령 · 보상 칸 표기 재료의 일반판 — lib/eventPass.js 의 grantEventReward · claimTier · computeState 보상 칸(229-258 · 287-315)을 표식만 받아 쓰게 옮겼다.
//    첫 사용처: 친구 초대 누적 보상(lib/invite.js — 2026-10-25). 이벤트 패스는 진행 중(11.5까지)이라 그 파일은 손대지 않고 그대로 둔다 —
//    ⚠️ 바꾸면 같이: lib/eventPass.js(지급 길 · 자물쇠 순서 · 보상 칸 재료) · lib/seasonPass.js takeShopLock · planTimedItem.
//    표식(marks) — 「어디서 받은 보상인가」를 남기는 글자 세 벌. 새 사용처는 아래 글자를 전부 등록해야 한다(약속 문서 「Marker strings」):
//      source    : XP Payout.source — lib/season.js PASS_NEUTRAL_SOURCES · 봇 grantQueue PASS_NEUTRAL · STOP_BLOCKED · 봇 views/pass.js · 내역 줄 이름(my-logs · ledger · adminEconomy)
//      itemId    : 역할 · 아이템 Purchase.itemId — lib/inventory.js srcOf · 관리 › 유저 인벤토리 FREE_IDS · 인벤토리 보조 글자
//      pointKind : 빙옥 WalletLog.kind(claimRewardSet 인자) — lib/adminEconomy.js POINT_LABEL
//    받은 칸 이름(cell)은 Payout.reason · Purchase.passCell · 역할 이름 꼬리에 쓴다(이벤트 패스와 같은 자리)

// 지급 순간 실사이트에 없는 아이템 — grantRewardAs 가 이 표시를 달아 던진다(claimRewardSet 이 HOLD_MESSAGE 로 바꾼다)
export const REWARD_NOT_LIVE = "REWARD_ITEM_NOT_LIVE";
const NUM_MAX = 1_000_000_000_000;
const num = (v, { min = 0, max = NUM_MAX } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
};

export const isDup = (e) =>
  e?.code === 11000 ||
  (Array.isArray(e?.writeErrors) && e.writeErrors.length > 0 && e.writeErrors.every((w) => (w?.code ?? w?.err?.code) === 11000));
export const refusal = (status, error) => ({ ok: false, status, error });
// 실사이트에 없는 아이템 때문에 못 받음 — 단계는 쓰지 않은 채(자물쇠를 푼 채) 거절한다. hold 로 다른 거절과 가른다
export const holdRefusal = () => ({ ...refusal(409, HOLD_MESSAGE), hold: true });

// ── 아이템 보상 상태 ─────────────────────────────────
export const itemIdsIn = (rewards) =>
  [...new Set((Array.isArray(rewards) ? rewards : []).filter((r) => r?.kind === "item").map((r) => String(r.itemId || "")))];

// 실사이트 Item 에 없는 아이템 보상 id — 수령 직전 확인(자물쇠를 잡은 뒤 한 번 더 묻는다 — claimRewardSet). lib/eventPass.js notLiveItemIds 와 같다
export async function notLiveItemIds(rewards) {
  const ids = itemIdsIn(rewards);
  if (!ids.length) return [];
  const valid = ids.filter((v) => mongoose.isValidObjectId(v));
  const live = valid.length ? await Item.find({ _id: { $in: valid } }, { _id: 1 }).lean() : [];
  const have = new Set(live.map((d) => String(d._id)));
  return ids.filter((id) => !have.has(id));
}

// ── 지급 ─────────────────────────────────────────

// 📌 상점 결제 자물쇠를 잠깐 기다렸다 잡는다 — lib/seasonPass.js · lib/eventPass.js takeShopLock 과 같은 규칙(바꾸면 같이)
async function takeShopLock(userId, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const lock = await ShopLock.acquire(userId);
    if (lock) return lock;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

// 📌 기간제 아이템 보상의 기보유 판정 — lib/seasonPass.js · lib/eventPass.js planTimedItem 과 같은 규칙(바꾸면 같이).
//    ×N 아이템은 늘 새로 · 무기한 보유면 { block } · 전부 기간제면 { renew } 가장 늦은 끝에 이어 붙임 · 보유 없음 {}
async function planTimedItem(userId, item) {
  const itemId = String(item._id);
  const shops = await ShopItem.find({ itemId }, { type: 1, roleId: 1, itemId: 1, unitSale: 1, durations: 1 }).lean();
  if (unitThingSet(shops, [item]).has(`i:${itemId}`)) return {};
  const shopIds = shops.map((s) => String(s._id));
  const live = await Purchase.find(
    {
      userId,
      status: { $in: ["pending", "completed"] },
      consumedAt: null,
      $and: [
        { $or: [{ itemRef: itemId }, ...(shopIds.length ? [{ itemId: { $in: shopIds } }] : [])] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      ],
    },
    { expiresAt: 1 }
  ).lean();
  if (!live.length) return {};
  const forever = live.find((p) => !p.expiresAt);
  if (forever) return { block: forever };
  return { renew: live.reduce((a, b) => (new Date(b.expiresAt).getTime() > new Date(a.expiresAt).getTime() ? b : a)) };
}

// 📌 보상 하나 지급 — lib/eventPass.js grantEventReward 와 같은 길, 표식만 marks 로 받는다({ source, itemId }):
//    xp   : Payout 대기열(source — 봇이 지급 + 레벨 재계산 + 역할 동기화, 기준선도 같이 올린다)
//    point: addPoints 로 바로(원장은 수령이 한 줄로 — claimRewardSet)
//    role : Purchase 대기열(itemId 표식) — 봇이 역할을 붙인다
//    item : Purchase(itemRef) — days > 0 이면 상점 기간제와 같은 연장 · 1인 1개(planTimedItem · timingOf)
//    cell — 받은 칸 이름("친구 초대 3명"). Payout.reason · Purchase.passCell · 역할 이름 꼬리에 쓴다
export async function grantRewardAs(marks, userId, reward, cell, userName = "") {
  const kind = reward?.kind;
  const amount = num(reward?.amount);
  const result = { kind: kind || "none", amount, label: cell, queued: false, point: null };

  if (kind === "xp") {
    await Payout.create({ userName: userName || userId, userId, amount, reason: cell, source: marks.source });
    result.queued = true;
    return result;
  }

  if (kind === "point") {
    const doc = await addPoints(userId, amount);
    result.point = doc?.point ?? null;
    return result;
  }

  if (kind === "role") {
    await Purchase.create({
      userId,
      userName,
      itemId: marks.itemId,
      // itemName 이 인벤토리 카드 · 봇 로그 · DM 에 그대로 찍힌다 — 역할 이름을 앞에 둔다(시즌 · 이벤트 패스와 같은 모양)
      itemName: `${reward.roleName || "역할"} (${cell})`,
      passCell: cell,
      itemType: "role",
      roleId: reward.roleId,
      price: 0,
      payMethod: "xp",
      paidXp: 0,
      paidPoint: 0,
      days: 0,
      status: "pending",
    });
    result.queued = true;
    return result;
  }

  if (kind === "item") {
    // 📌 지급은 늘 실사이트 Item — 초안에만 있는(반영 전) 아이템은 주지 않는다
    const item = await Item.findById(reward.itemId).lean().catch(() => null);
    // 아이템이 없으면 던진다 — 이 보상만 못 받은 것으로 남겨, 반영하거나 관리자가 고친 뒤 다시 받을 수 있게
    if (!item) throw Object.assign(new Error(`아이템 보상을 찾을 수 없습니다: ${reward.itemId}`), { code: REWARD_NOT_LIVE });
    const hasRole = !!item.roleId;
    const days = item.type === "physical" ? 0 : num(reward?.days, { max: MAX_REWARD_DAYS });
    let timing = { renewOf: "", startsAt: null, expiresAt: null };
    let lock = null;
    try {
      if (days > 0) {
        lock = await takeShopLock(userId);
        if (!lock) throw new Error(`처리 중인 결제가 있어 기간제 아이템 보상을 지급하지 못했습니다: ${reward.itemId}`);
        const plan = await planTimedItem(userId, item);
        if (plan.block) {
          // 이미 무기한으로 가졌다 — 만들지 않고 받은 것으로 친다
          result.kept = true;
          return result;
        }
        timing = timingOf(plan, days);
      }
      await Purchase.create({
        userId,
        userName,
        itemId: marks.itemId,
        itemRef: String(item._id),
        itemName: item.name,
        passCell: cell,
        itemType: item.type,
        roleId: item.roleId || "",
        price: 0,
        payMethod: "xp",
        paidXp: 0,
        paidPoint: 0,
        days,
        expiresAt: timing.expiresAt,
        renewOf: timing.renewOf,
        startsAt: timing.startsAt,
        status: hasRole ? "pending" : "completed",
        processedAt: hasRole ? undefined : new Date(),
      });
    } finally {
      if (lock) await ShopLock.release(lock);
    }
    result.queued = hasRole;
    result.renewed = !!timing.renewOf;
    return result;
  }

  return result;
}

// ── 수령 ─────────────────────────────────────────

// 📌 보상 묶음(단계) 하나 받기 — lib/eventPass.js claimTier 와 같은 순서(바꾸면 같이):
//    1) 단계 줄을 넣는다(자물쇠 — Claim 의 { ...base, kind, ref } 유니크라 동시에 눌러도 한 요청만)
//    2) 자물쇠를 잡은 뒤의 부분 수령 표시로 남은 보상만 고른다
//    2-1) 남은 보상에 실사이트에 없는 아이템(반영 전 · 지워짐)이 있으면 아무것도 주지 않고 자물쇠를 푼다(holdRefusal)
//    3) 보상마다 따로 지급(하나가 실패해도 나머지는 준다)
//    4) 다 줬으면 부분 표시를 치운다 · 하나도 못 줬으면 단계 줄을 지운다(처음과 같다) ·
//       일부만 줬으면 받은 보상을 부분 표시로 먼저 적고 나서 단계 줄을 지운다(이 순서여야 푸는 순간 다른 요청이 받은 것을 또 주지 않는다).
//       적기에 실패하면 자물쇠를 그대로 둔다 — 남은 보상을 못 받는 쪽이 같은 보상을 두 번 주는 쪽보다 낫다(운영진이 수동 지급)
//    5) 빙옥은 이번 수령분 합계를 원장 한 줄로(pointKind · refId)
//    인자 — Claim(모델: userId · kind · ref + base 칸 유니크) · ensureIndexes(쓰기 직전 인덱스 — 없으면 건너뜀) · base(그 묶음을 가르는 칸 — { userId, eventKey })
//           ref(tid) · level · rewards · keys(lib/seasonPass rewardKeys) · cell · marks · pointKind · refId · tag(로그 머리말)
//    반환 { ok: true, ref, labels, partial } · { ok: false, status, error, hold? }
export async function claimRewardSet({ Claim, ensureIndexes, base, ref, level = 0, rewards, keys, cell, marks, pointKind, refId = "", userId, userName = "", tag = "reward" }) {
  if (ensureIndexes) await ensureIndexes();
  try {
    await Claim.create({ ...base, kind: "tier", ref, level });
  } catch (e) {
    if (isDup(e)) return refusal(409, "이미 받았습니다.");
    throw e;
  }
  const done = new Set((await Claim.find({ ...base, kind: "part", ref: { $in: keys } }, { _id: 0, ref: 1 }).lean()).map((p) => String(p.ref)));
  const clearParts = () => (done.size ? Claim.deleteMany({ ...base, kind: "part", ref: { $in: [...done] } }).catch(() => {}) : null);
  const todo = rewards.map((r, j) => ({ r, key: keys[j] })).filter((x) => !done.has(x.key));
  if (!todo.length) {
    await clearParts();
    return refusal(409, "이미 받았습니다.");
  }
  const unlock = () => Claim.deleteOne({ ...base, kind: "tier", ref });
  // 📌 보류 · 실패로 자물쇠를 풀 때 — 풀기마저 실패하면 그 단계가 받은 것처럼 잠긴다(지급 0). 조용히 삼키지 않고 남겨 수동으로 확인하게
  const unlockQuiet = () => unlock().catch((e) => console.error(`[${tag}] 자물쇠 해제 실패 — 수동 확인 필요`, { ...base, ref, err: e?.message }));
  // 2-1) 자물쇠를 잡은 뒤에 다시 묻는다 — 조회와 이 사이에 반영 · 삭제가 있었어도 지금 값으로 가른다. 묻다가 실패해도 자물쇠를 푼다
  let notLive;
  try {
    notLive = await notLiveItemIds(todo.map((x) => x.r));
  } catch (e) {
    await unlockQuiet();
    throw e;
  }
  if (notLive.length) {
    await unlockQuiet();
    return holdRefusal();
  }

  const granted = [];
  const failed = [];
  for (const x of todo) {
    try {
      granted.push({ ...x, g: await grantRewardAs(marks, userId, x.r, cell, userName) });
    } catch (e) {
      console.error(`[${tag}] 보상 지급 실패 (${userId} ${ref} ${x.key}):`, e);
      failed.push({ ...x, hold: e?.code === REWARD_NOT_LIVE });
    }
  }

  if (!failed.length) {
    await clearParts();
    await Claim.updateOne({ ...base, kind: "tier", ref }, { $set: { labels: granted.map((x) => rewardLabel(x.r)) } }).catch(() => {});
  } else if (!granted.length) {
    await unlockQuiet();
  } else {
    try {
      await Claim.insertMany(
        granted.map((x) => ({ ...base, kind: "part", ref: x.key, level, labels: [rewardLabel(x.r)] })),
        { ordered: false }
      ).catch((e) => {
        if (!isDup(e)) throw e;
      });
      await unlock();
    } catch (e) {
      console.error(`[${tag}] 부분 수령 기록 실패 — 자물쇠 유지 (${userId} ${ref}):`, e);
    }
  }
  // 하나도 못 줬다 — 확인과 지급 사이에 아이템이 빠진 것뿐이면 같은 거절(holdRefusal), 아니면 오류
  if (!granted.length) return failed.every((x) => x.hold) ? holdRefusal() : refusal(500, "수령 중 오류가 발생했습니다.");

  // 📌 빙옥 보상은 잔액에 바로 들어가고 Payout 이 없다 — 원장에 이번 수령분 합계 한 줄(이벤트 패스 claimTier 와 같다 · 종류만 사용처 것)
  const pointSum = granted.reduce((s, x) => s + (x.g.kind === "point" ? x.g.amount : 0), 0);
  if (pointSum > 0 && pointKind) {
    await logWallet({ userId, currency: "point", amount: pointSum, kind: pointKind, label: cell, refId });
  }
  return { ok: true, ref, labels: granted.map((x) => rewardLabel(x.r)), partial: failed.length > 0 };
}

// ── 보상 칸 표기 재료 ───────────────────────────────
// 📌 lib/eventPass.js computeState 의 보상 칸(229-258 · 287-315)과 같은 재료 — 바꾸면 같이.
//    효과 문장 = 인벤토리 · 상점과 같은 effectLinesOf(lib/itemEffects) — 꾸미기 효과는 거기서 빠지고 분류 칩(categoryLabel) · 「미리보기」(cosmetic)가 말한다.
//    역할(역할 보상 · 역할이 붙은 아이템)은 역할 버프(RoleConfig — describeRoleBuff)를 덧붙인다.
//    📌 표시만 초안을 덧씌운다(lib/catalogDraft catalogFind). 지급은 늘 실사이트(grantRewardAs — Item.findById)
//    rewardLists — 보상 목록들(단계마다 free). detail — 역할 버프 · 채널 이름까지 읽는다(상태 판정만 할 때는 끈다)
//    반환 { viewOf(r, claimed) → RewardView, isLive(itemId) → 실사이트에 있나(hold 판정) }
//    RewardView = { kind, amount, itemId, name, categoryLabel, itemType, rarity, days, icon, imageUrl, color, effectLines, cosmetic, desc, label, claimed }
//      name — 짧은 이름(아이템: 머리말 뗀 이름 · 역할: 역할 이름 · xp/point: rewardShort 「1,000 XP」 「300 빙옥」)
//      categoryLabel — 상점 칩과 같은 분류(xp/point 는 "") · rarity — lib/rarity.js 키("" = 일반) · cosmetic — 꾸미기 미리보기 재료 | null
//      desc — 효과 문장 · 꾸미기가 없을 때만 아이템 설명(없으면 "") · label — rewardLabel(감사 · 알림용) · claimed — 이 보상을 받았나(부분 수령 표시)
export async function rewardViewsLoader(rewardLists, { detail = true } = {}) {
  const all = (Array.isArray(rewardLists) ? rewardLists : []).flat().filter(Boolean);
  // ObjectId 가 아닌 값(손으로 고친 문서)은 묻지 않는다 — 캐스팅 오류로 조회 전체가 500 이 되지 않게(그 칸은 아이콘 없이 그려진다)
  const itemIds = [...new Set(all.filter((r) => r.kind === "item").map((r) => String(r.itemId || "")).filter((v) => mongoose.isValidObjectId(v)))];
  // 📌 초안 모드면 실사이트에 있는지를 따로 묻는다(덧씌운 목록엔 반영 전 아이템도 들어 있다) — isLive
  const [itemDocs, liveDocs] = await Promise.all([
    itemIds.length
      ? catalogFind(Item, { _id: { $in: itemIds } }, {
          select: { name: 1, type: 1, category: 1, icon: 1, imageUrl: 1, color: 1, roleId: 1, description: 1, effects: 1, effectText: 1, chatBuffXp: 1, voiceBuffXp: 1, attendBuffXp: 1, rarity: 1 },
        })
      : [],
    itemIds.length && isDraftMode() ? Item.find({ _id: { $in: itemIds } }, { _id: 1 }).lean() : null,
  ]);
  const itemById = new Map(itemDocs.map((d) => [String(d._id), d]));
  const liveIds = new Set((liveDocs ?? itemDocs).map((d) => String(d._id)));
  // 말풍선 재료 — 역할 버프 · 채널 하나만 지정한 효과의 채널 이름. 읽기 실패는 문장만 빠진다(상태 · 수령은 그대로)
  const roleIds = detail
    ? [...new Set([...all.filter((r) => r.kind === "role").map((r) => r.roleId), ...itemDocs.map((d) => d.roleId)].filter(Boolean).map(String))]
    : [];
  const [roleCfgs, chNames] = detail
    ? await Promise.all([
        roleIds.length ? RoleConfig.find({ roleId: { $in: roleIds } }, { _id: 0, roleId: 1, buffXp: 1, attendBuffXp: 1 }).lean().catch(() => []) : [],
        channelNamesFor(itemDocs.map((d) => d.effects)).catch(() => new Map()),
      ])
    : [[], new Map()];
  const roleCfgOf = new Map(roleCfgs.map((c) => [String(c.roleId), c]));
  const chName = (id) => chNames.get(String(id));
  const buffOf = (roleId) => (roleId && roleCfgOf.has(String(roleId)) ? describeRoleBuff(roleCfgOf.get(String(roleId))) : []);

  const viewOf = (r, claimed = false) => {
    const item = r.kind === "item" ? itemById.get(String(r.itemId || "")) : null;
    const cosmetic = item ? cosmeticOf(item) : null;
    const effectLines = item ? [...effectLinesOf(item, chName), ...buffOf(item.roleId)] : r.kind === "role" ? buffOf(r.roleId) : [];
    const name =
      r.kind === "item"
        ? shortNameOf(item?.name || r.itemName || "") || itemTypeLabel(item?.type)
        : r.kind === "role"
          ? r.roleName || "역할"
          : rewardShort(r);
    return {
      kind: r.kind,
      amount: r.amount,
      itemId: r.itemId,
      name,
      categoryLabel: r.kind === "item" ? resolveCategory(item || { name: r.itemName, type: "item" }) : r.kind === "role" ? itemTypeLabel("role") : "",
      itemType: item?.type || (r.kind === "role" ? "role" : ""),
      rarity: item ? normalizeRarity(item.rarity) : "",
      days: r.kind === "item" ? r.days : 0,
      icon: item?.icon || "",
      imageUrl: item?.imageUrl || "",
      color: item?.color || "",
      effectLines,
      cosmetic: cosmetic || null,
      desc: !effectLines.length && !cosmetic && item?.description ? String(item.description) : "",
      label: rewardLabel(r),
      claimed: !!claimed,
    };
  };
  return { viewOf, isLive: (id) => liveIds.has(String(id || "")) };
}
