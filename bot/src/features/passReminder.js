// ── 시즌 종료 전 안 받은 시즌 패스 보상 DM (10분 주기) ──────────────
//  · 지금 시즌 D-7 · D-1 의 KST 18:00 이후 첫 주기에 한 번씩. D-day 는 사이트 패스 창 · 홈의 "D-n" 과 같은 셈(lib/season.js getSeasonDday)
//    — 그래서 D-1 은 종료일 당일(12/31)이다. 봇이 꺼져 있다 늦게 떠도 보내는 시각부터 24시간 안(시즌 종료 전)이면 보낸다
//  · 대상: 받을 수 있는데 안 받은 칸(무료 + 프리미엄이면 유료)이 1개 이상인 유저 — /시즌패스와 같은 passView(views/pass.js,
//    사이트 lib/seasonPass.js getPassState 의 사본)의 claimable 을 그대로 쓴다. 판정을 여기 따로 두지 않는다
//  · 같은 유저 · 시즌 · 단계는 한 번만 — PassReminder(userId · season · stage unique)에 표시를 먼저 넣은 쪽만 보낸다
//    (봇 재시작 · 둘 떠 있어도). 표시를 넣은 뒤 DM 이 막혀 실패해도 다시 보내지 않는다
//  · 안 보냄: 시즌 패스 꺼짐(관리 › 시즌 패스) · 레벨 비공개(사이트 수령이 막힌다 — api/pass/claim denyIfLevelClosed) ·
//    관리 › 봇 메시지에서 passUnclaimed 끔 · 서버를 나간 유저 · DM 막힌 유저(조용히)
import mongoose from "mongoose";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { UserXp, isDuplicateKeyError } from "../db.js";
import { config } from "../config.js";
import { currentSeason, seasonEndMs } from "../leveling.js";
import { isLevelOpen } from "../botSettings.js";
import { buildMessage, commonVars, formatUntil, SITE_URL } from "../botMessages.js";
import { passView, normalizeTiers, SeasonPass } from "../views/pass.js";

const TICK_MS = 10 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const STAGES = [7, 1]; // D-n 의 n — 단계마다 한 번
const SEND_AT = "18:00"; // KST — 이 시각 이후 첫 주기
const CATCH_UP_MS = DAY; // 보내는 시각부터 이만큼은 늦게 떠도 보낸다(그 뒤는 다음 단계로 넘긴다)
const GAP_MS = 1500; // 📌 DM 사이 간격 — 디스코드 속도 제한 · 스팸 판정에 걸리지 않게
const PASS_PATH = "/level?tab=pass"; // 대시보드로 가며 시즌 패스 창을 연다 (app/level/page.js 옛 주소 처리)

// 📌 봇 전용 컬렉션(passreminders) — 보낸 표시. 사이트는 읽지 않는다
const PassReminderSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    season: { type: Number, required: true },
    stage: { type: Number, required: true }, // D-n 의 n
    sentAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
PassReminderSchema.index({ userId: 1, season: 1, stage: 1 }, { unique: true });
const PassReminder = mongoose.models.PassReminder || mongoose.model("PassReminder", PassReminderSchema);

