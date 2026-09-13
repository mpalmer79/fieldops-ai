"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, Check, CheckCircle2, RefreshCw, ShieldCheck, Sparkles, TrendingUp, Users, XCircle } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";

type DailyPoint = { date: string; expected: number; lower: number; upper: number; capacity: number; gap: number };
type ForecastPoint = { id: string; forecast_date: string; skill: string; expected_demand: number; lower_bound: number; upper_bound: number; available_capacity: number; risk_level: "LOW" | "MEDIUM" | "HIGH" };
type Scenario = { id: string; forecastRunId: string; name: string; status: "DRAFT" | "APPROVED"; demandChangePct: number; availabilityChangePct: number; overtimeHours: number; crossTrainedTechs: number; projectedDemand: number; projectedCapacity: number; residualGap: number; jobsProtected: number; estimatedCost: number; recordVersion: number; createdAt: string; updatedAt: string; approvedAt: string | null };
type CapacityAction = { id: string; forecast_date: string; skill: string; action_type: string; description: string; capacity_delta: number; estimated_cost: number; priority: number };
type Audit = { id: string; action: string; actor_role: string; created_at: string };
type Snapshot = {
  operator: { id: string; displayName: string; role: string };
  run: { id: string; status: string; modelVersion: string; territory: string; horizonDays: number; trainingWindowDays: number; wape: number; bias: number; intervalCoverage: number; inputSnapshot: Record<string, unknown>; completedAt: string };
  points: ForecastPoint[];
  daily: DailyPoint[];
  scenario: Scenario | null;
  actions: CapacityAction[];
  audit: Audit[];
  metrics: { totalExpected: number; totalCapacity: number; grossGap: number; highRiskPoints: number; peakDate: string; peakDemand: number; observationCount: number };
  boundaries: { data: string; model: string; autonomy: string };
};

type ScenarioControls = { name: string; demandChangePct: number; availabilityChangePct: number; overtimeHours: number; crossTrainedTechs: number };

