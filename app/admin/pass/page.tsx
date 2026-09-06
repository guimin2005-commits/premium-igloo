"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Reveal, LuxStyles } from "../../components/Lux";
import Dropdown from "../../components/Dropdown";
import { SEASON } from "@/lib/season";
import {
  inputClass,
  fieldNote,
  SectionHead,
  FilterChips,
  EmptyRow,
  ListFrame,
  Btn,
  Toggle,
  useNotice,
  ConfirmDialog,
  useAdminGuard,
  AdminHero,
  TableScroll,
} from "../ui";

// 📌 시즌 패스 구성 화면 — 무료/프리미엄 2트랙의 티어 사다리를 관리한다.
//    티어가 20개를 넘어가면 세로로 늘어선 폼은 훑기가 불가능해지므로,
//    목록은 한 줄 요약만 보여주고 실제 편집은 모달에서 한다.
//
//    입력칸 · 섹션 머리 · 알림 모달 · 확인 모달 · 권한 화면은 예전에 이 파일이
//    직접 들고 있었지만, 같은 것이 관리자 화면마다 복사돼 조금씩 갈라졌다 —
//    지금은 전부 ../ui 의 공용 컴포넌트를 쓴다.

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

const labelClass = "block text-xs font-bold text-[#5a5a5a] mb-2";

const EMPTY_REWARD: Reward = { kind: "none", amount: 0, roleId: "", roleName: "" };

// 불러오기에 실패한 채로 저장하면 빈 구성이 운영 중인 설정을 통째로 덮어쓴다
const LOAD_FAILED_MSG = "현재 설정을 불러오지 못해 저장할 수 없습니다. [다시 불러오기] 후에 저장해 주세요.";

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

      {/* 보상 종류 — 화면마다 다르게 생기던 칩을 공용 것으로 통일 */}
      <FilterChips
        options={KIND_OPTIONS}
        value={value.kind}
        onChange={(v) => onChange({ ...value, kind: v as RewardKind })}
        className="mb-3"
      />

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
            {value.kind === "xp" ? "봇 큐를 거쳐 30초 이내 지급 (레벨 재계산 포함)" : "즉시 지급"}
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
          <p className={fieldNote}>수령하면 봇이 30초 이내에 역할을 붙입니다</p>
        </div>
      )}
    </div>
  );
}

