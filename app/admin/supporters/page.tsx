"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Reveal, LuxStyles } from "../../components/Lux";
import {
  inputClass,
  FilterChips,
  EmptyRow,
  ListFrame,
  Btn,
  useNotice,
  ConfirmDialog,
  useAdminGuard,
  AdminHero,
  TableScroll,
} from "../ui";

// 📌 서포터즈 월간 평가 화면 — 역할 보유자 전원의 그 달 활동(채팅·음성)을 한 표로 놓고
//    등급·XP·POINT·코멘트를 적어 임시 저장(draft)한 뒤, 확인을 거쳐 지급(paid)한다.
//    활동량은 근거일 뿐 금액을 정하는 건 관리자다 — 그래서 자동 계산 없이 입력칸으로 둔다.
//    지급은 되돌릴 수 없어 paid 행은 잠근다.

type Eval = {
  grade: string;
  xp: number;
  point: number;
  note: string;
  status: "draft" | "paid";
  paidAt?: string | null;
};
type Row = {
  userId: string;
  name: string;
  avatar: string;
  chatCount: number;
  voiceMin: number;
  eval: Eval | null;
};
// 입력 도중에는 숫자 칸을 비울 수 있어야 해서 문자열로 들고 있다가 저장할 때 숫자로 바꾼다
type Edit = { grade: string; xp: string; point: string; note: string };
type Goals = { chat: number; voiceMin: number };

