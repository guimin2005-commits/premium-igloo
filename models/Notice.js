import mongoose from "mongoose";

// DB 연결 로직
const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return;
  // .env 파일에 넣을 MongoDB 주소를 불러옵니다
  await mongoose.connect(process.env.MONGODB_URI);
};

// 공지사항 데이터 구조(스키마)
const NoticeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  isImportant: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  date: { type: String, default: () => new Date().toLocaleDateString('ko-KR') }
});

const Notice = mongoose.models.Notice || mongoose.model("Notice", NoticeSchema);

export { connectDB, Notice };