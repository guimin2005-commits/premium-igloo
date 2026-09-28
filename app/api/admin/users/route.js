export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { currentSeason } from "@/lib/season";
import UserXp from "@/models/UserXp";
import Purchase from "@/models/Purchase";
import Payout from "@/models/Payout";
import UserCoupon from "@/models/UserCoupon";
import Coupon from "@/models/Coupon";
import Notification from "@/models/Notification";
import SeasonResult from "@/models/SeasonResult";
import Inquiry from "@/app/models/Inquiry";
import Apply from "@/app/models/Apply";

// 📌 관리자 '유저 조회' — 한 유저의 지갑 · 구매 · 지급 · 쿠폰 · 알림 · 문의 · 지원서를 한 번에 묶어 준다.
//    GET ?q=      검색 — 디스코드 ID 는 정확히, 이름(username · displayName)은 부분 일치. 최대 20명
//    GET ?userId= 상세 묶음 — 목록마다 최근 50건
//    조회만 한다(쓰기 없음). 관리자 전용.

const LIMIT = 50;
const SEARCH_LIMIT = 20;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// 디스코드 ID 모양 — 이 모양인데 XP 문서가 없으면(채팅 한 번 안 한 유저) 빈 줄로라도 열 수 있게 돌려준다
const looksLikeId = (s) => /^\d{15,21}$/.test(s);

const USER_FIELDS = { userId: 1, username: 1, displayName: 1, xp: 1, level: 1, point: 1, updatedAt: 1 };

async function search(q) {
  const rx = new RegExp(escapeRegex(q), "i");
  // 📌 ID 정확 일치는 따로 찾는다 — 이름 부분 일치와 한 번에 XP 순으로 20명을 자르면 ID 가 맞은 유저가 잘려 나갈 수 있다
  const [exact, rows] = await Promise.all([
    UserXp.findOne({ userId: q }, USER_FIELDS).lean(),
    UserXp.find({ userId: { $ne: q }, $or: [{ username: rx }, { displayName: rx }] }, USER_FIELDS)
      .sort({ xp: -1 })
      .limit(SEARCH_LIMIT)
      .lean(),
  ]);
  // ID 가 정확히 맞은 줄은 맨 위로
  const head = exact || (looksLikeId(q) ? { userId: q, username: "", displayName: "", xp: 0, level: 0, point: 0, noXp: true } : null);
  return (head ? [head, ...rows] : rows).slice(0, SEARCH_LIMIT);
}

// 📌 이름 폴백 — 예전 문서(알림 · 문의 · 지원서 · 지급)는 ID 없이 닉네임만 담겼다.
//    ID 가 비어 있는 문서만 이름으로 잡는다(ID 가 적힌 문서는 그 ID 의 주인 것 — 같은 이름의 다른 사람 것을 끌어오지 않게).
const noId = (field) => ({ [field]: { $in: [null, ""] } });
const byIdOrName = (idField, nameField, userId, names) =>
  names.length ? { $or: [{ [idField]: userId }, { ...noId(idField), [nameField]: { $in: names } }] } : { [idField]: userId };

