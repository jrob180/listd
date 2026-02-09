"use client";

import { motion } from "framer-motion";

type PillButtonProps = {
  children?: React.ReactNode;
  href?: string;
  className?: string;
  as?: "button" | "a";
  type?: "button" | "submit";
  target?: string;
  rel?: string;
  onClick?: () => void;
};

/* Speech bubble icon (Bootstrap Icons chat-fill, MIT). Transparent background, white fill. */
const SpeechBubbleIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 16 16"
    fill="white"
    className="shrink-0"
    aria-hidden
  >
    <path d="M8 15c4.418 0 8-3.134 8-7s-3.582-7-8-7-8 3.134-8 7c0 1.76.743 3.37 1.97 4.6-.097 1.016-.417 2.13-.771 2.966-.079.186.074.394.273.362 2.256-.37 3.597-.938 4.18-1.234A9 9 0 0 0 8 15" />
  </svg>
);

export default function PillButton({
  children = "list something",
  href = "#",
  className = "",
  as = "a",
  type = "button",
  target,
  rel,
  onClick,
}: PillButtonProps) {
  const baseClass =
    "inline-flex items-center gap-3 rounded-[1.25rem] bg-[#efefef] px-5 py-3 text-[0.8125rem] font-medium leading-[1.35] text-[#111] border border-[rgba(0,0,0,0.06)] transition-opacity hover:opacity-90 active:opacity-95";

  const content = (
    <>
      {/* Rounded-square green icon with glossy gradient (reference image) */}
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.25)]"
        style={{
          background:
            "linear-gradient(145deg, #4ade80 0%, #34C759 50%, #2dba4e 100%)",
        }}
      >
        <SpeechBubbleIcon />
      </span>
      <span>{children}</span>
    </>
  );

  if (as === "a") {
    return (
      <motion.a
        href={href}
        className={`${baseClass} ${className}`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        target={target}
        rel={rel}
        onClick={onClick}
      >
        {content}
      </motion.a>
    );
  }

  return (
    <motion.button
      type={type}
      className={`${baseClass} ${className}`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
    >
      {content}
    </motion.button>
  );
}
