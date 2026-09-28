import SeasonPass from "@/models/SeasonPass";
import UserXp from "@/models/UserXp";
import Payout from "@/models/Payout";
import Purchase from "@/models/Purchase";
import Item from "@/models/Item";
import XpLog from "@/models/XpLog";
import { addPoints } from "@/lib/points";
import { xpToPoint } from "@/lib/pointRate";
import { SEASON } from "@/lib/season";
import { fetchGuildMember } from "@/lib/discordMember";

// 📌 시즌 패스 계산의 단일 진실 — 조회(GET)와 수령(POST)이 반드시 이 함수를 함께 쓴다.
//    클라이언트가 보낸 진행도·해금 상태는 절대 믿지 않는다 (lib/quests.js 의 getQuestState 와 같은 원칙).
//    ⚠️ 봇 /시즌패스(bot/src/views/pass.js)에 이 파일의 사본이 있다 — 티어 정리 · 라벨 · 부스터 판정을 바꾸면 거기도 같이.

export const REWARD_KINDS = ["none", "xp", "point", "role", "item"];
export const DEFAULT_UNLOCK_PRICE = 50000;
// 설정 문서 하나에 티어가 무한정 쌓이지 않게 상한을 둔다
export const MAX_TIERS = 100;
// 한 티어 · 한 트랙에 넣을 수 있는 보상 수 — 유저 창의 칩 줄과 관리자 편집 칸이 이 수에 맞춰져 있다
export const MAX_REWARDS = 4;

const num = (v, { min = 0, max = 1_000_000_000 } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
};

// 보상 라벨 — 서버가 만들어 보낸다. 화면마다 다르게 쓰면 표기가 갈라지므로 한 곳에서 찍는다.
export const rewardLabel = (r) => {
  const amount = num(r?.amount);
  if (r?.kind === "xp") return amount > 0 ? `XP ${amount.toLocaleString("ko-KR")}` : "-";
  if (r?.kind === "point") return amount > 0 ? `빙옥 ${amount.toLocaleString("ko-KR")}` : "-";
  if (r?.kind === "role") return r?.roleId ? `역할 · ${r.roleName || "역할"}` : "-";
  if (r?.kind === "item") return r?.itemId ? `아이템 · ${r.itemName || "아이템"}` : "-";
  return "-";
};

// 짧은 라벨 — 칩 · 봇 "다음 보상" 처럼 좁은 자리용. 종류는 아이콘이 말해 주므로 값만 남긴다
export const rewardShort = (r) => {
  const amount = num(r?.amount);
  if (r?.kind === "xp") return `${amount.toLocaleString("ko-KR")} XP`;
  if (r?.kind === "point") return `${amount.toLocaleString("ko-KR")} 빙옥`;
  if (r?.kind === "role") return r?.roleName || "역할";
  if (r?.kind === "item") return r?.itemName || "아이템";
  return "-";
};

// 빈 칸 — 지급할 게 없는 보상은 전부 이 모양으로 눕혀서 claimable 판정을 단순하게 만든다
const blankReward = () => ({ kind: "none", amount: 0, roleId: "", roleName: "", itemId: "", itemName: "" });

const normalizeReward = (r) => {
  const kind = REWARD_KINDS.includes(r?.kind) ? r.kind : "none";
  if (kind === "role") {
    const roleId = String(r?.roleId || "").trim();
    // 지급할 역할이 없으면 보상이 아니다 — 빈 칸으로 되돌려 수령 버튼이 뜨지 않게 한다
    if (!roleId) return blankReward();
    return { kind, amount: 0, roleId, roleName: String(r?.roleName || "").trim(), itemId: "", itemName: "" };
  }
  if (kind === "item") {
    const itemId = String(r?.itemId || "").trim();
    if (!itemId) return blankReward();
    return { kind, amount: 0, roleId: "", roleName: "", itemId, itemName: String(r?.itemName || "").trim() };
  }
  if (kind === "xp" || kind === "point") {
    const amount = num(r?.amount);
    if (amount <= 0) return blankReward();
    return { kind, amount, roleId: "", roleName: "", itemId: "", itemName: "" };
  }
  return blankReward();
};

