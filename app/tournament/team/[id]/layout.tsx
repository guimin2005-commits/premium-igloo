import type { Metadata } from "next";
import { connectToDatabase } from "@/lib/mongodb";
import { ScrimTeam, ScrimSeason } from "@/models/Scrim";

/* 📌 팀 룸 링크 프리뷰
   디스코드에 링크를 붙이면 여기서 만든 제목·설명이 뜬다.
   루트 메타데이터를 그대로 쓰면 어느 팀 링크든 "고급 이글루 / 공식 사이트" 로만 보인다. */

const fmt = (d: Date | string) =>
  new Date(d).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long", timeStyle: "short" });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const fallback: Metadata = { title: "팀 룸 · 고급 이글루", description: "대회에 참가한 팀이 머무는 공간" };
  try {
    const { id } = await params;
    await connectToDatabase();
    const t: any = await ScrimTeam.findById(id).lean();
    if (!t) return fallback;

    const season: any = await ScrimSeason.findOne({ active: true }).sort({ createdAt: -1 }).lean();
    const title = `${t.name} · 팀 룸`;
    const description = season?.dueAt
      ? `스크림 캘린더 · 가능한 시간 제출 마감 ${fmt(season.dueAt)}`
      : `${t.name} 팀 룸 — 일정·대진·로스터`;

    return {
      title,
      description,
      openGraph: { title, description, siteName: "고급 이글루", type: "website" },
      // 큰 그림 카드는 팀 룸에 어울리지 않는다 — 작은 썸네일로
      twitter: { card: "summary", title, description },
    };
  } catch {
    return fallback;
  }
}

export default function TeamRoomLayout({ children }: { children: React.ReactNode }) {
  return children;
}
