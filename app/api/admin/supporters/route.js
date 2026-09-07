export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { isMonthKey, monthKeyKST, getActivity, getActivityMany, getSupporterSettings } from "@/lib/supporters";
import SupporterEval from "@/models/SupporterEval";

const requireAdmin = async () => {
  const session = await getServerSession(authOptions);
  return isAdminName(session?.user?.name);
};
const denied = () => NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });

// ── 디스코드 역할 보유자 목록 (10분 캐시) ──────────────────────
//    작은 서버라 1,000명 한 페이지면 충분하지만, 넘치면 after 로 몇 장 더 넘긴다.
//    (List Guild Members 는 봇에 GUILD_MEMBERS 인텐트가 켜져 있어야 한다 — bot/src/index.js 에 이미 있다)
const MEMBER_TTL = 10 * 60 * 1000;
const MAX_PAGES = 5;
let memberCache = { at: 0, roleId: "", rows: [] };

const defaultAvatar = (userId) => {
  // 디스코드 기본 아바타 — 새 유저명 체계는 (id >> 22) % 6 (leaderboard 와 같은 규칙)
  let n = 0;
  try { n = Number((BigInt(userId) >> 22n) % 6n); } catch { n = 0; }
  return `https://cdn.discordapp.com/embed/avatars/${n}.png`;
};

async function fetchRoleHolders(roleId, force = false) {
  const now = Date.now();
  if (!force && memberCache.roleId === roleId && now - memberCache.at < MEMBER_TTL) return memberCache.rows;

  const GUILD_ID = process.env.DISCORD_GUILD_ID;
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (!GUILD_ID || !BOT_TOKEN) throw new Error("디스코드 설정(DISCORD_GUILD_ID / DISCORD_BOT_TOKEN)이 없습니다.");

  const rows = [];
  let after = "0";
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members?limit=1000&after=${after}`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` }, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`디스코드 멤버 목록 조회 실패 (${res.status})`);
    const members = await res.json();
    if (!Array.isArray(members) || members.length === 0) break;

    for (const m of members) {
      const id = m?.user?.id;
      if (!id || !Array.isArray(m.roles) || !m.roles.includes(roleId)) continue;
      rows.push({
        userId: id,
        // 서버 별명 → 표시 이름 → 계정 이름 순
        name: m.nick || m.user.global_name || m.user.username || "",
        // 서버 전용 프로필 사진이 있으면 그것을 우선한다
        avatar: m.avatar
          ? `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${id}/avatars/${m.avatar}.png?size=128`
          : m.user.avatar
          ? `https://cdn.discordapp.com/avatars/${id}/${m.user.avatar}.png?size=128`
          : defaultAvatar(id),
      });
    }
    if (members.length < 1000) break;
    after = members[members.length - 1].user.id;
  }

  memberCache = { at: now, roleId, rows };
  return rows;
}

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
