"use client";

import Image from "next/image";

export type ChatBubbleProps = {
  message: string;
  isUser: boolean;
  imageUrls?: string[];
  timestamp?: Date;
};

export default function ChatBubble({
  message,
  isUser,
  imageUrls = [],
  timestamp,
}: ChatBubbleProps) {
  return (
    <div
      className={`flex w-full gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
          isUser
            ? "bg-[var(--accent)] text-white"
            : "bg-[var(--bg-muted)] text-[var(--fg-muted)]"
        }`}
      >
        {isUser ? "You" : "Listd"}
      </div>
      <div
        className={`flex max-w-[85%] flex-col gap-2 rounded-2xl px-4 py-3 shadow-sm ${
          isUser
            ? "bg-[var(--accent)] text-white rounded-br-md"
            : "bg-[var(--bg-elevated)] text-[var(--fg)] border border-[var(--border)] rounded-bl-md"
        }`}
      >
        {imageUrls.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {imageUrls.map((src) => (
              <a
                key={src}
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="relative block h-24 w-24 overflow-hidden rounded-lg bg-[var(--bg-muted)]"
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="96px"
                  unoptimized={src.includes("supabase")}
                />
              </a>
            ))}
          </div>
        )}
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
          {message}
        </p>
        {timestamp && (
          <time
            className={`text-xs ${isUser ? "text-white/80" : "text-[var(--fg-subtle)]"}`}
          >
            {timestamp.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        )}
      </div>
    </div>
  );
}
