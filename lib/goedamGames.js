// 📌 괴담회 게임 그룹 지원 — 고를 수 있는 게임(2026-10-25 운영자 "게임 이름 적는 게 아니라 선택하는 방식으로 가자" + 다섯 개 지정).
//    화면(app/level/GoedamGroupModal.js 칩)과 서버 확인(lib/goedamGroup.js checkGame)이 이 표 하나를 같이 쓴다 — 서버 쪽 모듈(mongoose)을 화면에 끌어오지 않게 따로 둔다.
//    이름을 바꾸면 이미 만든 그룹의 글자는 그대로 남는다(고치기에서 다시 고르면 새 이름)
export const GROUP_GAMES = ["리썰컴퍼니", "Content Warning", "Dead by Daylight", "Phasmophobia", "마인크래프트 공포탈출맵"];
