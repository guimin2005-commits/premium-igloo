"use client";

import { useState, useEffect, useMemo } from "react";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import { playTone } from "@/lib/sfx";
import ItemIcon from "./ItemIcon";
import { ICON_PATHS } from "./Icons";
import { PopShell, PopTab, AdminReset } from "./PopShell";

// 📌 인벤토리 — 레벨 대시보드의 가방 팝업을 내 정보 · ARCTIC 에서도 그 자리에 띄운다 (다른 화면으로 넘기지 않는다)

// 📌 인벤토리 분류 — 아이템 등록의 유형(type)이 기준이다. 레벨 보상 역할만 따로 묶는다.
//    탭 순서는 이 표를 따른다 (실제로 가진 분류만 만든다 — 빈 탭을 띄우지 않는다)
export const INV_GROUPS = [
  { id: "role", label: "역할" },
  { id: "perk", label: "권한" },
  { id: "item", label: "아이템" },
  { id: "physical", label: "실물" },
  { id: "level", label: "레벨 보상" },
];
export const INV_GROUP_ORDER = Object.fromEntries(INV_GROUPS.map((g, i) => [g.id, i]));

// 인벤토리 행의 보조 한 줄 — 설명이 있으면 그것, 없으면 유형 + 조건
export const invSubLabel = (it) => {
  if (it.description) return it.description;
  const base = it.source === "level" ? "레벨 보상" : itemTypeLabel(it.type || it.kind);
  if (it.source === "level") return it.rewardLevel != null ? `${base} · Lv.${it.rewardLevel} 도달` : base;
  if (it.source === "pass") return `${base} · 시즌 패스`;
  if (it.source === "grant") return `${base} · 운영진 지급`;
  if (it.days > 0) return `${base} · ${it.days}일 이용권`;
  return base;
};

export const invGroupOf = (it) => {
  if (it.source === "level") return INV_GROUPS[4];
  return INV_GROUPS.find((g) => g.id === (it.type || it.kind)) || INV_GROUPS[2];
};

// 가진 항목으로 탭을 만든다 — 전체 · 유형별(INV_GROUPS 순) · 기간제. 하나도 없으면 [] (탭 없이 빈 가방)
export const buildInvGroups = (invAll) => {
  if (!invAll || invAll.length === 0) return [];
  const byId = new Map();
  for (const it of invAll) {
    const g = invGroupOf(it);
    if (!byId.has(g.id)) byId.set(g.id, { ...g, items: [] });
    byId.get(g.id).items.push(it);
  }
  // 탭 순서는 유형 표(INV_GROUPS) 순 — 어떤 것을 먼저 샀든 자리가 바뀌지 않는다
  const groups = [...byId.values()].sort((a, b) => (INV_GROUP_ORDER[a.id] ?? 99) - (INV_GROUP_ORDER[b.id] ?? 99));
  // 기간제는 유형과 겹쳐도 따로 모아 본다 — 언제 끝나는지 한눈에 보려는 사람이 많다
  const timed = invAll.filter((it) => it.expiresAt);
  return [{ id: "all", label: "전체", items: invAll }, ...groups, ...(timed.length ? [{ id: "timed", label: "기간제", items: timed }] : [])];
};

// 📌 아이템 아이콘은 공용 ItemIcon(app/components/ItemIcon) 이 그린다 — 이미지 > 프리셋 SVG > 이모지 > 유형 기본.
//    레벨 보상(source "level")은 유형 대신 "level" 을 넘겨 메달이 나오게 한다.
export const invIconType = (it) => (it.source === "level" ? "level" : it.type || it.kind || "item");

