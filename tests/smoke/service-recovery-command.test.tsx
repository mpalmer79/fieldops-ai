// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServiceRecoveryCommand } from "@/components/service-recovery-command";
import { defaultPolicyWeights, optimizeRecovery } from "@/lib/dispatch-optimizer";

const plan = optimizeRecovery(defaultPolicyWeights);

describe("service recovery command", () => {
  it("presents an operational disruption input before the run", () => {
    render(<ServiceRecoveryCommand plan={plan} phase="ready" busy={false} backendOnline onRun={vi.fn()} onReview={vi.fn()} onPolicy={vi.fn()}/>);

    expect(screen.getByText("Jonah Reed unavailable")).toBeInTheDocument();
    expect(screen.getByText("7 promised completions")).toBeInTheDocument();
    expect(screen.getByText("No silent execution")).toBeInTheDocument();
    expect(screen.getByText("Plan output will appear here")).toBeInTheDocument();
  });

  it("exposes optimizer evidence and routes a ready plan to manager review", () => {
    const review = vi.fn();
    render(<ServiceRecoveryCommand plan={plan} phase="review" busy={false} backendOnline onRun={vi.fn()} onReview={review} onPolicy={vi.fn()}/>);

    expect(screen.getByText(plan.scenariosEvaluated.toLocaleString())).toBeInTheDocument();
    expect(screen.getByText(plan.feasibleScenarios.toLocaleString())).toBeInTheDocument();
    expect(screen.getByText(`${plan.assignments.length} promises preserved, ${plan.rescheduled.length} advisor callbacks`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Inspect evidence and authorize/i }));
    expect(review).toHaveBeenCalledOnce();
  });
});
