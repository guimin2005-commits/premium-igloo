import { NextResponse } from "next/server";
import { connectToDatabase } from "../../lib/mongodb";
import { requireUser } from "@/lib/apiAuth";
import Apply from "../../models/Apply";

export async function POST(req) {
  try {
    // ⚠️ 지원자 식별은 세션 기준 — body의 discordTag를 믿으면 타인 명의로 지원서를 넣을 수 있다
    const auth = await requireUser();
    if (auth.deny) return auth.deny;

    const data = await req.json();
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    await connectToDatabase();
    await Apply.create({
      discordTag: auth.name,
      position: data.position || " ",
      age: data.age ? Number(data.age) : 0,
      intro: data.intro || " ",
      experience: data.experience || ""
    });

    // 디스코드 임베드 필드는 1024자 한도 — 넘기면 웹훅이 거절돼 알림이 빠진다
    const clip = (v, fb = " ") => { const t = String(v || "").trim(); return t ? (t.length > 1000 ? t.slice(0, 1000) + "…" : t) : fb; };
    if (webhookUrl) {
      // 웹훅이 실패해도 지원서는 이미 저장됐으니 성공으로 응답한다
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: "새로운 구인 지원",
            color: 15275839,
            fields: [
              { name: "지원 분야", value: data.position || " ", inline: true },
              { name: "디스코드 태그", value: auth.name, inline: true },
              { name: "나이", value: data.age ? data.age + "세" : " ", inline: true },
              { name: "자기소개", value: clip(data.intro) },
              { name: "경험 (선택)", value: clip(data.experience, "없음") }
            ]
          }]
        }),
        signal: AbortSignal.timeout(5000),
      }).then((r) => { if (!r.ok) console.error("구인 지원 웹훅 실패:", r.status); }).catch((e) => console.error("구인 지원 웹훅 오류:", e));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}