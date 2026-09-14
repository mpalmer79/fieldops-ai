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

    expect(screen.getByText("Ready to evaluate today’s shop state")).toBeInTheDocument();
    expect(screen.getByText("No assignments execute automatically")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run disruption" }));

    expect(screen.getByRole("button", { name: "Recovery running" })).toBeDisabled();
    expect(screen.getByText("Persisting callout and loading 7 affected repair orders")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByText("Removing assignments that fail skill, bay, parts, or capacity rules")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.getByText(/Ranking .* feasible recovery plans/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    expect(screen.getByText("5 promises protected")).toBeInTheDocument();
    expect(screen.getAllByText("ADVISOR CALLBACK")).toHaveLength(2);
    expect(screen.getByText(/% projected on time$/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the full recovery workspace" })).toHaveAttribute("href", "/control-room/service-command");

    fireEvent.click(screen.getByRole("button", { name: "Reset scenario" }));

    expect(screen.getByText("Ready to evaluate today’s shop state")).toBeInTheDocument();
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
