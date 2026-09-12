"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, BrainCircuit, Check, ChevronDown, CircleDot, Gauge, Map, Menu, MoreHorizontal, Navigation, Route, Search, Settings2, ShieldCheck, Sparkles, Undo2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { defaultPolicyWeights, optimizeRecovery, type PolicyWeights, type RecoveryPlan } from "@/lib/dispatch-optimizer";

type PlanStatus = "AWAITING_APPROVAL" | "APPROVED" | "EXECUTING" | "EXECUTED" | "REJECTED" | "EXECUTION_FAILED" | "ROLLING_BACK" | "ROLLED_BACK" | "ROLLBACK_FAILED";
type PersistedPlan = RecoveryPlan & { id: string; disruptionId: string; status: PlanStatus; version: number; policyVersion: number; optimizerVersion: string; createdAt: string; updatedAt: string };
type AuditRow = { id: string; action: string; entity_type: string; entity_id: string; from_status: string | null; to_status: string | null; actor_role: string; metadata_json: string; created_at: string };
type TechnicianRow = { id: string; name: string; specialty: string; status: string; active_stops: number; route_miles: number; utilization: number };
type Snapshot = { operator: { id: string; displayName: string; role: "dispatcher" | "supervisor" | "admin" }; technicians: TechnicianRow[]; workOrders: Array<Record<string, unknown>>; policy: PolicyWeights & { version: number; updatedAt: string }; activePlan: PersistedPlan | null; audit: AuditRow[]; backend: { persistence: string; optimizer: string; serverTime: string } };
type Technician = { id: string; initials: string; name: string; specialty: string; stops: number; miles: number; utilization: number; status: "On route" | "At service" | "Available" | "Unavailable"; color: string };

