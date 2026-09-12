import { useEffect, useState } from "react";

/**
 * Subscribes to a CSS media query as React state.
 *
 * WHEN TO USE THIS INSTEAD OF A TAILWIND BREAKPOINT
 *
 * Almost never. Responsive LAYOUT belongs in `md:` / `lg:` classes, which
 * cost nothing at runtime and cannot desynchronise from the stylesheet.
 *
 * This exists for the narrow case where BEHAVIOUR forks, not just layout —
 * the iPad master/detail lists, where one tap must navigate away on a phone
 * but select into a side pane on a large screen. No amount of CSS expresses
 * that, because it is a difference in what the handler does.
 *
 * Keep the query string in step with the Tailwind breakpoint it mirrors:
 * "(min-width: 768px)" is md, "(min-width: 1024px)" is lg.
 *
 * Reads the match during initialisation so the first render is already
 * correct — a component that flashed the phone behaviour before correcting
 * itself could fire a navigation the user never asked for. Falls back to
 * `false` (the phone branch) when matchMedia is unavailable, which is the
 * safe direction: navigating away always works, whereas a detail pane with
 * no way to reach it would strand the user.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);

    // No synchronous re-read here: the lazy initialiser above already gave
    // the first render the right answer, and setting state in an effect body
    // would only add a cascading render. Changes arrive via the listener.
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
