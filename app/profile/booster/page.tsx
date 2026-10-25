"use client";

import { useSearchParams } from "next/navigation";
import ArcticDock from "../../arctic/ArcticDock";
import BoosterBenefits from "../../booster/BoosterBenefits";

// 📌 서버 부스터 — 내 정보에서 여는 화면. 공개 안내(/booster)와 같은 부품(../../booster/BoosterBenefits — 2026-10-24 「비교형」)을 쓰고,
//    다른 건 돌아가는 길(내 정보)뿐이다. 부스터면 머리 오른쪽이 「적용 중 · 시작일」, 아니면 부스트하기(부품이 GET /api/booster 의 me 로 고른다)
export default function BoosterBenefitPage() {
  const fromArctic = useSearchParams().get("from") === "arctic";
  const q = fromArctic ? "?from=arctic" : "";
  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <BoosterBenefits back={{ href: `/profile${q}`, label: "내 정보" }} />
      {fromArctic && <ArcticDock activeKey="me" />}
    </main>
  );
}
