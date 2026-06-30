import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Post from "@/models/Post";

// 📌 1. 창고에서 글 불러오기 (진열대용)
export async function GET(request) {
  try {
    await connectToDatabase();
    
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    let query = {};
    if (category) {
      query.category = category;
    }

    const posts = await Post.find(query).sort({ createdAt: -1 });

    return NextResponse.json({ success: true, data: posts }, { status: 200 });
  } catch (error) {
    console.error("조회 에러:", error);
    return NextResponse.json({ error: "게시글을 불러오지 못했습니다." }, { status: 500 });
  }
}

// 📌 2. 창고에 글 밀어넣기 (작성용)
export async function POST(request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    
    // 💡 화면에서 보낸 모든 데이터(eventPeriod, recruitSubCategory 포함)를 
    // 하나도 누락 없이 통째로 몽고DB에 생성합니다!
    const newPost = await Post.create(body);
    
    return NextResponse.json({ success: true, data: newPost }, { status: 200 });
  } catch (error) {
    console.error("업로드 에러:", error);
    return NextResponse.json({ error: "서버 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}