"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, BrainCircuit, CalendarRange, Check, ChevronDown, CircleDot, FlaskConical, Gauge, Map, Menu, MoreHorizontal, Navigation, Route, Search, Settings2, ShieldCheck, Sparkles, Stethoscope, Undo2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { AgentOpsControlTower } from "@/components/agentops-control-tower";
import { TechnicianDiagnosticCopilot } from "@/components/technician-diagnostic-copilot";
import { ShopBoard } from "@/components/shop-board";
import { RepairOrdersBoard } from "@/components/repair-orders-board";
import { TechnicianCommandCenter } from "@/components/technician-command-center";
import { PerformanceCommandCenter } from "@/components/performance-command-center";
import { ServiceRecoveryCommand, type RecoveryRunPhase } from "@/components/service-recovery-command";
import { defaultPolicyWeights, optimizeRecovery, type PolicyWeights, type RecoveryPlan } from "@/lib/dispatch-optimizer";
import { serviceBays } from "@/lib/service-operations-data";
import { workspaceRoutes, type WorkspaceRoute } from "@/app/control-room/workspace-routes";

type PlanStatus = "AWAITING_APPROVAL" | "APPROVED" | "EXECUTING" | "EXECUTED" | "REJECTED" | "EXECUTION_FAILED" | "ROLLING_BACK" | "ROLLED_BACK" | "ROLLBACK_FAILED";
type PersistedPlan = RecoveryPlan & { id: string; disruptionId: string; status: PlanStatus; version: number; policyVersion: number; optimizerVersion: string; createdAt: string; updatedAt: string };
type AuditRow = { id: string; action: string; entity_type: string; entity_id: string; from_status: string | null; to_status: string | null; actor_role: string; metadata_json: string; created_at: string };
type TechnicianRow = { id: string; name: string; specialty: string; status: string; active_stops: number; route_miles: number; utilization: number };
type Snapshot = { operator: { id: string; displayName: string; role: "technician" | "dispatcher" | "supervisor" | "admin" }; technicians: TechnicianRow[]; workOrders: Array<Record<string, unknown>>; policy: PolicyWeights & { version: number; updatedAt: string }; activePlan: PersistedPlan | null; audit: AuditRow[]; metrics: { openRepairOrders: number; atRiskPromises: number; unavailableTechnicians: number; reassignedRepairOrders: number; averageTechnicianUtilization: number | null; projectedPromiseAttainment: number | null }; backend: { persistence: string; optimizer: string; serverTime: string } };
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
const workspaceIcons = {
  "service-command": Gauge,
  "shop-board": Map,
  "repair-orders": Route,
  technicians: Users,
  performance: Activity,
  "capacity-planning": CalendarRange,
  "simulation-lab": FlaskConical,
  "diagnostic-copilot": Stethoscope,
  agentops: BrainCircuit,
} as const;
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

function recoveryPhase(status?: PlanStatus | null): RecoveryRunPhase {
  if (status === "AWAITING_APPROVAL" || status === "APPROVED") return "review";
  if (status === "EXECUTING") return "executing";
  if (status === "EXECUTED") return "executed";
  if (status === "REJECTED") return "rejected";
  if (status === "ROLLING_BACK") return "executing";
  if (status === "ROLLED_BACK") return "rolled-back";
  return "ready";
}

function wait(milliseconds: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, milliseconds));
}

function Metric({ code, label, value, detail, trend }: { code: string; label: string; value: string; detail: string; trend?: string }) {
  return <div className="metric-card"><div className="metric-head"><span className="metric-code">{code}</span><div className="metric-label">{label}</div></div><div className="metric-row"><strong>{value}</strong>{trend && <span className="trend">{trend}</span>}</div><span className="metric-detail">{detail}</span><span className="metric-scan" aria-hidden="true"/></div>;
}

