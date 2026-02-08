"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import styles from "@/styles/iphone-messages.module.css";

gsap.registerPlugin(ScrollTrigger);

export type BubbleStep = {
  from: "user" | "agent";
  text?: string;
  image?: true;
};

export type MessageStep = {
  headline: string;
  body: string;
  bubbles: BubbleStep[];
};

const STEPS: MessageStep[] = [
  {
    headline: "Tell us what you're looking to sell.",
    body: "Start with a text or a photo—we'll take it from there.",
    bubbles: [
      { from: "user", text: "Sell my sneakers" },
      { from: "agent", text: "Can you send me some photos?" },
    ],
  },
  {
    headline: "We'll ask for a few more details.",
    body: "Photos, condition, and any extra info we need.",
    bubbles: [
      { from: "user", image: true },
      {
        from: "agent",
        text: "Sweet! I'll handle listing and selling them for you.",
      },
    ],
  },
  {
    headline: "We'll handle the rest.",
    body: "Your listing, negotiating with buyers, and more.",
    bubbles: [
      { from: "user", text: "How much do you think they're worth?" },
      {
        from: "agent",
        text: "Those would go for at least $60, but I'll do my best!",
      },
    ],
  },
  {
    headline: "You ship the item and get paid.",
    body: "Ship it out and we'll get you paid.",
    bubbles: [
      {
        from: "agent",
        text: "Found a buyer for $70. We will come pick it up this Saturday between 10-12. Does that work?",
      },
    ],
  },
];

const SNEAKER_IMAGE = "/jordan1s.jpg";

const BUBBLE_ENTER_DURATION = 0.35;
const BUBBLE_EASE = "back.out(1.6)";
const TYPING_FADE_DURATION = 0.2;
const TYPING_PULSE_LOW = 0.35;
const TYPING_PULSE_HIGH = 1;
const COPY_FADE_DURATION = 0.4;
const COPY_EASE = "sine.inOut";
const COPY_Y_OFFSET = -4;
const THREAD_SCROLL_PER_BUBBLE = -14;
const AUTO_PLAY_START_DELAY = 0; /* seconds after section in view before first bubble */
const INTER_BUBBLE_DELAY = 2; /* seconds between any two consecutive messages (user or agent) */

type Props = { debug?: boolean };

