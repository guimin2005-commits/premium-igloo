export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import {
  isMonthKey,
  monthKeyKST,
  getActivity,
  getActivityMany,
  getSupporterSettings,
  fetchRoleHolders,
  defaultAvatar,
} from "@/lib/supporters";
import SupporterEval from "@/models/SupporterEval";

const requireAdmin = async () => {
  const session = await getServerSession(authOptions);
  return isAdminName(session?.user?.name);
};
const denied = () => NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });

const pickEval = (e) =>
  e
    ? {
        grade: e.grade || "",
        xp: e.xp || 0,
        point: e.point || 0,
        note: e.note || "",
        status: e.status === "paid" ? "paid" : "draft",
        paidAt: e.paidAt || null,
      }
    : null;

// ── [조회] 월별 서포터즈 표 — 역할 보유자 전원 + 그 달 활동 + 기존 평가 ──
//    ?month=YYYY-MM (없으면 이번 달), ?refresh=1 이면 멤버 캐시를 무시한다
export async function GET(request) {
  try {
    if (!(await requireAdmin())) return denied();
    await connectToDatabase();

    const sp = new URL(request.url).searchParams;
    const month = sp.get("month") || monthKeyKST();
    if (!isMonthKey(month)) {
      return NextResponse.json({ success: false, error: "월 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const settings = await getSupporterSettings();
    const base = { success: true, month, goals: settings.goals, baseXp: settings.baseXp, roleId: settings.roleId };

    if (!settings.roleId) {
      return NextResponse.json({ ...base, rows: [], message: "서포터즈 역할이 지정되지 않았습니다" });
    }

    const holders = await fetchRoleHolders(settings.roleId, sp.get("refresh") === "1");
    const ids = holders.map((h) => h.userId);

    // 그 달 평가는 역할을 이미 잃은 사람 것도 함께 본다 — 지급 기록이 표에서 사라지면 안 된다
    const [activity, evals] = await Promise.all([
      getActivityMany(ids, month, settings.tickMin),
      SupporterEval.find({ month }).lean(),
    ]);
    const evalBy = new Map(evals.map((e) => [e.userId, e]));

    const rows = holders.map((h) => {
      const a = activity.get(h.userId) || { chatCount: 0, voiceMin: 0 };
      return { ...h, chatCount: a.chatCount, voiceMin: a.voiceMin, eval: pickEval(evalBy.get(h.userId)) };
    });
    const known = new Set(ids);
    for (const e of evals) {
      if (known.has(e.userId)) continue;
      rows.push({
        userId: e.userId,
        name: e.userName || e.userId,
        avatar: defaultAvatar(e.userId),
        chatCount: e.chatCount || 0,
        voiceMin: e.voiceMin || 0,
        eval: pickEval(e),
        left: true, // 현재 역할 보유자가 아님 — 평가 기록만 남은 사람
      });
    }
    rows.sort((x, y) => (x.name || "").localeCompare(y.name || "", "ko"));

    return NextResponse.json({ ...base, rows });
  } catch (e) {
    console.error("서포터즈 표 조회 오류:", e);
    return NextResponse.json({ success: false, error: e?.message || "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// 숫자 입력은 0 이상 정수로 (지급액이므로 상한도 둔다)
const num = (v, def, max = 10_000_000) => {
  // 빈 칸·null 은 "입력 안 함" — 0 이 아니라 기본값으로 (Number("") 은 0 이라 그냥 두면 0 XP 가 저장·지급된다)
  if (v === "" || v == null) return def;
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(0, Math.floor(n)));
};
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ── [저장] 평가 초안 upsert — 이미 지급된 달은 잠근다(409) ──
//    body { userId, userName, month, grade, xp, point, note }
export async function PUT(request) {
  try {
    if (!(await requireAdmin())) return denied();
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));

    const userId = str(b.userId, 32);
    const month = str(b.month, 7);
    if (!userId || !isMonthKey(month)) {
      return NextResponse.json({ success: false, error: "대상과 월을 확인해 주세요." }, { status: 400 });
    }

    // 활동 스냅샷 — XpLog 는 60일 뒤 사라지므로 평가 시점 값을 함께 굳힌다
    const settings = await getSupporterSettings();
    const activity = await getActivity(userId, month, settings.tickMin);
    const now = new Date();

    let doc;
    try {
      // paid 문서는 필터에 걸리지 않아 upsert 가 새 문서를 만들려다 유니크 인덱스에 막힌다 → 11000 → 409.
      // 조회 후 저장 사이에 지급이 끼어들어도 같은 길로 막힌다.
      doc = await SupporterEval.findOneAndUpdate(
        { userId, month, status: { $ne: "paid" } },
        {
          $set: {
            userName: str(b.userName, 100),
            grade: str(b.grade, 20),
            xp: num(b.xp, settings.baseXp),
            point: num(b.point, 0),
            note: str(b.note, 1000),
            chatCount: activity.chatCount,
            voiceMin: activity.voiceMin,
            status: "draft",
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, new: true }
      ).lean();
    } catch (e) {
      if (e?.code === 11000) {
        return NextResponse.json({ success: false, error: "이미 지급된 달은 수정할 수 없습니다." }, { status: 409 });
      }
      throw e;
    }

    return NextResponse.json({
      success: true,
      eval: { ...pickEval(doc), userId, month, chatCount: doc.chatCount, voiceMin: doc.voiceMin },
    });
  } catch (e) {
    console.error("서포터즈 평가 저장 오류:", e);
    return NextResponse.json({ success: false, error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
