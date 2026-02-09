import Link from "next/link";
import SellChat from "@/components/SellChat";

export const metadata = {
  title: "Sell | Listd",
  description: "List your item in a few messages.",
};

export default function SellPage() {
  return (
    <div className="flex h-screen flex-col bg-[var(--bg)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-[var(--fg)]"
        >
          Listd
        </Link>
        <Link
          href="/list"
          className="text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          Your list
        </Link>
      </header>
      <main className="min-h-0 flex-1">
        <SellChat />
      </main>
    </div>
  );
}
