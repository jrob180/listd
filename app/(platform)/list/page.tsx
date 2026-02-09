"use client";

import { useState, useCallback } from "react";
import PillButton from "@/components/PillButton";

const PREFILL_BODY = "i want to sell something";

/** E.164 (e.g. +447476971486) to wa.me number (447476971486) */
function toWhatsAppNumber(e164: string): string {
  return e164.replace(/\D/g, "");
}

function getWhatsAppHref(phoneNumber: string): string {
  const num = toWhatsAppNumber(phoneNumber);
  const text = encodeURIComponent(PREFILL_BODY);
  return `https://wa.me/${num}?text=${text}`;
}

const PLACEHOLDER_NUMBER = "+15551234567";

export default function ListPage() {
  const [copied, setCopied] = useState(false);
  const envNumber = process.env.NEXT_PUBLIC_LISTD_PHONE_NUMBER?.trim();
  const phoneNumber = envNumber && envNumber !== "" ? envNumber : null;
  const isConfigured = phoneNumber != null && phoneNumber !== PLACEHOLDER_NUMBER;
  const whatsAppHref = phoneNumber ? getWhatsAppHref(phoneNumber) : "#";

  const handleClick = useCallback(() => {
    navigator.clipboard.writeText(PREFILL_BODY).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="text-2xl font-semibold text-[var(--fg)]">
        List something
      </h1>
      <p className="mt-2 text-center text-[var(--fg-muted)]">
        We&apos;ll guide you over WhatsApp. Tap below to open WhatsApp and send
        the first message.
      </p>
      <div className="mt-8">
        {isConfigured ? (
          <PillButton
            as="a"
            href={whatsAppHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            List something
          </PillButton>
        ) : (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-5 py-4 text-center text-sm text-[var(--fg-muted)]">
            <p className="font-medium text-[var(--fg)]">
              WhatsApp number not configured
            </p>
            <p className="mt-1">
              Set <code className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-xs">NEXT_PUBLIC_LISTD_PHONE_NUMBER</code> in{" "}
              <code className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-xs">.env.local</code> to your Twilio WhatsApp number (e.g. sandbox <code className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-xs">+14155238886</code>), then restart the dev server.
            </p>
          </div>
        )}
      </div>
      {isConfigured && (
        <div className="mt-6 max-w-sm rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center text-sm text-[var(--fg-muted)]">
          {copied ? (
            <p>Copied &quot;{PREFILL_BODY}&quot; to clipboard.</p>
          ) : (
            <p>
              Or copy the message and open{" "}
              <a
                href={whatsAppHref}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--fg)] underline"
              >
                WhatsApp
              </a>{" "}
              to chat with {phoneNumber}.
            </p>
          )}
          <button
            type="button"
            onClick={handleClick}
            className="mt-2 text-xs underline hover:no-underline"
          >
            Copy message
          </button>
        </div>
      )}
    </main>
  );
}
