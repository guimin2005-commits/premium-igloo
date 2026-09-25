"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import Dropdown from "../../components/Dropdown";
import ItemIcon from "../../components/ItemIcon";
import { SEASON } from "@/lib/season";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import {
  AdminPage,
  Panel,
  PanelGrid,
  FieldRow,
  Inline,
  Switch,
  Segmented,
  Btn,
  SaveBar,
  StatRow,
  DataTable,
  DetailPane,
  EmptyRow,
  inputClass,
  numClass,
  labelClass,
  fieldNote,
  useNotice,
  ConfirmDialog,
  useAdminGuard,
  type Column,
} from "../ui";

// 📌 시즌 패스 구성 화면 — 무료/프리미엄 2트랙의 티어 사다리를 관리한다.
//    2026-09 관리자 개편: 설정 틀과 목록 틀을 한 화면에 쌓는다 (세부 탭 없이).
//      · 위 — 기본 설정 패널(사용 · 해금가)과 요약 숫자 칸을 넓은 화면에서 두 열로
//      · 아래 — 티어 구성 패널 안에 전체 폭 표. 티어가 20개를 넘으면 세로 폼은 훑을 수 없어
//        표는 한 줄 요약만 두고, 줄(또는 편집)을 누르면 상세 칸에서 고친다
//      · 저장 — 불러온 스냅샷과 다를 때만 뜨는 저장 줄(SaveBar). 무엇이 바뀌었는지 한 줄씩 보여 준다
//    입력칸 · 알림 모달 · 확인 모달 · 권한 화면은 전부 ../ui 의 공용 컴포넌트를 쓴다.

type RewardKind = "xp" | "point" | "role" | "item" | "none";
type Reward = { kind: RewardKind; amount: number; roleId: string; roleName: string; itemId: string; itemName: string };
// 📌 tid — 서버가 발급하는 티어 고유 식별자("t7"). 유저 수령 기록이 이 값으로 남으므로
//    편집 · 정렬 · 삭제 어느 경로에서도 잃어버리면 안 된다 (잃으면 서버가 새 tid 를 발급해
//    이미 받은 티어가 미수령으로 되살아난다). 새로 만든 티어만 빈 문자열로 보내 서버가 발급하게 한다.
//    key 는 React 목록 전용 로컬 키 — 아직 tid 가 없는 새 티어도 행을 구분해야 해서 따로 둔다. 서버로 보내지 않는다.
type Tier = { key: string; tid: string; level: number; need: number; free: Reward; paid: Reward };
// 상세 칸에서는 숫자 칸을 비울 수 있어야 해서 문자열로 들고 있다가 확인할 때 숫자로 바꾼다
type DraftReward = { kind: RewardKind; amount: string; roleId: string; roleName: string; itemId: string; itemName: string };
type Draft = { index: number; need: string; free: DraftReward; paid: DraftReward };
// 표 한 줄 — 티어 번호(i)는 목록 순서에서 나온다
type Row = { t: Tier; i: number };

const KIND_OPTIONS: { v: RewardKind; l: string }[] = [
  { v: "none", l: "없음" },
  { v: "xp", l: "XP" },
  { v: "point", l: "빙옥" },
  { v: "role", l: "역할" },
  { v: "item", l: "아이템" },
];

const EMPTY_REWARD: Reward = { kind: "none", amount: 0, roleId: "", roleName: "", itemId: "", itemName: "" };

// 불러오기에 실패한 채로 저장하면 빈 구성이 운영 중인 설정을 통째로 덮어쓴다
const LOAD_FAILED_MSG = "현재 설정을 불러오지 못해 저장할 수 없습니다. [다시 불러오기] 후에 저장해 주세요.";
// 해금가 되돌림 알림 — 저장 줄이 아니라 해금가 칸 아래에 띄운다 (무엇이 되돌아갔는지 그 자리에서 보이게)
const PRICE_REVERT_MSG = "해금가는 비워 둘 수 없어 직전 값으로 되돌렸습니다.";

const toInt = (v: any) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const normReward = (r: any): Reward => ({
  kind: (["xp", "point", "role", "item"] as string[]).includes(r?.kind) ? r.kind : "none",
  amount: toInt(r?.amount),
  roleId: r?.roleId || "",
  roleName: r?.roleName || "",
  itemId: r?.itemId || "",
  itemName: r?.itemName || "",
});

