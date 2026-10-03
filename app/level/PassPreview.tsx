"use client";

import React, { useEffect, useRef, useState } from "react";
import ItemIcon from "../components/ItemIcon";
import { ICON_PATHS } from "../components/Icons";
import { POP_THEME } from "../components/PopShell";
import { itemTypeColor } from "@/lib/items";
import { FitBox, ProfileCardPreview, BadgePreview, whoOf, badgeOfItem } from "../arctic/CosmeticPreview";

// 📌 시즌 패스 꾸미기 보상(카드 스킨 · 프로필 배지)의 적용 미리보기 — 상점 상품 상세 '적용 미리보기'(app/arctic/AppliedPreview)와 같은 그림.
//    (2026-10-03 사용자: "시즌패스에 '꾸미기 - 카드' 가 들어갈 때가 있는데 상점과 달리 미리보기 시안이 없어서..")
//    패스 창(app/level/page.js PassModal) 위에 겹쳐 뜨는 작은 판 — 폰은 아래에서 올라오는 판. 닫기 · 바깥 누르기 · Esc(Esc 는 PassModal 이 받아 이 판만 닫는다)
//    데이터: /api/pass 보상 칸의 cosmetic { skin, badge, botCard } (lib/itemCosmetic — 상점 상세와 같은 계산) · 아이콘 스냅샷.
//    사람: 로그인했으면 내 이름 · 사진 · 레벨(/api/xp/me), 아니면 예시. 디스코드 /레벨 카드는 봇이 그 스킨을 그릴 수 있을 때만, 그림을 못 받으면 그 칸을 뺀다.
//    칸 크기는 바깥이 정하고 그림은 FitBox 가 줄이기만 해서 그림이 늦게 와도 아무것도 밀리지 않는다(AppliedPreview 와 같은 방식).
const DISCORD_BG = "#313338"; // 디스코드 채팅 바탕 — 봇 카드가 실제로 놓이는 자리
const BOX_BG = "rgba(255,255,255,0.05)";

type Cosmetic = { skin?: string; badge?: boolean; botCard?: boolean };
export type PassReward = {
  key?: string; itemId?: string; itemName?: string; icon?: string; imageUrl?: string; color?: string; itemType?: string;
  short?: string; label?: string; cosmetic?: Cosmetic | null;
};

// 미리보기를 띄울 보상인가 — 꾸미기 효과(카드 스킨 · 프로필 배지)가 실린 아이템 보상만
export const passCosmeticOf = (r: PassReward | null | undefined): Cosmetic | null => {
  const c = r?.cosmetic;
  return c && typeof c === "object" && (c.skin || c.badge) ? c : null;
};

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-[11px] font-bold text-white/45">{children}</p>
);

