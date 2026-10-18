"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DiscordIdInput, parseIds, useDiscordProfiles } from "../../components/DiscordIds";
import {
  useAdminGuard,
  AdminPage,
  AdminTabs,
  Toolbar,
  Segmented,
  SearchInput,
  ChoiceChip,
  Btn,
  DataTable,
  DetailPane,
  StatusChip,
  ConfirmDialog,
  useToast,
  inputClass,
  labelClass,
  type Column,
} from "../ui";
import { HONOR_CATEGORIES } from "@/lib/honors";
import { statusOf } from "@/lib/tournamentPhase";

/* 📌 명예의 전당 관리 — 등재·수정·삭제를 이 한 곳에서 처리한다.
   (예전에는 공개 페이지 위에서 수정·삭제를 했는데, 관리 동선이 두 군데로 갈라져 있었다)
   📌 2026-09 개편 — 목록 화면 틀: 머리 → 한 줄 도구(검색 · 등재) → 전체 폭 표 → 줄을 누르면 상세 칸.
      가운데 모달 두 개(등재·수정 / 우승 정보)를 상세 칸 하나로 합쳐, 목록을 보면서 다른 줄로 바로 옮겨 가게 했다.
   📌 2026-10-17 정리
      · 수동 기록 / 대회 우승은 머리 탭(?tab=tournament) — 링크 · 뒤로가기 · 기능 검색 바로가기가 산다
      · 요약 숫자 4칸은 아래 탭 · 표와 겹쳐(「대회 우승」은 기준도 달랐다) 「우승자 미기재」 하나만 — 도구 줄 칩. 누르면 대회 우승 탭에서 미기재만(&missing=1)
      · 목록 아래 안내 두 줄은 뺐다(설명 문장 금지)
      · 결과 알림 · 효과음은 공용 토스트(useToast)
      · ?new=1 — 새 기록 등재 칸을 연다(연 뒤 주소에서 지운다) */

type Honor = { _id: string; category: string; title: string; winner: string; winnerId: string; detail: string; dateLabel: string; createdAt?: string };
type TournamentRow = { _id: string; title: string; game: string; winner: string; winnerId: string; dateLabel: string; prize: string; status: string };

const EMPTY: Omit<Honor, "_id"> = { category: "SYSTEM : LEVEL", title: "", winner: "", winnerId: "", detail: "", dateLabel: "" };

const TABS = [
  { id: "manual", short: "수동 기록" },
  { id: "tournament", short: "대회 우승" },
];
const BASE = "/admin/honors";
const hrefTab = (id: string) => (id === "tournament" ? `${BASE}?tab=tournament` : BASE);

// 📌 링크를 Btn(secondary) 과 같은 알약으로 — 공개 페이지 · 대회 글처럼 다른 화면으로 가는 것
const linkBtn = (size: "sm" | "md") =>
  `inline-flex items-center justify-center gap-1.5 rounded-full font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40 bg-white text-[#131313] border border-[#a3a3a3] hover:border-[#131313] ${size === "sm" ? "h-8 px-3.5 text-[12px]" : "h-10 px-5 text-[13px]"}`;

// 📌 상세 칸 아래 줄의 저장 단추는 <form> 밖에 있다. DetailPane 이 PC 칸 · 모바일 판을 둘 다 그려 form id 를 겹쳐 쓸 수 없으니,
//    누른 단추가 속한 칸 안의 form 을 찾아 제출한다(requestSubmit — required 검사 · onSubmit 은 예전 그대로).
const submitNearest = (e: React.MouseEvent<HTMLButtonElement>) => {
  const f = e.currentTarget.closest('[role="dialog"]')?.querySelector("form");
  if (!f) return;
  if (typeof f.requestSubmit === "function") f.requestSubmit();
  else f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
};

// 필수 · 선택 표시 (라벨 옆 기호)
const Req = () => <span className="text-[#e91e3f]"> *</span>;
const Opt = () => <span className="text-[#5a5a5a] font-medium"> (선택)</span>;