// 목록에 뿌릴 한 줄 요약 — 서버가 만드는 label 과 같은 모양으로 맞춘다
const rewardLabel = (r: Reward, roleNameOf: (id: string) => string, itemOf: (id: string) => any) => {
  if (r.kind === "xp") return `XP ${r.amount.toLocaleString()}`;
  if (r.kind === "point") return `빙옥 ${r.amount.toLocaleString()}`;
  if (r.kind === "role") return `역할 · ${roleNameOf(r.roleId) || r.roleName || "미지정"}`;
  if (r.kind === "item") {
    const it = itemOf(r.itemId);
    return `아이템 · ${it?.name || r.itemName || "미지정"}`;
  }
  return "-";
};

// 저장 여부를 비교할 지문 — 서버로 나가는 값만 담는다 (로컬 전용 key 는 빼야 헛된 "변경됨"이 안 뜬다)
const sig = (enabled: boolean, price: number, list: Tier[]) =>
  JSON.stringify({
    enabled,
    unlockPrice: price,
    tiers: list.map((t) => ({ tid: t.tid, level: t.level, need: t.need, free: t.free, paid: t.paid })),
  });

const onOffLabel = (v: boolean) => (v ? "운영 중" : "중단");

// ── 알림 줄 ───────────────────────────────────
// 📌 공용 상태 칩(StatusChip)과 같은 색 한 벌(bad · warn · neutral)로만 칠한다.
//    페이지 위에서는 둥근 판 하나, 패널 안에서는(inset) 선으로 나눈 한 줄.
function NoteLine({
  tone,
  action,
  inset = false,
  children,
}: {
  tone: "bad" | "warn" | "neutral";
  action?: ReactNode;
  inset?: boolean;
  children: ReactNode;
}) {
  const toneCls =
    tone === "bad" ? "bg-[#e91e3f]/[0.08] text-[#d01634]" : tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-[#f2f2f2] text-[#5a5a5a]";
  return (
    <div
      role={tone === "neutral" ? undefined : "alert"}
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-[13px] font-bold break-keep ${toneCls} ${
        inset ? "px-5 border-b border-[#ededed]" : "px-4 rounded-2xl"
      }`}
    >
      {/* basis 를 둬서 좁은 폭에서는 단추가 다음 줄로 내려간다 (글이 한 글자 폭으로 짜부라지지 않게) */}
      <p className="min-w-0 grow basis-60">{children}</p>
      {action}
    </div>
  );
}

// ── 보상 편집 블록 ────────────────────────────
// 📌 상세 칸 안에서 입력값을 다루므로 반드시 모듈 스코프에 둔다.
//    페이지 함수 안에서 정의하면 렌더마다 새 컴포넌트가 되어 타이핑 도중 포커스가 날아간다.
// 📌 공용 Dropdown 의 밝은 테마는 테두리가 옅고(#ededed) 키가 커서(py-3) — 관리자 입력칸(inputClass)과
//    같은 높이 · 테두리로 맞춘다. Dropdown 파일은 다른 화면도 쓰므로 여기서 덮어쓰기만 한다.
const DROPDOWN_BTN = "!px-3 !py-2 min-h-10 !border-[#a3a3a3] hover:!border-[#131313] focus-visible:!border-[#131313]";

function RewardEditor({
  title,
  hint,
  tone,
  value,
  roles,
  items,
  onChange,
}: {
  title: string;
  hint: string;
  tone: string;
  value: DraftReward;
  roles: any[];
  items: any[];
  onChange: (next: DraftReward) => void;
}) {
  return (
    <div className="mt-5 pt-5 border-t border-[#ededed]">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tone }} />
        <span className="text-[14px] font-black">{title}</span>
        <span className="ml-auto text-[12px] text-[#5a5a5a] break-keep text-right">{hint}</span>
      </div>

      {/* 보상 종류 — 관리자 화면 공통 알약 토글 */}
      <Segmented
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
            aria-label={`${title} 수량`}
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
            buttonClassName={DROPDOWN_BTN}
            onChange={(v) =>
              onChange({ ...value, roleId: v, roleName: roles.find((r: any) => r.id === v)?.name || "" })
            }
            options={roles.map((r: any) => ({ value: r.id, label: r.name, color: r.color }))}
          />
          <p className={fieldNote}>수령하면 봇이 30초 이내에 역할을 붙입니다</p>
        </div>
      )}

      {value.kind === "item" && (
        <div>
          <Dropdown
            theme="light"
            value={value.itemId}
            placeholder={items.length ? "지급할 아이템을 선택하세요" : "등록된 아이템이 없습니다"}
            buttonClassName={DROPDOWN_BTN}
            onChange={(v) => onChange({ ...value, itemId: v, itemName: items.find((it: any) => it._id === v)?.name || "" })}
            options={items.map((it: any) => ({
              value: it._id,
              label: it.name,
              hint: itemTypeLabel(it.type),
              icon: <ItemIcon icon={it.icon} imageUrl={it.imageUrl} type={it.type} size={18} color={it.color || itemTypeColor(it.type)} />,
            }))}
          />
          <p className={fieldNote}>인벤토리에 들어가고, 역할이 연결돼 있으면 봇이 역할도 붙입니다</p>
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
  // 아이템 보상용 — 아이템 등록(/api/admin/items) 목록
  const [regItems, setRegItems] = useState<any[]>([]);
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
  //    잠깐 뜨는 한 줄로만 알린다 (저장 줄 · 해금가 칸 아래).
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
  const itemOf = useCallback((id: string) => regItems.find((it: any) => it._id === id) || null, [regItems]);

  // 📌 스냅샷(sig 문자열)을 되읽은 것 — 저장 줄의 변경 목록 · 설정 줄의 빨간 점 · 되돌리기에만 쓴다.
  //    저장해도 되는지는 여전히 isDirty(문자열 비교)가 정한다.
  const snap = useMemo(() => {
    if (!snapshot) return null;
    try {
      return JSON.parse(snapshot);
    } catch {
      return null;
    }
  }, [snapshot]);

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
      fetch("/api/admin/items", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ])
      .then(([cfg, roles, reg]) => {
        const roleList = roles?.success === true && Array.isArray(roles?.data) ? roles.data : [];
        setGuildRoles(roleList);
        setRegItems(reg?.success === true && Array.isArray(reg?.data) ? reg.data : []);
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
  const missingItem =
    tiers.some((t) => (t.free.kind === "item" && !t.free.itemId) || (t.paid.kind === "item" && !t.paid.itemId));
  // 📌 사다리를 먼저 깔고 보상을 나중에 채우는 흐름이 정상이라 저장을 막지는 않는다 — 세어서 보여만 준다
  const emptyTierCount = tiers.filter((t) => t.free.kind === "none" && t.paid.kind === "none").length;

  // ── 저장 줄에 띄울 변경 목록 ─────────────────
  // 📌 스냅샷과 지금 값을 맞대어 "이름 이전 → 이후" 한 줄씩. 티어는 tid 로 짝을 지어
  //    추가 · 삭제 · 수정 · 순서를 가린다 (보여 주기 전용 — 못 가린 변경은 "변경사항 있음"으로 뜬다)
  const enabledChanged = !!snap && snap.enabled !== enabled;
  const priceChanged = !!snap && snap.unlockPrice !== toInt(unlockPrice);
  const changes: string[] = [];
  if (snap && isDirty) {
    if (enabledChanged) changes.push(`상태 ${onOffLabel(!!snap.enabled)} → ${onOffLabel(enabled)}`);
    if (priceChanged) changes.push(`해금가 ${toInt(snap.unlockPrice).toLocaleString()} → ${toInt(unlockPrice).toLocaleString()}`);
    const before: any[] = Array.isArray(snap.tiers) ? snap.tiers : [];
    const byTid = new Map<string, any>(before.filter((b) => b?.tid).map((b) => [b.tid, b]));
    const nowTids = new Set(tiers.map((t) => t.tid).filter(Boolean));
    const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
    tiers.forEach((t, i) => {
      const b = t.tid ? byTid.get(t.tid) : null;
      if (!b) {
        changes.push(`티어 ${i + 1} 추가`);
        return;
      }
      if (b.need !== t.need) changes.push(`티어 ${i + 1} 필요 XP ${toInt(b.need).toLocaleString()} → ${t.need.toLocaleString()}`);
      if (!same(b.free, t.free))
        changes.push(`티어 ${i + 1} 무료 ${rewardLabel(normReward(b.free), roleNameOf, itemOf)} → ${rewardLabel(t.free, roleNameOf, itemOf)}`);
      if (!same(b.paid, t.paid))
        changes.push(`티어 ${i + 1} 프리미엄 ${rewardLabel(normReward(b.paid), roleNameOf, itemOf)} → ${rewardLabel(t.paid, roleNameOf, itemOf)}`);
    });
    before.forEach((b, i) => {
      if (b?.tid && !nowTids.has(b.tid)) changes.push(`티어 ${toInt(b.level) || i + 1} 삭제`);
    });
    const seqBefore = before.filter((b) => b?.tid && nowTids.has(b.tid)).map((b) => b.tid).join();
    const seqNow = tiers.filter((t) => t.tid && byTid.has(t.tid)).map((t) => t.tid).join();
    if (seqBefore !== seqNow) changes.push("티어 순서 변경");
  }

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
      itemId: r.itemId,
      itemName: r.itemName,
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
      itemId: d.kind === "item" ? d.itemId : "",
      itemName: d.kind === "item" ? itemOf(d.itemId)?.name || d.itemName : "",
    });

    for (const [d, who] of [
      [draft.free, "무료"],
      [draft.paid, "프리미엄"],
    ] as [DraftReward, string][]) {
      if (d.kind === "role" && !d.roleId) return notify(`${who} 보상의 역할을 선택해 주세요.`, true);
      if (d.kind === "item" && !d.itemId) return notify(`${who} 보상의 아이템을 선택해 주세요.`, true);
      if ((d.kind === "xp" || d.kind === "point") && toInt(d.amount) <= 0)
        return notify(`${who} 보상의 수량을 1 이상으로 입력해 주세요.`, true);
    }

    setTiers((prev) =>
      prev.map((t, i) => (i === draft.index ? { ...t, need, free: fromDraft(draft.free), paid: fromDraft(draft.paid) } : t))
    );
    setDraft(null);
  };

  // 📌 PC 상세 칸은 표를 가리지 않아(딤 없음) 편집 중에도 다른 줄을 지우거나 정렬할 수 있다.
  //    초안은 번호(index)로 티어를 가리키므로, 목록이 움직이면 같은 티어를 따라가게 번호를 옮긴다
  //    (옛 모달은 화면 전체를 막아 이런 일이 없었다).
  const pickTier = (i: number) => {
    // 이미 열린 줄을 다시 누르면 고치던 초안을 그대로 둔다
    if (draft?.index !== i) openEditor(i);
  };
  const confirmRemove = () => {
    if (draft && deleteIdx != null) {
      if (draft.index === deleteIdx) setDraft(null);
      else if (draft.index > deleteIdx) setDraft({ ...draft, index: draft.index - 1 });
    }
    removeTier();
  };
  const sortWithDraft = () => {
    if (draft) {
      const k = tiers[draft.index]?.key;
      // sortTiers 와 같은 비교 · 같은(안정) 정렬이라 결과 순서가 같다
      const next = [...tiers].sort((a, b) => a.need - b.need).findIndex((t) => t.key === k);
      if (next >= 0) setDraft({ ...draft, index: next });
    }
    sortTiers();
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
          free: {
            ...t.free,
            roleName: t.free.kind === "role" ? roleNameOf(t.free.roleId) || t.free.roleName : "",
            itemName: t.free.kind === "item" ? itemOf(t.free.itemId)?.name || t.free.itemName : "",
          },
          paid: {
            ...t.paid,
            roleName: t.paid.kind === "role" ? roleNameOf(t.paid.roleId) || t.paid.roleName : "",
            itemName: t.paid.kind === "item" ? itemOf(t.paid.itemId)?.name || t.paid.itemName : "",
          },
        })),
      }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setIsSaving(false);
    setConfirmSort(false);

    if (res?.ok && d?.success) {
      // 📌 응답 본문에는 서버가 새로 발급한 tid 가 들어 있다. 이걸 못 받으면 새 티어가 tid 없는 채로
      //    남아, 다음 저장 때 또 새 tid 를 받아 별개 티어처럼 갈라진다 — 없으면 다시 불러와서라도 맞춘다.
      //    (applyConfig 가 스냅샷도 새 값으로 갈아 끼워 저장 줄이 닫힌다)
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
    if (missingItem) return notify("아이템 보상 중 아이템이 지정되지 않은 티어가 있습니다.", true);
    if (badZero) return notify("필요 XP가 0인 티어가 있습니다. 1 이상으로 고쳐 주세요.", true);
    // 서버도 정렬하지만, 관리자가 의도한 순서인지 먼저 확인받는다
    if (badOrder) return setConfirmSort(true);
    doSave();
  };

  // 📌 되돌리기 — 스냅샷은 applyConfig 가 받는 모양(enabled · unlockPrice · tiers[tid · level · need · free · paid])
  //    그대로라 다시 흘려 넣으면 불러온 직후 상태가 된다 (tid 기반 key 도 같게 복원된다)
  const resetToSnapshot = () => {
    if (!snap) return;
    setDraft(null);
    applyConfig(snap);
  };

  // 로딩 · 권한 없음 화면은 공용 가드가 만든다 (7개 파일에 복사돼 있던 것)
  if (gate) return gate;

  const maxNeed = tiers.length ? Math.max(...tiers.map((t) => t.need)) : 0;

  // 📌 저장 줄 — 불러오기 실패면 바뀐 것과 상관없이 잠근 채 이유를 띄운다(옛 저장 단추 disabled 와 같다).
  //    상세 칸이 열려 있는 동안은 숨긴다: PC 에서는 오른쪽 칸이 저장 단추를 덮고, 옛 모달처럼
  //    편집을 확인 · 취소한 뒤에 저장하게 둔다.
  const barNote = draft
    ? undefined
    : loadFailed
      ? <span className="font-bold text-[#d01634]">설정을 불러오지 못해 저장이 막혀 있습니다</span>
      : flash && flash !== PRICE_REVERT_MSG
        ? flash
        : undefined;

  const rewardCell = (r: Reward, dot: string, track: string) => (
    <span className="inline-flex items-center gap-2">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {/* 모바일 줄 카드에는 머리줄이 없어 트랙 이름을 앞에 붙인다 */}
      <span className="md:hidden">{track}</span>
      <span className={`font-bold break-keep ${r.kind === "none" ? "text-[#a3a3a3]" : "text-[#131313]"}`}>
        {rewardLabel(r, roleNameOf, itemOf)}
      </span>
    </span>
  );

  const rows: Row[] = tiers.map((t, i) => ({ t, i }));
  const columns: Column<Row>[] = [
    {
      key: "no",
      label: "티어",
      className: "w-16",
      mobile: "title",
      render: ({ i }) => (
        <span className="font-black tabular-nums">
          <span className="md:hidden">티어 </span>
          {i + 1}
        </span>
      ),
    },
    {
      key: "need",
      label: "필요 XP",
      align: "right",
      className: "w-36",
      render: ({ t, i }) => {
        const gap = i > 0 ? t.need - tiers[i - 1].need : t.need;
        const broken = i > 0 && t.need <= tiers[i - 1].need;
        return (
          <span className="tabular-nums whitespace-nowrap">
            <span className="md:hidden">필요 XP </span>
            <span className={`md:block font-black ${broken || t.need <= 0 ? "text-[#d01634]" : "text-[#131313]"}`}>
              {t.need.toLocaleString()}
            </span>
            <span className="ml-1.5 md:ml-0 md:block text-[11px] text-[#8a8a8a]">+{gap.toLocaleString()}</span>
          </span>
        );
      },
    },
    { key: "free", label: "무료 보상", className: "!pl-8", render: ({ t }) => rewardCell(t.free, "bg-[#3f83b8]", "무료") },
    { key: "paid", label: "프리미엄 보상", render: ({ t }) => rewardCell(t.paid, "bg-[#e91e3f]", "프리미엄") },
    {
      key: "act",
      label: "관리",
      align: "right",
      className: "w-32",
      // 모바일 줄 카드는 통째로 단추라 안에 단추를 둘 수 없다 — 줄을 눌러 상세 칸에서 편집 · 삭제한다
      mobile: "hide",
      render: ({ i }) => (
        <span className="inline-flex items-center justify-end gap-1">
          <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); pickTier(i); }}>
            편집
          </Btn>
          <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteIdx(i); }}>
            삭제
          </Btn>
        </span>
      ),
    },
  ];

  return (
    <>
      <AdminPage
        section="SYSTEM : LEVEL"
        title="시즌 패스"
        // desc 에는 어느 시즌을 만지는지와, 화면에 안 보이는 초기화 시점만 남긴다
        desc={`시즌 ${SEASON.number} ‘${SEASON.name}’ · 새 시즌이 시작되면 수령 기록과 해금 상태가 초기화됩니다.`}
        footer={
          <SaveBar
            dirty={isDirty && !loadFailed && !draft}
            changes={changes}
            onSave={trySave}
            onReset={resetToSnapshot}
            saving={isSaving}
            note={barNote}
          />
        }
      >
        {(loadFailed || (rolesFailed && !isLoading)) && (
          <div className="mb-5 space-y-3">
            {loadFailed && (
              <NoteLine tone="bad" action={<Btn size="sm" variant="secondary" onClick={fetchAll}>다시 불러오기</Btn>}>
                현재 설정을 불러오지 못했습니다 (/api/admin/pass). 빈 구성이 운영 설정을 덮어쓰지 않도록 저장을 막아 두었습니다.
              </NoteLine>
            )}
            {rolesFailed && !isLoading && (
              <NoteLine
                tone="warn"
                // ⚠️ fetchRoles 다 — fetchAll 로 바꾸면 서버 저장본이 덮어써져 저장 안 한 티어 편집이 사라진다
                action={<Btn size="sm" variant="secondary" onClick={fetchRoles}>다시 불러오기</Btn>}
              >
                역할 목록을 불러오지 못했습니다 (/api/discord-roles). 이미 지정된 역할 보상은 그대로 유지됩니다.
              </NoteLine>
            )}
          </div>
        )}

        {/* 기본 설정 + 요약 — 넓은 화면에서 두 열 */}
        <PanelGrid className="mb-5">
          <Panel title="기본 설정" flush>
            <FieldRow label="시즌 패스 사용" hint="끄면 보상표는 그대로 보이지만 수령 · 해금이 막힙니다" changed={enabledChanged}>
              <Inline>
                <Switch on={enabled} onChange={() => setEnabled(!enabled)} label="시즌 패스 사용" />
                <span className={`font-bold ${enabled ? "text-[#131313]" : "text-[#5a5a5a]"}`}>
                  {enabled ? "운영 중" : "중단 (수령 불가)"}
                </span>
              </Inline>
            </FieldRow>
            <FieldRow
              label="프리미엄 트랙 해금가"
              hint={
                flash === PRICE_REVERT_MSG ? (
                  <span className="font-bold text-[#d01634]">{flash}</span>
                ) : (
                  "XP · 빙옥 어느 쪽으로도 결제하며 1:1 등가입니다 (1 이상)"
                )
              }
              changed={priceChanged}
            >
              <input
                type="number"
                min={1}
                value={unlockPrice}
                onChange={(e) => setUnlockPrice(e.target.value)}
                // 📌 비운 채 저장하면 0 이 되어 프리미엄이 전원 무료로 열린다 — 칸을 벗어날 때 직전 값으로 되돌린다
                onBlur={() => {
                  if (toInt(unlockPrice) <= 0) {
                    setUnlockPrice(lastPriceRef.current);
                    setFlash(PRICE_REVERT_MSG);
                  } else {
                    lastPriceRef.current = String(toInt(unlockPrice));
                  }
                }}
                placeholder="예: 50000"
                aria-label="프리미엄 트랙 해금가"
                className={numClass}
              />
            </FieldRow>
          </Panel>

          {/* 구성 요약 — 표를 보기 전에 규모를 먼저 읽는다. 옆 칸(xl 반 폭)에서는 네 칸이 좁아 2×2 로 */}
          <StatRow
            className="xl:grid-cols-2"
            items={[
              { label: "티어 수", value: tiers.length.toLocaleString() },
              { label: "만렙 필요 XP", value: maxNeed.toLocaleString() },
              { label: "해금가", value: toInt(unlockPrice).toLocaleString() },
              { label: "상태", value: onOffLabel(enabled) },
            ]}
          />
        </PanelGrid>

        {/* 티어 구성 — 패널 머리에 정렬 · 추가, 본문은 전체 폭 표 */}
        <Panel
          flush
          title={
            <>
              티어 구성 <span className="ml-1 text-[#8a8a8a] tabular-nums">{tiers.length}</span>
            </>
          }
          right={
            <>
              <Btn variant="ghost" size="sm" onClick={sortWithDraft} disabled={tiers.length < 2}>
                정렬
              </Btn>
              <Btn variant="secondary" size="sm" onClick={addTier}>
                티어 추가
              </Btn>
            </>
          }
        >
          {badOrder && (
            <NoteLine tone="warn" inset>
              필요 XP가 오름차순이 아닙니다. 이대로 저장하면 서버가 다시 정렬하고 레벨을 새로 매깁니다.
            </NoteLine>
          )}

          {/* 보상이 빈 티어는 막지 않는다 — 저장 전에 개수만 알린다 */}
          {!isLoading && emptyTierCount > 0 && (
            <NoteLine tone="neutral" inset>
              무료 · 프리미엄 보상이 모두 비어 있는 티어 {emptyTierCount}개 — 이대로도 저장됩니다.
            </NoteLine>
          )}

          {isLoading ? (
            <div className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
          ) : tiers.length === 0 ? (
            <div className="p-5">
              <EmptyRow>등록된 티어가 없습니다.</EmptyRow>
            </div>
          ) : (
            // 패널이 테두리를 이미 두르고 있어 표 자체의 테두리 · 모서리는 뺀다 (선이 두 겹이 되지 않게)
            <DataTable
              className="!rounded-none !border-0"
              columns={columns}
              rows={rows}
              rowKey={(r) => r.t.key}
              onRowClick={(r) => pickTier(r.i)}
              selectedKey={draft ? tiers[draft.index]?.key ?? null : null}
            />
          )}

          <p className="px-5 py-3.5 border-t border-[#ededed] text-[12px] text-[#5a5a5a] leading-relaxed break-keep">
            XP · 역할 · 역할 있는 아이템은 봇 큐를 거쳐 30초 이내에, 빙옥 · 역할 없는 아이템은 즉시 지급됩니다.
            이미 수령한 티어는 보상을 바꿔도 다시 받을 수 없습니다.
          </p>
        </Panel>
      </AdminPage>

      {/* ── 티어 편집 — PC 오른쪽 칸 / 모바일 아래 판. 확인은 목록에만 반영하고, 서버 저장은 저장 줄에서 ── */}
      <DetailPane
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft ? `티어 ${draft.index + 1} 편집` : ""}
        sub="저장 버튼을 눌러야 반영됩니다"
        footer={
          draft && (
            <>
              {/* 모바일은 표에 삭제 단추가 없어(줄 카드) 여기서 지운다 */}
              <Btn variant="ghost" className="mr-auto" onClick={() => setDeleteIdx(draft.index)}>
                삭제
              </Btn>
              <Btn variant="ghost" onClick={() => setDraft(null)}>
                취소
              </Btn>
              <Btn onClick={applyDraft}>확인</Btn>
            </>
          )
        }
      >
        {draft && (
          <>
            {/* 트랙 설명은 아래 각 보상 블록의 한 줄 힌트가 대신한다 */}
            <div>
              <label htmlFor="pass-tier-need" className={labelClass}>
                필요 XP <span className="text-[#e91e3f]">*</span>
              </label>
              <input
                id="pass-tier-need"
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
              items={regItems}
              onChange={(v) => setDraft({ ...draft, free: v })}
            />
            <RewardEditor
              title="프리미엄 트랙"
              hint="해금한 유저 전용"
              tone="#e91e3f"
              value={draft.paid}
              roles={grantableRoles}
              items={regItems}
              onChange={(v) => setDraft({ ...draft, paid: v })}
            />
          </>
        )}
      </DetailPane>

      {/* ── 티어 삭제 확인 ── */}
      <ConfirmDialog
        open={deleteIdx !== null}
        danger
        title="티어 삭제"
        confirmLabel="삭제"
        onCancel={() => setDeleteIdx(null)}
        onConfirm={confirmRemove}
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
    </>
  );
}
