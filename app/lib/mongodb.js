import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("환경 변수 파일(.env.local 등)에 MONGODB_URI를 정의해주세요.");
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    // 연결 한도 — lib/mongodb.js 와 같다(2026-10-25 Atlas 500 한도에 닿음). 같은 global.mongoose 캐시를 쓴다
    const opts = {
      bufferCommands: false,
      maxPoolSize: 8,
      minPoolSize: 0,
      maxIdleTimeMS: 15_000,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }
  
  // 실패한 연결을 붙들고 있지 않는다(lib/mongodb.js 와 같다) — 다음 요청이 다시 붙는다
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
  return cached.conn;
}