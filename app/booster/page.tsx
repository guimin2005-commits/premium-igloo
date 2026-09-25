"use client";

import BackLink from "../components/BackLink";
import { INFO_WRAP, InfoHead, INK_BTN } from "../components/InfoPage";
import BoosterBenefits, { BOOSTER_DISCORD } from "./BoosterBenefits";

// 📌 서버 부스터 혜택 — 비로그인 유저도 볼 수 있는 공개 페이지 (부스팅 유도).
//    본문은 내 정보의 부스터 화면(/profile/booster)과 같은 것을 쓴다 — 골격은 app/components/InfoPage.
export default function BoosterPage() {
  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <section className={INFO_WRAP}>
        <BackLink href="/" label="홈" inline className="mb-6" />
        <InfoHead title="서버 부스터" sub="부스트를 시작하면 아래 혜택이 자동으로 지급됩니다." />
        <BoosterBenefits />
        <div className="pt-10 pb-24 md:pb-16">
          <a href={BOOSTER_DISCORD} target="_blank" rel="noopener noreferrer" className={INK_BTN}>
            서버에서 부스트하기
          </a>
        </div>
      </section>
    </main>
  );
}
