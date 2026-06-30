export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import Apply from "../../../models/Apply";

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const user = searchParams.get("user");
    const admin = searchParams.get("admin");

    let records = [];
    
    if (admin === "true") {
       records = await Apply.find().sort({ createdAt: -1 });
    } else if (user) {
       records = await Apply.find({ discordTag: user }).sort({ createdAt: -1 });
    } else {
       return NextResponse.json({ success: false, error: "파라미터 누락" }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: records }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await connectToDatabase();
    const { id, status } = await request.json();
    const updatedApply = await Apply.findByIdAndUpdate(id, { status }, { new: true });
    return NextResponse.json({ success: true, data: updatedApply });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    
    if (!id) return NextResponse.json({ success: false, error: "ID 누락" }, { status: 400 });
    
    await Apply.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}