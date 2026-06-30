import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Post from "@/models/Post";

// 📌 1. 수정할 때 기존 데이터를 입력창에 불러오는 기능
export async function GET(request, { params }) {
  try {
    await connectToDatabase();
    // Next.js 14/15 버전을 둘 다 안전하게 지원하기 위해 await를 적용합니다.
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const post = await Post.findById(id);
    if (!post) return NextResponse.json({ error: "존재하지 않는 글입니다." }, { status: 404 });
    return NextResponse.json({ success: true, data: post }, { status: 200 });
  } catch (error) {
    console.error("수정 데이터 로드 에러:", error);
    return NextResponse.json({ error: "데이터 로드 실패" }, { status: 500 });
  }
}

// 📌 2. 글 수정 완료 버튼을 눌렀을 때 실행되는 기능 (PUT)
export async function PUT(request, { params }) {
  try {
    await connectToDatabase();
    const resolvedParams = await params;
    const { id } = resolvedParams;
    
    const body = await request.json();
    const updatedPost = await Post.findByIdAndUpdate(id, body, { new: true });
    
    return NextResponse.json({ success: true, data: updatedPost }, { status: 200 });
  } catch (error) {
    console.error("게시글 수정 에러:", error);
    return NextResponse.json({ error: "게시글 수정 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// 📌 3. 삭제 팝업에서 '삭제하기'를 눌렀을 때 실행되는 기능 (DELETE)
export async function DELETE(request, { params }) {
  try {
    await connectToDatabase();
    const resolvedParams = await params;
    const { id } = resolvedParams;

    await Post.findByIdAndDelete(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("게시글 삭제 에러:", error);
    return NextResponse.json({ error: "게시글 삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}