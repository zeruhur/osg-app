import type { Command } from "@osg/engine";
import { ArrowLeft, Moon, PanelRight, Sun, Undo2 } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import type { ToastMessage } from "../components/common";
import { ClockBar, STEP_NAMES, StandingList } from "../components/game-bits";
import type { Theme } from "../components/theme";
import { CommandRefused, type CampaignSession } from "../session/session";
import { useCampaign } from "../session/useCampaign";
import { TurnView } from "../turn/TurnView";

export type DrawerTab = "dashboard" | "facts" | "log" | "reports" | "oracle";
const TABS: { id: DrawerTab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "facts", label: "Facts" },
  { id: "log", label: "Log" },
  { id: "reports", label: "Reports" },
  { id: "oracle", label: "Oracle" }
];

export interface GameContext {
  /** Runs a command; shows the refusal as a toast and returns false if it was refused. */
  run: (command: Command) => Promise<boolean>;
}

export function Game(props: {
  session: CampaignSession;
  theme: Theme;
  onToggleTheme: () => void;
  onBack: () => void;
  toast: (m: ToastMessage) => void;
  panels?: (tab: DrawerTab, ctx: GameContext) => ReactNode;
}) {
  const { state, meta, batches, requirements, undo } = useCampaign(props.session);
  const [drawer, setDrawer] = useState<DrawerTab | null>("dashboard");
  const { toast, session } = props;

  const run = useCallback(
    async (command: Command) => {
      try {
        await session.run(command);
        return true;
      } catch (e) {
        toast({ text: e instanceof CommandRefused ? e.message : `Error: ${(e as Error).message}`, kind: "error" });
        return false;
      }
    },
    [session, toast]
  );

  const doUndo = async () => {
    const last = batches.at(-1);
    if (await undo()) toast({ text: `Undid: ${last?.command ?? "last command"}`, kind: "info" });
  };

  return (
    <div className="game">
      <header className="topbar">
        <button className="link" onClick={props.onBack}>
          <ArrowLeft size={14} /> Campaigns
        </button>
        <div className="topbar-title">
          <strong>{meta.title}</strong>
          <span className="dim">
            {state.status === "setup" ? "Not started" : state.status === "ended" ? "Game over" : `Turn ${state.turn} of ${state.turns}`}
          </span>
        </div>
        <div className="row">
          <button onClick={doUndo} disabled={batches.length <= 1} title="Undo the last command (it can't reroll: the same dice come back)">
            <Undo2 size={16} /> Undo
          </button>
          <button onClick={props.onToggleTheme} title="Switch theme" aria-label="Switch theme">
            {props.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={() => setDrawer(drawer ? null : "dashboard")} title="Side panel" aria-label="Toggle side panel" className={drawer ? "active" : undefined}>
            <PanelRight size={16} />
          </button>
        </div>
      </header>

      <div className="game-body">
        <nav className="rail" aria-label="Turn">
          <h3>{state.turnOpen ? `Turn ${state.turn}` : state.status === "ended" ? "Game over" : state.turn ? `After turn ${state.turn}` : "Setup"}</h3>
          <ol className="steps">
            {STEP_NAMES.map((name, i) => {
              const step = i + 1;
              const status = !state.turnOpen ? "ahead" : step < state.step ? "done" : step === state.step ? "current" : "ahead";
              return (
                <li key={name} className={`step ${status}`} aria-current={status === "current" ? "step" : undefined}>
                  <span className="step-n">{step}</span> {name}
                </li>
              );
            })}
          </ol>
          <h3>Crisis Clock</h3>
          <ClockBar state={state} />
          <h3>Standing</h3>
          <StandingList state={state} />
        </nav>

        <main className="centre">
          <TurnView state={state} requirements={requirements} run={run} />
        </main>

        {drawer && (
          <aside className="side-drawer" aria-label="Side panel">
            <div className="drawer-tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={drawer === t.id} className={`drawer-tab${drawer === t.id ? " active" : ""}`} onClick={() => setDrawer(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="drawer-body">{props.panels?.(drawer, { run }) ?? <p className="dim">Coming in M1 step 7.</p>}</div>
          </aside>
        )}
      </div>
    </div>
  );
}
