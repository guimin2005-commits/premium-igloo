import mongoose from "mongoose";

const CodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true }, // 코드 값 (대문자 통일)
  reward: { type: String, required: true }, // 사용 시 안내되는 보상 설명
  roleId: { type: String, default: "" },    // (선택) 지급할 디스코드 역할 ID
  requiredRoleId: { type: String, default: "" },   // (선택) 이 역할 소지자만 사용 가능
  requiredRoleName: { type: String, default: "" }, // 표시용 역할 이름
  maxUses: { type: Number, default: 1 },     // 최대 사용 횟수 (0 = 무제한)
  usedBy: { type: [String], default: [] },   // 사용한 유저 닉네임 목록
  isActive: { type: Boolean, default: true }, // 활성화 여부
  expiresAt: { type: Date },                  // (선택) 만료 일시
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Code || mongoose.model("Code", CodeSchema);
