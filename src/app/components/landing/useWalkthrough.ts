// The clock behind the animated mockups.
//
// WHY A TIMELINE IN STATE RATHER THAN CSS ANIMATION DELAYS
//
// A walkthrough is a narrative: fields fill, a shutter fires, a badge
// appears, the sequence holds, then it starts over. Expressing that purely
// as staggered `animation-delay` chains has three problems — the steps
// cannot hold a beat of different lengths, nothing keeps the chain in sync
// once it has looped a few times, and there is no single place to stop it.
// One step index advanced by one timer gives every element the same
// authority on "where are we", so a loop is exact rather than approximate.
//
// Each step carries its own dwell time, which is what buys the restrained
// pacing: a field filling can be quick, the finished state has to breathe.
import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "./useReveal";

export interface WalkStep {
  /** How long this step stays on screen, in ms. */
  hold: number;
}

export interface Walkthrough {
  /** Index of the current step. */
  step: number;
  /** True once the sequence has finished at least one pass. */
  looped: boolean;
  /** True when motion is suppressed — render the static frame instead. */
  still: boolean;
}

/**
 * Advances through `steps` on a timer and loops.
 *
 * When the viewer prefers reduced motion the timer never starts and `still`
 * is returned true, pinned to `restIndex` — the single frame that best
 * represents the finished workflow. The rule the design system already
 * applies to `.rm-reveal` holds here: with motion reduced the thing is
 * simply already in place, not hidden and not endlessly paused mid-gesture.
 *
 * `active` lets a caller freeze the sequence when it is off screen, so
 * three walkthroughs on one page are not all burning timers at once.
 */
export function useWalkthrough(
  steps: WalkStep[],
  restIndex: number,
  active = true,
): Walkthrough {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  const [looped, setLooped] = useState(false);

  useEffect(() => {
    if (reduced || !active || steps.length === 0) return;

    const id = window.setTimeout(() => {
      setStep((s) => {
        const next = s + 1;
        if (next >= steps.length) {
          setLooped(true);
          return 0;
        }
        return next;
      });
    }, steps[step]?.hold ?? 1000);

    return () => window.clearTimeout(id);
    // `step` is the driver: each tick schedules exactly one successor, so a
    // step's own hold time is what decides when the next arrives.
  }, [step, steps, reduced, active]);

  if (reduced) return { step: restIndex, looped: true, still: true };
  return { step, looped, still: false };
}

/**
 * Pauses a walkthrough while its frame is off screen.
 *
 * Not an optimisation for its own sake: an animation the viewer cannot see
 * still forces style recalculation on every tick, and the landing page
 * carries several of these at once.
 */
export function useInView<T extends Element>(ref: React.RefObject<T | null>): boolean {
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = ref.current;
    // Fail open: without IntersectionObserver the animation simply runs,
    // which is the same fail-safe posture useReveal takes.
    if (!el || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => setInView(entries[0]?.isIntersecting ?? true),
      { rootMargin: "64px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  return inView;
}