export default function AdminPassPage() {
  // 화면 가리기 전용 — 실제 방어는 /api/admin/pass 가 서버에서 한 번 더 한다
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();

  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
  // 📌 사다리를 먼저 깔고 보상을 나중에 채우는 흐름이 정상이라 저장을 막지는 않는다 — 세어서 보여만 준다
  const emptyTierCount = tiers.filter((t) => t.free.kind === "none" && t.paid.kind === "none").length;

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
    setFlash("티어를 추가했습니다.");
  };

  const removeTier = () => {
    if (deleteIdx == null) return;
    setTiers((prev) => prev.filter((_, i) => i !== deleteIdx).map((t, i) => ({ ...t, level: i + 1 })));
    setDeleteIdx(null);
    setFlash("목록에서 뺐습니다. 저장해야 반영됩니다.");
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
      notify("저장되었습니다.");
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

  // 로딩 · 권한 없음 화면은 공용 가드가 만든다 (7개 파일에 복사돼 있던 것)
  if (gate) return gate;

  const maxNeed = tiers.length ? Math.max(...tiers.map((t) => t.need)) : 0;

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      {/* desc 에는 어느 시즌을 만지는지와, 화면에 안 보이는 초기화 시점만 남긴다 */}
      <AdminHero
        title="시즌 패스"
        desc={`시즌 ${SEASON.number} ‘${SEASON.name}’ · 새 시즌이 시작되면 수령 기록과 해금 상태가 초기화됩니다.`}
      />

      <div className="w-full max-w-6xl mx-auto px-6 pb-16 flex-1 flex flex-col space-y-14">
        {loadFailed && (
          <div className="px-4 py-3 rounded-lg border border-[#e91e3f]/30 bg-[#e91e3f]/[0.06] text-[12px] font-bold text-[#c2183a] break-keep">
            현재 설정을 불러오지 못했습니다 (/api/admin/pass 응답 없음).
            아래 빈 구성이 운영 설정을 덮어쓰지 않도록 <strong>저장을 막아 두었습니다.</strong>
            <button onClick={fetchAll} className="ml-2 underline underline-offset-2 outline-none focus:outline-none">다시 불러오기</button>
          </div>
        )}

        {rolesFailed && !isLoading && (
          <div className="px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] text-[12px] font-bold text-amber-700 break-keep">
            역할 목록을 불러오지 못했습니다 (/api/discord-roles). 이미 지정된 역할 보상은 그대로 유지됩니다.
            {/* ⚠️ fetchRoles 다 — fetchAll 로 바꾸면 서버 저장본이 덮어써져 저장 안 한 티어 편집이 사라진다 */}
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
                {/* grid 한 칸이라 폭 제한(md:max-w-md)을 끈다 — 옆 입력칸과 길이를 맞춘다 */}
                <Toggle
                  on={enabled}
                  onClick={() => setEnabled(!enabled)}
                  onLabel="운영 중"
                  offLabel="중단 (수령 불가)"
                  className=""
                />
                <p className={fieldNote}>끄면 보상표는 그대로 보이지만 수령 · 해금이 막힙니다</p>
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
                <p className={fieldNote}>XP · POINT 어느 쪽으로도 결제하며 1:1 등가입니다 (1 이상)</p>
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
                  <Btn variant="ghost" onClick={sortTiers} disabled={tiers.length < 2}>
                    정렬
                  </Btn>
                  <Btn onClick={addTier}>티어 추가</Btn>
                </div>
              }
            />

            {badOrder && (
              <div className="mb-4 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] text-[12px] font-bold text-amber-700 break-keep">
                필요 XP가 오름차순이 아닙니다. 이대로 저장하면 서버가 다시 정렬하고 레벨을 새로 매깁니다.
              </div>
            )}

            {/* 보상이 빈 티어는 막지 않는다 — 저장 전에 개수만 알린다 */}
            {!isLoading && emptyTierCount > 0 && (
              <div className="mb-4 px-4 py-3 rounded-lg border border-black/10 bg-black/[0.03] text-[12px] font-bold text-[#5a5a5a] break-keep">
                무료 · 프리미엄 보상이 모두 비어 있는 티어 {emptyTierCount}개 — 이대로도 저장됩니다.
              </div>
            )}

            {isLoading ? (
              <div className="py-10 text-center text-[#8a8a8a] text-sm">불러오는 중...</div>
            ) : tiers.length === 0 ? (
              <EmptyRow>등록된 티어가 없습니다.</EmptyRow>
            ) : (
              // 좁은 화면에서 표가 넘칠 수 있어 이 안에서만 가로로 스크롤시킨다 (페이지 자체는 넘치지 않는다)
              <>
                <TableScroll>
                  <div className="min-w-[640px]">
                    <div className="flex items-center gap-3 pb-2.5 text-[10px] font-black tracking-[0.12em] text-[#a3a3a3]">
                      <span className="w-12 shrink-0">티어</span>
                      <span className="w-32 shrink-0 text-right">필요 XP</span>
                      <span className="flex-1 min-w-0 pl-4">무료 보상</span>
                      <span className="flex-1 min-w-0">프리미엄 보상</span>
                      <span className="w-20 shrink-0 text-right">관리</span>
                    </div>

                    <ListFrame>
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
                    </ListFrame>
                  </div>
                </TableScroll>
              </>
            )}

            <p className="mt-6 text-xs text-[#8a8a8a] leading-relaxed break-keep">
              XP · 역할 보상은 봇 큐를 거쳐 30초 이내에, POINT 는 즉시 지급됩니다.
              이미 수령한 티어는 보상을 바꿔도 다시 받을 수 없습니다.
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
              ? "설정을 불러오지 못해 저장이 막혀 있습니다"
              : flash || (isDirty ? "저장되지 않은 변경이 있습니다." : "변경 사항 없음")}
          </span>
          <Btn
            onClick={trySave}
            // 불러오기 실패 상태에서는 한 번의 클릭으로 운영 설정 전체가 지워지므로 버튼 자체를 잠근다
            disabled={isSaving || loadFailed}
            title={loadFailed ? LOAD_FAILED_MSG : undefined}
            className="px-10 py-3.5 text-sm shrink-0"
          >
            {isSaving ? "저장 중..." : "저장"}
          </Btn>
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
            {/* 트랙 설명은 아래 각 보상 블록의 한 줄 힌트가 대신한다 */}
            <div className="mt-6 mb-5">
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
              <Btn variant="ghost" onClick={() => setDraft(null)} className="flex-1 py-3">
                취소
              </Btn>
              <Btn onClick={applyDraft} className="flex-1 py-3">
                확인
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── 티어 삭제 확인 ── */}
      <ConfirmDialog
        open={deleteIdx !== null}
        danger
        title="티어 삭제"
        confirmLabel="삭제"
        onCancel={() => setDeleteIdx(null)}
        onConfirm={removeTier}
        body={
          <>
            티어 {(deleteIdx ?? 0) + 1}을(를) 목록에서 뺍니다. 남은 티어의 수령 기록은 유지되지만,
            <strong className="text-[#131313]"> 이미 이 티어를 받은 유저가 있어도 티어 자체는 사라집니다.</strong>
          </>
        }
      />

      {/* ── 오름차순이 아닐 때 한 번 더 확인 ── */}
      {/* 📌 loadFailed 면 이 모달까지 오지 못한다 (trySave 가 먼저 막는다). 혹시 뚫려도
          doSave 가 다시 막고 이유를 알림으로 띄우므로 버튼을 죽여 두는 대신 그쪽에 맡긴다. */}
      <ConfirmDialog
        open={confirmSort}
        title="순서를 확인해 주세요"
        confirmLabel="이대로 저장"
        cancelLabel="돌아가기"
        busy={isSaving}
        onCancel={() => setConfirmSort(false)}
        onConfirm={doSave}
        body="이대로 저장하면 서버가 오름차순으로 정렬하고 레벨을 다시 매겨, 화면에서 보던 순서와 달라집니다."
      />

      {noticeEl}
    </main>
  );
}
