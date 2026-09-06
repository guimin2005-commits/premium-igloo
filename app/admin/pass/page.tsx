"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { Reveal, LuxStyles } from "../../components/Lux";
import Dropdown from "../../components/Dropdown";
import { ADMIN_USERS } from "@/lib/admins";
import { SEASON } from "@/lib/season";

// 📌 시즌 패스 구성 화면 — 무료/프리미엄 2트랙의 티어 사다리를 관리한다.
//    티어가 20개를 넘어가면 세로로 늘어선 폼은 훑기가 불가능해지므로,
//    목록은 한 줄 요약만 보여주고 실제 편집은 모달에서 한다.

type RewardKind = "xp" | "point" | "role" | "none";
type Reward = { kind: RewardKind; amount: number; roleId: string; roleName: string };
// 📌 tid — 서버가 발급하는 티어 고유 식별자("t7"). 유저 수령 기록이 이 값으로 남으므로
//    편집 · 정렬 · 삭제 어느 경로에서도 잃어버리면 안 된다 (잃으면 서버가 새 tid 를 발급해
//    이미 받은 티어가 미수령으로 되살아난다). 새로 만든 티어만 빈 문자열로 보내 서버가 발급하게 한다.
//    key 는 React 목록 전용 로컬 키 — 아직 tid 가 없는 새 티어도 행을 구분해야 해서 따로 둔다. 서버로 보내지 않는다.
type Tier = { key: string; tid: string; level: number; need: number; free: Reward; paid: Reward };
// 모달에서는 숫자 칸을 비울 수 있어야 해서 문자열로 들고 있다가 확인할 때 숫자로 바꾼다
type DraftReward = { kind: RewardKind; amount: string; roleId: string; roleName: string };
type Draft = { index: number; need: string; free: DraftReward; paid: DraftReward };

const KIND_OPTIONS: { v: RewardKind; l: string }[] = [
  { v: "none", l: "없음" },
  { v: "xp", l: "XP" },
  { v: "point", l: "POINT" },
  { v: "role", l: "역할" },
];

const inputClass =
  "w-full bg-transparent border border-black/10 rounded-lg px-4 py-3 text-sm text-[#131313] outline-none focus:outline-none focus:border-[#e91e3f] transition-colors placeholder:text-[#8a8a8a]";
const labelClass = "block text-xs font-bold text-[#5a5a5a] mb-2";
const fieldNote = "text-[10px] text-[#5a5a5a] mt-1.5";

const EMPTY_REWARD: Reward = { kind: "none", amount: 0, roleId: "", roleName: "" };

// 불러오기에 실패한 채로 저장하면 빈 구성이 운영 중인 설정을 통째로 덮어쓴다
const LOAD_FAILED_MSG = "현재 설정을 불러오지 못해 저장할 수 없습니다. 위의 [다시 불러오기]가 성공한 뒤에 저장해 주세요.";

const toInt = (v: any) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const normReward = (r: any): Reward => ({
  kind: (["xp", "point", "role"] as string[]).includes(r?.kind) ? r.kind : "none",
  amount: toInt(r?.amount),
  roleId: r?.roleId || "",
  roleName: r?.roleName || "",
});

// 목록에 뿌릴 한 줄 요약 — 서버가 만드는 label 과 같은 모양으로 맞춘다
const rewardLabel = (r: Reward, roleNameOf: (id: string) => string) => {
  if (r.kind === "xp") return `XP ${r.amount.toLocaleString()}`;
  if (r.kind === "point") return `POINT ${r.amount.toLocaleString()}`;
  if (r.kind === "role") return `역할 · ${roleNameOf(r.roleId) || r.roleName || "미지정"}`;
  return "-";
};

// 저장 여부를 비교할 지문 — 서버로 나가는 값만 담는다 (로컬 전용 key 는 빼야 헛된 "변경됨"이 안 뜬다)
const sig = (enabled: boolean, price: number, list: Tier[]) =>
  JSON.stringify({
    enabled,
    unlockPrice: price,
    tiers: list.map((t) => ({ tid: t.tid, level: t.level, need: t.need, free: t.free, paid: t.paid })),
  });

