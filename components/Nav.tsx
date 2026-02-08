"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useState, useEffect } from "react";
import Link from "next/link";

const navLinks = [
  { label: "Buy", href: "#" },
  { label: "Sell", href: "#" },
  { label: "Your Products", href: "#" },
];

export default function Nav() {
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { scrollY } = useScroll();
  const navBg = useTransform(scrollY, [0, 80], ["rgba(250,250,250,0)", "rgba(250,250,250,0.92)"]);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-xl">
        <nav className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            Listd
          </Link>
          <div className="hidden gap-8 md:flex" />
        </nav>
      </header>
    );
  }

  return (
    <motion.header
      style={{ backgroundColor: navBg }}
      className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-[var(--border)] backdrop-blur-xl"
    >
      <nav className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-xl font-semibold tracking-tight text-[var(--fg)]">
          Listd
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link, i) => (
            <motion.div
              key={link.label}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link
                href={link.href}
                className="text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)]"
              >
                {link.label}
              </Link>
            </motion.div>
          ))}
        </div>

        <button
          type="button"
          className="flex flex-col gap-1.5 md:hidden"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          <span className={`h-0.5 w-6 bg-[var(--fg)] transition-transform ${mobileOpen ? "translate-y-2 rotate-45" : ""}`} />
          <span className={`h-0.5 w-6 bg-[var(--fg)] transition-opacity ${mobileOpen ? "opacity-0" : ""}`} />
          <span className={`h-0.5 w-6 bg-[var(--fg)] transition-transform ${mobileOpen ? "-translate-y-2 -rotate-45" : ""}`} />
        </button>
      </nav>

      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute left-0 right-0 top-16 border-b border-[var(--border)] bg-[var(--bg-elevated)] p-6 md:hidden"
        >
          <div className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-[var(--fg-muted)] hover:text-[var(--fg)]"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </motion.div>
      )}
    </motion.header>
  );
}
