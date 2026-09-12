export type PolicyWeights = {
  sla: number;
  travel: number;
  load: number;
  overtime: number;
  stability: number;
};

type Candidate = {
  technicianId: string;
  technicianName: string;
  travelMiles: number;
  delayMinutes: number;
  overtimeHours: number;
  certified: boolean;
  inTerritory: boolean;
  partAvailable: boolean;
  onShift: boolean;
};

type Job = {
  id: string;
  window: string;
  serviceOperation: string;
  vehicle: string;
  candidates: Candidate[];
};

export type Assignment = {
  jobId: string;
  window: string;
  job: string;
  from: string;
  to: string;
  impactMinutes: number;
  travelMiles: number;
  overtimeHours: number;
};

export type RecoveryPlan = {
  assignments: Assignment[];
  rescheduled: Array<{ id: string; job: string; window: string }>;
  score: number;
  confidence: number;
  projectedSla: number;
  addedTravel: number;
  overtime: number;
  scenariosEvaluated: number;
  feasibleScenarios: number;
  rejectedCandidates: number;
};

const capacities: Record<string, number> = { "T-147": 2, "T-208": 1, "T-319": 2 };

const candidate = (technicianId: string, technicianName: string, travelMiles: number, delayMinutes: number, overtimeHours: number, overrides: Partial<Candidate> = {}): Candidate => ({
  technicianId,
  technicianName,
  travelMiles,
  delayMinutes,
  overtimeHours,
  certified: true,
  inTerritory: true,
  partAvailable: true,
  onShift: true,
  ...overrides,
});

const jobs: Job[] = [
  { id: "WO-48321", window: "11:00 AM", serviceOperation: "Check-engine diagnosis", vehicle: "2023 GV70", candidates: [candidate("T-319", "Amara Patel", 6.4, 14, 0), candidate("T-147", "Darius Miles", 9.1, 24, 0)] },
  { id: "WO-48344", window: "1:00 PM", serviceOperation: "Brake vibration", vehicle: "2022 G80", candidates: [candidate("T-147", "Darius Miles", 5.2, 9, 0), candidate("T-319", "Amara Patel", 7.8, 18, 0)] },
  { id: "WO-48367", window: "3:00 PM", serviceOperation: "60K maintenance", vehicle: "2021 GV80", candidates: [candidate("T-208", "Sofia Chen", 8.1, 18, 0.2), candidate("T-319", "Amara Patel", 11.7, 27, 0.1), candidate("T-147", "Darius Miles", 10.4, 25, 0)] },
  { id: "WO-48372", window: "3:30 PM", serviceOperation: "Intermittent no-start", vehicle: "2023 G70", candidates: [candidate("T-319", "Amara Patel", 13.2, 35, 0.2), candidate("T-147", "Darius Miles", 16.8, 42, 0.3)] },
  { id: "WO-48389", window: "4:00 PM", serviceOperation: "Recall campaign", vehicle: "2024 GV80", candidates: [candidate("T-147", "Darius Miles", 14.3, 37, 0.4), candidate("T-319", "Amara Patel", 21.6, 48, 0.5)] },
  { id: "WO-48401", window: "2:00 PM", serviceOperation: "ADAS calibration", vehicle: "2023 GV60", candidates: [candidate("T-208", "Sofia Chen", 4.9, 11, 0), candidate("T-319", "Amara Patel", 8.7, 20, 0), candidate("T-147", "Darius Miles", 7.3, 17, 0, { partAvailable: false })] },
  { id: "WO-48412", window: "4:30 PM", serviceOperation: "Cooling-system repair", vehicle: "2022 G90", candidates: [candidate("T-147", "Darius Miles", 12.8, 31, 0.3), candidate("T-319", "Amara Patel", 10.6, 29, 0.2), candidate("T-208", "Sofia Chen", 9.2, 22, 0, { certified: false })] },
];

const isEligible = (candidate: Candidate) => candidate.certified && candidate.inTerritory && candidate.partAvailable && candidate.onShift;

