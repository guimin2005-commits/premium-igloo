// 📌 대회 참가 설문의 개인정보 수집·이용 안내 기본 문구.
//    관리자가 글쓰기 화면에서 "기본 문구 넣기"를 누르면 이 내용이 채워지고,
//    이후 대회 성격에 맞게 자유롭게 고쳐 쓸 수 있다. (저장되는 값은 글마다 따로 보관)

export const DEFAULT_PRIVACY_TITLE = "[중요] 개인정보 수집 및 이용 안내";

export const DEFAULT_PRIVACY_BODY = `• 본 설문을 통해 수집된 개인정보는 상금/상품 발송 및 본인 확인 이외의 목적으로 사용되지 않습니다.
• 수집된 개인정보는 상금/상품 발송 완료 후 7일 이내 즉시 안전하게 파기됩니다.

[개인정보 수집 및 이용 목적 안내]
1. 수집 목적: 대회 참가자 본인 확인, 대진표 작성, 상금 및 상품 발송
2. 수집 항목: 실명, 디스코드 닉네임, 연락처, 게임 닉네임, 계좌번호
3. 보유 및 이용 기간: 대회 종료 및 상금 지급 완료 후 7일 이내 즉시 파기

귀하는 개인정보 수집에 동의하지 않을 권리가 있으나, 미동의 시 대회 참가 및 상금 수령이 제한됩니다.`;

export const DEFAULT_PRIVACY_CONFIRM =
  "본 상금 및 상품 수령을 위한 개인정보 수집 및 이용 안내, 유의사항을 충분히 숙지하였으며 이에 동의합니다.";

export const DEFAULT_PRIVACY = {
  enabled: true,
  title: DEFAULT_PRIVACY_TITLE,
  body: DEFAULT_PRIVACY_BODY,
  confirmLabel: DEFAULT_PRIVACY_CONFIRM,
};
