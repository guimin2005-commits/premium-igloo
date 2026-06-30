import { NextResponse } from "next/server";
import { connectToDatabase } from "../../lib/mongodb";
import Apply from "../../models/Apply";

export async function POST(req) {
  try {
    const data = await req.json();
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    await connectToDatabase();
    await Apply.create({
      discordTag: data.discordTag || " ",
      position: data.position || " ",
      age: data.age ? Number(data.age) : 0,
      intro: data.intro || " ",
      experience: data.experience || ""
    });

    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: "새로운 구인 지원",
            color: 15275839,
            fields: [
              { name: "지원 분야", value: data.position || " ", inline: true },
              { name: "디스코드 태그", value: data.discordTag || " ", inline: true },
              { name: "나이", value: data.age ? data.age + "세" : " ", inline: true },
              { name: "자기소개", value: data.intro || " " },
              { name: "경험 (선택)", value: data.experience || "없음" }
            ]
          }]
        }),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}