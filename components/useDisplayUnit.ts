"use client";

import { useSyncExternalStore } from "react";
import { isUnit, type Unit } from "@/lib/units";

const KEY = "steel-display-unit";
const CHANGED = "steel-display-unit-changed";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** The unit lengths are shown in (mm by default), remembered per browser. */
export function useDisplayUnit(): [Unit, (unit: Unit) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(KEY) ?? "";
      } catch {
        return "";
      }
    },
    () => ""
  );
  const set = (unit: Unit) => {
    try {
      window.localStorage.setItem(KEY, unit);
    } catch {
      // Storage can be blocked; the choice then lasts only until reload.
    }
    window.dispatchEvent(new Event(CHANGED));
  };
  return [isUnit(raw) ? raw : "mm", set];
}
