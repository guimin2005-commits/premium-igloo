"use client";

import React, { useState } from "react";
import { Reveal, LuxStyles } from "../components/Lux";

const Article = ({ title, children }) => (
  <Reveal>
  <section className="relative rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-px">
    <div className="rounded-2xl bg-[#111111]/95 p-6 md:p-8">
      <h2 className="text-base md:text-lg font-black text-white mb-5 tracking-tight flex items-center gap-3">
        <span className="w-1 h-5 bg-[#e91e3f] rounded-full shrink-0"></span>
        {title}
      </h2>
      <div className="text-gray-400 space-y-3 leading-relaxed">{children}</div>
    </div>
  </section>
  </Reveal>
);

const NumberedList = ({ items }) => (
  <ol className="space-y-2.5">
    {items.map((it, i) => (
      <li key={i} className="flex gap-3">
        <span className="text-[#e91e3f] font-black text-xs pt-0.5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
        <span>{it}</span>
      </li>
    ))}
  </ol>
);

const DefList = ({ items }) => (
  <ul className="space-y-2">
    {items.map((it, i) => (
      <li key={i} className="bg-black/30 border border-white/5 rounded-xl p-4 hover:border-white/15 transition-colors">
        <p className="text-white font-bold text-sm mb-1">{it.term}</p>
        <p className="text-gray-500 text-sm leading-relaxed">{it.desc}</p>
      </li>
    ))}
  </ul>
);

const Addendum = ({ date }) => (
  <Reveal>
  <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-5 flex items-center justify-between">
    <h3 className="text-white font-black text-sm tracking-widest">부칙</h3>
    <p className="text-gray-500 text-xs">본 정책은 <span className="text-gray-300 font-bold">{date}</span>부터 시행됩니다.</p>
  </div>
  </Reveal>
);

