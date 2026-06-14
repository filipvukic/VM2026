// Isolated ticking clock for live minute displays. Kept OUT of the global store
// so a 1s tick only re-renders the component that opts in, never the whole tree.
import { useEffect, useState } from "react";

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (intervalMs <= 0) return; // 0 = no ticking
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
