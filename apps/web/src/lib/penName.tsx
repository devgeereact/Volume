import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/* The pen name switcher on the spine. null means "All pen names". Screens read it to filter. */

interface PenNameContextValue {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

const PenNameContext = createContext<PenNameContextValue | null>(null);

export function PenNameProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const value = useMemo(() => ({ selectedId, setSelectedId }), [selectedId]);
  return <PenNameContext.Provider value={value}>{children}</PenNameContext.Provider>;
}

export function usePenNameFilter(): PenNameContextValue {
  const ctx = useContext(PenNameContext);
  if (!ctx) throw new Error("usePenNameFilter must be used inside PenNameProvider");
  return ctx;
}
