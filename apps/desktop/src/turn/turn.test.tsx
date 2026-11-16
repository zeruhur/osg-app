import { d6Script } from "@osg/dice/testing";
import { APPENDIX_B_DICE } from "@osg/engine/fixtures";
import { render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";
import { MemoryStore } from "../store";

const next = async (user: UserEvent) => user.click(screen.getByRole("button", { name: /Next step/ }));
const heading = (name: string) => screen.findByRole("heading", { name });
const box = (title: RegExp) => screen.getByRole("heading", { name: title }).closest("section")!;

/** Creates the Appendix B game (lighter, Essaveth) with the book's dice, and opens Turn 1. */
async function appendixB() {
  const user = userEvent.setup({ delay: null });
  const store = new MemoryStore();
  render(<App store={store} sessionOptions={{ rng: d6Script(...APPENDIX_B_DICE) }} />);
  await user.click(await screen.findByRole("button", { name: /Start the Corentine Succession/ }));
  await user.click(screen.getByRole("button", { name: "Create campaign" }));
  await user.click(await screen.findByRole("button", { name: "Start the game" }));
  await user.click(await screen.findByRole("button", { name: "Open turn 1" }));
  return { user, store };
}

/** Steps 1-4 of Appendix B through the forms; ends at "5. Adjudicate". */
async function steps1to4() {
    const { user, store } = await appendixB();

    // 1. Take stock
    await heading("1. Take stock");
    expect(screen.getByText(/The first turn/)).toBeTruthy();
    await next(user);

    // 2. Talk: the Offer to Meranto, odds previewed as Likely, answered Yes, but...
    await heading("2. Talk");
    const offer = box(/Make an Offer/);
    await user.selectOptions(within(offer).getByLabelText("To"), "meranto");
    await user.type(within(offer).getByLabelText("The deal"), "Passes for agents; Caldrath's loan delayed");
    const addObligation = within(offer).getAllByRole("button", { name: /obligation/ });
    await user.click(addObligation[1]!); // Meranto will...
    const meranto = within(offer).getAllByRole("textbox").at(-1)!;
    await user.type(meranto, "Delay Caldrath's next war-loan payment");
    await user.click(within(offer).getAllByLabelText(/this turn only/).at(-1)!);
    await user.click(within(offer).getByLabelText(/clearly advances its objective/));
    expect(within(offer).getByText("Likely")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Next step/ }).hasAttribute("disabled")).toBe(false);
    await user.click(within(offer).getByRole("button", { name: "Make the Offer" }));

    const settle = box(/House Meranto answers: Yes, but/);
    expect(screen.getByRole("button", { name: /Next step/ }).hasAttribute("disabled")).toBe(true);
    await user.type(within(settle).getByLabelText("The condition"), "Tolls clear through Meranto houses");
    await user.click(within(settle).getByRole("button", { name: "Take it" }));
    expect(await screen.findByText(/deal struck/)).toBeTruthy();
    await next(user);

    // 3. Declare, with the Pass Wardens
    await heading("3. Declare");
    const declare = box(/declare your action/);
    await user.type(within(declare).getByLabelText(/^Action/), "Close the northern passes");
    await user.type(within(declare).getByLabelText(/^Outcome/), "Caldrath's army cannot cross");
    await user.type(within(declare).getByLabelText(/^Leverage/), "The passes are ours");
    await user.selectOptions(within(declare).getByLabelText("Spend a bonus"), "The Pass Wardens");
    await user.click(within(declare).getByLabelText("Caldrath"));
    await user.click(within(declare).getByRole("button", { name: "Declare and lock" }));
    expect(await screen.findByText("Your action is declared and fixed.")).toBeTruthy();
    await next(user);

    // 4. AA actions: Caldrath rolled 3, target Essaveth; Meranto keeps its deal and acts on it.
    await heading("4. AA actions");
    const caldrath = box(/Caldrath: write its action/);
    expect(within(caldrath).getByText(/Demand right of passage from \[target\], backed by the army/)).toBeTruthy();
    expect((within(caldrath).getByLabelText(/^Action/) as HTMLTextAreaElement).value).toContain("Demand right of passage from Essaveth");
    await user.type(within(caldrath).getByLabelText(/^Outcome/), "The army is through");
    await user.type(within(caldrath).getByLabelText(/^Leverage/), "The largest army on the peninsula");
    await user.click(within(caldrath).getByRole("button", { name: "Accept this action" }));

    const merantoBox = box(/House Meranto: write its action/);
    expect(within(merantoBox).getByText(/Its deal requires it to act this turn/)).toBeTruthy();
    await user.type(within(merantoBox).getByLabelText(/^Outcome/), "Caldrath's chest runs short");
    await user.type(within(merantoBox).getByLabelText(/^Leverage/), "Meranto holds the loan");
    await user.click(within(merantoBox).getByLabelText("Caldrath"));
    await user.click(within(merantoBox).getByRole("button", { name: "Accept this action" }));

    expect(await screen.findByText(/Everything this step needs is done/)).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    await next(user);
    await heading("5. Adjudicate");

  return { user, store };
}

