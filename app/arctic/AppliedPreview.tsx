"use client";

import React, { useEffect, useRef, useState } from "react";
import { FitBox, ProfileCardPreview, BadgePreview, Avatar, whoOf, badgeOfItem, useTodayXp, type ShopItemLike, type Badge } from "./CosmeticPreview";
import AvatarFrame from "../components/AvatarFrame";
import ItemIcon from "../components/ItemIcon";
import { FRAME_OF, MAX_BADGES } from "@/lib/itemEffects";
import { itemTypeColor } from "@/lib/items";
import { splitItemName } from "@/lib/itemName";
import { playTone } from "@/lib/sfx";

// 📌 상품 상세 '적용 미리보기' — 꾸미기 상품(카드 스킨 · 아바타 테두리 · 프로필 배지 — API item.cosmetic)을 효과 칸 아래 전체 폭으로 보여 준다
//    (2026-10-01 사용자: "미리보기 이미지가 효과 아래 부분에 들어가면 좋겠어", "미리보기는 개인의 프로필이 적용되게").
//    로그인했으면 내 이름 · 사진 · 레벨 · 순위로 — 레벨 페이지 프로필 카드(사이트에서 그림) + 디스코드 /레벨 카드(/api/shop/skin-card?me=1, 서버가 세션의 본인 값으로 그림).
//    로그인 안 했으면 예시 사람. 디스코드 카드는 봇이 그 스킨을 그릴 수 있을 때만(cosmetic.botCard), 그림을 못 받으면 그 칸을 뺀다.
//    칸 크기는 바깥이 정하고 안의 그림은 FitBox 가 줄이기만 해서 그림이 늦게 와도 아무것도 밀리지 않는다.
//    아바타 테두리는 디스코드 카드에도 같이 낀다(&frame= — 봇 /레벨 카드가 테두리를 그린다, 세트는 고른 테두리). 디스코드 카드는 스킨이 있을 때만 — 테두리만 있으면 프로필 카드 한 칸
const DISCORD_BG = "#313338"; // 디스코드 채팅 바탕 — 봇 카드가 실제로 놓이는 자리

//    📌 2026-10-15 카드 배경(scene) — 카드 테두리(skin)와 따로 고르고 함께 입는다. 프로필 카드엔 둘 다(배경 위에 테두리), 디스코드 카드엔 &scene= 도 실어 보낸다
type Cos = { skin?: string; scene?: string; frame?: string; frames?: string[]; badge?: boolean; botCard?: boolean };
// 세트 구성 한 칸(상세 API bundleItems — 구성 아이템의 이름 · 아이콘 · 꾸미기)
type Part = { itemId?: string; name?: string; shortName?: string; icon?: string; imageUrl?: string; color?: string; type?: string; cosmetic?: Cos | null };
type Item = ShopItemLike & { shortName?: string; cosmetic?: Cos | null; bundleItems?: Part[] };
// 📌 세트 상품(2026-10-11 운영자 "세트 상품에 카드 스킨 · 아바타 테두리 · 배지가 있는데도 미리보기가 안 돼") — 상품 자체엔 꾸미기가 없고 구성마다 있다.
//    구성의 카드 스킨 · 테두리 · 배지를 한 벌로 모아 같은 칸에 입혀 보인다(산 뒤 한꺼번에 입은 모습). 카드 스킨이 둘 이상이면 위에 이름 칩으로 고른다(테두리 · 배지는 아래 줄)
const cosOf = (p: Part | null | undefined) => (p?.cosmetic && typeof p.cosmetic === "object" ? p.cosmetic : null);
const partBadge = (p: Part) => badgeOfItem({ itemId: p.itemId, name: p.name, icon: p.icon, itemImageUrl: p.imageUrl, color: p.color, type: p.type || "cosmetic" });
// 📌 칩 · 칸 이름 — 짧은 이름(2026-10-17 API shortName — 상품 · 구성 bundleItems[]). 그 칸이 없는 옛 응답은 이름 머리말을 떼어
const shortOf = (p: { name?: string; shortName?: string }) => p.shortName || splitItemName(String(p.name || "")).short || String(p.name || "");
// 고르기 소리 — 칩 · 테두리 칸 · 배지 칸을 누르면 짧게 한 번
const tick = () => playTone(660, 0.05, "sine", 0.025);
function PickChips({ label, parts, at, onPick }: { label: string; parts: Part[]; at: number; onPick: (i: number) => void }) {
  if (parts.length < 2) return null;
  return (
    <div className="flex items-center gap-2 min-w-0 flex-wrap">
      <span className="shrink-0 text-[12px] font-bold text-[#8a8a8a]">{label}</span>
      {parts.map((p, i) => (
        <button key={`${p.itemId || i}`} type="button" onClick={() => onPick(i)} aria-pressed={i === at}
          className={`h-8 px-3 rounded-full text-[12px] font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${i === at ? "bg-[#131313] text-white" : "bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313]"}`}>
          {shortOf(p)}
        </button>
      ))}
    </div>
  );
}

