import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Honor from "@/models/Honor";

export async function GET() {
  try {
    await connectToDatabase();
    const honors = await Honor.find().sort({ createdAt: -1 });
    return NextResponse.json({ success: true, data: honors });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    if (!body.title?.trim() || !body.winner?.trim()) {
      return NextResponse.json({ success: false, message: "제목과 우승자는 필수입니다." }, { status: 400 });
    }
    const honor = await Honor.create(body);
    return NextResponse.json({ success: true, data: honor });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    if (!body.id) return NextResponse.json({ success: false }, { status: 400 });
    const { id, ...fields } = body;
    const honor = await Honor.findByIdAndUpdate(id, fields, { new: true });
    return NextResponse.json({ success: true, data: honor });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false }, { status: 400 });
    await Honor.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
