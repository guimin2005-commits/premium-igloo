export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { couponDiscount, couponError } from "@/lib/shopPricing";
import Coupon from "@/models/Coupon";

const requireAdmin = async () => {
  const session = await getServerSession(authOptions);
  return isAdminName(session?.user?.name);
};

// ── [조회] 쿠폰 목록 (관리자) ──
export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: coupons });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

// ── [등록·수정] (관리자) / [검증] 결제 화면에서 쿠폰 확인 ──
export async function POST(request) {
  try {
    await connectToDatabase();
    const b = await request.json();

    // 유저: 쿠폰 코드 검증 (할인액만 계산, 사용 처리는 결제 시)
    if (b.validate) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
      }
      const total = Math.max(0, Math.floor(Number(b.total) || 0));
      const coupon = await Coupon.findOne({ code: (b.code || "").trim().toUpperCase() }).lean();

      const err = couponError(coupon, total, session.user.id);
      if (err) return NextResponse.json({ success: false, message: err }, { status: 400 });

      const discount = couponDiscount(coupon, total);
      return NextResponse.json({
        success: true,
        data: { code: coupon.code, name: coupon.name, type: coupon.type, value: coupon.value, discount },
      });
    }

    // 관리자: 등록·수정
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }
    if (!b.code?.trim()) {
      return NextResponse.json({ success: false, message: "쿠폰 코드를 입력해주세요." }, { status: 400 });
    }

    const kind = b.kind === "reward" ? "reward" : "discount";
    const value = Math.max(0, Math.floor(Number(b.value) || 0));
    const rewardXp = Math.max(0, Math.floor(Number(b.rewardXp) || 0));

    if (kind === "discount") {
      if (value <= 0) {
        return NextResponse.json({ success: false, message: "할인 값을 입력해주세요." }, { status: 400 });
      }
      if (b.type !== "flat" && value > 100) {
        return NextResponse.json({ success: false, message: "할인율은 100%를 넘을 수 없습니다." }, { status: 400 });
      }
    } else if (!b.rewardRoleId?.trim() && rewardXp <= 0) {
      return NextResponse.json({ success: false, message: "지급할 역할이나 XP 중 하나는 지정해야 합니다." }, { status: 400 });
    }

    const payload = {
      code: b.code.trim().toUpperCase(),
      name: (b.name || "").trim(),
      kind,

      // 보상형
      reward: kind === "reward" ? (b.reward || "").trim() : "",
      rewardRoleId: kind === "reward" ? (b.rewardRoleId || "").trim() : "",
      rewardRoleName: kind === "reward" ? (b.rewardRoleName || "").trim() : "",
      rewardXp: kind === "reward" ? rewardXp : 0,
      requiredRoleId: kind === "reward" ? (b.requiredRoleId || "").trim() : "",
      requiredRoleName: kind === "reward" ? (b.requiredRoleName || "").trim() : "",

      // 할인형
      type: b.type === "flat" ? "flat" : "percent",
      value: kind === "discount" ? value : 0,
      maxDiscount: Math.max(0, Math.floor(Number(b.maxDiscount) || 0)),
      minTotal: Math.max(0, Math.floor(Number(b.minTotal) || 0)),

      maxUses: Math.max(0, Math.floor(Number(b.maxUses) || 0)),
      perUserLimit: Math.max(0, Math.floor(Number(b.perUserLimit) ?? 1)),
      active: b.active !== false,
      expiresAt: b.expiresAt ? new Date(b.expiresAt) : undefined,
    };

    const doc = b.id
      ? await Coupon.findByIdAndUpdate(b.id, payload, { new: true })
      : await Coupon.create(payload);

    return NextResponse.json({ success: true, data: doc });
  } catch (e) {
    if (e.code === 11000) {
      return NextResponse.json({ success: false, message: "이미 존재하는 쿠폰 코드입니다." }, { status: 409 });
    }
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// ── [삭제] (관리자) ──
export async function DELETE(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false }, { status: 400 });
    await Coupon.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