describe("playing Appendix B by hand", () => {
  it("steps 1-4: takes stock, talks, declares, and writes the AA actions", async () => {
    const { store } = await steps1to4();
    const [meta] = await store.list();
    expect(meta).toMatchObject({ turn: 1, status: "playing" });
  });

  it("steps 5-8: adjudicates, signals, updates and reports, to the end of the turn", async () => {
    const { user, store } = await steps1to4();
    const card = (text: RegExp) => screen.getByText(text, { selector: "dd" }).closest("article")!;

    // 5. Classify: Essaveth and Caldrath in conflict (A), Meranto unopposed.
    await user.selectOptions(screen.getByLabelText("Class of Essaveth's action"), "A");
    await user.selectOptions(screen.getByLabelText("Class of Caldrath's action"), "A");
    await user.selectOptions(screen.getByLabelText("Class of House Meranto's action"), "unopposed");
    await user.click(screen.getByRole("button", { name: "Confirm the classes" }));
    await user.click(await screen.findByRole("button", { name: "No, only one" }));
    await user.click(within(card(/Close the northern passes/)).getByRole("button", { name: "Strong" }));
    await user.click(within(card(/Demand right of passage/)).getByRole("button", { name: "Strong" }));

    // The dice: Essaveth [3,5] -> 5 counts as 6 and prevails; Caldrath [4,4], worse than desired.
    const essaveth = card(/Close the northern passes/);
    expect(within(essaveth).getByText(/counts as 6/)).toBeTruthy();
    expect(within(essaveth).getByText(/prevails/)).toBeTruthy();
    expect(within(card(/Demand right of passage/)).getByText(/worse than desired\./)).toBeTruthy();

    await user.click(within(essaveth).getByRole("button", { name: "Roll the Inspiration Table" }));
    expect(within(card(/Close the northern passes/)).getByText(/Weakens a rival/)).toBeTruthy();
    await user.click(within(card(/Close the northern passes/)).getByRole("button", { name: "No" }));
    await user.click(within(card(/Demand right of passage/)).getByRole("button", { name: "No" })); // Force of Nature
    for (const text of [/Close the northern passes/, /Demand right of passage/, /Delay Caldrath/]) {
      const c = card(text);
      await user.type(within(c).getByLabelText("What happens, as fact"), "It happens.");
      await user.click(within(c).getByRole("button", { name: "Accept the outcome" }));
    }
    await next(user);

    // 6. Signals: Caldrath Warning, Meranto Exposure.
    await heading("6. Signals");
    expect(screen.getByText("Warning")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /No: name a new vulnerability/ }));
    await next(user);

    // 7. Update: Caldrath harmed (stays Hostile), Meranto kept deal (Open); Standing from the proposal.
    await heading("7. Update");
    const cald = box(/Caldrath's disposition/);
    await user.click(within(cald).getByLabelText(/your action harmed it/));
    await user.click(within(cald).getByRole("button", { name: "Apply" }));
    const mer = box(/House Meranto's disposition/);
    await user.click(within(mer).getByLabelText(/you kept a deal with it/));
    await user.click(within(mer).getByRole("button", { name: "Apply" }));
    const standing = box(/Standing: who looks strong/);
    expect(within(standing).getAllByRole("listitem").map((li) => li.textContent?.trim())).toEqual(["House Meranto", "Caldrath", "Essaveth"]);
    await user.click(within(standing).getByRole("button", { name: "Set Standing" }));
    await next(user);

    // 8. Report
    await heading("8. Report");
    await user.type(screen.getByLabelText("Turn header"), "The peninsula waits on the northern passes.");
    await user.type(screen.getByLabelText("Closing observation"), "How long can a shut gate stop an army?");
    await user.click(screen.getByRole("button", { name: /Publish the Report/ }));
    expect(await screen.findByRole("heading", { name: "Turn 1 is over" })).toBeTruthy();

    const [meta] = await store.list();
    expect(meta).toMatchObject({ turn: 1, status: "playing" });
    const { batches } = await store.load(meta!.id);
    const events = batches.flatMap((b) => b.events);
    expect(events.at(-1)!.type).toBe("TurnClosed");
    expect(events.filter((e) => e.type === "DispositionChanged").map((e) => (e as { to: string }).to)).toEqual(["hostile", "open"]);
  });
});
