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
  scheduleDisplacementMinutes: number;
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
  laborHours: number;
  promiseCriticality: number;
  callbackCost: number;
  candidates: Candidate[];
};

type ObjectiveScores = Record<keyof PolicyWeights, number>;

type RawMetrics = {
  sla: number;
  travel: number;
  load: number;
  overtime: number;
  stability: number;
};

type EvaluatedPlan = {
  choices: Array<Candidate | null>;
  metrics: RawMetrics;
  objectiveScores: ObjectiveScores;
  score: number;
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
  objectiveScores?: ObjectiveScores;
  decisionEvidence?: {
    callbacks: number;
    scheduleDisplacementMinutes: number;
    flaggedHoursSpread: number;
  };
};

const capacities: Record<string, number> = { "T-147": 2, "T-208": 1, "T-319": 2 };
const availableHours: Record<string, number> = { "T-147": 6, "T-208": 3.5, "T-319": 6 };
const requiredAssignments = Object.values(capacities).reduce((sum, value) => sum + value, 0);
const objectiveKeys: Array<keyof PolicyWeights> = ["sla", "travel", "load", "overtime", "stability"];

const candidate = (
  technicianId: string,
  technicianName: string,
  travelMiles: number,
  delayMinutes: number,
  overtimeHours: number,
  scheduleDisplacementMinutes: number,
  overrides: Partial<Candidate> = {},
): Candidate => ({
  technicianId,
  technicianName,
  travelMiles,
  delayMinutes,
  overtimeHours,
  scheduleDisplacementMinutes,
  certified: true,
  inTerritory: true,
  partAvailable: true,
  onShift: true,
  ...overrides,
});

const jobs: Job[] = [
  {
    id: "WO-48321",
    window: "11:00 AM",
    serviceOperation: "Check-engine diagnosis",
    vehicle: "2023 GV70",
    laborHours: 2.2,
    promiseCriticality: 1,
    callbackCost: 1,
    candidates: [candidate("T-319", "Amara Patel", 6.4, 14, 0, 22), candidate("T-147", "Darius Miles", 9.1, 24, 0, 8)],
  },
  {
    id: "WO-48344",
    window: "1:00 PM",
    serviceOperation: "Brake vibration",
    vehicle: "2022 G80",
    laborHours: 1.4,
    promiseCriticality: 0.9,
    callbackCost: 0.88,
    candidates: [candidate("T-147", "Darius Miles", 5.2, 9, 0, 24), candidate("T-319", "Amara Patel", 7.8, 18, 0, 5)],
  },
  {
    id: "WO-48367",
    window: "3:00 PM",
    serviceOperation: "60K maintenance",
    vehicle: "2021 GV80",
    laborHours: 2.8,
    promiseCriticality: 0.7,
    callbackCost: 0.62,
    candidates: [candidate("T-208", "Sofia Chen", 8.1, 18, 0.2, 9), candidate("T-319", "Amara Patel", 11.7, 27, 0.1, 18), candidate("T-147", "Darius Miles", 10.4, 25, 0, 26)],
  },
  {
    id: "WO-48372",
    window: "3:30 PM",
    serviceOperation: "Intermittent no-start",
    vehicle: "2023 G70",
    laborHours: 3.5,
    promiseCriticality: 0.82,
    callbackCost: 0.92,
    candidates: [candidate("T-319", "Amara Patel", 13.2, 35, 0.2, 10), candidate("T-147", "Darius Miles", 16.8, 42, 0.3, 5)],
  },
  {
    id: "WO-48389",
    window: "4:00 PM",
    serviceOperation: "Recall campaign",
    vehicle: "2024 GV80",
    laborHours: 1.1,
    promiseCriticality: 0.6,
    callbackCost: 0.48,
    candidates: [candidate("T-147", "Darius Miles", 14.3, 37, 0.4, 14), candidate("T-319", "Amara Patel", 21.6, 48, 0.5, 8)],
  },
  {
    id: "WO-48401",
    window: "2:00 PM",
    serviceOperation: "ADAS calibration",
    vehicle: "2023 GV60",
    laborHours: 2.4,
    promiseCriticality: 0.86,
    callbackCost: 0.95,
    candidates: [candidate("T-208", "Sofia Chen", 4.9, 11, 0, 25), candidate("T-319", "Amara Patel", 8.7, 20, 0, 7), candidate("T-147", "Darius Miles", 7.3, 17, 0, 12, { partAvailable: false })],
  },
  {
    id: "WO-48412",
    window: "4:30 PM",
    serviceOperation: "Cooling-system repair",
    vehicle: "2022 G90",
    laborHours: 3.2,
    promiseCriticality: 0.55,
    callbackCost: 0.7,
    candidates: [candidate("T-147", "Darius Miles", 12.8, 31, 0.3, 8), candidate("T-319", "Amara Patel", 10.6, 29, 0.2, 20), candidate("T-208", "Sofia Chen", 9.2, 22, 0, 7, { certified: false })],
  },
];

