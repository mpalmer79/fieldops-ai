"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, RefreshCw, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import styles from "@/app/landing.module.css";

type DemoState = "idle" | "evaluating" | "resolved";

const repairOrders = ["RO-48321", "RO-48344", "RO-48372", "RO-48401", "RO-48367", "RO-48412", "RO-48389"];

export function LandingDisruptionDemo() {
  const [state, setState] = useState<DemoState>("idle");
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  function runDemo() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setState("evaluating");
    timers.current.push(window.setTimeout(() => setState("resolved"), 1700));
  }

  function resetDemo() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setState("idle");
  }

  return <div className={`${styles.demo} ${styles[state]}`}>
    <header className={styles.demoHeader}>
      <div><span>LIVE RECOVERY SCENARIO</span><strong><TriangleAlert/> Technician T-274 unavailable</strong></div>
      {state === "resolved" ? <button type="button" onClick={resetDemo}><RefreshCw/> Reset</button> : <button type="button" onClick={runDemo} disabled={state === "evaluating"}><Sparkles/> {state === "evaluating" ? "Evaluating..." : "Run disruption"}</button>}
    </header>

    <div className={styles.demoCanvas} aria-live="polite">
      <section className={styles.promisePanel}>
        <span className={styles.demoLabel}>CAPACITY FAILURE</span>
        <strong>7 promises at risk</strong>
        <div className={styles.orderStack}>{repairOrders.map((order, index) => <span key={order} style={{ "--order-index": index } as CSSProperties}><small>{order}</small><b>AT RISK</b></span>)}</div>
      </section>

      <div className={styles.enginePath}>
        <span><i/><small>INGEST</small></span>
        <ArrowRight/>
        <span><i/><small>CONSTRAIN</small></span>
        <ArrowRight/>
        <span><i/><small>PLAN</small></span>
        <ArrowRight/>
        <span><i/><small>APPROVE</small></span>
        <div className={styles.enginePulse}><Sparkles/><strong>{state === "idle" ? "READY" : state === "evaluating" ? "896 PLANS" : "VERIFIED"}</strong></div>
      </div>

      <section className={styles.recoveryPanel}>
        <span className={styles.demoLabel}>{state === "resolved" ? "MANAGER-READY PLAN" : "RECOVERY OUTPUT"}</span>
        <strong>{state === "resolved" ? "5 promises protected" : state === "evaluating" ? "Testing feasible moves" : "Awaiting disruption"}</strong>
        <div className={styles.resultBars}>{repairOrders.map((order, index) => <span key={order} className={state === "resolved" ? index < 5 ? styles.protected : styles.callback : ""}><small>{state === "resolved" ? index < 5 ? "PROTECTED" : "CALLBACK" : "PENDING"}</small></span>)}</div>
      </section>
    </div>

    <footer className={styles.demoFooter}>
      <span><Check/> Skill and bay constraints checked</span>
      <span><ShieldCheck/> Manager approval required</span>
      <strong>{state === "resolved" ? "93.6% projected on time" : "No assignments execute automatically"}</strong>
    </footer>
  </div>;
}
