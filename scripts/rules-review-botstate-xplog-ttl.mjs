#!/usr/bin/env node
// 📌 XP 지급 로그(XpLog) 보관 기간 60일 → 100일 — 규칙 검토 #212 (2026-10-04 "보관 기간을 시즌 길이(약 92일)보다 길게, 예를 들어 100일로")
//    스키마(models/XpLog.js · bot/src/db.js)의 expires 만 바꿔서는 실DB 의 TTL 인덱스가 그대로다 —
//    mongoose 는 옵션이 다른 같은 인덱스를 다시 만들지 못하고(IndexOptionsConflict) 조용히 넘어간다. 그래서 collMod 로 직접 바꾼다.
//    사용법: node --env-file=.env.local scripts/rules-review-botstate-xplog-ttl.mjs           (기본 — 읽기만: 지금 값 · 바꿀 값을 보여 준다)
//            node --env-file=.env.local scripts/rules-review-botstate-xplog-ttl.mjs --apply   (collMod 로 바꾼다)
//    늘리기만 하므로 지워지는 기록은 없다(이미 60일이 지나 지워진 기록은 돌아오지 않는다). 몇 번을 돌려도 같은 결과.
//    ⚠ collMod 는 dbAdmin 권한이 필요하다 — 권한 오류가 나면 Atlas 화면(또는 관리자 계정)에서 같은 명령을 낸다:
//       db.runCommand({ collMod: "xplogs", index: { keyPattern: { createdAt: 1 }, expireAfterSeconds: 8640000 } })
import mongoose from "mongoose";

const COLL = "xplogs"; // mongoose 모델 "XpLog" 의 컬렉션
const FROM_SEC = 60 * 60 * 24 * 60;
const TARGET_SEC = 60 * 60 * 24 * 100;
const apply = process.argv.includes("--apply");
const days = (sec) => `${(sec / 86400).toLocaleString()}일`;

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI 가 없습니다 — node --env-file=.env.local scripts/rules-review-botstate-xplog-ttl.mjs 로 실행하세요.");
  process.exit(1);
}

await mongoose.connect(uri);
try {
  const coll = mongoose.connection.db.collection(COLL);
  const indexes = await coll.indexes();
  const ttl = indexes.find((i) => i.key && Object.keys(i.key).length === 1 && i.key.createdAt === 1);
  const [count, oldest] = await Promise.all([
    coll.estimatedDocumentCount(),
    coll.find({}, { projection: { _id: 0, createdAt: 1 } }).sort({ createdAt: 1 }).limit(1).next(),
  ]);
  console.log(`${COLL} — 약 ${count.toLocaleString()}건, 가장 오래된 기록 ${oldest?.createdAt ? new Date(oldest.createdAt).toISOString() : "없음"}`);

  if (!ttl) {
    console.log(`createdAt 인덱스 없음 → 만들 값: ${days(TARGET_SEC)}(${TARGET_SEC}초)`);
    if (!apply) {
      console.log("읽기만 했습니다. 만들려면 --apply 를 붙여 다시 실행하세요.");
    } else {
      const name = await coll.createIndex({ createdAt: 1 }, { expireAfterSeconds: TARGET_SEC });
      console.log(`만들었습니다: ${name}`);
    }
  } else if (typeof ttl.expireAfterSeconds !== "number") {
    console.log(`createdAt 인덱스(${ttl.name})가 TTL 이 아닙니다 — 이 스크립트는 바꾸지 않습니다. 직접 확인하세요.`);
    process.exitCode = 1;
  } else if (ttl.expireAfterSeconds === TARGET_SEC) {
    console.log(`이미 ${days(TARGET_SEC)}입니다(${ttl.name}). 바꿀 것 없음.`);
  } else {
    console.log(
      `${ttl.name}: 지금 ${days(ttl.expireAfterSeconds)}(${ttl.expireAfterSeconds}초) → 바꿀 값 ${days(TARGET_SEC)}(${TARGET_SEC}초)` +
        (ttl.expireAfterSeconds === FROM_SEC ? "" : " — 예상한 60일과 다릅니다")
    );
    if (!apply) {
      console.log("읽기만 했습니다. 바꾸려면 --apply 를 붙여 다시 실행하세요.");
    } else {
      const res = await mongoose.connection.db.command({ collMod: COLL, index: { name: ttl.name, expireAfterSeconds: TARGET_SEC } });
      console.log("collMod:", JSON.stringify(res));
      const after = (await coll.indexes()).find((i) => i.name === ttl.name);
      console.log(`확인: ${ttl.name} = ${after?.expireAfterSeconds}초`);
      if (after?.expireAfterSeconds !== TARGET_SEC) process.exitCode = 1;
    }
  }
} finally {
  await mongoose.disconnect();
}
