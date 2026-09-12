"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Check, CheckCircle2, Clock3, Download, FlaskConical, Gauge, RefreshCw, ServerCog, ShieldCheck, XCircle, Zap } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";

type BenchmarkResult = {
  profileKey: string;
  label: string;
  workOrders: number;
  technicians: number;
  territories: number;
  iterations: number;
  evaluations: number;
  durationMs: number;
  throughput: number;
  p95ShardMs: number;
  feasibleRate: number;
  hardRejectRate: number;
  constraintViolations: number;
  checksum: string;
};

type Snapshot = {
  operator: { id: string; displayName: string; role: string };
  run: {
    id: string;
    status: "PASSED" | "FAILED";
    suiteVersion: string;
    engineVersion: string;
    seed: number;
    iterations: number;
    profileCount: number;
    totalEvaluations: number;
    durationMs: number;
    throughput: number;
    p95ShardMs: number;
    deterministicPassed: boolean;
    zeroViolationPassed: boolean;
    environment: { runtime?: string; dataset?: string; kernel?: string; shardSize?: number; memoryLimitMb?: number };
    completedAt: string;
  };
  results: BenchmarkResult[];
  gates: Array<{ key: string; label: string; passed: boolean; evidence: string }>;
  baseline: { runId: string; completedAt: string; throughputDeltaPct: number; p95DeltaPct: number; statusChanged: boolean } | null;
  audit: Array<{ id: string; action: string; actor_role: string; created_at: string }>;
  reportUrl: string;
  boundaries: { scope: string; excluded: string; interpretation: string };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed (${response.status})`);
  return body as T;
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function number(value: number, digits = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

function percentDelta(value: number) {
  return `${value > 0 ? "+" : ""}${number(value, 1)}%`;
}

function BenchmarkMetric({ icon, label, value, detail, tone = "" }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: string }) {
  return <div className={`benchmark-metric ${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></div>;
}

export function SimulationBenchmark() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await request<Snapshot>("/api/benchmarks");
      setSnapshot(data);
      setError(null);
      return data;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Benchmark evidence is unavailable");
      throw cause;
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void load().catch(() => undefined), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const runSuite = useCallback(async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const data = await request<Snapshot>("/api/benchmarks/run", { method: "POST", body: JSON.stringify({ idempotencyKey: `benchmark-ui-${crypto.randomUUID()}` }) });
      setSnapshot(data);
      setNotice(`Benchmark ${data.run.id.slice(-8)} completed. ${data.gates.filter(gate => gate.passed).length} of ${data.gates.length} regression gates passed.`);
      return { runId: data.run.id, status: data.run.status, totalEvaluations: data.run.totalEvaluations, throughput: data.run.throughput, p95ShardMs: data.run.p95ShardMs };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Benchmark execution failed");
      throw cause;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "run_enterprise_benchmark",
      title: "Run enterprise benchmark",
      description: "Execute and persist the deterministic FieldOps constraint benchmark across four workload scales.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async () => runSuite(),
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [runSuite]);

  const chartData = useMemo(() => snapshot?.results.map(result => ({
    name: result.profileKey === "regional" ? "Regional" : result.profileKey === "enterprise" ? "Enterprise" : result.profileKey === "peak" ? "Peak" : "Small",
    throughput: Math.round(result.throughput),
    p95: result.p95ShardMs,
  })) ?? [], [snapshot?.results]);

  if (!snapshot) return <div className="benchmark-loading"><RefreshCw/><strong>Loading benchmark evidence</strong><span>Retrieving persisted scale tests and regression gates.</span>{error && <button onClick={() => void load()}>Retry</button>}</div>;

  const canRun = snapshot.operator.role === "supervisor" || snapshot.operator.role === "admin";
  const passedGates = snapshot.gates.filter(gate => gate.passed).length;
  return <section className="simulation-benchmark">
    <div className="benchmark-intro"><div><span className="eyebrow"><FlaskConical/> Scale simulation and evidence</span><h2>Enterprise benchmark lab</h2><p>Measure the constraint kernel, preserve every run, and stop regressions before release.</p></div><div className={`benchmark-verdict ${snapshot.run.status.toLowerCase()}`}><span>Latest regression verdict</span><strong>{snapshot.run.status === "PASSED" ? <CheckCircle2/> : <XCircle/>}{snapshot.run.status}</strong><small>{passedGates} of {snapshot.gates.length} gates passed · {snapshot.run.suiteVersion}</small></div></div>
    {error && <div className="benchmark-alert error"><XCircle/><span>{error}</span><button onClick={() => void load()}>Refresh evidence</button></div>}
    {notice && <div className="benchmark-alert success"><CheckCircle2/><span>{notice}</span></div>}
    <div className="benchmark-metrics">
      <BenchmarkMetric icon={<ServerCog/>} label="Evaluations" value={compact(snapshot.run.totalEvaluations)} detail={`${snapshot.run.profileCount} workload profiles · ${snapshot.run.iterations} replays`}/>
      <BenchmarkMetric icon={<Zap/>} label="Throughput" value={`${compact(snapshot.run.throughput)}/sec`} detail="Measured server-side kernel rate"/>
      <BenchmarkMetric icon={<Clock3/>} label="p95 shard latency" value={`${number(snapshot.run.p95ShardMs, 3)} ms`} detail={`${number(snapshot.run.environment.shardSize ?? 1_000)} work orders per shard`}/>
      <BenchmarkMetric icon={<ShieldCheck/>} label="Constraint violations" value={snapshot.run.zeroViolationPassed ? "0" : "Detected"} detail={snapshot.run.deterministicPassed ? "Deterministic replay verified" : "Replay mismatch detected"} tone={snapshot.run.zeroViolationPassed ? "safe" : "warning"}/>
    </div>
    <div className="benchmark-primary-grid">
      <article className="benchmark-card benchmark-chart-card"><div className="benchmark-card-heading"><div><h3>Performance by workload scale</h3><p>Constraint evaluations per second and p95 latency for 1,000-record shards</p></div><div className="benchmark-actions"><a href={snapshot.reportUrl}><Download/> Export CSV</a><Button onClick={() => void runSuite()} disabled={busy || !canRun}><RefreshCw className={busy ? "spinning" : ""}/> {busy ? "Running suite..." : "Run benchmark"}</Button></div></div><div className="benchmark-chart" aria-label="Benchmark throughput and latency by workload profile"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 10, right: 2, left: -8, bottom: 0 }}><CartesianGrid stroke="#e9edf1" vertical={false}/><XAxis dataKey="name" tick={{ fontSize: 11, fill: "#78838e" }} axisLine={false} tickLine={false}/><YAxis yAxisId="throughput" tick={{ fontSize: 11, fill: "#78838e" }} axisLine={false} tickLine={false} tickFormatter={compact}/><YAxis yAxisId="latency" orientation="right" tick={{ fontSize: 11, fill: "#78838e" }} axisLine={false} tickLine={false} unit=" ms"/><Tooltip contentStyle={{ borderRadius: 9, border: "1px solid #dce2e7", fontSize: 12 }} formatter={(value, name) => name === "p95 shard latency" ? [`${number(Number(value), 3)} ms`, name] : [`${number(Number(value))}/sec`, name]}/><Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }}/><Bar yAxisId="throughput" dataKey="throughput" name="Evaluation throughput" fill="#4a58d8" radius={[5, 5, 0, 0]}/><Line yAxisId="latency" type="monotone" dataKey="p95" name="p95 shard latency" stroke="#d67b2d" strokeWidth={3} dot={{ r: 4, fill: "#d67b2d" }}/></ComposedChart></ResponsiveContainer></div><div className="benchmark-boundary"><ShieldCheck/><span><strong>Measured boundary</strong>{snapshot.boundaries.scope}</span></div></article>
      <aside className="benchmark-card gate-card"><div className="benchmark-card-heading"><div><h3>Release regression gates</h3><p>Every condition must pass for a green suite</p></div><Gauge/></div><div className="gate-list">{snapshot.gates.map(gate => <div key={gate.key} className={gate.passed ? "passed" : "failed"}><span>{gate.passed ? <Check/> : <XCircle/>}</span><div><strong>{gate.label}</strong><small>{gate.evidence}</small></div></div>)}</div>{snapshot.baseline ? <div className="baseline-card"><span>Previous run comparison</span><div><strong className={snapshot.baseline.throughputDeltaPct >= 0 ? "better" : "worse"}>{percentDelta(snapshot.baseline.throughputDeltaPct)}</strong><small>throughput</small><strong className={snapshot.baseline.p95DeltaPct <= 0 ? "better" : "worse"}>{percentDelta(snapshot.baseline.p95DeltaPct)}</strong><small>p95 latency</small></div></div> : <div className="baseline-empty"><Activity/><span>A second run will establish the first performance baseline.</span></div>}</aside>
    </div>
    <div className="benchmark-secondary-grid">
      <article className="benchmark-card results-card"><div className="benchmark-card-heading"><div><h3>Scale profile evidence</h3><p>Persisted measurements from the latest benchmark run</p></div><span>{snapshot.run.id.slice(-8)}</span></div><div className="benchmark-table-wrap"><table><thead><tr><th>Profile</th><th>Work orders</th><th>Technicians</th><th>Territories</th><th>Evaluations</th><th>Throughput</th><th>p95 shard</th><th>Hard rejects</th><th>Checksum</th></tr></thead><tbody>{snapshot.results.map(result => <tr key={result.profileKey}><td><strong>{result.label}</strong></td><td>{number(result.workOrders)}</td><td>{number(result.technicians)}</td><td>{result.territories}</td><td>{number(result.evaluations)}</td><td>{compact(result.throughput)}/sec</td><td>{number(result.p95ShardMs, 3)} ms</td><td>{number(result.hardRejectRate, 1)}%</td><td><code>{result.checksum}</code></td></tr>)}</tbody></table></div></article>
      <article className="benchmark-card methodology-card"><div className="benchmark-card-heading"><div><h3>Method and limits</h3><p>What this evidence proves and what it does not</p></div><AlertTriangle/></div><dl><div><dt>Runtime</dt><dd>{snapshot.run.environment.runtime}</dd></div><div><dt>Workload</dt><dd>{snapshot.run.environment.dataset}</dd></div><div><dt>Kernel</dt><dd>{snapshot.run.environment.kernel}</dd></div><div><dt>Seed</dt><dd>{snapshot.run.seed}</dd></div><div><dt>Engine</dt><dd>{snapshot.run.engineVersion}</dd></div><div><dt>Completed</dt><dd>{new Date(snapshot.run.completedAt).toLocaleString()}</dd></div></dl><div className="method-note"><strong>Excluded from the measurement</strong><p>{snapshot.boundaries.excluded}</p></div><p className="interpretation">{snapshot.boundaries.interpretation}</p><div className="benchmark-audit"><h4>Recent benchmark audit</h4>{snapshot.audit.slice(0, 4).map(item => <div key={item.id}><span/><p><strong>{item.action.replaceAll("_", " ").toLowerCase()}</strong><small>{item.actor_role} · {new Date(item.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></p></div>)}</div></article>
    </div>
  </section>;
}
