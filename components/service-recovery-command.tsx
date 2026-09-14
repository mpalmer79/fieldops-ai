"use client";

import { AlertTriangle, ArrowRight, BrainCircuit, Check, Clock3, Database, Filter, Settings2, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecoveryPlan } from "@/lib/dispatch-optimizer";

export type RecoveryRunPhase = "ready" | "incident" | "constraints" | "optimizing" | "review" | "executing" | "executed" | "rejected" | "rolled-back";

type ServiceRecoveryCommandProps = {
  plan: RecoveryPlan;
  phase: RecoveryRunPhase;
  busy: boolean;
  backendOnline: boolean;
  onRun: () => void;
  onReview: () => void;
  onPolicy: () => void;
};

const phases: Array<{ id: RecoveryRunPhase; label: string; detail: string }> = [
  { id: "incident", label: "Capture", detail: "Persist technician callout" },
  { id: "constraints", label: "Qualify", detail: "Remove unsafe moves" },
  { id: "optimizing", label: "Optimize", detail: "Rank feasible plans" },
  { id: "review", label: "Authorize", detail: "Manager reviews evidence" },
];

const phaseRank: Record<RecoveryRunPhase, number> = {
  ready: -1,
  incident: 0,
  constraints: 1,
  optimizing: 2,
  review: 3,
  executing: 4,
  executed: 4,
  rejected: 3,
  "rolled-back": -1,
};

function repairOrderId(value: string) {
  return value.replace(/^WO-/, "RO-");
}

function phaseCopy(phase: RecoveryRunPhase) {
  if (phase === "incident") return "Recording the capacity loss and affected repair orders";
  if (phase === "constraints") return "Checking certification, bay, parts, shift, and workload rules";
  if (phase === "optimizing") return "Comparing feasible recovery plans against the active policy";
  if (phase === "review") return "Recovery plan ready for service-manager authorization";
  if (phase === "executing") return "Applying approved assignments and writing the audit record";
  if (phase === "executed") return "Recovery executed and recorded in the decision ledger";
  if (phase === "rejected") return "Plan rejected with no repair-order assignments changed";
  if (phase === "rolled-back") return "Execution reversed and original assignments restored";
  return "Ready to model a technician callout against today’s live shop state";
}