// 한 칸(트랙)의 보상 목록 — 빈 보상은 빼고 앞에서부터 MAX_REWARDS 개.
// 📌 옛 문서는 칸이 보상 객체 하나였다 — 객체면 [객체] 로 읽는다(none 이면 normalizeReward 가 눕혀 빠진다)
export const rewardsOf = (v) => {
  const list = Array.isArray(v) ? v : v && typeof v === "object" ? [v] : [];
  return list.map(normalizeReward).filter((r) => r.kind !== "none").slice(0, MAX_REWARDS);
};

// 📌 보상 하나의 부분 수령 표시 — "t3#item:<id>" · "t3#xp:1000"(같은 칸에 같은 보상이 또 있으면 "~2").
//    수령 기록(passClaimed*)에는 보통 칸 전체를 받았다는 tid 하나만 남는다. 지급 도중 일부가 실패했을 때만
//    받은 보상을 이 키로 따로 적고 tid 를 풀어, 다시 받기가 남은 보상만 주게 한다(app/api/pass/claim).
//    인덱스가 아니라 보상 내용으로 짓는다 — 그 사이 관리자가 순서를 바꿔도 받은 보상을 다시 주지 않는다.
export function rewardKeys(tid, list) {
  const seen = new Map();
  return list.map((r) => {
    const base = `${r.kind}:${r.kind === "item" ? r.itemId : r.kind === "role" ? r.roleId : num(r.amount)}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return `${tid}#${base}${n > 1 ? `~${n}` : ""}`;
  });
}

// 📌 서버 부스터 판정 — lib/authOptions.js 의 세션 판정과 같은 규칙: 부스터 역할(DISCORD_BOOSTER_ROLE_ID) 또는 premium_since.
//    봇(bot/src/views/pass.js)도 같은 규칙으로 본다.
export const isBoosterMember = (member) => {
  const roleId = process.env.DISCORD_BOOSTER_ROLE_ID;
  const roles = Array.isArray(member?.roles) ? member.roles : [];
  return (roleId ? roles.includes(roleId) : false) || !!member?.premium_since;
};

// 세션의 isBooster 는 최대 10분 묵은 값이라 쓰지 않고 멤버 조회 캐시(lib/discordMember.js · 60초)를 직접 본다.
//    반환: true | false | null(확인 못 함 — 디스코드 장애이고 받아 둔 값도 없음). null 은 부스터가 아닌 쪽으로 다룬다.
export async function checkServerBooster(userId) {
  if (!userId) return false;
  try {
    const r = await fetchGuildMember(userId);
    if (r.status === "ok") return isBoosterMember(r.member);
    if (r.status === "absent") return false;
    return null;
  } catch {
    return null;
  }
}