export default function PolicyPage() {
  const [tab, setTab] = useState("terms");

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      {/* ── HERO ── */}
      <section className="relative w-full pt-16 pb-10 md:pt-24 md:pb-14 px-6">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
        <div className="max-w-4xl mx-auto relative z-10">
          <Reveal>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Terms &amp; Privacy</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tighter leading-tight mb-4">
              <span className="text-white">이용약관 및 </span><span className="lux-shimmer">개인정보처리방침</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed max-w-2xl">본 문서는 서버 이용 시 필요한 권리와 의무, 그리고 개인정보 수집 및 처리 방법에 대한 투명한 안내를 포함하고 있습니다.</p>
          </Reveal>
        </div>
      </section>

      {/* ── 탭 (알약 스타일 · 스티키) ── */}
      <div className="sticky top-16 z-30 w-full px-6 py-3 bg-[#090909]/85 backdrop-blur-xl border-y border-white/5">
        <div className="max-w-4xl mx-auto flex gap-1.5 overflow-x-auto whitespace-nowrap">
          {[{ id: "terms", label: "서버 이용약관 (운영정책)" }, { id: "privacy", label: "개인정보처리방침" }, { id: "tournament", label: "e스포츠 대회 규정" }, { id: "scrim", label: "내전 규정" }].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-5 py-2.5 text-xs md:text-sm font-bold rounded-full shrink-0 outline-none focus:outline-none transition-all duration-300 ${
              tab === t.id
                ? "bg-[#e91e3f] text-white shadow-[0_4px_20px_rgba(233,30,63,0.35)]"
                : "bg-white/[0.04] text-gray-500 hover:text-white hover:bg-white/[0.08] border border-white/5"
            }`}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-4xl mx-auto px-6 py-10 flex-1 flex flex-col">

      {tab === "terms" ? (
        <div className="space-y-4 text-sm">
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

          <Addendum date="2023년 1월 22일" />
        </div>
      ) : tab === "tournament" ? (
        <div className="space-y-4 text-sm">
          <Article title="01. 대회 참가 및 자격 규정">
            <ul className="space-y-2">
              <li>본 대회는 사전 참가 신청을 통해 확정된 인원 및 팀만 참여할 수 있습니다.</li>
              <li>고급 이글루 카카오톡 채팅방 및 디스코드 채널에 모두 참여해야 참가 신청이 가능합니다.</li>
              <li>모든 참가자는 경기 시작 <span className="text-[#e91e3f] font-bold">[15분 전]</span>까지 지정된 디스코드 음성 채널에 접속하여 대기해야 합니다.</li>
              <li>지정된 시간까지 미접속 시 지각 패널티가 부여되며, 경기 시작 시간까지 불참할 경우 기권패(몰수패) 처리 및 향후 이벤트 참여 제한 등 강경한 대응 예정입니다.</li>
              <li>본인 명의의 계정이 아니거나(대리 게임), 본인의 실제 실력보다 현저히 낮은 티어의 계정 참여(양학/부캐), 불법 프로그램(핵) 사용 적발 시 즉시 실격 처리됩니다.</li>
            </ul>
          </Article>

          <Article title="02. 상호 존중 및 스포츠맨십">
            <ul className="space-y-2">
              <li>모든 경기는 상호 존중을 바탕으로 진행하며, 정정당당한 스포츠맨십을 준수해야 합니다.</li>
              <li>경기 중 전체 채팅을 통한 도발, 욕설, 비하 발언 및 상대방에게 불쾌감을 주는 비매너 행위(티배깅 등)를 엄격히 금지합니다.</li>
              <li>규정 위반 시 관리자 판단하에 경고가 부여되며, 경고 누적 또는 사안이 중대할 경우 즉시 실격 및 상금 몰수 처리됩니다.</li>
            </ul>
          </Article>

          <Article title="03. 경기 중단(퍼즈) 및 분쟁 규정">
            <ul className="space-y-2">
              <li>경기 중 인터넷 문제, 튕김(디스콘), 심각한 렉 등이 발생할 경우 즉시 퍼즈(일시정지)를 걸고 관리자를 호출해야 합니다. (팀당 최대 퍼즈 시간 <span className="text-[#e91e3f] font-bold">[10분]</span> 제한)</li>
              <li>경기 중 분쟁 발생 시 선수 간의 직접적인 언쟁을 절대 금합니다. 문제가 있을 시 즉시 경기를 일시 정지하고 관리자를 호출하여 문의를 접수해야 합니다.</li>
              <li>모든 사안의 최종 판결권은 관리자(운영진)에게 있으며, 관리자의 판정에 불응할 시 즉각 제재(실격 처리 등)됩니다.</li>
            </ul>
          </Article>

          <Article title="04. 디스코드 채널 이용 및 화면 공유">
            <ul className="space-y-2">
              <li>대회가 진행되는 동안 모든 참가자는 반드시 지정된 <span className="text-white font-semibold">[대회 전용 팀별 음성 채널]</span>에 접속해 있어야 하며, 마이크를 켜고 소통해야 합니다.</li>
              <li>대리 게임 및 부정행위(방플 등) 방지를 위해 관리자가 경기 중 임의로 디스코드 화면 공유를 요청할 수 있으며, 정당한 사유 없이 이에 불응할 경우 실격 처리될 수 있습니다. (참가자가 아닌 일반 유저들은 모두 해설 방송을 통해 볼 수 있습니다.)</li>
            </ul>
          </Article>

          <Article title="05. 상금 수령 및 취소 규정">
            <ul className="space-y-2">
              <li>상금의 경우, 참가 신청서에 작성한 계좌를 통해 수령하는 것을 원칙으로 합니다. 단, 요청 시 혼선 방지를 위해 대표 1인이 상금을 전액 수령하여 분배 할 수 있습니다.</li>
              <li>대회 종료 후라도 부정한 방법을 통해 대리 게임이나 중대한 규정 위반 사실이 적발될 경우, 해당 팀의 우승은 취소되며 상금 지급은 전면 무효(차순위 팀 양도 또는 환수) 처리됩니다.</li>
            </ul>
          </Article>

          <Addendum date="2026년 6월 23일" />
        </div>
      ) : tab === "privacy" ? (
        <div className="space-y-4 text-sm">
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

          <Reveal>
          <p className="text-gray-400 leading-relaxed text-sm px-1">본 방침은 관련 법령에 의거하여 고급 이글루 서버 내에서 처리되는 이용자의 개인정보 보호 및 권익을 보호하기 위해 수립되었습니다.</p>
          </Reveal>
          <Addendum date="2023년 1월 22일" />
        </div>
      ) : (
        <div className="space-y-4 text-sm">
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

          <Reveal>
          <div className="rounded-2xl border border-[#e91e3f]/15 bg-gradient-to-b from-[#e91e3f]/[0.04] to-transparent p-5">
            <p className="text-gray-400 leading-relaxed text-sm"><span className="text-[#e91e3f] font-bold">[주의]</span> 위 운영 정책 미확인으로 인해 발생하는 불이익이나 제재에 대한 책임은 이용자 본인에게 있습니다.</p>
          </div>
          </Reveal>

          <Addendum date="2026년 4월 16일" />
        </div>
      )}
      </div>
    </main>
  );
}
