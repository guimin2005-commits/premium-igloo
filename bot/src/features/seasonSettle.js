// ── 시즌 결산 (5분 주기 · 부팅 직후 1회) ──────────
//  · 끝난 시즌(지금 > 종료 시각)에 결산 기록(SeasonResult)이 없으면 XP 상위 3인을 굳혀 둔다
//    순위 기준은 사이트 랭킹 누적 탭(app/api/xp/leaderboard period=all)과 같다 — xp 내림차순 · userId 오름차순 (0 XP 는 순위 아님)
//  · RANKER 역할(BotSetting.rankerRoleId)이 있으면 지난 보유자에게서 떼고 3인에게 붙인 뒤 레벨업 채널에 발표
//  · 관리자가 나중에 요청한 지급(roleGrantRequested)도 같은 방식으로 처리한다. 명예의 전당 등재는 관리자가 수기로
import { UserXp, BotSetting, SeasonResult, isDuplicateKeyError } from "../db.js";
import { SEASONS, seasonEndMs, getLevelByXp } from "../leveling.js";
import { config } from "../config.js";
import { buildMessage, SITE_URL } from "../botMessages.js";

const TICK_MS = 5 * 60 * 1000;
const NO_NAME = "이름 없음";

async function fetchMember(guild, userId) {
  return guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
}

async function readSetting() {
  return (
    (await BotSetting.findOne({ key: "main" }, { rankerRoleId: 1, levelupChannelId: 1, levelPublic: 1 }).lean()) || {}
  );
}

// 상위 3인 — 이름이 비어 있으면(큐로만 XP 가 들어온 계정) 디스코드 표시 이름으로 채운다 (랭킹 화면과 같은 방식)
async function topThree(guild) {
  const rows = await UserXp.find({ xp: { $gt: 0 } }, { userId: 1, displayName: 1, username: 1, xp: 1 })
    .sort({ xp: -1, userId: 1 })
    .limit(3)
    .lean();
  const out = [];
  for (const [i, r] of rows.entries()) {
    let name = r.displayName || r.username || "";
    if (!name) {
      const m = await fetchMember(guild, r.userId);
      name = m?.displayName || m?.user?.username || "";
    }
    const xp = Number(r.xp) || 0;
    out.push({ rank: i + 1, userId: r.userId, name: name || NO_NAME, xp, level: getLevelByXp(xp) });
  }
  return out;
}

// ── 결산 기록 ──────────────────────────────
//    📌 판정은 "지금 > 종료 시각" — 마지막 시즌이 끝난 뒤에도 currentSeason() 은 끝난 시즌을 돌려주므로 시즌 번호 변화로 보면 못 잡는다
async function settleEnded(guild) {
  const now = Date.now();
  const ended = SEASONS.filter((s) => now > seasonEndMs(s));
  if (!ended.length) return;

  let setting = null;
  for (const s of ended) {
    if (await SeasonResult.exists({ season: s.number })) continue;
    setting = setting || (await readSetting());
    const top = await topThree(guild);
    // 📌 레벨 비공개(levelPublic 이 true 가 아님) 중에는 역할 · 발표를 자동으로 하지 않는다 — 사이트가 순위를 가리는 동안 채널에 나가지 않게.
    //    기록만 두고(rankerRoleId 비움) 관리자가 결산 화면에서 요청하면 그때 준다
    //    상위 기록이 없으면 줄 사람도 없다 — 역할을 정해 두면 봇이 "상위 기록이 없습니다" 실패만 남긴다
    const roleId = setting.levelPublic === true && top.length ? String(setting.rankerRoleId || "").trim() : "";
    try {
      await SeasonResult.create({
        season: s.number,
        name: s.name,
        start: s.start,
        end: s.end,
        settledAt: new Date(),
        top,
        rankerRoleId: roleId,
      });
      console.log(
        `🏆 시즌 ${s.number} 결산: ${top.map((t) => `${t.rank}위 ${t.name}`).join(" · ") || "상위 기록 없음"}${roleId ? "" : " (역할 지급 없음)"}`
      );
    } catch (e) {
      if (isDuplicateKeyError(e)) continue; // 다른 쪽이 먼저 만들었다 (season unique)
      throw e;
    }
  }
}

// ── RANKER 역할 지급 · 발표 ─────────────────────
//    대상: 아직 지급 전이고 지난 시도가 실패하지 않은 결과 중 — 결산 때 역할이 정해졌거나(rankerRoleId) 관리자가 요청한 것.
//    실패하면 error 에 사유를 남기고 멈춘다. 관리자가 다시 요청하면(error 를 비움) 다시 한다
async function processGrants(guild) {
  const rows = await SeasonResult.find({
    roleGrantedAt: null,
    error: { $in: ["", null] },
    $or: [{ roleGrantRequested: true }, { rankerRoleId: { $gt: "" } }],
  })
    .sort({ season: 1 }) // 옛 시즌부터 — 둘이 밀려 있으면 최근 시즌 3인이 마지막 보유자가 된다
    .lean();
  if (!rows.length) return;
  const setting = await readSetting();
  for (const r of rows) await grantRanker(guild, r, setting);
}