// need 오름차순 정렬 → level 1..N 재부여. 음수/NaN·잘못된 kind 는 여기서 전부 걸러진다.
// 📌 tid 는 여기서만 발급하고, 한 번 붙은 tid 는 무슨 일이 있어도 바꾸지 않는다 —
//    수령 기록(UserXp.passClaimed*)이 tid 로 남아 있어서, 바뀌면 유저가 같은 보상을 다시 받는다.
//    반환값은 { tiers, nextTid } — 호출부가 nextTid 도 함께 저장해야 번호가 재사용되지 않는다.
export function normalizeTiers(tiers, startTid = 1) {
  const rows = Array.isArray(tiers) ? tiers : [];
  const kept = rows.slice(0, MAX_TIERS);

  // 이미 쓰이고 있는 tid 를 먼저 모아 둔다 — 저장된 nextTid 가 뒤처져 있어도
  // 살아 있는 tid 를 다시 발급하지 않게 하려는 방어.
  // 아울러 살아 있는 tid 의 번호 최댓값도 구해 카운터를 그 위로 끌어올린다.
  // 저장된 nextTid 가 뒤처진 상태(예: tid 는 다 있는데 nextTid 가 1)에서 티어를 지웠다가
  // 추가하면 지운 tid 가 그대로 재발급되고, 그 티어를 받았던 유저 전원이
  // 새 티어를 "수령완료"로 잠긴 채 보게 된다. used 셋은 살아 있는 것만 막으므로 부족하다.
  const used = new Set();
  let maxUsed = 0;
  for (const t of kept) {
    const tid = String(t?.tid || "").trim();
    if (!tid) continue;
    used.add(tid);
    const m = /^t(\d+)$/.exec(tid);
    if (m) maxUsed = Math.max(maxUsed, Number(m[1]));
  }
  let nextTid = Math.max(1, Math.floor(Number(startTid) || 1), maxUsed + 1);
  const allocTid = () => {
    let tid = `t${nextTid++}`;
    while (used.has(tid)) tid = `t${nextTid++}`;
    used.add(tid);
    return tid;
  };

  // 중복 tid 는 뒤엣것에 새 번호를 준다 (앞엣것이 원래 주인 — 수령 기록은 그쪽에 붙어 있다)
  const seen = new Set();
  return {
    tiers: kept
      .map((t) => {
        let tid = String(t?.tid || "").trim();
        if (!tid || seen.has(tid)) tid = allocTid();
        seen.add(tid);
        return { tid, need: num(t?.need), free: rewardsOf(t?.free), paid: rewardsOf(t?.paid) };
      })
      .sort((a, b) => a.need - b.need)
      .map((t, i) => ({ tid: t.tid, level: i + 1, need: t.need, free: t.free, paid: t.paid })),
    nextTid,
  };
}

// 📌 시즌 시작 시점 기준선을 거꾸로 계산한다 — 조회 시점 xp 로 찍으면 첫 방문 전에 번 XP 가 진행도에서 빠진다.
//    기준선 = 지금 xp − (시즌 시작 뒤 봇 지급 로그 + 시즌 시작 뒤 지급된 XP 대기열 · 패스 보상 제외).
//    상점 · 강화 · 해금 결제는 기준선도 같은 폭으로 내리고 패스 XP 보상은 같은 폭으로 올리므로 이 식과 맞는다.
//    XpLog 는 60일 TTL 이라 그보다 오래된 몫은 빠진다 — 그만큼 기준선이 높게(진행도가 적게) 잡힐 뿐 넘치지 않는다.
//    📌 세는 구간 = 시즌 시작과 지금 문서가 생긴 시각(_id) 중 늦은 쪽부터. 퇴장 초기화(봇 leaveReset)는 UserXp 만 지우고
//       XpLog · Payout 은 남기므로, 지운 문서 시절 로그까지 세면 재입장한 새 문서의 진행도가 되살아나 받은 티어를 다시 받는다.
//       ObjectId 시각은 초 단위 내림이고 봇은 upsert 뒤에 로그를 남기므로, 새 문서를 만든 그 지급 로그도 빠지지 않는다.
//    ⚠️ 봇 사본(bot/src/views/pass.js seasonStartBaseXp)과 같아야 한다.
async function seasonStartBaseXp(userId, xp, docId) {
  const seasonStart = new Date(`${SEASON.start}T00:00:00+09:00`).getTime();
  const born = docId?.getTimestamp?.()?.getTime?.() || 0;
  const since = new Date(Math.max(seasonStart, born));
  const [logs, pays] = await Promise.all([
    XpLog.aggregate([
      { $match: { userId, createdAt: { $gte: since } } },
      // 📌 패스 가속(아이템 효과 passBoost)으로 더 오른 진행도도 이번 시즌에 번 것으로 친다
      { $group: { _id: null, s: { $sum: { $add: ["$amount", { $ifNull: ["$passBoost", 0] }] } } } },
    ]),
    Payout.aggregate([
      { $match: { userId, status: "paid", currency: { $ne: "point" }, source: { $ne: "pass" }, paidAt: { $gte: since } } },
      { $group: { _id: null, s: { $sum: "$amount" } } },
    ]),
  ]);
  const earned = (Number(logs[0]?.s) || 0) + (Number(pays[0]?.s) || 0);
  // 가속분이 있으면 기준선이 0 아래일 수 있다 — 잘라 내면 가속으로 오른 진행도가 사라진다
  return Math.min(xp, xp - earned);
}

