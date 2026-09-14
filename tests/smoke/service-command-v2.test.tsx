// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceCommandV2 } from "@/components/service-command-v2";

const recoveryPlan = {
  id: "plan-test",
  disruptionId: "disruption-test",
  status: "AWAITING_APPROVAL" as const,
  version: 1,
  policyVersion: 1,
  optimizerVersion: "optimizer-test",
  createdAt: "2026-09-14T16:00:00.000Z",
  updatedAt: "2026-09-14T16:00:00.000Z",
  assignments: [
    { jobId: "WO-48321", window: "11:00 AM", job: "Check-engine diagnosis · 2023 GV70", from: "Jonah Reed", to: "Amara Patel", impactMinutes: 14, travelMiles: 6.4, overtimeHours: 0 },
    { jobId: "WO-48344", window: "1:00 PM", job: "Brake vibration · 2022 G80", from: "Jonah Reed", to: "Darius Miles", impactMinutes: 9, travelMiles: 5.2, overtimeHours: 0 },
    { jobId: "WO-48367", window: "3:00 PM", job: "60K maintenance · 2021 GV80", from: "Jonah Reed", to: "Sofia Chen", impactMinutes: 18, travelMiles: 8.1, overtimeHours: 0.2 },
    { jobId: "WO-48372", window: "3:30 PM", job: "Intermittent no-start · 2023 G70", from: "Jonah Reed", to: "Amara Patel", impactMinutes: 35, travelMiles: 13.2, overtimeHours: 0.2 },
    { jobId: "WO-48389", window: "4:00 PM", job: "Recall campaign · 2024 GV80", from: "Jonah Reed", to: "Darius Miles", impactMinutes: 37, travelMiles: 14.3, overtimeHours: 0.4 },
  ],
  rescheduled: [
    { id: "WO-48401", job: "ADAS calibration · 2023 GV60", window: "2:00 PM" },
    { id: "WO-48412", job: "Cooling-system repair · 2022 G90", window: "4:30 PM" },
  ],
  score: 91.4,
  confidence: 94,
  projectedSla: 93.6,
  addedTravel: 81.4,
  overtime: 0.8,
  scenariosEvaluated: 896,
  feasibleScenarios: 150,
  rejectedCandidates: 2,
  objectiveScores: { sla: 96.1, travel: 83.2, load: 88.4, overtime: 91.1, stability: 79.6 },
  decisionEvidence: { callbacks: 2, scheduleDisplacementMinutes: 70, flaggedHoursSpread: 1.7 },
};

const baseSnapshot = {
  operator: { id: "operator-test", displayName: "Demo Supervisor", role: "supervisor" },
  technicians: [
    { id: "T-147", name: "Darius Miles", specialty: "Engine performance", status: "IN_BAY", active_stops: 6, route_miles: 42.8, utilization: 86 },
    { id: "T-208", name: "Sofia Chen", specialty: "Electrical & ADAS", status: "ROAD_TEST", active_stops: 7, route_miles: 36.2, utilization: 91 },
    { id: "T-274", name: "Jonah Reed", specialty: "Drivability", status: "IN_BAY", active_stops: 5, route_miles: 31.4, utilization: 74 },
    { id: "T-319", name: "Amara Patel", specialty: "Master technician", status: "IN_BAY", active_stops: 7, route_miles: 39.1, utilization: 94 },
  ],
  policy: { sla: 35, travel: 25, load: 20, overtime: 15, stability: 5, version: 1, updatedAt: "2026-09-14T16:00:00.000Z" },
  activePlan: null as typeof recoveryPlan | null,
  audit: [],
  metrics: {
    openRepairOrders: 21,
    atRiskPromises: 0,
    unavailableTechnicians: 0,
    reassignedRepairOrders: 0,
    averageTechnicianUtilization: 86.3,
    projectedPromiseAttainment: 97.2,
  },
  backend: { persistence: "PostgreSQL", optimizer: "Constraint optimizer", serverTime: "2026-09-14T19:45:00.000-04:00" },
};

function jsonResponse(value: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => value,
  } as Response;
}

describe("service command recovery workflow", () => {
  let persistedPlan: typeof recoveryPlan | null;

  beforeEach(() => {
    persistedPlan = null;
    vi.useFakeTimers();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/operations") {
        return jsonResponse({
          ...baseSnapshot,
          activePlan: persistedPlan,
          technicians: baseSnapshot.technicians.map((technician) => technician.id === "T-274" && persistedPlan ? { ...technician, status: "UNAVAILABLE" } : technician),
          metrics: persistedPlan ? { ...baseSnapshot.metrics, atRiskPromises: 7, unavailableTechnicians: 1, projectedPromiseAttainment: 93.6 } : baseSnapshot.metrics,
        });
      }

      if (url === "/api/disruptions") {
        persistedPlan = { ...recoveryPlan };
        return jsonResponse({ plan: persistedPlan });
      }

      if (url === "/api/recovery-plans/transition") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string };
        if (!persistedPlan) throw new Error("Expected a persisted recovery plan");
        const nextStatus = body.action === "approve" ? "APPROVED" : body.action === "execute" ? "EXECUTED" : "REJECTED";
        persistedPlan = { ...persistedPlan, status: nextStatus, version: persistedPlan.version + 1 } as typeof recoveryPlan;
        return jsonResponse({ plan: persistedPlan });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows the recovery stages, requires approval, and executes the persisted plan", async () => {
    render(<ServiceCommandV2 />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Shop nominal")).toBeInTheDocument();
    expect(screen.getByText("No recovery plan yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run disruption" }));
    expect(screen.getByText("Disruption detected")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_800);
    });

    expect(screen.getByText("Recovery active")).toBeInTheDocument();
    expect(screen.getByText("5 repair orders can be reassigned safely")).toBeInTheDocument();
    expect(screen.getByText("896 scenarios evaluated")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve and execute" })).toBeEnabled();
    expect(screen.getAllByText("Callback required")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Approve and execute" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByText("Recovery executed")).toBeInTheDocument();
    expect(screen.getByText("Execution complete and auditable")).toBeInTheDocument();
    expect(screen.getByText(/Five repair orders were reassigned/)).toBeInTheDocument();
  });
});
