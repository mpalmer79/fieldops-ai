"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, RefreshCw, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { defaultPolicyWeights, optimizeRecovery } from "@/lib/dispatch-optimizer";
import styles from "@/app/landing.module.css";

type DemoState = "idle" | "ingest" | "constraints" | "optimizing" | "resolved";

const repairOrders = ["RO-48321", "RO-48344", "RO-48372", "RO-48401", "RO-48367", "RO-48412", "RO-48389"];
const plan = optimizeRecovery(defaultPolicyWeights);
const stageOrder: DemoState[] = ["ingest", "constraints", "optimizing", "resolved"];

function stageRank(state: DemoState) {
  return state === "idle" ? -1 : stageOrder.indexOf(state);
}

function stageMessage(state: DemoState) {
  if (state === "ingest") return "Persisting callout and loading 7 affected repair orders";
  if (state === "constraints") return "Removing assignments that fail skill, bay, parts, or capacity rules";
  if (state === "optimizing") return `Ranking ${plan.feasibleScenarios.toLocaleString()} feasible recovery plans`;
  if (state === "resolved") return "Manager-ready plan created with no automatic execution";
  return "Ready to evaluate today’s shop state";
}

export function LandingDisruptionDemo() {
  const [state, setState] = useState<DemoState>("idle");
  const timers = useRef<number[]>([]);
  const rank = stageRank(state);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  function runDemo() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reducedMotion) {
      setState("resolved");
      return;
    }
    setState("ingest");
    timers.current.push(window.setTimeout(() => setState("constraints"), 650));
    timers.current.push(window.setTimeout(() => setState("optimizing"), 1650));
    timers.current.push(window.setTimeout(() => setState("resolved"), 3100));
  }

  function resetDemo() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setState("idle");
  }

  return <div className={`${styles.demo} ${styles[state]}`}>
    <header className={styles.demoHeader}>
      <div><span>LIVE RECOVERY SCENARIO</span><strong><TriangleAlert/> Technician T-274 unavailable</strong><small>7 repair orders · 16.2 flagged hours · 3 qualified receiving technicians</small></div>
      {state === "resolved" ? <button type="button" onClick={resetDemo}><RefreshCw/> Reset scenario</button> : <button type="button" onClick={runDemo} disabled={state !== "idle"}><Sparkles/> {state === "idle" ? "Run disruption" : "Recovery running"}</button>}
    </header>

    <div className={styles.demoActivity} role="status" aria-live="polite" aria-atomic="true">
      <Sparkles/><span><small>CURRENT ACTIVITY</small><strong>{stageMessage(state)}</strong></span>
      <b>{state === "idle" ? "STANDBY" : state === "resolved" ? "PLAN READY" : `STEP ${rank + 1} OF 4`}</b>
    </div>

    <div className={styles.demoCanvas}>
      <section className={styles.promisePanel}>
        <span className={styles.demoLabel}>DISRUPTION INPUT</span>
        <strong>7 promises at risk</strong>
        <div className={styles.orderStack}>{repairOrders.map((order, index) => <span key={order} style={{ "--order-index": index } as CSSProperties}><small>{order}</small><b>{state === "idle" ? "SCHEDULED" : "AT RISK"}</b></span>)}</div>
      </section>

      <div className={styles.enginePath} aria-label="Recovery decision pipeline">
        {["CAPTURE", "QUALIFY", "OPTIMIZE", "AUTHORIZE"].map((label, index) => <div className={`${styles.engineStage} ${rank > index ? styles.stageComplete : rank === index ? styles.stageActive : ""}`} key={label}>
          <span>{rank > index || state === "resolved" ? <Check/> : String(index + 1).padStart(2, "0")}</span>
          <small>{label}</small>
          {index < 3 ? <ArrowRight/> : null}
        </div>)}
        <div className={styles.enginePulse}><Sparkles/><strong>{state === "idle" ? "READY" : state === "ingest" ? "EVENT SAVED" : state === "constraints" ? `${plan.rejectedCandidates} REMOVED` : state === "optimizing" ? `${plan.scenariosEvaluated.toLocaleString()} TESTED` : "EVIDENCE READY"}</strong></div>
      </div>

      <section className={styles.recoveryPanel}>
        <span className={styles.demoLabel}>{state === "resolved" ? "RECOMMENDED RECOVERY" : "PLAN OUTPUT"}</span>
        <strong>{state === "resolved" ? `${plan.assignments.length} promises protected` : "Awaiting verified plan"}</strong>
        <div className={styles.resultBars}>{repairOrders.map((order) => {
          const assignment = plan.assignments.find(item => item.jobId.replace(/^WO-/, "RO-") === order);
          const protectedOrder = Boolean(assignment);
          return <span key={order} className={state === "resolved" ? protectedOrder ? styles.protected : styles.callback : ""}>
            <small>{state === "resolved" ? order : "PENDING"}</small>
            <b>{state === "resolved" ? protectedOrder ? assignment?.to : "ADVISOR CALLBACK" : ""}</b>
          </span>;
        })}</div>
        {state === "resolved" ? <Link href="/control-room/service-command" className={styles.demoDeepLink}>Open the full recovery workspace <ArrowRight/></Link> : null}
      </section>
    </div>

    <footer className={styles.demoFooter}>
      <span><Check/> {plan.rejectedCandidates} unsafe candidates excluded</span>
      <span><ShieldCheck/> Manager approval required</span>
      <strong>{state === "resolved" ? `${plan.projectedSla}% projected on time` : "No assignments execute automatically"}</strong>
    </footer>
  </div>;
}