export const seasonInfo = () => ({
  number: SEASON.number,
  name: SEASON.name,
  start: SEASON.start,
  end: SEASON.end,
});

// 📌 시즌 패스 상태 — 계약(GET /api/pass)의 응답 본문을 그대로 만든다.
export async function getPassState(userId) {
  const [cfg, user] = await Promise.all([
    SeasonPass.findOne({ key: "main" }).lean(),
    UserXp.findOne(
      { userId },
      // _id — 문서가 생긴 시각(퇴장 초기화 뒤 재입장 판별)을 기준선 계산에 쓴다
      { _id: 1, xp: 1, passSeason: 1, passBaseXp: 1, passUnlocked: 1, passClaimedFree: 1, passClaimedPaid: 1 }
    ).lean(),
  ]);

  const enabled = !!cfg?.enabled;
  const unlockPrice = cfg?.unlockPrice == null ? DEFAULT_UNLOCK_PRICE : num(cfg.unlockPrice);
  // 저장된 nextTid 를 넘겨야, tid 가 아직 없는 옛 설정을 읽을 때도 관리자 화면이 저장하며 붙일 번호와 같아진다
  const { tiers } = normalizeTiers(cfg?.tiers, cfg?.nextTid);

  const xp = user?.xp || 0;
  let baseXp = user?.passBaseXp || 0;
  let unlocked = !!user?.passUnlocked;
  let claimedFree = Array.isArray(user?.passClaimedFree) ? user.passClaimedFree : [];
  let claimedPaid = Array.isArray(user?.passClaimedPaid) ? user.passClaimedPaid : [];

  // 📌 시즌 롤오버 — 조회 시점에 게으르게 다시 스냅샷한다 (배치 작업 없이 자연히 넘어가게).
  //    조건에 방금 읽은 시즌 값을 넣어, 동시에 들어온 요청 두 개가 두 번 찍지 않게 막는다.
  //    기존 유저 문서에는 passSeason 필드 자체가 없으므로 null 도 함께 받는다.
  //    ⚠️ 여기서 문서를 만들면 안 된다. 조회만 하는 경로라 디스코드에서 XP 를 한 번도 얻은 적 없는
  //       유저가 페이지를 열기만 해도 xp 0 문서가 생겨 랭킹 인원이 늘어난다(전체 탭은 필터가 없다).
  //       문서가 없는 유저의 수령은 claim 라우트가 그 자리에서 만들어 처리한다.
  const seen = user?.passSeason || 0;
  if (user && seen !== SEASON.number) {
    // 기준선은 조회 시점 xp 가 아니라 시즌 시작 시점으로 되짚은 값 — 늦게 들어와도 시즌 동안 번 XP 가 진행도에 들어간다
    const startBase = await seasonStartBaseXp(userId, xp, user._id);
    // ⚠️ 강화 단계(chatEnhance/voiceEnhance)는 영구 값이라 이 시즌 스냅샷 $set 에 넣지 않는다 (lib/enhance.js)
    await UserXp.updateOne(
      { userId, ...(seen ? { passSeason: seen } : { passSeason: { $in: [null, 0] } }) },
      {
        $set: {
          passSeason: SEASON.number,
          passBaseXp: startBase,
          passUnlocked: false,
          passUnlockPaid: { method: "", amount: 0 },
          passClaimedFree: [],
          passClaimedPaid: [],
          updatedAt: new Date(),
        },
      },
    ).catch((e) => {
      // 경합 — 다른 요청이 먼저 문서를 만들면 unique(userId) 에 걸린다.
      // 원하던 상태는 이미 그쪽이 만들어 놨으므로 삼킨다.
      if (e?.code !== 11000) throw e;
    });
    baseXp = startBase;
    unlocked = false;
    claimedFree = [];
    claimedPaid = [];
  }

  // 📌 프리미엄 — 산 사람(passUnlocked) 또는 지금 부스팅 중인 서버 부스터.
  //    산 사람은 부스트와 무관하게 유지하고, 부스터는 부스트를 멈추면 그 뒤로 프리미엄 수령이 잠긴다(받은 것은 그대로).
  //    산 사람은 디스코드에 물을 필요가 없다 — 60초 캐시라도 조회를 아낀다. 패스가 꺼져 있으면 묻지 않는다.
  const purchased = unlocked;
  const booster = !purchased && enabled ? await checkServerBooster(userId) : false;
  const premiumBy = purchased ? "purchase" : booster === true ? "booster" : null;
  unlocked = !!premiumBy;

  // 진행도는 음수가 될 수 있다 — XP 를 상점에서 쓰면 passBaseXp 도 같이 내려가므로 0 아래로는 잘라 쓴다
  const progress = Math.max(0, xp - baseXp);
  // 수령 판정은 tid 로 한다 (인덱스로 하면 티어를 중간에 끼워 넣을 때 기록이 통째로 밀린다)
  const freeSet = new Set(claimedFree.map(String));
  const paidSet = new Set(claimedPaid.map(String));

  // 아이템 보상은 등록된 아이콘·색을 칸에 함께 실어 보낸다 (이름은 저장된 스냅샷을 쓴다)
  const itemIds = [...new Set(tiers.flatMap((t) => [...t.free, ...t.paid].map((r) => r.itemId)).filter(Boolean))];
  const itemDocs = itemIds.length ? await Item.find({ _id: { $in: itemIds } }, { icon: 1, imageUrl: 1, color: 1, type: 1 }).lean() : [];
  const itemById = new Map(itemDocs.map((d) => [String(d._id), d]));

  let tierIndex = -1;
  const rows = tiers.map((t, i) => {
    const reached = progress >= t.need;
    if (reached) tierIndex = i; // need 오름차순이므로 마지막으로 넘은 인덱스가 남는다
    // 📌 한 트랙 = 보상 목록. 받기는 트랙 단위(그 칸의 보상 전부)이고, 수령 기록은 tid 하나다.
    //    부분 수령 표시(rewardKeys — 지급 도중 일부 실패)가 있으면 그 보상만 받은 것으로 본다.
    const track = (list, claimedSet, isPaid) => {
      const whole = claimedSet.has(t.tid);
      const keys = rewardKeys(t.tid, list);
      const rewards = list.map((r, j) => {
        const item = r.kind === "item" ? itemById.get(r.itemId) : null;
        return {
          key: keys[j],
          kind: r.kind,
          amount: r.amount,
          roleId: r.roleId,
          roleName: r.roleName,
          itemId: r.itemId,
          itemName: r.itemName,
          icon: item?.icon || "",
          imageUrl: item?.imageUrl || "",
          itemType: item?.type || "",
          color: item?.color || "",
          label: rewardLabel(r),
          short: rewardShort(r),
          claimed: whole || claimedSet.has(keys[j]),
        };
      });
      const pending = rewards.some((r) => !r.claimed);
      return {
        rewards,
        claimed: rewards.length > 0 && !pending,
        // 프리미엄 칸은 프리미엄(구매 · 부스터)이어야 받을 수 있다. 패스가 꺼져 있으면 전부 잠근다.
        claimable: enabled && reached && pending && (!isPaid || unlocked),
      };
    };
    return {
      tid: t.tid, // 수령 요청(POST /api/pass/claim)이 이 값을 그대로 되돌려 보낸다
      level: t.level,
      need: t.need,
      reached,
      free: track(t.free, freeSet, false),
      paid: track(t.paid, paidSet, true),
    };
  });

  const next = tiers.find((t) => progress < t.need);
  return {
    enabled,
    season: seasonInfo(),
    unlocked, // 프리미엄이 열려 있나 (구매 또는 부스터)
    premiumBy, // "purchase" | "booster" | null
    // 부스터인지 확인하지 못함(디스코드 장애) — 해금 결제를 받지 않는다(부스터가 헛돈을 쓰지 않게)
    boosterUnknown: !purchased && enabled && booster === null,
    unlockPrice, // XP 단위(저장값)
    unlockPoint: xpToPoint(unlockPrice), // 실제로 내는 빙옥
    progress,
    tierIndex,
    nextNeed: next ? next.need - progress : 0, // 만렙이면 0
    maxNeed: tiers.length ? tiers[tiers.length - 1].need : 0,
    tiers: rows,
  };
}