async function grantRanker(guild, r, setting) {
  const fail = async (message) => {
    await SeasonResult.updateOne({ _id: r._id, roleGrantedAt: null }, { $set: { error: String(message).slice(0, 500) } }).catch(
      () => {}
    );
    console.error(`🏆 시즌 ${r.season} RANKER 지급 실패:`, message);
  };

  try {
    const roleId = String(r.rankerRoleId || setting.rankerRoleId || "").trim();
    if (!roleId) return fail("RANKER 역할이 설정되지 않았습니다.");
    const top = (Array.isArray(r.top) ? r.top : []).filter((t) => t?.userId).sort((a, b) => a.rank - b.rank);
    if (!top.length) return fail("상위 기록이 없습니다.");
    // 옛 시즌을 늦게 요청해도 더 최근 시즌 3인의 역할을 빼앗지 않는다
    if (await SeasonResult.exists({ season: { $gt: r.season }, roleGrantedAt: { $ne: null } })) {
      return fail("더 최근 시즌의 RANKER 역할이 이미 지급되어 있습니다.");
    }

    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    if (!role) return fail("RANKER 역할을 서버에서 찾을 수 없습니다.");
    if (!role.editable) return fail("봇 역할보다 위에 있는 역할이라 지급할 수 없습니다.");

    // 지금 보유자 전원을 알아야 뗄 수 있다 — 캐시에 없는 멤버까지 한 번 받아 온다
    await guild.members.fetch();
    const topIds = new Set(top.map((t) => t.userId));
    for (const m of [...role.members.values()]) {
      if (!topIds.has(m.id)) await m.roles.remove(role, `시즌 ${r.season} RANKER 교체`);
    }

    const present = new Map();
    const missing = [];
    for (const t of top) {
      const m = await fetchMember(guild, t.userId);
      if (!m) {
        missing.push(t.name || t.userId);
        continue;
      }
      if (!m.roles.cache.has(role.id)) await m.roles.add(role, `시즌 ${r.season} RANKER`);
      present.set(t.userId, m);
    }

    // 📌 지급 전일 때만 확정 — 봇이 둘 떠 있어도 발표는 한 번
    const note = missing.length ? `서버에 없어 역할을 주지 못했습니다: ${missing.join(", ")}` : "";
    const done = await SeasonResult.updateOne(
      { _id: r._id, roleGrantedAt: null },
      { $set: { roleGrantedAt: new Date(), rankerRoleId: role.id, error: note.slice(0, 500) } }
    );
    if (!done.modifiedCount) return;
    console.log(`🏆 시즌 ${r.season} RANKER 지급: ${[...present.values()].map((m) => m.displayName).join(" · ") || "없음"}`);

    await announce(guild, r, role, top, present, setting);
  } catch (e) {
    await fail(e?.code === 50013 ? "역할을 바꿀 권한이 없습니다." : e?.message || String(e));
  }
}

async function announce(guild, r, role, top, present, setting) {
  const channelId = setting.levelupChannelId || config.levelupChannelId;
  if (!channelId) {
    console.log(`🏆 시즌 ${r.season} RANKER 발표 건너뜀 — 레벨업 채널이 없습니다`);
    return;
  }
  const who = (t) => (t ? (present.has(t.userId) ? `<@${t.userId}>` : `**${t.name || NO_NAME}**`) : "");
  const [a, b, c] = top;
  const payload = buildMessage("rankerAnnounce", {
    server: guild.name,
    site: SITE_URL,
    season: r.season,
    seasonName: r.name,
    first: who(a),
    second: who(b),
    third: who(c),
    firstXp: a?.xp,
    secondXp: b?.xp,
    thirdXp: c?.xp,
    role: role.name,
  });
  if (!payload) return; // 관리자가 끈 메시지

  // 선점 후 보낸다 — 보내기에 실패하면 되돌리고 사유를 남긴다
  const claim = await SeasonResult.updateOne({ _id: r._id, announcedAt: null }, { $set: { announcedAt: new Date() } });
  if (!claim.modifiedCount) return;
  try {
    const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel?.isTextBased?.()) throw new Error("레벨업 채널을 찾을 수 없습니다.");
    await channel.send(payload);
    console.log(`🏆 시즌 ${r.season} RANKER 발표 완료`);
  } catch (e) {
    const message = `발표 실패: ${e?.message || e}`.slice(0, 500);
    await SeasonResult.updateOne({ _id: r._id }, { $set: { announcedAt: null, error: message } }).catch(() => {});
    console.error(`🏆 시즌 ${r.season} RANKER ${message}`);
  }
}

let ticking = false;
let started = false;

async function run(client) {
  if (ticking) return;
  ticking = true;
  try {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;
    await settleEnded(guild);
    await processGrants(guild);
  } catch (e) {
    console.error("시즌 결산 오류:", e.message);
  } finally {
    ticking = false;
  }
}

export function startSeasonSettle(client) {
  if (started) return;
  started = true;
  run(client);
  setInterval(() => run(client), TICK_MS);
  console.log("✅ 시즌 결산 시작 (5분 주기)");
}
