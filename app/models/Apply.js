import mongoose from "mongoose";

const ApplySchema = new mongoose.Schema({
  discordTag: { type: String, required: true },
  position: { type: String, required: true },
  age: { type: Number, required: true },
  intro: { type: String, required: true },
  experience: { type: String, default: "" },
  status: { type: String, default: "심사 중" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Apply || mongoose.model("Apply", ApplySchema);