const isEligible = (value: Candidate) => value.certified && value.inTerritory && value.partAvailable && value.onShift;
const round = (value: number, precision = 1) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

function sanitizeWeights(weights: PolicyWeights): PolicyWeights {
  const sanitized = Object.fromEntries(objectiveKeys.map(key => {
    const value = weights[key];
    return [key, Number.isFinite(value) ? Math.min(60, Math.max(0, value)) : 0];
  })) as PolicyWeights;
  if (objectiveKeys.every(key => sanitized[key] === 0)) {
    return { sla: 1, travel: 1, load: 1, overtime: 1, stability: 1 };
  }
  return sanitized;
}

function planMetrics(choices: Array<Candidate | null>): RawMetrics {
  const technicianHours: Record<string, number> = Object.fromEntries(Object.keys(capacities).map(id => [id, 0]));
  let protectedPromiseValue = 0;
  let workflowMovement = 0;
  let overtime = 0;
  let stabilityCost = 0;

  choices.forEach((choice, index) => {
    const job = jobs[index];
    if (!choice) {
      stabilityCost += job.callbackCost * 60;
      return;
    }
    const completionQuality = Math.max(0, 1 - choice.delayMinutes / 75);
    protectedPromiseValue += job.promiseCriticality * completionQuality;
    workflowMovement += choice.travelMiles + choice.scheduleDisplacementMinutes / 3;
    overtime += choice.overtimeHours;
    stabilityCost += choice.scheduleDisplacementMinutes;
    technicianHours[choice.technicianId] += job.laborHours;
  });

  const totalPromiseValue = jobs.reduce((sum, job) => sum + job.promiseCriticality, 0);
  const utilizations = Object.keys(capacities).map(id => technicianHours[id] / availableHours[id]);
  const averageUtilization = utilizations.reduce((sum, value) => sum + value, 0) / utilizations.length;
  const loadVariance = utilizations.reduce((sum, value) => sum + (value - averageUtilization) ** 2, 0) / utilizations.length;

  return {
    sla: protectedPromiseValue / totalPromiseValue,
    travel: workflowMovement,
    load: Math.sqrt(loadVariance),
    overtime,
    stability: stabilityCost,
  };
}

function normalizeMetrics(plans: Array<{ choices: Array<Candidate | null>; metrics: RawMetrics }>) {
  const ranges = Object.fromEntries(objectiveKeys.map(key => {
    const values = plans.map(plan => plan.metrics[key]);
    return [key, { min: Math.min(...values), max: Math.max(...values) }];
  })) as Record<keyof PolicyWeights, { min: number; max: number }>;

  return plans.map(plan => {
    const objectiveScores = Object.fromEntries(objectiveKeys.map(key => {
      const range = ranges[key];
      if (Math.abs(range.max - range.min) < Number.EPSILON) return [key, 100];
      const normalized = key === "sla"
        ? (plan.metrics[key] - range.min) / (range.max - range.min)
        : (range.max - plan.metrics[key]) / (range.max - range.min);
      return [key, normalized * 100];
    })) as ObjectiveScores;
    return { ...plan, objectiveScores };
  });
}

