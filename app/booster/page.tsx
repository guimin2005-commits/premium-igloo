"use client";

import BoosterBenefits from "./BoosterBenefits";

// 📌 서버 부스터 혜택 — 비로그인 유저도 볼 수 있는 공개 페이지 (부스팅 유도).
//    화면은 내 정보의 부스터 화면(/profile/booster)과 같은 부품(./BoosterBenefits — 2026-10-24 「비교형」)이고 돌아가는 길만 다르다
export default function BoosterPage() {
  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <BoosterBenefits back={{ href: "/", label: "홈" }} />
    </main>
  );
}
