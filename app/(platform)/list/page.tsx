import PillButton from "@/components/PillButton";

export default function ListPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="text-2xl font-semibold text-[var(--fg)]">
        List something
      </h1>
      <p className="mt-2 text-center text-[var(--fg-muted)]">
        Open the in-app chat and we&apos;ll guide you through listing.
      </p>
      <div className="mt-8">
        <PillButton href="/sell">List something</PillButton>
      </div>
    </main>
  );
}
