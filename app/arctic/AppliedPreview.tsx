"use client";

import React, { useState } from "react";
import { FitBox, ProfileCardPreview, BadgePreview, whoOf, badgeOfItem, type ShopItemLike } from "./CosmeticPreview";

// 📌 상품 상세 '적용 미리보기' — 꾸미기 상품(카드 스킨 · 프로필 배지 — API item.cosmetic)을 효과 칸 아래 전체 폭으로 보여 준다
//    (2026-10-01 사용자: "미리보기 이미지가 효과 아래 부분에 들어가면 좋겠어", "미리보기는 개인의 프로필이 적용되게").
//    로그인했으면 내 이름 · 사진 · 레벨 · 순위로 — 레벨 페이지 프로필 카드(사이트에서 그림) + 디스코드 /레벨 카드(/api/shop/skin-card?me=1, 서버가 세션의 본인 값으로 그림).
//    로그인 안 했으면 예시 사람. 디스코드 카드는 봇이 그 스킨을 그릴 수 있을 때만(cosmetic.botCard), 그림을 못 받으면 그 칸을 뺀다.
//    칸 크기는 바깥이 정하고 안의 그림은 FitBox 가 줄이기만 해서 그림이 늦게 와도 아무것도 밀리지 않는다.
const DISCORD_BG = "#313338"; // 디스코드 채팅 바탕 — 봇 카드가 실제로 놓이는 자리

type Item = ShopItemLike & { cosmetic?: { skin?: string; badge?: boolean; botCard?: boolean } | null };

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-[12px] font-bold text-[#5a5a5a]">{children}</p>
);

export default function AppliedPreview({ item, user, me }: {
  item: Item;
  user: { name?: string | null; image?: string | null } | null | undefined;
  me: unknown;
}) {
  const cos = item?.cosmetic && typeof item.cosmetic === "object" ? item.cosmetic : null;
  const skin = typeof cos?.skin === "string" ? cos.skin : "";
  const [discordFail, setDiscordFail] = useState(false);
  if (!cos || (!skin && !cos.badge)) return null;
  const who = whoOf(user, me);
  const showDiscord = !!skin && !!cos.botCard && !discordFail;
  // 로그인했으면 본인 카드(me=1 — 세션으로만 판단, 남의 값을 그릴 길은 없다), 아니면 예시 카드(공개 캐시)
  const discordSrc = `/api/shop/skin-card?skin=${encodeURIComponent(skin)}${user ? "&me=1" : ""}`;

  return (
    <div className="mt-14 pt-10 border-t border-[#ededed]">
      <h2 className="text-base font-black text-[#131313] tracking-tight mb-5">적용 미리보기</h2>
      <div className={`grid grid-cols-1 gap-4 ${skin ? "md:grid-cols-2" : ""}`}>
        {skin && (
          <div>
            <Label>프로필 카드</Label>
            {/* 레벨 페이지 카드(360 폭)를 제 크기 이하로 — 폰은 칸 폭에 맞춰 줄인다 */}
            <div className="relative w-full aspect-[4/5] md:aspect-auto md:h-[600px] rounded-2xl bg-[#f2f2f2] overflow-hidden">
              <FitBox pad={0.92} max={1}>
                <ProfileCardPreview who={who} skin={skin} />
              </FitBox>
            </div>
          </div>
        )}
        {(showDiscord || cos.badge) && (
          <div className="min-w-0">
            {showDiscord && (
              <div className={cos.badge ? "mb-4" : ""}>
                <Label>디스코드 /레벨</Label>
                <div className="rounded-2xl p-4 md:p-5" style={{ background: DISCORD_BG }}>
                  {/* 칸은 카드 비율(1200 × 630)로 먼저 잡아 둔다 — 그림이 늦게 와도 자리가 그대로 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img key={discordSrc} src={discordSrc} alt="" draggable={false} decoding="async" onError={() => setDiscordFail(true)}
                    className="block w-full rounded-lg bg-[#1b1b1b] select-none" style={{ aspectRatio: "1200 / 630" }} />
                </div>
              </div>
            )}
            {cos.badge && (
              <div>
                <Label>프로필 배지</Label>
                <div className="relative w-full h-[260px] rounded-2xl bg-[#f2f2f2] overflow-hidden">
                  <FitBox pad={0.9} max={1.2}>
                    <BadgePreview who={who} badge={badgeOfItem(item)} />
                  </FitBox>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
