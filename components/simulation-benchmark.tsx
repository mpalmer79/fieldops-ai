"use client";

import type { CSSProperties, KeyboardEvent } from "react";
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

  function handleProfileKeyDown(event: KeyboardEvent<HTMLButtonElement>, profile: ProfileKey) {
    const profiles = resultsByScale.map(result => result.profileKey as ProfileKey);
    const currentIndex = profiles.indexOf(profile);
    const nextIndex = event.key === "ArrowRight" || event.key === "ArrowDown" ? (currentIndex + 1) % profiles.length : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (currentIndex - 1 + profiles.length) % profiles.length : event.key === "Home" ? 0 : event.key === "End" ? profiles.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const nextProfile = profiles[nextIndex];
    setSelectedProfile(nextProfile);
    document.getElementById(`simulation-tab-${nextProfile}`)?.focus();
  }

  if (!snapshot) return <div className="simulation-lab-loading" role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"} aria-busy={!error}><RefreshCw aria-hidden="true"/><strong>{error ? "Simulation evidence unavailable" : "Loading simulation evidence"}</strong><span>{error ?? "Retrieving the latest dealership stress test."}</span>{error && <button type="button" onClick={() => void load()}>Retry</button>}</div>;

  const activeResult = snapshot.results.find(result => result.profileKey === selectedProfile) ?? snapshot.results[0];
  if (!activeResult) return <div className="simulation-lab-loading" role="alert"><AlertTriangle aria-hidden="true"/><strong>No simulation profiles found</strong><button type="button" onClick={() => void load()}>Refresh evidence</button></div>;

  const canRun = snapshot.operator.role === "supervisor" || snapshot.operator.role === "admin";
  const passedGates = snapshot.gates.filter(gate => gate.passed).length;
  const readiness = Math.round(passedGates / Math.max(snapshot.gates.length, 1) * 100);
  const maxOrders = Math.max(...snapshot.results.map(result => result.workOrders), 1);
  const acceptedSegments = Math.max(1, Math.round(activeResult.feasibleRate / 5));
  const activeMeta = profileDetails(activeResult.profileKey);

  return <section className="simulation-lab" aria-busy={busy}>
    <header className="simulation-lab-hero">
      <div className="simulation-lab-copy">
        <span><FlaskConical/> PREDEPLOYMENT RECOVERY TEST</span>
        <h2>Stress the recovery engine before the service day does.</h2>
        <p>Prove that dealership-scale disruptions remain fast, deterministic, and free of invalid assignments.</p>
        <div className="simulation-lab-actions">
          <Button onClick={() => void runSuite()} disabled={busy || !canRun} aria-describedby={!canRun ? "simulation-role-boundary" : undefined}><RefreshCw className={busy ? "spinning" : ""} aria-hidden="true"/> {busy ? "Running all scales..." : "Run stress suite"}</Button>
          <a href={snapshot.reportUrl}><Download/> Export evidence</a>
        </div>
        {!canRun && <p id="simulation-role-boundary" className="role-boundary">Running the stress suite requires supervisor access.</p>}
      </div>
      <div className={`simulation-readiness ${snapshot.run.status.toLowerCase()}`}>
        <div className="simulation-readiness-ring" style={{ "--readiness": `${readiness}%` } as CSSProperties}><span><strong>{readiness}</strong><small>/ 100</small></span></div>
        <div><span>RELEASE READINESS</span><strong>{snapshot.run.status === "PASSED" ? <CheckCircle2/> : <XCircle/>}{snapshot.run.status}</strong><small>{passedGates} of {snapshot.gates.length} controls verified</small></div>
      </div>
    </header>

    {error && <div className="simulation-lab-alert error" role="alert"><XCircle aria-hidden="true"/><span>{error}</span><button type="button" onClick={() => void load()}>Refresh evidence</button></div>}
    {notice && <div className="simulation-lab-alert success" role="status" aria-live="polite" aria-atomic="true"><CheckCircle2 aria-hidden="true"/><span>{notice}</span></div>}

    <section className="simulation-profile-panel">
      <header><div><span>01 / SELECT FOCUS</span><h3>Dealership workload scale</h3></div><small>The full suite runs all four profiles</small></header>
      <div className="simulation-profile-tabs" role="tablist" aria-label="Simulation focus profile">
        {resultsByScale.map(result => <button key={result.profileKey} id={`simulation-tab-${result.profileKey}`} type="button" role="tab" aria-selected={selectedProfile === result.profileKey} aria-controls={`simulation-panel-${result.profileKey}`} tabIndex={selectedProfile === result.profileKey ? 0 : -1} className={selectedProfile === result.profileKey ? "selected" : ""} onClick={() => setSelectedProfile(result.profileKey as ProfileKey)} onKeyDown={event => handleProfileKeyDown(event, result.profileKey as ProfileKey)}>
          <span>{result.meta.code}</span>
          <div><strong>{result.meta.short}</strong><small>{compact(result.workOrders)} repair orders</small></div>
          <div className="simulation-scale-meter"><i style={{ width: `${Math.max(6, result.workOrders / maxOrders * 100)}%` }}/></div>
        </button>)}
      </div>
    </section>

    <div className="simulation-stage-grid">
      <article id={`simulation-panel-${activeResult.profileKey}`} className="simulation-pressure-card" role="tabpanel" aria-labelledby={`simulation-tab-${activeResult.profileKey}`} tabIndex={0}>
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
        <div className="simulation-table-wrap"><table><caption className="sr-only">Stress-suite results by dealership workload profile</caption><thead><tr><th scope="col">Profile</th><th scope="col">Repair orders</th><th scope="col">Technicians</th><th scope="col">Rooftops</th><th scope="col">Evaluations</th><th scope="col">Throughput</th><th scope="col">p95 shard</th><th scope="col">Hard rejects</th><th scope="col">Checksum</th></tr></thead><tbody>{snapshot.results.map(result => <tr key={result.profileKey}><th scope="row"><strong>{result.label}</strong></th><td>{number(result.workOrders)}</td><td>{number(result.technicians)}</td><td>{result.territories}</td><td>{number(result.evaluations)}</td><td>{compact(result.throughput)}/sec</td><td>{number(result.p95ShardMs, 3)} ms</td><td>{number(result.hardRejectRate, 1)}%</td><td><code>{result.checksum}</code></td></tr>)}</tbody></table></div>
        <aside><dl><div><dt>Runtime</dt><dd>{snapshot.run.environment.runtime}</dd></div><div><dt>Dataset</dt><dd>{snapshot.run.environment.dataset}</dd></div><div><dt>Kernel</dt><dd>{snapshot.run.environment.kernel}</dd></div><div><dt>Seed</dt><dd>{snapshot.run.seed}</dd></div><div><dt>Completed</dt><dd>{new Date(snapshot.run.completedAt).toLocaleString()}</dd></div></dl><div className="simulation-limit"><AlertTriangle/><p><strong>Measurement boundary</strong>{snapshot.boundaries.interpretation} {snapshot.boundaries.excluded}</p></div></aside>
      </div>
    </details>
  </section>;
}
