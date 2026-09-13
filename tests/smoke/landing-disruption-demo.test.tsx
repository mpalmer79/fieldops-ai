// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingDisruptionDemo } from "@/components/landing-disruption-demo";

describe("landing disruption demonstration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves from an idle scenario to an explainable recovery result", () => {
    render(<LandingDisruptionDemo />);

    expect(screen.getByText("Awaiting disruption")).toBeInTheDocument();
    expect(screen.getByText("No assignments execute automatically")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run disruption" }));

    expect(screen.getByRole("button", { name: "Evaluating..." })).toBeDisabled();
    expect(screen.getByText("Testing feasible moves")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1_700);
    });

    expect(screen.getByText("5 promises protected")).toBeInTheDocument();
    expect(screen.getAllByText("PROTECTED")).toHaveLength(5);
    expect(screen.getAllByText("CALLBACK")).toHaveLength(2);
    expect(screen.getByText("93.6% projected on time")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByText("Awaiting disruption")).toBeInTheDocument();
  });

  it("has no automatically detectable accessibility violations", async () => {
    vi.useRealTimers();
    const { container } = render(<LandingDisruptionDemo />);
    const result = await axe.run(container, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });

    expect(result.violations).toEqual([]);
  });
});