// 📌 가방 — 인벤토리를 대시보드에 펼치지 않고 오버레이로 연다.
//    껍데기는 TierModal 과 같은 문법(모바일 바텀시트 / 데스크톱 모달, 잉크 패널).
//    스크롤 잠금은 손대지 않는다 — 루트 className 에 "fixed inset-0" 이 붙어 있고
//    z-index 가 50 이상이면 ScrollLock 이 알아서 건다(iOS 대응 포함).
export const BagOverlay = ({ open, onClose, groups, tab, onTab, synced, onTone, onReset, resetBusy, loading = false }) => {
  const [sel, setSel] = useState(null); // 선택한 아이템 uid

  const active = groups.find((g) => g.id === tab) || groups[0];
  const rows = active?.items || [];
  // 열 때 · 탭을 바꿀 때 첫 아이템을 골라 둔다 — 왼쪽 칸이 비지 않게
  useEffect(() => {
    if (!open) { setSel(null); return; }
    setSel((cur) => (cur && rows.some((r) => r.uid === cur) ? cur : rows[0]?.uid ?? null));
  }, [open, tab, rows[0]?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  // uid 로 되짚는다 — 30초 폴링이 배열을 갈아끼워도 엉뚱한 것을 가리키지 않는다
  const selItem = sel ? rows.find((r) => r.uid === sel) || null : null;
  const slots = Math.max(20, Math.ceil(rows.length / 5) * 5); // 5열 × 4줄 — 커진 창을 채운다
  // 색 — 등록된 색 > 유형 기본색 (lib/items.js). 레벨 보상은 서버가 분홍을 실어 보낸다.
  //    잉크 패널 위라 너무 어두운 색(기프트카드 기본 #131313 등)은 밝은 회색으로 바꿔 칸 테두리가 보이게 한다
  const accentOf = (it) => {
    const c = it.color || itemTypeColor(it.type || it.kind);
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
    if (!m) return c;
    const lum = (parseInt(m[1], 16) * 0.299 + parseInt(m[2], 16) * 0.587 + parseInt(m[3], 16) * 0.114) / 255;
    return lum < 0.18 ? "#d4d4d4" : c;
  };
  // 기간제 — 만료는 결제 순간부터 정해져 있다(봇 지급이 늦어도 산 만큼 보장). 그래서 지급 대기여도 남은 기간을 센다
  const ddayOf = (it) =>
    it.expiresAt ? Math.max(0, Math.ceil((new Date(it.expiresAt).getTime() - Date.now()) / 86400000)) : null;
  const untilOf = (it) =>
    it.expiresAt
      ? new Date(it.expiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
      : "";

  return (
    <PopShell
      open={open}
      onClose={onClose}
      title="인벤토리"
      count={groups[0]?.items.length ?? 0}
      icon="bag"
      tabs={groups.length > 1 ? groups.map((g) => (
        <PopTab key={g.id} on={active?.id === g.id} onClick={() => { onTab(g.id); setSel(null); onTone(); }} label={g.label} n={g.items.length} />
      )) : null}
      left={
        <>
        {selItem ? (
          <div>
            <div
              className="w-24 h-24 rounded-2xl flex items-center justify-center mb-5"
              style={{
                background: `linear-gradient(160deg, ${accentOf(selItem)}33, ${accentOf(selItem)}0f)`,
                boxShadow: `inset 0 0 0 1px ${accentOf(selItem)}55`,
              }}
            >
              <ItemIcon icon={selItem.icon} imageUrl={selItem.imageUrl} type={invIconType(selItem)} size={46} color={accentOf(selItem)} dim={selItem.status !== "completed"} />
            </div>
            <p className="text-[20px] font-black text-white leading-snug break-keep">{selItem.name}</p>
            <p className="text-[12px] font-bold text-white/50 mt-2 leading-relaxed break-keep">{invSubLabel(selItem)}</p>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold text-white/45">상태</span>
                <span className={`text-[12px] font-black ${selItem.status === "missing" ? "text-[#ff5c77]" : selItem.status === "pending" ? "text-white/60" : "text-emerald-400"}`}>
                  {selItem.status === "pending" ? "지급 대기" : selItem.status === "missing" ? "확인 필요" : "보유 중"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold text-white/45">기간</span>
                <span className="text-[12px] font-black text-white/80 tabular-nums">
                  {selItem.expiresAt ? `${selItem.days > 0 ? `${selItem.days}일 · ` : ""}기간제` : "영구"}
                </span>
              </div>
              {selItem.expiresAt && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold text-white/45">만료</span>
                    <span className="text-[12px] font-black text-white/70 tabular-nums">{untilOf(selItem)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold text-white/45">남은 기간</span>
                    <span className={`text-[12px] font-black tabular-nums ${ddayOf(selItem) <= 3 ? "text-[#ff5c77]" : "text-white/70"}`}>
                      D-{ddayOf(selItem)}
                    </span>
                  </div>
                </>
              )}
              {selItem.rewardLevel != null && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold text-white/45">레벨</span>
                  <span className="text-[12px] font-black tabular-nums text-white/70">Lv.{selItem.rewardLevel}</span>
                </div>
              )}
            </div>

            {selItem.status === "missing" && (
              <p className="text-[10px] text-[#ff5c77]/80 mt-4 leading-relaxed break-keep">
                구매 기록은 있는데 디스코드 역할이 확인되지 않습니다. 운영진에 문의해 주세요.
              </p>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-6 sm:py-0">
            <span aria-hidden className="w-14 h-14 rounded-2xl border border-dashed border-white/15 flex items-center justify-center mb-3">
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.6">
                <path d={ICON_PATHS.bag} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="text-[11px] font-bold text-white/30 break-keep">칸을 누르면 여기에 보입니다</p>
          </div>
        )}
        {onReset && <div className="mt-auto pt-5"><AdminReset onReset={onReset} busy={resetBusy} label="관리자 · 상점 구매 초기화" /></div>}
        </>
      }
      footer={
        synced === false ? (
          <div className="relative z-10 shrink-0 border-t border-white/[0.08] bg-white/[0.02] px-5 sm:px-7 py-3">
            <p className="text-[11px] text-white/30 break-keep">디스코드 역할을 확인하지 못해 구매 기록 기준으로 표시하고 있습니다.</p>
          </div>
        ) : null
      }
    >
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
        {Array.from({ length: slots }, (_, i) => {
          const it = rows[i];
          if (!it) {
            return <div key={`empty-${i}`} className="aspect-square rounded-xl border border-dashed border-white/[0.10] bg-white/[0.02]"></div>;
          }
          const dead = it.status === "pending" || it.status === "missing";
          const accent = accentOf(it);
          const dday = ddayOf(it);
          const on = sel === it.uid;
          return (
            <button
              key={it.uid || `i-${i}`}
              onClick={() => { setSel(on ? null : it.uid); onTone(); }}
              title={it.name}
              className={`relative aspect-square rounded-xl flex flex-col items-center justify-center px-1.5 transition-all outline-none focus:outline-none ${
                on ? "-translate-y-0.5" : "hover:-translate-y-0.5"
              }`}
              style={{
                background: dead ? "rgba(255,255,255,0.03)" : `linear-gradient(160deg, ${accent}2e, ${accent}0d)`,
                // 고른 칸은 흰 테두리 — ring 클래스는 이 인라인 그림자에 덮여 안 보였다
                boxShadow: `${on ? "0 0 0 2px rgba(255,255,255,0.75), " : ""}${dead ? "inset 0 0 0 1px rgba(255,255,255,0.07)" : `inset 0 0 0 1px ${accent}44`}`,
              }}
            >
              <span aria-hidden className="mb-1.5">
                <ItemIcon icon={it.icon} imageUrl={it.imageUrl} type={invIconType(it)} size={28} color={accent} dim={dead} />
              </span>
              <span className={`w-full text-[10px] font-black leading-tight text-center line-clamp-2 ${dead ? "text-white/35" : "text-white/85"}`}>
                {it.name}
              </span>
              {/* 상태 · 기간 — 모서리 배지 · 점 대신 이름 아래 한 줄 글자로 (3일 이하 · 확인 필요는 빨강) */}
              {(it.status === "pending" || it.status === "missing" || dday !== null) && (
                <span className={`mt-1 text-[9px] font-bold tabular-nums leading-none ${it.status === "missing" || (dday !== null && dday <= 3) ? "text-[#ff5c77]" : "text-white/45"}`}>
                  {[it.status === "pending" ? "지급 대기" : it.status === "missing" ? "확인 필요" : "", dday !== null ? `D-${dday}` : ""].filter(Boolean).join(" · ")}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* invGroups 는 보유 0개면 [] 를 돌려준다 — groups[0] 로 판정하면 신규 유저에게 문구가 안 뜬다 */}
      {rows.length === 0 && (
        <p className="text-[12px] font-bold text-white/35 text-center mt-6">{loading ? "불러오는 중…" : "아직 보유한 아이템이 없습니다"}</p>
      )}
    </PopShell>
  );
};

// 📌 그 자리에서 여는 인벤토리 — 내 정보 · ARCTIC 이 쓴다. 열 때마다 /api/shop/my-items 를 새로 읽는다.
//    처음 읽기 전에는 빈 가방 문구 대신 불러오는 중. 여닫는 소리는 레벨 가방과 같다(낮은음 → 높은음 / 반대).
export function InventoryPopup({ open, onClose }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("all");
  useEffect(() => {
    if (!open) return;
    playTone(392, 0.06, "sine", 0.03);
    const t = setTimeout(() => playTone(587, 0.08, "sine", 0.03), 90);
    let alive = true;
    fetch("/api/shop/my-items", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (alive) setData(d?.success ? d.data : { items: [] }); })
      .catch(() => { if (alive) setData((cur) => cur || { items: [] }); });
    return () => { alive = false; clearTimeout(t); };
  }, [open]);
  const groups = useMemo(() => buildInvGroups(data?.items || []), [data]);
  const close = () => {
    playTone(523, 0.06, "sine", 0.025);
    setTimeout(() => playTone(349, 0.08, "sine", 0.025), 90);
    onClose();
  };
  return (
    <BagOverlay
      open={open}
      onClose={close}
      groups={groups}
      tab={tab}
      onTab={setTab}
      synced={data?.synced}
      loading={data === null}
      onTone={() => playTone(620, 0.04, "sine", 0.025)}
    />
  );
}
