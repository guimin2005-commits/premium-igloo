"use client";

import React, { useState } from "react";

const Article = ({ title, children }) => (
  <section>
    <h2 className="text-xl font-bold text-white mb-4 border-l-4 border-[#e91e3f] pl-3">{title}</h2>
    <div className="text-gray-400 space-y-3 leading-relaxed">{children}</div>
  </section>
);

const NumberedList = ({ items }) => (
  <ol className="list-decimal pl-5 space-y-2">
    {items.map((it, i) => <li key={i}>{it}</li>)}
  </ol>
);

const DefList = ({ items }) => (
  <ul className="space-y-3">
    {items.map((it, i) => (
      <li key={i} className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
        <p className="text-white font-bold text-sm mb-1">{it.term}</p>
        <p className="text-gray-400 text-sm leading-relaxed">{it.desc}</p>
      </li>
    ))}
  </ul>
);

export default function PolicyPage() {
  const [tab, setTab] = useState("terms");

  return (
    <main className="w-full max-w-4xl mx-auto px-6 py-16 flex-1 flex flex-col">
      <div className="mb-10 border-b border-white/10 pb-6">
        <h1 className="text-4xl font-black text-white mb-3 tracking-tight">이용약관 및 개인정보처리방침</h1>
        <p className="text-gray-400 text-base">본 문서는 서버 이용 시 필요한 권리와 의무, 그리고 개인정보 수집 및 처리 방법에 대한 투명한 안내를 포함하고 있습니다.</p>
      </div>

      <div className="flex gap-2 border-b border-white/10 mb-10 pb-px overflow-x-auto whitespace-nowrap">
        {[{ id: "terms", label: "서버 이용약관 (운영정책)" }, { id: "privacy", label: "개인정보처리방침" }, { id: "scrim", label: "내전 규정" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-6 py-3 text-sm font-bold transition-all border-b-2 outline-none ${tab === t.id ? "border-[#e91e3f] text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "terms" ? (
        <div className="space-y-10 text-sm">
          <Article title="제1조 (목적)">
            <p>본 약관(이하 &lsquo;운영정책&rsquo;)은 디스코드 커뮤니티 서버 &lsquo;고급 이글루&rsquo;를 이용함에 있어, 서버 운영진과 이용자(이하 &lsquo;멤버&rsquo;) 간의 권리와 의무, 책임 사항 및 커뮤니티 이용 규칙을 규정함을 목적으로 합니다.</p>
          </Article>

          <Article title="제2조 (효력 및 변경)">
            <NumberedList items={[
              "본 운영정책은 멤버가 서버에 입장하는 즉시 효력이 발생하며, 입장 시 본 정책에 동의한 것으로 간주합니다.",
              "운영진은 합리적인 사유가 발생할 경우 관련 법령을 위배하지 않는 범위 내에서 본 정책을 개정할 수 있습니다.",
              "정책이 변경될 경우 변경 사항은 최소 7일 전 서버 및 사이트 공지사항을 통해 고지되며, 변경 이후의 서버 이용은 개정된 정책에 동의한 것으로 봅니다.",
            ]} />
          </Article>

          <Article title="제3조 (멤버의 의무 및 금지 행위)">
            <p>모든 멤버는 건전한 커뮤니티 조성을 위해 아래 각 호의 행위를 하여서는 안 됩니다.</p>
            <DefList items={[
              { term: "소란 행위 및 도배", desc: "동일하거나 유사한 메시지·이미지·이모지를 연속으로 게시하여 타인의 대화를 방해하는 행위(소음 테러, 멘션 테러 등 포함)" },
              { term: "불법 및 유해 정보 유포", desc: "성인물, 음란물, 잔혹한 매체, 저작권 침해 자료(불법 프로그램, 크랙 등), 불법 도박 관련 링크를 공유하는 행위" },
              { term: "개인정보 침해", desc: "당사자의 동의 없이 타인의 실명, 사진, 연락처, 주소, SNS 계정 등 사생활 정보를 유포하거나 추적하는 행위" },
              { term: "홍보 및 상업적 활동", desc: "운영진의 사전 승인 없이 타 디스코드 서버 링크, 제품 및 서비스를 홍보하거나 금전 거래를 유도하는 행위" },
              { term: "계정 도용 및 사칭", desc: "타 멤버, 유명인, 인플루언서, 일반인 또는 운영진의 닉네임, 프로필, 역할을 사칭하여 활동하는 행위" },
              { term: "친목질 및 파벌 조성", desc: "특정 멤버들 간의 과도한 사적 친목으로 신규 멤버에게 소외감을 주거나, 서버 내 여론을 조장하여 분란을 일으키는 행위" },
            ]} />
          </Article>

          <Article title="제4조 (이용 제한 및 제재 절차)">
            <p>운영진은 제3조의 금지 행위를 위반한 멤버를 대상으로 조사를 진행할 수 있으며, 위반 경중에 따라 다음과 같은 제재 조치를 취할 수 있습니다.</p>
            <DefList items={[
              { term: "주의 및 경고", desc: "경미한 위반 시 구두 주의 또는 시스템 경고 부여" },
              { term: "타임 아웃(대화 제한)", desc: "일정 시간 동안 채팅 채널 메시지 전송 및 음성 채널 입장 권한 박탈" },
              { term: "추방", desc: "서버에서 강제 퇴장 처리 (재입장 가능)" },
              { term: "차단", desc: "서버에서 영구적으로 강제 퇴장 및 재입장 차단 처리" },
            ]} />
            <p className="text-[#e91e3f] font-medium">※ 중대한 위반(범죄 행위, 서버 테러 등)의 경우, 경고 절차 없이 즉시 영구 차단될 수 있습니다.</p>
          </Article>

          <Article title="제5조 (면책 조항)">
            <NumberedList items={[
              "운영진은 멤버 간의 대화, 거래, 분쟁으로 인해 발생하는 정신적·물질적 손해에 대해 어떠한 책임도 지지 않습니다.",
              "운영진은 디스코드 플랫폼 자체의 장애, 해킹, 서버 점검 등으로 인해 발생하는 서비스 중단에 대해 책임을 지지 않습니다.",
              "본인의 디스코드 계정 관리 소홀로 인해 발생하는 피해는 본인에게 책임이 있습니다.",
            ]} />
          </Article>
        </div>
      ) : tab === "privacy" ? (
        <div className="space-y-10 text-sm">
          <p className="text-gray-300 leading-relaxed">본 방침은 관련 법령에 의거하여 고급 이글루 서버 내에서 처리되는 이용자의 개인정보 보호 및 권익을 보호하기 위해 수립되었습니다.</p>

          <Article title="제1조 (개인정보의 수집 항목 및 방법)">
            <p>본 서버는 디스코드 플랫폼 위에서 운영되므로 멤버의 민감한 개인정보(주민등록번호, 금융정보 등)를 직접 수집하지 않습니다. 다만, 서비스 운영을 위해 아래의 정보가 자동으로 기록되거나 수집될 수 있습니다.</p>
            <DefList items={[
              { term: "수집 항목", desc: "디스코드 고유 ID(Snowflake), 디스코드 닉네임 및 사용자명(Username), 프로필 이미지, 서버 내 텍스트/음성 활동 로그, 입장 및 퇴장 일시, 보유 역할(Role) 정보" },
              { term: "수집 방법", desc: "디스코드 API 및 서버 관리용 봇(Bot)을 통한 자동 수집" },
            ]} />
          </Article>

          <Article title="제2조 (개인정보의 이용 목적)">
            <p>수집된 정보는 다음의 목적 이외의 용도로는 사용되지 않으며, 이용 목적이 변경될 시에는 사전에 공지합니다.</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>서버 내 멤버 식별 및 본인 확인</li>
              <li>악성 유저 방지, 운영정책 위반 행위 조사 및 제재(보안 목적)</li>
              <li>서버 내 이벤트 진행 및 보상 지급</li>
              <li>멤버 현황 통계 분석 및 서비스 개선</li>
            </ul>
          </Article>

          <Article title="제3조 (개인정보의 보유 및 파기 기간)">
            <p>멤버가 서버를 자발적으로 탈퇴하거나 추방당한 경우, 해당 멤버의 서버 내 프로필 정보는 즉시 파기됩니다. 단, 디스코드 플랫폼 특성상 기존에 작성한 텍스트 메시지는 남아있을 수 있습니다.</p>
            <p><span className="text-[#e91e3f] font-bold">예외 조항:</span> 운영정책 위반으로 인해 영구 차단된 유저의 디스코드 고유 ID 및 차단 사유는, 재입장 방지 및 서버 보안을 위해 서버가 존속하는 한 영구 보관됩니다.</p>
          </Article>

          <Article title="제4조 (이용자의 권리와 의무)">
            <NumberedList items={[
              "멤버는 언제든지 서버를 탈퇴함으로써 개인정보 제공 동의를 철회할 수 있습니다.",
              "본인이 작성한 메시지의 삭제를 원할 경우 직접 삭제해야 하며, 탈퇴 후에는 계정 식별이 불가능하여 운영진이 대신 삭제해 드릴 수 없습니다.",
              "서버 내 대화나 DM(다이렉트 메시지)을 통해 자신의 실명, 연락처 등 민감한 개인정보를 스스로 노출하지 않도록 주의해야 하며, 본인의 부주의로 발생한 정보 유출에 대한 책임은 본인에게 있습니다.",
            ]} />
          </Article>

          <Article title="제5조 (개인정보 보호 책임자 안내)">
            <p>본 서버의 개인정보 관련 문의 및 운영정책 위반 신고는 아래의 창구를 이용해 주시기 바랍니다.</p>
            <p><span className="text-white font-bold">문의:</span> 고급 이글루 공식 사이트의 문의 카테고리 이용</p>
          </Article>

          <div className="pt-6 border-t border-white/10">
            <h3 className="text-white font-bold mb-2">부칙</h3>
            <p className="text-gray-400">본 정책은 2025년 6월 24일부터 시행됩니다.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-10 text-sm">
          <p className="text-gray-300 leading-relaxed">내전을 자유롭고 쾌적하게 즐기기 위한 운영 규정입니다. 내전 채널 이용 권한 획득 시 아래 규정에 동의한 것으로 간주합니다.</p>

          <Article title="제1조 (참여 규정)">
            <p>모든 인원은 내전을 자유롭게 주최 및 참여할 수 있습니다. 참가 확정 인원은 지정된 시간을 엄수해야 하며, 무단 불참이나 상습적인 지각 시에는 참여 권한이 제한될 수 있습니다.</p>
          </Article>

          <Article title="제2조 (상호 존중 및 매너 준수)">
            <p>모든 내전은 상호 존중을 바탕으로 진행하며, 상대방에게 불쾌감을 주는 행위(비하 발언, 티배깅 등)를 엄격히 금지합니다.</p>
          </Article>

          <Article title="제3조 (분쟁 규정)">
            <p>분쟁 발생 시 직접 대응을 금하며, 반드시 웹사이트의 <span className="text-white font-semibold">문의</span> 채널을 통해 접수해야 합니다. 모든 사안은 관리자 판단 하에 검토되며, 규정 위반 시 즉각 제재됩니다.</p>
          </Article>

          <Article title="제4조 (채널 이용)">
            <p>내전은 반드시 지정된 <span className="text-white font-semibold">내전 전용 음성 채널</span>에서만 진행해야 하며, 내전 목적 외 해당 채널의 사적 이용은 제한됩니다.</p>
          </Article>

          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
            <p className="text-gray-400 leading-relaxed"><span className="text-[#e91e3f] font-bold">[주의]</span> 위 운영 정책 미확인으로 인해 발생하는 불이익이나 제재에 대한 책임은 이용자 본인에게 있습니다.</p>
          </div>
        </div>
      )}
    </main>
  );
}
