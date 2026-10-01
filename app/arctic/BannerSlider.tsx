"use client";

import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { siteHref } from "@/lib/siteLink";

// 📌 ARCTIC 상단 이미지 배너 — 홈 맨 위와 스토어 시즌 탭 맨 위가 이 한 벌을 같이 쓴다.
//    배너는 관리자가 노출 위치(홈 · 시즌 탭)를 골라 등록한다 (관리자 → 상점 관리 → 배너, app/api/shop/banners).
//    상태(목록 · 지금 장 · 틀 비율)는 useBanners 로 ArcticShopBody 가 위치마다 한 벌씩 들고 있다 —
//    홈 ↔ 상품 화면을 오가도 보던 장 · 비율이 그대로 남게. 여기는 그리기만.

export type BannerPlacement = "home" | "season";

// 📌 768px 미만(모바일)인가 — 배너는 클라이언트에서 받아 오므로 첫 화면(SSR)과 어긋나 번쩍일 일이 없다.
//    컨테이너 단위 · round() 는 일부 브라우저에서 안 먹었다 — 폭 판정은 matchMedia 로만 한다.
//    (옛 Safari 는 MediaQueryList.addEventListener 가 없어 addListener 로 받는다)
const NARROW_MQ = "(max-width: 767.98px)";
const subNarrow = (cb: () => void) => {
  const mq = window.matchMedia(NARROW_MQ);
  if (mq.addEventListener) { mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); }
  mq.addListener(cb);
  return () => mq.removeListener(cb);
};
const useNarrow = () => useSyncExternalStore(subNarrow, () => window.matchMedia(NARROW_MQ).matches, () => false);
// 모바일 배너 틀 비율 범위 (관리자 배너 편집의 모바일 미리보기와 같은 값)
const M_RATIO_MIN = 0.8;
const M_RATIO_MAX = 3;
// 📌 이미지를 불러오기 전 틀 비율 — 관리자 배너 편집의 권장 크기와 같다(PC 2400×600 = 4:1 · 모바일 1080×720 = 3:2).
//    목록을 받는 동안 잡아 두는 자리도 이 비율이라, 받은 뒤 · 이미지가 뜬 뒤에도 높이가 그대로다
const PC_RATIO = 4;
const M_RATIO_DEFAULT = 1.5;
const hasMobileArt = (b: any) => typeof b?.mobileImageUrl === "string" && b.mobileImageUrl.trim() !== "";
// 위치마다 지난번에 받은 배너 수 — 모듈에 둔다(화면을 떠났다 돌아와도 남는다). 클라이언트에서 받은 뒤에만 채워진다
const lastCount: Partial<Record<BannerPlacement, number>> = {};
// 바탕 · 바깥 여백은 배너와 자리(불러오는 중)가 한 벌 — 둘의 높이가 어긋나지 않게
const BOX = "max-w-7xl mx-auto px-5 md:px-8 pt-5 md:pt-6";
const FRAME = "relative overflow-hidden bg-[#f2f2f2]";

