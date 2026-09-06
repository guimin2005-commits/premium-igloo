import SeasonPass from "@/models/SeasonPass";
import UserXp from "@/models/UserXp";
import Payout from "@/models/Payout";
import Purchase from "@/models/Purchase";
import { addPoints } from "@/lib/points";
import { SEASON } from "@/lib/season";

// 📌 시즌 패스 계산의 단일 진실 — 조회(GET)와 수령(POST)이 반드시 이 함수를 함께 쓴다.
//    클라이언트가 보낸 진행도·해금 상태는 절대 믿지 않는다 (lib/quests.js 의 getQuestState 와 같은 원칙).

export const REWARD_KINDS = ["none", "xp", "point", "role"];
export const DEFAULT_UNLOCK_PRICE = 50000;
// 설정 문서 하나에 티어가 무한정 쌓이지 않게 상한을 둔다
export const MAX_TIERS = 100;

const num = (v, { min = 0, max = 1_000_000_000 } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
};

// 보상 라벨 — 서버가 만들어 보낸다. 화면마다 다르게 쓰면 표기가 갈라지므로 한 곳에서 찍는다.
export const rewardLabel = (r) => {
  const amount = num(r?.amount);
  if (r?.kind === "xp") return amount > 0 ? `XP ${amount.toLocaleString("ko-KR")}` : "-";
  if (r?.kind === "point") return amount > 0 ? `POINT ${amount.toLocaleString("ko-KR")}` : "-";
  if (r?.kind === "role") return r?.roleId ? `역할 · ${r.roleName || "역할"}` : "-";
  return "-";
};

// 빈 칸 — 지급할 게 없는 보상은 전부 이 모양으로 눕혀서 claimable 판정을 단순하게 만든다
const blankReward = () => ({ kind: "none", amount: 0, roleId: "", roleName: "" });

const normalizeReward = (r) => {
  const kind = REWARD_KINDS.includes(r?.kind) ? r.kind : "none";
  if (kind === "role") {
    const roleId = String(r?.roleId || "").trim();
    // 지급할 역할이 없으면 보상이 아니다 — 빈 칸으로 되돌려 수령 버튼이 뜨지 않게 한다
    if (!roleId) return blankReward();
    return { kind, amount: 0, roleId, roleName: String(r?.roleName || "").trim() };
  }
  if (kind === "xp" || kind === "point") {
    const amount = num(r?.amount);
    if (amount <= 0) return blankReward();
    return { kind, amount, roleId: "", roleName: "" };
  }
  return blankReward();
};

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
        return { tid, need: num(t?.need), free: normalizeReward(t?.free), paid: normalizeReward(t?.paid) };
      })
      .sort((a, b) => a.need - b.need)
      .map((t, i) => ({ tid: t.tid, level: i + 1, need: t.need, free: t.free, paid: t.paid })),
    nextTid,
  };
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
      { xp: 1, passSeason: 1, passBaseXp: 1, passUnlocked: 1, passClaimedFree: 1, passClaimedPaid: 1 }
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
    await UserXp.updateOne(
      { userId, ...(seen ? { passSeason: seen } : { passSeason: { $in: [null, 0] } }) },
      {
        $set: {
          passSeason: SEASON.number,
          passBaseXp: xp,
          passUnlocked: false,
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
    baseXp = xp;
    unlocked = false;
    claimedFree = [];
    claimedPaid = [];
  }

  // 진행도는 음수가 될 수 있다 — XP 를 상점에서 쓰면 passBaseXp 도 같이 내려가므로 0 아래로는 잘라 쓴다
  const progress = Math.max(0, xp - baseXp);
  // 수령 판정은 tid 로 한다 (인덱스로 하면 티어를 중간에 끼워 넣을 때 기록이 통째로 밀린다)
  const freeSet = new Set(claimedFree.map(String));
  const paidSet = new Set(claimedPaid.map(String));

  let tierIndex = -1;
  const rows = tiers.map((t, i) => {
    const reached = progress >= t.need;
    if (reached) tierIndex = i; // need 오름차순이므로 마지막으로 넘은 인덱스가 남는다
    const cell = (r, claimedSet, isPaid) => {
      const claimed = claimedSet.has(t.tid);
      return {
        kind: r.kind,
        amount: r.amount,
        roleId: r.roleId,
        roleName: r.roleName,
        label: rewardLabel(r),
        claimed,
        // 프리미엄 칸은 해금까지 되어 있어야 받을 수 있다. 패스가 꺼져 있으면 전부 잠근다.
        claimable: enabled && reached && !claimed && r.kind !== "none" && (!isPaid || unlocked),
      };
    };
    return {
      tid: t.tid, // 수령 요청(POST /api/pass/claim)이 이 값을 그대로 되돌려 보낸다
      level: t.level,
      need: t.need,
      reached,
      free: cell(t.free, freeSet, false),
      paid: cell(t.paid, paidSet, true),
    };
  });

  const next = tiers.find((t) => progress < t.need);
  return {
    enabled,
    season: seasonInfo(),
    unlocked,
    unlockPrice,
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
      // 시즌 패스 역할은 기간제가 아니다. 그리고 시즌 정산(POST /api/season/detach)도 이 역할을
      // 자동으로 걷어가지 않는다 — detach 는 ShopItem({ detachOnSeason: true }) 의 roleId 목록으로만
      // 대상을 고르므로 상점에 없는 역할은 영영 남는다.
      // → 시즌마다 떼려면 같은 roleId 를 쓰는 상점 상품을 하나 두거나 관리자가 수동으로 회수해야 한다.
      days: 0,
      status: "pending",
    });
    result.queued = true;
    return result;
  }

  return result; // none — 지급할 것이 없다
}