async function detail(userId) {
  const [user, purchases, userCoupons, seasons] = await Promise.all([
    UserXp.findOne({ userId }).lean(),
    // 수령 정보(contact)는 구매 내역 화면에서만 본다
    Purchase.find({ userId }, { contact: 0 }).sort({ createdAt: -1 }).limit(LIMIT).lean(),
    UserCoupon.find({ userId }).sort({ issuedAt: -1 }).limit(LIMIT).lean(),
    SeasonResult.find({ "top.userId": userId }, { season: 1, name: 1, settledAt: 1, top: 1 }).sort({ season: -1 }).lean(),
  ]);

  const candidates = [...new Set([user?.username, user?.displayName, purchases[0]?.userName, userCoupons[0]?.userName]
    .map((v) => String(v || "").trim())
    .filter(Boolean))];
  // 📌 다른 유저의 사용자명과 같은 이름은 뺀다 — 옛 문서의 이름은 로그인 사용자명이라,
  //    이 유저의 서버 별명(displayName)이 남의 사용자명과 같으면 그 사람의 기록이 섞인다
  const taken = candidates.length
    ? await UserXp.distinct("username", { username: { $in: candidates }, userId: { $ne: userId } })
    : [];
  const names = candidates.filter((n) => !taken.includes(n));

  // 📌 Apply 에 userId 칸이 아직 없을 수 있다 — 스키마에 없는 칸을 조건에 넣으면 strictQuery 설정에 따라
  //    빈 조건({})으로 바뀌어 전원 지원서가 잡힐 수 있으므로, 칸이 있을 때만 ID 로 찾는다
  const applyQuery = Apply.schema.path("userId")
    ? byIdOrName("userId", "discordTag", userId, names)
    : names.length ? { discordTag: { $in: names } } : null;

  const couponIds = [...new Set(userCoupons.map((c) => c.couponId).filter((id) => mongoose.isValidObjectId(id)))];

  const [payouts, notifications, inquiries, applies, coupons] = await Promise.all([
    Payout.find(byIdOrName("userId", "userName", userId, names)).sort({ createdAt: -1 }).limit(LIMIT).lean(),
    Notification.find(byIdOrName("recipientId", "recipientName", userId, names), { content: 0 }).sort({ createdAt: -1 }).limit(LIMIT).lean(),
    Inquiry.find(byIdOrName("userId", "user", userId, names), { mainType: 1, subType: 1, title: 1, status: 1, createdAt: 1, answeredAt: 1 })
      .sort({ createdAt: -1 }).limit(LIMIT).lean(),
    applyQuery ? Apply.find(applyQuery, { position: 1, status: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(LIMIT).lean() : [],
    couponIds.length ? Coupon.find({ _id: { $in: couponIds } }, { name: 1, code: 1, kind: 1, type: 1, value: 1, expiresAt: 1 }).lean() : [],
  ]);

  const couponById = new Map(coupons.map((c) => [String(c._id), c]));
  const cur = currentSeason();
  const passCurrent = !!user && user.passSeason === cur.number;

  return {
    names,
    user: user
      ? {
          userId: user.userId,
          username: user.username || "",
          displayName: user.displayName || "",
          xp: user.xp || 0,
          level: user.level || 0,
          point: user.point || 0,
          chatEnhance: user.chatEnhance || 0,
          voiceEnhance: user.voiceEnhance || 0,
          attendCount: user.attendCount || 0,
          attendStreak: user.attendStreak || 0,
          attendBestStreak: user.attendBestStreak || 0,
          lastAttendDate: user.lastAttendDate || "",
          voiceSeconds: user.voiceSeconds || 0,
          needsRoleSync: !!user.needsRoleSync,
          updatedAt: user.updatedAt || null,
          // 패스 — 지난 시즌에 멈춘 문서면 진행도 대신 그 시즌 번호만(다음 조회 때 사이트가 새 시즌으로 넘긴다)
          pass: {
            season: user.passSeason || 0,
            current: passCurrent,
            unlocked: passCurrent && !!user.passUnlocked,
            seasonXp: passCurrent ? Math.max(0, (user.xp || 0) - (user.passBaseXp || 0)) : null,
            claimed: passCurrent ? (user.passClaimedFree?.length || 0) + (user.passClaimedPaid?.length || 0) : 0,
          },
        }
      : null,
    purchases,
    payouts,
    coupons: userCoupons.map((c) => {
      const meta = couponById.get(String(c.couponId));
      return { ...c, name: meta?.name || "", kind: meta?.kind || "", type: meta?.type || "", value: meta?.value || 0, expiresAt: meta?.expiresAt || null, missing: !meta };
    }),
    notifications,
    inquiries,
    applies,
    seasons: seasons.map((s) => {
      const me = (s.top || []).find((t) => t.userId === userId);
      return { season: s.season, name: s.name || "", settledAt: s.settledAt || null, rank: me?.rank || 0, xp: me?.xp || 0, level: me?.level || 0 };
    }),
  };
}

export async function GET(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const userId = String(searchParams.get("userId") || "").trim().slice(0, 40);
    if (userId) return NextResponse.json({ success: true, data: await detail(userId) });

    const q = String(searchParams.get("q") || "").trim().slice(0, 50);
    if (!q) return NextResponse.json({ success: true, data: [] });
    return NextResponse.json({ success: true, data: await search(q) });
  } catch (error) {
    console.error("유저 조회 실패:", error);
    return NextResponse.json({ success: false, message: "조회에 실패했습니다.", error: "조회에 실패했습니다." }, { status: 500 });
  }
}