export default function AdminHonorsPage() {
  // 화면 가리기 전용 — 실제 방어는 /api/honors 가 서버에서 한 번 더 한다
  const { gate } = useAdminGuard();

  const [honors, setHonors] = useState<Honor[]>([]);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");

  // 📌 탭 · 미기재 거르기는 주소가 원본(?tab=tournament · &missing=1)
  const router = useRouter();
  const sp = useSearchParams();
  const tab: "manual" | "tournament" = sp.get("tab") === "tournament" ? "tournament" : "manual";
  const missingOnly = tab === "tournament" && sp.get("missing") === "1";
  const wantNew = sp.get("new") === "1";

  const [form, setForm] = useState<{ mode: "create" | "edit"; data: any } | null>(null);
  const [winnerEdit, setWinnerEdit] = useState<TournamentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Honor | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { profiles, load } = useDiscordProfiles();

  // 📌 결과 알림 — 공용 토스트(성공 · 실패 효과음 포함). 예전엔 이 화면이 소리 · 토스트를 따로 만들었다
  const { toast: notify, toastEl } = useToast();

  // 📌 탭을 바꾸면 열린 칸을 닫는다 · ?new=1 이 오면 새 기록 칸을 연다 — 렌더 중 조정(앞 탭의 칸이 한 번 그려지지 않게).
  //    권한 확인 화면보다 앞에 둔다 — 주소의 new 를 지우는 일(아래 효과)이 먼저 끝나도 칸 열기를 놓치지 않게
  const [seenTab, setSeenTab] = useState(tab);
  const [seenNew, setSeenNew] = useState(false);
  if (seenTab !== tab) {
    setSeenTab(tab);
    setForm(null);
    setWinnerEdit(null);
  }
  if (seenNew !== wantNew) {
    setSeenNew(wantNew);
    if (wantNew) {
      setWinnerEdit(null);
      setForm({ mode: "create", data: { ...EMPTY } });
    }
  }
  // 열었으면 주소에서 new 를 지운다 — 새로고침에 또 열리지 않고, 같은 바로가기를 다시 누르면 또 열린다
  useEffect(() => {
    if (wantNew) router.replace(BASE, { scroll: false });
  }, [wantNew, router]);

  // ── 불러오기 ──
  const fetchAll = useCallback(() => {
    Promise.all([
      fetch("/api/honors", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/posts?category=대회&all=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([hn, tn]) => {
        const h: Honor[] = (Array.isArray(hn?.data) ? hn.data : []).map((x: any) => ({
          _id: x._id, category: x.category || "기타", title: x.title || "", winner: x.winner || "",
          winnerId: x.winnerId || "", detail: x.detail || "", dateLabel: x.dateLabel || "", createdAt: x.createdAt,
        }));
        const t: TournamentRow[] = (Array.isArray(tn?.data) ? tn.data : [])
          .filter((p: any) => statusOf(p) === "종료됨")
          .map((p: any) => ({
            _id: p._id, title: p.title || "", game: p.tournamentGame || "", winner: p.tournamentWinner || "",
            winnerId: p.tournamentWinnerId || "", dateLabel: p.tournamentDate || "", prize: p.tournamentPrize || "", status: statusOf(p),
          }));
        setHonors(h);
        setTournaments(t);
        load(Array.from(new Set([...h, ...t].flatMap((r) => parseIds(r.winnerId)))));
      })
      .finally(() => setIsLoading(false));
  }, [load]);

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 저장 ──
  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || isSaving) return;
    if (!form.data.title?.trim() || !form.data.winner?.trim()) { notify("기록 제목과 우승자는 필수입니다.", true); return; }
    setIsSaving(true);
    try {
      const creating = form.mode === "create";
      // _id·createdAt까지 함께 보내면 몽고가 불변 필드 수정으로 보고 막는다 — 입력 필드만 추린다
      const fields = {
        category: form.data.category, title: form.data.title.trim(), winner: form.data.winner.trim(),
        winnerId: form.data.winnerId || "", detail: form.data.detail || "", dateLabel: form.data.dateLabel || "",
      };
      const res = await fetch("/api/honors", {
        method: creating ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creating ? fields : { id: form.data._id, ...fields }),
      });
      if (res.ok) {
        const savedId = form.data._id;
        setForm((f) => (f && (creating ? f.mode === "create" : f.data?._id === savedId) ? null : f));
        fetchAll();
        notify(creating ? "명예의 전당에 등재되었습니다." : "기록이 수정되었습니다.");
      } else {
        notify(creating ? "등재에 실패했습니다." : "수정에 실패했습니다.", true);
      }
    } catch {
      notify("서버 통신 오류가 발생했습니다.", true);
    } finally {
      setIsSaving(false);
    }
  };

  const submitWinner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!winnerEdit || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/posts/${winnerEdit._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentWinner: winnerEdit.winner, tournamentWinnerId: winnerEdit.winnerId }),
      });
      if (res.ok) {
        setTournaments((prev) => prev.map((t) => (t._id === winnerEdit._id ? winnerEdit : t)));
        load(parseIds(winnerEdit.winnerId));
        const savedId = winnerEdit._id;
        setWinnerEdit((w) => (w && w._id === savedId ? null : w));
        notify("대회 우승 정보가 수정되었습니다.");
      } else {
        notify("수정에 실패했습니다.", true);
      }
    } catch {
      notify("서버 통신 오류가 발생했습니다.", true);
    } finally {
      setIsSaving(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/honors?id=${deleteTarget._id}`, { method: "DELETE" });
      if (res.ok) {
        setHonors((prev) => prev.filter((h) => h._id !== deleteTarget._id));
        // 삭제는 상세 칸 안에서 누르므로, 지운 기록의 편집 칸도 함께 닫는다
        setForm((f) => (f?.data?._id === deleteTarget._id ? null : f));
        notify("기록이 삭제되었습니다.");
      } else {
        notify("삭제에 실패했습니다.", true);
      }
    } catch {
      notify("서버 통신 오류가 발생했습니다.", true);
    } finally {
      setDeleteTarget(null);
    }
  };

  // ── 검색 ──
  const match = (s: string) => s.toLowerCase().includes(query.trim().toLowerCase());
  const manualRows = useMemo(
    () => (!query.trim() ? honors : honors.filter((h) => match(h.title) || match(h.winner) || match(h.category) || match(h.detail))),
    [honors, query]
  );
  const tournamentRows = useMemo(
    () => (!query.trim() ? tournaments : tournaments.filter((t) => match(t.title) || match(t.winner) || match(t.game))),
    [tournaments, query]
  );
  const missingWinner = tournaments.filter((t) => !t.winner.trim()).length;
  const tournamentShown = missingOnly ? tournamentRows.filter((t) => !t.winner.trim()) : tournamentRows;
  // 「우승자 미기재」 칩 — 수동 기록 탭에서 누르면 대회 우승 탭의 미기재만으로, 대회 우승 탭에서는 켜고 끈다
  const toggleMissing = () => {
    if (tab !== "tournament") router.push(`${BASE}?tab=tournament&missing=1`, { scroll: false });
    else router.replace(missingOnly ? `${BASE}?tab=tournament` : `${BASE}?tab=tournament&missing=1`, { scroll: false });
  };

  // 로딩 · 권한 없음 화면은 공용 가드가 만든다 (관리자 화면마다 복사돼 있던 것)
  if (gate) return gate;

  const Members = ({ ids }: { ids: string }) => {
    const list = parseIds(ids).map((id) => profiles[id]).filter((p) => p && !p.failed);
    if (list.length === 0) return null;
    return (
      <span className="inline-flex -space-x-2 align-middle shrink-0">
        {list.slice(0, 5).map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={p.avatarUrl} alt={p.globalName} title={p.globalName} className="w-6 h-6 rounded-full bg-[#f2f2f2] object-cover ring-2 ring-white" />
        ))}
        {list.length > 5 && <span className="w-6 h-6 rounded-full bg-[#f2f2f2] ring-2 ring-white grid place-items-center text-[9px] font-bold text-[#5a5a5a]">+{list.length - 5}</span>}
      </span>
    );
  };

  // 등재 · 수정 칸과 우승 정보 칸은 같은 자리를 쓴다 — 하나를 열면 다른 하나는 닫는다
  const openForm = (next: { mode: "create" | "edit"; data: any }) => { setWinnerEdit(null); setForm(next); };
  const openWinner = (t: TournamentRow) => { setForm(null); setWinnerEdit({ ...t }); };

  // ── 표 열 ──
  const manualCols: Column<Honor>[] = [
    { key: "category", label: "분류", className: "w-40", render: (h) => <StatusChip>{h.category}</StatusChip> },
    {
      key: "winner", label: "우승자", mobile: "title",
      render: (h) => (
        <span className="flex items-center gap-2 min-w-0">
          <Members ids={h.winnerId} />
          <span className="font-bold text-[#131313] truncate">{h.winner}</span>
        </span>
      ),
    },
    { key: "title", label: "기록 제목", render: (h) => <span className="text-[#131313]">{h.title}</span> },
    { key: "detail", label: "부가 설명", render: (h) => (h.detail ? <span className="text-[#5a5a5a] break-keep">{h.detail}</span> : null) },
    { key: "date", label: "표시 기간", className: "whitespace-nowrap", render: (h) => (h.dateLabel ? <span className="text-[#8a8a8a] tabular-nums">{h.dateLabel}</span> : null) },
  ];
  const tournamentCols: Column<TournamentRow>[] = [
    { key: "game", label: "게임", className: "w-40", render: (t) => <StatusChip className="max-w-[10rem]"><span className="truncate">{t.game || "대회"}</span></StatusChip> },
    {
      key: "winner", label: "우승팀 / 우승자", mobile: "title",
      render: (t) => (
        <span className="flex items-center gap-2 min-w-0">
          <Members ids={t.winnerId} />
          {t.winner.trim() ? <span className="font-bold text-[#131313] truncate">{t.winner}</span> : <StatusChip tone="bad">우승자 미기재</StatusChip>}
        </span>
      ),
    },
    { key: "title", label: "대회", render: (t) => <span className="text-[#131313]">{t.title}</span> },
    { key: "date", label: "날짜", className: "whitespace-nowrap", render: (t) => (t.dateLabel ? <span className="text-[#8a8a8a] tabular-nums">{t.dateLabel}</span> : null) },
  ];

  return (
    <AdminPage
      section="콘텐츠"
      title="명예의 전당"
      actions={<Link href="/hall-of-fame" className={linkBtn("sm")}>공개 페이지 보기 ↗</Link>}
      tabs={<AdminTabs tabs={TABS} current={tab} hrefOf={hrefTab} />}
    >
      {/* ── 검색 · 우승자 미기재 · 등재 — 두 탭이 같은 줄(칩은 늘 같은 자리) ── */}
      <Toolbar
        right={tab === "manual" && <Btn onClick={() => openForm({ mode: "create", data: { ...EMPTY } })}>+ 새 기록 등재</Btn>}
      >
        <SearchInput value={query} onChange={setQuery} placeholder="제목·우승자 검색" />
        <ChoiceChip on={missingOnly} onClick={toggleMissing}>
          우승자 미기재
          {/* 남은 게 있으면 빨간 숫자 — 처리할 일 표시(켜면 흰 글자) */}
          <span className={`text-[12px] tabular-nums ${missingOnly ? "text-white/70" : missingWinner > 0 ? "font-black text-[#d01634]" : "text-[#a3a3a3]"}`}>
            {isLoading ? "–" : missingWinner}
          </span>
        </ChoiceChip>
      </Toolbar>

      {/* ── 목록 ── */}
      {isLoading ? (
        <div className="py-16 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
      ) : tab === "manual" ? (
        <DataTable
          columns={manualCols}
          rows={manualRows}
          rowKey={(h) => h._id}
          onRowClick={(h) => { if (isSaving || form?.data?._id === h._id) return; openForm({ mode: "edit", data: { ...h } }); }}
          selectedKey={form?.mode === "edit" ? form.data._id : null}
          empty={query.trim() ? "검색 결과가 없습니다." : "등재된 수동 기록이 없습니다."}
        />
      ) : (
        <DataTable
          columns={tournamentCols}
          rows={tournamentShown}
          rowKey={(t) => t._id}
          onRowClick={(t) => { if (isSaving || winnerEdit?._id === t._id) return; openWinner(t); }}
          selectedKey={winnerEdit?._id ?? null}
          empty={query.trim() ? "검색 결과가 없습니다." : missingOnly ? "우승자 미기재 대회가 없습니다." : "종료된 대회가 없습니다."}
        />
      )}

      {/* 📌 등재 / 수정 — 상세 칸 */}
      <DetailPane
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.mode === "create" ? "새 기록 등재" : "기록 수정"}
        sub={form?.mode === "edit" ? form.data.title : undefined}
        footer={
          form && (
            <>
              {form.mode === "edit" && (
                <Btn variant="ghost" className="!text-[#d01634]" onClick={() => setDeleteTarget(form.data as Honor)} disabled={isSaving}>삭제</Btn>
              )}
              <div className="ml-auto flex items-center gap-2">
                <Btn variant="secondary" onClick={() => setForm(null)}>취소</Btn>
                <Btn onClick={submitNearest} disabled={isSaving}>{isSaving ? "저장 중…" : form.mode === "create" ? "등재" : "저장"}</Btn>
              </div>
            </>
          )
        }
      >
        {form && (
          <form onSubmit={submitForm} className="space-y-4">
            <div>
              <p className={labelClass}>분류<Req /></p>
              <Segmented
                options={HONOR_CATEGORIES.map((c) => ({ v: c, l: c }))}
                value={form.data.category}
                onChange={(c) => setForm({ ...form, data: { ...form.data, category: c } })}
              />
            </div>

            {[
              { label: "기록 제목", key: "title", required: true, placeholder: "예: LEVEL SEASON 1" },
              { label: "우승자 / 팀명", key: "winner", required: true, placeholder: "예: 팀 이글루 · elahw.06" },
              { label: "표시 기간", key: "dateLabel", required: false, placeholder: "예: 2026.01 ~ 2026.06" },
              { label: "부가 설명", key: "detail", required: false, placeholder: "예: 최종 레벨 512 달성 · 보상 문화상품권 5만원" },
            ].map((f) => (
              <label key={f.key} className="block">
                <span className={labelClass}>{f.label}{f.required ? <Req /> : <Opt />}</span>
                <input
                  type="text"
                  required={f.required}
                  placeholder={f.placeholder}
                  value={form.data[f.key] || ""}
                  onChange={(e) => setForm({ ...form, data: { ...form.data, [f.key]: e.target.value } })}
                  className={inputClass}
                />
              </label>
            ))}

            <DiscordIdInput
              value={form.data.winnerId || ""}
              onChange={(next) => setForm({ ...form, data: { ...form.data, winnerId: next } })}
              label="우승자 명단"
            />

            {/* Enter 로 제출되던 동작을 살리는 숨은 단추 (보이는 저장 단추는 칸 아래 줄에 있다) */}
            <button type="submit" tabIndex={-1} aria-hidden className="sr-only">저장</button>
          </form>
        )}
      </DetailPane>

      {/* 📌 대회 우승 정보 수정 — 상세 칸 */}
      <DetailPane
        open={!!winnerEdit}
        onClose={() => setWinnerEdit(null)}
        title="대회 우승 정보 수정"
        sub={winnerEdit?.title}
        footer={
          winnerEdit && (
            <>
              <Link href={`/write?id=${winnerEdit._id}`} className={linkBtn("md")}>대회 글 ↗</Link>
              <div className="ml-auto flex items-center gap-2">
                <Btn variant="secondary" onClick={() => setWinnerEdit(null)}>취소</Btn>
                <Btn onClick={submitNearest} disabled={isSaving}>{isSaving ? "저장 중…" : "저장"}</Btn>
              </div>
            </>
          )
        }
      >
        {winnerEdit && (
          <form onSubmit={submitWinner} className="space-y-4">
            <label className="block">
              <span className={labelClass}>우승팀 / 우승자<Req /></span>
              <input
                type="text"
                required
                placeholder="예: 이글루A"
                value={winnerEdit.winner}
                onChange={(e) => setWinnerEdit({ ...winnerEdit, winner: e.target.value })}
                className={inputClass}
              />
            </label>
            <DiscordIdInput
              value={winnerEdit.winnerId}
              onChange={(next) => setWinnerEdit({ ...winnerEdit, winnerId: next })}
              label="우승 팀원 명단"
            />
            <button type="submit" tabIndex={-1} aria-hidden className="sr-only">저장</button>
          </form>
        )}
      </DetailPane>

      {/* 📌 삭제 확인 */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="삭제 확인"
        body={deleteTarget && <><b className="text-[#131313]">{deleteTarget.title}</b> 기록을 명예의 전당에서 삭제하시겠습니까?</>}
        confirmLabel="삭제"
        danger
        onConfirm={executeDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {toastEl}
    </AdminPage>
  );
}
