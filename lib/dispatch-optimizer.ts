export type PolicyWeights = {
  sla: number;
  travel: number;
  load: number;
  overtime: number;
  stability: number;
};

export type RecoveryTechnicianInput = {
  id: string;
  name: string;
  status: string;
  territory: string;
  skills: string[];
  parts: string[];
  routeCapacity: number;
  activeStops: number;
  routeMiles: number;
  utilization: number;
};

export type RecoveryWorkOrderInput = {
  id: string;
  window: string;
  serviceOperation: string;
  vehicle: string;
  requiredSkill: string;
  partCode: string | null;
};

export type RecoveryOptimizationState = {
  territory: string;
  disruptedTechnicianId: string;
  disruptedTechnicianName: string;
  technicians: RecoveryTechnicianInput[];
  workOrders: RecoveryWorkOrderInput[];
};

type Candidate = {
  technicianId: string;
  technicianName: string;
  travelMiles: number;
  delayMinutes: number;
  overtimeHours: number;
  scheduleDisplacementMinutes: number;
};

type Job = RecoveryWorkOrderInput & {
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

type SearchPlan = {
  choices: Array<Candidate | null>;
  assignedCount: number;
  metrics?: RawMetrics;
};

type EvaluatedPlan = SearchPlan & {
  metrics: RawMetrics;
  objectiveScores: ObjectiveScores;
  score: number;
};

export type Assignment = {
  jobId: string;
  window: string;
  job: string;
  fromTechnicianId: string;
  toTechnicianId: string;
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
    projectedLoadSpreadPoints: number;
  };
};

export type RecoveryConstraintResult = {
  eligible: boolean;
  reasons: Array<"disrupted-technician" | "territory" | "off-shift" | "skill" | "part" | "capacity">;
};

const objectiveKeys: Array<keyof PolicyWeights> = ["sla", "travel", "load", "overtime", "stability"];
const unavailableStatuses = new Set(["UNAVAILABLE", "OFF_SHIFT", "ABSENT"]);

const round = (value: number, precision = 1) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

function remainingCapacity(technician: RecoveryTechnicianInput) {
  return Math.max(0, Math.floor(technician.routeCapacity) - Math.max(0, Math.floor(technician.activeStops)));
}

export function evaluateRecoveryConstraints(
  state: RecoveryOptimizationState,
  workOrder: RecoveryWorkOrderInput,
  technician: RecoveryTechnicianInput,
): RecoveryConstraintResult {
  const reasons: RecoveryConstraintResult["reasons"] = [];
  if (technician.id === state.disruptedTechnicianId) reasons.push("disrupted-technician");
  if (technician.territory !== state.territory) reasons.push("territory");
  if (unavailableStatuses.has(technician.status)) reasons.push("off-shift");
  if (!technician.skills.includes(workOrder.requiredSkill)) reasons.push("skill");
  if (workOrder.partCode && !technician.parts.includes(workOrder.partCode)) reasons.push("part");
  if (remainingCapacity(technician) < 1) reasons.push("capacity");
  return { eligible: reasons.length === 0, reasons };
}

function parseWindowMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

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

function candidateMetrics(technician: RecoveryTechnicianInput, promiseRank: number): Candidate {
  const capacity = Math.max(1, technician.routeCapacity);
  const queueRatio = Math.min(1.5, Math.max(0, technician.activeStops / capacity));
  const utilization = Math.min(130, Math.max(0, technician.utilization));
  const milesPerStop = technician.activeStops > 0
    ? Math.max(0, technician.routeMiles) / technician.activeStops
    : Math.max(0, technician.routeMiles);

  return {
    technicianId: technician.id,
    technicianName: technician.name,
    travelMiles: round(milesPerStop * (1 + promiseRank * 0.025)),
    delayMinutes: Math.round(6 + queueRatio * 15 + Math.max(0, utilization - 70) * 0.32 + promiseRank * 1.5),
    overtimeHours: round(Math.max(0, utilization - 88) / 20 + Math.max(0, queueRatio - 0.85) * 0.5),
    scheduleDisplacementMinutes: Math.round(4 + technician.activeStops * 1.3 + queueRatio * 8 + promiseRank * 1.4),
  };
}

function buildJobs(state: RecoveryOptimizationState) {
  const recipients = state.technicians.filter(technician => technician.id !== state.disruptedTechnicianId);
  const orderedOrders = [...state.workOrders].sort((left, right) => {
    const timeDifference = parseWindowMinutes(left.window) - parseWindowMinutes(right.window);
    return timeDifference || left.id.localeCompare(right.id);
  });

  const jobs: Job[] = orderedOrders.map((workOrder, index) => {
    const criticality = Math.max(0.55, 1 - index * 0.075);
    const candidates = recipients
      .filter(technician => evaluateRecoveryConstraints(state, workOrder, technician).eligible)
      .map(technician => candidateMetrics(technician, index));
    return {
      ...workOrder,
      promiseCriticality: criticality,
      callbackCost: 0.55 + criticality * 0.45,
      candidates,
    };
  });

  const rejectedCandidates = orderedOrders.reduce((sum, workOrder) => sum + recipients.filter(
    technician => !evaluateRecoveryConstraints(state, workOrder, technician).eligible,
  ).length, 0);

  return { jobs, recipients, rejectedCandidates };
}