export default function PassPreview({ r, user, me, onClose }: {
  r: PassReward;
  user: { name?: string | null; image?: string | null } | null | undefined;
  me: unknown;
  onClose: () => void;
}) {
  const [discordFail, setDiscordFail] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);
  const cos = passCosmeticOf(r);
  if (!cos) return null;

  const skin = typeof cos.skin === "string" ? cos.skin : "";
  const who = whoOf(user, me);
  const showDiscord = !!skin && !!cos.botCard && !discordFail;
  // PC 는 프로필 카드 | (디스코드 · 배지) 두 칸 — 한 칸뿐이면 판을 좁게
  // 📌 폭은 '받을 칸이 있는지'로 정한다 — 디스코드 그림이 실패해도 판 · 프로필 카드 폭은 처음 그대로, 오른쪽 내용만 빠진다(상점 AppliedPreview 와 같다)
  const side = (!!skin && !!cos.botCard) || !!cos.badge;
  const two = !!skin && side;
  // 로그인했으면 본인 카드(me=1 — 세션으로만 판단), 아니면 예시 카드(공개 캐시)
  const discordSrc = `/api/shop/skin-card?skin=${encodeURIComponent(skin)}${user ? "&me=1" : ""}`;
  const name = r.short || r.label || r.itemName || "";
  // 배지 그림 — 보상 칸에 실린 등록 아이템 스냅샷(상점 상세의 badgeOfItem 과 같은 칸 이름으로 옮겨 담는다)
  const badge = badgeOfItem({ itemId: r.itemId, name: r.itemName, icon: r.icon, itemImageUrl: r.imageUrl, color: r.color, type: r.itemType || "cosmetic" });

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(10,10,10,0.45)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={name}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${two ? "sm:max-w-[740px]" : "sm:max-w-[420px]"} max-h-[88dvh] sm:max-h-[92vh] overflow-hidden rounded-t-3xl sm:rounded-3xl flex flex-col`}
        style={{
          background: POP_THEME.pass.bg,
          boxShadow: "0 40px 90px -30px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(214,180,255,0.18)",
          animation: "tierIn .32s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* 모바일 바텀시트 손잡이 */}
        <div aria-hidden className="sm:hidden shrink-0 flex justify-center pt-2.5"><span className="w-10 h-1 rounded-full bg-white/20"></span></div>

        {/* 머리 — 보상 아이콘 · 이름 | 닫기 */}
        <div className="shrink-0 flex items-center px-4 sm:px-6 pt-3 sm:pt-5 pb-3 sm:pb-4">
          <span className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: BOX_BG }}>
            <ItemIcon icon={r.icon} imageUrl={r.imageUrl} type={r.itemType} size={28} color={r.color || (r.itemType ? itemTypeColor(r.itemType) : undefined)} />
          </span>
          <h3 className="ml-3 min-w-0 flex-1 truncate text-[17px] font-black text-white tracking-tight">{name}</h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="ml-3 shrink-0 w-9 h-9 rounded-full border border-white/15 text-white/55 hover:text-white hover:border-white/35 transition-colors flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2"><path d={ICON_PATHS.close} strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* 본문 — 폰은 세로로 쌓고 넘치면 이 안에서만 스크롤. PC 는 프로필 카드(고정 폭) | 디스코드 · 배지 */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 pb-5 sm:pb-6" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.22) transparent" }}>
          <div className={two ? "sm:flex sm:items-start" : ""}>
            {skin && (
              <div className={two ? "sm:w-[300px] sm:shrink-0" : ""}>
                <Label>프로필 카드</Label>
                {/* 레벨 페이지 카드(360 폭)를 칸에 맞춰 줄인다 — 폰은 칸 비율(4:5), PC 는 고정 높이 */}
                <div className="relative w-full aspect-[4/5] sm:aspect-auto sm:h-[440px] rounded-2xl overflow-hidden" style={{ background: BOX_BG }}>
                  <FitBox pad={0.92} max={1}>
                    <ProfileCardPreview who={who} skin={skin} />
                  </FitBox>
                </div>
              </div>
            )}
            {side && (
              <div className={`min-w-0 ${skin && (showDiscord || cos.badge) ? "mt-4 sm:mt-0" : ""} ${two ? "sm:ml-4 sm:flex-1" : ""}`}>
                {showDiscord && (
                  <div>
                    <Label>디스코드 /레벨</Label>
                    <div className="rounded-2xl p-3 sm:p-4" style={{ background: DISCORD_BG }}>
                      {/* 칸은 카드 비율(1200 × 630)로 먼저 잡아 둔다 — 그림이 늦게 와도 자리가 그대로 */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img key={discordSrc} src={discordSrc} alt="" draggable={false} decoding="async" onError={() => setDiscordFail(true)}
                        className="block w-full rounded-lg bg-[#1b1b1b] select-none" style={{ aspectRatio: "1200 / 630" }} />
                    </div>
                  </div>
                )}
                {cos.badge && (
                  <div className={showDiscord ? "mt-4" : ""}>
                    <Label>프로필 배지</Label>
                    <div className="relative w-full h-[240px] rounded-2xl overflow-hidden" style={{ background: BOX_BG }}>
                      <FitBox pad={0.9} max={1.2}>
                        <BadgePreview who={who} badge={badge} />
                      </FitBox>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
