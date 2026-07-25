import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface PageHeader {
  title?: string;
  subtitle?: string;
}

interface PageHeaderValue extends PageHeader {
  setHeader: (header: PageHeader) => void;
}

const PageHeaderContext = createContext<PageHeaderValue | null>(null);

// Lets a screen put its title into the single global AppHeader instead of
// rendering a second header band of its own — the design refresh wants one
// continuous white chrome block (logo row + page title), and AppHeader has
// to stay mounted in Layout for its sticky positioning to work.
export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<PageHeader>({});
  // `setHeader` is the raw useState setter, so its identity is stable for
  // the life of the provider. That matters: usePageHeader() depends on it,
  // and a setter that changed identity on every update would re-run that
  // effect, set state again, and loop forever.
  const value = useMemo(() => ({ ...header, setHeader }), [header]);
  return <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>;
}

export function usePageHeaderValue(): PageHeader {
  return useContext(PageHeaderContext) ?? {};
}

/**
 * Declare this screen's header title. Clears on unmount so a screen that
 * doesn't set one falls back to the bare logo row rather than inheriting
 * the previous screen's title.
 */
export function usePageHeader(title?: string, subtitle?: string) {
  const ctx = useContext(PageHeaderContext);
  const setHeader = ctx?.setHeader;
  useEffect(() => {
    if (!setHeader) return;
    setHeader({ title, subtitle });
    return () => setHeader({});
  }, [setHeader, title, subtitle]);
}