function weightedScore(scores: ObjectiveScores, weights: PolicyWeights) {
  const total = objectiveKeys.reduce((sum, key) => sum + weights[key], 0);
  return objectiveKeys.reduce((sum, key) => sum + scores[key] * weights[key], 0) / total;
}

function planKey(choices: Array<Candidate | null>) {
  return choices.map(choice => choice?.technicianId ?? "RESCHEDULED").join("|");
}

export function optimizeRecovery(inputWeights: PolicyWeights): RecoveryPlan {
  const weights = sanitizeWeights(inputWeights);
  const eligible = jobs.map(job => job.candidates.filter(isEligible));
  const rejectedCandidates = jobs.reduce((sum, job) => sum + job.candidates.filter(value => !isEligible(value)).length, 0);
  const options = eligible.map(candidates => [null, ...candidates] as Array<Candidate | null>);
  const assignments = new Array<Candidate | null>(jobs.length).fill(null);
  const loads: Record<string, number> = Object.fromEntries(Object.keys(capacities).map(id => [id, 0]));
  const feasiblePlans: Array<{ choices: Array<Candidate | null>; metrics: RawMetrics }> = [];
  let scenariosEvaluated = 0;

  const search = (index: number, assignedCount: number) => {
    if (index === jobs.length) {
      scenariosEvaluated += 1;
      if (assignedCount === requiredAssignments) {
        const choices = [...assignments];
        feasiblePlans.push({ choices, metrics: planMetrics(choices) });
      }
      return;
    }

    for (const choice of options[index]) {
      if (choice && loads[choice.technicianId] >= capacities[choice.technicianId]) continue;
      assignments[index] = choice;
      if (choice) loads[choice.technicianId] += 1;
      search(index + 1, assignedCount + (choice ? 1 : 0));
      if (choice) loads[choice.technicianId] -= 1;
    }
  };

  search(0, 0);
  if (feasiblePlans.length === 0) throw new Error("No recovery plan satisfies the hard constraints");

  const evaluated: EvaluatedPlan[] = normalizeMetrics(feasiblePlans).map(plan => ({
    ...plan,
    score: weightedScore(plan.objectiveScores, weights),
  }));
  evaluated.sort((left, right) => {
    const scoreDifference = right.score - left.score;
    if (Math.abs(scoreDifference) > 1e-9) return scoreDifference;
    const leftBalance = objectiveKeys.reduce((sum, key) => sum + left.objectiveScores[key], 0);
    const rightBalance = objectiveKeys.reduce((sum, key) => sum + right.objectiveScores[key], 0);
    if (Math.abs(rightBalance - leftBalance) > 1e-9) return rightBalance - leftBalance;
    return planKey(left.choices).localeCompare(planKey(right.choices));
  });

  const best = evaluated[0];
  const selected = best.choices.map((choice, index) => ({ choice, job: jobs[index] }));
  const assigned = selected.filter((item): item is { choice: Candidate; job: Job } => item.choice !== null);
  const rescheduled = selected.filter(item => item.choice === null).map(item => ({
    id: item.job.id,
    job: `${item.job.serviceOperation} · ${item.job.vehicle}`,
    window: item.job.window,
  }));
  const addedTravel = assigned.reduce((sum, item) => sum + item.choice.travelMiles + item.choice.scheduleDisplacementMinutes / 3, 0);
  const overtime = assigned.reduce((sum, item) => sum + item.choice.overtimeHours, 0);
  const assignedPromiseWeight = assigned.reduce((sum, item) => sum + item.job.promiseCriticality, 0);
  const projectedSla = assigned.reduce((sum, item) => {
    const probability = Math.max(0, 100 - item.choice.delayMinutes * 0.22 - item.choice.overtimeHours * 8);
    return sum + probability * item.job.promiseCriticality;
  }, 0) / Math.max(0.01, assignedPromiseWeight);
  const scoreMargin = best.score - (evaluated[1]?.score ?? best.score);
  const scheduleDisplacementMinutes = assigned.reduce((sum, item) => sum + item.choice.scheduleDisplacementMinutes, 0);
  const technicianHours: Record<string, number> = Object.fromEntries(Object.keys(capacities).map(id => [id, 0]));
  assigned.forEach(item => {
    technicianHours[item.choice.technicianId] += item.job.laborHours;
  });
  const hourValues = Object.values(technicianHours);

  return {
    assignments: assigned.map(item => ({
      jobId: item.job.id,
      window: item.job.window,
      job: `${item.job.serviceOperation} · ${item.job.vehicle}`,
      from: "Jonah Reed",
      to: item.choice.technicianName,
      impactMinutes: item.choice.delayMinutes,
      travelMiles: item.choice.travelMiles,
      overtimeHours: item.choice.overtimeHours,
    })),
    rescheduled,
    score: round(best.score),
    confidence: Math.min(98, Math.max(72, Math.round(82 + scoreMargin * 2))),
    projectedSla: round(projectedSla),
    addedTravel: round(addedTravel),
    overtime: round(overtime),
    scenariosEvaluated,
    feasibleScenarios: feasiblePlans.length,
    rejectedCandidates,
    objectiveScores: Object.fromEntries(objectiveKeys.map(key => [key, round(best.objectiveScores[key])])) as ObjectiveScores,
    decisionEvidence: {
      callbacks: rescheduled.length,
      scheduleDisplacementMinutes,
      flaggedHoursSpread: round(Math.max(...hourValues) - Math.min(...hourValues)),
    },
  };
}

