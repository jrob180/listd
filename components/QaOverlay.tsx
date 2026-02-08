"use client";

import { useScroll, useTransform } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

export default function QaOverlay() {
  const searchParams = useSearchParams();
  const show = searchParams.get("debug") === "1";
  const { scrollYProgress } = useScroll();
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  if (!show) return null;

  return (
    <>
      <motion.div
        className="qa-scroll-progress"
        style={{ width: progressWidth }}
      />
      <div
        className="pointer-events-none fixed inset-0 z-[9998] qa-baseline opacity-30"
        aria-hidden
      />
    </>
  );
}