export function ServiceRecoveryCommand({ plan, phase, busy, backendOnline, onRun, onReview, onPolicy }: ServiceRecoveryCommandProps) {
  const rank = phaseRank[phase];
  const planAvailable = ["review", "executing", "executed"].includes(phase);
  const assignments = plan.assignments.slice(0, 5);
  const actionLabel = phase === "review" ? "Review recovery plan" : phase === "executed" ? "Run another disruption" : "Run disruption";

  return <section className={`recovery-command phase-${phase}`} aria-labelledby="recovery-command-title">
    <header className="recovery-command-header">
      <div>
        <span className="command-eyebrow"><i/> SERVICE RECOVERY CONTROL</span>
        <h2 id="recovery-command-title">Protect today’s repair-order promises.</h2>
        <p>Model a technician callout, validate every reassignment, and hold execution for service-manager approval.</p>
      </div>
      <div className="command-actions">
        <Button variant="outline" onClick={onPolicy} disabled={busy || !backendOnline}><Settings2/> Decision policy</Button>
        <Button onClick={phase === "review" ? onReview : onRun} disabled={busy || !backendOnline}><Sparkles/> {busy ? "Recovery running" : actionLabel}</Button>
      </div>
    </header>

    <div className="recovery-command-grid">
      <article className="incident-brief">
        <div className="command-card-heading"><span>DISRUPTION INPUT</span><strong className={phase === "ready" ? "standby" : "active"}>{phase === "ready" ? "STANDBY" : "ACTIVE"}</strong></div>
        <div className="incident-person"><span><AlertTriangle/></span><div><small>TECHNICIAN T-274</small><strong>Jonah Reed unavailable</strong><p>Drivability · 5 active ROs · 16.2 flagged hours</p></div></div>
        <dl className="incident-facts">
          <div><dt><Clock3/> Shift impact</dt><dd>Remainder of today</dd></div>
          <div><dt><Users/> Customer exposure</dt><dd>7 promised completions</dd></div>
          <div><dt><ShieldCheck/> Eligible capacity</dt><dd>3 qualified technicians</dd></div>
        </dl>
      </article>

      <article className="recovery-engine" aria-live="polite" aria-atomic="true">
        <div className="command-card-heading"><span>DECISION PIPELINE</span><strong>{phase === "ready" ? "READY" : phase === "executed" ? "COMPLETE" : "IN PROGRESS"}</strong></div>
        <div className="pipeline-status"><BrainCircuit/><div><small>CURRENT SYSTEM ACTIVITY</small><strong>{phaseCopy(phase)}</strong></div></div>
        <ol className="recovery-pipeline">
          {phases.map((item, index) => {
            const complete = rank > index || (phase === "executed" && index === phases.length - 1);
            const active = rank === index;
            return <li key={item.id} className={complete ? "complete" : active ? "active" : "pending"}>
              <span>{complete ? <Check/> : String(index + 1).padStart(2, "0")}</span>
              <div><strong>{item.label}</strong><small>{item.detail}</small></div>
              {index < phases.length - 1 ? <ArrowRight aria-hidden="true"/> : null}
            </li>;
          })}
        </ol>
        <div className="pipeline-progress" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, ((rank + 1) / phases.length) * 100))}%` }}/></div>
      </article>

      <aside className="solver-evidence">
        <div className="command-card-heading"><span>LIVE EVIDENCE</span><strong>{planAvailable ? "VERIFIED" : "WAITING"}</strong></div>
        <div className="evidence-stat"><Database/><div><small>Scenarios evaluated</small><strong>{rank >= 2 ? plan.scenariosEvaluated.toLocaleString() : "Pending"}</strong></div></div>
        <div className="evidence-stat"><Filter/><div><small>Feasible plans</small><strong>{rank >= 2 ? plan.feasibleScenarios.toLocaleString() : "Pending"}</strong></div></div>
        <div className="evidence-stat"><ShieldCheck/><div><small>Invalid candidates removed</small><strong>{rank >= 1 ? plan.rejectedCandidates : "Pending"}</strong></div></div>
        <div className="human-boundary"><Check/><span><strong>No silent execution</strong><small>Manager authorization is required.</small></span></div>
      </aside>
    </div>

    <div className={`recovery-plan-preview ${planAvailable ? "visible" : "waiting"}`}>
      <header>
        <div><span>RECOMMENDED RECOVERY</span><h3>{planAvailable ? `${plan.assignments.length} promises preserved, ${plan.rescheduled.length} advisor callbacks` : "Plan output will appear here"}</h3></div>
        {planAvailable ? <div className="plan-score"><small>PROJECTED ON TIME</small><strong>{plan.projectedSla}%</strong></div> : null}
      </header>
      {planAvailable ? <div className="plan-output-grid">
        <div className="assignment-preview">
          {assignments.map((move) => <div className="assignment-row" key={move.jobId}>
            <span><small>REPAIR ORDER</small><strong>{repairOrderId(move.jobId)}</strong></span>
            <span className="assignment-job"><small>{move.window} PROMISE</small><strong>{move.job}</strong></span>
            <span className="assignment-route"><small>T-274</small><ArrowRight/><strong>{move.to}</strong></span>
            <span className="assignment-impact">+{move.impactMinutes} min</span>
          </div>)}
        </div>
        <aside className="callback-preview"><span>CAPACITY LIMIT</span><strong>{plan.rescheduled.length} promises need outreach</strong><p>{plan.rescheduled.map(item => repairOrderId(item.id)).join(" and ")} cannot move safely within today’s qualified capacity.</p><Button onClick={onReview}>Inspect evidence and authorize <ArrowRight/></Button></aside>
      </div> : <div className="plan-waiting-state"><BrainCircuit/><div><strong>Awaiting a disruption</strong><p>The system will expose the evaluated scenarios, recommended technician moves, customer callbacks, and approval boundary.</p></div></div>}
    </div>
  </section>;
}
