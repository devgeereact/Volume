import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useCanWrite } from "./access";

/** A book screen's main action (D-016): the navy button in the step head, or in the step rail on full-height steps. */
export interface StepAction {
  /** What happens, for example "Approve blueprint" or "Write book". */
  label: string;
  /** Run the action. The screen decides whether to move on afterwards. */
  onClick?: (() => void) | undefined;
  /** Or follow a link. */
  to?: string | undefined;
  /** Cost before the click, for example "about $0.04". */
  estimate?: string | undefined;
  /** Keeps the button focusable but disabled, and says why in a tooltip. */
  disabledReason?: string | undefined;
}

const ActionContext = createContext<StepAction | null>(null);
const SetActionContext = createContext<((a: StepAction | null) => void) | null>(null);

export function StepActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<StepAction | null>(null);
  return (
    <SetActionContext.Provider value={setAction}>
      <ActionContext.Provider value={action}>{children}</ActionContext.Provider>
    </SetActionContext.Provider>
  );
}

/** The action the current screen registered, or null. Read by the book layout (StepHead, StepRail). */
export function useCurrentStepAction(): StepAction | null {
  return useContext(ActionContext);
}

/**
 * Called by a book screen to show its primary action in the step head (or the step rail on full-height steps):
 *
 *   useStepAction({ label: "Approve blueprint", onClick: () => setConfirmOpen(true) });
 *
 * Pass null (or nothing) for no action; the rail's Next link always moves on. The head then shows the only
 * navy button, so remove the screen's own copy of that button. The click handler can change every render;
 * only label, link, estimate and disabled reason trigger an update. Outside a book it does nothing.
 * A viewer (read-only role) never gets an action that runs something; the rail's Next link still works.
 */
export function useStepAction(requested: StepAction | null | undefined): void {
  const setAction = useContext(SetActionContext);
  const canWrite = useCanWrite();
  const action = requested && (canWrite || (requested.to && !requested.onClick)) ? requested : null;
  const clickRef = useRef<(() => void) | undefined>(action?.onClick);
  useLayoutEffect(() => {
    clickRef.current = action?.onClick;
  });
  const hasClick = Boolean(action?.onClick);
  const label = action?.label;
  const to = action?.to;
  const estimate = action?.estimate;
  const disabledReason = action?.disabledReason;
  useEffect(() => {
    if (!setAction) return;
    if (label === undefined) {
      setAction(null);
      return;
    }
    setAction({
      label,
      to,
      estimate,
      disabledReason,
      onClick: hasClick ? () => clickRef.current?.() : undefined,
    });
    return () => setAction(null);
  }, [setAction, label, to, estimate, disabledReason, hasClick]);
}
