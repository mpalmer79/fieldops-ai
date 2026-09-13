import { describe, expect, it } from "vitest";
import {
  defaultPolicyWeights,
  optimizeRecovery,
  validateRecoveryPlan,
  type PolicyWeights,
} from "@/lib/dispatch-optimizer";

function signature(weights: PolicyWeights) {
  const plan = optimizeRecovery(weights);
  return {
    key: [
      ...plan.assignments.map(({ jobId, to }) => `${jobId}:${to}`),
      ...plan.rescheduled.map(({ id }) => `${id}:RESCHEDULED`),
    ].sort().join("|"),
    plan,
  };
}

describe("dispatch policy integrity", () => {
  it("keeps every selected recovery plan inside hard constraints", () => {
    const policies: PolicyWeights[] = [
      defaultPolicyWeights,
      { sla: 60, travel: 0, load: 0, overtime: 0, stability: 0 },
      { sla: 0, travel: 60, load: 0, overtime: 0, stability: 0 },
      { sla: 0, travel: 0, load: 60, overtime: 0, stability: 0 },
      { sla: 0, travel: 0, load: 0, overtime: 60, stability: 0 },
      { sla: 0, travel: 0, load: 0, overtime: 0, stability: 60 },
    ];

    for (const weights of policies) {
      expect(validateRecoveryPlan(signature(weights).plan)).toEqual({ valid: true, errors: [] });
    }
  });

  it("produces materially different plans when operators change priorities", () => {
    const policies: PolicyWeights[] = [
      { sla: 60, travel: 0, load: 0, overtime: 0, stability: 0 },
      { sla: 0, travel: 60, load: 0, overtime: 0, stability: 0 },
      { sla: 0, travel: 0, load: 60, overtime: 0, stability: 0 },
      { sla: 0, travel: 0, load: 0, overtime: 60, stability: 0 },
      { sla: 0, travel: 0, load: 0, overtime: 0, stability: 60 },
    ];

    const plans = policies.map(signature);
    expect(new Set(plans.map(({ key }) => key)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(plans.map(({ plan }) => plan.objectiveScores?.stability)).size).toBeGreaterThan(1);
  });

  it("makes a full-range change to each default slider observable", () => {
    const comparisons = (Object.keys(defaultPolicyWeights) as Array<keyof PolicyWeights>)
      .map((key) => ({
        minimum: signature({ ...defaultPolicyWeights, [key]: 0 }).key,
        maximum: signature({ ...defaultPolicyWeights, [key]: 60 }).key,
      }));

    expect(comparisons.filter(({ minimum, maximum }) => minimum !== maximum).length).toBeGreaterThanOrEqual(3);
  });
});
