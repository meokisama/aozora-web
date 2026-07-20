import { useEffect, type RefObject } from "react";

/**
 * Dismisses a floating element on Escape or an outside pointer press. Only while
 * `active`, so it never self-closes on the opening click. Outside check runs in
 * capture phase, before the pressed element's own handlers.
 */
export function useDismiss(active: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [active, ref, onClose]);
}