export function optimizeRecovery(weights: PolicyWeights): RecoveryPlan {
  const eligible = jobs.map(job => job.candidates.filter(isEligible));
  const rejectedCandidates = jobs.reduce((sum, job) => sum + job.candidates.filter(candidate => !isEligible(candidate)).length, 0);
  const options = eligible.map(candidates => [null, ...candidates] as Array<Candidate | null>);
  const assignments = new Array<Candidate | null>(jobs.length).fill(null);
  const loads: Record<string, number> = { "T-147": 0, "T-208": 0, "T-319": 0 };
  const normalizedTotal = Math.max(1, Object.values(weights).reduce((sum, value) => sum + value, 0));
  let scenariosEvaluated = 0;
  let feasibleScenarios = 0;
  let bestScore = -Infinity;
  let best: Array<Candidate | null> = [];

  const scorePlan = () => {
    const assigned = assignments.filter((value): value is Candidate => value !== null);
    if (assigned.length !== 5) return;
    feasibleScenarios += 1;
    const travel = assigned.reduce((sum, value) => sum + value.travelMiles, 0);
    const overtime = assigned.reduce((sum, value) => sum + value.overtimeHours, 0);
    const slaScore = assigned.reduce((sum, value) => sum + Math.max(15, 100 - value.delayMinutes * 1.5), 0) / jobs.length;
    const travelScore = Math.max(0, 100 - travel * 1.2);
    const loadValues = Object.entries(loads).map(([id, count]) => count / capacities[id]);
    const loadScore = 100 - (Math.max(...loadValues) - Math.min(...loadValues)) * 55;
    const overtimeScore = Math.max(0, 100 - overtime * 55);
    const stabilityScore = (assigned.length / jobs.length) * 100;
    const score = (slaScore * weights.sla + travelScore * weights.travel + loadScore * weights.load + overtimeScore * weights.overtime + stabilityScore * weights.stability) / normalizedTotal;
    if (score > bestScore) {
      bestScore = score;
      best = [...assignments];
    }
  };

  const search = (index: number) => {
    if (index === jobs.length) {
      scenariosEvaluated += 1;
      scorePlan();
      return;
    }
    for (const choice of options[index]) {
      if (choice && loads[choice.technicianId] >= capacities[choice.technicianId]) continue;
      assignments[index] = choice;
      if (choice) loads[choice.technicianId] += 1;
      search(index + 1);
      if (choice) loads[choice.technicianId] -= 1;
    }
  };

  search(0);
  const selected = best.map((choice, index) => ({ choice, job: jobs[index] }));
  const assigned = selected.filter((item): item is { choice: Candidate; job: Job } => item.choice !== null);
  const rescheduled = selected.filter(item => item.choice === null).map(item => ({ id: item.job.id, job: `${item.job.serviceOperation} · ${item.job.vehicle}`, window: item.job.window }));
  const addedTravel = assigned.reduce((sum, item) => sum + item.choice.travelMiles, 0);
  const overtime = assigned.reduce((sum, item) => sum + item.choice.overtimeHours, 0);
  const avgDelay = assigned.reduce((sum, item) => sum + item.choice.delayMinutes, 0) / Math.max(1, assigned.length);

  return {
    assignments: assigned.map(item => ({ jobId: item.job.id, window: item.job.window, job: `${item.job.serviceOperation} · ${item.job.vehicle}`, from: "Jonah Reed", to: item.choice.technicianName, impactMinutes: item.choice.delayMinutes, travelMiles: item.choice.travelMiles, overtimeHours: item.choice.overtimeHours })),
    rescheduled,
    score: Math.round(bestScore * 10) / 10,
    confidence: Math.min(98, Math.round(78 + bestScore * 0.18)),
    projectedSla: Math.round((96.4 - avgDelay * 0.16) * 10) / 10,
    addedTravel: Math.round(addedTravel * 10) / 10,
    overtime: Math.round(overtime * 10) / 10,
    scenariosEvaluated,
    feasibleScenarios,
    rejectedCandidates,
  };
}

export const defaultPolicyWeights: PolicyWeights = { sla: 35, travel: 25, load: 20, overtime: 15, stability: 5 };
