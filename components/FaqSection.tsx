"use client";

import { motion, useInView, AnimatePresence } from "framer-motion";
import { useRef, useState } from "react";

const items = [
  {
    id: "how",
    q: "How does Listd work?",
    a: "We create your product profile and list it everywhere buyers are looking. Oh and we handle all the back-and-forth and coordinate pick up.",
  },
  {
    id: "how-long",
    q: "How long does it take to sell something?",
    a: "While we don't have any guarantees, we can usually find a buyer depending on how urgently you're looking to sell it.",
  },
  {
    id: "cost",
    q: "How much does Listd cost?",
    a: "We take a fraction of the selling fee with a max commission stated upfront. You are only charged once the item is sold.",
  },
];

export default function FaqSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section
      ref={ref}
      className="relative px-4 py-20 sm:px-6 lg:px-8"
      data-qa-section="faq"
    >
      <div className="mx-auto max-w-2xl">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center text-2xl font-semibold tracking-tight text-[var(--fg)] sm:text-3xl"
        >
          Got questions? Just ask.
        </motion.h2>

        <div className="mt-12 space-y-2">
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: 0.1 * i, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden"
            >
              <button
                type="button"
                className="flex w-full items-center justify-between px-5 py-4 text-left text-[var(--fg)] transition-colors hover:bg-[var(--bg-muted)]"
                onClick={() => setOpenId(openId === item.id ? null : item.id)}
                aria-expanded={openId === item.id}
              >
                <span className="font-medium">{item.q}</span>
                <span
                  className={`ml-2 shrink-0 text-[var(--fg-muted)] transition-transform duration-200 ${
                    openId === item.id ? "rotate-180" : ""
                  }`}
                >
                  ▼
                </span>
              </button>
              <AnimatePresence>
                {openId === item.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="border-t border-[var(--border)] px-5 py-4 text-[var(--fg-muted)] text-sm leading-relaxed">
                      {item.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
