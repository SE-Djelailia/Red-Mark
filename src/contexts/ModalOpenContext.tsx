import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";

interface ModalOpenContextValue {
  isModalOpen: boolean;
  increment: () => void;
  decrement: () => void;
}

export const ModalOpenContext = createContext<ModalOpenContextValue | null>(null);

// Tracks how many modals are currently open across the whole app (reference
// counted, not a boolean, so a nested modal — e.g. a confirm dialog opened
// from inside a settings modal — closing doesn't prematurely reveal the nav
// while the outer modal is still open).
export function ModalOpenProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const increment = useCallback(() => setCount((n) => n + 1), []);
  const decrement = useCallback(() => setCount((n) => Math.max(0, n - 1)), []);

  const value = useMemo(
    () => ({ isModalOpen: count > 0, increment, decrement }),
    [count, increment, decrement],
  );

  return <ModalOpenContext.Provider value={value}>{children}</ModalOpenContext.Provider>;
}
