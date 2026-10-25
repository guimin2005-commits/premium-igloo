"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ICON_PATHS } from "../components/Icons";
import { ArtIcon } from "../components/ItemIcon";
import { isArtKey } from "@/lib/itemArt";
import { playTone } from "@/lib/sfx";
import { ACHIEVEMENTS_ON } from "@/lib/achievements";

// 📌 업적 — 레벨 대시보드 프로필 카드의 「업적」 칸으로 여는 창 + 달성 알림 + 데이터 훅.
//    서버는 app/api/xp/achievements (GET 목록 · POST claim / seen). 화면은 그 응답 모양만 믿는다.
//    · 테스트 사이트(localhost)는 서버가 아무것도 적지 않는다 — claimLocked 이면 받기를 잠그고,
//      "새로 달성" 은 서버 newly 대신 이 브라우저의 localStorage("ach-seen")와 비교한다.
//    · 창의 줄 순서는 열 때 한 번 정한다(받을 것 → 최근 달성 → 진행 많이 된 것). 받기를 눌러도 줄이 제자리에서 "받음" 으로만 바뀐다
//    📌 ACHIEVEMENTS_ON(lib/achievements) 이 false 면 — 훅은 아무것도 부르지 않고(조회 · 본 표시 · 받기 없음), 창 · 알림은 그리지 않는다(운영자 "업적은 추후에")

const API = "/api/xp/achievements";
const SEEN_KEY = "ach-seen"; // { [userId]: string[] } — 테스트 사이트 전용
const RARE_PCT = 10; // 이 % 미만이면 희귀 — 깬 것의 달성률 글자만 금빛(#b7791f)

const fmt = (n) => (Number(n) || 0).toLocaleString();
// "art:xp-potion" · "xp-potion" 둘 다 받는다 — 목록에 없는 그림이면 ""
const artOf = (icon) => {
  const s = String(icon || "");
  const k = s.startsWith("art:") ? s.slice(4) : s;
  return isArtKey(k) ? k : "";
};
// 달성일 — KST 날짜 "2026.10.03"
const dateOf = (iso) => {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, ".");
};
const pctOf = (it) => {
  const g = Number(it?.goal);
  if (!(g > 0) || it?.progress == null) return 0;
  return Math.max(0, Math.min(1, (Number(it.progress) || 0) / g));
};
const rewardOf = (it) => ({ xp: Math.max(0, Number(it?.reward?.xp) || 0), point: Math.max(0, Number(it?.reward?.point) || 0) });
const isClaimable = (it) => !!it?.claimable && !it?.claimed;
// 모두 받기를 멈추는 거절 — 업적마다가 아니라 계정 · 사이트 단위(app/api/xp/achievements 의 code)
const STOP_ALL = new Set(["LOCAL", "UNAUTHORIZED", "MAINTENANCE", "LEVEL_CLOSED", "XP_STOPPED"]);
const gotText = (xp, point) => [xp > 0 && `+${fmt(xp)} XP`, point > 0 && `+${fmt(point)} 빙옥`].filter(Boolean).join(" · ");

// ── 효과음 — 같은 playTone 어휘. 달성은 맑게 올라가는 셋, 받기는 짧은 동전 둘 ──
export const sfxAchieve = () => {
  [659.25, 987.77, 1318.51].forEach((f, i) => setTimeout(() => playTone(f, i === 2 ? 0.28 : 0.12, "triangle", 0.045), i * 95));
};
const sfxAchClaim = () => {
  playTone(987.77, 0.08, "sine", 0.04);
  setTimeout(() => playTone(1479.98, 0.16, "sine", 0.04), 80);
};

// ── 테스트 사이트용 "본 업적" 기록(이 브라우저만) — 저장소를 못 쓰면 null(그때는 알림을 띄우지 않는다) ──
const readSeen = (uid) => {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    let m = {};
    try { m = JSON.parse(raw || "{}") || {}; } catch { m = {}; }
    return new Set(Array.isArray(m?.[uid]) ? m[uid] : []);
  } catch {
    return null;
  }
};
const writeSeen = (uid, keys) => {
  try {
    let m = {};
    try { m = JSON.parse(window.localStorage.getItem(SEEN_KEY) || "{}") || {}; } catch { m = {}; }
    if (typeof m !== "object" || Array.isArray(m)) m = {};
    const cur = new Set(Array.isArray(m[uid]) ? m[uid] : []);
    keys.forEach((k) => cur.add(k));
    m[uid] = [...cur];
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(m));
  } catch {}
};

const post = (body) =>
  fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json().catch(() => null));

// 받는 중인 줄은 서버 조회가 먼저 돌아와도 받은 것으로 둔다(단추가 다시 살아나 두 번 눌리지 않게)
const patchItems = (d, keys, patch) => (d ? { ...d, items: d.items.map((i) => (keys.has(i.key) ? { ...i, ...patch } : i)) } : d);

