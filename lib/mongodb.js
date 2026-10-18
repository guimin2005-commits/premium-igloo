import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI가 설정되지 않았습니다. .env 파일을 확인해주세요.");
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectToDatabase() {
  if (!cached.conn) {
    if (!cached.promise) {
      cached.promise = mongoose.connect(MONGODB_URI).then((mongoose) => {
        return mongoose;
      });
    }
    cached.conn = await cached.promise;
  }
  // 📌 2026-10-18 종류별 효과 문구 — 15초마다 다시 읽는다(lib/effectTemplatesServer). 효과 문구를 만드는 API 가 따로 부르지 않아도 같은 틀.
  //    늦게 불러온다(import 고리 없이) · 실패해도 연결은 그대로
  try {
    const { loadEffectTemplates } = await import("./effectTemplatesServer.js");
    await loadEffectTemplates();
  } catch (e) {
    console.error("효과 문구 불러오기 오류:", e);
  }
  return cached.conn;
}