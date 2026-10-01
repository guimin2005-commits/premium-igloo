"use client";

import React, { useState } from "react";
import CardArt from "./CardArt";
import { FitBox, ProfileCardPreview, BadgePreview, whoOf, badgeOfItem, type ShopItemLike } from "./CosmeticPreview";

// 📌 상품 상세 왼쪽 큰 그림 칸 — 꾸미기 상품(카드 스킨 · 프로필 배지 — API item.cosmetic)은 아래 썸네일 줄로 '적용 모습'을 넘겨 본다
//    (쇼핑몰 상품 사진 넘기기처럼, 화면 이동 없이 그 자리에서). [상품] [카드 스킨] [디스코드 카드] [프로필 배지] — 가진 것만.
//    썸네일은 칸 크기 고정(모바일 56 · PC 64px — 넷이어도 320px 폰 한 줄) · 테두리 두께 고정이라 눌러도 아무것도 움직이지 않는다.
//    꾸미기가 아니면 지금 칸 그대로(썸네일 줄 없음).
//    디스코드 카드는 봇이 그 스킨을 그릴 수 있을 때만(cosmetic.botCard) — /api/shop/skin-card 가 예시 사람으로 그린 PNG. 그림을 못 받으면 그 썸네일을 뺀다
type View = "item" | "card" | "discord" | "badge";
const DISCORD_BG = "#313338"; // 디스코드 채팅 바탕 — 봇 카드가 실제로 놓이는 자리

type GalleryItem = ShopItemLike & { cosmetic?: { skin?: string; badge?: boolean; botCard?: boolean } | null };

export default function ItemGallery({ item, soldOut, user, me }: {
  item: GalleryItem;
  soldOut: boolean;
  user: { name?: string | null; image?: string | null } | null | undefined;
  me: unknown;
}) {
  const cos = item?.cosmetic && typeof item.cosmetic === "object" ? item.cosmetic : null;
  const skin = typeof cos?.skin === "string" ? cos.skin : "";
  // 📌 디스코드 카드 PNG 를 못 받으면(400 · 500 · 네트워크) 그 썸네일을 뺀다 — 빈 검은 칸이 남지 않게. 보던 중이면 상품 그림으로
  const [discordFail, setDiscordFail] = useState(false);
  const views: { k: View; label: string }[] = [{ k: "item", label: "상품 이미지" }];
  if (skin) views.push({ k: "card", label: "카드 스킨 적용 모습" });
  if (skin && cos?.botCard && !discordFail) views.push({ k: "discord", label: "디스코드 카드" });
  if (cos?.badge) views.push({ k: "badge", label: "프로필 배지 적용 모습" });

  const [pick, setPick] = useState<View>("item");
  const view = views.some((v) => v.k === pick) ? pick : "item";
  const who = whoOf(user, me);

  // 큰 칸 · 썸네일이 같은 그림을 쓴다 — 썸네일은 FitBox 가 더 작게 줄일 뿐
  const art = (k: View, thumb: boolean) => {
    if (k === "card") return <FitBox pad={thumb ? 0.84 : 0.9}><ProfileCardPreview who={who} skin={skin} /></FitBox>;
    if (k === "badge") return <FitBox pad={thumb ? 0.9 : 0.86}><BadgePreview who={who} badge={badgeOfItem(item)} /></FitBox>;
    if (k === "discord") {
      return (
        <div aria-hidden className="absolute inset-0 flex items-center justify-center" style={{ background: DISCORD_BG }}>
          {/* 칸은 카드 비율(1200 × 630)로 먼저 잡아 둔다 — 그림이 늦게 와도 자리가 그대로 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/shop/skin-card?skin=${encodeURIComponent(skin)}`} alt="" draggable={false} decoding="async"
            onError={() => setDiscordFail(true)}
            className={`block bg-[#1b1b1b] select-none ${thumb ? "rounded-[3px]" : "rounded-lg"}`} style={{ width: "88%", aspectRatio: "1200 / 630" }} />
        </div>
      );
    }
    return <CardArt it={item} stage={!thumb} iconSize={30} />;
  };

  return (
    <div className="min-w-0">
      <div className="relative aspect-square rounded-2xl bg-[#f2f2f2] border border-[#ededed] overflow-hidden">
        {art(view, false)}
        {view === "item" && soldOut && (
          <div className="absolute inset-0 bg-[#131313]/55 flex items-center justify-center">
            <span className="text-lg font-black text-white tracking-wider">SOLD OUT</span>
          </div>
        )}
      </div>

      {views.length > 1 && (
        <div className="mt-3 flex">
          {views.map((v, i) => {
            const on = v.k === view;
            return (
              <button
                key={v.k}
                type="button"
                onClick={() => setPick(v.k)}
                aria-label={v.label}
                aria-pressed={on}
                title={v.label}
                className={`relative shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-xl overflow-hidden bg-[#f2f2f2] border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/40 ${i > 0 ? "ml-2" : ""} ${
                  on ? "border-[#131313]" : "border-[#ededed] hover:border-[#a3a3a3]"
                }`}
              >
                {art(v.k, true)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
