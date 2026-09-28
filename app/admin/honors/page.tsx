"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { DiscordIdInput, parseIds, useDiscordProfiles } from "../../components/DiscordIds";
import {
  useAdminGuard,
  AdminPage,
  StatRow,
  Toolbar,
  Segmented,
  SearchInput,
  Btn,
  DataTable,
  DetailPane,
  StatusChip,
  ConfirmDialog,
  inputClass,
  labelClass,
  type Column,
} from "../ui";
import { HONOR_CATEGORIES } from "@/lib/honors";
import { statusOf } from "@/lib/tournamentPhase";

/* 📌 명예의 전당 관리 — 등재·수정·삭제를 이 한 곳에서 처리한다.
   (예전에는 공개 페이지 위에서 수정·삭제를 했는데, 관리 동선이 두 군데로 갈라져 있었다)
   📌 2026-09 개편 — 목록 화면 틀: 머리 → 요약 → 한 줄 도구(수동/대회 토글 · 검색 · 등재) → 전체 폭 표 → 줄을 누르면 상세 칸.
      가운데 모달 두 개(등재·수정 / 우승 정보)를 상세 칸 하나로 합쳐, 목록을 보면서 다른 줄로 바로 옮겨 가게 했다. */

type Honor = { _id: string; category: string; title: string; winner: string; winnerId: string; detail: string; dateLabel: string; createdAt?: string };
type TournamentRow = { _id: string; title: string; game: string; winner: string; winnerId: string; dateLabel: string; prize: string; status: string };

const EMPTY: Omit<Honor, "_id"> = { category: "SYSTEM : LEVEL", title: "", winner: "", winnerId: "", detail: "", dateLabel: "" };

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
  const [tab, setTab] = useState<"manual" | "tournament">("manual");
  const [query, setQuery] = useState("");

  const [form, setForm] = useState<{ mode: "create" | "edit"; data: any } | null>(null);
  const [winnerEdit, setWinnerEdit] = useState<TournamentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Honor | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const { profiles, load } = useDiscordProfiles();

  // ── 소리 (짧은 신스 톤) ──
  const audioCtx = useRef<AudioContext | null>(null);
  const playTone = useCallback((freq: number, dur = 0.09, gainBase = 0.035, type: OscillatorType = "sine") => {
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gainBase, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {}
  }, []);
  const sfxOk = useCallback(() => { [523, 659, 880].forEach((f, i) => setTimeout(() => playTone(f, 0.11, 0.035), i * 85)); }, [playTone]);
  const sfxErr = useCallback(() => { playTone(300, 0.14, 0.04, "square"); setTimeout(() => playTone(220, 0.2, 0.04, "square"), 130); }, [playTone]);

  const toastTimer = useRef<any>(null);
  const notify = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    error ? sfxErr() : sfxOk();
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, [sfxOk, sfxErr]);

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
  const paneOpen = !!form || !!winnerEdit;

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
      section="운영"
      title="명예의 전당"
      actions={<Link href="/hall-of-fame" className={linkBtn("sm")}>공개 페이지 보기 ↗</Link>}
      // PC 넓은 화면에서 상세 칸(440px)이 열리면 표가 그 밑에 깔리지 않게 오른쪽을 비운다
    >
      {/* ── 요약 ── */}
      <StatRow
        className="mb-5"
        items={[
          { label: "전체 기록", value: honors.length + tournaments.filter((t) => t.winner.trim()).length },
          { label: "수동 기록", value: honors.length },
          { label: "대회 우승", value: tournaments.filter((t) => t.winner.trim()).length },
          { label: "우승자 미기재", value: missingWinner, tone: missingWinner > 0 ? "bad" : undefined },
        ]}
      />

      {/* ── 수동/대회 토글 · 검색 · 등재 ── */}
      <Toolbar
        right={tab === "manual" && <Btn onClick={() => openForm({ mode: "create", data: { ...EMPTY } })}>+ 새 기록 등재</Btn>}
      >
        <Segmented
          options={[
            { v: "manual", l: "수동 기록", n: honors.length },
            { v: "tournament", l: "대회 우승", n: tournaments.length },
          ]}
          value={tab}
          onChange={(v) => { setTab(v as "manual" | "tournament"); setForm(null); setWinnerEdit(null); }}
        />
        <SearchInput value={query} onChange={setQuery} placeholder="제목·우승자 검색" />
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
          rows={tournamentRows}
          rowKey={(t) => t._id}
          onRowClick={(t) => { if (isSaving || winnerEdit?._id === t._id) return; openWinner(t); }}
          selectedKey={winnerEdit?._id ?? null}
          empty={query.trim() ? "검색 결과가 없습니다." : "종료된 대회가 없습니다."}
        />
      )}

      <p className="mt-3 text-[12px] text-[#5a5a5a] break-keep">
        {tab === "manual"
          ? "수동 기록은 SYSTEM : LEVEL 시즌 1등 · 이벤트 우승 등 대회 외 기록입니다."
          : "대회 우승은 대회 글에 저장된 값이라 여기서 고치면 공개 페이지에 그대로 반영됩니다."}
      </p>

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

      {/* 📌 결과 토스트 — 모바일은 하단 독 위로 */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-[96px] md:bottom-6 left-1/2 -translate-x-1/2 z-[130] w-max max-w-[calc(100vw-2rem)] px-5 py-3 rounded-full border text-[13px] font-bold break-keep shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] ${toast.error ? "bg-white border-[#e91e3f] text-[#d01634]" : "bg-[#131313] border-[#131313] text-white"}`}
        >
          {toast.error ? "⚠ " : "✓ "}{toast.msg}
        </div>
      )}
    </AdminPage>
  );
}
