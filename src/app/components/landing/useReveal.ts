import { useEffect, useRef } from "react";

/**
 * Scroll-reveal for landing sections.
 *
 * Returns a ref to put on the element. The element starts hidden via
 * `.rm-reveal` and is released by setting `data-shown` when it enters the
 * viewport.
 *
 * FAIL-SAFE. If IntersectionObserver is missing, or the user has asked for
 * reduced motion, every element is marked shown IMMEDIATELY. This matters
 * more than the animation: `.rm-reveal` sets `opacity: 0`, so a hook that
 * silently failed would leave the entire page blank. Content visibility can
 * never depend on an optional API succeeding.
 *
 * Reveals once and disconnects — re-animating on scroll-back is the kind of
 * fidgeting the motion rules exist to prevent.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const show = () => el.setAttribute("data-shown", "true");

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || typeof IntersectionObserver === "undefined") {
      show();
      return;
    }

    // Already on screen at mount (above the fold, or a deep link): show it
    // now rather than waiting for a scroll that may never come.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show();
          observer.disconnect();
        }
      },
      // 12% visible, with a negative bottom margin so a section releases as
      // it settles into view rather than the instant its first pixel appears.
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}
