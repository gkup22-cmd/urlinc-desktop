import { useCallback, useEffect, useRef } from "react";

interface Options {
  disabled?: boolean;
  onTransmit: (active: boolean) => void;
}

export function usePushToTalk({ disabled = false, onTransmit }: Options) {
  const heldRef = useRef(false);

  const engage = useCallback(() => {
    if (disabled || heldRef.current) return;
    heldRef.current = true;
    onTransmit(true);
  }, [disabled, onTransmit]);

  const release = useCallback(() => {
    if (!heldRef.current) return;
    heldRef.current = false;
    onTransmit(false);
  }, [onTransmit]);

  // Spacebar shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      engage();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup",   up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup",   up);
    };
  }, [engage, release]);

  return { engage, release };
}