export default function IphoneMessagesSection({ debug = false }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef<HTMLDivElement>(null);
  const bubbleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const copyStepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const allBubbles = STEPS.flatMap((s) => s.bubbles);

  useEffect(() => {
    const section = sectionRef.current;
    const phone = phoneRef.current;
    const messagesContent = messagesContentRef.current;
    const typing = typingRef.current;
    const bubbles = bubbleRefs.current.filter(Boolean) as HTMLDivElement[];
    const copySteps = copyStepRefs.current.filter(Boolean) as HTMLDivElement[];

    if (
      !section ||
      !phone ||
      !messagesContent ||
      !typing ||
      bubbles.length !== allBubbles.length ||
      copySteps.length !== STEPS.length
    ) {
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ paused: true });

      let t = AUTO_PLAY_START_DELAY;

      tl.set(typing, { opacity: 0 });
      tl.set(bubbles, {
        opacity: 0,
        x: (i: number) => (allBubbles[i].from === "user" ? 24 : -24),
        scale: 0.98,
      });
      tl.set(copySteps[0], { opacity: 1, y: 0 });
      copySteps.forEach((el, i) => {
        if (i > 0) tl.set(el, { opacity: 0, y: COPY_Y_OFFSET });
      });
      tl.set(messagesContent, { y: 0 });

      const stepEndTimes: number[] = [];
      let bubbleIndex = 0;
      for (let stepIndex = 0; stepIndex < STEPS.length; stepIndex++) {
        const step = STEPS[stepIndex];
        const stepBubbles = step.bubbles;

        for (let bi = 0; bi < stepBubbles.length; bi++) {
          const idx = bubbleIndex + bi;
          const isFirstInStep = bi === 0;

          if (isFirstInStep) {
            tl.to(typing, {
              opacity: TYPING_PULSE_HIGH,
              duration: TYPING_FADE_DURATION,
              ease: "power2.out",
            }, t);
            tl.to(typing, { opacity: TYPING_PULSE_LOW, duration: 0.15 }, t + 0.045);
            tl.to(typing, { opacity: TYPING_PULSE_HIGH, duration: 0.15 }, t + 0.09);
            t += 0.12;
          }

          const bubbleEnterFrom = t;
          tl.to(bubbles[idx], {
            opacity: 1,
            x: 0,
            scale: 1,
            duration: BUBBLE_ENTER_DURATION,
            ease: BUBBLE_EASE,
            overwrite: true,
          }, bubbleEnterFrom);

          if (isFirstInStep) {
            tl.to(typing, {
              opacity: 0,
              duration: TYPING_FADE_DURATION,
              ease: "power2.out",
            }, bubbleEnterFrom + 0.01);
          }

          const yOffset = (idx + 1) * THREAD_SCROLL_PER_BUBBLE;
          tl.to(
            messagesContent,
            {
              y: yOffset,
              duration: BUBBLE_ENTER_DURATION,
              ease: "power2.out",
            },
            bubbleEnterFrom
          );
          t = bubbleEnterFrom + BUBBLE_ENTER_DURATION + INTER_BUBBLE_DELAY;
        }
        bubbleIndex += stepBubbles.length;

        /* Swap to next step’s copy after this step’s bubbles are on screen */
        if (stepIndex < STEPS.length - 1) {
          tl.to(copySteps[stepIndex], {
            opacity: 0,
            y: COPY_Y_OFFSET,
            duration: COPY_FADE_DURATION,
            ease: COPY_EASE,
          }, t);
          tl.to(copySteps[stepIndex + 1], {
            opacity: 1,
            y: 0,
            duration: COPY_FADE_DURATION,
            ease: COPY_EASE,
          }, t + COPY_FADE_DURATION * 0.35);
          t += COPY_FADE_DURATION + 0.02;
        }

        stepEndTimes.push(t);
      }

      /* Reset to initial state so the loop restarts cleanly */
      const endT = t + 0.5;
      tl.set(typing, { opacity: 0 }, endT);
      tl.set(bubbles, {
        opacity: 0,
        x: (i: number) => (allBubbles[i].from === "user" ? 24 : -24),
        scale: 0.98,
      }, endT);
      tl.set(copySteps[0], { opacity: 1, y: 0 }, endT);
      copySteps.forEach((el, i) => {
        if (i > 0) tl.set(el, { opacity: 0, y: COPY_Y_OFFSET }, endT);
      });
      tl.set(messagesContent, { y: 0 }, endT);

      tl.repeat(-1);

      const totalDuration = tl.duration();
      const stepEndProgresses =
        totalDuration > 0
          ? stepEndTimes.map((te) => te / totalDuration)
          : STEPS.map((_, i) => (i + 1) / STEPS.length);

      if (debug) {
        tl.eventCallback("onUpdate", () => {
          setProgress(tl.progress());
          let step = 0;
          for (let i = 0; i < stepEndProgresses.length; i++) {
            if (tl.progress() < stepEndProgresses[i]) break;
            step = i;
          }
          setCurrentStepIndex(step);
        });
      }

      const st = ScrollTrigger.create({
        trigger: section,
        start: "top 85%",
        once: true,
        onEnter: () => tl.play(),
      });

      return () => {
        st.kill();
      };
    }, section);

    return () => ctx.revert();
  }, [debug, INTER_BUBBLE_DELAY]);

  return (
    <section
      ref={sectionRef}
      className={`${styles.section} ${debug ? styles.debugOutline : ""}`}
      data-qa-section="iphone-messages"
    >
      <div className={styles.inner}>
        <div ref={phoneRef} className={styles.phoneWrap}>
          <div className={styles.phoneFrame}>
            <div className={styles.dynamicIsland} aria-hidden />
            <div className={styles.screen}>
              <div className={styles.viewport}>
                <div className={styles.statusBar}>
                  <span>9:41</span>
                  <div>
                    <span style={{ opacity: 0.9 }}>•••</span>
                    <span className="ml-1 text-green-600">🔋</span>
                  </div>
                </div>
                <div className={styles.header}>
                  <p className={styles.headerTitle}>Listd</p>
                  <p className={styles.headerSub}>San Francisco, CA</p>
                </div>
                <div ref={messagesRef} className={styles.messagesViewport}>
                  <div
                    ref={messagesContentRef}
                    className={styles.messagesContent}
                  >
                    <div ref={typingRef} className={styles.typing}>
                      <div className={styles.typingDots}>
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                    {allBubbles.map((bubble, i) => (
                      <div
                        key={i}
                        ref={(el) => {
                          bubbleRefs.current[i] = el;
                        }}
                        className={`${styles.bubble} ${
                          bubble.from === "user"
                            ? styles.bubbleUser
                            : styles.bubbleAgent
                        } ${bubble.image ? styles.bubbleImage : ""}`}
                      >
                        {bubble.image ? (
                          <div className={styles.bubbleImageInner}>
                            <Image
                              src={SNEAKER_IMAGE}
                              alt="Sneaker"
                              fill
                              className="object-cover"
                              sizes="(max-width: 340px) 140px, 180px"
                              unoptimized
                            />
                          </div>
                        ) : (
                          <span>{bubble.text}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.copyColumn}>
          {STEPS.map((step, i) => (
            <div
              key={i}
              ref={(el) => {
                copyStepRefs.current[i] = el;
              }}
              className={styles.copyStep}
              style={{ opacity: i === 0 ? 1 : 0 }}
              data-step={i}
              data-debug-step={debug ? i : undefined}
            >
              <h2 className={styles.copyStepHeadline}>{step.headline}</h2>
              <p className={styles.copyStepBody}>{step.body}</p>
            </div>
          ))}
        </div>
      </div>

      {debug && (
        <div className={styles.debugProgress} aria-live="polite">
          progress: {(progress * 100).toFixed(1)}% · step: {currentStepIndex}
        </div>
      )}
    </section>
  );
}
