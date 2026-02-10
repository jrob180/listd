"use client";

import { useEffect, useRef, useState } from "react";

export type ChatBubbleProps = {
  message: string;
  isUser: boolean;
  imageUrls?: string[];
  timestamp?: Date;
  /** Optional callback when all images for this bubble fail to load. */
  onAllImagesFailed?: () => void;
};

export default function ChatBubble(props: ChatBubbleProps) {
  const { message, isUser, imageUrls: rawImages = [], timestamp, onAllImagesFailed } = props;
  const validImages = rawImages.filter(
    (u) => typeof u === "string" && u.trim() !== "",
  );

  const [index, setIndex] = useState(0);
  const [allFailed, setAllFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const failedIndices = useRef<Set<number>>(new Set());
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  const hasImages = validImages.length > 0 && !allFailed;
  const safeIndex = hasImages ? Math.min(index, validImages.length - 1) : 0;
  const currentSrc = hasImages ? validImages[safeIndex] : null;

  // Fade/slide in the bubble once when it first comes into view (iMessage-style)
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  const goPrev = () => {
    if (!hasImages) return;
    setIndex((i) => (i === 0 ? validImages.length - 1 : i - 1));
  };

  const goNext = () => {
    if (!hasImages) return;
    setIndex((i) => (i === validImages.length - 1 ? 0 : i + 1));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const threshold = 40;
    if (deltaX > threshold) goPrev();
    else if (deltaX < -threshold) goNext();
    touchStartX.current = null;
  };

  return (
    <div
      ref={bubbleRef}
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`flex max-w-[78%] sm:max-w-[70%] flex-col gap-1 rounded-2xl text-[15px] leading-snug shadow-sm transition-all duration-200 ease-out ${
          isUser
            ? "bg-[#007AFF] text-white rounded-br-md"
            : "bg-[#EFEFEF] text-[#111] rounded-bl-md"
        } ${
          hasImages && message.trim() === "(photo)"
            ? "p-0 overflow-hidden"
            : "px-3 py-2"
        } ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}
      >
        {!(hasImages && message.trim() === "(photo)") && (
          <p className="whitespace-pre-wrap">
            {message}
          </p>
        )}

        {hasImages && currentSrc && (
          <div className="flex flex-col items-center gap-2">
            <div
              className="relative w-full max-w-xs sm:max-w-sm"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <a
                href={currentSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-xl bg-[var(--bg-muted)]"
              >
                {!isUser && validImages.length > 1 && (
                  <div className="absolute left-2 top-2 z-10 rounded-md bg-black/70 px-2 py-0.5 text-[11px] text-white">
                    {safeIndex + 1} / {validImages.length}
                  </div>
                )}
                <img
                  src={currentSrc}
                  alt=""
                  className="h-56 w-full object-contain bg-[var(--bg-muted)] sm:h-64"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    failedIndices.current.add(safeIndex);

                    // Try to advance to the next non‑failed image.
                    if (validImages.length > 1) {
                      let next = safeIndex;
                      let attempts = 0;
                      while (attempts < validImages.length) {
                        next = (next + 1) % validImages.length;
                        if (!failedIndices.current.has(next)) {
                          setIndex(next);
                          return;
                        }
                        attempts += 1;
                      }
                    }

                    // All images appear to be failing.
                    setAllFailed(true);
                    if (typeof onAllImagesFailed === "function" && !isUser) {
                      onAllImagesFailed();
                    }
                  }}
                />
              </a>

              {validImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-1 text-xs text-white shadow-sm hover:bg-black/75 focus:outline-none"
                    aria-label="Previous photo"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-1 text-xs text-white shadow-sm hover:bg-black/75 focus:outline-none"
                    aria-label="Next photo"
                  >
                    ›
                  </button>
                </>
              )}
            </div>

          </div>
        )}

        
      </div>
    </div>
  );
}