// ── 배너 상태 한 벌 (위치 하나) ──
//    status 는 next-auth 세션 상태 — 세션이 정해진 뒤에 받는다(관리자는 숨김 배너까지 ?all=1).
//    홈은 주소에 위치를 붙이지 않는다(서버 기본 = 홈) — 예전과 같은 요청 그대로.
//    playing 이 false 면 자동 넘김을 멈춘다(시즌 탭이 안 보일 때 뒤에서 넘기며 다시 그리지 않게)
export function useBanners(placement: BannerPlacement, status: string, isAdmin: boolean, playing = true) {
  const [banners, setBanners] = useState<any[]>([]);
  // 📌 목록을 받기 전에는 배너 자리를 미리 잡아 둔다(BannerSlider) — 받은 뒤 배너가 생기며 아래 내용이 밀리지 않게.
  //    지난번에 받아 보니 0개였던 자리는 처음부터 '받음'으로 쳐 자리를 잡지 않는다(잡았다 없애면 한 번 줄어든다)
  const [loaded, setLoaded] = useState(() => lastCount[placement] === 0);
  const [idx, setIdx] = useState(0);
  /* 📌 배너 틀 비율 — 이미지가 실제로 가진 비율에 맞춘다.
     틀을 3/1(모바일)·4/1(PC) 로 고정해 두면 object-cover 가 남는 쪽을 잘라내
     같은 배너가 기기마다 다르게 보인다(모바일에서 좌우가 잘렸다).
     여러 장이면 가장 넓은 비율에 맞춰 어느 것도 좌우가 잘리지 않게 한다. */
  const [ratio, setRatio] = useState(PC_RATIO);
  const fitRatio = (img: HTMLImageElement) => {
    const r = img.naturalWidth / img.naturalHeight;
    if (!Number.isFinite(r) || r <= 0) return;
    setRatio((prev) => Math.min(8, Math.max(2.5, Math.max(prev, r))));
  };

  useEffect(() => {
    if (status === "loading") return;
    const qs = [isAdmin ? "all=1" : "", placement !== "home" ? `placement=${placement}` : ""].filter(Boolean).join("&");
    fetch(`/api/shop/banners${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.data) ? d.data : [];
        lastCount[placement] = list.length;
        setRatio(PC_RATIO);
        setBanners(list);
        // 📌 다시 받아 장 수가 줄면(관리자 '유저 화면' 미리보기 → 숨김 배너 빠짐) 보던 장 번호가 목록 밖이라 틀이 회색으로 비었다 — 첫 장으로
        setIdx((i) => (i < list.length ? i : 0));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [status, isAdmin, placement]);

  // 📌 배너 자동 넘김 — 한 장에 8초(2026-10-01 "교체 시간이 짧다": 5초 → 8초).
  //    지금 장이 바뀔 때마다 새로 잰다 — 점을 눌러 넘긴 직후 바로 다음 장으로 튀지 않게
  useEffect(() => {
    if (!playing || banners.length < 2) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % banners.length), 8000);
    return () => clearTimeout(t);
  }, [playing, banners.length, idx]);

  return { banners, loaded, idx, setIdx, ratio, fitRatio };
}

type Props = {
  banners: any[];
  bannerIdx: number;
  setBannerIdx: (i: number) => void;
  bannerRatio: number;
  fitRatio: (img: HTMLImageElement) => void;
  isAdmin: boolean;
  loaded: boolean; // useBanners 의 loaded — 목록을 받기 전이면 배너 자리만 잡아 둔다
};

export default function BannerSlider({ banners, bannerIdx, setBannerIdx, bannerRatio, fitRatio, isAdmin, loaded }: Props) {
  // 📌 모바일 배너 — 폰에서는 모바일 이미지가 있는 배너만 돈다(2026-10-01 "모바일에서 모바일 배너 적용이 안 된다":
  //    예전엔 한 장이라도 모바일 이미지가 없으면 전부 PC 이미지로 돌아가, 배너 하나 때문에 다 PC 로 보였다).
  //    모바일 이미지가 하나도 없으면 PC 이미지 그대로(4:1 이미지를 폰 틀에 억지로 넣으면 위아래가 크게 비거나 잘린다).
  //    틀 비율은 PC(fitRatio)와 같은 규칙 — 불러온 모바일 이미지 중 가장 넓은 비율에 맞춰 어느 것도 좌우가 잘리지 않게.
  const narrow = useNarrow();
  const mobileArt = narrow && banners.some(hasMobileArt);
  // 보여 줄 배너인가 — 폰(모바일 이미지 모드)에서는 모바일 이미지가 있는 것만
  const shows = (b: any) => !mobileArt || hasMobileArt(b);
  const shownCount = banners.filter(shows).length;
  // 자동 넘김(useBanners)은 전체 목록 기준이라, 폰에서 안 보이는 배너 차례가 오면 다음 보이는 배너로 바로 넘긴다
  useEffect(() => {
    if (!mobileArt || !banners[bannerIdx] || shows(banners[bannerIdx])) return;
    const next = banners.findIndex((b, i) => i > bannerIdx && shows(b));
    setBannerIdx(next >= 0 ? next : banners.findIndex(shows));
  }, [mobileArt, bannerIdx, banners]); // eslint-disable-line react-hooks/exhaustive-deps
  const [mRatios, setMRatios] = useState<Record<string, number>>({}); // 이미지 주소 → 실제 비율
  const fitMobile = (url: string, img: HTMLImageElement) => {
    const r = img.naturalWidth / img.naturalHeight;
    if (!Number.isFinite(r) || r <= 0) return;
    setMRatios((prev) => (prev[url] === r ? prev : { ...prev, [url]: r }));
  };
  const mRatio = useMemo(() => {
    const rs = banners.map((b) => mRatios[String(b.mobileImageUrl || "").trim()]).filter((r): r is number => !!r);
    // 아직 한 장도 안 불러왔으면 권장 비율(3:2) 자리를 잡아 둔다 — 목록을 받는 동안의 자리와 같은 높이
    return rs.length ? Math.min(M_RATIO_MAX, Math.max(M_RATIO_MIN, Math.max(...rs))) : M_RATIO_DEFAULT;
  }, [banners, mRatios]);

  /* 📌 목록을 받는 동안 — 배너와 같은 바탕 · 여백 · 비율(모바일 3:2 · PC 4:1)의 빈 자리.
        폭 판정은 CSS(md) 로 한다 — 첫 화면(SSR)에서도 폰은 폰 비율로 잡히게(useNarrow 는 서버에서 늘 PC). */
  if (!loaded) {
    return (
      <section aria-hidden className={BOX}>
        <div className={FRAME}>
          <div className="md:hidden" style={{ aspectRatio: String(M_RATIO_DEFAULT) }}></div>
          <div className="hidden md:block" style={{ aspectRatio: String(PC_RATIO) }}></div>
        </div>
      </section>
    );
  }
  /* ── 받아 보니 등록된 배너가 없으면 이 자리는 아예 없다.
        예전엔 시즌 히어로(민트 화면)를 대신 깔았는데 들어올 때마다 튀어나와 없앴다.
        모서리는 각지게, 폭은 본문 폭 안에 (화면 끝까지 채우면 너무 꽉 찬다) ── */
  if (banners.length === 0) return null;
  return (
    <section className={BOX}>
      <div className={FRAME}>
        <div className="relative" style={{ aspectRatio: String(mobileArt ? mRatio : bannerRatio) }}>
          {banners.map((b, i) => {
            if (!shows(b)) return null;
            const mUrl = String(b.mobileImageUrl || "").trim();
            const inner = (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mobileArt ? mUrl : b.imageUrl} alt={b.title || ""}
                  onLoad={(e) => (mobileArt ? fitMobile(mUrl, e.currentTarget) : fitRatio(e.currentTarget))}
                  className="absolute inset-0 w-full h-full object-cover" />
                {(b.title || b.subtitle) && (
                  <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent flex flex-col justify-center px-5 sm:px-10 md:px-12">
                    {b.title && <h2 className="text-base sm:text-2xl md:text-3xl font-black tracking-tight text-white mb-0.5 sm:mb-1 break-keep line-clamp-2">{b.title}</h2>}
                    {b.subtitle && <p className="text-[11px] sm:text-sm text-white/85 break-keep line-clamp-1 sm:line-clamp-2">{b.subtitle}</p>}
                  </div>
                )}
              </>
            );
            return (
              <div key={b._id}
                className={`absolute inset-0 transition-opacity duration-700 ${i === bannerIdx ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                {/* 우리 사이트 전체 주소로 넣은 링크도 지금 화면 안에서 연다(siteHref) */}
                {b.link ? <Link href={siteHref(b.link)} className="block w-full h-full relative">{inner}</Link> : inner}
              </div>
            );
          })}
        </div>
        {shownCount > 1 && (
          <div className="absolute bottom-4 right-5 flex gap-1.5 z-10">
            {banners.map((b, i) => !shows(b) ? null : (
              <button key={b._id} onClick={() => setBannerIdx(i)} aria-label={`배너 ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === bannerIdx ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`}></button>
            ))}
          </div>
        )}

        {isAdmin && (
          <Link href="/admin/shop?tab=banners"
            className="absolute top-4 right-4 z-10 px-3 py-1.5 rounded-full text-[11px] font-bold bg-white/95 text-[#131313] border border-[#ededed] hover:bg-white shadow-sm transition-colors">
            배너 관리
          </Link>
        )}
      </div>
    </section>
  );
}
