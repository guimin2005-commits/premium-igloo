// 규칙 검토 #94 — 시즌 패스 기준선 채우기 (지금 시즌, 시즌 2 는 2026-10-01 KST 시작)
//
// 📌 2026-10-04 "시즌이 시작될 때 모두의 출발점을 한 번에 찍어 두면, 언제 열어도 똑같이 계산됩니다".
//    사이트(lib/seasonPass.js stampSeasonBaselines)는 새 시즌 첫 조회 때 전원을 찍는다. 이 스크립트는 이미 시작한 지금 시즌을
//    그 조회를 기다리지 않고 바로 채운다 — XpLog(100일 TTL, 예전 60일)가 아직 시즌 시작부터 남아 있을 때 돌려야 시즌 초 몫이 빠지지 않는다.
//    대상 · 값은 사이트와 같다: passSeason ≠ 지금 시즌인 UserXp 문서마다
//      기준선 = xp − (세는 구간 뒤 XpLog amount + passBoost + 지급된 XP 대기열 amount + passBoost · 패스 보상 · 역할 환불 · 관리자 초기화 제외)
//      세는 구간 = 시즌 시작과 문서가 생긴 시각(_id) 중 늦은 쪽
//    해금 · 해금 때 낸 값 · 수령 기록은 새 시즌이라 비운다(사이트 롤오버와 같다). 문서마다 읽은 시즌 그대로일 때만 쓴다.
//    이미 이번 시즌 기준선이 있는 문서(패스를 연 사람)는 건드리지 않는다 — 같은 식으로 이미 찍혔다.
//    식은 lib/season.js(passEarnedPipelines · passSince · passBaseFrom · passRolloverPipeline · passSeasonFilter) 하나를 그대로 쓴다.
//    📌 2026-10-04 검토 반영 — 덩어리(500명)마다 읽고 → 집계하고 → (--apply 면) 바로 쓴다. 기준선은 쓰는 순간의 xp 로 계산한다(파이프라인 갱신).
//       전원을 먼저 읽고 끝에 몰아 쓰면 그 사이 상점 결제 · 환불 · 봇 가속($inc passBaseXp)이 덮이고 그 사이 번 XP 를 두 번 센다.
//       미리보기 숫자는 읽은 xp 로 낸 값이다(쓰는 값은 그 순간 xp 기준이라 조금 다를 수 있다)
//
// 사용 (저장소 루트에서):
//   node scripts/rules-review-admin-pass-baseline.mjs            미리보기 — 읽기만 한다(기본)
//   node scripts/rules-review-admin-pass-baseline.mjs --apply    실제로 쓴다
//   --sample=N   미리보기에 보일 줄 수(기본 15)
// MONGODB_URI — 환경변수, 없으면 .env.local 에서 읽는다
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import {
  currentSeason, seasonStartMs, passSince, passEarnedPipelines, passBaseFrom, passRolloverPipeline, passSeasonFilter,
} from "../lib/season.js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const SAMPLE = Math.max(0, Number((args.find((a) => a.startsWith("--sample=")) || "").split("=")[1]) || 15);
const CHUNK = 500;

function mongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return "";
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*MONGODB_URI\s*=\s*(.*)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return "";
}

// 모델 이름만 사이트와 같게 — 컬렉션 이름(userxps · xplogs · payouts)을 mongoose 가 같은 규칙으로 고른다. 쓰기는 드라이버로(캐스팅 없음)
const loose = () => new mongoose.Schema({}, { strict: false });
const UserXp = mongoose.model("UserXp", loose());
const XpLog = mongoose.model("XpLog", loose());
const Payout = mongoose.model("Payout", loose());

const ms = (id) => id?.getTimestamp?.()?.getTime?.() || 0;
const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");