const defaultControls: ScenarioControls = { name: "Peak demand protection plan", demandChangePct: 8, availabilityChangePct: -6, overtimeHours: 2, crossTrainedTechs: 2 };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed (${response.status})`);
  return body as T;
}

function shortDate(value?: string) {
  if (!value) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
}

function display(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function CapacityMetric({ icon, label, value, detail, tone = "" }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: string }) {
  return <div className={`capacity-metric ${tone}`}><span aria-hidden="true">{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></div>;
}

function ScenarioRange({ label, value, minimum, maximum, suffix, onChange }: { label: string; value: number; minimum: number; maximum: number; suffix: string; onChange: (value: number) => void }) {
  const spokenSuffix = suffix.trim() === "hr" ? " hours" : suffix;
  return <label className="scenario-range"><span><strong>{label}</strong><b aria-hidden="true">{value > 0 && minimum < 0 ? "+" : ""}{value}{suffix}</b></span><input type="range" min={minimum} max={maximum} step={1} value={value} aria-valuetext={`${value}${spokenSuffix}`} onChange={event => onChange(Number(event.target.value))}/><small aria-hidden="true">{minimum}{suffix}<i/>{maximum > 0 ? "+" : ""}{maximum}{suffix}</small></label>;
}

export function CapacityPlanning() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [controls, setControls] = useState<ScenarioControls>(defaultControls);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await request<Snapshot>("/api/capacity");
      setSnapshot(data);
      setError(null);
      return data;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Capacity planning is unavailable");
      throw cause;
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void load().catch(() => undefined), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const refreshForecast = useCallback(async () => {
    setBusy("forecast"); setError(null); setNotice(null);
    try {
      const data = await request<Snapshot>("/api/capacity/forecast", { method: "POST", body: JSON.stringify({ idempotencyKey: `forecast-ui-${crypto.randomUUID()}` }) });
      setSnapshot(data); setNotice(`Forecast ${data.run.id.slice(-8)} completed and stored with its backtest evidence.`);
      return { runId: data.run.id, horizonDays: data.run.horizonDays, wape: data.run.wape, highRiskPoints: data.metrics.highRiskPoints };
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Forecast generation failed"); throw cause; }
    finally { setBusy(null); }
  }, []);

  const evaluateScenario = useCallback(async (input?: Partial<ScenarioControls>) => {
    if (!snapshot) throw new Error("Forecast is not loaded");
    const values = { ...controls, ...input };
    setBusy("scenario"); setError(null); setNotice(null);
    try {
      const data = await request<Snapshot>("/api/capacity/scenarios", { method: "POST", body: JSON.stringify({ forecastRunId: snapshot.run.id, ...values }) });
      setSnapshot(data); setControls(values); setNotice("Capacity scenario evaluated. Recommended actions remain pending supervisor approval.");
      return { scenarioId: data.scenario?.id, status: data.scenario?.status, residualGap: data.scenario?.residualGap, jobsProtected: data.scenario?.jobsProtected, estimatedCost: data.scenario?.estimatedCost };
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Scenario evaluation failed"); throw cause; }
    finally { setBusy(null); }
  }, [controls, snapshot]);

  const approveScenario = useCallback(async (scenarioId?: string) => {
    const scenario = snapshot?.scenario;
    if (!scenario || (scenarioId && scenarioId !== scenario.id)) throw new Error("Current draft scenario not found");
    setBusy("approve"); setError(null); setNotice(null);
    try {
      const data = await request<Snapshot>("/api/capacity/scenarios/approve", { method: "POST", body: JSON.stringify({ scenarioId: scenario.id, expectedVersion: scenario.recordVersion }) });
      setSnapshot(data); setNotice("Capacity plan approved and audited. Workforce scheduling remains an explicit downstream handoff.");
      return { scenarioId: data.scenario?.id, status: data.scenario?.status, jobsProtected: data.scenario?.jobsProtected };
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Capacity plan approval failed"); throw cause; }
    finally { setBusy(null); }
  }, [snapshot?.scenario]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({ name: "generate_demand_forecast", title: "Generate demand forecast", description: "Create a versioned 14-day demand forecast with backtest metrics and capacity risk classification.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async () => refreshForecast() }, { signal: lifecycle.signal })).catch(() => undefined);
    void Promise.resolve(context.registerTool({ name: "evaluate_capacity_scenario", title: "Evaluate capacity scenario", description: "Evaluate demand, availability, overtime, and cross-training assumptions against the current forecast.", inputSchema: { type: "object", properties: { name: { type: "string", minLength: 3, maxLength: 80 }, demandChangePct: { type: "integer", minimum: -20, maximum: 40 }, availabilityChangePct: { type: "integer", minimum: -30, maximum: 20 }, overtimeHours: { type: "integer", minimum: 0, maximum: 4 }, crossTrainedTechs: { type: "integer", minimum: 0, maximum: 6 } }, required: ["name", "demandChangePct", "availabilityChangePct", "overtimeHours", "crossTrainedTechs"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => evaluateScenario(input as ScenarioControls) }, { signal: lifecycle.signal })).catch(() => undefined);
    void Promise.resolve(context.registerTool({ name: "approve_capacity_plan", title: "Approve capacity plan", description: "Approve the current draft capacity plan and record the human decision boundary in the audit trail.", inputSchema: { type: "object", properties: { scenarioId: { type: "string" } }, required: ["scenarioId"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => approveScenario((input as { scenarioId: string }).scenarioId) }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [approveScenario, evaluateScenario, refreshForecast]);

  const chartData = useMemo(() => snapshot?.daily.map(item => ({ ...item, label: shortDate(item.date) })) ?? [], [snapshot?.daily]);
  const skillSummary = useMemo(() => {
    const rows = new Map<string, { demand: number; capacity: number; highRisk: number }>();
    snapshot?.points.forEach(point => {
      const current = rows.get(point.skill) ?? { demand: 0, capacity: 0, highRisk: 0 };
      current.demand += point.expected_demand; current.capacity += point.available_capacity;
      if (point.risk_level === "HIGH") current.highRisk += 1;
      rows.set(point.skill, current);
    });
    return [...rows.entries()].map(([skill, values]) => ({ skill, ...values }));
  }, [snapshot?.points]);
  const selectedDay = useMemo(() => snapshot?.daily.find(day => day.date === selectedDate) ?? snapshot?.daily.find(day => day.date === snapshot.metrics.peakDate) ?? snapshot?.daily[0], [selectedDate, snapshot]);

  if (!snapshot) return <div className="capacity-loading" role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"} aria-busy={!error}><RefreshCw aria-hidden="true"/><strong>{error ? "Capacity planning unavailable" : "Loading demand and capacity plan"}</strong><span>{error ?? "Retrieving forecast evidence, service demand, and workforce constraints."}</span>{error && <button type="button" onClick={() => void load()}>Retry</button>}</div>;

  const scenario = snapshot.scenario;
  return <section className="capacity-planning" aria-busy={Boolean(busy)}>
    <div className="capacity-intro"><div><span className="eyebrow"><TrendingUp/> 14-DAY CAPACITY WINDOW</span><h2>Protect the shop before the schedule breaks</h2><p>See when appointment demand exceeds qualified capacity, then test the recovery before committing labor.</p></div><div className="capacity-peak-visual"><div><span>PLANNING FOCUS</span><strong>{shortDate(selectedDay?.date)}</strong><small>{selectedDay?.expected ?? 0} expected appointments</small></div><div className="peak-balance"><span><small>Demand</small><i style={{ width: "100%" }}/><b>{selectedDay?.expected ?? 0}</b></span><span><small>Capacity</small><i style={{ width: `${Math.min(100, Math.round((selectedDay?.capacity ?? 0) / Math.max(selectedDay?.expected ?? 0, 1) * 100))}%` }}/><b>{selectedDay?.capacity ?? 0}</b></span></div></div></div>
    {error && <div className="capacity-alert error" role="alert"><XCircle aria-hidden="true"/><span>{error}</span><button type="button" onClick={() => void load()}>Refresh plan</button></div>}
    {notice && <div className="capacity-alert success" role="status" aria-live="polite" aria-atomic="true"><CheckCircle2 aria-hidden="true"/><span>{notice}</span></div>}
    <div className="capacity-metrics">
      <CapacityMetric icon={<BarChart3/>} label="Forecast demand" value={snapshot.metrics.totalExpected.toLocaleString()} detail={`${snapshot.run.horizonDays}-day expected appointments`}/>
      <CapacityMetric icon={<Users/>} label="Available capacity" value={snapshot.metrics.totalCapacity.toLocaleString()} detail={`${snapshot.metrics.grossGap} appointment gaps by day and skill`}/>
      <CapacityMetric icon={<AlertTriangle/>} label="High-risk cells" value={String(snapshot.metrics.highRiskPoints)} detail={`Peak ${snapshot.metrics.peakDemand} on ${shortDate(snapshot.metrics.peakDate)}`} tone={snapshot.metrics.highRiskPoints ? "warning" : ""}/>
      <CapacityMetric icon={<Activity/>} label="Backtest WAPE" value={`${snapshot.run.wape}%`} detail={`${snapshot.run.intervalCoverage}% interval coverage`}/>
    </div>
    <div className="capacity-primary-grid">
      <article className="capacity-card forecast-card"><div className="capacity-card-heading"><div><h3>Demand versus staffed capacity</h3><p>Select a day to inspect its appointment gap</p></div><Button variant="outline" onClick={() => void refreshForecast()} disabled={Boolean(busy)}><RefreshCw className={busy === "forecast" ? "spinning" : ""} aria-hidden="true"/> {busy === "forecast" ? "Forecasting..." : "Refresh forecast"}</Button></div><div id="capacity-selected-day" className="capacity-day-focus" role="status" aria-live="polite" aria-atomic="true"><div><small>SELECTED DAY</small><strong>{shortDate(selectedDay?.date)}</strong></div><div><small>Expected</small><strong>{selectedDay?.expected ?? 0}</strong></div><div><small>Capacity</small><strong>{selectedDay?.capacity ?? 0}</strong></div><div className={(selectedDay?.gap ?? 0) > 0 ? "risk" : "safe"}><small>Appointment gap</small><strong>{selectedDay?.gap ?? 0}</strong></div></div><div className="capacity-day-rail" role="group" aria-label="Fourteen-day capacity risk selector">{snapshot.daily.map(day => { const risk = day.gap > 0; const severity = day.gap >= 4 ? "high" : risk ? "medium" : "low"; return <button type="button" key={day.date} className={`${severity} ${selectedDay?.date === day.date ? "selected" : ""}`} onClick={() => setSelectedDate(day.date)} aria-pressed={selectedDay?.date === day.date} aria-controls="capacity-selected-day" aria-label={`${shortDate(day.date)}: ${day.expected} expected appointments, ${day.capacity} capacity, ${risk ? `${day.gap} appointment gap` : "no appointment gap"}`}><small>{shortDate(day.date)}</small><span aria-hidden="true"><i style={{ height: `${Math.max(16, Math.min(100, day.expected / Math.max(snapshot.metrics.peakDemand, 1) * 100))}%` }}/><b style={{ height: `${Math.max(10, Math.min(100, day.capacity / Math.max(snapshot.metrics.peakDemand, 1) * 100))}%` }}/></span><strong aria-hidden="true">{risk ? `+${day.gap}` : "OK"}</strong></button>; })}</div><div className="forecast-chart" role="img" aria-label={`Fourteen-day demand and capacity chart. Peak demand is ${snapshot.metrics.peakDemand} appointments on ${shortDate(snapshot.metrics.peakDate)}.`}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}><CartesianGrid stroke="#27323a" vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 11, fill: "#78838e" }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 11, fill: "#78838e" }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #344149", background: "#0d1519", color: "#dfe7e9", fontSize: 12 }} labelStyle={{ fontWeight: 800, marginBottom: 5 }}/><Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }}/><Area type="monotone" dataKey="upper" name="Upper demand bound" stroke="#c58c34" fill="#f7d89e" fillOpacity={0.14} strokeWidth={1}/><Line type="monotone" dataKey="expected" name="Expected demand" stroke="#e09645" strokeWidth={3} dot={false}/><Line type="monotone" dataKey="capacity" name="Staffed capacity" stroke="#56e5c2" strokeWidth={3} dot={false}/></ComposedChart></ResponsiveContainer></div><div className="forecast-boundary"><ShieldCheck aria-hidden="true"/><span><strong>Decision evidence</strong>{snapshot.boundaries.model}. Source: {snapshot.boundaries.data}.</span></div></article>
      <aside className="capacity-card scenario-card"><div className="capacity-card-heading"><div><h3>Scenario controls</h3><p>Stress demand and test bounded staffing responses</p></div><Sparkles/></div><div className="scenario-form"><label className="scenario-name"><span>Scenario name</span><input value={controls.name} maxLength={80} onChange={event => setControls(current => ({ ...current, name: event.target.value }))}/></label><ScenarioRange label="Demand change" value={controls.demandChangePct} minimum={-20} maximum={40} suffix="%" onChange={value => setControls(current => ({ ...current, demandChangePct: value }))}/><ScenarioRange label="Technician availability" value={controls.availabilityChangePct} minimum={-30} maximum={20} suffix="%" onChange={value => setControls(current => ({ ...current, availabilityChangePct: value }))}/><ScenarioRange label="Daily overtime pool" value={controls.overtimeHours} minimum={0} maximum={4} suffix=" hr" onChange={value => setControls(current => ({ ...current, overtimeHours: value }))}/><ScenarioRange label="Cross-trained technicians" value={controls.crossTrainedTechs} minimum={0} maximum={6} suffix="" onChange={value => setControls(current => ({ ...current, crossTrainedTechs: value }))}/><Button onClick={() => void evaluateScenario()} disabled={Boolean(busy) || controls.name.trim().length < 3}><Sparkles/> {busy === "scenario" ? "Evaluating..." : "Evaluate scenario"}</Button></div></aside>
    </div>
    <div className="capacity-secondary-grid">
      <article className="capacity-card scenario-result"><div className="capacity-card-heading"><div><h3>Capacity plan</h3><p>{scenario ? scenario.name : "Evaluate a scenario to create a plan"}</p></div>{scenario && <span className={`capacity-status ${scenario.status.toLowerCase()}`}>{scenario.status}</span>}</div>{scenario ? <><div className="capacity-plan-bridge"><div><small>PROJECTED DEMAND</small><strong>{scenario.projectedDemand}</strong></div><span>minus</span><div><small>FUNDED CAPACITY</small><strong>{scenario.projectedCapacity}</strong></div><span>equals</span><div className={scenario.residualGap > 0 ? "risk" : "safe"}><small>RESIDUAL GAP</small><strong>{scenario.residualGap}</strong></div></div><div className="scenario-result-metrics"><div><small>Projected demand</small><strong>{scenario.projectedDemand}</strong></div><div><small>Funded capacity</small><strong>{scenario.projectedCapacity}</strong></div><div><small>Jobs protected</small><strong>{scenario.jobsProtected}</strong></div><div><small>Residual gap</small><strong>{scenario.residualGap}</strong></div><div><small>Plan cost</small><strong>{money(scenario.estimatedCost)}</strong></div></div><div className="capacity-actions">{snapshot.actions.map(action => <div key={action.id}><span>{action.priority}</span><div><strong>{shortDate(action.forecast_date)} · {action.skill}</strong><p>{action.description}</p><small>+{action.capacity_delta} appointments · {display(action.action_type)}</small></div><b>{money(action.estimated_cost)}</b></div>)}</div><div className="capacity-approval"><ShieldCheck/><p>{snapshot.boundaries.autonomy}</p><Button onClick={() => void approveScenario()} disabled={Boolean(busy) || scenario.status !== "DRAFT"}><Check/> {scenario.status === "APPROVED" ? "Plan approved" : busy === "approve" ? "Approving..." : "Approve capacity plan"}</Button></div></> : <div className="capacity-empty"><Sparkles/><strong>No scenario evaluated</strong><span>Use the planning controls to quantify a staffing response before approval.</span></div>}</article>
      <article className="capacity-card skill-risk-card"><div className="capacity-card-heading"><div><h3>Risk by service skill</h3><p>Aggregate forecast demand and base capacity</p></div><span>{snapshot.run.horizonDays} days</span></div><div className="skill-risk-list">{skillSummary.map(item => { const coverage = Math.min(100, Math.round(item.capacity / Math.max(item.demand, 1) * 100)); return <div key={item.skill}><div><strong>{item.skill}</strong><span>{item.demand} demand · {item.capacity} capacity</span></div><b>{coverage}%</b><span className="coverage-track"><i style={{ width: `${coverage}%` }}/></span><small>{item.highRisk} high-risk days</small></div>; })}</div></article>
      <article className="capacity-card model-card"><div className="capacity-card-heading"><div><h3>Forecast governance</h3><p>Stored model evidence and operating limits</p></div><ShieldCheck/></div><dl className="model-evidence"><div><dt>Model version</dt><dd>{snapshot.run.modelVersion}</dd></div><div><dt>Training window</dt><dd>{snapshot.run.trainingWindowDays} days</dd></div><div><dt>Observations</dt><dd>{snapshot.metrics.observationCount}</dd></div><div><dt>Backtest WAPE</dt><dd>{snapshot.run.wape}%</dd></div><div><dt>Forecast bias</dt><dd>{snapshot.run.bias > 0 ? "+" : ""}{snapshot.run.bias}%</dd></div><div><dt>Interval coverage</dt><dd>{snapshot.run.intervalCoverage}%</dd></div></dl><div className="model-note"><AlertTriangle/><p>This portfolio model uses synthetic demand. Its error metrics demonstrate evaluation plumbing, not production accuracy.</p></div><div className="capacity-audit"><h4>Recent planning audit</h4>{snapshot.audit.slice(0, 4).map(item => <div key={item.id}><span/><p><strong>{display(item.action)}</strong><small>{item.actor_role} · {new Date(item.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></p></div>)}</div></article>
    </div>
  </section>;
}
