import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders and reaches the workspace packages", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "OSG Solo" })).toBeTruthy();
    expect(screen.getByText(/The Corentine Succession/)).toBeTruthy();
  });
});
