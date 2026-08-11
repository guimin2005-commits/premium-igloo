export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { couponDiscount, couponError } from "@/lib/shopPricing";
import Coupon from "@/models/Coupon";
import UserCoupon from "@/models/UserCoupon";
import CodeGrant from "@/models/CodeGrant";
import Payout from "@/models/Payout";

// 디스코드에서 역할 보유 여부 확인 (보상형 쿠폰의 사용 조건)
async function hasRole(userId, roleId) {
  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/members/${userId}`,
      { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
    );
    if (!res.ok) return false;
    const member = await res.json();
    return Array.isArray(member.roles) && member.roles.includes(roleId);
  } catch {
    return false;
  }
}

// ── [조회] 내 쿠폰 지갑 ──
//    total 쿼리를 주면 주문 금액 기준으로 할인액·사용 가능 여부를 함께 계산해준다
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ success: false, data: [] }, { status: 401 });

    await connectToDatabase();
    const total = Math.max(0, Math.floor(Number(new URL(request.url).searchParams.get("total")) || 0));

    const wallet = await UserCoupon.find({ userId, status: "unused" }).sort({ issuedAt: -1 }).lean();
    if (wallet.length === 0) return NextResponse.json({ success: true, data: [] });

    // 지갑에는 할인형만 남는다 (보상형은 입력 즉시 소비됨)
    const coupons = await Coupon.find({ _id: { $in: wallet.map((w) => w.couponId) }, kind: { $ne: "reward" } }).lean();
    const byId = new Map(coupons.map((c) => [String(c._id), c]));

    const data = wallet
      .map((w) => {
        const c = byId.get(w.couponId);
        if (!c) return null;
        const reason = couponError(c, total, userId);
        return {
          id: String(w._id),
          code: c.code,
          // 이름이 없으면 코드 대신 일반 명칭 (코드는 화면에 노출하지 않는다)
          name: c.name || (c.type === "percent" ? `${c.value}% 할인 쿠폰` : `${c.value.toLocaleString()} XP 할인 쿠폰`),
          type: c.type,
          value: c.value,
          maxDiscount: c.maxDiscount,
          minTotal: c.minTotal,
          expiresAt: c.expiresAt,
          source: w.source,
          usable: !reason,
          reason,
          discount: reason ? 0 : couponDiscount(c, total),
        };
      })
      .filter(Boolean);

    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

// ── [등록] 코드를 입력해 내 지갑에 담기 ──
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
    }

    await connectToDatabase();
    const { code } = await request.json();
    const normalized = (code || "").trim().toUpperCase();
    if (!normalized) {
      return NextResponse.json({ success: false, message: "쿠폰 코드를 입력해주세요." }, { status: 400 });
    }

    const coupon = await Coupon.findOne({ code: normalized }).lean();
    // 금액 조건(minTotal)은 사용할 때 따지므로 등록 시점에는 total=0으로 제외하고 검사
    if (!coupon || !coupon.active) {
      return NextResponse.json({ success: false, message: "유효하지 않은 쿠폰입니다." }, { status: 404 });
    }
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return NextResponse.json({ success: false, message: "만료된 쿠폰입니다." }, { status: 410 });
    }
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ success: false, message: "사용 한도가 초과된 쿠폰입니다." }, { status: 409 });
    }
    if (coupon.perUserLimit > 0) {
      const mine = (coupon.usedBy || []).filter((u) => u === userId).length;
      if (mine >= coupon.perUserLimit) {
        return NextResponse.json({ success: false, message: "이미 사용한 쿠폰입니다." }, { status: 409 });
      }
    }

    // ── 보상형: 역할·XP를 바로 지급하고 사용 처리 (지갑에 남기지 않는다) ──
    if (coupon.kind === "reward") {
      if (coupon.requiredRoleId) {
        const allowed = await hasRole(userId, coupon.requiredRoleId);
        if (!allowed) {
          const label = coupon.requiredRoleName ? `[${coupon.requiredRoleName}] ` : "";
          return NextResponse.json({ success: false, message: `${label}역할 보유자만 사용할 수 있습니다.` }, { status: 403 });
        }
      }

      if (coupon.rewardRoleId) {
        await CodeGrant.create({
          userId, userName: session.user.name || "",
          roleId: coupon.rewardRoleId, code: coupon.code,
        }).catch(() => {});
      }
      if (coupon.rewardXp > 0) {
        await Payout.create({
          userName: session.user.name || "", userId,
          amount: coupon.rewardXp,
          reason: `쿠폰 사용: ${coupon.code}`,
          source: "code",
        }).catch(() => {});
      }

      await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 }, $push: { usedBy: userId } });

      return NextResponse.json({
        success: true,
        message: coupon.reward || "보상이 지급됩니다. 잠시 후 반영돼요.",
      });
    }

    // ── 할인형: 지갑에 담아 결제 때 사용 ──
    const dup = await UserCoupon.findOne({ userId, couponId: String(coupon._id), status: "unused" }).lean();
    if (dup) {
      return NextResponse.json({ success: false, message: "이미 보유 중인 쿠폰입니다." }, { status: 409 });
    }

    await UserCoupon.create({
      userId,
      userName: session.user.name || "",
      couponId: String(coupon._id),
      code: coupon.code,
      source: "code",
    });

    return NextResponse.json({ success: true, message: `"${coupon.name || "할인 쿠폰"}"을 받았습니다.` });
  } catch (e) {
    return NextResponse.json({ success: false, message: "쿠폰 등록 중 오류가 발생했습니다." }, { status: 500 });
  }
}
