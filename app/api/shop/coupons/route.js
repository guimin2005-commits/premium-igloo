export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import { authOptions } from "@/lib/authOptions";
import { couponDiscount, couponError } from "@/lib/shopPricing";
import Coupon from "@/models/Coupon";
import mongoose from "mongoose";
import { randomInt } from "crypto";

// ── [조회] 쿠폰 목록 (관리자) ──
export async function GET() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
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
        // 범위가 있는 쿠폰은 결제 수단을 나눈 뒤 할인액이 정해진다 — 화면이 planPayment 에 이 값들을 그대로 넘긴다(discount 는 주문 전체 기준 참고값)
        data: { code: coupon.code, name: coupon.name, type: coupon.type, value: coupon.value, maxDiscount: coupon.maxDiscount || 0, payScope: coupon.payScope || "both", discount },
      });
    }

    // 관리자: 등록·수정
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    // 여러 장(bulk)은 코드를 서버가 만든다(아래 bulkCreate)
    const bulkOn = !b.id && !!b.bulk && typeof b.bulk === "object";
    if (!bulkOn && !b.code?.trim()) {
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

    // 만료 일시 — 관리자 폼은 datetime-local 값(시간대 없는 KST 벽시계 "YYYY-MM-DDTHH:mm")을 보낸다.
    //    서버(UTC)가 그대로 읽으면 9시간 늦게 만료되므로 +09:00 으로 읽는다. 초가 없으면 그 1분이 끝날 때까지(59초 — 상품 할인 종료와 같다).
    //    시간대가 붙어 오면 그대로 읽는다. 비우면 무기한 — undefined 로 두면 수정 저장에서 빠져 옛 만료가 남으므로 null 로 지운다
    let expiresAt = null;
    const rawExp = String(b.expiresAt || "").trim();
    if (rawExp) {
      const local = rawExp.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/);
      const t = new Date(local ? `${rawExp}${local[1] ? "" : ":59"}+09:00` : rawExp);
      if (!Number.isFinite(t.getTime())) {
        return NextResponse.json({ success: false, message: "만료 일시를 다시 확인해 주세요." }, { status: 400 });
      }
      expiresAt = t;
    }
    // 1인당 사용 횟수 — 빈칸이면 폼 자리표시 · 모델 기본값과 같은 1회(무제한은 0 을 넣는다)
    const perRaw = b.perUserLimit === "" || b.perUserLimit == null ? 1 : Math.floor(Number(b.perUserLimit));

    const payload = {
      code: String(b.code || "").trim().toUpperCase(),
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
      payScope: kind === "discount" && (b.payScope === "xp" || b.payScope === "point") ? b.payScope : "both",
      minTotal: Math.max(0, Math.floor(Number(b.minTotal) || 0)),

      maxUses: Math.max(0, Math.floor(Number(b.maxUses) || 0)),
      perUserLimit: Number.isFinite(perRaw) ? Math.max(0, perRaw) : 1,
      active: b.active !== false,
      expiresAt,
    };

    // 📌 여러 장(2026-10-17 상점 관리 › 쿠폰 「여러 장」) — 같은 혜택 · 한도 · 만료로 N장. 코드 = 앞머리 + 무작위 글자(헷갈리는 0 · O · 1 · I 빼고).
    //    bulk: { prefix, count 2~500, length 4~16 }. 겹치는 코드(있던 쿠폰 · 같은 요청 안)는 다시 뽑는다. 응답 codes = 만든 코드(만든 차례)
    if (bulkOn) return await bulkCreate(payload, b.bulk);

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

const BULK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BULK_MAX = 500;
const PREFIX_MAX = 20;
async function bulkCreate(base, bulk) {
  const prefix = String(bulk.prefix || "").trim().toUpperCase().replace(/\s+/g, "");
  const count = Math.floor(Number(bulk.count) || 0);
  const length = Math.floor(Number(bulk.length) || 0);
  if (prefix.length > PREFIX_MAX) return NextResponse.json({ success: false, message: `앞머리는 ${PREFIX_MAX}자까지입니다.` }, { status: 400 });
  if (!(count >= 2 && count <= BULK_MAX)) return NextResponse.json({ success: false, message: `장수는 2~${BULK_MAX}장입니다.` }, { status: 400 });
  if (!(length >= 4 && length <= 16)) return NextResponse.json({ success: false, message: "무작위 글자 수는 4~16자입니다." }, { status: 400 });
  const draw = () => prefix + Array.from({ length }, () => BULK_ALPHABET[randomInt(BULK_ALPHABET.length)]).join("");
  const codes = [];
  const seen = new Set();
  // 겹침 — 같은 요청 안 · 이미 있는 쿠폰. 몇 번 다시 뽑아도 모자라면(글자 수가 너무 짧음) 알린다
  for (let round = 0; round < 6 && codes.length < count; round++) {
    const batch = [];
    while (batch.length < (count - codes.length) * 2 && batch.length < 2000) {
      const c = draw();
      if (!seen.has(c)) { seen.add(c); batch.push(c); }
      if (seen.size > count * 50) break;
    }
    const taken = new Set((await Coupon.find({ code: { $in: batch } }, { code: 1 }).lean()).map((x) => x.code));
    for (const c of batch) if (!taken.has(c) && codes.length < count) codes.push(c);
  }
  if (codes.length < count) return NextResponse.json({ success: false, message: "겹치지 않는 코드를 만들지 못했습니다. 무작위 글자 수를 늘려 주세요." }, { status: 409 });
  let made = [];
  try {
    made = await Coupon.insertMany(codes.map((code) => ({ ...base, code })), { ordered: false });
  } catch (e) {
    // 그 사이 같은 코드가 생겼으면 그 장만 빠진다 — 들어간 것만 돌려준다
    made = Array.isArray(e?.insertedDocs) ? e.insertedDocs : [];
    if (!made.length) throw e;
  }
  const ok = new Set(made.map((d) => d.code));
  return NextResponse.json({ success: true, codes: codes.filter((c) => ok.has(c)), data: made });
}

// ── [사용 상태] (관리자) — { id, active } 그 칸만(목록 줄 스위치). 다른 칸은 그대로 ──
export async function PATCH(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));
    const id = String(b?.id || "");
    if (!mongoose.isValidObjectId(id) || typeof b?.active !== "boolean") {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }
    const doc = await Coupon.findByIdAndUpdate(id, { $set: { active: b.active } }, { new: true }).lean();
    if (!doc) return NextResponse.json({ success: false, message: "쿠폰을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ success: true, data: doc });
  } catch (e) {
    console.error("쿠폰 사용 상태 저장 오류:", e);
    return NextResponse.json({ success: false, message: "저장하지 못했습니다." }, { status: 500 });
  }
}

// ── [삭제] (관리자) ──
export async function DELETE(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false }, { status: 400 });
    await Coupon.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