const KST = 9 * 60 * 60 * 1000;
// 서버 집계가 KST 월 경계라 칩의 값도 KST 로 만든다 — 월말 밤에 UTC 로 만들면 한 달이 어긋난다
const monthKeyKST = (offset = 0) => {
  const n = new Date(Date.now() + KST);
  const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const toInt = (v: any) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const fmtDate = (v?: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

// 저장 여부 비교용 지문 — 서버로 나가는 값만 담는다
const sig = (e: Edit) =>
  JSON.stringify({ grade: e.grade.trim(), xp: toInt(e.xp), point: toInt(e.point), note: e.note.trim() });

const editOf = (ev: Eval | null, baseXp: number): Edit =>
  ev
    ? { grade: ev.grade || "", xp: String(ev.xp ?? 0), point: String(ev.point ?? 0), note: ev.note || "" }
    : { grade: "", xp: String(baseXp), point: "0", note: "" };

const pct = (value: number, goal: number) => Math.round((value / goal) * 100);

export default function AdminSupportersPage() {
  // 화면 가리개일 뿐이다 — 실제 방어는 /api/admin/supporters 가 서버에서 한 번 더 한다
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();

  const thisMonth = useMemo(() => monthKeyKST(0), []);
  const lastMonth = useMemo(() => monthKeyKST(-1), []);
  const [month, setMonth] = useState(thisMonth);

  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [goals, setGoals] = useState<Goals>({ chat: 0, voiceMin: 0 });
  const [baseXp, setBaseXp] = useState(150000);
  const [roleId, setRoleId] = useState("");

  // 행 편집은 로컬에만 두고 저장 버튼을 눌러야 서버로 간다
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [savingId, setSavingId] = useState("");
  const [payTarget, setPayTarget] = useState<Row | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  const fetchRows = useCallback(
    (m: string) => {
      setIsLoading(true);
      fetch(`/api/admin/supporters?month=${m}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null)
        .then((d) => {
          if (d?.success && Array.isArray(d.rows)) {
            const base = toInt(d.baseXp) || 150000;
            const list: Row[] = d.rows.map((r: any) => ({
              userId: String(r.userId || ""),
              name: r.name || r.userId || "",
              avatar: r.avatar || "",
              chatCount: toInt(r.chatCount),
              voiceMin: toInt(r.voiceMin),
              eval: r.eval
                ? {
                    grade: r.eval.grade || "",
                    xp: toInt(r.eval.xp),
                    point: toInt(r.eval.point),
                    note: r.eval.note || "",
                    status: r.eval.status === "paid" ? "paid" : "draft",
                    paidAt: r.eval.paidAt || null,
                  }
                : null,
            }));
            setRows(list);
            setGoals({ chat: toInt(d.goals?.chat), voiceMin: toInt(d.goals?.voiceMin) });
            setBaseXp(base);
            setRoleId(d.roleId || "");
            // 📌 월을 바꾸면 편집 중이던 값은 버린다 — 같은 userId 라도 다른 달의 평가라 섞이면 안 된다
            setEdits(Object.fromEntries(list.map((r) => [r.userId, editOf(r.eval, base)])));
            setLoadFailed(false);
          } else {
            setRows([]);
            setEdits({});
            setLoadFailed(true);
          }
        })
        .finally(() => setIsLoading(false));
    },
    []
  );

  useEffect(() => {
    if (isAdmin) fetchRows(month);
  }, [isAdmin, month, fetchRows]);

  const setEdit = (userId: string, patch: Partial<Edit>) =>
    setEdits((prev) => ({ ...prev, [userId]: { ...(prev[userId] || editOf(null, baseXp)), ...patch } }));

  // ── 저장 (draft) ─────────────────────────────
  const saveRow = async (row: Row) => {
    if (savingId) return;
    const e = edits[row.userId] || editOf(row.eval, baseXp);
    setSavingId(row.userId);
    const res = await fetch("/api/admin/supporters", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: row.userId,
        userName: row.name,
        month,
        grade: e.grade.trim(),
        xp: toInt(e.xp),
        point: toInt(e.point),
        note: e.note.trim(),
      }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setSavingId("");

    if (res?.ok && d?.success) {
      // 응답에 평가가 실리면 그것을, 아니면 방금 보낸 값을 draft 로 반영한다
      const saved: Eval = d.eval
        ? {
            grade: d.eval.grade || "",
            xp: toInt(d.eval.xp),
            point: toInt(d.eval.point),
            note: d.eval.note || "",
            status: d.eval.status === "paid" ? "paid" : "draft",
            paidAt: d.eval.paidAt || null,
          }
        : { grade: e.grade.trim(), xp: toInt(e.xp), point: toInt(e.point), note: e.note.trim(), status: "draft", paidAt: null };
      setRows((prev) => prev.map((r) => (r.userId === row.userId ? { ...r, eval: saved } : r)));
      setEdits((prev) => ({ ...prev, [row.userId]: editOf(saved, baseXp) }));
      notify(`${row.name} · ${month} 평가를 저장했습니다.`);
    } else if (res?.status === 409) {
      // 이미 지급된 평가 — 화면이 낡았을 수 있으니 다시 받아 잠근다
      notify("이미 지급된 평가라 수정할 수 없습니다.", true);
      fetchRows(month);
    } else {
      notify(d?.message || d?.error || "저장에 실패했습니다.", true);
    }
  };

  // ── 지급 (draft → paid) ───────────────────────
  const doPay = async () => {
    if (!payTarget || isPaying) return;
    setIsPaying(true);
    const res = await fetch("/api/admin/supporters/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: payTarget.userId, month }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setIsPaying(false);

    if (res?.ok && d?.success) {
      const name = payTarget.name;
      setPayTarget(null);
      // paidAt 은 서버가 찍는다 — 다시 받아서 잠금과 날짜를 맞춘다
      fetchRows(month);
      notify(`${name} · ${month} 보상을 지급했습니다.`);
    } else {
      notify(d?.message || d?.error || "지급에 실패했습니다.", true);
    }
  };

  if (gate) return gate;

  const hasGoal = goals.chat > 0 || goals.voiceMin > 0;
  const evaluated = rows.filter((r) => r.eval).length;
  const paid = rows.filter((r) => r.eval?.status === "paid").length;
  // 지급은 서버에 저장된 draft 로 나가므로 모달도 편집칸이 아니라 저장본을 보여 준다
  const payEval = payTarget?.eval || null;
  const dlLabel = "text-xs font-bold text-[#5a5a5a] shrink-0";

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      <AdminHero size="lg" title="서포터즈 평가" />

      <div className="w-full max-w-6xl mx-auto px-6 pb-16 flex-1 flex flex-col space-y-10">
        {loadFailed && (
          <div className="px-4 py-3 rounded-lg border border-[#e91e3f]/30 bg-[#e91e3f]/[0.06] text-[12px] font-bold text-[#c2183a] break-keep">
            목록을 불러오지 못했습니다 (/api/admin/supporters 응답 없음).
            <button onClick={() => fetchRows(month)} className="ml-2 underline underline-offset-2 outline-none focus:outline-none">다시 불러오기</button>
          </div>
        )}

        <Reveal>
          <section>
            {/* flex-col 에서는 gap 이 안 먹는다(Tailwind v4) — 세로 간격은 mb 로 */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between md:gap-4 mb-6">
              <div className="flex items-center gap-3 mb-3 md:mb-0">
                <FilterChips
                  options={[
                    { v: thisMonth, l: "이번 달" },
                    { v: lastMonth, l: "지난 달" },
                  ]}
                  value={month}
                  onChange={setMonth}
                />
                <span className="text-[12px] font-black text-[#131313] tabular-nums shrink-0">{month}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-[#5a5a5a] tabular-nums">
                <span>인원 <b className="text-[#131313]">{rows.length}</b></span>
                <span>평가 완료 <b className="text-[#131313]">{evaluated}</b></span>
                <span>지급 완료 <b className="text-[#131313]">{paid}</b></span>
                {hasGoal && (
                  <span>
                    목표{goals.chat > 0 && <> 채팅 <b className="text-[#131313]">{goals.chat.toLocaleString()}</b></>}
                    {goals.voiceMin > 0 && <> 음성 <b className="text-[#131313]">{goals.voiceMin.toLocaleString()}분</b></>}
                  </span>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="py-10 text-center text-[#8a8a8a] text-sm">불러오는 중...</div>
            ) : loadFailed ? (
              <EmptyRow>목록을 불러오지 못했습니다.</EmptyRow>
            ) : !roleId && rows.length === 0 ? (
              <EmptyRow>
                서포터즈 역할이 지정되지 않았습니다.{" "}
                <Link href="/admin/bot?tab=roles&sec=supporter" className="text-[#e91e3f] font-bold underline underline-offset-2">
                  역할 지정
                </Link>
              </EmptyRow>
            ) : rows.length === 0 ? (
              <EmptyRow>서포터즈 역할을 가진 멤버가 없습니다.</EmptyRow>
            ) : (
              <TableScroll>
                <div className="min-w-[1120px]">
                  <div className="flex items-center gap-3 pb-2.5 text-[10px] font-black tracking-[0.12em] text-[#a3a3a3]">
                    <span className="w-44 shrink-0">서포터즈</span>
                    <span className="w-14 shrink-0 text-right">채팅</span>
                    <span className="w-16 shrink-0 text-right">음성</span>
                    <span className="w-20 shrink-0 text-right">달성률</span>
                    <span className="w-16 shrink-0">등급</span>
                    <span className="w-32 shrink-0">XP</span>
                    <span className="w-28 shrink-0">POINT</span>
                    <span className="flex-1 min-w-0">코멘트</span>
                    <span className="w-28 shrink-0">상태</span>
                    <span className="w-36 shrink-0 text-right">처리</span>
                  </div>

                  <ListFrame>
                    {rows.map((r) => {
                      const e = edits[r.userId] || editOf(r.eval, baseXp);
                      const locked = r.eval?.status === "paid";
                      const dirty = r.eval ? sig(e) !== sig(editOf(r.eval, baseXp)) : true;
                      const canSave = !locked && dirty && !savingId;
                      // 지급은 서버에 저장된 draft 를 기준으로 나간다 — 안 저장한 편집이 있으면 먼저 저장하게 막는다
                      const canPay = r.eval?.status === "draft" && !dirty && !savingId;
                      const busy = savingId === r.userId;
                      const cell = `${inputClass} disabled:opacity-40`;
                      return (
                        <div key={r.userId} className="flex items-center gap-3 py-3">
                          <span className="w-44 shrink-0 flex items-center gap-2.5 min-w-0">
                            {r.avatar ? (
                              <img src={r.avatar} alt="" className="w-8 h-8 rounded-full bg-[#dedddb] object-cover shrink-0" />
                            ) : (
                              <span className="w-8 h-8 rounded-full bg-[#dedddb] shrink-0"></span>
                            )}
                            <span className="min-w-0">
                              <span className="block text-[13px] font-bold text-[#131313] truncate">{r.name}</span>
                              <span className="block text-[10px] text-[#a3a3a3] tabular-nums truncate">{r.userId}</span>
                            </span>
                          </span>
                          <span className="w-14 shrink-0 text-right text-[13px] font-black text-[#131313] tabular-nums">
                            {r.chatCount.toLocaleString()}
                          </span>
                          <span className="w-16 shrink-0 text-right text-[13px] font-black text-[#131313] tabular-nums">
                            {r.voiceMin.toLocaleString()}<span className="text-[10px] font-bold text-[#8a8a8a]">분</span>
                          </span>
                          <span className="w-20 shrink-0 text-right tabular-nums">
                            {!hasGoal ? (
                              <span className="text-[12px] text-[#a3a3a3]">-</span>
                            ) : (
                              <>
                                {goals.chat > 0 && (
                                  <span className={`block text-[11px] font-bold ${pct(r.chatCount, goals.chat) >= 100 ? "text-[#e91e3f]" : "text-[#5a5a5a]"}`}>
                                    채팅 {pct(r.chatCount, goals.chat)}%
                                  </span>
                                )}
                                {goals.voiceMin > 0 && (
                                  <span className={`block text-[11px] font-bold ${pct(r.voiceMin, goals.voiceMin) >= 100 ? "text-[#e91e3f]" : "text-[#5a5a5a]"}`}>
                                    음성 {pct(r.voiceMin, goals.voiceMin)}%
                                  </span>
                                )}
                              </>
                            )}
                          </span>
                          <span className="w-16 shrink-0">
                            <input
                              type="text"
                              value={e.grade}
                              maxLength={8}
                              placeholder="A"
                              disabled={locked || busy}
                              onChange={(ev) => setEdit(r.userId, { grade: ev.target.value })}
                              className={cell}
                            />
                          </span>
                          <span className="w-32 shrink-0">
                            <input
                              type="number"
                              min={0}
                              value={e.xp}
                              placeholder={String(baseXp)}
                              disabled={locked || busy}
                              onChange={(ev) => setEdit(r.userId, { xp: ev.target.value })}
                              className={cell}
                            />
                          </span>
                          <span className="w-28 shrink-0">
                            <input
                              type="number"
                              min={0}
                              value={e.point}
                              placeholder="0"
                              disabled={locked || busy}
                              onChange={(ev) => setEdit(r.userId, { point: ev.target.value })}
                              className={cell}
                            />
                          </span>
                          <span className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={e.note}
                              maxLength={200}
                              placeholder="코멘트"
                              disabled={locked || busy}
                              onChange={(ev) => setEdit(r.userId, { note: ev.target.value })}
                              className={cell}
                            />
                          </span>
                          <span className="w-28 shrink-0">
                            {locked ? (
                              <>
                                <span className="block text-[11px] font-black text-[#e91e3f]">지급 완료</span>
                                <span className="block text-[10px] text-[#8a8a8a] tabular-nums">{fmtDate(r.eval?.paidAt)}</span>
                              </>
                            ) : r.eval ? (
                              <>
                                <span className="block text-[11px] font-black text-[#131313]">저장됨</span>
                                {dirty && <span className="block text-[10px] font-bold text-[#e91e3f]">저장되지 않은 변경</span>}
                              </>
                            ) : (
                              <span className="text-[11px] font-bold text-[#a3a3a3]">미평가</span>
                            )}
                          </span>
                          <span className="w-36 shrink-0 flex items-center justify-end gap-2">
                            <Btn variant="ghost" onClick={() => saveRow(r)} disabled={!canSave}>
                              {busy ? "저장 중" : "저장"}
                            </Btn>
                            <Btn
                              onClick={() => setPayTarget(r)}
                              disabled={!canPay}
                              title={locked ? "지급 완료" : !r.eval ? "먼저 저장하세요" : dirty ? "변경을 먼저 저장하세요" : undefined}
                            >
                              지급
                            </Btn>
                          </span>
                        </div>
                      );
                    })}
                  </ListFrame>
                </div>
              </TableScroll>
            )}

            <p className="mt-6 text-xs text-[#8a8a8a] leading-relaxed break-keep">XP 는 봇이 1분 안에 지급합니다.</p>
          </section>
        </Reveal>
      </div>

      {/* ── 지급 확인 ── */}
      <ConfirmDialog
        open={!!payTarget}
        title="보상 지급"
        confirmLabel="지급"
        busy={isPaying}
        onCancel={() => { if (!isPaying) setPayTarget(null); }}
        onConfirm={doPay}
        body={
          payTarget && payEval ? (
            <div className="space-y-2 tabular-nums">
              <div className="flex items-center justify-between gap-4">
                <span className={dlLabel}>대상</span>
                <span className="text-[#131313] font-bold truncate">{payTarget.name} · {month}</span>
              </div>
              {payEval.grade && (
                <div className="flex items-center justify-between gap-4">
                  <span className={dlLabel}>등급</span>
                  <span className="text-[#131313] font-bold">{payEval.grade}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <span className={dlLabel}>XP</span>
                <span className="text-[#131313] font-black">{payEval.xp.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className={dlLabel}>POINT</span>
                <span className="text-[#3f9e93] font-black">{payEval.point.toLocaleString()}</span>
              </div>
              <p className="pt-2 text-[11px] text-[#8a8a8a]">지급 후에는 수정할 수 없습니다.</p>
            </div>
          ) : null
        }
      />

      {noticeEl}
    </main>
  );
}