export function validateRecoveryPlan(plan: Pick<RecoveryPlan, "assignments" | "rescheduled">) {
  const errors: string[] = [];
  const seen = new Set<string>();
  const technicianLoads: Record<string, number> = Object.fromEntries(Object.keys(capacities).map(id => [id, 0]));

  for (const assignment of plan.assignments) {
    if (seen.has(assignment.jobId)) errors.push(`Duplicate repair order ${assignment.jobId}`);
    seen.add(assignment.jobId);
    const job = jobs.find(value => value.id === assignment.jobId);
    if (!job) {
      errors.push(`Unknown repair order ${assignment.jobId}`);
      continue;
    }
    const selectedCandidate = job.candidates.find(value => value.technicianName === assignment.to);
    if (!selectedCandidate || !isEligible(selectedCandidate)) {
      errors.push(`Ineligible assignment for ${assignment.jobId}`);
      continue;
    }
    technicianLoads[selectedCandidate.technicianId] += 1;
    if (assignment.impactMinutes !== selectedCandidate.delayMinutes || assignment.travelMiles !== selectedCandidate.travelMiles || assignment.overtimeHours !== selectedCandidate.overtimeHours) {
      errors.push(`Assignment evidence does not match the candidate for ${assignment.jobId}`);
    }
  }

  for (const item of plan.rescheduled) {
    if (seen.has(item.id)) errors.push(`Duplicate repair order ${item.id}`);
    seen.add(item.id);
    if (!jobs.some(job => job.id === item.id)) errors.push(`Unknown repair order ${item.id}`);
  }

  for (const [technicianId, load] of Object.entries(technicianLoads)) {
    if (load > capacities[technicianId]) errors.push(`${technicianId} exceeds capacity`);
  }
  if (plan.assignments.length !== requiredAssignments) errors.push(`Expected ${requiredAssignments} assignments`);
  if (seen.size !== jobs.length || jobs.some(job => !seen.has(job.id))) errors.push("Plan does not account for every affected repair order");

  return { valid: errors.length === 0, errors };
}

export const defaultPolicyWeights: PolicyWeights = { sla: 35, travel: 25, load: 20, overtime: 15, stability: 5 };
