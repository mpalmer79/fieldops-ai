"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CalendarRange,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  FlaskConical,
  Gauge,
  Map,
  Route,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { workspaceRoutes, type WorkspaceSlug } from "@/app/control-room/workspace-routes";
import type { RecoveryPlan } from "@/lib/dispatch-optimizer";
import styles from "./service-command-v2.module.css";

type PlanStatus =
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "EXECUTING"
  | "EXECUTED"
  | "REJECTED"
  | "EXECUTION_FAILED"
  | "ROLLING_BACK"
  | "ROLLED_BACK"
  | "ROLLBACK_FAILED";

type PersistedPlan = RecoveryPlan & {
  id: string;
  disruptionId: string;
  status: PlanStatus;
  version: number;
  policyVersion: number;
  optimizerVersion: string;
  createdAt: string;
  updatedAt: string;
};

type TechnicianRow = {
  id: string;
  name: string;
  specialty: string;
  status: string;
  active_stops: number;
  route_miles: number;
  utilization: number;
};

type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  from_status: string | null;
  to_status: string | null;
  actor_role: string;
  created_at: string;
};

type Snapshot = {
  operator: { id: string; displayName: string; role: string };
  technicians: TechnicianRow[];
  policy: { sla: number; travel: number; load: number; overtime: number; stability: number; version: number; updatedAt: string };
  activePlan: PersistedPlan | null;
  audit: AuditRow[];
  metrics: {
    openRepairOrders: number;
    atRiskPromises: number;
    unavailableTechnicians: number;
    reassignedRepairOrders: number;
    averageTechnicianUtilization: number | null;
    projectedPromiseAttainment: number | null;
  };
  backend: { persistence: string; optimizer: string; serverTime: string };
};

type Phase = "idle" | "detected" | "exposed" | "constrained" | "optimized" | "review" | "executing" | "complete";

type Stage = {
  key: string;
  label: string;
  detail: string;
  rank: number;
};

const phaseRank: Record<Phase, number> = {
  idle: -1,
  detected: 0,
  exposed: 1,
  constrained: 2,
  optimized: 3,
  review: 4,
  executing: 5,
  complete: 6,
};

const stages: Stage[] = [
  { key: "detect", label: "Detect", detail: "Technician unavailable", rank: 0 },
  { key: "expose", label: "Expose", detail: "Promises at risk", rank: 1 },
  { key: "constrain", label: "Constrain", detail: "Invalid moves removed", rank: 2 },
  { key: "optimize", label: "Optimize", detail: "Best feasible plan", rank: 3 },
  { key: "authorize", label: "Authorize", detail: "Manager gate", rank: 4 },
  { key: "execute", label: "Execute", detail: "Audited changes", rank: 5 },
];