// 📌 데이터 훅 — 불러오기(90초마다 · 창을 열 때) · 받기 · 모두 받기 · 달성 알림.
//    enabled 가 거짓이면(비로그인 · 비공개) 아무것도 부르지 않는다. hold 동안(승급 화면)에는 알림을 미룬다.
//    onBalance(balance) — 받은 뒤 서버가 돌려준 잔액. 페이지가 내 정보를 다시 읽는다(loadMe)
export function useAchievements({ userId, enabled: enabledIn, hold = false, pushToast, onBalance }) {
  const enabled = ACHIEVEMENTS_ON && !!enabledIn;
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle"); // idle(불러오는 중) · ok · fail
  const [busy, setBusy] = useState(""); // 받는 중인 key, 모두 받기는 "all"
  const [pending, setPending] = useState([]); // 알림을 띄울 새 업적 key
  const [notice, setNotice] = useState(null); // { id, key, title, icon, more, keys, local }
  const busyRef = useRef("");
  const claimingRef = useRef(new Set());
  const shownRef = useRef(new Set());
  const uidRef = useRef(userId);
  const toastRef = useRef(pushToast);
  const balRef = useRef(onBalance);
  useEffect(() => { toastRef.current = pushToast; balRef.current = onBalance; });

  // 다른 계정으로 바뀌면 화면 상태를 비운다(렌더 중 맞춤 — 이전 값과 비교)
  const [uidSeen, setUidSeen] = useState(userId);
  if (uidSeen !== userId) {
    setUidSeen(userId);
    setData(null);
    setStatus("idle");
    setPending([]);
    setNotice(null);
  }

  // 달성 알림 — 한 번에 하나(가장 최근 · 희귀한 것) + "외 N개". 승급 화면(hold) 동안은 쌓아 두었다가 닫히면 띄운다.
  //    고르는 것은 렌더 중 맞춤, 소리 · 본 것 적기는 아래 효과(알림이 바뀔 때 한 번)
  if (enabled && !hold && pending.length && data) {
    const list = pending.map((k) => data.items.find((i) => i.key === k)).filter((i) => i && i.unlocked);
    setPending([]);
    if (list.length) {
      list.sort((a, b) => (Date.parse(b.unlockedAt || "") || 0) - (Date.parse(a.unlockedAt || "") || 0) || (a.rarity ?? 100) - (b.rarity ?? 100));
      const top = list[0];
      setNotice({ id: (notice?.id || 0) + 1, key: top.key, title: top.title, icon: top.icon, more: list.length - 1, keys: list.map((i) => i.key), local: !!data.claimLocked });
    }
  }

  const setBusyBoth = (v) => { busyRef.current = v; setBusy(v); };

  const load = useCallback(async () => {
    if (!ACHIEVEMENTS_ON || !userId) return;
    try {
      const res = await fetch(API, { cache: "no-store" }).then((r) => r.json().catch(() => null));
      if (uidRef.current !== userId) return;
      const d = res?.success ? res.data : null;
      if (!d || !Array.isArray(d.items)) {
        setStatus((s) => (s === "ok" ? s : "fail"));
        return;
      }
      const next = { ...d, groups: Array.isArray(d.groups) ? d.groups : [] };
      setData(claimingRef.current.size ? patchItems(next, claimingRef.current, { claimed: true, claimable: false }) : next);
      setStatus("ok");
      // 새로 달성 — 실사이트는 서버가 센 newly, 테스트 사이트는 이 브라우저가 본 목록과 비교
      const unlocked = new Set(d.items.filter((i) => i.unlocked).map((i) => i.key));
      let fresh = [];
      if (d.claimLocked) {
        const seen = readSeen(userId);
        if (seen) fresh = [...unlocked].filter((k) => !seen.has(k));
      } else if (Array.isArray(d.newly)) {
        fresh = d.newly.filter((k) => unlocked.has(k));
      }
      fresh = fresh.filter((k) => !shownRef.current.has(k));
      if (fresh.length) {
        fresh.forEach((k) => shownRef.current.add(k));
        setPending((p) => [...p, ...fresh.filter((k) => !p.includes(k))]);
      }
    } catch {
      if (uidRef.current === userId) setStatus((s) => (s === "ok" ? s : "fail"));
    }
  }, [userId]);

  useEffect(() => {
    if (uidRef.current !== userId) {
      uidRef.current = userId;
      shownRef.current = new Set();
      claimingRef.current = new Set();
    }
    if (!enabled || !userId) return;
    const first = setTimeout(load, 0);
    const t = setInterval(load, 90 * 1000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [enabled, userId, load]);

  // 알림이 뜨면 소리 하나 + 본 것으로 적기(실사이트 POST seen · 테스트 사이트 localStorage) + 6초 뒤 닫기
  useEffect(() => {
    if (!notice) return;
    sfxAchieve();
    if (notice.local) writeSeen(userId, notice.keys);
    else post({ action: "seen", keys: notice.keys }).catch(() => {});
    const t = setTimeout(() => setNotice((n) => (n?.id === notice.id ? null : n)), 6000);
    return () => clearTimeout(t);
  }, [notice]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useCallback(() => setNotice(null), []);

  // 받기 — 누르는 즉시 그 줄을 "받음" 으로(낙관적), 실패하면 되돌리고 서버 상태로 다시 맞춘다.
  //    줄마다 따로 받는다(여러 줄을 빠르게 눌러도 앞 요청을 기다리며 조용히 무시되지 않게 — 서버가 key 마다 한 번만 지급)
  const claim = useCallback(async (key) => {
    if (!data || busyRef.current === "all" || claimingRef.current.has(key)) return;
    const it = data.items.find((i) => i.key === key);
    if (!isClaimable(it)) return;
    if (data.claimLocked) { toastRef.current?.("테스트 사이트에서는 받을 수 없습니다."); return; }
    claimingRef.current.add(key);
    setData((d) => patchItems(d, new Set([key]), { claimed: true, claimable: false }));
    let ok = false;
    try {
      const res = await post({ action: "claim", key });
      if (res?.success) {
        ok = true;
        const r = rewardOf(it);
        const xp = Number(res.data?.xp ?? r.xp) || 0;
        const point = Number(res.data?.point ?? r.point) || 0;
        toastRef.current?.(`${gotText(xp, point) || it.title} 받음`, true);
        sfxAchClaim();
        if (res.data?.balance) balRef.current?.(res.data.balance);
      } else {
        toastRef.current?.(res?.message || "받지 못했습니다.");
      }
    } catch {
      toastRef.current?.("네트워크 오류로 받지 못했습니다.");
    }
    claimingRef.current.delete(key);
    if (!ok) setData((d) => patchItems(d, new Set([key]), { claimed: !!it.claimed, claimable: !!it.claimable }));
    load();
  }, [data, load]);

  // 모두 받기 — 받을 수 있는 업적을 하나씩 차례로(서버는 한 건 받기와 같은 처리). 합계 토스트 하나, 못 받은 게 있으면 한 줄 더
  const claimAll = useCallback(async () => {
    if (busyRef.current || !data || data.claimLocked) return;
    const keys = data.items.filter((i) => isClaimable(i) && !claimingRef.current.has(i.key)).map((i) => i.key);
    if (!keys.length) return;
    setBusyBoth("all");
    keys.forEach((k) => claimingRef.current.add(k));
    setData((d) => patchItems(d, new Set(keys), { claimed: true, claimable: false }));
    let n = 0, xp = 0, point = 0, bal = null, fail = null;
    for (const key of keys) {
      try {
        const res = await post({ action: "claim", key });
        if (res?.success) {
          n += 1;
          xp += Number(res.data?.xp) || 0;
          point += Number(res.data?.point) || 0;
          bal = res.data?.balance || bal;
        } else {
          fail = fail || res || {};
          // 계정 · 사이트 단위 거절은 나머지도 똑같이 막힌다 — 더 보내지 않는다
          if (STOP_ALL.has(res?.code)) break;
        }
      } catch {
        fail = fail || { message: "네트워크 오류로 받지 못했습니다." };
      }
    }
    keys.forEach((k) => claimingRef.current.delete(k));
    if (n) {
      const got = gotText(xp, point);
      toastRef.current?.(got ? `업적 ${n}개 ${got} 받음` : `업적 ${n}개 받음`, true);
      sfxAchClaim();
    }
    if (fail) toastRef.current?.(fail.message || "일부를 받지 못했습니다.");
    if (bal) balRef.current?.(bal);
    // 못 받은 줄은 서버 상태로 되돌아온다(받는 중 표시를 지운 뒤 다시 읽는다)
    await load();
    setBusyBoth("");
  }, [data, load]);

  const claimable = useMemo(() => (data?.items || []).filter(isClaimable).length, [data]);

  return { data, status, busy, claimable, notice, dismiss, claim, claimAll, reload: load };
}

// ── 그림 칸 — 도트 아이콘(들어간 면 · 각짐). 잠긴 것은 흑백 · 흐리게, 숨겨진 것은 자물쇠. dot = 받을 보상 빨간 점 ──
const LineIcon = ({ name, className = "w-6 h-6" }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d={ICON_PATHS[name]} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const AchArt = ({ it, size = 48, box = 52, dot = false }) => {
  const masked = it.hidden && !it.unlocked;
  const art = masked ? "" : artOf(it.icon);
  return (
    <span aria-hidden className="relative block shrink-0" style={{ width: box, height: box }}>
      <span className="absolute inset-0 bg-[#f2f2f2] flex items-center justify-center overflow-hidden">
        {masked ? (
          <span className="text-[#a3a3a3]"><LineIcon name="lock" className="w-5 h-5" /></span>
        ) : art ? (
          <ArtIcon k={art} size={size} style={it.unlocked ? undefined : { filter: "grayscale(1)", opacity: 0.32 }} />
        ) : (
          <span className={it.unlocked ? "text-[#131313]" : "text-[#a3a3a3]"}><LineIcon name="trophy" className="w-6 h-6" /></span>
        )}
      </span>
      {dot && <span className="absolute -right-[3px] -top-[3px] w-[9px] h-[9px] rounded-full bg-[#e91e3f]" style={{ boxShadow: "0 0 0 2px #ffffff" }}></span>}
    </span>
  );
};

const rarityText = (r) => (r == null ? "—" : `${Number(r).toFixed(1)}%`);
// 희귀(금빛) — 깬 것만
const isRare = (it) => !!it.unlocked && it.rarity != null && Number(it.rarity) < RARE_PCT;
// 진행 막대가 있는 업적 — 잠김 · 안 숨김 · 목표 숫자 있음
const isNumeric = (it) => !it.unlocked && !it.hidden && Number(it.goal) > 0 && it.progress != null;
const progText = (it, sep) => `${fmt(Math.min(Number(it.progress) || 0, Number(it.goal)))}${sep}${fmt(it.goal)}${it.unit || ""}`;
const Bar = ({ it, className = "" }) => (
  <span aria-hidden className={`block h-1 bg-[#ededed] overflow-hidden ${className}`}>
    <span className="block h-full bg-[#131313]" style={{ width: `${Math.round(pctOf(it) * 1000) / 10}%` }}></span>
  </span>
);

// 오른쪽 메타(lg 이상) — 깬 것: 날짜 / x% 달성 · 진행 중: 막대 + 6,240 / 10,000분 / x% 달성
const MetaWide = ({ it }) => {
  const date = it.unlocked ? dateOf(it.unlockedAt) : "";
  const num = isNumeric(it);
  return (
    <div className="hidden lg:block w-[150px] shrink-0 text-right">
      {date && <p className="text-[11.5px] font-extrabold text-[#8a8a8a] tabular-nums leading-[15px]">{date}</p>}
      {num && (
        <div className="flex items-center justify-end gap-2">
          <Bar it={it} className="flex-1 min-w-[24px] max-w-[70px]" />
          <span className="shrink-0 text-[11px] font-extrabold text-[#5a5a5a] tabular-nums whitespace-nowrap leading-[15px]">{progText(it, " / ")}</span>
        </div>
      )}
      <p className={`${date || num ? "mt-[3px] " : ""}text-[11px] font-extrabold tabular-nums leading-[15px] ${isRare(it) ? "text-[#b7791f]" : "text-[#8a8a8a]"}`}>
        {it.rarity == null ? "—" : `${rarityText(it.rarity)} 달성`}
      </p>
    </div>
  );
};
// 설명 아래 한 줄(lg 미만) — 깬 것: 날짜 · x% · 진행 중: 막대 + 6,240/10,000분
const MetaLine = ({ it }) => {
  const date = it.unlocked ? dateOf(it.unlockedAt) : "";
  const r = <span className={`tabular-nums${isRare(it) ? " text-[#b7791f]" : ""}`}>{rarityText(it.rarity)}</span>;
  return (
    <div className="lg:hidden mt-1.5 h-[15px] flex items-center gap-2 min-w-0 overflow-hidden text-[11px] font-extrabold text-[#8a8a8a] leading-[15px] whitespace-nowrap">
      {it.unlocked ? (
        <>
          {date && <span className="tabular-nums">{date}</span>}
          {date && <span aria-hidden>·</span>}
          {r}
        </>
      ) : isNumeric(it) ? (
        <>
          <Bar it={it} className="flex-1 min-w-[32px] max-w-[120px]" />
          <span className="shrink-0 tabular-nums">{progText(it, "/")}</span>
        </>
      ) : r}
    </div>
  );
};

// ── 한 줄 — 그림 · 제목 / 설명 · (lg) 메타 칸 · 보상 / 받기. lg 이상은 72px 고정 · 가운데 맞춤, 그 아래는 메타를 설명 밑에.
//    보상 칸 폭 고정(84 · lg 96) · 받기와 받음은 같은 높이 — 받아도, 자릿수가 달라도 줄 높이 · 가운데 글자가 안 움직인다
const AchRow = ({ it, claimLocked, onClaim }) => {
  const masked = it.hidden && !it.unlocked;
  const r = rewardOf(it);
  const can = isClaimable(it);
  return (
    <div className="flex items-start lg:items-center gap-[14px] min-h-[72px] lg:h-[72px] py-2.5 lg:py-0 border-t border-[#ededed] first:border-t-0">
      <AchArt it={it} dot={can} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[14px] font-black tracking-tight leading-[18px] ${it.unlocked ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{it.title}</p>
        {masked ? (
          <p aria-hidden className="mt-[3px] h-4"></p>
        ) : (
          <p className="mt-[3px] truncate text-[12px] font-bold text-[#5a5a5a] leading-4">{it.desc}</p>
        )}
        <MetaLine it={it} />
      </div>
      <MetaWide it={it} />
      <div className="shrink-0 w-[84px] lg:w-[96px] flex flex-col items-end text-right">
        {r.xp > 0 && <span className={`text-[12px] font-black tabular-nums whitespace-nowrap leading-[15px] ${it.claimed ? "text-[#a3a3a3]" : "text-[#131313]"}`}>+{fmt(r.xp)} XP</span>}
        {r.point > 0 && <span className={`mt-0.5 text-[11px] font-black tabular-nums whitespace-nowrap leading-[15px] ${it.claimed ? "text-[#a3a3a3]" : "text-[#2b8c80]"}`}>+{fmt(r.point)} 빙옥</span>}
        {can ? (
          // 테스트 사이트도 눌린다 — 훅이 "받을 수 없음" 토스트로 답한다(눌러도 아무 반응 없는 단추를 두지 않게). 모양만 꺼진 단추
          <button
            type="button"
            onClick={() => onClaim?.(it.key)}
            aria-label={claimLocked ? `${it.title} · 테스트 사이트` : `${it.title} 보상 받기`}
            className={`mt-1 h-7 px-[14px] rounded-full border inline-flex items-center justify-center text-[11.5px] font-black whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313] focus-visible:ring-offset-2 ${
              claimLocked ? "border-[#a3a3a3] text-[#a3a3a3]" : "border-[#131313] text-[#131313] hover:bg-[#f2f2f2]"
            }`}
          >
            {claimLocked ? "테스트" : "받기"}
          </button>
        ) : it.claimed ? (
          <span className="mt-1 h-7 inline-flex items-center gap-[3px] text-[11px] font-black text-[#a3a3a3] whitespace-nowrap">
            <svg aria-hidden viewBox="0 0 24 24" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="3"><path d={ICON_PATHS.check} strokeLinecap="round" strokeLinejoin="round" /></svg>
            받음
          </span>
        ) : null}
      </div>
    </div>
  );
};

// 줄 순서 — 받을 것 → 달성(최근 순) → 잠김(진행 많은 순, 숨겨진 것은 맨 뒤). 같으면 서버 순서
const sortKeys = (items) => {
  const idx = new Map(items.map((it, i) => [it.key, i]));
  const band = (it) => (isClaimable(it) ? 0 : it.unlocked ? 1 : 2);
  const at = (it) => Date.parse(it.unlockedAt || "") || 0;
  const prog = (it) => (it.hidden && !it.unlocked ? -1 : pctOf(it));
  return [...items]
    .sort((a, b) => band(a) - band(b) || (band(a) < 2 ? at(b) - at(a) : prog(b) - prog(a)) || idx.get(a.key) - idx.get(b.key))
    .map((it) => it.key);
};
// 창을 열 때 한 번 — 줄 순서 + 그때 받을 것 · 잠긴 것. 열린 동안 받기를 눌러도(또는 새로 깨도) 거른 목록에서 줄이 빠지지 않게
const snapOf = (items) => ({
  order: sortKeys(items),
  claim: new Set(items.filter(isClaimable).map((i) => i.key)),
  locked: new Set(items.filter((i) => !i.unlocked).map((i) => i.key)),
});

const TABS = [
  { k: "all", label: "전체" },
  { k: "claim", label: "받을 보상" },
  { k: "done", label: "달성" },
  { k: "prog", label: "진행 중" },
];
const RING = "outline-none focus-visible:ring-2 focus-visible:ring-[#131313]";
const Skel = ({ className = "" }) => <span aria-hidden className={`block bg-[#f2f2f2] animate-pulse ${className}`}></span>;

// 📌 업적 창 — 흰 판(시안 「라이트 A」). 폰은 아래에서 올라오는 시트(88dvh), sm 이상은 가운데 뜬 판(최대 980 · min(720, 90dvh)).
//    머리: 업적 · N / M · 닫기 → 탭(전체 · 받을 보상 N · 달성 · 진행 중) → 본문.
//    md 이상: 왼쪽 236px 요약(달성률 · 20칸 막대 · 희귀 업적 · 분류), md 미만: 분류 칩 한 줄(옆으로 밀어 보기).
//    lg 이상은 줄 오른쪽에 메타 칸, 그 아래는 메타를 설명 밑에. 창 크기 고정 — 탭 · 분류를 바꿔도 출렁이지 않는다
export default function AchievementsModal({ open, onClose, data, status = "idle", busy = "", onClaim, onClaimAll, onRetry, onTone }) {
  const items = useMemo(() => (Array.isArray(data?.items) ? data.items : []), [data]);
  const groups = useMemo(() => (Array.isArray(data?.groups) ? data.groups : []), [data]);
  const [grp, setGrp] = useState("all");
  const [tab, setTab] = useState("all");
  const [snap, setSnap] = useState(null);
  const [wasOpen, setWasOpen] = useState(open);
  // 열 때마다 전체 · 새 순서로 — 열려 있는 동안은 순서를 고정한다(받기를 눌러도 줄이 자리를 지킨다)
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setGrp("all");
      setTab("all");
      setSnap(items.length ? snapOf(items) : null);
    }
  }
  if (open && !snap && items.length) setSnap(snapOf(items));
  // 목록이 비면(다른 계정으로 바뀜) 순서도 버린다 — 새 목록이 오면 그 계정 기준으로 다시 정한다
  if (snap && !items.length) setSnap(null);

  const closeRef = useRef(null);
  const listRef = useRef(null);
  useEffect(() => { if (open) closeRef.current?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const ordered = useMemo(() => {
    const keys = snap?.order || [];
    const seen = new Set(keys);
    return [...keys.map((k) => byKey.get(k)).filter(Boolean), ...items.filter((i) => !seen.has(i.key))];
  }, [snap, byKey, items]);
  // 거르기 = 탭 × 분류. 받을 보상 · 진행 중은 연 때 기준도 함께(받아도 · 새로 깨도 그 줄이 빠지지 않게)
  const rows = useMemo(() => ordered.filter((i) => {
    if (grp !== "all" && i.group !== grp) return false;
    if (tab === "claim") return isClaimable(i) || !!snap?.claim.has(i.key);
    if (tab === "done") return !!i.unlocked;
    if (tab === "prog") return !i.unlocked || !!snap?.locked.has(i.key);
    return true;
  }), [ordered, grp, tab, snap]);
  const counts = useMemo(() => {
    const m = new Map();
    items.forEach((i) => {
      const c = m.get(i.group) || { u: 0, t: 0 };
      c.t += 1;
      if (i.unlocked) c.u += 1;
      m.set(i.group, c);
    });
    return m;
  }, [items]);
  // 희귀 업적 — 깬 것 중 희귀도 낮은 셋(희귀도 모르는 것은 뺀다)
  const rare = useMemo(() => {
    const idx = new Map(items.map((it, i) => [it.key, i]));
    return items
      .filter((i) => i.unlocked && i.rarity != null)
      .sort((a, b) => Number(a.rarity) - Number(b.rarity) || idx.get(a.key) - idx.get(b.key))
      .slice(0, 3);
  }, [items]);

  if (!open || !ACHIEVEMENTS_ON) return null;

  const total = Number(data?.total) || items.length;
  const unlocked = Number(data?.unlocked) || items.filter((i) => i.unlocked).length;
  const claimLocked = !!data?.claimLocked;
  const claimableN = items.filter(isClaimable).length;
  // 달성률 · 20칸 — 하나라도 깼으면 1 이상, 다 깨기 전에는 100 · 20칸을 채우지 않는다
  const part = (n) => (total > 0 ? (unlocked >= total ? n : Math.min(n - 1, Math.max(unlocked > 0 ? 1 : 0, Math.round((unlocked / total) * n)))) : 0);
  const pctN = part(100);
  const segN = part(20);
  // 목록 머리 「받을 보상 N」 — 거른 목록에 받을(받던) 것이 있을 때. 모두 받기는 훅이 전부를 받으므로 거른 목록이 전부를 담을 때만
  const subOn = !!data && rows.some((i) => isClaimable(i) || snap?.claim.has(i.key));
  const subN = rows.filter(isClaimable).length;
  const allOn = !claimLocked && !!onClaimAll && (busy === "all" || (subN >= 2 && subN === claimableN));

  const scrollTop = () => listRef.current?.scrollTo({ top: 0 });
  const pick = (g) => {
    if (g === grp) return;
    setGrp(g);
    onTone?.();
    scrollTop();
  };
  const pickTab = (k) => {
    if (k === tab) return;
    setTab(k);
    onTone?.();
    scrollTop();
  };
  const shownGroups = groups.filter((g) => (counts.get(g.g)?.t || 0) > 0);
  const failed = !data && status === "fail";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(10,10,10,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="업적"
        onClick={(e) => e.stopPropagation()}
        className="ach-pop relative w-full sm:max-w-[980px] h-[88dvh] sm:h-[min(720px,90dvh)] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white text-[#131313] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] flex flex-col"
        style={{ animation: "achIn .32s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <style>{ACH_CSS}</style>

        {/* 모바일 바텀시트 손잡이 */}
        <div aria-hidden className="sm:hidden shrink-0 flex justify-center pt-2.5"><span className="w-10 h-1 rounded-full bg-[#d0d0d0]"></span></div>

        {/* 머리 — 탭 · 분류를 바꿔도 그대로 */}
        <div className="shrink-0 flex items-center gap-2.5 px-[18px] sm:px-[22px] pt-3.5 sm:pt-[18px] pb-2 sm:pb-2.5">
          <h3 className="text-[18px] font-black tracking-tight leading-none">업적</h3>
          <span className="text-[14px] font-extrabold text-[#a3a3a3] tabular-nums whitespace-nowrap">{data ? `${fmt(unlocked)} / ${fmt(total)}` : "— / —"}</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className={`ml-auto shrink-0 w-[34px] h-[34px] rounded-full border border-[#a3a3a3] text-[#131313] hover:bg-[#f2f2f2] transition-colors flex items-center justify-center ${RING}`}
          >
            <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2"><path d={ICON_PATHS.close} strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* 탭 — 고른 것만 잉크 칠(굵기 · 패딩 같음). 받을 보상 탭은 폭 고정(숫자가 줄거나 사라져도 옆 탭이 안 밀린다) */}
        {/*  위 4px(pt-1)는 초점 테 자리 — 옆으로 넘치면 밀어 보는 줄이라 위아래가 잘린다. 머리 아래 여백을 그만큼 줄였다 */}
        <div aria-label="업적 보기" className="shrink-0 flex items-center gap-1.5 px-[18px] sm:px-[22px] pt-1 pb-3 sm:pb-3.5 border-b border-[#131313] overflow-x-auto no-bar">
          {TABS.map((t) => {
            const on = tab === t.k;
            return (
              <button
                key={t.k}
                type="button"
                aria-pressed={on}
                onClick={() => pickTab(t.k)}
                className={`shrink-0 h-8 px-3.5 rounded-full inline-flex items-center justify-center gap-1.5 text-[12.5px] font-extrabold whitespace-nowrap transition-colors ${RING} focus-visible:ring-offset-2 ${
                  t.k === "claim" ? "min-w-[104px]" : ""
                } ${on ? "bg-[#131313] text-white" : "bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313]"}`}
              >
                {t.label}
                {t.k === "claim" && claimableN > 0 && <b className="font-black text-[#e91e3f] tabular-nums">{claimableN}</b>}
              </button>
            );
          })}
        </div>

        {/* 분류 칩(md 미만) — 한 줄, 넘치면 옆으로. 고른 칩은 테두리 · 글자색만 바뀐다 */}
        {!failed && (
          <div aria-label="업적 분류" className="md:hidden shrink-0 flex items-center gap-1.5 px-[18px] sm:px-[22px] pt-3 pb-0.5 overflow-x-auto no-bar whitespace-nowrap">
            {[{ g: "all", label: "전체" }, ...shownGroups].map((g) => {
              const on = grp === g.g;
              const c = counts.get(g.g);
              return (
                <button
                  key={g.g}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(g.g)}
                  className={`shrink-0 h-7 px-[11px] rounded-full border inline-flex items-center gap-1 text-[12px] font-extrabold whitespace-nowrap transition-colors ${RING} ${
                    on ? "border-[#131313] text-[#131313]" : "border-[#a3a3a3] text-[#5a5a5a] hover:text-[#131313]"
                  }`}
                >
                  {g.label}
                  {g.g !== "all" && c && <span className="text-[11px] text-[#a3a3a3] tabular-nums">{c.u}/{c.t}</span>}
                </button>
              );
            })}
          </div>
        )}

        {failed ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center pb-10">
            <p className="text-[13px] font-bold text-[#5a5a5a]">불러오지 못했습니다</p>
            <button
              type="button"
              onClick={() => { onTone?.(); onRetry?.(); }}
              className={`mt-4 h-8 px-4 rounded-full border border-[#a3a3a3] text-[12px] font-extrabold text-[#131313] hover:bg-[#f2f2f2] transition-colors ${RING}`}
            >
              다시
            </button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex">
            {/* 왼쪽 요약(md 이상) — 넘치면 이 판만 스크롤. 막대는 숨김 — 윈도우 막대(10px)가 생기면 희귀 업적 세 칸(190)이 안쪽 폭을 넘는다 */}
            <aside className="ach-side hidden md:block w-[236px] shrink-0 border-r border-[#ededed] overflow-y-auto overflow-x-hidden px-[22px] py-5">
              {!data ? (
                <div aria-hidden>
                  <Skel className="h-10 w-28" />
                  <div className="mt-3 flex" style={{ gap: 2 }}>{Array.from({ length: 20 }, (_, i) => <span key={i} className="flex-1 h-2 bg-[#ededed]"></span>)}</div>
                  <Skel className="mt-[22px] h-3 w-12" />
                  {Array.from({ length: 6 }, (_, i) => <Skel key={i} className="mt-4 h-3.5 w-full" />)}
                </div>
              ) : (
                <>
                  <p className="flex items-baseline whitespace-nowrap leading-none">
                    <span className="text-[40px] font-black tracking-tight tabular-nums">{pctN}%</span>
                    <span className="ml-1 text-[15px] font-extrabold text-[#a3a3a3] tabular-nums">{unlocked}/{total}</span>
                  </p>
                  <div aria-hidden className="mt-3 flex" style={{ gap: 2 }}>
                    {Array.from({ length: 20 }, (_, i) => <span key={i} className={`flex-1 h-2 ${i < segN ? "bg-[#131313]" : "bg-[#ededed]"}`}></span>)}
                  </div>
                  {rare.length > 0 && (
                    <>
                      <p className="mt-[22px] mb-2.5 text-[11px] font-extrabold text-[#8a8a8a]">희귀 업적</p>
                      <div className="flex gap-2">
                        {rare.map((it) => (
                          <div key={it.key} title={it.title} className="w-[58px] shrink-0 text-center">
                            <AchArt it={it} size={40} box={58} />
                            <span className="block mt-[5px] text-[11px] font-black text-[#b7791f] tabular-nums leading-[14px]">{rarityText(it.rarity)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <p className="mt-[22px] mb-2.5 text-[11px] font-extrabold text-[#8a8a8a]">분류</p>
                  <div className="-mx-2.5">
                    {[{ g: "all", label: "전체" }, ...shownGroups].map((g) => {
                      const on = grp === g.g;
                      const c = g.g === "all" ? { u: unlocked, t: total } : counts.get(g.g) || { u: 0, t: 0 };
                      return (
                        <button
                          key={g.g}
                          type="button"
                          aria-pressed={on}
                          onClick={() => pick(g.g)}
                          className={`w-full h-[34px] px-2.5 flex items-center text-left text-[13px] font-extrabold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#131313] ${
                            on ? "bg-[#f2f2f2] text-[#131313]" : "text-[#5a5a5a] hover:text-[#131313]"
                          }`}
                        >
                          <span className="min-w-0 truncate">{g.label}</span>
                          <span className={`ml-auto pl-2 shrink-0 text-[12px] tabular-nums ${on ? "text-[#5a5a5a]" : "text-[#a3a3a3]"}`}>{c.u}/{c.t}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </aside>

            {/* 목록 — 스크롤은 여기만 */}
            <div ref={listRef} className="ach-scroll flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-[18px] sm:px-[22px] pt-0.5 md:pt-1.5" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
              {!data ? (
                <div aria-hidden>
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="flex items-center gap-[14px] h-[72px] border-t border-[#ededed] first:border-t-0">
                      <Skel className="w-[52px] h-[52px] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <Skel className="h-3.5 w-2/5" />
                        <Skel className="mt-2 h-3 w-3/5" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : rows.length ? (
                <>
                  {subOn && (
                    <div className="h-11 flex items-center text-[12px] font-black text-[#5a5a5a]">
                      <span className="tabular-nums whitespace-nowrap">받을 보상{subN > 0 ? ` ${subN}` : ""}</span>
                      {allOn && (
                        <button
                          type="button"
                          onClick={onClaimAll}
                          disabled={!!busy}
                          className="relative ml-auto h-7 px-3 rounded-full bg-[#e91e3f] enabled:hover:bg-[#d01634] text-white text-[11.5px] font-black whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f] focus-visible:ring-offset-2 disabled:opacity-60"
                        >
                          <span className={busy === "all" ? "invisible" : undefined}>모두 받기</span>
                          {busy === "all" && <span className="absolute inset-0 flex items-center justify-center">…</span>}
                        </button>
                      )}
                    </div>
                  )}
                  {rows.map((it) => <AchRow key={it.key} it={it} claimLocked={claimLocked} onClaim={onClaim} />)}
                </>
              ) : (
                <div className="h-full flex items-center justify-center pb-10">
                  <p className="text-[13px] font-bold text-[#5a5a5a]">없습니다</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 📌 달성 알림 — 토스트 자리(오른쪽 아래, 레벨 페이지 흰 바탕 위)에 흰 카드 하나. 누르면 업적 창. 6초 뒤 저절로 사라진다(훅)
export function AchievementNotice({ notice, onOpen }) {
  if (!notice || !ACHIEVEMENTS_ON) return null;
  const it = { unlocked: true, hidden: false, icon: notice.icon };
  return (
    <>
    <style>{NOTE_CSS}</style>
    <button
      key={notice.id}
      type="button"
      onClick={onOpen}
      aria-label={`업적 달성 · ${notice.title}`}
      className={`pointer-events-auto w-[300px] max-w-[calc(100vw-32px)] flex items-center gap-3 p-3 pr-4 rounded-2xl bg-white border border-[#ededed] text-left text-[#131313] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] hover:border-[#a3a3a3] transition-colors ${RING}`}
      style={{ animation: "achNoteIn .45s cubic-bezier(0.16,1,0.3,1)" }}
    >
      <AchArt it={it} size={32} box={44} />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-black tracking-[0.06em] text-[#e91e3f]">업적 달성</span>
        <span className="mt-1 flex items-baseline gap-1.5 min-w-0">
          <span className="min-w-0 truncate text-[13px] font-black text-[#131313]">{notice.title}</span>
          {notice.more > 0 && <span className="shrink-0 text-[11px] font-bold text-[#8a8a8a] tabular-nums">외 {notice.more}개</span>}
        </span>
      </span>
    </button>
    </>
  );
}

const ACH_CSS = `
@keyframes achIn { from { opacity: 0; transform: translateY(16px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
.ach-scroll { scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: #d0d0d0 transparent; }
.ach-side { scrollbar-width: none; }
.ach-side::-webkit-scrollbar { display: none; }
@media (prefers-reduced-motion: reduce) { .ach-pop { animation: none !important; } }
`;
const NOTE_CSS = `
@keyframes achNoteIn { 0% { opacity: 0; transform: translateY(-14px) scale(0.96); } 60% { opacity: 1; } 100% { opacity: 1; transform: translateY(0) scale(1); } }
@media (prefers-reduced-motion: reduce) { [aria-label^="업적 달성"] { animation: none !important; } }
`;
