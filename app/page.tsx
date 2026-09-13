"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Activity, AlertTriangle, ArrowRight, BrainCircuit, CalendarRange, Check, ChevronDown, CircleDot, FlaskConical, Gauge, Map, Menu, MoreHorizontal, Navigation, Route, Search, Settings2, ShieldCheck, Sparkles, Stethoscope, Undo2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { AgentOpsControlTower } from "@/components/agentops-control-tower";
import { TechnicianDiagnosticCopilot } from "@/components/technician-diagnostic-copilot";
import { ShopBoard } from "@/components/shop-board";
import { RepairOrdersBoard } from "@/components/repair-orders-board";
import { defaultPolicyWeights, optimizeRecovery, type PolicyWeights, type RecoveryPlan } from "@/lib/dispatch-optimizer";
import { serviceBays } from "@/lib/service-operations-data";

type PlanStatus = "AWAITING_APPROVAL" | "APPROVED" | "EXECUTING" | "EXECUTED" | "REJECTED" | "EXECUTION_FAILED" | "ROLLING_BACK" | "ROLLED_BACK" | "ROLLBACK_FAILED";
type PersistedPlan = RecoveryPlan & { id: string; disruptionId: string; status: PlanStatus; version: number; policyVersion: number; optimizerVersion: string; createdAt: string; updatedAt: string };
type AuditRow = { id: string; action: string; entity_type: string; entity_id: string; from_status: string | null; to_status: string | null; actor_role: string; metadata_json: string; created_at: string };
type TechnicianRow = { id: string; name: string; specialty: string; status: string; active_stops: number; route_miles: number; utilization: number };
type Snapshot = { operator: { id: string; displayName: string; role: "technician" | "dispatcher" | "supervisor" | "admin" }; technicians: TechnicianRow[]; workOrders: Array<Record<string, unknown>>; policy: PolicyWeights & { version: number; updatedAt: string }; activePlan: PersistedPlan | null; audit: AuditRow[]; backend: { persistence: string; optimizer: string; serverTime: string } };
type Technician = { id: string; initials: string; name: string; specialty: string; stops: number; miles: number; utilization: number; status: "In bay" | "Road test" | "Available" | "Unavailable"; color: string };

