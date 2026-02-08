"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import PillButton from "@/components/PillButton";

export default function CtaSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      ref={ref}
      className="relative px-4 py-24 sm:px-6 lg:px-8"
      data-qa-section="cta"
    >
      <div className="mx-auto max-w-2xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-card)] p-10 shadow-[var(--shadow)] md:p-14"
        >
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--fg)] sm:text-3xl">
            Get Listd of something
          </h2>
          <p className="mt-3 text-[var(--fg-muted)]">
            Text a photo and we&apos;ll take it from there.
          </p>
          <motion.div
            className="mt-8 flex justify-center"
            initial={{ opacity: 0, y: 8 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <PillButton href="#iphone-messages">list something</PillButton>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
