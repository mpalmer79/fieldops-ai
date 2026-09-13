"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Bot, Check, CheckCircle2, CircleDollarSign, Clock3, FlaskConical, OctagonAlert, Play, RefreshCw, RotateCcw, ShieldCheck, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

type Evaluation = { id: string; status: "PASSED" | "FAILED"; taskSuccess: number; policyCompliance: number; hallucinationRate: number; toolAccuracy: number; p95LatencyMs: number; sampleSize: number; failures: Array<{ category: string; count: number }>; completedAt: string };
type AgentVersion = { id: string; version: string; model: string; promptHash: string; tools: string[]; permissions: string[]; status: string; recordVersion: number; createdAt: string; updatedAt: string; evaluation: Evaluation | null };
type Suite = { id: string; name: string; taskSuccessThreshold: number; policyComplianceThreshold: number; hallucinationThreshold: number; toolAccuracyThreshold: number; latencyThresholdMs: number; sampleSize: number };
type Agent = { id: string; name: string; responsibility: string; status: "HEALTHY" | "DEGRADED" | "PAUSED"; currentVersionId: string; ownerTeam: string; riskTier: string; dailyDecisions: number; successRate: number; avgLatencyMs: number; escalationRate: number; costPerDecision: number; recordVersion: number; suite: Suite; versions: AgentVersion[] };
type Incident = { id: string; agent_id: string; severity: string; category: string; summary: string; status: string; detected_at: string };
type Snapshot = { operator: { role: string }; summary: { totalAgents: number; healthyAgents: number; dailyDecisions: number; openIncidents: number; dailyCost: number }; agents: Agent[]; incidents: Incident[]; gates: { taskSuccess: number; policyCompliance: number; hallucinationRate: number; toolAccuracy: number; p95LatencyMs: number; sampleSize: number }; generatedAt: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed (${response.status})`);
  return body as T;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

export function AgentOpsControlTower() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedId, setSelectedId] = useState("dispatch");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await request<Snapshot>("/api/agentops");
      setSnapshot(data); setError(null);
      setSelectedId(current => data.agents.some(agent => agent.id === current) ? current : data.agents[0]?.id ?? "");
      return data;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AgentOps data is unavailable");
      throw cause;
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void load().catch(() => undefined), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const agent = snapshot?.agents.find(item => item.id === selectedId) ?? snapshot?.agents[0] ?? null;
  const candidate = useMemo(() => agent?.versions.find(version => version.id !== agent.currentVersionId && !["SUPERSEDED", "ROLLED_BACK"].includes(version.status)) ?? agent?.versions.find(version => version.id === agent.currentVersionId) ?? null, [agent]);
  const evaluation = candidate?.evaluation ?? null;
  const canAdmin = snapshot?.operator.role === "admin";

  const runEvaluation = useCallback(async (versionId = candidate?.id) => {
    if (!versionId) throw new Error("No agent version selected");
    setBusy("evaluation"); setError(null); setNotice(null);
    try {
      const result = await request<{ evaluation: Evaluation }>("/api/agentops/evaluations", { method: "POST", body: JSON.stringify({ versionId }) });
      setNotice(`Evaluation ${result.evaluation.status.toLowerCase()}: ${result.evaluation.sampleSize} cases checked against five release gates.`);
      await load(); return result.evaluation;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Evaluation failed"); throw cause; }
    finally { setBusy(null); }
  }, [candidate?.id, load]);

  const promote = useCallback(async (target: "SHADOW" | "PRODUCTION", versionId = candidate?.id) => {
    const source = snapshot?.agents.flatMap(item => item.versions).find(version => version.id === versionId);
    if (!source) throw new Error("Agent version not found");
    setBusy(target.toLowerCase()); setError(null); setNotice(null);
    try {
      await request("/api/agentops/deployments", { method: "POST", body: JSON.stringify({ action: "promote", versionId: source.id, target, expectedVersion: source.recordVersion }) });
      setNotice(target === "SHADOW" ? `Version ${source.version} is running in shadow at 10% mirrored traffic.` : `Version ${source.version} is now the production version at 100% traffic.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Promotion failed"); throw cause; }
    finally { setBusy(null); }
  }, [candidate?.id, load, snapshot?.agents]);

  const rollback = useCallback(async (agentId = agent?.id) => {
    const source = snapshot?.agents.find(item => item.id === agentId);
    if (!source) throw new Error("Agent not found");
    setBusy("rollback"); setError(null); setNotice(null);
    try {
      await request("/api/agentops/deployments", { method: "POST", body: JSON.stringify({ action: "rollback", agentId: source.id, expectedVersion: source.recordVersion }) });
      setNotice(`${source.name} was restored to its prior production version. The rollback is recorded in the audit log.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Rollback failed"); throw cause; }
    finally { setBusy(null); }
  }, [agent?.id, load, snapshot?.agents]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({ name: "run_agent_evaluation", title: "Run agent evaluation", description: "Run the deterministic 500-case release suite for a persisted agent version.", inputSchema: { type: "object", properties: { versionId: { type: "string" } }, required: ["versionId"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => { const value = input as { versionId: string }; return runEvaluation(value.versionId); } }, { signal: lifecycle.signal })).catch(() => undefined);
    void Promise.resolve(context.registerTool({ name: "promote_agent_version", title: "Promote agent version", description: "Promote a gate-approved agent version to shadow or production.", inputSchema: { type: "object", properties: { versionId: { type: "string" }, target: { type: "string", enum: ["SHADOW", "PRODUCTION"] } }, required: ["versionId", "target"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => { const value = input as { versionId: string; target: "SHADOW" | "PRODUCTION" }; await promote(value.target, value.versionId); return { status: "promoted", ...value }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    void Promise.resolve(context.registerTool({ name: "rollback_agent_deployment", title: "Rollback agent deployment", description: "Restore an agent's previous production version using a compensating deployment action.", inputSchema: { type: "object", properties: { agentId: { type: "string" } }, required: ["agentId"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => { const value = input as { agentId: string }; await rollback(value.agentId); return { status: "rolled_back", agentId: value.agentId }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [promote, rollback, runEvaluation]);

  if (!snapshot) return <div className="agentops-loading" role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"} aria-busy={!error}><RefreshCw aria-hidden="true"/><strong>{error ? "AgentOps unavailable" : "Loading AgentOps control tower"}</strong><span>{error ?? "Reading fleet health, release gates, and deployment state."}</span>{error && <button type="button" onClick={() => void load()}>Retry</button>}</div>;

  const production = agent?.versions.find(version => version.id === agent.currentVersionId);
  const hasPriorProduction = Boolean(agent && production && snapshot.agents.find(item => item.id === agent.id)?.versions.some(version => version.status === "SUPERSEDED"));
  return <section className="agentops" aria-busy={Boolean(busy)}>
    <div className="agentops-intro"><div><span className="eyebrow"><ShieldCheck/> Governed AI operations</span><h2>AgentOps control tower</h2><p>Evaluate, promote, monitor, and roll back operational agents with explicit release gates.</p></div><div className="environment"><i/> Production fleet <strong>{snapshot.summary.healthyAgents}/{snapshot.summary.totalAgents} healthy</strong></div></div>
    {error && <div className="agentops-alert error" role="alert"><OctagonAlert aria-hidden="true"/><span>{error}</span><button type="button" onClick={() => void load()}>Refresh state</button></div>}
    {notice && <div className="agentops-alert success" role="status" aria-live="polite" aria-atomic="true"><CheckCircle2 aria-hidden="true"/><span>{notice}</span></div>}
    <div className="agentops-metrics"><AgentMetric icon={<Bot/>} label="Active agents" value={String(snapshot.summary.totalAgents)} detail={`${snapshot.summary.healthyAgents} healthy · ${snapshot.summary.totalAgents - snapshot.summary.healthyAgents} needs review`}/><AgentMetric icon={<Zap/>} label="Daily decisions" value={formatCount(snapshot.summary.dailyDecisions)} detail="Across the operational fleet"/><AgentMetric icon={<AlertTriangle/>} label="Open incidents" value={String(snapshot.summary.openIncidents)} detail="Gate failures and runtime drift" tone={snapshot.summary.openIncidents ? "warning" : ""}/><AgentMetric icon={<CircleDollarSign/>} label="Daily inference cost" value={formatMoney(snapshot.summary.dailyCost)} detail="Measured cost per decision"/></div>
    <div className="agentops-layout"><article className="agent-fleet-card"><div className="agentops-card-heading"><div><h3>Agent fleet</h3><p>Production health and operating load</p></div><span>Live state</span></div><div className="agent-fleet-list" role="group" aria-label="Select an operational agent">{snapshot.agents.map(item => <button type="button" key={item.id} className={item.id === agent?.id ? "selected" : ""} onClick={() => setSelectedId(item.id)} aria-pressed={item.id === agent?.id} aria-controls="selected-agent-release"><span className={`agent-status-dot ${item.status.toLowerCase()}`} aria-hidden="true"/><div><strong>{item.name}</strong><small>{item.responsibility}</small></div><div className="agent-health"><strong>{item.successRate}%</strong><small>{item.status.toLowerCase()}</small></div><ArrowRight aria-hidden="true"/></button>)}</div></article>
    {agent && candidate && <article id="selected-agent-release" className="agent-release-card" aria-live="polite"><div className="agentops-card-heading"><div><h3>{agent.name}</h3><p>{agent.ownerTeam} · {agent.riskTier.toLowerCase()} risk</p></div><span className={`health-pill ${agent.status.toLowerCase()}`}>{agent.status}</span></div><div className="agent-version-line"><div><small>Production</small><strong>v{production?.version}</strong><span>{production?.model}</span></div><ArrowRight/><div><small>Candidate</small><strong>v{candidate.version}</strong><span>{candidate.status.toLowerCase()}</span></div><div className="version-hash"><small>Prompt</small><code>{candidate.promptHash}</code></div></div><div className="agent-runtime-grid"><div><span>Success</span><strong>{agent.successRate}%</strong></div><div><span>Latency</span><strong>{(agent.avgLatencyMs / 1000).toFixed(2)}s</strong></div><div><span>Escalation</span><strong>{agent.escalationRate}%</strong></div><div><span>Cost / decision</span><strong>{formatMoney(agent.costPerDecision)}</strong></div></div><div className="release-actions"><Button variant="outline" onClick={() => void runEvaluation()} disabled={Boolean(busy)}><FlaskConical/> {busy === "evaluation" ? "Evaluating..." : "Run evaluation"}</Button>{candidate.status === "EVALUATED" && <Button onClick={() => void promote("SHADOW")} disabled={Boolean(busy) || evaluation?.status !== "PASSED" || !canAdmin}><Play/> Promote to shadow</Button>}{candidate.status === "SHADOW" && <Button onClick={() => void promote("PRODUCTION")} disabled={Boolean(busy) || evaluation?.status !== "PASSED" || !canAdmin}><Zap/> Promote to production</Button>}{candidate.id === agent.currentVersionId && hasPriorProduction && <Button variant="outline" className="rollback-button" onClick={() => void rollback()} disabled={Boolean(busy) || !canAdmin}><RotateCcw/> Roll back production</Button>}</div>{!canAdmin && <p className="role-boundary">Production changes require an admin role. Evaluation requires supervisor access.</p>}</article>}
    </div>
    {agent && candidate && <div className="agentops-detail-grid"><EvaluationCard evaluation={evaluation} suite={agent.suite}/><FailureCard evaluation={evaluation}/><IncidentCard incidents={snapshot.incidents.filter(incident => incident.agent_id === agent.id)}/></div>}
  </section>;
}

function AgentMetric({ icon, label, value, detail, tone = "" }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: string }) {
  return <div className={`agent-metric ${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></div>;
}

function EvaluationCard({ evaluation, suite }: { evaluation: Evaluation | null; suite: Suite }) {
  const rows = evaluation ? [
    ["Task success", evaluation.taskSuccess, suite.taskSuccessThreshold, "%", evaluation.taskSuccess >= suite.taskSuccessThreshold],
    ["Policy compliance", evaluation.policyCompliance, suite.policyComplianceThreshold, "%", evaluation.policyCompliance >= suite.policyComplianceThreshold],
    ["Hallucination rate", evaluation.hallucinationRate, suite.hallucinationThreshold, "%", evaluation.hallucinationRate <= suite.hallucinationThreshold],
    ["Tool accuracy", evaluation.toolAccuracy, suite.toolAccuracyThreshold, "%", evaluation.toolAccuracy >= suite.toolAccuracyThreshold],
    ["P95 latency", evaluation.p95LatencyMs, suite.latencyThresholdMs, " ms", evaluation.p95LatencyMs <= suite.latencyThresholdMs],
  ] as const : [];
  return <article className="agent-detail-card evaluation-card"><div className="agentops-card-heading"><div><h3>Release gates</h3><p>{evaluation ? `${evaluation.sampleSize} deterministic test cases` : "No evaluation recorded"}</p></div>{evaluation && <span className={`evaluation-result ${evaluation.status.toLowerCase()}`}>{evaluation.status === "PASSED" ? <Check/> : <XCircle/>}{evaluation.status}</span>}</div><div className="gate-list">{rows.map(([label, value, threshold, suffix, passed]) => <div className="gate-row" key={label}><span className={passed ? "gate-pass" : "gate-fail"}>{passed ? <Check/> : <XCircle/>}</span><div><strong>{label}</strong><small>{label === "Hallucination rate" || label === "P95 latency" ? "Maximum" : "Minimum"} {threshold}{suffix}</small></div><strong>{value}{suffix}</strong></div>)}</div></article>;
}

function FailureCard({ evaluation }: { evaluation: Evaluation | null }) {
  const failures = evaluation?.failures ?? [];
  const max = Math.max(1, ...failures.map(item => item.count));
  return <article className="agent-detail-card"><div className="agentops-card-heading"><div><h3>Failure analysis</h3><p>Latest evaluation categories</p></div><span>{failures.reduce((sum, item) => sum + item.count, 0)} cases</span></div><div className="failure-list">{failures.map(item => <div key={item.category}><div><span>{item.category}</span><strong>{item.count}</strong></div><span><i style={{ width: `${item.count / max * 100}%` }}/></span></div>)}{failures.length === 0 && <p className="no-results">Run an evaluation to classify failure modes.</p>}</div></article>;
}

function IncidentCard({ incidents }: { incidents: Incident[] }) {
  return <article className="agent-detail-card"><div className="agentops-card-heading"><div><h3>Active incidents</h3><p>Runtime drift and safety findings</p></div><span>{incidents.filter(item => item.status === "OPEN").length} open</span></div><div className="incident-list">{incidents.slice(0, 4).map(item => <div key={item.id}><span className={item.severity.toLowerCase()}>{item.severity}</span><div><strong>{item.category}</strong><p>{item.summary}</p><small><Clock3/> {new Date(item.detected_at).toLocaleDateString()}</small></div></div>)}{incidents.length === 0 && <div className="no-incidents"><ShieldCheck/><strong>No active incidents</strong><span>Current agent state is within monitored limits.</span></div>}</div></article>;
}
