"use client";

import { motion } from "framer-motion";
import PillButton from "@/components/PillButton";

const PREFILL_BODY = "i want to sell something";

function toWhatsAppNumber(e164: string): string {
  return e164.replace(/\D/g, "");
}

function getWhatsAppHref(phoneNumber: string): string {
  const num = toWhatsAppNumber(phoneNumber);
  const text = encodeURIComponent(PREFILL_BODY);
  return `https://wa.me/${num}?text=${text}`;
}

export default function Hero() {
  const phoneNumber =
    process.env.NEXT_PUBLIC_LISTD_PHONE_NUMBER || "+14155238886";
  const whatsAppHref = getWhatsAppHref(phoneNumber);

  return (
    <section className="relative flex min-h-[85vh] flex-col items-center justify-center px-4 pt-24 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl text-center">
        <motion.h1
          className="text-4xl font-semibold leading-[1.1] tracking-tight text-[var(--fg)] sm:text-5xl md:text-6xl lg:text-7xl"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          Sell with a text.
        </motion.h1>
        <motion.p
          className="mt-6 text-lg text-[var(--fg-muted)] sm:text-xl md:text-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
        >
          We make selling easier than buying.
        </motion.p>
        <motion.div
          className="mt-10 flex justify-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
        >
          <PillButton
            href={whatsAppHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            list something
          </PillButton>
        </motion.div>
      </div>
    </section>
  );
}