// 📌 테두리 줄(2026-10-11 운영자 "적용 미리보기 자동 전환 되게 하던지 아니면 여러개면 좀 잘 보이게 배치하던지 · 사러온 사람들이 있는 줄도 모르겠어 · 테두리 말하는 거야") —
//    한 상품에 테두리가 둘 이상이면(「전체」 9종 · 세트에 여럿) 내 사진에 테두리마다 끼운 칸을 한 줄로 다 보인다. 고른 칸이 아래 프로필 · 디스코드 카드에 낀다.
//    처음엔 저절로 한 바퀴 넘어가고(움직임 줄이기면 안 넘김 · 다 돌면 처음 칸에 멈춘다 — 디스코드 그림을 계속 다시 받지 않게), 한 번 누르면 그 테두리에 멈춘다.
//    폰은 가로로 밀어 보고, 저절로 넘어간 칸이 화면 밖이면 줄을 그쪽으로 민다
const FRAME_TILE = 30; // 칸 안 사진 지름 — 테두리 그림이 76 칸에 들어가는 크기
const FRAME_TURN = 2600; // 자동 넘김(ms)
type FrameOpt = { key: string; label: string };
// 줄 한 벌(테두리 줄 · 배지 줄 같은 틀) — 제목 + 칸 한 줄. 폰은 가로로 밀고 PC 는 줄바꿈. 칸은 켜져도 꺼져도 같은 크기(줄이 밀리지 않게)
function Strip({ title, children, boxRef }: { title: string; children: React.ReactNode; boxRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-[12px] font-bold text-[#5a5a5a]">{title}</p>
      <div ref={boxRef} className="flex gap-2 overflow-x-auto no-bar -mx-1 px-1 pb-1 sm:flex-wrap sm:overflow-visible">{children}</div>
    </div>
  );
}
const tileCls = (on: boolean) =>
  `relative shrink-0 w-[76px] h-[92px] rounded-xl flex flex-col items-center justify-end pb-2 overflow-hidden transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${on ? "bg-[#131313] text-white" : "bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313]"}`;
function FrameStrip({ who, opts, at, onPick }: { who: ReturnType<typeof whoOf>; opts: FrameOpt[]; at: number; onPick: (i: number) => void }) {
  // 고른 칸이 가로 줄 밖이면(폰) 줄만 그쪽으로 — 페이지는 움직이지 않는다
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = box.current;
    const el = c?.children[at] as HTMLElement | undefined;
    if (!c || !el || c.scrollWidth <= c.clientWidth + 1) return;
    const cr = c.getBoundingClientRect(), er = el.getBoundingClientRect();
    if (er.left >= cr.left && er.right <= cr.right) return;
    c.scrollTo({ left: c.scrollLeft + (er.left - cr.left) - (cr.width - er.width) / 2, behavior: "smooth" });
  }, [at]);
  return (
    <Strip title={`프로필 테두리 ${opts.length}종`} boxRef={box}>
      {opts.map((o, i) => (
        <button key={o.key} type="button" onClick={() => onPick(i)} aria-pressed={i === at} aria-label={o.label} className={tileCls(i === at)}>
          <span className="relative flex items-center justify-center w-full flex-1">
            <span className="relative" style={{ width: FRAME_TILE, height: FRAME_TILE }}>
              <Avatar who={who} px={FRAME_TILE} text="text-[12px]" />
              <AvatarFrame frame={o.key} px={FRAME_TILE} />
            </span>
          </span>
          <span className="text-[11px] font-bold whitespace-nowrap">{o.label}</span>
        </button>
      ))}
    </Strip>
  );
}

