import { useCallback, useSyncExternalStore } from "react";
import type { Command } from "@osg/engine";
import type { CampaignSession } from "./session";

/** React view of a CampaignSession: re-renders on every change, and exposes run/undo. */
export function useCampaign(session: CampaignSession) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const run = useCallback((command: Command) => session.run(command), [session]);
  const undo = useCallback(() => session.undo(), [session]);
  return { ...snapshot, requirements: session.requirements(), run, undo };
}