const workspaceIcons: Record<WorkspaceSlug, LucideIcon> = {
  "service-command": Gauge,
  "shop-board": Map,
  "repair-orders": Route,
  technicians: Users,
  performance: Activity,
  "capacity-planning": CalendarRange,
  "simulation-lab": FlaskConical,
  "diagnostic-copilot": Stethoscope,
  agentops: BrainCircuit,
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed (${response.status})`);
  return body as T;
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function repairOrderId(value: string) {
  return value.replace(/^WO-/, "RO-");
}

function displayStatus(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function phaseFromPlan(plan: PersistedPlan | null): Phase {
  if (!plan) return "idle";
  if (plan.status === "EXECUTED") return "complete";
  if (plan.status === "EXECUTING") return "executing";
  if (plan.status === "AWAITING_APPROVAL" || plan.status === "APPROVED") return "review";
  return "idle";
}

function formatAuditAction(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export function ServiceCommandV2() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [activePlan, setActivePlan] = useState<PersistedPlan | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSnapshot = useCallback(async (synchronizePhase = true) => {
    try {
      const data = await api<Snapshot>("/api/operations");
      setSnapshot(data);
      setActivePlan(data.activePlan);
      if (synchronizePhase) setPhase(phaseFromPlan(data.activePlan));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Operational backend unavailable");
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const transition = useCallback(async (action: "approve" | "reject" | "execute", plan: PersistedPlan) => {
    return api<{ plan: PersistedPlan }>("/api/recovery-plans/transition", {
      method: "POST",
      body: JSON.stringify({ planId: plan.id, action, expectedVersion: plan.version }),
    });
  }, []);

  const runDisruption = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setPhase("detected");

    try {
      const request = api<{ plan: PersistedPlan }>("/api/disruptions", {
        method: "POST",
        body: JSON.stringify({
          technicianId: "T-274",
          idempotencyKey: `service-command-${crypto.randomUUID()}`,
        }),
      });

      await sleep(360);
      setPhase("exposed");
      await sleep(440);
      setPhase("constrained");
      await sleep(520);

      const result = await request;
      setActivePlan(result.plan);
      setPhase("optimized");
      await sleep(420);
      setPhase("review");
      await loadSnapshot(false);
    } catch (cause) {
      setPhase("idle");
      setError(cause instanceof Error ? cause.message : "Disruption simulation failed");
    } finally {
      setBusy(false);
    }
  }, [loadSnapshot]);

  const approveAndExecute = useCallback(async () => {
    if (!activePlan) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const approved = activePlan.status === "APPROVED" ? activePlan : (await transition("approve", activePlan)).plan;
      setActivePlan(approved);
      setPhase("executing");
      await sleep(420);
      const executed = (await transition("execute", approved)).plan;
      setActivePlan(executed);
      await loadSnapshot(false);
      setPhase("complete");
      setNotice("Recovery executed. Five repair orders were reassigned, two advisor callbacks were queued, and the decision trail was persisted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recovery execution failed");
      await loadSnapshot();
    } finally {
      setBusy(false);
    }
  }, [activePlan, loadSnapshot, transition]);

  const rejectPlan = useCallback(async () => {
    if (!activePlan) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const rejected = (await transition("reject", activePlan)).plan;
      setActivePlan(rejected);
      setPhase("idle");
      setNotice("Recovery plan rejected. The recommendation remains in the audit history and no operational changes were executed.");
      await loadSnapshot(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recovery rejection failed");
    } finally {
      setBusy(false);
    }
  }, [activePlan, loadSnapshot, transition]);

  const unavailableTechnician = snapshot?.technicians.find((technician) => technician.id === "T-274");
  const impactedRepairOrders = activePlan ? activePlan.assignments.length + activePlan.rescheduled.length : 7;
  const currentRank = phaseRank[phase];
  const projectedPromise = activePlan?.projectedSla ?? snapshot?.metrics.projectedPromiseAttainment;
  const shiftDate = snapshot
    ? new Date(snapshot.backend.serverTime).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
    : "Loading";

  const operationalState = useMemo(() => {
    if (phase === "complete") return { label: "Recovery executed", tone: styles.successTone };
    if (phase === "review" || phase === "executing") return { label: "Recovery active", tone: styles.warningTone };
    if (currentRank >= 0) return { label: "Disruption detected", tone: styles.dangerTone };
    return { label: "Shop nominal", tone: styles.successTone };
  }, [currentRank, phase]);

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}><Route size={19} /></span>
          <span><strong>FIELD/OPS</strong><small>Service intelligence</small></span>
        </Link>

        <div className={styles.rooftopCard}>
          <span>ROOFTOP 01</span>
          <strong>Service operations</strong>
          <small>12 bays · 27 technicians</small>
        </div>

        <nav className={styles.navigation} aria-label="Control room navigation">
          <p>OPERATIONS</p>
          {workspaceRoutes.map((route, index) => {
            const Icon = workspaceIcons[route.slug];
            const active = route.slug === "service-command";
            return (
              <Link key={route.slug} href={`/control-room/${route.slug}`} className={active ? styles.navActive : styles.navItem} aria-current={active ? "page" : undefined}>
                <span className={styles.navIndex}>{String(index + 1).padStart(2, "0")}</span>
                <Icon size={18} />
                <span>{route.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.systemCard}>
          <div><CircleDot size={13} /><span>{snapshot ? "Systems online" : "Connecting"}</span></div>
          <strong>{snapshot?.backend.optimizer ?? "Optimizer"}</strong>
          <small>{snapshot?.backend.persistence ?? "Loading persistence"}</small>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.eyebrow}>LIVE SERVICE CONTROL</span>
            <h1>Service Command</h1>
            <p>Monitor the shop, absorb disruptions, and authorize bounded recovery.</p>
          </div>
          <div className={styles.topbarActions}>
            <div className={styles.shiftMeta}><small>Shift date</small><strong>{shiftDate}</strong></div>
            <span className={`${styles.stateChip} ${operationalState.tone}`}><i />{operationalState.label}</span>
            <button type="button" className={styles.primaryButton} onClick={() => void runDisruption()} disabled={busy || !snapshot}>
              <Sparkles size={17} />
              {busy && phase !== "review" ? "Running recovery" : "Run disruption"}
            </button>
          </div>
        </header>

        <div className={styles.content}>
          {error && <div className={styles.errorBanner} role="alert"><AlertTriangle size={18} /><span>{error}</span><button type="button" onClick={() => void loadSnapshot()}>Retry</button></div>}
          {notice && <div className={styles.noticeBanner} role="status"><CheckCircle2 size={18} /><span>{notice}</span></div>}

          <section className={styles.commandStrip} aria-label="Current operational state">
            <div>
              <span className={styles.eyebrow}>CURRENT CONDITION</span>
              <h2>{currentRank >= 0 ? "Technician capacity loss is threatening customer promises" : "Shop is operating inside the current plan"}</h2>
              <p>{currentRank >= 0 ? "FieldOps is tracing the impact through repair orders, constraints, qualified capacity, and customer commitments." : "Trigger the controlled disruption to watch the recovery engine work through a realistic technician call-out."}</p>
            </div>
            <div className={styles.conditionCard}>
              <span className={currentRank >= 0 ? styles.conditionIconDanger : styles.conditionIcon}><AlertTriangle size={20} /></span>
              <div><small>Tracked resource</small><strong>T-274 · {unavailableTechnician?.name ?? "Jonah Reed"}</strong><span>{currentRank >= 0 ? "Unavailable · drivability capacity removed" : `${displayStatus(unavailableTechnician?.status ?? "IN_BAY")} · ${unavailableTechnician?.utilization ?? 74}% utilized`}</span></div>
            </div>
          </section>

          <section className={styles.metrics} aria-label="Service command metrics">
            <article><span>OPEN RO</span><strong>{snapshot?.metrics.openRepairOrders ?? "--"}</strong><small>Active repair orders</small></article>
            <article><span>PROMISE RISK</span><strong>{currentRank >= 1 ? impactedRepairOrders : snapshot?.metrics.atRiskPromises ?? "--"}</strong><small>{currentRank >= 1 ? "Exposed by disruption" : "Current at-risk promises"}</small></article>
            <article><span>PROJECTED OTP</span><strong>{projectedPromise == null ? "--" : `${projectedPromise}%`}</strong><small>Promise-time attainment</small></article>
            <article><span>SHOP UTIL</span><strong>{snapshot?.metrics.averageTechnicianUtilization == null ? "--" : `${snapshot.metrics.averageTechnicianUtilization}%`}</strong><small>Average technician load</small></article>
          </section>

          <section className={styles.recoveryPipeline} aria-labelledby="recovery-pipeline-title">
            <div className={styles.sectionHeading}>
              <div><span className={styles.eyebrow}>DISRUPTION RECOVERY PIPELINE</span><h2 id="recovery-pipeline-title">See the decision engine work, not just the final number</h2></div>
              <span className={styles.pipelineStatus}>{phase === "idle" ? "READY" : phase === "complete" ? "COMPLETE" : phase.toUpperCase()}</span>
            </div>
            <div className={styles.stageGrid}>
              {stages.map((stage, index) => {
                const complete = currentRank > stage.rank || phase === "complete";
                const active = currentRank === stage.rank || (phase === "review" && stage.key === "authorize");
                return (
                  <div key={stage.key} className={`${styles.stage} ${complete ? styles.stageComplete : ""} ${active ? styles.stageActive : ""}`}>
                    <div className={styles.stageTop}><span>{String(index + 1).padStart(2, "0")}</span>{complete ? <Check size={16} /> : active ? <CircleDot size={16} /> : <Clock3 size={16} />}</div>
                    <strong>{stage.label}</strong>
                    <small>{stage.detail}</small>
                    {index < stages.length - 1 && <ArrowRight className={styles.stageArrow} size={17} aria-hidden="true" />}
                  </div>
                );
              })}
            </div>
          </section>

          <div className={styles.decisionGrid}>
            <section className={styles.panel} aria-labelledby="impact-title">
              <div className={styles.panelHeading}>
                <div><span className={styles.eyebrow}>OPERATIONAL IMPACT</span><h2 id="impact-title">What changed in the shop</h2></div>
                <span className={styles.panelCount}>{currentRank >= 1 ? impactedRepairOrders : 0} exposed</span>
              </div>
              <div className={styles.impactFlow}>
                <div className={styles.impactNode}><span className={styles.nodeLabel}>CAPACITY LOSS</span><strong>{currentRank >= 0 ? "1 technician offline" : "No active disruption"}</strong><small>{currentRank >= 0 ? "T-274 removed from qualified capacity" : "All scheduled technicians available"}</small></div>
                <ArrowRight size={20} />
                <div className={styles.impactNode}><span className={styles.nodeLabel}>RO EXPOSURE</span><strong>{currentRank >= 1 ? `${impactedRepairOrders} repair orders` : "Awaiting disruption"}</strong><small>{currentRank >= 1 ? "Promise windows recalculated" : "No scenario running"}</small></div>
                <ArrowRight size={20} />
                <div className={styles.impactNode}><span className={styles.nodeLabel}>CUSTOMER EFFECT</span><strong>{activePlan ? `${activePlan.rescheduled.length} callbacks` : currentRank >= 1 ? "Calculating" : "No new callbacks"}</strong><small>{activePlan ? `${activePlan.assignments.length} promises preserved` : "Optimizer determines minimum impact"}</small></div>
              </div>

              <div className={styles.constraintRows}>
                <div><span><ShieldCheck size={17} /> Hard constraints</span><strong>{activePlan ? `${activePlan.rejectedCandidates} candidate moves rejected` : currentRank >= 2 ? "Screening candidates" : "Not evaluated"}</strong></div>
                <div><span><Route size={17} /> Search space</span><strong>{activePlan ? `${activePlan.scenariosEvaluated.toLocaleString()} scenarios evaluated` : currentRank >= 2 ? "Enumerating" : "Not evaluated"}</strong></div>
                <div><span><CheckCircle2 size={17} /> Feasible plans</span><strong>{activePlan ? activePlan.feasibleScenarios.toLocaleString() : currentRank >= 3 ? "Ranking plans" : "Not evaluated"}</strong></div>
              </div>
            </section>

            <section className={styles.panel} aria-labelledby="decision-title">
              <div className={styles.panelHeading}>
                <div><span className={styles.eyebrow}>RECOVERY DECISION</span><h2 id="decision-title">Manager authorization</h2></div>
                <span className={styles.policyTag}>Policy v{snapshot?.policy.version ?? "--"}</span>
              </div>

              {!activePlan && (
                <div className={styles.emptyDecision}>
                  <Sparkles size={26} />
                  <strong>No recovery plan yet</strong>
                  <p>Run the disruption to generate a server-evaluated plan with constraint evidence and a human approval gate.</p>
                  <button type="button" className={styles.secondaryButton} onClick={() => void runDisruption()} disabled={busy || !snapshot}>Run controlled scenario</button>
                </div>
              )}

              {activePlan && (
                <>
                  <div className={styles.decisionScore}>
                    <div><small>Plan score</small><strong>{activePlan.score}</strong></div>
                    <div><small>Confidence</small><strong>{activePlan.confidence}%</strong></div>
                    <div><small>Projected OTP</small><strong>{activePlan.projectedSla}%</strong></div>
                  </div>
                  <div className={styles.decisionSummary}>
                    <CheckCircle2 size={20} />
                    <div><strong>{activePlan.assignments.length} repair orders can be reassigned safely</strong><p>{activePlan.rescheduled.length} repair orders require advisor callbacks. Hard constraints remain intact.</p></div>
                  </div>
                  {phase === "review" && (
                    <div className={styles.approvalActions}>
                      <button type="button" className={styles.approveButton} onClick={() => void approveAndExecute()} disabled={busy}><Check size={17} /> Approve and execute</button>
                      <button type="button" className={styles.rejectButton} onClick={() => void rejectPlan()} disabled={busy}><XCircle size={17} /> Reject plan</button>
                    </div>
                  )}
                  {phase === "executing" && <div className={styles.executingState}><span /><strong>Applying approved repair-order changes and writing audit evidence</strong></div>}
                  {phase === "complete" && <div className={styles.completeState}><CheckCircle2 size={20} /><strong>Execution complete and auditable</strong></div>}
                </>
              )}
            </section>
          </div>

          <section className={styles.panel} aria-labelledby="assignments-title">
            <div className={styles.panelHeading}>
              <div><span className={styles.eyebrow}>REPAIR-ORDER RECOVERY</span><h2 id="assignments-title">Recommended movement</h2></div>
              {activePlan && <span className={styles.panelCount}>{activePlan.assignments.length} reassignments</span>}
            </div>
            {!activePlan ? (
              <div className={styles.tableEmpty}>The movement plan appears here after the optimizer completes the disruption evaluation.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.assignmentTable}>
                  <thead><tr><th>Repair order</th><th>Work</th><th>Move to</th><th>Promise</th><th>Impact</th></tr></thead>
                  <tbody>
                    {activePlan.assignments.map((assignment) => (
                      <tr key={assignment.jobId}>
                        <td><strong>{repairOrderId(assignment.jobId)}</strong><small>From {assignment.from}</small></td>
                        <td>{assignment.job}</td>
                        <td><strong>{assignment.to}</strong><small>{assignment.travelMiles} workflow mi</small></td>
                        <td>{assignment.window}</td>
                        <td><span className={styles.delayChip}>+{assignment.impactMinutes} min</span></td>
                      </tr>
                    ))}
                    {activePlan.rescheduled.map((item) => (
                      <tr key={item.id} className={styles.callbackRow}>
                        <td><strong>{repairOrderId(item.id)}</strong><small>Advisor action</small></td>
                        <td>{item.job}</td>
                        <td><strong>Callback required</strong><small>No unsafe reassignment</small></td>
                        <td>{item.window}</td>
                        <td><span className={styles.callbackChip}>Reschedule</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.auditPanel} aria-labelledby="audit-title">
            <div className={styles.panelHeading}>
              <div><span className={styles.eyebrow}>DECISION STREAM</span><h2 id="audit-title">Recent audit evidence</h2></div>
              <span className={styles.auditGuarantee}><ShieldCheck size={15} /> Consequential actions recorded</span>
            </div>
            <div className={styles.auditList}>
              {(snapshot?.audit ?? []).slice(0, 5).map((entry) => (
                <div key={entry.id} className={styles.auditRow}>
                  <span className={styles.auditDot} />
                  <div><strong>{formatAuditAction(entry.action)}</strong><small>{entry.entity_type} · {entry.entity_id}</small></div>
                  <span>{entry.to_status ?? entry.actor_role}</span>
                  <time>{new Date(entry.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                </div>
              ))}
              {!snapshot?.audit.length && <div className={styles.tableEmpty}>No audit events are available yet.</div>}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