// 인덱스는 autoIndex 설정과 상관없이 직접 세운다(이미 있으면 그대로). 실패하면 다음 주기에 다시 시도
let indexReady = null;
const ensureIndex = () =>
  (indexReady ||= PassReminder.createIndexes().catch((e) => {
    indexReady = null;
    throw e;
  }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// D-day 숫자 — lib/season.js getSeasonDday 와 같은 셈(올림(남은 시간 / 1일)). 사이트 패스 창의 "D-n" 과 같은 날이 된다
const ddayOf = (season, now) => Math.ceil((seasonEndMs(season) - now) / DAY);

// 지금 보낼 단계 — { stage, closeAt } | null. D-n 날(종료일 − (n−1)일) 18:00 부터 24시간 · 시즌 종료 전까지.
//    창이 겹치면 더 급한(작은 n) 단계
function stageNow(season, now) {
  const end = seasonEndMs(season);
  if (!(now < end)) return null;
  const last = Date.parse(`${season.end}T${SEND_AT}:00.000+09:00`); // 종료일 18:00 = D-1 보내는 시각
  if (!Number.isFinite(last)) return null;
  for (const stage of [...STAGES].sort((a, b) => a - b)) {
    const at = last - (stage - 1) * DAY;
    const closeAt = Math.min(end, at + CATCH_UP_MS);
    if (now >= at && now < closeAt) return { stage, closeAt };
  }
  return null;
}

// 📌 나간 유저(Unknown Member · Unknown User)만 null — 그 밖의 오류(디스코드 5xx · 시간 초과)는 던져서 다음 주기에 다시 본다
const GONE_CODES = new Set([10007, 10013]);
async function fetchMember(guild, userId) {
  const cached = guild.members.cache.get(userId);
  if (cached) return cached;
  try {
    return await guild.members.fetch(userId);
  } catch (e) {
    if (GONE_CODES.has(e?.code)) return null;
    throw e;
  }
}

const passButton = () =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("보상 받기").setURL(`${SITE_URL}${PASS_PATH}`)
  );

/**
 * 한 단계 돌기 → "done"(끝까지 봤다) | "off"(패스 꺼짐 · 메시지 꺼짐 — 다음 주기에 다시 본다)
 *   | "retry"(일시 오류로 못 본 유저가 있다 — 다음 주기에 다시 돈다. 보낸 유저는 표시(PassReminder)로 건너뛰어 중복 DM 없음)
 * 📌 대상은 UserXp 문서가 있는 유저(한 번이라도 XP 를 받은 유저). 0 XP 로 닿는 티어(need 0)만 있는 문서 없는 유저는 보지 않는다
 */
async function sweep(guild, season, { stage, closeAt }) {
  const cfg = await SeasonPass.findOne({ key: "main" }, { enabled: 1, tiers: 1, nextTid: 1 }).lean();
  if (!cfg?.enabled) return "off";
  // 보상이 있는 티어만 — 하나도 없으면 받을 칸이 생길 수 없다
  const tiers = normalizeTiers(cfg.tiers, cfg.nextTid).filter((t) => t.free.length || t.paid.length);
  if (!tiers.length) return "done";
  const minNeed = Math.min(...tiers.map((t) => t.need));

  // 📌 unique 인덱스가 서 있어야 중복 방지가 된다 — 못 세우면 던져서(보내지 않고) 다음 주기에 다시
  await ensureIndex();
  const marked = new Set(
    (await PassReminder.find({ season: season.number, stage }, { userId: 1 }).lean()).map((r) => String(r.userId))
  );
  const users = await UserXp.find({}, { userId: 1, xp: 1, passSeason: 1, passBaseXp: 1 }).sort({ userId: 1 }).lean();
  const until = formatUntil(seasonEndMs(season));

  let sent = 0;
  let failed = 0;
  let retry = 0; // 멤버 조회 · 집계 · 표시 넣기의 일시 오류 — 그 유저는 표시가 없으니 단계를 끝내지 않는다
  for (const u of users) {
    if (Date.now() >= closeAt) break; // 오래 돌다 창이 닫혔다(시즌 종료 등) — 남은 유저에게는 보내지 않는다
    const userId = String(u.userId || "");
    if (!userId || marked.has(userId)) continue;
    // 📌 거르기 — 이번 시즌 기준선이 이미 찍힌 문서는 passView 와 같은 진행도(xp − passBaseXp)를 바로 셀 수 있다.
    //    가장 낮은 티어에도 못 닿으면 받을 칸이 있을 수 없다(멤버 조회 · 계산을 아낀다). 그 밖은 passView 가 정한다
    if ((u.passSeason || 0) === season.number && Math.max(0, (u.xp || 0) - (u.passBaseXp || 0)) < minNeed) continue;

    try {
      const member = await fetchMember(guild, userId);
      if (!member || member.user?.bot) continue; // 서버를 나간 유저 — 보낼 곳이 없다
      const v = await passView(userId, member); // 멤버를 넘겨야 서버 부스터 프리미엄(유료 칸)까지 사이트와 같게 센다
      if (!v.enabled) return "off";
      if (!(v.claimable > 0)) continue;

      const msg = buildMessage("passUnclaimed", {
        ...commonVars(member, guild),
        season: v.season,
        seasonName: v.seasonName,
        claimable: v.claimable,
        daysLeft: Math.max(1, ddayOf(season, Date.now())),
        until,
      });
      if (!msg) return "off"; // 관리자가 끈 키 — 다시 켜면 다음 주기부터 이어서(표시가 없는 유저만)

      // 📌 표시 먼저 — 넣은 쪽만 보낸다(중복 키면 다른 쪽이 이미 보냈다)
      try {
        await PassReminder.create({ userId, season: season.number, stage, sentAt: new Date() });
      } catch (e) {
        if (isDuplicateKeyError(e)) continue;
        throw e;
      }
      const ok = await member
        .send({ ...msg, components: [passButton()] })
        .then(() => true)
        .catch(() => false); // DM 이 막혀 있으면 조용히 넘어간다
      if (ok) sent += 1;
      else failed += 1;
      await sleep(GAP_MS);
    } catch (e) {
      retry += 1;
      console.error(`🎟 시즌 패스 미수령 DM 오류 (${userId}):`, e.message);
    }
  }
  if (sent || failed) console.log(`🎟 시즌 패스 미수령 DM (시즌 ${season.number} · D-${stage}): ${sent}명${failed ? ` · 못 보냄 ${failed}명` : ""}`);
  return retry ? "retry" : "done";
}

// 이 프로세스에서 일시 오류 없이 끝까지 돈 "시즌:단계" — 재시작하면 다시 돌지만 표시(PassReminder)가 있는 유저는 건너뛴다
const done = new Set();

async function tick(client) {
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return;
  const now = Date.now();
  const season = currentSeason(now);
  const st = stageNow(season, now);
  if (!st) return;
  const key = `${season.number}:${st.stage}`;
  if (done.has(key)) return;
  if (!isLevelOpen()) return; // 비공개 중에는 사이트에서 받을 수 없다 — 창 안에 공개되면 그때 보낸다
  if ((await sweep(guild, season, st)) === "done") done.add(key);
}

let ticking = false;
let started = false;

async function run(client) {
  if (ticking) return; // 📌 한 단계는 DM 간격 때문에 10분을 넘길 수 있다 — 겹쳐 돌지 않게
  ticking = true;
  try {
    await tick(client);
  } catch (e) {
    console.error("시즌 패스 미수령 DM 오류:", e.message);
  } finally {
    ticking = false;
  }
}

export function startPassReminder(client) {
  if (started) return;
  started = true;
  run(client);
  setInterval(() => run(client), TICK_MS);
  console.log("✅ 시즌 패스 미수령 DM 시작 (D-7 · D-1 18:00 · 10분 주기)");
}
