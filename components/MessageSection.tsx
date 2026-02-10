"use client";

import {
  motion,
  useInView,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { useRef } from "react";
import Image from "next/image";

const messages = [
  { id: 1, from: "user", text: "Sell my sneakers" },
  { id: 2, from: "agent", text: "Can you send me some photos?" },
  { id: 3, from: "user", image: true },
  {
    id: 4,
    from: "agent",
    text: "Sweet! I'll handle listing and selling them for you.",
  },
  {
    id: 5,
    from: "agent",
    text: "How much do you think they're worth?",
  },
  {
    id: 6,
    from: "user",
    text: "Those would go for at least $60, but I'll do my best!",
    readTime: "Read 9:42 AM",
  },
  {
    id: 7,
    from: "agent",
    text:
      "Found a buyer for $70. We will come pick it up this Saturday between 10-12. Does that work?",
  },
];

const SNEAKER_IMAGE = "/jordan1s.jpg";

export default function MessageSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"],
  });

  const rotateX = useTransform(
    scrollYProgress,
    [0, 0.5],
    reduceMotion ? [0, 0] : [72, 0]
  );
  const opacity = useTransform(scrollYProgress, [0, 0.25], [0.4, 1]);

  return (
    <section
      ref={ref}
      className="relative px-4 py-24 sm:px-6 lg:px-8"
      data-qa-section="message"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10 flex flex-wrap items-center justify-center gap-3 text-sm text-[var(--fg-muted)]"
        >
          <span>Buy</span>
          <span>Sell</span>
          <span>Your Products</span>
        </motion.div>

        {/* Phone: starts flat (on table), pronates up to face user as you scroll */}
        <div
          className="relative flex justify-center w-full max-w-[300px] sm:max-w-[340px] mx-auto"
          style={{ perspective: "1400px" }}
        >
          <motion.div
            className="relative w-full origin-bottom"
            style={{
              rotateX,
              opacity,
              transformStyle: "preserve-3d",
              backfaceVisibility: "hidden",
            }}
          >
            {/* iPhone frame image (straight-on, perfect frame + Dynamic Island) */}
            <div className="relative w-full aspect-[9/19] max-h-[600px] select-none">
              <Image
                src="/iphone-frame.png"
                alt=""
                fill
                className="object-contain object-center pointer-events-none"
                sizes="(max-width: 640px) 300px, 340px"
                priority
              />
              {/* Chat overlay: positioned over the screen area of the frame */}
              <div
                className="absolute left-[7%] right-[7%] top-[12%] bottom-[8%] overflow-hidden rounded-[2rem] bg-white"
                aria-hidden
              >
                <div className="flex h-full flex-col text-black">
                  {/* Status bar */}
                  <div className="flex shrink-0 items-center justify-between px-4 pt-2 pb-0.5 text-[10px] sm:text-xs">
                    <span className="font-medium">9:41</span>
                    <div className="flex items-center gap-0.5 opacity-90">
                      <span>•••</span>
                      <span className="text-green-600">🔋</span>
                    </div>
                  </div>
                  {/* Header */}
                  <div className="shrink-0 border-b border-gray-200/80 px-3 pb-2 pt-0 text-center">
                    <p className="font-semibold text-sm sm:text-base">Listd</p>
                    <p className="text-[10px] sm:text-xs text-gray-500">
                      San Francisco, CA
                    </p>
                  </div>
                  {/* Messages */}
                  <div className="min-h-0 flex-1 px-2 py-3 flex flex-col justify-end space-y-1.5 overflow-hidden">
                    {messages.map((msg, i) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, x: msg.from === "user" ? 6 : -6 }}
                        animate={inView ? { opacity: 1, x: 0 } : {}}
                        transition={{
                          duration: 0.3,
                          ease: [0.16, 1, 0.3, 1],
                          delay: 0.2 + i * 0.05,
                        }}
                        className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[88%] rounded-2xl text-[13px] leading-snug sm:text-[14px] ${
                            msg.image
                              ? "p-0 overflow-hidden"
                              : "px-2.5 py-1.5"
                          } ${
                            msg.from === "user"
                              ? "rounded-br-md bg-[#007AFF] text-white"
                              : "rounded-bl-md bg-[#EFEFEF] text-gray-900"
                          }`}
                        >
                          {msg.image ? (
                            <div
                                className={`relative w-full aspect-[4/3] min-w-[8rem] overflow-hidden rounded-2xl ${
                                  msg.from === "user"
                                    ? "rounded-br-md"
                                    : "rounded-bl-md"
                                }`}
                              >
                              <Image
                                src={SNEAKER_IMAGE}
                                alt="Sneaker"
                                fill
                                className="object-cover"
                                sizes="180px"
                                unoptimized
                              />
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                          )}
                          {"readTime" in msg && msg.readTime && (
                            <p className="mt-0.5 text-right text-[10px] text-blue-200 sm:text-[11px]">
                              {msg.readTime}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.9, duration: 0.4 }}
          className="mt-10 text-center text-sm text-[var(--fg-subtle)]"
        >
          text a photo · agent research · pick up
        </motion.p>
      </div>
    </section>
  );
}
