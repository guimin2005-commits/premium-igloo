"use client";

import React from "react";
import { SEASON, getSeasonDday } from "@/lib/season";
import { secHead, secTitle } from "./ArcticHome";

// 📌 스토어 '시즌' 탭 첫 화면 조각 — 홈(ArcticHome)과 같은 문법(섹션 머리 · 두 갈래 큐레이션).
//    순서: 시즌 배너(BannerSlider · 노출 위치 '시즌 탭') → 시즌 머리줄 → 필터 줄 → 두 갈래 큐레이션 → 전체 격자.
//    필터 줄을 큐레이션 위에 두는 건 필터 · 정렬을 걸어 큐레이션이 빠져도 누른 줄이 제자리에 있게 하려는 것.
//    상품 카드는 부모의 renderCard 를 그대로 받아 쓴다 (찜 · 장바구니 · 구매가 한 벌).

// 시즌 상품이 이보다 적으면 큐레이션 없이 바로 전체 격자 — 몇 개 안 되는 걸 위아래로 두 번 보여 주지 않게
const PICKS_MIN = 8;

const created = (it: any) => new Date(it?.createdAt || 0).getTime();

// 📌 시즌 머리줄 — 시즌 번호 · 이름 · D-day 만 (홈 '이번 주' 시즌 칸과 같은 값)
export function SeasonHead() {
  const dday = getSeasonDday();
  return (
    <div className={secHead}>
      <h2 className={secTitle}>
        <span className="text-[#e91e3f]">시즌 {SEASON.number}</span> {SEASON.name}
      </h2>
      <span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums shrink-0">
        {dday.ended ? "시즌 종료" : `종료까지 D-${Math.max(0, dday.days)}`}
      </span>
    </div>
  );
}

type Pick = { title: string; items: any[] };

// 📌 두 갈래 고르기 — list 는 목록 화면이 이미 거른 시즌 상품(추천순 · 카드 값 _pick 포함).
//    왼쪽: 꾸미기(시즌 꾸미기 상품이 2개 이상일 때) → 없으면 잘 나가는(판매 수) → 팔린 게 없으면 추천순 앞 2개.
//    오른쪽: 새로 들어온(등록 최신순, 왼쪽과 겹치지 않게). 숨김 상품(관리자만 보는 것)은 빼고 고른다.
export function seasonPicks(list: any[]): [Pick, Pick] | null {
  const on = list.filter((it) => it.active !== false);
  if (on.length < PICKS_MIN) return null;
  const deco = on.filter((it) => it.type === "cosmetic");
  const sold = on.some((it) => (it.soldCount || 0) > 0);
  const left: Pick = deco.length >= 2
    ? { title: "꾸미기", items: deco.slice(0, 2) }
    : sold
      ? { title: "잘 나가는", items: [...on].sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0)).slice(0, 2) }
      : { title: "추천", items: on.slice(0, 2) };
  const taken = new Set(left.items.map((it) => it._id));
  const right: Pick = { title: "새로 들어온", items: on.filter((it) => !taken.has(it._id)).sort((a, b) => created(b) - created(a)).slice(0, 2) };
  return [left, right];
}

// 📌 두 갈래 큐레이션 + '전체' 머리 — 홈 두 갈래와 같은 틀(반반에 두 장, xl 은 가운데 여백을 넓혀 카드 폭을 목록과 맞춘다)
export function SeasonPicks({ picks, renderCard }: { picks: [Pick, Pick]; renderCard: (it: any) => React.ReactNode }) {
  const [left, right] = picks;
  return (
    <>
      <div className="grid md:grid-cols-2 gap-10 md:gap-0">
        <div className="md:pr-10 xl:pr-28">
          <div className={secHead}>
            <h2 className={secTitle}>{left.title}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 md:gap-5">{left.items.map((it) => renderCard(it))}</div>
        </div>
        <div className="md:border-l md:border-[#ededed] md:pl-10 xl:pl-28">
          <div className={secHead}>
            <h2 className={secTitle}>{right.title}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 md:gap-5">{right.items.map((it) => renderCard(it))}</div>
        </div>
      </div>
      <div className={`${secHead} pt-12 md:pt-14`}>
        <h2 className={secTitle}>전체</h2>
      </div>
    </>
  );
}
