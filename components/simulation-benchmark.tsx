"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FlaskConical,
  Gauge,
  Network,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Users,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
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

const profileMeta = {
  small: { code: "01", short: "Rooftop", scenario: "Single-rooftop recovery", pressure: "Localized capacity loss" },
  regional: { code: "02", short: "Regional", scenario: "Regional service group", pressure: "Multi-rooftop disruption" },
  enterprise: { code: "03", short: "Enterprise", scenario: "Enterprise dealer network", pressure: "Group-wide demand surge" },
  peak: { code: "04", short: "Peak", scenario: "Peak service load", pressure: "Maximum modeled pressure" },
} as const;

type ProfileKey = keyof typeof profileMeta;

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

function profileDetails(profileKey: string) {
  return profileMeta[profileKey as ProfileKey] ?? profileMeta.small;
}

export function SimulationBenchmark() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<ProfileKey>("regional");
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
      setError(cause instanceof Error ? cause.message : "Simulation evidence is unavailable");
      throw cause;
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void load().catch(() => undefined), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const runSuite = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await request<Snapshot>("/api/benchmarks/run", { method: "POST", body: JSON.stringify({ idempotencyKey: `benchmark-ui-${crypto.randomUUID()}` }) });
      setSnapshot(data);
      setNotice(`Stress suite ${data.run.id.slice(-8)} completed. ${data.gates.filter(gate => gate.passed).length} of ${data.gates.length} release gates passed.`);
      return { runId: data.run.id, status: data.run.status, totalEvaluations: data.run.totalEvaluations, throughput: data.run.throughput, p95ShardMs: data.run.p95ShardMs };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Stress suite execution failed");
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
      title: "Run dealership stress suite",
      description: "Execute and persist the deterministic FieldOps recovery benchmark across four dealership workload scales.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async () => runSuite(),
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [runSuite]);

  const resultsByScale = useMemo(() => snapshot?.results.map(result => ({
    ...result,
    meta: profileDetails(result.profileKey),
  })) ?? [], [snapshot?.results]);

  if (!snapshot) return <div className="simulation-lab-loading"><RefreshCw/><strong>Loading simulation evidence</strong><span>Retrieving the latest dealership stress test.</span>{error && <button onClick={() => void load()}>Retry</button>}</div>;

  const activeResult = snapshot.results.find(result => result.profileKey === selectedProfile) ?? snapshot.results[0];
  if (!activeResult) return <div className="simulation-lab-loading"><AlertTriangle/><strong>No simulation profiles found</strong><button onClick={() => void load()}>Refresh evidence</button></div>;

  const canRun = snapshot.operator.role === "supervisor" || snapshot.operator.role === "admin";
  const passedGates = snapshot.gates.filter(gate => gate.passed).length;
  const readiness = Math.round(passedGates / Math.max(snapshot.gates.length, 1) * 100);
  const maxOrders = Math.max(...snapshot.results.map(result => result.workOrders), 1);
  const acceptedSegments = Math.max(1, Math.round(activeResult.feasibleRate / 5));
  const activeMeta = profileDetails(activeResult.profileKey);

  return <section className="simulation-lab">
    <header className="simulation-lab-hero">
      <div className="simulation-lab-copy">
        <span><FlaskConical/> PREDEPLOYMENT RECOVERY TEST</span>
        <h2>Stress the recovery engine before the service day does.</h2>
        <p>Prove that dealership-scale disruptions remain fast, deterministic, and free of invalid assignments.</p>
        <div className="simulation-lab-actions">
          <Button onClick={() => void runSuite()} disabled={busy || !canRun}><RefreshCw className={busy ? "spinning" : ""}/> {busy ? "Running all scales..." : "Run stress suite"}</Button>
          <a href={snapshot.reportUrl}><Download/> Export evidence</a>
        </div>
      </div>
      <div className={`simulation-readiness ${snapshot.run.status.toLowerCase()}`}>
        <div className="simulation-readiness-ring" style={{ "--readiness": `${readiness}%` } as CSSProperties}><span><strong>{readiness}</strong><small>/ 100</small></span></div>
        <div><span>RELEASE READINESS</span><strong>{snapshot.run.status === "PASSED" ? <CheckCircle2/> : <XCircle/>}{snapshot.run.status}</strong><small>{passedGates} of {snapshot.gates.length} controls verified</small></div>
      </div>
    </header>

    {error && <div className="simulation-lab-alert error"><XCircle/><span>{error}</span><button onClick={() => void load()}>Refresh evidence</button></div>}
    {notice && <div className="simulation-lab-alert success"><CheckCircle2/><span>{notice}</span></div>}

    <section className="simulation-profile-panel">
      <header><div><span>01 / SELECT FOCUS</span><h3>Dealership workload scale</h3></div><small>The full suite runs all four profiles</small></header>
      <div className="simulation-profile-tabs" role="tablist" aria-label="Simulation focus profile">
        {resultsByScale.map(result => <button key={result.profileKey} role="tab" aria-selected={selectedProfile === result.profileKey} className={selectedProfile === result.profileKey ? "selected" : ""} onClick={() => setSelectedProfile(result.profileKey as ProfileKey)}>
          <span>{result.meta.code}</span>
          <div><strong>{result.meta.short}</strong><small>{compact(result.workOrders)} repair orders</small></div>
          <div className="simulation-scale-meter"><i style={{ width: `${Math.max(6, result.workOrders / maxOrders * 100)}%` }}/></div>
        </button>)}
      </div>
    </section>

    <div className="simulation-stage-grid">
      <article className="simulation-pressure-card" role="tabpanel">
        <header><div><span>02 / APPLY PRESSURE</span><h3>{activeMeta.scenario}</h3><p>{activeMeta.pressure}</p></div><strong>{activeResult.iterations} deterministic replays</strong></header>
        <div className="simulation-operating-scale">
          <div><Wrench/><span><small>REPAIR ORDERS</small><strong>{number(activeResult.workOrders)}</strong></span></div>
          <div><Users/><span><small>TECHNICIANS</small><strong>{number(activeResult.technicians)}</strong></span></div>
          <div><Network/><span><small>ROOFTOPS</small><strong>{activeResult.territories}</strong></span></div>
        </div>
        <div className="simulation-decision-path" aria-label="Simulation decision path">
          <span><i>01</i><small>LOAD</small><strong>{compact(activeResult.evaluations)} evaluations</strong></span><ArrowRight/>
          <span><i>02</i><small>SCREEN</small><strong>{number(activeResult.hardRejectRate, 1)}% removed</strong></span><ArrowRight/>
          <span><i>03</i><small>SCORE</small><strong>{number(activeResult.feasibleRate, 1)}% feasible</strong></span><ArrowRight/>
          <span><i>04</i><small>VERIFY</small><strong>{activeResult.constraintViolations} violations</strong></span>
        </div>
        <div className="simulation-candidate-map">
          <div><span>CANDIDATE ASSIGNMENT SCREEN</span><small><i/> feasible <i/> hard reject</small></div>
          <div>{Array.from({ length: 20 }, (_, index) => <i key={index} className={index < acceptedSegments ? "accepted" : "rejected"}/>)}</div>
        </div>
        <footer>
          <div><Zap/><span><small>DECISION THROUGHPUT</small><strong>{compact(activeResult.throughput)} / sec</strong></span></div>
          <div><Clock3/><span><small>1,000 RO SHARD P95</small><strong>{number(activeResult.p95ShardMs, 3)} ms</strong></span></div>
          <div><ShieldCheck/><span><small>INVALID MOVES ACCEPTED</small><strong>{activeResult.constraintViolations}</strong></span></div>
        </footer>
      </article>

      <aside className="simulation-gates-card">
        <header><div><span>03 / RELEASE VERDICT</span><h3>Operational controls</h3></div><Gauge/></header>
        <div className="simulation-gate-list">{snapshot.gates.map(gate => <div key={gate.key} className={gate.passed ? "passed" : "failed"}><span>{gate.passed ? <Check/> : <XCircle/>}</span><div><strong>{gate.label}</strong><small>{gate.evidence}</small></div></div>)}</div>
        {snapshot.baseline ? <div className="simulation-baseline"><span>VERSUS PREVIOUS RUN</span><div><strong className={snapshot.baseline.throughputDeltaPct >= 0 ? "better" : "worse"}>{percentDelta(snapshot.baseline.throughputDeltaPct)}</strong><small>throughput</small><strong className={snapshot.baseline.p95DeltaPct <= 0 ? "better" : "worse"}>{percentDelta(snapshot.baseline.p95DeltaPct)}</strong><small>latency</small></div></div> : <div className="simulation-baseline empty"><ServerCog/><p>Run the suite again to establish a performance baseline.</p></div>}
      </aside>
    </div>

    <section className="simulation-outcome-strip" aria-label="Latest simulation outcomes">
      <div><small>TOTAL EVALUATIONS</small><strong>{compact(snapshot.run.totalEvaluations)}</strong><span>Across {snapshot.run.profileCount} dealership scales</span></div>
      <div><small>PORTFOLIO THROUGHPUT</small><strong>{compact(snapshot.run.throughput)} / sec</strong><span>Server-side constraint kernel</span></div>
      <div><small>WORST-CASE P95</small><strong>{number(snapshot.run.p95ShardMs, 3)} ms</strong><span>Gate remains below 150 ms</span></div>
      <div><small>HARD VIOLATIONS</small><strong>{snapshot.run.zeroViolationPassed ? "ZERO" : "FOUND"}</strong><span>{snapshot.run.deterministicPassed ? "Replay verified" : "Replay mismatch"}</span></div>
    </section>

    <details className="simulation-evidence">
      <summary><span><ServerCog/> Technical evidence and measurement limits</span><ChevronDown/></summary>
      <div className="simulation-evidence-body">
        <div className="simulation-table-wrap"><table><thead><tr><th>Profile</th><th>Repair orders</th><th>Technicians</th><th>Rooftops</th><th>Evaluations</th><th>Throughput</th><th>p95 shard</th><th>Hard rejects</th><th>Checksum</th></tr></thead><tbody>{snapshot.results.map(result => <tr key={result.profileKey}><td><strong>{result.label}</strong></td><td>{number(result.workOrders)}</td><td>{number(result.technicians)}</td><td>{result.territories}</td><td>{number(result.evaluations)}</td><td>{compact(result.throughput)}/sec</td><td>{number(result.p95ShardMs, 3)} ms</td><td>{number(result.hardRejectRate, 1)}%</td><td><code>{result.checksum}</code></td></tr>)}</tbody></table></div>
        <aside><dl><div><dt>Runtime</dt><dd>{snapshot.run.environment.runtime}</dd></div><div><dt>Dataset</dt><dd>{snapshot.run.environment.dataset}</dd></div><div><dt>Kernel</dt><dd>{snapshot.run.environment.kernel}</dd></div><div><dt>Seed</dt><dd>{snapshot.run.seed}</dd></div><div><dt>Completed</dt><dd>{new Date(snapshot.run.completedAt).toLocaleString()}</dd></div></dl><div className="simulation-limit"><AlertTriangle/><p><strong>Measurement boundary</strong>{snapshot.boundaries.interpretation} {snapshot.boundaries.excluded}</p></div></aside>
      </div>
    </details>
  </section>;
}
