import { useContext, useEffect } from "react";
import { ModalOpenContext } from "../contexts/ModalOpenContext";

// Registers a modal as "open" with the app-wide reference count that
// BottomNav uses to hide itself, so a modal's action buttons are never
// hidden behind the fixed bottom nav bar on mobile.
//
// - For a component that IS a modal (only ever mounted while open, per
//   `{show && <SomeModal .../>}` at the call site): call with no argument.
// - For a modal rendered inline inside a larger page component (gated by a
//   `showXyz` state flag rather than being its own mounted component): pass
//   that flag so the count updates as it flips, without needing to extract
//   the modal into its own component.
export function useModalOpen(isOpen: boolean = true): void {
  const ctx = useContext(ModalOpenContext);

  useEffect(() => {
    if (!isOpen || !ctx) return;
    ctx.increment();
    return () => ctx.decrement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, ctx]);
}