async function main() {
  const uri = mongoUri();
  if (!uri) throw new Error("MONGODB_URI 가 없습니다 (환경변수 또는 .env.local)");
  await mongoose.connect(uri);
  const season = currentSeason();
  const startMs = seasonStartMs(season);
  console.log(`시즌 ${season.number} '${season.name}' · 시작 ${season.start} (KST) · ${APPLY ? "쓰기" : "미리보기(쓰지 않음)"}`);

  // XpLog 가 시즌 시작부터 남아 있는지 — TTL 로 앞이 지워졌으면 그만큼 진행도가 적게 잡힌다
  const oldest = await XpLog.collection.find({}, { projection: { createdAt: 1 } }).sort({ createdAt: 1 }).limit(1).toArray();
  const oldestAt = oldest[0]?.createdAt ? new Date(oldest[0].createdAt).getTime() : null;
  if (oldestAt != null && oldestAt > startMs) {
    console.warn(`⚠ 가장 오래된 XpLog 가 ${new Date(oldestAt).toISOString()} — 시즌 시작보다 늦다. 그 앞 몫은 진행도에 들어가지 않는다`);
  }

  const total = await UserXp.collection.countDocuments({});
  const todo = await UserXp.collection.countDocuments({ passSeason: { $ne: season.number } });
  console.log(`UserXp ${fmt(total)}명 · 이번 시즌 기준선 있음 ${fmt(total - todo)}명 · 찍을 대상 ${fmt(todo)}명`);

  // 덩어리마다 읽고 → 집계하고 → (--apply 면) 바로 쓴다. _id 순으로 이어 읽는다(찍힌 문서가 대상에서 빠져도 건너뛰지 않게)
  const plan = [];
  let stamped = 0;
  let after = null;
  for (;;) {
    const docs = await UserXp.collection
      .find(
        { passSeason: { $ne: season.number }, ...(after ? { _id: { $gt: after } } : {}) },
        { projection: { _id: 1, userId: 1, xp: 1, passSeason: 1, passBaseXp: 1, displayName: 1, username: 1 } }
      )
      .sort({ _id: 1 })
      .limit(CHUNK)
      .toArray();
    if (!docs.length) break;
    after = docs[docs.length - 1]._id;
    const chunk = docs.filter((d) => d.userId);
    const early = chunk.filter((d) => ms(d._id) <= startMs).map((d) => d.userId);
    const earned = new Map();
    if (early.length) {
      const { logs, pays } = passEarnedPipelines({ $in: early }, new Date(startMs), true);
      const [l, p] = await Promise.all([XpLog.aggregate(logs), Payout.aggregate(pays)]);
      for (const r of [...l, ...p]) earned.set(r._id, (earned.get(r._id) || 0) + (Number(r.s) || 0));
    }
    for (const d of chunk) {
      if (ms(d._id) > startMs) {
        // 시즌 시작 뒤에 생긴 문서 — 생긴 때부터 센다
        const { logs, pays } = passEarnedPipelines(d.userId, passSince(season, d._id));
        const [l, p] = await Promise.all([XpLog.aggregate(logs), Payout.aggregate(pays)]);
        earned.set(d.userId, (Number(l[0]?.s) || 0) + (Number(p[0]?.s) || 0));
      }
      const xp = Number(d.xp) || 0;
      const base = passBaseFrom(xp, earned.get(d.userId) || 0);
      plan.push({ d, xp, base, progress: Math.max(0, xp - base), bornAfter: ms(d._id) > startMs });
    }
    if (APPLY && chunk.length) {
      // 기준선은 쓰는 순간의 xp 로(passRolloverPipeline) — 드라이버 bulkWrite 라 파이프라인 갱신을 그대로 보낸다
      const now = new Date();
      const ops = chunk.map((d) => ({
        updateOne: { filter: { _id: d._id, ...passSeasonFilter(d.passSeason || 0) }, update: passRolloverPipeline(season, earned.get(d.userId) || 0, now) },
      }));
      const r = await UserXp.collection.bulkWrite(ops, { ordered: false });
      stamped += r?.modifiedCount || 0;
    }
    if (docs.length < CHUNK) break;
  }

  const withProgress = plan.filter((x) => x.progress > 0);
  const bornAfter = plan.filter((x) => x.bornAfter).length;
  console.log(`진행도 있음 ${fmt(withProgress.length)}명 · 진행도 합 ${fmt(withProgress.reduce((s, x) => s + x.progress, 0))} XP · 시즌 중 생긴 문서 ${fmt(bornAfter)}명${APPLY ? " (읽은 xp 기준)" : ""}`);
  for (const x of [...plan].sort((a, b) => b.progress - a.progress).slice(0, SAMPLE)) {
    const name = x.d.displayName || x.d.username || "";
    console.log(`  ${x.d.userId} ${name} · xp ${fmt(x.xp)} · 기준선 ${fmt(x.base)} · 진행도 ${fmt(x.progress)} · 지난 시즌 값 ${x.d.passSeason ?? "없음"}${x.bornAfter ? " · 시즌 중 생김" : ""}`);
  }

  if (!APPLY) {
    console.log("미리보기만 했습니다. 쓰려면 --apply 를 붙여 다시 실행하세요.");
    return;
  }
  console.log(`기준선을 찍었습니다: ${fmt(stamped)}/${fmt(plan.length)}명 (그 사이 다른 요청이 먼저 찍은 문서는 건너뜀)`);
}

main()
  .catch((e) => {
    console.error("실패:", e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => {}));