function projectedLoads(
  choices: Array<Candidate | null>,
  recipients: RecoveryTechnicianInput[],
) {
  const assignmentCounts = Object.fromEntries(recipients.map(technician => [technician.id, 0])) as Record<string, number>;
  for (const choice of choices) {
    if (choice) assignmentCounts[choice.technicianId] = (assignmentCounts[choice.technicianId] ?? 0) + 1;
  }
  return recipients.map(technician => {
    const capacity = Math.max(1, technician.routeCapacity);
    return (technician.activeStops + (assignmentCounts[technician.id] ?? 0)) / capacity;
  });
}

function planMetrics(
  choices: Array<Candidate | null>,
  jobs: Job[],
  recipients: RecoveryTechnicianInput[],
): RawMetrics {
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
  });

  const totalPromiseValue = jobs.reduce((sum, job) => sum + job.promiseCriticality, 0);
  const loads = projectedLoads(choices, recipients);
  const averageLoad = loads.length ? loads.reduce((sum, value) => sum + value, 0) / loads.length : 0;
  const loadVariance = loads.length
    ? loads.reduce((sum, value) => sum + (value - averageLoad) ** 2, 0) / loads.length
    : 0;

  return {
    sla: totalPromiseValue > 0 ? protectedPromiseValue / totalPromiseValue : 0,
    travel: workflowMovement,
    load: Math.sqrt(loadVariance),
    overtime,
    stability: stabilityCost,
  };
}

function normalizeMetrics(plans: Array<SearchPlan & { metrics: RawMetrics }>) {
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

export function optimizeRecovery(
  state: RecoveryOptimizationState,
  inputWeights: PolicyWeights,
): RecoveryPlan {
  if (state.workOrders.length === 0) throw new Error("No affected repair orders are available for recovery");
  const weights = sanitizeWeights(inputWeights);
  const { jobs, recipients, rejectedCandidates } = buildJobs(state);
  if (recipients.length === 0) throw new Error("No receiving technicians are available for recovery");

  const capacities = Object.fromEntries(recipients.map(technician => [technician.id, remainingCapacity(technician)])) as Record<string, number>;
  const options = jobs.map(job => [null, ...job.candidates] as Array<Candidate | null>);
  const assignments = new Array<Candidate | null>(jobs.length).fill(null);
  const loads = Object.fromEntries(recipients.map(technician => [technician.id, 0])) as Record<string, number>;
  const searchedPlans: SearchPlan[] = [];
  let scenariosEvaluated = 0;

  const search = (index: number, assignedCount: number) => {
    if (index === jobs.length) {
      scenariosEvaluated += 1;
      searchedPlans.push({ choices: [...assignments], assignedCount });
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
  const maximumAssignments = Math.max(...searchedPlans.map(plan => plan.assignedCount));
  const feasiblePlans = searchedPlans
    .filter(plan => plan.assignedCount === maximumAssignments)
    .map(plan => ({ ...plan, metrics: planMetrics(plan.choices, jobs, recipients) }));
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
  const projected = projectedLoads(best.choices, recipients).map(value => value * 100);
  const projectedLoadSpreadPoints = projected.length ? Math.max(...projected) - Math.min(...projected) : 0;

  return {
    assignments: assigned.map(item => ({
      jobId: item.job.id,
      window: item.job.window,
      job: `${item.job.serviceOperation} · ${item.job.vehicle}`,
      fromTechnicianId: state.disruptedTechnicianId,
      toTechnicianId: item.choice.technicianId,
      from: state.disruptedTechnicianName,
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
      projectedLoadSpreadPoints: round(projectedLoadSpreadPoints),
    },
  };
}

export function validateRecoveryPlan(
  state: RecoveryOptimizationState,
  plan: Pick<RecoveryPlan, "assignments" | "rescheduled">,
) {
  const errors: string[] = [];
  const seen = new Set<string>();
  const recipients = state.technicians.filter(technician => technician.id !== state.disruptedTechnicianId);
  const capacityById = Object.fromEntries(recipients.map(technician => [technician.id, remainingCapacity(technician)])) as Record<string, number>;
  const technicianLoads = Object.fromEntries(recipients.map(technician => [technician.id, 0])) as Record<string, number>;
  const workOrders = new Map(state.workOrders.map(workOrder => [workOrder.id, workOrder]));
  const technicians = new Map(recipients.map(technician => [technician.id, technician]));

  for (const assignment of plan.assignments) {
    if (seen.has(assignment.jobId)) errors.push(`Duplicate repair order ${assignment.jobId}`);
    seen.add(assignment.jobId);
    const workOrder = workOrders.get(assignment.jobId);
    const technician = technicians.get(assignment.toTechnicianId);
    if (!workOrder) {
      errors.push(`Unknown repair order ${assignment.jobId}`);
      continue;
    }
    if (!technician || !evaluateRecoveryConstraints(state, workOrder, technician).eligible) {
      errors.push(`Ineligible assignment for ${assignment.jobId}`);
      continue;
    }
    technicianLoads[technician.id] += 1;
  }

  for (const item of plan.rescheduled) {
    if (seen.has(item.id)) errors.push(`Duplicate repair order ${item.id}`);
    seen.add(item.id);
    if (!workOrders.has(item.id)) errors.push(`Unknown repair order ${item.id}`);
  }

  for (const [technicianId, load] of Object.entries(technicianLoads)) {
    if (load > capacityById[technicianId]) errors.push(`${technicianId} exceeds capacity`);
  }
  if (seen.size !== state.workOrders.length || state.workOrders.some(workOrder => !seen.has(workOrder.id))) {
    errors.push("Plan does not account for every affected repair order");
  }

  return { valid: errors.length === 0, errors };
}

export const defaultPolicyWeights: PolicyWeights = { sla: 35, travel: 25, load: 20, overtime: 15, stability: 5 };
