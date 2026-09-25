"use client";

import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import BackLink from "../../components/BackLink";
import ArcticDock from "../../arctic/ArcticDock";
import { INFO_WRAP, InfoHead, InfoBadge, INK_BTN } from "../../components/InfoPage";
import BoosterBenefits, { BOOSTER_DISCORD } from "../../booster/BoosterBenefits";

// 📌 서버 부스터 — 내 정보에서 여는 화면. 공개 안내(/booster)와 같은 본문 · 같은 골격을 쓰고,
//    다른 건 돌아가는 길(내 정보)과 적용 중 표시뿐이다. 부스터가 아니면 맨 아래에 부스트하기.
export default function BoosterBenefitPage() {
  const { data: session } = useSession();
  const fromArctic = useSearchParams().get("from") === "arctic";
  const q = fromArctic ? "?from=arctic" : "";
  const isBooster = (session?.user as any)?.isBooster || false;

  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <section className={INFO_WRAP}>
        <BackLink href={`/profile${q}`} label="내 정보" inline className="mb-6" />
        <InfoHead
          title="서버 부스터"
          sub="부스트를 시작하면 아래 혜택이 자동으로 지급됩니다."
          badge={isBooster ? <InfoBadge>적용 중</InfoBadge> : null}
        />
        <BoosterBenefits />
        <div className={isBooster ? "pb-24 md:pb-16" : "pt-10 pb-24 md:pb-16"}>
          {!isBooster && (
            <a href={BOOSTER_DISCORD} target="_blank" rel="noopener noreferrer" className={INK_BTN}>
              서버에서 부스트하기
            </a>
          )}
        </div>
      </section>
      {fromArctic && <ArcticDock activeKey="me" />}
    </main>
  );
}
