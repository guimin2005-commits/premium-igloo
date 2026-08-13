export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import Post from "@/models/Post";
import SurveyResponse from "@/models/SurveyResponse";

// 📌 설문 답변을 경매 선수 카드로 옮긴다.
//    질문 문구는 대회마다 제각각이라, 문구에 들어 있는 낱말로 어떤 항목인지 알아낸다.
const FIELD_HINTS = [
  { key: "alias", words: ["닉네임", "게임 아이디", "게임아이디", "인게임", "소환사", "배틀태그", "이름"] },
  { key: "peakTier", words: ["최고 티어", "최고티어", "peak", "최고 랭크", "역대"] },
  { key: "currentTier", words: ["현재 티어", "현재티어", "티어", "랭크", "tier"] },
  { key: "mainPos", words: ["주 포지션", "주포지션", "메인 포지션", "main", "제1", "첫번째 포지션"] },
  { key: "subPos", words: ["부 포지션", "부포지션", "서브 포지션", "sub", "제2", "두번째 포지션"] },
  { key: "mostChampions", words: ["모스트", "챔피언", "챔프", "영웅", "주력", "most"] },
  { key: "isAllPos", words: ["올 포지션", "올포지션", "전 포지션", "전포지션", "모든 포지션"] },
  { key: "discordId", words: ["디스코드 id", "디스코드아이디", "discord id", "유저 id"] },
];

const pickField = (label = "") => {
  const l = String(label).toLowerCase().replace(/\s+/g, " ");
  for (const f of FIELD_HINTS) {
    if (f.words.some((w) => l.includes(w.toLowerCase()))) return f.key;
  }
  return null;
};

const asText = (v) => (Array.isArray(v) ? v.filter(Boolean).join(", ") : String(v ?? "")).trim();
const isYes = (v) => /^(예|네|가능|y|yes|o|true|참)/i.test(asText(v));

// 답변 속 포지션 표기를 이 경매의 역할 이름으로 맞춘다 (없으면 원문 유지)
const matchRole = (value, roleNames) => {
  const v = asText(value);
  if (!v) return "";
  const hit = roleNames.find((r) => v.includes(r) || r.includes(v));
  return hit || v;
};

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminName(session?.user?.name)) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }

    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get("postId");
    const roleNames = (searchParams.get("roles") || "").split(",").map((s) => s.trim()).filter(Boolean);

    // 대상 대회를 고르지 않았으면, 설문을 받은 대회 목록을 돌려준다
    if (!postId) {
      const posts = await Post.find({ category: "대회", "survey.enabled": true }, { title: 1, createdAt: 1 }).sort({ createdAt: -1 }).lean();
      const counts = await SurveyResponse.aggregate([
        { $match: { postId: { $in: posts.map((p) => String(p._id)) } } },
        { $group: { _id: "$postId", n: { $sum: 1 } } },
      ]);
      const map = Object.fromEntries(counts.map((c) => [c._id, c.n]));
      return NextResponse.json({
        success: true,
        data: posts.map((p) => ({ _id: String(p._id), title: p.title, createdAt: p.createdAt, responses: map[String(p._id)] || 0 })),
      });
    }

    const rows = await SurveyResponse.find({ postId }).sort({ createdAt: 1 }).lean();
    const players = rows.map((r) => {
      const out = {
        alias: "", discordId: r.userId || "", peakTier: "", currentTier: "",
        mainPos: "", subPos: "", mostChampions: [""], isAllPos: false,
      };
      for (const a of r.answers || []) {
        const key = pickField(a.label);
        if (!key) continue;
        if (key === "isAllPos") { out.isAllPos = isYes(a.value); continue; }
        if (key === "mostChampions") {
          const list = Array.isArray(a.value) ? a.value : asText(a.value).split(/[,/·]/);
          out.mostChampions = list.map((s) => String(s).trim()).filter(Boolean).slice(0, 3);
          if (out.mostChampions.length === 0) out.mostChampions = [""];
          continue;
        }
        if (key === "mainPos" || key === "subPos") {
          // 포지션 답이 '올 포지션(ALL)'이면 황금카드로 처리하고 포지션은 비워 둔다
          if (/올\s*포지션|all|전\s*포지션/i.test(asText(a.value))) { out.isAllPos = true; continue; }
          out[key] = matchRole(a.value, roleNames);
          continue;
        }
        // 현재 티어 힌트가 최고 티어보다 넓어서, 이미 찬 값은 덮어쓰지 않는다
        if (!out[key]) out[key] = asText(a.value);
      }
      if (!out.alias) out.alias = r.userName || "";
      return out;
    });

    // 닉네임이 비어 있으면 쓸 수 없으므로 걸러낸다
    const usable = players.filter((p) => p.alias);
    return NextResponse.json({
      success: true,
      data: usable,
      meta: { total: rows.length, skipped: rows.length - usable.length },
    });
  } catch (e) {
    console.error("설문 → 경매 변환 오류:", e);
    return NextResponse.json({ success: false, message: "설문을 불러오지 못했습니다." }, { status: 500 });
  }
}
