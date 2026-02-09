"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ChatBubble from "./ChatBubble";
import ChatInput from "./ChatInput";

const SESSION_KEY = "listd_sell_session_id";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `app-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export type MessageRow = {
  id: string;
  direction: "in" | "out";
  body: string;
  imageUrls: string[];
  at: Date;
};

export type ChoiceOption = { label: string; value: string };

export default function SellChat() {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [choices, setChoices] = useState<ChoiceOption[] | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionId = getSessionId();

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = useCallback(
    async (text: string, files?: File[]) => {
      const trimmed = text.trim();
      if (!trimmed && (!files || files.length === 0)) return;

      const localPreviews = (files ?? [])
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, 4)
        .map((f) => URL.createObjectURL(f));

      const userMsg: MessageRow = {
        id: `u-${Date.now()}`,
        direction: "in",
        body: trimmed || "(photo)",
        imageUrls: localPreviews,
        at: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const formData = new FormData();
        formData.set("sessionId", sessionId);
        formData.set("body", trimmed || "");
        if (files?.length) {
          files.forEach((f) => formData.append("files", f));
        }

        const res = await fetch("/api/messaging/send", {
          method: "POST",
          body: formData,
        });

        const data = await res.json().catch(() => ({}));
        const reply: string = data.message ?? data.error ?? "Something went wrong. Please try again.";
        const uploaded: string[] = Array.isArray(data.uploadedMediaUrls) ? data.uploadedMediaUrls : [];
        const nextChoices: ChoiceOption[] | null =
          Array.isArray(data.choices) && data.choices.length > 0 ? data.choices : null;

        // If the API returned permanent storage URLs, replace the local previews
        // so images still work after refresh (and clean up object URLs).
        if (uploaded.length > 0) {
          setMessages((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].id === userMsg.id) {
                localPreviews.forEach((u) => URL.revokeObjectURL(u));
                next[i] = { ...next[i], imageUrls: uploaded };
                break;
              }
            }
            return next;
          });
        }

        const botMsg: MessageRow = {
          id: `b-${Date.now()}`,
          direction: "out",
          body: reply,
          imageUrls: [],
          at: new Date(),
        };
        setMessages((prev) => [...prev, botMsg]);
        setChoices(nextChoices);
      } catch {
        localPreviews.forEach((u) => URL.revokeObjectURL(u));
        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            direction: "out",
            body: "Something went wrong. Please try again.",
            imageUrls: [],
            at: new Date(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [sessionId]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <div className="rounded-full bg-[var(--accent-soft)] p-4">
              <svg
                className="h-10 w-10 text-[var(--accent)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14"
                />
              </svg>
            </div>
            <p className="max-w-sm text-[var(--fg-muted)]">
              Start by saying <strong className="text-[var(--fg)]">I want to sell something</strong> or send a photo of your item.
            </p>
          </div>
        )}
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.map((m) => (
            <ChatBubble
              key={m.id}
              message={m.body}
              isUser={m.direction === "in"}
              imageUrls={m.imageUrls}
              timestamp={m.at}
            />
          ))}
          {loading && (
            <div className="flex w-full gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-muted)] text-[var(--fg-muted)] text-sm font-medium">
                Listd
              </div>
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--fg-subtle)] [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--fg-subtle)] [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--fg-subtle)]" />
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-[var(--border)] bg-[var(--bg)] p-4">
        <div className="mx-auto max-w-2xl">
          <ChatInput
            onSend={sendMessage}
            disabled={loading}
            placeholder="Message…"
            choices={choices}
          />
        </div>
      </div>
    </div>
  );
}
