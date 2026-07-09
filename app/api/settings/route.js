export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Setting from "@/models/Setting";

export async function GET() {
  try {
    await connectToDatabase();
    const maintenance = await Setting.findOne({ key: "maintenance" }).lean();
    return NextResponse.json({ success: true, maintenance: !!maintenance?.value });
  } catch (e) {
    return NextResponse.json({ success: true, maintenance: false });
  }
}

export async function POST(request) {
  try {
    await connectToDatabase();
    const { maintenance } = await request.json();
    await Setting.findOneAndUpdate(
      { key: "maintenance" },
      { value: !!maintenance, updatedAt: new Date() },
      { upsert: true }
    );
    return NextResponse.json({ success: true, maintenance: !!maintenance });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
