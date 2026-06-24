import { useEffect } from "react";
import { useSheets } from "../state/sheets";
import { MatchDetail } from "./MatchDetail";
import { TeamSheet } from "./TeamSheet";
import { PlayerSheet } from "./PlayerSheet";
import { FootballPlayerSheet } from "./FootballPlayerSheet";
import { CoachSheet } from "./CoachSheet";

// Render the WHOLE stack so sheets sit OVER each other. Only the bottom sheet
// blurs and only the top sheet is interactive — no stacked-blur lag. Global
// scroll-lock + ESC handling live here (once), not per sheet.
export function SheetHost() {
  const stack = useSheets((s) => s.stack);
  const back = useSheets((s) => s.close); // pop one — closes entirely when it's the last
  const depthTotal = stack.length;

  useEffect(() => {
    if (!depthTotal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") back();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [depthTotal, back]);

  if (!depthTotal) return null;

  return (
    <>
      {stack.map((entry, i) => {
        const top = i === depthTotal - 1;
        // The close (X) button pops one level → it IS the "back" to the previous
        // sheet, and closes the whole stack when it's the only sheet.
        const common = {
          onClose: back,
          zIndex: 100 + i * 10,
          blur: i === 0,
          interactive: top,
          depth: depthTotal - 1 - i,
        };
        const key = `${entry.type}-${"id" in entry ? entry.id : "code" in entry ? entry.code : entry.name}-${i}`;
        if (entry.type === "match") return <MatchDetail key={key} id={entry.id} {...common} />;
        if (entry.type === "team") return <TeamSheet key={key} code={entry.code} {...common} />;
        if (entry.type === "fbplayer") return <FootballPlayerSheet key={key} name={entry.name} espnId={entry.espnId} fmId={entry.fmId} {...common} />;
        if (entry.type === "coach") return <CoachSheet key={key} code={entry.code} {...common} />;
        return <PlayerSheet key={key} id={entry.id} {...common} />;
      })}
    </>
  );
}
