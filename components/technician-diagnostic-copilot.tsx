"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpenCheck, Check, CheckCircle2, ClipboardCheck, Clock3, FileSearch, History, PackageCheck, RefreshCw, ShieldAlert, Sparkles, Stethoscope, Wrench, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type CaseState = {
  id: string;
  workOrderId: string;
  technicianId: string;
  technicianName: string;
  city: string;
  appointmentWindow: string;
  vehicleMake: string;
  vehicleModel: string;
  vinTail: string;
  complaint: string;
  symptomCode: string;
  status: "INTAKE" | "ANALYZED" | "RECOMMENDATION_ACCEPTED" | "RESOLVED" | "ESCALATED";
  safetyStatus: "CLEAR" | "ACK_REQUIRED" | "ACKNOWLEDGED";
  selectedRecommendationId: string | null;
  recordVersion: number;
};

type Recommendation = {
  id: string;
  rank: number;
  faultCode: string;
  component: string;
  confidence: number;
  rationale: string;
  verificationStep: string;
  partCode: string | null;
  safetyClass: "STANDARD" | "LOCKOUT_REQUIRED" | "ESCALATE";
  groundingScore: number;
  sourceIds: string[];
  status: "PROPOSED" | "ACCEPTED" | "REJECTED";
};

type Source = { id: string; title: string; source_type: string; revision: string; reference_code: string; summary: string; verified_at: string };
type Part = { id: string; part_code: string; description: string; location: string; on_hand: number; reserved: number; updated_at: string };
type ToolCall = { id: string; tool_name: string; status: string; input: Record<string, unknown>; output: Record<string, unknown>; created_at: string };
type Audit = { id: string; action: string; actor_role: string; metadata_json: string; created_at: string };
type Outcome = { id: string; recommendation_id: string; first_time_fix: number; duration_minutes: number; notes: string; created_at: string };
type Snapshot = {
  operator: { id: string; displayName: string; role: string };
  case: CaseState;
  run: { id: string; modelVersion: string; status: string; groundingRate: number; sourceCount: number; toolCallCount: number; completedAt: string };
  recommendations: Recommendation[];
  sources: Source[];
  parts: Part[];
  toolCalls: ToolCall[];
  outcome: Outcome | null;
  audit: Audit[];
  metrics: { topConfidence: number; groundedRecommendations: number; availableUnits: number; unknownProbability: number };
  boundaries: { scenario: string; evidence: string; autonomy: string };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed (${response.status})`);
  return body as T;
}

function displayStatus(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function toolSummary(tool: ToolCall) {
  if (tool.tool_name === "parts_lookup") return "Parts availability verified";
  if (tool.tool_name === "service_history") return Number(tool.output.priorVisits ?? 0) === 0 ? "No prior service visits" : `${String(tool.output.priorVisits)} prior visits`;
  if (tool.tool_name === "coverage_check") return "Coverage record verified";
  return tool.status.toLowerCase();
}

export function TechnicianDiagnosticCopilot() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [escalationReason, setEscalationReason] = useState("Electrical verification requires specialist review and controlled test equipment.");
  const [durationMinutes, setDurationMinutes] = useState(54);
  const [firstTimeFix, setFirstTimeFix] = useState(true);
  const [outcomeNotes, setOutcomeNotes] = useState("Verified intermittent crank-sensor signal dropout, completed the repair, and confirmed reliable hot restart.");

  const load = useCallback(async () => {
    try {
      const data = await request<Snapshot>("/api/diagnostics");
      setSnapshot(data);
      setSelectedId(current => data.recommendations.some(item => item.id === current) ? current : data.case.selectedRecommendationId ?? data.recommendations[0]?.id ?? "");
      setSafetyAcknowledged(data.case.safetyStatus === "ACKNOWLEDGED");
      setError(null);
      return data;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Diagnostic workflow is unavailable");
      throw cause;
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void load().catch(() => undefined), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const selected = useMemo(() => snapshot?.recommendations.find(item => item.id === selectedId) ?? snapshot?.recommendations[0] ?? null, [selectedId, snapshot?.recommendations]);
  const selectedSources = useMemo(() => snapshot?.sources.filter(source => selected?.sourceIds.includes(source.id)) ?? [], [selected?.sourceIds, snapshot?.sources]);
  const selectedParts = useMemo(() => snapshot?.parts.filter(part => part.part_code === selected?.partCode) ?? [], [selected?.partCode, snapshot?.parts]);

  const analyze = useCallback(async (caseId?: string) => {
    const source = snapshot;
    if (!source || (caseId && caseId !== source.case.id)) throw new Error("Diagnostic case not found");
    setBusy("analyze"); setError(null); setNotice(null);
    try {
      const data = await request<Snapshot>("/api/diagnostics/analyze", { method: "POST", body: JSON.stringify({ caseId: source.case.id, expectedVersion: source.case.recordVersion }) });
      setSnapshot(data); setSelectedId(data.recommendations[0]?.id ?? ""); setSafetyAcknowledged(false);
      setNotice(`Analysis ${data.run.id.slice(-8)} completed with ${data.run.groundingRate}% evidence coverage.`);
      return { caseId: data.case.id, runId: data.run.id, recommendations: data.recommendations.length, groundingRate: data.run.groundingRate };
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Analysis failed"); throw cause; }
    finally { setBusy(null); }
  }, [snapshot]);

  const accept = useCallback(async (recommendationId?: string, acknowledged = safetyAcknowledged) => {
    const source = snapshot;
    const recommendation = source?.recommendations.find(item => item.id === (recommendationId ?? selected?.id));
    if (!source || !recommendation) throw new Error("Select a current recommendation");
    setBusy("accept"); setError(null); setNotice(null);
    try {
      const data = await request<Snapshot>("/api/diagnostics/actions", { method: "POST", body: JSON.stringify({ action: "accept", caseId: source.case.id, recommendationId: recommendation.id, expectedVersion: source.case.recordVersion, safetyAcknowledged: acknowledged }) });
      setSnapshot(data); setSelectedId(recommendation.id); setSafetyAcknowledged(data.case.safetyStatus === "ACKNOWLEDGED");
      setNotice(`${recommendation.component} accepted as the verification path. The decision and safety acknowledgement were audited.`);
      return { caseId: data.case.id, recommendationId: recommendation.id, status: data.case.status, safetyStatus: data.case.safetyStatus };
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Recommendation acceptance failed"); throw cause; }
    finally { setBusy(null); }
  }, [safetyAcknowledged, selected?.id, snapshot]);

  const escalate = useCallback(async (reason = escalationReason) => {
    if (!snapshot) throw new Error("Diagnostic case not loaded");
    setBusy("escalate"); setError(null); setNotice(null);
    try {
      const data = await request<Snapshot>("/api/diagnostics/actions", { method: "POST", body: JSON.stringify({ action: "escalate", caseId: snapshot.case.id, expectedVersion: snapshot.case.recordVersion, reason }) });
      setSnapshot(data); setNotice("Case escalated with the technician rationale preserved in the audit trail.");
      return { caseId: data.case.id, status: data.case.status };
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Escalation failed"); throw cause; }
    finally { setBusy(null); }
  }, [escalationReason, snapshot]);

  const resolve = useCallback(async (input?: { firstTimeFix: boolean; durationMinutes: number; notes: string }) => {
    if (!snapshot) throw new Error("Diagnostic case not loaded");
    const values = input ?? { firstTimeFix, durationMinutes, notes: outcomeNotes };
    setBusy("resolve"); setError(null); setNotice(null);
    try {
      const data = await request<Snapshot>("/api/diagnostics/actions", { method: "POST", body: JSON.stringify({ action: "resolve", caseId: snapshot.case.id, expectedVersion: snapshot.case.recordVersion, ...values }) });
      setSnapshot(data); setNotice("Repair outcome recorded. The result is now available for first-time-fix evaluation.");
      return { caseId: data.case.id, status: data.case.status, firstTimeFix: values.firstTimeFix, durationMinutes: values.durationMinutes };
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Outcome recording failed"); throw cause; }
    finally { setBusy(null); }
  }, [durationMinutes, firstTimeFix, outcomeNotes, snapshot]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({ name: "run_diagnostic_analysis", title: "Run diagnostic analysis", description: "Create a versioned, evidence-grounded diagnostic analysis for the current vehicle repair order.", inputSchema: { type: "object", properties: { caseId: { type: "string" } }, required: ["caseId"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => analyze((input as { caseId: string }).caseId) }, { signal: lifecycle.signal })).catch(() => undefined);
    void Promise.resolve(context.registerTool({ name: "accept_diagnostic_recommendation", title: "Accept diagnostic recommendation", description: "Accept a current diagnostic recommendation after explicit safety acknowledgement.", inputSchema: { type: "object", properties: { recommendationId: { type: "string" }, safetyAcknowledged: { type: "boolean" } }, required: ["recommendationId", "safetyAcknowledged"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => { const value = input as { recommendationId: string; safetyAcknowledged: boolean }; return accept(value.recommendationId, value.safetyAcknowledged); } }, { signal: lifecycle.signal })).catch(() => undefined);
    void Promise.resolve(context.registerTool({ name: "record_diagnostic_outcome", title: "Record diagnostic outcome", description: "Close an accepted diagnostic path with repair duration, first-time-fix result, and technician notes.", inputSchema: { type: "object", properties: { firstTimeFix: { type: "boolean" }, durationMinutes: { type: "integer", minimum: 5, maximum: 480 }, notes: { type: "string", minLength: 8, maxLength: 500 } }, required: ["firstTimeFix", "durationMinutes", "notes"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => resolve(input as { firstTimeFix: boolean; durationMinutes: number; notes: string }) }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [accept, analyze, resolve]);

  if (!snapshot) return <div className="diagnostic-loading" role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"} aria-busy={!error}><RefreshCw aria-hidden="true"/><strong>{error ? "Diagnostic workflow unavailable" : "Loading technician diagnostic case"}</strong><span>{error ?? "Retrieving evidence, service history, inventory, and safety policy."}</span>{error && <button type="button" onClick={() => void load()}>Retry</button>}</div>;

  const caseClosed = snapshot.case.status === "RESOLVED";
  const canAccept = snapshot.case.status === "ANALYZED";
  const accepted = snapshot.case.status === "RECOMMENDATION_ACCEPTED";
  return <section className="diagnostic-copilot" aria-busy={Boolean(busy)}>
    <div className="diagnostic-intro"><div><span className="eyebrow"><Stethoscope/> Evidence-grounded shop support</span><h2>Technician diagnostic copilot</h2><p>Turn customer concerns, DTCs, and test results into traceable verification paths with explicit safety boundaries.</p></div><div className="diagnostic-context"><span>{snapshot.boundaries.scenario}</span><strong>{snapshot.case.workOrderId.replace(/^WO-/, "RO-")} · {snapshot.case.city}</strong><small>{snapshot.case.technicianName} · {snapshot.case.appointmentWindow}</small></div></div>
    {error && <div className="diagnostic-alert error" role="alert"><XCircle aria-hidden="true"/><span>{error}</span><button type="button" onClick={() => void load()}>Refresh case</button></div>}
    {notice && <div className="diagnostic-alert success" role="status" aria-live="polite" aria-atomic="true"><CheckCircle2 aria-hidden="true"/><span>{notice}</span></div>}
    <div className="diagnostic-metrics">
      <DiagnosticMetric icon={<Sparkles/>} label="Top hypothesis" value={`${snapshot.metrics.topConfidence}%`} detail={`${snapshot.metrics.unknownProbability}% remains unclassified`}/>
      <DiagnosticMetric icon={<BookOpenCheck/>} label="Evidence coverage" value={`${snapshot.run.groundingRate}%`} detail={`${snapshot.metrics.groundedRecommendations}/${snapshot.recommendations.length} paths grounded`}/>
      <DiagnosticMetric icon={<PackageCheck/>} label="Available inventory" value={String(snapshot.metrics.availableUnits)} detail="Units after reservations"/>
      <DiagnosticMetric icon={<ShieldAlert/>} label="Safety state" value={displayStatus(snapshot.case.safetyStatus)} detail="Human decision remains required" tone={snapshot.case.safetyStatus === "ACK_REQUIRED" ? "warning" : ""}/>
    </div>
    <div className="diagnostic-case-grid">
      <article className="diagnostic-card case-card"><div className="diagnostic-card-heading"><div><h3>Vehicle case</h3><p>{snapshot.case.vehicleMake} {snapshot.case.vehicleModel} · VIN ending {snapshot.case.vinTail}</p></div><span className={`case-status ${snapshot.case.status.toLowerCase()}`}>{displayStatus(snapshot.case.status)}</span></div><div className="complaint"><small>Customer concern</small><p>{snapshot.case.complaint}</p><code>{snapshot.case.symptomCode}</code></div><div className="case-meta"><div><span>Technician</span><strong>{snapshot.case.technicianName}</strong><small>{snapshot.case.technicianId}</small></div><div><span>Analysis</span><strong>{snapshot.run.modelVersion}</strong><small>{snapshot.run.id.slice(-12)}</small></div><div><span>Tool results</span><strong>{snapshot.run.toolCallCount} successful</strong><small>{snapshot.run.sourceCount} verified sources</small></div></div></article>
      <article className="diagnostic-card reasoning-card"><div className="diagnostic-card-heading"><div><h3>Ranked diagnostic paths</h3><p>Confidence is evidence-weighted, not a replacement for testing</p></div><Button variant="outline" onClick={() => void analyze()} disabled={Boolean(busy)}><RefreshCw className={busy === "analyze" ? "spinning" : ""} aria-hidden="true"/> {busy === "analyze" ? "Analyzing..." : "Run new analysis"}</Button></div><div className="recommendation-list" role="group" aria-label="Select a diagnostic path">{snapshot.recommendations.map(item => <button type="button" key={item.id} className={item.id === selected?.id ? "selected" : ""} onClick={() => { setSelectedId(item.id); setSafetyAcknowledged(false); }} aria-pressed={item.id === selected?.id} aria-controls="selected-diagnostic-path" aria-label={`Rank ${item.rank}: ${item.component}, ${item.confidence}% confidence, ${item.sourceIds.length} sources, ${displayStatus(item.safetyClass)}`}><span className="recommendation-rank" aria-hidden="true">{item.rank}</span><div><strong>{item.component}</strong><small>{item.sourceIds.length} sources · {displayStatus(item.safetyClass)}</small></div><span className="confidence-score">{item.confidence}%</span></button>)}</div></article>
    </div>
    {selected && <div className="diagnostic-detail-grid">
      <article id="selected-diagnostic-path" className="diagnostic-card hypothesis-detail" aria-live="polite" aria-atomic="true"><div className="diagnostic-card-heading"><div><h3>{selected.component}</h3><p>{selected.faultCode} · {selected.groundingScore}% grounded</p></div><span className={`recommendation-state ${selected.status.toLowerCase()}`}>{selected.status}</span></div><div className="hypothesis-copy"><section><small>Why this path</small><p>{selected.rationale}</p></section><section><small>Verification step</small><p>{selected.verificationStep}</p></section></div><div className={`safety-control ${selected.safetyClass.toLowerCase()}`}><ShieldAlert aria-hidden="true"/><div><strong>{selected.safetyClass === "STANDARD" ? "Standard service controls" : selected.safetyClass === "ESCALATE" ? "Specialist escalation required" : "Vehicle securement and isolation required"}</strong><p>{selected.safetyClass === "STANDARD" ? "Follow the referenced OEM service procedure." : selected.safetyClass === "ESCALATE" ? "Do not continue to high-current testing without qualified support and approved equipment." : "Secure the vehicle, follow the OEM isolation procedure, and verify the protected circuit state before testing."}</p></div>{selected.safetyClass !== "STANDARD" && <label><input type="checkbox" checked={safetyAcknowledged} onChange={event => setSafetyAcknowledged(event.target.checked)}/><span>I acknowledge the safety boundary</span></label>}</div><div className="diagnostic-actions"><Button onClick={() => void accept()} disabled={!canAccept || Boolean(busy) || (selected.safetyClass !== "STANDARD" && !safetyAcknowledged)}><ClipboardCheck aria-hidden="true"/> {busy === "accept" ? "Recording..." : selected.status === "ACCEPTED" ? "Path accepted" : "Accept verification path"}</Button><Button variant="outline" onClick={() => void escalate()} disabled={caseClosed || Boolean(busy) || escalationReason.trim().length < 8}><AlertTriangle aria-hidden="true"/> {busy === "escalate" ? "Escalating..." : "Escalate case"}</Button></div>{!caseClosed && <label className="escalation-input"><span>Escalation rationale</span><textarea value={escalationReason} onChange={event => setEscalationReason(event.target.value)} minLength={8} maxLength={300} required/></label>}</article>
      <article className="diagnostic-card evidence-card"><div className="diagnostic-card-heading"><div><h3>Supporting evidence</h3><p>{snapshot.boundaries.evidence}</p></div><span>{selectedSources.length} cited</span></div><div className="source-list">{selectedSources.map(source => <div key={source.id}><span><FileSearch/></span><div><strong>{source.title}</strong><p>{source.summary}</p><small>{source.reference_code} · rev {source.revision} · {displayStatus(source.source_type)}</small></div><Check/></div>)}</div></article>
      <article className="diagnostic-card parts-card"><div className="diagnostic-card-heading"><div><h3>Parts availability</h3><p>{selected.partCode ?? "No replacement part assigned"}</p></div><PackageCheck/></div>{selectedParts.length ? <div className="parts-list">{selectedParts.map(part => <div key={part.id}><div><strong>{part.location}</strong><small>{part.description}</small></div><span><strong>{Math.max(0, part.on_hand - part.reserved)}</strong> available</span></div>)}</div> : <div className="diagnostic-empty"><PackageCheck/><strong>No inventory action</strong><span>This path requires verification before parts selection.</span></div>}</article>
    </div>}
    <div className="diagnostic-lower-grid">
      <article className="diagnostic-card tools-card"><div className="diagnostic-card-heading"><div><h3>Tool execution</h3><p>Structured system calls from the current analysis</p></div><span>{snapshot.toolCalls.length} calls</span></div><div className="tool-list">{snapshot.toolCalls.map(tool => <div key={tool.id}><span>{tool.tool_name === "parts_lookup" ? <PackageCheck/> : tool.tool_name === "service_history" ? <History/> : <ClipboardCheck/>}</span><div><strong>{displayStatus(tool.tool_name)}</strong><small>{toolSummary(tool)}</small></div><span className="tool-success"><Check/> {tool.status}</span></div>)}</div></article>
      <article className="diagnostic-card outcome-card"><div className="diagnostic-card-heading"><div><h3>Technician outcome</h3><p>Close the feedback loop for quality evaluation</p></div>{snapshot.outcome && <span className="outcome-complete"><Check aria-hidden="true"/> recorded</span>}</div>{snapshot.outcome ? <div className="recorded-outcome"><CheckCircle2 aria-hidden="true"/><div><strong>{snapshot.outcome.first_time_fix ? "First-time fix confirmed" : "Return visit required"}</strong><p>{snapshot.outcome.notes}</p><small>{snapshot.outcome.duration_minutes} minutes · recorded {new Date(snapshot.outcome.created_at).toLocaleDateString()}</small></div></div> : accepted ? <div className="outcome-form"><div><label><span>Repair duration in minutes</span><input type="number" min={5} max={480} value={durationMinutes} onChange={event => setDurationMinutes(Number(event.target.value))}/></label><label className="first-fix"><input type="checkbox" checked={firstTimeFix} onChange={event => setFirstTimeFix(event.target.checked)}/><span>Fixed right the first time</span></label></div><label><span>Technician notes</span><textarea value={outcomeNotes} onChange={event => setOutcomeNotes(event.target.value)} minLength={8} maxLength={500} required/></label><Button onClick={() => void resolve()} disabled={Boolean(busy) || durationMinutes < 5 || durationMinutes > 480 || outcomeNotes.trim().length < 8}><Wrench aria-hidden="true"/> {busy === "resolve" ? "Recording..." : "Record repair outcome"}</Button></div> : <div className="diagnostic-empty"><Clock3 aria-hidden="true"/><strong>Awaiting technician decision</strong><span>Accept a verification path before recording the repair outcome.</span></div>}</article>
      <article className="diagnostic-card audit-card"><div className="diagnostic-card-heading"><div><h3>Decision history</h3><p>Append-only diagnostic audit</p></div><span>{snapshot.audit.length} events</span></div><div className="diagnostic-audit-list">{snapshot.audit.slice(0, 5).map(item => <div key={item.id}><span/><div><strong>{displayStatus(item.action)}</strong><small>{item.actor_role} · {new Date(item.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></div></div>)}</div></article>
    </div>
  </section>;
}

function DiagnosticMetric({ icon, label, value, detail, tone = "" }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: string }) {
  return <div className={`diagnostic-metric ${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></div>;
}
