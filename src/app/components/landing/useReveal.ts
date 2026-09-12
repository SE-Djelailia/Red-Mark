import { useEffect, useRef, useState } from "react";

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

/**
 * Whether the viewer has asked for reduced motion, as live state.
 *
 * `useReveal` reads the same query imperatively because it only needs the
 * answer once, at mount. The walkthroughs need to REACT to it: a viewer can
 * turn the preference on while the page is open, and an animation that kept
 * running would be ignoring an accessibility setting the OS considers live.
 *
 * Defaults to `false` (motion allowed) when matchMedia is unavailable —
 * matching the fail-open posture above, where a missing optional API must
 * never leave content stuck.
 */
export function usePrefersReducedMotion(): boolean {
  // Read during initialisation rather than in an effect: the first render
  // then already has the right answer, so a viewer who prefers reduced
  // motion never sees a frame of animation before it is switched off. It
  // also avoids the cascading render a synchronous setState in an effect
  // would cause.
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