const technicianVisuals: Record<string, Pick<Technician, "initials" | "color">> = { "T-147": { initials: "DM", color: "#ee6b45" }, "T-208": { initials: "SC", color: "#b78cff" }, "T-274": { initials: "JR", color: "#4ad1a8" }, "T-319": { initials: "AP", color: "#f5bd4f" } };
const fallbackTechnicians: Technician[] = [
  { id: "T-147", initials: "DM", name: "Darius Miles", specialty: "Engine performance", stops: 6, miles: 42.8, utilization: 86, status: "In bay", color: "#ee6b45" },
  { id: "T-208", initials: "SC", name: "Sofia Chen", specialty: "Electrical & ADAS", stops: 7, miles: 36.2, utilization: 91, status: "Road test", color: "#b78cff" },
  { id: "T-274", initials: "JR", name: "Jonah Reed", specialty: "Drivability", stops: 5, miles: 31.4, utilization: 74, status: "In bay", color: "#4ad1a8" },
  { id: "T-319", initials: "AP", name: "Amara Patel", specialty: "Master technician", stops: 7, miles: 39.1, utilization: 94, status: "In bay", color: "#f5bd4f" },
];
const CapacityPlanning = dynamic(() => import("@/components/capacity-planning").then(module => module.CapacityPlanning), { ssr: false, loading: () => <div className="capacity-loading"><strong>Loading capacity planning</strong><span>Preparing forecast and scenario controls.</span></div> });
const SimulationBenchmark = dynamic(() => import("@/components/simulation-benchmark").then(module => module.SimulationBenchmark), { ssr: false, loading: () => <div className="benchmark-loading"><strong>Loading benchmark evidence</strong><span>Preparing scale profiles and regression gates.</span></div> });
const navItems = [[Gauge, "Service command"], [Map, "Shop board"], [Route, "Repair orders"], [Users, "Technicians"], [Activity, "Performance"], [CalendarRange, "Capacity Planning"], [FlaskConical, "Simulation Lab"], [Stethoscope, "Diagnostic Copilot"], [BrainCircuit, "AgentOps"]] as const;
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed (${response.status})`);
  return body as T;
}

function displayStatus(value: string): Technician["status"] {
  if (value === "IN_BAY" || value === "AT_SERVICE") return "In bay";
  if (value === "ROAD_TEST" || value === "ON_ROUTE") return "Road test";
  if (value === "AVAILABLE") return "Available";
  if (value === "UNAVAILABLE") return "Unavailable";
  return "In bay";
}

function repairOrderId(value: string) {
  return value.replace(/^WO-/, "RO-");
}

function Metric({ code, label, value, detail, trend }: { code: string; label: string; value: string; detail: string; trend?: string }) {
  return <div className="metric-card"><div className="metric-head"><span className="metric-code">{code}</span><div className="metric-label">{label}</div></div><div className="metric-row"><strong>{value}</strong>{trend && <span className="trend">{trend}</span>}</div><span className="metric-detail">{detail}</span><span className="metric-scan" aria-hidden="true"/></div>;
}

function ProductStory({ plan, busy, backendOnline, onSimulate, onPolicy }: { plan: RecoveryPlan; busy: boolean; backendOnline: boolean; onSimulate: () => void; onPolicy: () => void }) {
  const tracedAssignment = plan.assignments.find(assignment => repairOrderId(assignment.jobId) === "RO-48372") ?? plan.assignments[0];
  const [serviceOperation, vehicle] = tracedAssignment?.job.split(" · ") ?? ["Intermittent no-start", "2023 G70"];

  return <section className="product-story" aria-labelledby="project-story-title">
    <div className="story-narrative">
      <div className="story-kicker"><span>PORTFOLIO CASE STUDY / 01</span><span>PRODUCTION-GRADE PROTOTYPE</span></div>
      <h2 id="project-story-title">One technician calls out. Seven repair orders and their promised times are now at risk.</h2>
      <p className="story-lede">FieldOps AI turns a sudden shop-capacity gap into a feasible recovery plan. The service manager reviews the evidence, approves the moves, and keeps every consequential action auditable.</p>
      <div className="story-actions"><Button onClick={onSimulate} disabled={busy || !backendOnline}><Sparkles/> {busy ? "Evaluating disruption..." : "Run the live disruption"}</Button><Button variant="outline" onClick={onPolicy} disabled={busy || !backendOnline}><Settings2/> Inspect decision policy</Button></div>
      <figure className="story-visual">
        <Image src="/images/service-department-operations.webp" alt="A service advisor and service manager reviewing a repair plan inside an active automotive service department" fill priority sizes="(max-width: 1050px) calc(100vw - 40px), 46vw"/>
        <figcaption><span><small>01</small><strong>Capacity fails</strong></span><span><small>02</small><strong>AI builds recovery</strong></span><span><small>03</small><strong>Manager authorizes</strong></span></figcaption>
      </figure>
    </div>
    <aside className="story-case" aria-label="Live operating scenario">
      <div className="case-signal"><span>LIVE OPERATING SCENARIO</span><span className="case-live"><i/> READY</span></div>
      <div className="case-incident"><span><AlertTriangle/> SHOP CAPACITY FAILURE</span><strong>Technician T-274 unavailable</strong><p>Seven active repair orders now compete for qualified capacity.</p></div>
      <div className="decision-path" aria-label="Decision path">
        <div><span>01</span><strong>Ingest</strong><small>Disruption persisted</small></div><ArrowRight/>
        <div><span>02</span><strong>Constrain</strong><small>Ineligible moves removed</small></div><ArrowRight/>
        <div><span>03</span><strong>Approve</strong><small>Service manager reviews</small></div><ArrowRight/>
        <div><span>04</span><strong>Execute</strong><small>RO changes audited</small></div>
      </div>
      <div className="story-outcomes"><div><small>Promises preserved</small><strong>{plan.assignments.length} / 7</strong></div><div><small>On-time projection</small><strong>{plan.projectedSla}%</strong></div><div><small>Manager approval</small><strong>Required</strong></div></div>
      <div className="recovery-trace" aria-label="Representative repair-order recovery">
        <div className="trace-heading"><span>REPAIR-ORDER RECOVERY / LIVE</span><small>CUSTOMER PROMISE</small></div>
        <div className="trace-journey">
          <div className="trace-order">
            <span>AT RISK</span>
            <strong>{tracedAssignment ? repairOrderId(tracedAssignment.jobId) : "RO-48372"}</strong>
            <small>{vehicle}</small>
          </div>
          <div className="trace-route" aria-hidden="true"><i/><b/><i/><b/><i/></div>
          <div className="trace-resolution">
            <span>RECOVERY PLAN</span>
            <strong>{tracedAssignment?.to ?? "Amara Patel"}</strong>
            <small>{tracedAssignment?.window ?? "3:30 PM"} promise</small>
          </div>
        </div>
        <div className="trace-context"><strong>{serviceOperation}</strong><span>Skill verified</span><span>Capacity checked</span><span>Approval gated</span></div>
      </div>
      <div className="story-application"><ShieldCheck/><div><span>BUILT FOR DEALERSHIP SERVICE OPERATIONS</span></div></div>
    </aside>
  </section>;
}

function RecoveryWalkthrough({ plan, status }: { plan: RecoveryPlan; status?: PlanStatus }) {
  const outcomeStatus = status === "EXECUTED" ? "EXECUTED" : status === "AWAITING_APPROVAL" || status === "APPROVED" ? "PLAN READY" : "LIVE MODEL";

  return <section className="recovery-walkthrough" aria-labelledby="recovery-walkthrough-title">
    <header className="walkthrough-heading">
      <div><span>GUIDED RECOVERY / OPERATING LOGIC</span><h2 id="recovery-walkthrough-title">From service disruption to controlled execution</h2></div>
      <div className="walkthrough-status"><i/><span>{outcomeStatus}</span></div>
    </header>
    <div className="walkthrough-flow">
      <article className="walkthrough-stage disruption-stage">
        <div className="stage-index"><span>01</span><AlertTriangle/></div>
        <small>CAPACITY LOSS</small>
        <strong>1 technician offline</strong>
        <div className="exposure-meter" aria-label="Seven repair orders exposed"><i/><i/><i/><i/><i/><i/><i/></div>
        <p>7 customer promises exposed</p>
      </article>
      <ArrowRight className="walkthrough-arrow" aria-hidden="true"/>
      <article className="walkthrough-stage constraint-stage">
        <div className="stage-index"><span>02</span><ShieldCheck/></div>
        <small>CONSTRAINT SCREEN</small>
        <strong>{plan.scenariosEvaluated.toLocaleString()} scenarios tested</strong>
        <div className="constraint-chips"><span>Skill</span><span>Bay</span><span>Parts</span><span>Load</span></div>
        <p>{plan.rejectedCandidates} invalid assignments removed</p>
      </article>
      <ArrowRight className="walkthrough-arrow" aria-hidden="true"/>
      <article className="walkthrough-stage recovery-stage">
        <div className="stage-index"><span>03</span><Route/></div>
        <small>RECOVERY PLAN</small>
        <strong>{plan.assignments.length} promises preserved</strong>
        <div className="recovery-comparison"><span><b>7</b> at risk</span><ArrowRight/><span><b>{plan.rescheduled.length}</b> callbacks</span></div>
        <p>{plan.projectedSla}% projected on time</p>
      </article>
      <ArrowRight className="walkthrough-arrow" aria-hidden="true"/>
      <article className="walkthrough-stage approval-stage">
        <div className="stage-index"><span>04</span><Check/></div>
        <small>HUMAN CONTROL</small>
        <strong>Manager authorization</strong>
        <div className="control-ledger"><span>Review</span><span>Approve</span><span>Audit</span></div>
        <p>Execution remains reversible</p>
      </article>
    </div>
  </section>;
}

export default function Home() {
  const [selected, setSelected] = useState("Service command");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [activePlan, setActivePlan] = useState<PersistedPlan | null>(null);
  const [weights, setWeights] = useState<PolicyWeights>(defaultPolicyWeights);
  const [policyVersion, setPolicyVersion] = useState(1);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const previewPlan = useMemo(() => optimizeRecovery(weights), [weights]);
  const plan: RecoveryPlan = activePlan ?? previewPlan;
  const incident = activePlan?.status === "AWAITING_APPROVAL" || activePlan?.status === "APPROVED" || activePlan?.status === "EXECUTING";
  const backendOnline = Boolean(snapshot);
  const technicians = useMemo<Technician[]>(() => snapshot ? snapshot.technicians.map(row => ({ id: row.id, initials: technicianVisuals[row.id]?.initials ?? row.name.split(" ").map(part => part[0]).join("").slice(0, 2), color: technicianVisuals[row.id]?.color ?? "#6570ff", name: row.name, specialty: row.specialty, stops: row.active_stops, miles: row.route_miles, utilization: row.utilization, status: displayStatus(row.status) })) : fallbackTechnicians, [snapshot]);
  const visible = useMemo(() => technicians.filter(t => `${t.name} ${t.id} ${t.specialty}`.toLowerCase().includes(search.toLowerCase())), [search, technicians]);

  const loadSnapshot = useCallback(async () => {
    try {
      const data = await api<Snapshot>("/api/operations");
      setSnapshot(data); setActivePlan(data.activePlan);
      setWeights({ sla: data.policy.sla, travel: data.policy.travel, load: data.policy.load, overtime: data.policy.overtime, stability: data.policy.stability });
      setPolicyVersion(data.policy.version); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Operational backend unavailable"); }
  }, []);
  useEffect(() => {
    const task = window.setTimeout(() => void loadSnapshot(), 0);
    return () => window.clearTimeout(task);
  }, [loadSnapshot]);

  const simulate = useCallback(async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await api<{ plan: PersistedPlan }>("/api/disruptions", { method: "POST", body: JSON.stringify({ technicianId: "T-274", idempotencyKey: `fieldops-ui-${crypto.randomUUID()}` }) });
      setActivePlan(result.plan); setReviewOpen(true); await loadSnapshot(); return result.plan;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Disruption simulation failed"); throw cause; }
    finally { setBusy(false); }
  }, [loadSnapshot]);

  const savePolicy = useCallback(async (next: PolicyWeights) => {
    setBusy(true); setError(null);
    try {
      const result = await api<{ policy: PolicyWeights & { version: number } }>("/api/policy", { method: "PUT", body: JSON.stringify({ ...next, expectedVersion: policyVersion }) });
      setWeights(next); setPolicyVersion(result.policy.version); setPolicyOpen(false); setNotice(`Policy version ${result.policy.version} saved. It will govern the next recovery plan.`); await loadSnapshot(); return result.policy;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Policy update failed"); throw cause; }
    finally { setBusy(false); }
  }, [loadSnapshot, policyVersion]);

  const transition = useCallback(async (action: "approve" | "reject" | "execute" | "rollback", sourcePlan = activePlan) => {
    if (!sourcePlan) throw new Error("No persisted recovery plan is available");
    return api<{ plan: PersistedPlan }>("/api/recovery-plans/transition", { method: "POST", body: JSON.stringify({ planId: sourcePlan.id, action, expectedVersion: sourcePlan.version }) });
  }, [activePlan]);

  const accept = useCallback(async () => {
    if (!activePlan) return;
    setBusy(true); setError(null);
    try {
      const approved = activePlan.status === "APPROVED" ? activePlan : (await transition("approve", activePlan)).plan;
      setActivePlan(approved);
      const executed = (await transition("execute", approved)).plan;
      setActivePlan(executed); setReviewOpen(false); setNotice("Recovery plan executed. Five repair orders were reassigned and two advisor callbacks were queued."); await loadSnapshot();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Plan execution failed"); await loadSnapshot(); }
    finally { setBusy(false); }
  }, [activePlan, loadSnapshot, transition]);

  const reject = useCallback(async () => {
    if (!activePlan) return;
    setBusy(true); setError(null);
    try { const result = await transition("reject", activePlan); setActivePlan(result.plan); setReviewOpen(false); setNotice("Recovery plan rejected and retained in the audit history."); await loadSnapshot(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Plan rejection failed"); }
    finally { setBusy(false); }
  }, [activePlan, loadSnapshot, transition]);

  const rollback = useCallback(async () => {
    if (!activePlan) return;
    setBusy(true); setError(null);
    try { const result = await transition("rollback", activePlan); setActivePlan(result.plan); setNotice("Execution rolled back. Original assignments were restored and the compensation was audited."); await loadSnapshot(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Rollback failed"); }
    finally { setBusy(false); }
  }, [activePlan, loadSnapshot, transition]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({ name: "simulate_shop_disruption", title: "Simulate shop disruption", description: "Persist a technician-unavailable event and produce a server-evaluated repair-order recovery plan.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async () => { const result = await simulate(); return { status: result.status, planId: result.id, assignments: result.assignments.length, rescheduled: result.rescheduled.length }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    void Promise.resolve(context.registerTool({ name: "update_shop_policy", title: "Update shop policy", description: "Persist service-department optimization weights with an optimistic concurrency check.", inputSchema: { type: "object", properties: { sla: { type: "number", minimum: 0, maximum: 60 }, travel: { type: "number", minimum: 0, maximum: 60 }, load: { type: "number", minimum: 0, maximum: 60 }, overtime: { type: "number", minimum: 0, maximum: 60 }, stability: { type: "number", minimum: 0, maximum: 60 } }, required: ["sla", "travel", "load", "overtime", "stability"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => { const updated = await savePolicy(input as PolicyWeights); return { status: "persisted", version: updated.version }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    void Promise.resolve(context.registerTool({ name: "execute_recovery_plan", title: "Execute recovery plan", description: "Approve and execute the current persisted recovery plan.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async () => { await accept(); return { status: "executed", planId: activePlan?.id }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [accept, activePlan?.id, savePolicy, simulate]);

  const operatorName = snapshot?.operator.displayName ?? "Michael Palmer";
  const initials = operatorName.split(/\s|@/).filter(Boolean).map(value => value[0]).join("").slice(0, 2).toUpperCase() || "OP";
  const agentOpsView = selected === "AgentOps";
  const diagnosticView = selected === "Diagnostic Copilot";
  const capacityView = selected === "Capacity Planning";
  const benchmarkView = selected === "Simulation Lab";
  const shopBoardView = selected === "Shop board";
  const repairOrdersView = selected === "Repair orders";
  const specializedView = agentOpsView || diagnosticView || capacityView || benchmarkView || shopBoardView || repairOrdersView;
  const viewTitle = agentOpsView ? "AI operations" : diagnosticView ? "Vehicle diagnostics" : capacityView ? "Capacity planning" : benchmarkView ? "Simulation lab" : shopBoardView ? "Shop board" : repairOrdersView ? "Repair orders" : "Service command";
  const viewDescription = agentOpsView ? "Agent fleet governance and release safety" : diagnosticView ? "Evidence, safety, parts, and repair outcomes" : capacityView ? "Appointment forecasts, staffing risk, and scenario decisions" : benchmarkView ? "Dealer-group scale, regression gates, and benchmark evidence" : shopBoardView ? "Live bay occupancy, work state, and customer promise risk" : repairOrdersView ? "Customer promise risk, repair progression, and recovery status" : "Rooftop 01 · live service operation";
  const operatingMode = agentOpsView ? "Monitored fleet" : diagnosticView ? "Grounded support" : capacityView ? "Planning horizon" : benchmarkView ? "Measured runtime" : shopBoardView ? "Floor control" : repairOrdersView ? "Promise control" : "Live operation";
  return <main className="app-shell"><aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
    <div className="brand"><span className="brand-mark"><Route size={18}/></span><span className="brand-name">FIELD<span>/OPS</span><small>Autonomy console</small></span><span className="brand-index">AI</span></div><button className="mobile-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X/></button>
    <div className="territory-code"><span>SERVICE CONTROL</span><strong>ROOFTOP 01 · BOSTON</strong><small>12 BAYS / 27 TECHNICIANS</small></div>
    <nav aria-label="Main navigation"><p>Service operation</p>{navItems.map(([Icon, label], index) => <button key={label} onClick={() => { setSelected(label); setMobileNav(false); }} className={selected === label ? "active" : ""}><span className="nav-index">{String(index + 1).padStart(2, "0")}</span><Icon/><span>{label}</span>{label === "Repair orders" && <small>25</small>}</button>)}</nav>
    <div className={`system-card ${backendOnline ? "online" : ""}`}><div><ShieldCheck/><span>System integrity</span></div><strong>{backendOnline ? "Orchestrator online" : "Establishing link"}</strong><p>{backendOnline ? `${snapshot?.backend.persistence} / ${snapshot?.backend.optimizer}` : "Loading operational state"}</p></div>
    <div className="profile"><span>{initials}</span><div><strong>{operatorName}</strong><small>{snapshot ? `${snapshot.operator.role} · authenticated` : "Authenticating"}</small></div><MoreHorizontal/></div>
  </aside><section className="workspace"><header className="topbar"><button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu/></button><div className="workspace-title"><span>LIVE WORKSPACE / {selected.toUpperCase()}</span><h1>{viewTitle}</h1><p>{viewDescription}</p></div><div className="topbar-actions"><div className="operating"><CircleDot/><span><small>Operating mode</small>{operatingMode}</span><ChevronDown/></div><span className="date"><small>Shift date</small>Saturday, Sep 12</span>{!specializedView && <><Button variant="outline" onClick={() => setPolicyOpen(true)} className="policy-button" disabled={busy || !backendOnline}><Settings2/> Policy</Button><Button onClick={() => void simulate()} className="simulate" disabled={busy || !backendOnline}><Sparkles/> {busy ? "Working..." : "Run disruption"}</Button></>}</div></header>
  {agentOpsView ? <div className="content agentops-content"><AgentOpsControlTower/></div> : diagnosticView ? <div className="content diagnostic-content"><TechnicianDiagnosticCopilot/></div> : capacityView ? <div className="content capacity-content"><CapacityPlanning/></div> : benchmarkView ? <div className="content benchmark-content"><SimulationBenchmark/></div> : shopBoardView ? <div className="content shop-board-content"><ShopBoard/></div> : repairOrdersView ? <div className="content repair-orders-content"><RepairOrdersBoard/></div> : <div className="content">{error && <div className="error-banner"><AlertTriangle/><span>{error}</span><button onClick={() => void loadSnapshot()}>Retry</button></div>}{notice && <div className="success-banner"><Check/><span>{notice}</span>{activePlan?.status === "EXECUTED" && snapshot?.operator.role === "admin" && <button onClick={() => void rollback()} disabled={busy}><Undo2/> Roll back execution</button>}</div>}
    <ProductStory plan={plan} busy={busy} backendOnline={backendOnline} onSimulate={() => void simulate()} onPolicy={() => setPolicyOpen(true)}/>
    <section className="metrics" aria-label="Today's performance"><Metric code="OTP" label="Promise-time attainment" value={incident ? "91.6%" : "94.1%"} detail="Target 92.0%" trend={incident ? "−2.5%" : "+1.8%"}/><Metric code="WIP" label="Open repair orders" value="25" detail="164.5 sold hours"/><Metric code="EFF" label="Shop efficiency" value={incident ? "106%" : "112%"} detail="Target 105%" trend={incident ? "−6 pts" : "+7 pts"}/><Metric code="RSK" label="At-risk promises" value={incident ? "7" : "2"} detail={incident ? "Manager action required" : "Within recovery range"}/></section>
    <RecoveryWalkthrough plan={plan} status={activePlan?.status}/>
    <section className="operations-grid"><ShopFloor/><DecisionPanel audit={snapshot?.audit ?? []} activePlan={activePlan} onReview={() => setReviewOpen(true)}/></section><TechnicianRoster technicians={visible} search={search} onSearch={setSearch}/></div>}
  <RecoveryDialog open={reviewOpen} onOpenChange={setReviewOpen} onAccept={() => void accept()} onReject={() => void reject()} plan={plan} weights={weights} busy={busy} persistedPlan={activePlan}/><PolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} weights={weights} onChange={setWeights} onApply={() => void savePolicy(weights)} plan={previewPlan} busy={busy} policyVersion={policyVersion}/></section></main>;
}

function ShopFloor() {
  return <article className="panel map-panel"><div className="panel-heading"><div><span className="panel-code">01 / SHOP FLOOR</span><h2>Live service operation</h2><p>25 active repair orders · 12 service bays</p></div><div className="map-key"><span><i/> In progress</span><span><i className="service-dot"/> At risk</span></div></div><div className="shop-surface"><div className="shop-status"><span><i/> SHOP SIGNAL LIVE</span><strong>WIP CONTROL · ROOFTOP 01</strong></div><div className="shop-grid">{serviceBays.slice(0, 8).map(item => <div className={`bay-card ${item.tone}`} key={item.id}><div className="bay-head"><span>BAY {item.id}</span><strong>{item.initials}</strong></div><small>{item.statusLabel.toUpperCase()}</small><h3>{item.repairOrder}</h3><p>{item.vehicle}</p><b>{item.operation}</b></div>)}</div><div className="map-summary"><Navigation/><div><strong>Next shop-load evaluation</strong><span>in 4 min 32 sec</span></div></div></div></article>;
}

function auditCopy(row: AuditRow) {
  const titles: Record<string, string> = { PLAN_CREATED: "Recovery plan created", PLAN_APPROVE: "Plan approved", PLAN_EXECUTED: "Assignments executed", PLAN_REJECT: "Plan rejected", PLAN_ROLLED_BACK: "Execution rolled back", POLICY_UPDATED: "Policy updated", PLAN_EXECUTION_FAILED: "Execution stopped", PLAN_ROLLBACK_FAILED: "Rollback stopped" };
  return { title: titles[row.action] ?? row.action.replaceAll("_", " ").toLowerCase(), text: `${row.entity_type.replaceAll("_", " ")} ${row.entity_id.slice(-12)} · ${row.actor_role}${row.to_status ? ` · ${row.to_status.replaceAll("_", " ").toLowerCase()}` : ""}`, time: new Date(row.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) };
}

function DecisionPanel({ audit, activePlan, onReview }: { audit: AuditRow[]; activePlan: PersistedPlan | null; onReview: () => void }) {
  const reviewable = activePlan?.status === "AWAITING_APPROVAL" || activePlan?.status === "APPROVED";
  return <aside className="panel decision-panel"><div className="panel-heading"><div><span className="panel-code">02 / DECISIONS</span><h2>Service priority queue</h2><p>Immutable operational audit</p></div><button aria-label="Decision options"><MoreHorizontal/></button></div><div className="decision-list">{reviewable && <Decision icon={<AlertTriangle/>} title="Shop capacity disruption" time="Now" text="Technician T-274 is unavailable. Seven repair orders were evaluated for recovery." action={onReview}/>} {audit.slice(0, reviewable ? 3 : 4).map((row, index) => { const copy = auditCopy(row); return <Decision key={row.id} tone={index % 3 === 0 ? "purple" : index % 3 === 1 ? "green" : "gold"} icon={row.action === "POLICY_UPDATED" ? <Settings2/> : row.action.includes("ROLL") ? <Undo2/> : <Route/>} {...copy}/>; })}{audit.length === 0 && <Decision tone="green" icon={<ShieldCheck/>} title="Audit ready" time="Now" text="Persistent decision history will appear after the first service action."/>}</div><button className="view-log">PostgreSQL audit channel <ShieldCheck/></button></aside>;
}

function Decision({ icon, title, time, text, tone = "", action }: { icon: React.ReactNode; title: string; time: string; text: string; tone?: string; action?: () => void }) {
  return <div className="decision"><span className={`decision-icon ${tone}`}>{icon}</span><div><div className="decision-top"><strong>{title}</strong><time>{time}</time></div><p>{text}</p>{action ? <button onClick={action}>Review recovery plan <ArrowRight/></button> : <span className="auto"><Check/> Persisted and audited</span>}</div></div>;
}

function TechnicianRoster({ technicians, search, onSearch }: { technicians: Technician[]; search: string; onSearch: (value: string) => void }) {
  return <section className="panel roster-panel"><div className="panel-heading roster-heading"><div><span className="panel-code">03 / SHOP TEAM</span><h2>Technician workload</h2><p>Live repair-order load and efficiency</p></div><label className="search"><Search/><input value={search} onChange={event => onSearch(event.target.value)} placeholder="Filter technicians" aria-label="Search technician"/></label></div><div className="table-wrap"><table><thead><tr><th>Technician</th><th>Status</th><th>Certification group</th><th>Active ROs</th><th>Flagged hours</th><th>Utilization</th></tr></thead><tbody>{technicians.map(tech => <tr key={tech.id}><td><div className="tech"><span style={{ background: tech.color }}>{tech.initials}</span><div><strong>{tech.name}</strong><small>{tech.id}</small></div></div></td><td><span className={`status ${tech.status.replace(" ", "-").toLowerCase()}`}>{tech.status}</span></td><td>{tech.specialty}</td><td>{tech.stops}</td><td>{tech.miles} hr</td><td><div className="util"><span><i style={{ width: `${tech.utilization}%` }}/></span><strong>{tech.utilization}%</strong></div></td></tr>)}</tbody></table>{technicians.length === 0 && <div className="empty">No technicians match “{search}”.</div>}</div></section>;
}

function RecoveryDialog({ open, onOpenChange, onAccept, onReject, plan, weights, busy, persistedPlan }: { open: boolean; onOpenChange: (open: boolean) => void; onAccept: () => void; onReject: () => void; plan: RecoveryPlan; weights: PolicyWeights; busy: boolean; persistedPlan: PersistedPlan | null }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="recovery-dialog sm:max-w-[920px]"><DialogHeader><div className="recovery-title-row"><span><BrainCircuit/></span><div><DialogTitle>{persistedPlan ? `Recovery plan ${persistedPlan.id.slice(-12)}` : "Recovery plan preview"}</DialogTitle><DialogDescription>Technician T-274 unavailable · 7 repair orders affected{persistedPlan ? ` · version ${persistedPlan.version}` : ""}</DialogDescription></div><span className="confidence">{plan.confidence}% confidence</span></div></DialogHeader>
    <div className="recovery-summary"><div><small>Preserved promises</small><strong>{plan.assignments.length} of 7</strong><span>{plan.rescheduled.length} need advisor outreach</span></div><div><small>On-time projection</small><strong>{plan.projectedSla}%</strong><span>Plan score {plan.score} / 100</span></div><div><small>Added handoff load</small><strong>{plan.addedTravel} min</strong><span>Across 3 technicians</span></div><div><small>Overtime exposure</small><strong>{plan.overtime} hr</strong><span>{plan.overtime > .5 ? "Approval threshold exceeded" : "Within policy limit"}</span></div></div>
    <div className="recovery-body"><section><div className="section-title"><div><h3>Recommended RO reassignments</h3><p>Best of {plan.feasibleScenarios.toLocaleString()} feasible plans from {plan.scenariosEvaluated.toLocaleString()} evaluated</p></div><span>{plan.assignments.length} technician changes</span></div><div className="move-list">{plan.assignments.map(move => <div className="move" key={move.jobId}><div><strong>{repairOrderId(move.jobId)}</strong><small>Promise {move.window}</small></div><div className="job"><strong>{move.job}</strong><small>{move.from} <ArrowRight/> {move.to}</small></div><span>+{move.impactMinutes} min</span></div>)}</div><div className="customer-impact"><AlertTriangle/><div><strong>{plan.rescheduled.length} promised times cannot be preserved</strong><p>{plan.rescheduled.map(item => repairOrderId(item.id)).join(" and ")} exceed qualified technician capacity. Service advisors must contact those customers before commitments change.</p></div><button>View repair orders</button></div></section>
    <aside><div className="constraint-header"><ShieldCheck/><div><h3>Constraint validation</h3><p>All hard constraints passed</p></div></div>{["OEM certification", "Shift availability", "Bay and equipment", "Staged parts", "Technician capacity"].map(label => <div className="constraint" key={label}><Check/><span>{label}</span><strong>Passed</strong></div>)}<div className="policy-note"><small>Solver evidence</small><strong>{plan.rejectedCandidates} ineligible candidates excluded</strong><p>Invalid assignments are removed before weighted scoring. Human approval remains required before promised times change.</p></div></aside></div>
    <div className="audit-note"><span>Decision basis</span> promise-time protection {weights.sla}% · workflow movement {weights.travel}% · technician load {weights.load}% · overtime {weights.overtime}% · schedule stability {weights.stability}%{persistedPlan && <> · policy v{persistedPlan.policyVersion} · {persistedPlan.optimizerVersion}</>}</div>
    <DialogFooter><Button variant="outline" onClick={onReject} disabled={busy || !persistedPlan}>Reject plan</Button><Button variant="outline" disabled>Modify assignments</Button><Button onClick={onAccept} className="accept-plan" disabled={busy || !persistedPlan}><Check/> {busy ? "Executing..." : "Approve and execute"}</Button></DialogFooter></DialogContent></Dialog>;
}

function PolicyDialog({ open, onOpenChange, weights, onChange, onApply, plan, busy, policyVersion }: { open: boolean; onOpenChange: (open: boolean) => void; weights: PolicyWeights; onChange: (weights: PolicyWeights) => void; onApply: () => void; plan: RecoveryPlan; busy: boolean; policyVersion: number }) {
  const controls: [keyof PolicyWeights, string, string][] = [["sla", "Promise-time protection", "Prioritize repair orders completed inside the customer commitment"], ["travel", "Workflow movement", "Reduce handoffs, vehicle movement, and bay disruption"], ["load", "Technician load", "Balance flagged hours across qualified technicians"], ["overtime", "Overtime reduction", "Limit work extending beyond scheduled shifts"], ["stability", "Schedule stability", "Avoid advisor callbacks and repair-order churn"]];
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="policy-dialog sm:max-w-[620px]"><DialogHeader><DialogTitle>Optimization policy · version {policyVersion}</DialogTitle><DialogDescription>Adjust service priorities. Saving uses optimistic concurrency and applies the policy to the next server-side recovery evaluation.</DialogDescription></DialogHeader><div className="policy-score"><div><span>Preview score</span><strong>{plan.score}</strong></div><div><span>On-time projection</span><strong>{plan.projectedSla}%</strong></div><div><span>Raw weight total</span><strong>{total}</strong></div></div><div className="weight-controls">{controls.map(([key, label, description]) => <div className="weight-control" key={key}><div><strong>{label}</strong><span>{weights[key]}%</span></div><p>{description}</p><Slider min={0} max={60} step={5} value={[weights[key]]} onValueChange={value => onChange({ ...weights, [key]: value[0] })}/></div>)}</div><div className="solver-note"><BrainCircuit/><div><strong>Deterministic recomputation</strong><p>Hard constraints remain non-negotiable. The server records the policy version used for every recovery plan.</p></div></div><DialogFooter><Button variant="outline" onClick={() => onChange(defaultPolicyWeights)} disabled={busy}>Restore defaults</Button><Button onClick={onApply} disabled={busy || total === 0}>{busy ? "Saving..." : "Save policy"}</Button></DialogFooter></DialogContent></Dialog>;
}
