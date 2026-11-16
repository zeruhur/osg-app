import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";
import { MemoryStore } from "./store";

describe("App: campaigns", () => {
  it("creates a campaign, opens it, lists it, and deletes it", async () => {
    const user = userEvent.setup();
    const store = new MemoryStore();
    render(<App store={store} />);

    await user.click(await screen.findByRole("button", { name: /Start the Corentine Succession/ }));
    expect(screen.getByRole("heading", { name: "New campaign" })).toBeTruthy();
    // The lighter game is preselected; pick Caldrath instead of the first faction.
    await user.click(screen.getByLabelText(/The Kingdom of Caldrath/));
    await user.click(screen.getByRole("button", { name: "Create campaign" }));

    expect(await screen.findByRole("button", { name: "Start the game" })).toBeTruthy();
    expect(screen.getByText("The Corentine Succession: Caldrath")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Campaigns/ }));
    const card = (await screen.findByText("The Corentine Succession: Caldrath")).closest("li")!;
    expect(within(card).getByText(/as Caldrath/)).toBeTruthy();
    expect(within(card).getByText(/Not started/)).toBeTruthy();

    await user.click(within(card).getByRole("button", { name: /Delete/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("No campaigns yet.")).toBeTruthy();
    expect(await store.list()).toEqual([]);
  });

  it("starts the game and opens Turn 1, persisting each step", async () => {
    const user = userEvent.setup();
    const store = new MemoryStore();
    render(<App store={store} />);
    await user.click(await screen.findByRole("button", { name: /New campaign/ }));
    await user.click(screen.getByRole("button", { name: "Create campaign" }));
    await user.click(await screen.findByRole("button", { name: "Start the game" }));
    await user.click(await screen.findByRole("button", { name: "Open turn 1" }));
    expect(await screen.findByRole("heading", { name: "1. Take stock" })).toBeTruthy();
    const [meta] = await store.list();
    expect(meta).toMatchObject({ status: "playing", turn: 1 });
  });
});