// 📌 보상 지급 — kind 마다 경로가 다르다.
//    xp   : Payout 대기열 (봇이 30초 주기로 지급 + 레벨 재계산 + 역할 동기화까지 해 준다.
//           사이트가 UserXp.xp 를 직접 올리면 이 뒤처리가 통째로 빠진다)
//    point: 디스코드 부작용이 없으므로 사이트가 바로 쓴다
//    role : 기존 상점 구매 큐를 그대로 탄다 — 봇이 역할 지급까지 이미 다 처리한다
//    label 은 기록용 티어 라벨 (예: "시즌 패스 3티어 · 프리미엄"), level 은 인벤토리 표시에 쓰는 티어 번호
export async function grantReward(userId, reward, label, userName = "", level = 0) {
  const kind = reward?.kind;
  const amount = num(reward?.amount);
  const result = { kind: kind || "none", amount, label, queued: false, point: null };

  if (kind === "xp") {
    await Payout.create({
      // Payout.userName 은 required — 닉네임을 못 받았으면 ID로 채운다 (봇은 멘션에 userId를 쓴다)
      userName: userName || userId,
      userId,
      amount,
      reason: label,
      source: "pass",
    });
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
      // itemId 는 상점 상품이 아니라는 표시로 고정한다 (app/api/shop/my-items 가 ShopItem 을 못 찾는다)
      itemId: "season-pass",
      // ⚠️ 그래서 itemName 이 인벤토리 카드·봇 로그·DM 에 그대로 찍힌다 —
      //    유저가 무엇을 받았는지 알 수 있도록 사람이 읽는 역할 이름을 앞에 둔다.
      itemName: `${reward.roleName || "역할"} (시즌 패스 ${level}티어)`,
      itemType: "role",
      roleId: reward.roleId,
      price: 0,
      payMethod: "xp",
      paidXp: 0,
      paidPoint: 0,
      // 시즌 패스 역할은 기간제가 아니다. 시즌 정산(POST /api/season/detach)은
      // ShopItem 또는 Item(역할 유형)에 detachOnSeason 이 켜진 roleId 만 걷어간다 —
      // 시즌마다 떼려면 같은 roleId 를 쓰는 아이템/상품에 그 옵션을 켜 두거나 관리자가 수동으로 회수해야 한다.
      days: 0,
      status: "pending",
    });
    result.queued = true;
    return result;
  }

  if (kind === "item") {
    // 아이템 등록(models/Item)의 아이템 — 인벤토리(my-items)가 itemRef 로 표기를 그린다.
    //    역할이 연결돼 있으면 봇 큐(pending)를 태워 역할까지 붙이고, 없으면 봇이 볼 일이 없으니 바로 completed.
    const item = await Item.findById(reward.itemId).lean().catch(() => null);
    // 아이템이 지워졌으면 던진다 — 호출부(claim)가 이 보상만 못 받은 것으로 남겨, 관리자가 고친 뒤 다시 받을 수 있게 한다
    if (!item) throw new Error(`시즌 패스 아이템 보상을 찾을 수 없습니다: ${reward.itemId}`);
    const hasRole = !!item.roleId;
    await Purchase.create({
      userId,
      userName,
      itemId: "season-pass",
      itemRef: String(item._id),
      itemName: item.name,
      itemType: item.type,
      roleId: item.roleId || "",
      price: 0,
      payMethod: "xp",
      paidXp: 0,
      paidPoint: 0,
      days: 0,
      status: hasRole ? "pending" : "completed",
      processedAt: hasRole ? undefined : new Date(),
    });
    result.queued = hasRole;
    return result;
  }

  return result; // none — 지급할 것이 없다
}
