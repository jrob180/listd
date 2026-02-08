"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import IphoneMessagesSection from "@/components/IphoneMessagesSection";
import FaqSection from "@/components/FaqSection";
import CtaSection from "@/components/CtaSection";
import QaOverlay from "@/components/QaOverlay";

function SectionWrapper({
  children,
  id,
  className = "",
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const debug = searchParams.get("debug") === "1";

  return (
    <div
      id={id}
      className={`relative ${debug ? "qa-section-outline" : ""} ${className}`}
      data-qa-section={id}
    >
      {children}
    </div>
  );
}

function PageContent() {
  const searchParams = useSearchParams();
  const debug = searchParams.get("debug") === "1";

  return (
    <>
      <QaOverlay />
      <Nav />
      <main>
        <SectionWrapper>
          <Hero />
        </SectionWrapper>
        <SectionWrapper id="iphone-messages">
          <IphoneMessagesSection debug={debug} />
        </SectionWrapper>
        <SectionWrapper id="faq">
          <FaqSection />
        </SectionWrapper>
        <SectionWrapper id="cta">
          <CtaSection />
        </SectionWrapper>
      </main>
    </>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <PageContent />
    </Suspense>
  );
}