const technicianVisuals: Record<string, Pick<Technician, "initials" | "color">> = { "T-147": { initials: "DM", color: "#ee6b45" }, "T-208": { initials: "SC", color: "#b78cff" }, "T-274": { initials: "JR", color: "#4ad1a8" }, "T-319": { initials: "AP", color: "#f5bd4f" } };
const fallbackTechnicians: Technician[] = [
  { id: "T-147", initials: "DM", name: "Darius Miles", specialty: "Refrigeration", stops: 6, miles: 42.8, utilization: 86, status: "At service", color: "#ee6b45" },
  { id: "T-208", initials: "SC", name: "Sofia Chen", specialty: "Laundry", stops: 7, miles: 36.2, utilization: 91, status: "On route", color: "#b78cff" },
  { id: "T-274", initials: "JR", name: "Jonah Reed", specialty: "Cooking", stops: 5, miles: 31.4, utilization: 74, status: "On route", color: "#4ad1a8" },
  { id: "T-319", initials: "AP", name: "Amara Patel", specialty: "Multi-skill", stops: 7, miles: 39.1, utilization: 94, status: "At service", color: "#f5bd4f" },
];
const navItems = [[Gauge, "Command"], [Map, "Live map"], [Route, "Routes"], [Users, "Technicians"], [Activity, "Performance"]] as const;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed (${response.status})`);
  return body as T;
}

function displayStatus(value: string): Technician["status"] {
  if (value === "AT_SERVICE") return "At service";
  if (value === "AVAILABLE") return "Available";
  if (value === "UNAVAILABLE") return "Unavailable";
  return "On route";
}

function Metric({ label, value, detail, trend }: { label: string; value: string; detail: string; trend?: string }) {
  return <div className="metric-card"><div className="metric-label">{label}</div><div className="metric-row"><strong>{value}</strong>{trend && <span className="trend">{trend}</span>}</div><span className="metric-detail">{detail}</span></div>;
}

export default function Home() {
  const [selected, setSelected] = useState("Command");
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
      setActivePlan(executed); setReviewOpen(false); setNotice("Recovery plan executed. Five assignments were applied and two customers were queued for rescheduling."); await loadSnapshot();
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
    void Promise.resolve(context.registerTool({ name: "simulate_dispatch_disruption", title: "Simulate dispatch disruption", description: "Persist a technician-unavailable event and produce a server-evaluated recovery plan.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async () => { const result = await simulate(); return { status: result.status, planId: result.id, assignments: result.assignments.length, rescheduled: result.rescheduled.length }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    void Promise.resolve(context.registerTool({ name: "update_dispatch_policy", title: "Update dispatch policy", description: "Persist optimization weights with an optimistic concurrency check.", inputSchema: { type: "object", properties: { sla: { type: "number", minimum: 0, maximum: 60 }, travel: { type: "number", minimum: 0, maximum: 60 }, load: { type: "number", minimum: 0, maximum: 60 }, overtime: { type: "number", minimum: 0, maximum: 60 }, stability: { type: "number", minimum: 0, maximum: 60 } }, required: ["sla", "travel", "load", "overtime", "stability"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => { const updated = await savePolicy(input as PolicyWeights); return { status: "persisted", version: updated.version }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    void Promise.resolve(context.registerTool({ name: "execute_recovery_plan", title: "Execute recovery plan", description: "Approve and execute the current persisted recovery plan.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async () => { await accept(); return { status: "executed", planId: activePlan?.id }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [accept, activePlan?.id, savePolicy, simulate]);

  const operatorName = snapshot?.operator.displayName ?? "Michael Palmer";
  const initials = operatorName.split(/\s|@/).filter(Boolean).map(value => value[0]).join("").slice(0, 2).toUpperCase() || "OP";
  return <main className="app-shell"><aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
    <div className="brand"><span className="brand-mark"><Route size={18}/></span><span>FieldOps<span>AI</span></span></div><button className="mobile-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X/></button>
    <nav aria-label="Main navigation"><p>Operations</p>{navItems.map(([Icon, label]) => <button key={label} onClick={() => { setSelected(label); setMobileNav(false); }} className={selected === label ? "active" : ""}><Icon/><span>{label}</span>{label === "Routes" && <small>25</small>}</button>)}</nav>
    <div className={`system-card ${backendOnline ? "online" : ""}`}><div><ShieldCheck/><span>Orchestrator</span></div><strong>{backendOnline ? "Persistent backend online" : "Connecting to backend"}</strong><p>{backendOnline ? `${snapshot?.backend.persistence} · ${snapshot?.backend.optimizer}` : "Loading operational state"}</p></div>
    <div className="profile"><span>{initials}</span><div><strong>{operatorName}</strong><small>{snapshot ? `${snapshot.operator.role} · authenticated` : "Authenticating"}</small></div><MoreHorizontal/></div>
  </aside><section className="workspace"><header className="topbar"><button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu/></button><div><h1>Dispatch command</h1><p>Greater Boston service territory</p></div><div className="topbar-actions"><div className="operating"><CircleDot/> Live operation <ChevronDown/></div><span className="date">Friday, Sep 12</span><Button variant="outline" onClick={() => setPolicyOpen(true)} className="policy-button" disabled={busy || !backendOnline}><Settings2/> Policy controls</Button><Button onClick={() => void simulate()} className="simulate" disabled={busy || !backendOnline}><Sparkles/> {busy ? "Working..." : "Simulate disruption"}</Button></div></header>
  <div className="content">{error && <div className="error-banner"><AlertTriangle/><span>{error}</span><button onClick={() => void loadSnapshot()}>Retry</button></div>}{notice && <div className="success-banner"><Check/><span>{notice}</span>{activePlan?.status === "EXECUTED" && snapshot?.operator.role === "admin" && <button onClick={() => void rollback()} disabled={busy}><Undo2/> Roll back execution</button>}</div>}
    <section className="metrics" aria-label="Today's performance"><Metric label="SLA achievement" value={incident ? "91.6%" : "94.1%"} detail="Target 92.0%" trend={incident ? "−2.5%" : "+1.8%"}/><Metric label="Active routes" value="25" detail="27 technicians available"/><Metric label="Travel distance" value={incident ? "386 mi" : "351 mi"} detail="Baseline 423 mi" trend={incident ? "+10.0%" : "−17.0%"}/><Metric label="At-risk stops" value={incident ? "7" : "2"} detail={incident ? "Action required" : "Within recovery range"}/></section>
    <section className="operations-grid"><TerritoryMap/><DecisionPanel audit={snapshot?.audit ?? []} activePlan={activePlan} onReview={() => setReviewOpen(true)}/></section><TechnicianRoster technicians={visible} search={search} onSearch={setSearch}/></div>
  <RecoveryDialog open={reviewOpen} onOpenChange={setReviewOpen} onAccept={() => void accept()} onReject={() => void reject()} plan={plan} weights={weights} busy={busy} persistedPlan={activePlan}/><PolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} weights={weights} onChange={setWeights} onApply={() => void savePolicy(weights)} plan={previewPlan} busy={busy} policyVersion={policyVersion}/></section></main>;
}

function TerritoryMap() {
  return <article className="panel map-panel"><div className="panel-heading"><div><h2>Live territory</h2><p>25 routes · 164 scheduled stops</p></div><div className="map-key"><span><i/> On route</span><span><i className="service-dot"/> At service</span></div></div><div className="map-surface"><div className="map-grid"/><svg viewBox="0 0 760 390" preserveAspectRatio="none" aria-label="Stylized service route map"><path className="road main-road" d="M-20 280 C120 245,190 330,310 255 S520 185,790 220"/><path className="road" d="M90 -20 C130 90,185 150,270 210 S380 320,435 420"/><path className="road" d="M540 -20 C500 75,515 120,585 170 S690 265,720 420"/><path className="road minor" d="M-20 100 C130 130,235 60,395 100 S600 125,790 70"/><path className="route-line route-a" d="M103 82 C165 120,157 195,248 214 S370 300,440 270"/><path className="route-line route-b" d="M342 91 C420 115,480 90,522 153 S595 240,678 277"/><path className="route-line route-c" d="M174 310 C240 270,285 275,330 333 S450 354,527 318"/></svg>{[["DM", "17%", 31, 53, "orange"], ["SC", "8%", 67, 38, "purple"], ["JR", "", 42, 76, "green"], ["AP", "", 78, 72, "yellow"]].map(([name, delay, left, top, color]) => <div key={String(name)} className={`map-pin ${color}`} style={{ left: `${left}%`, top: `${top}%` }}><span>{name}</span>{delay && <small>{delay} late</small>}</div>)}<div className="map-label downtown">BOSTON</div><div className="map-label cambridge">CAMBRIDGE</div><div className="map-label quincy">QUINCY</div><div className="map-summary"><Navigation/><div><strong>Next optimization</strong><span>in 4 min 32 sec</span></div></div></div></article>;
}

function auditCopy(row: AuditRow) {
  const titles: Record<string, string> = { PLAN_CREATED: "Recovery plan created", PLAN_APPROVE: "Plan approved", PLAN_EXECUTED: "Assignments executed", PLAN_REJECT: "Plan rejected", PLAN_ROLLED_BACK: "Execution rolled back", POLICY_UPDATED: "Policy updated", PLAN_EXECUTION_FAILED: "Execution stopped", PLAN_ROLLBACK_FAILED: "Rollback stopped" };
  return { title: titles[row.action] ?? row.action.replaceAll("_", " ").toLowerCase(), text: `${row.entity_type.replaceAll("_", " ")} ${row.entity_id.slice(-12)} · ${row.actor_role}${row.to_status ? ` · ${row.to_status.replaceAll("_", " ").toLowerCase()}` : ""}`, time: new Date(row.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) };
}

function DecisionPanel({ audit, activePlan, onReview }: { audit: AuditRow[]; activePlan: PersistedPlan | null; onReview: () => void }) {
  const reviewable = activePlan?.status === "AWAITING_APPROVAL" || activePlan?.status === "APPROVED";
  return <aside className="panel decision-panel"><div className="panel-heading"><div><h2>Decision stream</h2><p>Immutable operational audit</p></div><button aria-label="Decision options"><MoreHorizontal/></button></div><div className="decision-list">{reviewable && <Decision icon={<AlertTriangle/>} title="Capacity disruption" time="Now" text="Technician T-274 is unavailable. Seven stops were evaluated for recovery." action={onReview}/>} {audit.slice(0, reviewable ? 3 : 4).map((row, index) => { const copy = auditCopy(row); return <Decision key={row.id} tone={index % 3 === 0 ? "purple" : index % 3 === 1 ? "green" : "gold"} icon={row.action === "POLICY_UPDATED" ? <Settings2/> : row.action.includes("ROLL") ? <Undo2/> : <Route/>} {...copy}/>; })}{audit.length === 0 && <Decision tone="green" icon={<ShieldCheck/>} title="Audit ready" time="Now" text="Persistent decision history will appear after the first operational action."/>}</div><button className="view-log">Audit retained in D1 <ShieldCheck/></button></aside>;
}

function Decision({ icon, title, time, text, tone = "", action }: { icon: React.ReactNode; title: string; time: string; text: string; tone?: string; action?: () => void }) {
  return <div className="decision"><span className={`decision-icon ${tone}`}>{icon}</span><div><div className="decision-top"><strong>{title}</strong><time>{time}</time></div><p>{text}</p>{action ? <button onClick={action}>Review recovery plan <ArrowRight/></button> : <span className="auto"><Check/> Persisted and audited</span>}</div></div>;
}

function TechnicianRoster({ technicians, search, onSearch }: { technicians: Technician[]; search: string; onSearch: (value: string) => void }) {
  return <section className="panel roster-panel"><div className="panel-heading roster-heading"><div><h2>Technician fleet</h2><p>Durable workload and route state</p></div><label className="search"><Search/><input value={search} onChange={event => onSearch(event.target.value)} placeholder="Search technician" aria-label="Search technician"/></label></div><div className="table-wrap"><table><thead><tr><th>Technician</th><th>Status</th><th>Specialty</th><th>Stops</th><th>Distance</th><th>Utilization</th></tr></thead><tbody>{technicians.map(tech => <tr key={tech.id}><td><div className="tech"><span style={{ background: tech.color }}>{tech.initials}</span><div><strong>{tech.name}</strong><small>{tech.id}</small></div></div></td><td><span className={`status ${tech.status.replace(" ", "-").toLowerCase()}`}>{tech.status}</span></td><td>{tech.specialty}</td><td>{tech.stops}</td><td>{tech.miles} mi</td><td><div className="util"><span><i style={{ width: `${tech.utilization}%` }}/></span><strong>{tech.utilization}%</strong></div></td></tr>)}</tbody></table>{technicians.length === 0 && <div className="empty">No technicians match “{search}”.</div>}</div></section>;
}

function RecoveryDialog({ open, onOpenChange, onAccept, onReject, plan, weights, busy, persistedPlan }: { open: boolean; onOpenChange: (open: boolean) => void; onAccept: () => void; onReject: () => void; plan: RecoveryPlan; weights: PolicyWeights; busy: boolean; persistedPlan: PersistedPlan | null }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="recovery-dialog sm:max-w-[920px]"><DialogHeader><div className="recovery-title-row"><span><BrainCircuit/></span><div><DialogTitle>{persistedPlan ? `Recovery plan ${persistedPlan.id.slice(-12)}` : "Recovery plan preview"}</DialogTitle><DialogDescription>Technician T-274 unavailable · 7 stops affected{persistedPlan ? ` · version ${persistedPlan.version}` : ""}</DialogDescription></div><span className="confidence">{plan.confidence}% confidence</span></div></DialogHeader>
    <div className="recovery-summary"><div><small>Preserved appointments</small><strong>{plan.assignments.length} of 7</strong><span>{plan.rescheduled.length} require rescheduling</span></div><div><small>Projected SLA</small><strong>{plan.projectedSla}%</strong><span>Plan score {plan.score} / 100</span></div><div><small>Added travel</small><strong>{plan.addedTravel} mi</strong><span>Across 3 routes</span></div><div><small>Overtime exposure</small><strong>{plan.overtime} hr</strong><span>{plan.overtime > .5 ? "Approval threshold exceeded" : "Within policy limit"}</span></div></div>
    <div className="recovery-body"><section><div className="section-title"><div><h3>Recommended reassignments</h3><p>Best of {plan.feasibleScenarios.toLocaleString()} feasible plans from {plan.scenariosEvaluated.toLocaleString()} evaluated</p></div><span>{plan.assignments.length} route changes</span></div><div className="move-list">{plan.assignments.map(move => <div className="move" key={move.jobId}><div><strong>{move.jobId}</strong><small>{move.window}</small></div><div className="job"><strong>{move.job}</strong><small>{move.from} <ArrowRight/> {move.to}</small></div><span>+{move.impactMinutes} min</span></div>)}</div><div className="customer-impact"><AlertTriangle/><div><strong>{plan.rescheduled.length} appointments cannot be preserved</strong><p>{plan.rescheduled.map(item => item.id).join(" and ")} exceed qualified technician capacity. Earliest recovery windows are Saturday, 8:00–10:00 AM.</p></div><button>View customers</button></div></section>
    <aside><div className="constraint-header"><ShieldCheck/><div><h3>Constraint validation</h3><p>All hard constraints passed</p></div></div>{["Technician certification", "Shift availability", "Service territory", "Parts availability", "Route capacity"].map(label => <div className="constraint" key={label}><Check/><span>{label}</span><strong>Passed</strong></div>)}<div className="policy-note"><small>Solver evidence</small><strong>{plan.rejectedCandidates} ineligible candidates excluded</strong><p>Invalid assignments are removed before weighted scoring. Human approval remains required for customer rescheduling.</p></div></aside></div>
    <div className="audit-note"><span>Decision basis</span> SLA protection {weights.sla}% · travel efficiency {weights.travel}% · technician load {weights.load}% · overtime {weights.overtime}% · schedule stability {weights.stability}%{persistedPlan && <> · policy v{persistedPlan.policyVersion} · {persistedPlan.optimizerVersion}</>}</div>
    <DialogFooter><Button variant="outline" onClick={onReject} disabled={busy || !persistedPlan}>Reject plan</Button><Button variant="outline" disabled>Modify assignments</Button><Button onClick={onAccept} className="accept-plan" disabled={busy || !persistedPlan}><Check/> {busy ? "Executing..." : "Approve and execute"}</Button></DialogFooter></DialogContent></Dialog>;
}

function PolicyDialog({ open, onOpenChange, weights, onChange, onApply, plan, busy, policyVersion }: { open: boolean; onOpenChange: (open: boolean) => void; weights: PolicyWeights; onChange: (weights: PolicyWeights) => void; onApply: () => void; plan: RecoveryPlan; busy: boolean; policyVersion: number }) {
  const controls: [keyof PolicyWeights, string, string][] = [["sla", "SLA protection", "Prioritize appointments delivered inside the promised window"], ["travel", "Travel efficiency", "Reduce incremental route mileage"], ["load", "Technician load", "Balance capacity across eligible technicians"], ["overtime", "Overtime reduction", "Limit work extending beyond scheduled shifts"], ["stability", "Schedule stability", "Avoid customer rescheduling and route changes"]];
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="policy-dialog sm:max-w-[620px]"><DialogHeader><DialogTitle>Optimization policy · version {policyVersion}</DialogTitle><DialogDescription>Adjust business priorities. Saving uses optimistic concurrency and applies the policy to the next server-side recovery evaluation.</DialogDescription></DialogHeader><div className="policy-score"><div><span>Preview score</span><strong>{plan.score}</strong></div><div><span>Projected SLA</span><strong>{plan.projectedSla}%</strong></div><div><span>Raw weight total</span><strong>{total}</strong></div></div><div className="weight-controls">{controls.map(([key, label, description]) => <div className="weight-control" key={key}><div><strong>{label}</strong><span>{weights[key]}%</span></div><p>{description}</p><Slider min={0} max={60} step={5} value={[weights[key]]} onValueChange={value => onChange({ ...weights, [key]: value[0] })}/></div>)}</div><div className="solver-note"><BrainCircuit/><div><strong>Deterministic recomputation</strong><p>Hard constraints remain non-negotiable. The server records the policy version used for every recovery plan.</p></div></div><DialogFooter><Button variant="outline" onClick={() => onChange(defaultPolicyWeights)} disabled={busy}>Restore defaults</Button><Button onClick={onApply} disabled={busy || total === 0}>{busy ? "Saving..." : "Save policy"}</Button></DialogFooter></DialogContent></Dialog>;
}
