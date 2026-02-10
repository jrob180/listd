"use client";

import { useRef, useState } from "react";

export type ChoiceOption = { label: string; value: string; images?: string[] };

export type ChatInputProps = {
  onSend: (text: string, files?: File[]) => void;
  disabled?: boolean;
  placeholder?: string;
  /** When set, show choice buttons and hide text input for deterministic replies */
  choices?: ChoiceOption[] | null;
};

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type a message…",
  choices = null,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const showChoices = Array.isArray(choices) && choices.length > 0;

  const handleChoice = (value: string) => {
    if (disabled) return;
    onSend(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showChoices) return;
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;
    onSend(trimmed || " ", files.length ? files : undefined);
    setText("");
    setFiles([]);
    setPreviewUrls((urls) => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      return [];
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    const images = selected.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setFiles((prev) => [...prev, ...images].slice(0, 4));
    setPreviewUrls((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      return [...prev, ...images.map((f) => URL.createObjectURL(f))].slice(
        0,
        4
      );
    });
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-sm"
    >
      {showChoices ? (
        <div className="flex flex-wrap gap-2">
          {choices!.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleChoice(opt.value)}
              disabled={disabled}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-[15px] text-[var(--fg)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-50"
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <>
          {previewUrls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {previewUrls.map((url, i) => (
                <div key={url} className="relative">
                  <img
                    src={url}
                    alt=""
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--fg)] text-white text-xs"
                    aria-label="Remove image"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              type="file"
              ref={inputRef}
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-muted)] text-[var(--fg-muted)] hover:bg-[var(--border)] disabled:opacity-50"
              aria-label="Add photo"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </button>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className="min-h-[40px] w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-[15px] text-[var(--fg)] placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={disabled || (text.trim() === "" && files.length === 0)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40"
              aria-label="Send"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </>
      )}
    </form>
  );
}