// ── 보상 편집 블록 ────────────────────────────
// 📌 모달 안에서 입력값을 다루므로 반드시 모듈 스코프에 둔다.
//    페이지 함수 안에서 정의하면 렌더마다 새 컴포넌트가 되어 타이핑 도중 포커스가 날아간다.
function RewardEditor({
  title,
  hint,
  tone,
  value,
  roles,
  onChange,
}: {
  title: string;
  hint: string;
  tone: string;
  value: DraftReward;
  roles: any[];
  onChange: (next: DraftReward) => void;
}) {
  return (
    <div className="border-t border-black/[0.08] pt-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <span className="text-[11px] font-black tracking-[0.14em]" style={{ color: tone }}>
          {title}
        </span>
        <span className="text-[10px] text-[#8a8a8a] break-keep text-right">{hint}</span>
      </div>

      <div className="flex gap-2 mb-3">
        {KIND_OPTIONS.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange({ ...value, kind: o.v })}
            className={`flex-1 py-2.5 rounded-lg text-[11px] font-bold border transition-colors outline-none focus:outline-none ${
              value.kind === o.v
                ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/40"
                : "text-[#5a5a5a] border-black/10 hover:text-[#131313]"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>

      {(value.kind === "xp" || value.kind === "point") && (
        <div>
          <input
            type="number"
            min={0}
            value={value.amount}
            onChange={(e) => onChange({ ...value, amount: e.target.value })}
            placeholder={value.kind === "xp" ? "예: 1000" : "예: 500"}
            className={inputClass}
          />
          <p className={fieldNote}>
            {value.kind === "xp"
              ? "봇 지급 큐에 쌓여 30초 이내 반영됩니다 (레벨 재계산 포함)"
              : "사이트가 즉시 지급합니다"}
          </p>
        </div>
      )}

      {value.kind === "role" && (
        <div>
          <Dropdown
            theme="light"
            value={value.roleId}
            placeholder="지급할 역할을 선택하세요"
            onChange={(v) =>
              onChange({ ...value, roleId: v, roleName: roles.find((r: any) => r.id === v)?.name || "" })
            }
            options={roles.map((r: any) => ({ value: r.id, label: r.name, color: r.color }))}
          />
          <p className={fieldNote}>수령 시 구매 문서로 쌓여 봇이 30초 이내에 역할을 붙입니다</p>
        </div>
      )}

      {value.kind === "none" && <p className="text-[11px] text-[#a3a3a3]">이 칸은 비어 있습니다. 목록에는 &lsquo;-&rsquo; 로 표시됩니다.</p>}
    </div>
  );
}

export default function AdminPassPage() {
  const { data: session, status } = useSession();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false });

  const [guildRoles, setGuildRoles] = useState<any[]>([]);
  // 역할 목록은 설정과 다른 API 라 따로 실패한다 — 조용히 넘기면 드롭다운이 빈 상자로 열려
  // 관리자가 "서버에 역할이 없다"고 오해한다
  const [rolesFailed, setRolesFailed] = useState(false);
  // 아직 tid 가 없는 새 티어에 붙일 로컬 키 발급기 (저장 body 에는 나가지 않는다)
  const newKeyRef = useRef(0);
  // 해금가 칸을 비웠을 때 되돌릴 직전 값 — 빈칸이 0 으로 저장되는 사고를 막는다
  const lastPriceRef = useRef("50000");
  // 📌 기본 꺼짐 — 티어를 다 채우기 전에 보상이 새 나가지 않게 (모델 기본값과 같음).
  //    불러오기에 실패했을 때 실수로 켜진 채 저장되는 일도 막는다.
  const [enabled, setEnabled] = useState(false);
  const [unlockPrice, setUnlockPrice] = useState("50000");
  const [tiers, setTiers] = useState<Tier[]>([]);
  // 저장 시점의 스냅샷 — 안 바꾼 채 나가는 걸 막기 위한 비교용
  const [snapshot, setSnapshot] = useState("");

  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);
  const [confirmSort, setConfirmSort] = useState(false);

  const notify = (message: string, isError = false) => setPopup({ isOpen: true, message, isError });

  // 📌 목록 편집은 저장 전 로컬 변경이라 모달로 막아 세우면 오히려 방해가 된다.
  //    하단 저장 바에 잠깐 뜨는 한 줄로만 알린다.
  const [flash, setFlash] = useState("");
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  // 봇이 실제로 붙일 수 있는 역할만 — 디스코드가 관리하는 역할(부스트 등)은 지급이 불가능하다
  const grantableRoles = useMemo(() => guildRoles.filter((r: any) => !r.managed), [guildRoles]);
  const roleNameOf = useCallback(
    (id: string) => guildRoles.find((r: any) => r.id === id)?.name || "",
    [guildRoles]
  );

  const applyConfig = useCallback((cfg: any) => {
    const list: Tier[] = (Array.isArray(cfg?.tiers) ? cfg.tiers : []).map((t: any, i: number) => {
      // 서버가 준 tid 를 그대로 들고 있는다 — 저장할 때 이 값을 되돌려 보내야 수령 기록이 티어를 계속 따라간다
      const tid = String(t?.tid || "");
      return {
        // tid 가 곧 안정 키 — 정렬 · 삭제로 순서가 바뀌어도 React 가 같은 행으로 알아본다
        key: tid ? `s:${tid}` : `new:${++newKeyRef.current}`,
        tid,
        level: toInt(t?.level) || i + 1,
        need: toInt(t?.need),
        free: normReward(t?.free),
        paid: normReward(t?.paid),
      };
    });
    const on = cfg?.enabled === true;
    const price = toInt(cfg?.unlockPrice);
    setEnabled(on);
    setUnlockPrice(String(price));
    lastPriceRef.current = String(price);
    setTiers(list);
    setSnapshot(sig(on, price, list));
  }, []);

  // 📌 역할 목록만 다시 받는다. 전체 재조회로 하면 서버 저장본이 applyConfig 로 덮어써져
  //    저장하지 않은 티어 편집이 통보도 없이 사라진다 — 역할 배너는 설정이 정상 로드된
  //    상태에서만 뜨므로 그 상황이 실제로 자주 온다.
  const fetchRoles = useCallback(() => {
    fetch("/api/discord-roles", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null)
      .then((roles) => {
        const roleList = roles?.success === true && Array.isArray(roles?.data) ? roles.data : [];
        setGuildRoles(roleList);
        setRolesFailed(roleList.length === 0);
      });
  }, []);

  const fetchAll = useCallback(() => {
    setIsLoading(true);
    Promise.all([
      fetch("/api/admin/pass", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/discord-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ])
      .then(([cfg, roles]) => {
        const roleList = roles?.success === true && Array.isArray(roles?.data) ? roles.data : [];
        setGuildRoles(roleList);
        // 목록이 비면 역할 보상을 아예 고를 수 없으므로, 실패든 빈 응답이든 똑같이 알린다
        setRolesFailed(roleList.length === 0);
        if (cfg?.success && cfg.config) {
          applyConfig(cfg.config);
          setLoadFailed(false);
        } else {
          // 📌 아직 API 가 없거나 응답이 깨졌을 때 — 화면은 열어 두되(빈 구성),
          //    이 빈 구성이 운영 설정을 덮어쓰지 않게 저장 버튼을 잠근다
          setLoadFailed(true);
        }
      })
      .finally(() => setIsLoading(false));
  }, [applyConfig]);

  useEffect(() => {
    if (isAdmin) fetchAll();
  }, [isAdmin, fetchAll]);

  const current = sig(enabled, toInt(unlockPrice), tiers);
  const isDirty = !isLoading && current !== snapshot;

  // need 가 오름차순이 아니면 유저 진행도가 티어를 건너뛰거나 영영 못 넘는다
  const badOrder = tiers.some((t, i) => i > 0 && t.need <= tiers[i - 1].need);
  const badZero = tiers.some((t) => t.need <= 0);
  const missingRole =
    tiers.some((t) => (t.free.kind === "role" && !t.free.roleId) || (t.paid.kind === "role" && !t.paid.roleId));

  // ── 티어 조작 ────────────────────────────────
  // 서버가 100개에서 잘라 버리므로 화면에서 먼저 막는다
  const MAX_TIERS = 100;

  const addTier = () => {
    if (tiers.length >= MAX_TIERS) return notify(`티어는 최대 ${MAX_TIERS}개까지 만들 수 있습니다.`, true);
    const key = `new:${++newKeyRef.current}`;
    setTiers((prev) => {
      const last = prev[prev.length - 1];
      const prev2 = prev[prev.length - 2];
      // 직전 두 티어의 간격을 그대로 이어 붙인다 (없으면 5,000)
      const step = last && prev2 ? Math.max(1, last.need - prev2.need) : 5000;
      const need = last ? last.need + step : 5000;
      // tid 는 빈 문자열 — 저장할 때 서버가 새로 발급한다 (화면이 임의로 짓지 않는다)
      return [...prev, { key, tid: "", level: prev.length + 1, need, free: { ...EMPTY_REWARD }, paid: { ...EMPTY_REWARD } }];
    });
    setFlash("티어를 추가했습니다. 보상을 채운 뒤 저장하세요.");
  };

  const removeTier = () => {
    if (deleteIdx == null) return;
    setTiers((prev) => prev.filter((_, i) => i !== deleteIdx).map((t, i) => ({ ...t, level: i + 1 })));
    setDeleteIdx(null);
    setFlash("목록에서 뺐습니다. 저장해야 실제로 반영됩니다.");
  };

  const sortTiers = () => {
    setTiers((prev) => [...prev].sort((a, b) => a.need - b.need).map((t, i) => ({ ...t, level: i + 1 })));
    setFlash("필요 XP 오름차순으로 정렬하고 레벨을 다시 매겼습니다.");
  };

  const openEditor = (i: number) => {
    const t = tiers[i];
    const toDraft = (r: Reward): DraftReward => ({
      kind: r.kind,
      amount: r.amount ? String(r.amount) : "",
      roleId: r.roleId,
      roleName: r.roleName,
    });
    setDraft({ index: i, need: String(t.need), free: toDraft(t.free), paid: toDraft(t.paid) });
  };

  const applyDraft = () => {
    if (!draft) return;
    const need = toInt(draft.need);
    if (need <= 0) return notify("필요 XP는 1 이상이어야 합니다.", true);

    const fromDraft = (d: DraftReward): Reward => ({
      kind: d.kind,
      amount: d.kind === "xp" || d.kind === "point" ? toInt(d.amount) : 0,
      roleId: d.kind === "role" ? d.roleId : "",
      roleName: d.kind === "role" ? roleNameOf(d.roleId) || d.roleName : "",
    });

    for (const [d, who] of [
      [draft.free, "무료"],
      [draft.paid, "프리미엄"],
    ] as [DraftReward, string][]) {
      if (d.kind === "role" && !d.roleId) return notify(`${who} 보상의 역할을 선택해 주세요.`, true);
      if ((d.kind === "xp" || d.kind === "point") && toInt(d.amount) <= 0)
        return notify(`${who} 보상의 수량을 1 이상으로 입력해 주세요.`, true);
    }

    setTiers((prev) =>
      prev.map((t, i) => (i === draft.index ? { ...t, need, free: fromDraft(draft.free), paid: fromDraft(draft.paid) } : t))
    );
    setDraft(null);
  };

  // ── 저장 ────────────────────────────────────
  const doSave = async () => {
    if (isSaving) return;
    // 어느 경로(정렬 확인 모달 포함)로 들어와도 불러오기 실패 상태에서는 저장하지 않는다
    if (loadFailed) return notify(LOAD_FAILED_MSG, true);
    setIsSaving(true);
    const res = await fetch("/api/admin/pass", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled,
        unlockPrice: toInt(unlockPrice),
        tiers: tiers.map((t, i) => ({
          // 📌 기존 티어의 tid 를 그대로 되돌려 보낸다 — 이 값이 빠지면 서버가 새 tid 를 발급해
          //    이미 받은 티어가 미수령으로 되살아난다. 새 티어만 빈 문자열(서버가 발급).
          tid: t.tid || "",
          level: i + 1,
          need: t.need,
          free: { ...t.free, roleName: t.free.kind === "role" ? roleNameOf(t.free.roleId) || t.free.roleName : "" },
          paid: { ...t.paid, roleName: t.paid.kind === "role" ? roleNameOf(t.paid.roleId) || t.paid.roleName : "" },
        })),
      }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setIsSaving(false);
    setConfirmSort(false);

    if (res?.ok && d?.success) {
      // 📌 응답 본문에는 서버가 새로 발급한 tid 가 들어 있다. 이걸 못 받으면 새 티어가 tid 없는 채로
      //    남아, 다음 저장 때 또 새 tid 를 받아 별개 티어처럼 갈라진다 — 없으면 다시 불러와서라도 맞춘다.
      if (d.config) applyConfig(d.config);
      else fetchAll();
      setLoadFailed(false);
      notify("저장되었습니다. 유저 화면에 바로 반영됩니다.");
    } else {
      notify(d?.message || "저장에 실패했습니다.", true);
    }
  };

  const trySave = () => {
    // 저장 버튼도 막아 두지만, 키보드 · 재시도 등 다른 경로를 대비해 여기서 한 번 더 세운다
    if (loadFailed) return notify(LOAD_FAILED_MSG, true);
    // 📌 해금가가 0 이면 프리미엄 트랙이 전원 무료로 열린다 — 빈칸이 조용히 0 으로 저장되던 사고를 막는다
    if (toInt(unlockPrice) <= 0) return notify("프리미엄 해금가를 1 이상으로 입력하세요.", true);
    if (missingRole) return notify("역할 보상 중 역할이 지정되지 않은 티어가 있습니다.", true);
    if (badZero) return notify("필요 XP가 0인 티어가 있습니다. 1 이상으로 고쳐 주세요.", true);
    // 서버도 정렬하지만, 관리자가 의도한 순서인지 먼저 확인받는다
    if (badOrder) return setConfirmSort(true);
    doSave();
  };

  // ── 권한 게이트 ──────────────────────────────
  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-[#8a8a8a]">로딩 중...</div>;
  if (!isAdmin) {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-[#131313] mb-2">권한 없음</h2>
        <p className="text-[#5a5a5a] text-sm mb-4">관리자 권한이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }

  const SectionHead = ({ no, title, right }: { no: string; title: string; right?: React.ReactNode }) => (
    <div className="mb-6">
      <div className="flex items-baseline gap-4 mb-2">
        <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">{no}</span>
        <div className="h-px flex-1 bg-gradient-to-r from-black/15 to-transparent"></div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg md:text-xl font-black text-[#131313] tracking-tight">{title}</h2>
        {right}
      </div>
    </div>
  );

  const maxNeed = tiers.length ? Math.max(...tiers.map((t) => t.need)) : 0;

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      {/* ── HERO ── */}
      <section className="relative w-full pt-16 pb-10 md:pt-20 md:pb-12 px-6">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="max-w-4xl mx-auto relative z-10">
          <Reveal>
            <div className="flex items-center gap-3 mb-3">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-[#8a8a8a] uppercase">Admin · Season Pass</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter leading-none mb-2.5">
              <span className="text-[#131313]">시즌 </span>
              <span className="text-[#e91e3f]">패스</span>
            </h1>
            <p className="text-[#5a5a5a] text-[13px] leading-relaxed break-keep">
              시즌 {SEASON.number} &lsquo;{SEASON.name}&rsquo; 의 무료 · 프리미엄 2트랙 보상 사다리를 구성합니다.
              진행도는 이번 시즌에 번 XP이며, 새 시즌이 시작되면 수령 기록과 해금 상태가 자동으로 초기화됩니다.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-6xl mx-auto px-6 pb-16 flex-1 flex flex-col space-y-14">
        {loadFailed && (
          <div className="px-4 py-3 rounded-lg border border-[#e91e3f]/30 bg-[#e91e3f]/[0.06] text-[12px] font-bold text-[#c2183a] break-keep">
            현재 설정을 불러오지 못했습니다 (/api/admin/pass 응답 없음). 아래는 빈 구성이므로,
            운영 중인 설정을 덮어쓰지 않도록 <strong>저장을 막아 두었습니다.</strong> 다시 불러오기에 성공하면 저장할 수 있습니다.
            <button onClick={fetchAll} className="ml-2 underline underline-offset-2 outline-none focus:outline-none">다시 불러오기</button>
          </div>
        )}

        {rolesFailed && !isLoading && (
          <div className="px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] text-[12px] font-bold text-amber-700 break-keep">
            역할 목록을 불러오지 못했습니다 (/api/discord-roles). 역할 보상 드롭다운이 빈 상자로 열리며,
            이미 지정된 역할 보상은 그대로 유지됩니다.
            <button onClick={fetchRoles} className="ml-2 underline underline-offset-2 outline-none focus:outline-none">다시 불러오기</button>
          </div>
        )}

        {/* ═══ 01. 기본 설정 ═══ */}
        <Reveal>
          <section>
            <SectionHead no="01" title="기본 설정" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>시즌 패스 사용</label>
                <button
                  type="button"
                  onClick={() => setEnabled(!enabled)}
                  className={`${inputClass} flex items-center justify-between text-left ${enabled ? "border-[#e91e3f]/50" : ""}`}
                >
                  <span className={enabled ? "text-[#e91e3f] font-bold" : "text-[#5a5a5a]"}>{enabled ? "운영 중" : "중단 (수령 불가)"}</span>
                  <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${enabled ? "bg-[#e91e3f]" : "bg-[#e6e3de]"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white ring-1 ring-black/15 shadow-sm transition-all ${enabled ? "left-[18px]" : "left-0.5"}`}></span>
                  </span>
                </button>
                <p className={fieldNote}>끄면 유저 화면에 보상표는 그대로 보이지만 수령 · 해금이 모두 막힙니다</p>
              </div>

              <div>
                <label className={labelClass}>프리미엄 트랙 해금가</label>
                <input
                  type="number"
                  min={1}
                  value={unlockPrice}
                  onChange={(e) => setUnlockPrice(e.target.value)}
                  // 📌 비운 채 저장하면 0 이 되어 프리미엄이 전원 무료로 열린다 — 칸을 벗어날 때 직전 값으로 되돌린다
                  onBlur={() => {
                    if (toInt(unlockPrice) <= 0) {
                      setUnlockPrice(lastPriceRef.current);
                      setFlash("해금가는 비워 둘 수 없어 직전 값으로 되돌렸습니다.");
                    } else {
                      lastPriceRef.current = String(toInt(unlockPrice));
                    }
                  }}
                  placeholder="예: 50000"
                  className={inputClass}
                />
                <p className={fieldNote}>XP 또는 POINT 로 한 번만 결제하면 그 시즌 내내 열립니다 (XP · POINT 는 1:1 등가) · 1 이상이어야 합니다</p>
              </div>
            </div>

            {/* 구성 요약 — 표를 열기 전에 규모를 먼저 읽는다 */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-px bg-black/[0.08] border-y border-black/[0.08]">
              {[
                { l: "티어 수", v: tiers.length.toLocaleString() },
                { l: "만렙 필요 XP", v: maxNeed.toLocaleString() },
                { l: "해금가", v: toInt(unlockPrice).toLocaleString() },
                { l: "상태", v: enabled ? "운영 중" : "중단" },
              ].map((s) => (
                <div key={s.l} className="bg-[#f4f3f2] px-4 py-3.5">
                  <div className="text-[10px] font-bold text-[#8a8a8a] mb-1">{s.l}</div>
                  <div className="text-[15px] font-black text-[#131313] tabular-nums">{s.v}</div>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* ═══ 02. 티어 구성 ═══ */}
        <Reveal>
          <section>
            <SectionHead
              no="02"
              title={`티어 구성 (${tiers.length})`}
              right={
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={sortTiers}
                    disabled={tiers.length < 2}
                    className="px-4 py-2 rounded-full text-[11px] font-bold text-[#5a5a5a] border border-black/15 hover:text-[#131313] hover:border-black/35 disabled:opacity-40 transition-colors outline-none focus:outline-none"
                  >
                    정렬
                  </button>
                  <button
                    type="button"
                    onClick={addTier}
                    className="px-4 py-2 rounded-full text-[11px] font-bold bg-[#131313] text-white hover:bg-[#2a2a2a] transition-colors outline-none focus:outline-none"
                  >
                    티어 추가
                  </button>
                </div>
              }
            />

            {badOrder && (
              <div className="mb-4 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] text-[12px] font-bold text-amber-700 break-keep">
                필요 XP가 오름차순이 아닙니다. 이대로 저장하면 서버가 오름차순으로 다시 정렬하고 레벨을 새로 매깁니다.
              </div>
            )}

            {isLoading ? (
              <div className="py-10 text-center text-[#8a8a8a] text-sm">불러오는 중...</div>
            ) : tiers.length === 0 ? (
              <div className="py-10 text-[#5a5a5a] text-sm border-y border-black/[0.06]">
                등록된 티어가 없습니다. &lsquo;티어 추가&rsquo;로 첫 보상을 만들어 주세요.
              </div>
            ) : (
              // 좁은 화면에서 표가 넘칠 수 있어 이 안에서만 가로로 스크롤시킨다 (페이지 자체는 넘치지 않는다)
              <>
                <p className="md:hidden text-[10px] text-[#a3a3a3] mb-2">← 표를 옆으로 밀어 볼 수 있습니다</p>
                <div className="-mx-6 px-6 overflow-x-auto no-bar">
                <div className="min-w-[640px]">
                  <div className="flex items-center gap-3 pb-2.5 border-b border-black/10 text-[10px] font-black tracking-[0.12em] text-[#a3a3a3]">
                    <span className="w-12 shrink-0">티어</span>
                    <span className="w-32 shrink-0 text-right">필요 XP</span>
                    <span className="flex-1 min-w-0 pl-4">무료 보상</span>
                    <span className="flex-1 min-w-0">프리미엄 보상</span>
                    <span className="w-20 shrink-0 text-right">관리</span>
                  </div>

                  <div className="divide-y divide-black/[0.06]">
                    {tiers.map((t, i) => {
                      const gap = i > 0 ? t.need - tiers[i - 1].need : t.need;
                      const broken = i > 0 && t.need <= tiers[i - 1].need;
                      return (
                        // 인덱스가 아니라 tid 기반 키 — 정렬 · 삭제로 순서가 바뀌어도 입력 상태가 옆 행으로 새지 않는다
                        <div key={t.key} className="flex items-center gap-3 py-3.5">
                          <span className="w-12 shrink-0 text-[13px] font-black text-[#131313] tabular-nums">{i + 1}</span>
                          <span className="w-32 shrink-0 text-right">
                            <span className={`block text-[13px] font-black tabular-nums ${broken || t.need <= 0 ? "text-[#e91e3f]" : "text-[#131313]"}`}>
                              {t.need.toLocaleString()}
                            </span>
                            <span className="block text-[10px] text-[#a3a3a3] tabular-nums">+{gap.toLocaleString()}</span>
                          </span>
                          <span className="flex-1 min-w-0 pl-4 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#3f83b8]"></span>
                            <span className={`text-[12px] font-bold truncate ${t.free.kind === "none" ? "text-[#c4c4c4]" : "text-[#3a3a3a]"}`}>
                              {rewardLabel(t.free, roleNameOf)}
                            </span>
                          </span>
                          <span className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#e91e3f]"></span>
                            <span className={`text-[12px] font-bold truncate ${t.paid.kind === "none" ? "text-[#c4c4c4]" : "text-[#3a3a3a]"}`}>
                              {rewardLabel(t.paid, roleNameOf)}
                            </span>
                          </span>
                          <span className="w-20 shrink-0 flex items-center justify-end gap-3">
                            <button
                              onClick={() => openEditor(i)}
                              className="text-[11px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
                            >
                              편집
                            </button>
                            <button
                              onClick={() => setDeleteIdx(i)}
                              className="text-[11px] font-bold text-[#a3a3a3] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none"
                            >
                              삭제
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                </div>
              </>
            )}

            <p className="mt-6 text-xs text-[#8a8a8a] leading-relaxed break-keep">
              💡 진행도는 <strong className="text-[#4b4b4b]">이번 시즌에 번 XP</strong>입니다. XP · 역할 보상은 봇 큐를 거쳐 30초 이내에,
              POINT 보상은 사이트가 즉시 지급합니다. 이미 수령한 티어의 보상을 바꿔도 수령 기록은 남으므로 다시 받을 수 없습니다.
            </p>
          </section>
        </Reveal>

        {/* 스크롤 끝까지 내려가지 않아도 저장할 수 있게 하단에 고정 */}
        <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-[#f4f3f2]/95 backdrop-blur border-t border-black/10 flex items-center justify-between gap-4">
          <span
            className={`text-[11px] font-bold break-keep ${
              loadFailed ? "text-[#e91e3f]" : flash ? "text-[#3f83b8]" : isDirty ? "text-[#e91e3f]" : "text-[#8a8a8a]"
            }`}
          >
            {loadFailed
              ? "설정을 불러오지 못해 저장이 막혀 있습니다 · 위의 [다시 불러오기]를 먼저 눌러 주세요"
              : flash || (isDirty ? "저장되지 않은 변경이 있습니다." : "변경 사항 없음")}
          </span>
          <button
            type="button"
            onClick={trySave}
            // 불러오기 실패 상태에서는 한 번의 클릭으로 운영 설정 전체가 지워지므로 버튼 자체를 잠근다
            disabled={isSaving || loadFailed}
            title={loadFailed ? LOAD_FAILED_MSG : undefined}
            className="px-10 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#e91e3f] text-white text-sm font-bold rounded-lg transition-all shrink-0 outline-none focus:outline-none"
          >
            {isSaving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      {/* ── 티어 편집 모달 ── */}
      {draft && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#ffffff] border border-black/10 rounded-3xl w-full max-w-md max-h-[88svh] overflow-y-auto p-7 md:p-8 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#e6e3de]">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <h2 className="text-lg font-black text-[#131313]">티어 {draft.index + 1} 편집</h2>
              <span className="text-[10px] font-bold text-[#a3a3a3]">저장 버튼을 눌러야 반영됩니다</span>
            </div>
            <p className="text-[11px] text-[#8a8a8a] mb-6 break-keep">
              무료 보상은 누구나, 프리미엄 보상은 해금한 유저만 받습니다.
            </p>

            <div className="mb-5">
              <label className={labelClass}>필요 XP <span className="text-[#e91e3f]">*</span></label>
              <input
                type="number"
                min={1}
                value={draft.need}
                onChange={(e) => setDraft({ ...draft, need: e.target.value })}
                placeholder="예: 5000"
                className={inputClass}
              />
              <p className={fieldNote}>시즌 시작 이후 누적한 XP가 이 값을 넘으면 도달합니다</p>
            </div>

            <RewardEditor
              title="무료 트랙"
              hint="해금 없이 지급"
              tone="#3f83b8"
              value={draft.free}
              roles={grantableRoles}
              onChange={(v) => setDraft({ ...draft, free: v })}
            />
            <div className="h-5"></div>
            <RewardEditor
              title="프리미엄 트랙"
              hint="해금한 유저 전용"
              tone="#e91e3f"
              value={draft.paid}
              roles={grantableRoles}
              onChange={(v) => setDraft({ ...draft, paid: v })}
            />

            <div className="flex gap-3 mt-8">
              <button onClick={() => setDraft(null)} className="flex-1 py-3 bg-[#e6e3de] hover:bg-[#d2d1cf] text-[#131313] font-bold rounded-xl transition-colors outline-none focus:outline-none">
                취소
              </button>
              <button onClick={applyDraft} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-xl transition-colors outline-none focus:outline-none">
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 티어 삭제 확인 ── */}
      {deleteIdx !== null && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#ffffff] border border-[#e91e3f]/25 rounded-3xl w-full max-w-sm p-8 text-center">
            <h2 className="text-xl font-bold text-[#131313] mb-3">티어 삭제</h2>
            <p className="text-sm text-[#5a5a5a] mb-8 break-keep">
              티어 {deleteIdx + 1}을(를) 목록에서 뺍니다. 뒤 티어의 번호는 하나씩 당겨지지만,
              티어마다 고유 번호가 붙어 있어 남은 티어의 수령 기록은 그대로 유지됩니다.<br />
              다만 <strong className="text-[#131313]">이미 이 티어를 받은 유저가 있어도 수령 기록만 남고 티어 자체는 사라집니다.</strong>
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteIdx(null)} className="flex-1 py-3 bg-[#e6e3de] text-[#131313] rounded-xl outline-none focus:outline-none">취소</button>
              <button onClick={removeTier} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-white rounded-xl font-bold outline-none focus:outline-none">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 오름차순이 아닐 때 한 번 더 확인 ── */}
      {confirmSort && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#ffffff] border border-amber-500/30 rounded-3xl w-full max-w-sm p-8">
            <h2 className="text-lg font-bold text-[#131313] mb-3">순서를 확인해 주세요</h2>
            <p className="text-sm text-[#5a5a5a] leading-relaxed mb-8 break-keep">
              필요 XP가 오름차순이 아닙니다. 이대로 저장하면 서버가 오름차순으로 정렬하고 레벨을 다시 매기므로,
              화면에서 보던 순서와 달라집니다. (티어마다 고유 번호가 붙어 있어 유저의 수령 기록은 어긋나지 않습니다.)
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmSort(false)} className="flex-1 py-3 bg-[#e6e3de] text-[#131313] rounded-xl outline-none focus:outline-none">돌아가기</button>
              <button onClick={doSave} disabled={isSaving || loadFailed} className="flex-1 py-3 bg-[#e91e3f] disabled:opacity-40 text-white rounded-xl font-bold outline-none focus:outline-none">
                {isSaving ? "저장 중..." : "이대로 저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {popup.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overlay-in">
          <div className="bg-[#ffffff] border border-black/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)]">
            <h2 className="text-xl font-bold text-[#131313] mb-3">{popup.isError ? "오류" : "완료"}</h2>
            <p className="text-sm text-[#5a5a5a] mb-8 break-keep">{popup.message}</p>
            <button onClick={() => setPopup({ ...popup, isOpen: false })} className="w-full py-3 bg-[#e6e3de] hover:bg-[#d2d1cf] text-[#131313] font-bold rounded-xl transition-colors outline-none focus:outline-none">확인</button>
          </div>
        </div>
      )}
    </main>
  );
}