export function ControlRoomShell({ workspace }: { workspace: WorkspaceRoute }) {
  const selected = workspace.label;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [activePlan, setActivePlan] = useState<PersistedPlan | null>(null);
  const [weights, setWeights] = useState<PolicyWeights>(defaultPolicyWeights);
  const [policyVersion, setPolicyVersion] = useState(1);
  const [runPhase, setRunPhase] = useState<RecoveryRunPhase>("ready");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const previewPlan = useMemo(() => optimizeRecovery(weights), [weights]);
  const plan: RecoveryPlan = activePlan ?? previewPlan;
  const incident = activePlan?.status === "AWAITING_APPROVAL" || activePlan?.status === "APPROVED" || activePlan?.status === "EXECUTING";
  const backendOnline = Boolean(snapshot);
  const technicians = useMemo<Technician[]>(() => snapshot ? snapshot.technicians.map(row => ({ id: row.id, initials: technicianVisuals[row.id]?.initials ?? row.name.split(" ").map(part => part[0]).join("").slice(0, 2), color: technicianVisuals[row.id]?.color ?? "#6570ff", name: row.name, specialty: row.specialty, stops: row.active_stops, miles: row.route_miles, utilization: row.utilization, status: displayStatus(row.status) })) : fallbackTechnicians, [snapshot]);
  const visible = useMemo(() => technicians.filter(t => `${t.name} ${t.id} ${t.specialty}`.toLowerCase().includes(search.toLowerCase())), [search, technicians]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 820px)");
    const updateViewport = () => setIsMobileViewport(query.matches);

    updateViewport();
    query.addEventListener("change", updateViewport);
    return () => query.removeEventListener("change", updateViewport);
  }, []);

  const closeMobileNavigation = useCallback(() => {
    setMobileNav(false);
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!mobileNav) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileNavigation();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeMobileNavigation, mobileNav]);

  const loadSnapshot = useCallback(async () => {
    try {
      const data = await api<Snapshot>("/api/operations");
      setSnapshot(data); setActivePlan(data.activePlan);
      setRunPhase(recoveryPhase(data.activePlan?.status));
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
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const request = api<{ plan: PersistedPlan }>("/api/disruptions", { method: "POST", body: JSON.stringify({ technicianId: "T-274", idempotencyKey: `fieldops-ui-${crypto.randomUUID()}` }) });
      setRunPhase("incident");
      const animate = async () => {
        await wait(reducedMotion ? 0 : 550);
        setRunPhase("constraints");
        await wait(reducedMotion ? 0 : 850);
        setRunPhase("optimizing");
        await wait(reducedMotion ? 0 : 900);
      };
      const [result] = await Promise.all([request, animate()]);
      setActivePlan(result.plan); setRunPhase("review"); await loadSnapshot(); return result.plan;
    } catch (cause) { setRunPhase("ready"); setError(cause instanceof Error ? cause.message : "Disruption simulation failed"); throw cause; }
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
    setBusy(true); setRunPhase("executing"); setError(null);
    try {
      const approved = activePlan.status === "APPROVED" ? activePlan : (await transition("approve", activePlan)).plan;
      setActivePlan(approved);
      const executed = (await transition("execute", approved)).plan;
      setActivePlan(executed); setRunPhase("executed"); setReviewOpen(false); setNotice("Recovery plan executed. Five repair orders were reassigned and two advisor callbacks were queued."); await loadSnapshot();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Plan execution failed"); await loadSnapshot(); }
    finally { setBusy(false); }
  }, [activePlan, loadSnapshot, transition]);

  const reject = useCallback(async () => {
    if (!activePlan) return;
    setBusy(true); setError(null);
    try { const result = await transition("reject", activePlan); setActivePlan(result.plan); setRunPhase("rejected"); setReviewOpen(false); setNotice("Recovery plan rejected and retained in the audit history."); await loadSnapshot(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Plan rejection failed"); }
    finally { setBusy(false); }
  }, [activePlan, loadSnapshot, transition]);

  const rollback = useCallback(async () => {
    if (!activePlan) return;
    setBusy(true); setError(null);
    try { const result = await transition("rollback", activePlan); setActivePlan(result.plan); setRunPhase("rolled-back"); setNotice("Execution rolled back. Original assignments were restored and the compensation was audited."); await loadSnapshot(); }
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

  const operatorName = snapshot?.operator.displayName ?? "Service operator";
  const initials = operatorName.split(/\s|@/).filter(Boolean).map(value => value[0]).join("").slice(0, 2).toUpperCase() || "OP";
  const agentOpsView = workspace.slug === "agentops";
  const diagnosticView = workspace.slug === "diagnostic-copilot";
  const capacityView = workspace.slug === "capacity-planning";
  const benchmarkView = workspace.slug === "simulation-lab";
  const shopBoardView = workspace.slug === "shop-board";
  const repairOrdersView = workspace.slug === "repair-orders";
  const techniciansView = workspace.slug === "technicians";
  const performanceView = workspace.slug === "performance";
  const specializedView = workspace.slug !== "service-command";
  const viewTitle = workspace.title;
  const viewDescription = workspace.description;
  const operatingMode = workspace.operatingMode;
  const dataProvenance = workspace.dataProvenance;
  const shiftDate = snapshot
    ? new Date(snapshot.backend.serverTime).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })
    : "Loading shift";
  return <main className={`app-shell ${specializedView ? "" : "service-command-shell"}`}><aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`} inert={isMobileViewport && !mobileNav} aria-hidden={isMobileViewport && !mobileNav ? true : undefined}>
    <Link href="/" className="brand"><span className="brand-mark"><Route size={18}/></span><span className="brand-name">FIELD<span>/OPS</span><small>Service intelligence</small></span><span className="brand-index">AI</span></Link><button type="button" className="mobile-close" aria-label="Close navigation" onClick={closeMobileNavigation}><X/></button>
    <div className="territory-code"><span>SERVICE CONTROL</span><strong>ROOFTOP 01 · BOSTON</strong><small>12 BAYS / 27 TECHNICIANS</small></div>
    <nav aria-label="Main navigation"><p>Service operation</p>{workspaceRoutes.map(({ label, slug }, index) => { const Icon = workspaceIcons[slug]; return <Link key={slug} href={`/control-room/${slug}`} aria-current={workspace.slug === slug ? "page" : undefined} onClick={() => { if (isMobileViewport) closeMobileNavigation(); window.scrollTo({ top: 0 }); }} className={`workspace-nav-link ${workspace.slug === slug ? "active" : ""}`}><span className="nav-index">{String(index + 1).padStart(2, "0")}</span><Icon/><span>{label}</span>{label === "Repair orders" && snapshot && <small>{snapshot.metrics.openRepairOrders}</small>}</Link>; })}</nav>
    <div className={`system-card ${backendOnline ? "online" : ""}`}><div><ShieldCheck/><span>System integrity</span></div><strong>{backendOnline ? "Orchestrator online" : "Establishing link"}</strong><p>{backendOnline ? `${snapshot?.backend.persistence} / ${snapshot?.backend.optimizer}` : "Loading operational state"}</p></div>
    <div className="profile"><span>{initials}</span><div><strong>{operatorName}</strong><small>{snapshot ? `${snapshot.operator.role} · authenticated` : "Authenticating"}</small></div><MoreHorizontal/></div>
  </aside><section className="workspace"><header className="topbar"><button type="button" ref={menuButtonRef} className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation" aria-expanded={mobileNav}><Menu/></button><div className="workspace-title"><span>LIVE WORKSPACE / {selected.toUpperCase()}</span><h1>{viewTitle}</h1><p>{viewDescription}</p></div><div className="topbar-actions"><span className={`data-provenance ${dataProvenance === "LIVE DATA" ? "live" : ""}`} title="Identifies whether this workspace uses persisted runtime data, measured output, or an illustrative reference scenario"><i/>{dataProvenance}</span><div className="operating"><CircleDot/><span><small>Operating mode</small>{operatingMode}</span><ChevronDown/></div><span className="date"><small>Shift date</small>{shiftDate}</span>{!specializedView && <><Button variant="outline" onClick={() => setPolicyOpen(true)} className="policy-button" disabled={busy || !backendOnline}><Settings2/> Policy</Button><Button onClick={runPhase === "review" ? () => setReviewOpen(true) : () => void simulate()} className="simulate" disabled={busy || !backendOnline}><Sparkles/> {busy ? "Recovery running" : runPhase === "review" ? "Review plan" : "Run disruption"}</Button></>}</div></header>
  {agentOpsView ? <div className="content agentops-content"><AgentOpsControlTower/></div> : diagnosticView ? <div className="content diagnostic-content"><TechnicianDiagnosticCopilot/></div> : capacityView ? <div className="content capacity-content"><CapacityPlanning/></div> : benchmarkView ? <div className="content benchmark-content"><SimulationBenchmark/></div> : shopBoardView ? <div className="content shop-board-content"><ShopBoard/></div> : repairOrdersView ? <div className="content repair-orders-content"><RepairOrdersBoard/></div> : techniciansView ? <div className="content technician-command-content"><TechnicianCommandCenter technicians={technicians}/></div> : performanceView ? <div className="content performance-command-content"><PerformanceCommandCenter projectedSla={plan.projectedSla} incident={incident}/></div> : <div className="content service-command-content">{error && <div className="error-banner" role="alert"><AlertTriangle aria-hidden="true"/><span>{error}</span><button type="button" onClick={() => void loadSnapshot()}>Retry</button></div>}{notice && <div className="success-banner" role="status" aria-live="polite" aria-atomic="true"><Check aria-hidden="true"/><span>{notice}</span>{activePlan?.status === "EXECUTED" && snapshot?.operator.role === "admin" && <button type="button" onClick={() => void rollback()} disabled={busy}><Undo2 aria-hidden="true"/> Roll back execution</button>}</div>}
    <ServiceRecoveryCommand plan={plan} phase={runPhase} busy={busy} backendOnline={backendOnline} onRun={() => void simulate()} onReview={() => setReviewOpen(true)} onPolicy={() => setPolicyOpen(true)}/>
    <section className="metrics" aria-label="Today's performance"><Metric code="OTP" label="Promise-time projection" value={snapshot?.metrics.projectedPromiseAttainment == null ? "Pending" : `${snapshot.metrics.projectedPromiseAttainment}%`} detail={snapshot?.metrics.projectedPromiseAttainment == null ? "Run a disruption to calculate" : "Active recovery plan"}/><Metric code="WIP" label="Open repair orders" value={snapshot ? String(snapshot.metrics.openRepairOrders) : "Pending"} detail="Current operational records"/><Metric code="UTIL" label="Technician utilization" value={snapshot?.metrics.averageTechnicianUtilization == null ? "Pending" : `${snapshot.metrics.averageTechnicianUtilization}%`} detail="Average across the active shop team"/><Metric code="RSK" label="At-risk promises" value={snapshot ? String(snapshot.metrics.atRiskPromises) : "Pending"} detail={snapshot && snapshot.metrics.atRiskPromises > 0 ? "Manager review required" : "No current promise risk"}/></section>
    <section className="operations-grid"><ShopFloor openRepairOrders={snapshot?.metrics.openRepairOrders}/><DecisionPanel audit={snapshot?.audit ?? []} activePlan={activePlan} onReview={() => setReviewOpen(true)}/></section><TechnicianRoster technicians={visible} search={search} onSearch={setSearch}/></div>}
  <RecoveryDialog open={reviewOpen} onOpenChange={setReviewOpen} onAccept={() => void accept()} onReject={() => void reject()} plan={plan} weights={weights} busy={busy} persistedPlan={activePlan}/><PolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} weights={weights} onChange={setWeights} onApply={() => void savePolicy(weights)} plan={previewPlan} busy={busy} policyVersion={policyVersion}/></section></main>;
}

function ShopFloor({ openRepairOrders }: { openRepairOrders?: number }) {
  return <article className="panel map-panel"><div className="panel-heading"><div><span className="panel-code">01 / SHOP FLOOR</span><h2>Live service operation</h2><p>{openRepairOrders == null ? "Loading active repair orders" : `${openRepairOrders} active repair orders`} · 12 service bays</p></div><div className="map-key"><span><i/> In progress</span><span><i className="service-dot"/> At risk</span></div></div><div className="shop-surface"><div className="shop-status"><span><i/> SHOP SIGNAL LIVE</span><strong>WIP CONTROL · ROOFTOP 01</strong></div><div className="shop-grid">{serviceBays.slice(0, 8).map(item => { const [year, ...modelParts] = item.vehicle.split(" "); const open = item.repairOrder === "OPEN"; return <div className={`bay-card ro-form-card ${item.tone}`} key={item.id}><span className="bay-document-label">ROOFTOP 01 / SERVICE REPAIR ORDER</span><div className="bay-head"><span>BAY {item.id}</span><strong>{item.initials}</strong></div><div className="bay-form-fields"><span><small>R.O. #</small><b>{item.repairOrder}</b></span><span><small>YEAR</small><b>{open ? "OPEN" : year}</b></span><span><small>MODEL</small><b>{open ? item.vehicle : modelParts.join(" ")}</b></span></div><div className="bay-form-line"><small>#01 / DESCRIPTION</small><b>{item.operation}</b></div><span className="bay-form-status">{item.statusLabel.toUpperCase()}</span></div>; })}</div><div className="map-summary"><Navigation/><div><strong>Next shop-load evaluation</strong><span>in 4 min 32 sec</span></div></div></div></article>;
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
