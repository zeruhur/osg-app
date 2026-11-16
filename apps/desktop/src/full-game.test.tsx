import { createRng } from "@osg/dice";
import { DEFAULT_POLICY, answer, optionalMoves } from "@osg/sim/policy";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";
import { CampaignSession } from "./session/session";
import { MemoryStore } from "./store";

/** Plays a whole game through a CampaignSession, the sim's policy answering every decision. */
async function playWholeGame(store: MemoryStore) {
  const session = await CampaignSession.create(store, { packId: "corentine", variant: "lighter", player: "essaveth", turns: 6, title: "Full game" }, { newId: () => "full-game" });
  const policyRng = createRng("full-game/policy");
  let lastStep = -1;
  for (let guard = 0; guard < 5000 && session.state.status !== "ended"; guard++) {
    const r = session.requirements();
    if (r.decisions.length) await session.run(answer(session.state, r.decisions[0]!, policyRng, DEFAULT_POLICY));
    else if (r.canAdvance) {
      const key = session.state.turn * 10 + session.state.step;
      const moves = key === lastStep ? [] : optionalMoves(session.state, policyRng, DEFAULT_POLICY);
      lastStep = key;
      for (const m of moves) await session.run(m);
      if (!moves.length) await session.run({ type: "advance" });
    } else throw new Error(`stuck at turn ${session.state.turn}, step ${session.state.step}`);
  }
  return session;
}

describe("a full game", () => {
  it("plays six turns through the session, then debriefs, browses the panels, and undoes across the end", async () => {
    const store = new MemoryStore();
    const session = await playWholeGame(store);
    expect(session.state).toMatchObject({ status: "ended", turn: 6 });
    expect(Object.keys(session.state.reports)).toHaveLength(6);

    const user = userEvent.setup({ delay: null });
    render(<App store={store} />);
    await user.click(await screen.findByRole("button", { name: /^Full game/ }));

    // The Debrief, with the game's numbers.
    expect(await screen.findByRole("heading", { name: "Debrief" })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText("Essaveth")).toBeTruthy();
    await user.type(screen.getByLabelText(/3\. The surprise/), "Turn 4, when the treaties lapsed.");
    await user.click(screen.getByRole("button", { name: "Save the Debrief" }));
    expect((await CampaignSession.open(store, "full-game")).state.debrief?.surprise).toBe("Turn 4, when the treaties lapsed.");

    // The panels.
    await user.click(screen.getByRole("tab", { name: "Reports" }));
    expect(screen.getByRole("heading", { name: "Report, turn 6" })).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Facts" }));
    expect(screen.getAllByText(/Two mercenary companies operate on the peninsula/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("tab", { name: "Oracle" }));
    await user.type(screen.getByLabelText("Question"), "Did Vethara die naturally?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("Did Vethara die naturally?")).toBeTruthy();

    // Undo across the end of the game and the turn: the Oracle question, the Debrief, then the Report.
    await user.click(screen.getByRole("tab", { name: "Log" }));
    const undo = screen.getByRole("button", { name: /Undo the last command/ });
    await user.click(undo); // the Oracle question
    await user.click(undo); // the Debrief
    await user.click(undo); // the Report (with TurnClosed and GameEnded)
    expect(await screen.findByRole("heading", { name: "8. Report" })).toBeTruthy();
    expect(screen.getByText("Turn 6 of 6")).toBeTruthy();
    const reopened = await CampaignSession.open(store, "full-game");
    expect(reopened.state).toMatchObject({ status: "playing", turn: 6, step: 8, turnOpen: true });
  });
});