// 📌 배지 줄(2026-10-11 운영자 "알아서") — 세트에 배지가 넷 이상이면(이름 옆 자리는 MAX_BADGES = 3) 배지마다 칸을 한 줄로 다 보인다.
//    지금 이름 옆에 보이는 셋은 진한 칸 + 자리 번호(1 · 2 · 3), 칸을 누르면 그 배지가 맨 앞(1번)으로 온다. 자동 넘김은 없다. 셋 이하면 줄 없이 다 이름 옆에
type BadgeOpt = { badge: Badge; label: string };
function BadgeStrip({ opts, shown, onPick }: { opts: BadgeOpt[]; shown: number[]; onPick: (i: number) => void }) {
  return (
    <Strip title={`프로필 배지 ${opts.length}종`}>
      {opts.map((o, i) => {
        const pos = shown.indexOf(i);
        const b = o.badge;
        return (
          <button key={b.itemId || i} type="button" onClick={() => onPick(i)} aria-pressed={pos >= 0} aria-label={o.label} className={tileCls(pos >= 0)}>
            {pos >= 0 && <span aria-hidden className="absolute top-1.5 left-2 text-[10px] font-black leading-none tabular-nums text-white/55">{pos + 1}</span>}
            <span className="flex items-center justify-center w-full flex-1">
              <ItemIcon icon={b.icon} imageUrl={b.imageUrl} type={b.type} size={32} color={b.color || itemTypeColor(b.type)} />
            </span>
            <span className="max-w-full px-1.5 text-[11px] font-bold whitespace-nowrap truncate">{o.label}</span>
          </button>
        );
      })}
    </Strip>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-[12px] font-bold text-[#5a5a5a]">{children}</p>
);

export default function AppliedPreview({ item, user, me }: {
  item: Item;
  user: { name?: string | null; image?: string | null } | null | undefined;
  me: unknown;
}) {
  // 세트면 구성의 꾸미기를 종류별로 모은다(구성 차례 그대로)
  const parts = Array.isArray(item?.bundleItems) ? item.bundleItems.filter((p) => cosOf(p)) : [];
  const skinParts = parts.filter((p) => typeof cosOf(p)?.skin === "string" && cosOf(p)?.skin);
  const sceneParts = parts.filter((p) => typeof cosOf(p)?.scene === "string" && cosOf(p)?.scene);
  const frameParts = parts.filter((p) => typeof cosOf(p)?.frame === "string" && cosOf(p)?.frame);
  const badgeParts = parts.filter((p) => !!cosOf(p)?.badge);
  const [si, setSi] = useState(0);
  const [ci, setCi] = useState(0); // 세트의 카드 배경 고르기
  const [fi, setFi] = useState(-1); // -1 = 처음 칸(아래 startAt)
  const [bFront, setBFront] = useState<number[]>([]); // 배지 줄에서 누른 차례(맨 앞 = 마지막에 누른 것)
  const [framePicked, setFramePicked] = useState(false);
  const [autoDone, setAutoDone] = useState(false); // 자동 넘김 한 바퀴를 다 돌았다
  const set = parts.length > 0;
  const skinPart = set ? skinParts[Math.min(si, skinParts.length - 1)] || null : null;
  const scenePart = set ? sceneParts[Math.min(ci, sceneParts.length - 1)] || null : null;
  const own: Cos | null = item?.cosmetic && typeof item.cosmetic === "object" ? item.cosmetic : null;
  // 📌 배지 — 세트면 구성의 배지 전부(구성 차례 · 같은 아이템은 한 번), 단품이면 그 배지 하나. 셋까지는 다 이름 옆에, 넷 이상이면 배지 줄에서 고른 차례로 앞의 셋
  const badgeOpts: BadgeOpt[] = [];
  for (const [b, label] of set ? badgeParts.map((p) => [partBadge(p), shortOf(p)] as const) : own?.badge ? [[badgeOfItem(item), shortOf(item)] as const] : []) {
    if (!b.itemId || !badgeOpts.some((o) => o.badge.itemId === b.itemId)) badgeOpts.push({ badge: b, label: label || b.name });
  }
  const badgeN = badgeOpts.length;
  const shownBadges = [...bFront.filter((i) => i < badgeN), ...badgeOpts.map((_, i) => i)]
    .filter((i, k, a) => a.indexOf(i) === k)
    .slice(0, MAX_BADGES);
  const keysOf = (c: Cos | null) => (Array.isArray(c?.frames) && c.frames.length > 1 ? c.frames : c?.frame ? [c.frame] : []);
  const frameOpts: FrameOpt[] = [];
  for (const [c, name] of set ? frameParts.map((p) => [cosOf(p), shortOf(p)] as const) : [[own, ""] as const]) {
    const keys = keysOf(c);
    for (const k of keys) if (!frameOpts.some((o) => o.key === k)) frameOpts.push({ key: k, label: keys.length > 1 || !name ? FRAME_OF[k]?.l || k : name });
  }
  const startAt = Math.max(0, !set && own?.frame ? frameOpts.findIndex((o) => o.key === own.frame) : 0);
  const fAt = fi < 0 ? Math.min(startAt, Math.max(0, frameOpts.length - 1)) : Math.min(fi, Math.max(0, frameOpts.length - 1));
  // 디스코드 카드는 구성 중 봇이 그릴 수 있는 꾸미기가 하나라도 있으면(카드 테두리 · 카드 배경)
  const cos: Cos | null = set
    ? {
        skin: cosOf(skinPart)?.skin || "", scene: cosOf(scenePart)?.scene || "", frame: frameOpts[fAt]?.key || "", badge: badgeN > 0,
        botCard: !!cosOf(skinPart)?.botCard || !!cosOf(scenePart)?.botCard,
      }
    : own ? { ...own, frame: frameOpts[fAt]?.key || own.frame } : null;
  const skin = typeof cos?.skin === "string" ? cos.skin : "";
  const scene = typeof cos?.scene === "string" ? cos.scene : "";
  const frame = typeof cos?.frame === "string" ? cos.frame : "";
  const [discordFail, setDiscordFail] = useState(false);
  // 자동 넘김 — 테두리가 둘 이상이고 아직 안 골랐을 때 한 바퀴만(다 돌면 처음 칸). 움직임 줄이기 설정이면 넘기지 않는다
  const turnN = framePicked || autoDone ? 0 : frameOpts.length;
  useEffect(() => {
    if (turnN < 2) return;
    try { if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; } catch {}
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      setFi((i) => ((i < 0 ? startAt : i) + 1) % turnN);
      if (n >= turnN) { window.clearInterval(t); setAutoDone(true); }
    }, FRAME_TURN);
    return () => window.clearInterval(t);
  }, [turnN, startAt]);
  // 오늘 획득 XP 는 프로필 카드에만 — 카드를 그릴 때(카드 배경 · 카드 테두리 · 프로필 테두리)만 받는다(배지만 있는 상품은 부르지 않는다)
  const card = !!skin || !!scene || !!frame;
  const today = useTodayXp(!!user && !!me && card);
  if (!cos || (!card && !cos.badge)) return null;
  const badges = shownBadges.map((i) => badgeOpts[i].badge);
  const chips = skinParts.length > 1; // 테두리 · 배지는 아래 줄(FrameStrip · BadgeStrip)이 맡는다
  const sceneChips = sceneParts.length > 1;
  const who = whoOf(user, me, today);
  const wantDiscord = (!!skin || !!scene) && !!cos.botCard;
  const showDiscord = wantDiscord && !discordFail;
  // 로그인했으면 본인 카드(me=1 — 세션으로만 판단, 남의 값을 그릴 길은 없다), 아니면 예시 카드(공개 캐시). 카드 배경 · 프로필 테두리가 있으면 같이 낀다(서버가 아는 키만 받는다)
  const discordSrc = `/api/shop/skin-card?skin=${encodeURIComponent(skin)}${scene ? `&scene=${encodeURIComponent(scene)}` : ""}${frame ? `&frame=${encodeURIComponent(frame)}` : ""}${user ? "&me=1" : ""}`;

  return (
    <div className="mt-14 pt-10 border-t border-[#ededed]">
      <h2 className="text-base font-black text-[#131313] tracking-tight mb-5">적용 미리보기</h2>
      {/* 세트 — 카드 배경 · 카드 테두리가 둘 이상일 때만 고르기 칩(하나뿐이면 칩 없이 그것) */}
      {sceneChips && (
        <div className="mb-5">
          <PickChips label="카드 배경" parts={sceneParts} at={Math.min(ci, sceneParts.length - 1)} onPick={(i) => { setCi(i); setDiscordFail(false); tick(); }} />
        </div>
      )}
      {chips && (
        <div className="mb-5">
          <PickChips label="카드 테두리" parts={skinParts} at={Math.min(si, skinParts.length - 1)} onPick={(i) => { setSi(i); setDiscordFail(false); tick(); }} />
        </div>
      )}
      {frameOpts.length > 1 && (
        <FrameStrip who={who} opts={frameOpts} at={fAt} onPick={(i) => { setFi(i); setFramePicked(true); setDiscordFail(false); tick(); }} />
      )}
      {badgeN > MAX_BADGES && (
        <BadgeStrip opts={badgeOpts} shown={shownBadges} onPick={(i) => { setBFront((f) => [i, ...f.filter((x) => x !== i)]); tick(); }} />
      )}
      <div className={`grid grid-cols-1 gap-4 ${card && (wantDiscord || cos.badge) ? "md:grid-cols-2" : ""}`}>
        {card && (
          <div>
            <Label>프로필 카드</Label>
            {/* 레벨 페이지 카드(360 폭)를 제 크기 이하로 — 폰은 칸 폭에 맞춰 줄인다 */}
            <div className="relative w-full aspect-[4/5] md:aspect-auto md:h-[600px] rounded-2xl bg-[#f2f2f2] overflow-hidden">
              <FitBox pad={0.92} max={1}>
                <ProfileCardPreview who={who} skin={skin} scene={scene} frame={frame} />
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
                  {/* 📌 key 없이 src 만 바꾼다 — 테두리 자동 넘김(2.6초)마다 새 그림이 올 때까지 앞 그림을 그대로 두게(key 로 갈아 끼우면 넘길 때마다 빈 칸이 번쩍였다) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={discordSrc} alt="" draggable={false} decoding="async" onError={() => setDiscordFail(true)}
                    className="block w-full rounded-lg bg-[#1b1b1b] select-none" style={{ aspectRatio: "1200 / 630" }} />
                </div>
              </div>
            )}
            {cos.badge && (
              <div>
                <Label>프로필 배지</Label>
                <div className="relative w-full h-[260px] rounded-2xl bg-[#f2f2f2] overflow-hidden">
                  <FitBox pad={0.9} max={1.2}>
                    <BadgePreview who={who} badges={badges} />
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
