import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Database, GitBranch, Route, ShieldCheck, Sparkles } from "lucide-react";
import { LandingDisruptionDemo } from "@/components/landing-disruption-demo";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "FieldOps AI | Protect Every Service Promise",
  description: "An AI-orchestrated dealership service operations system that recovers repair orders from capacity disruptions with human approval and auditable execution.",
};

export default function LandingPage() {
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="FieldOps AI home"><span><Route/></span><strong>FIELD<span>/OPS</span><small>Service operations intelligence</small></strong></Link>
      <nav aria-label="Landing navigation"><a href="#recovery">Recovery</a><a href="#system">System</a><Link href="/control-room" className={styles.headerCta}>Launch workspace <ArrowUpRight/></Link></nav>
    </header>

    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.kicker}><i/> AI-ORCHESTRATED SERVICE OPERATIONS</span>
        <h1>Protect every customer promise when the shop plan breaks.</h1>
        <p>FieldOps AI converts technician callouts and capacity gaps into feasible repair-order recovery plans that managers can inspect, approve, and audit.</p>
        <div className={styles.heroActions}><Link href="#recovery" className={styles.primaryAction}><Sparkles/> See the recovery</Link><Link href="/control-room" className={styles.secondaryAction}>Open live system <ArrowRight/></Link></div>
        <div className={styles.proofRail}><span><Check/> Constraint checked</span><span><Check/> Manager controlled</span><span><Check/> Fully auditable</span></div>
      </div>

      <figure className={styles.heroVisual}>
        <Image src="/images/service-department-operations.webp" alt="A service advisor and service manager reviewing repair-order recovery inside an active dealership service department" fill priority sizes="(max-width: 900px) 100vw, 52vw"/>
        <div className={styles.mediaLabel}><i/> LIVE SERVICE DEPARTMENT</div>
        <div className={styles.incidentCard}><span><i/> CAPACITY FAILURE</span><strong>Technician T-274 unavailable</strong><small>7 customer promises exposed</small></div>
        <figcaption><span>01<br/><b>Detect</b></span><ArrowRight/><span>02<br/><b>Recover</b></span><ArrowRight/><span>03<br/><b>Approve</b></span></figcaption>
      </figure>

      <a href="#recovery" className={styles.scrollCue} aria-label="Continue to recovery demonstration"><ArrowDown/></a>
    </section>

    <section className={styles.recovery} id="recovery">
      <div className={styles.sectionHeading}><div><span>THE OPERATING MOMENT</span><h2>One callout changes the entire day.</h2></div><p>Watch the system move from exposed promises to a manager-ready plan.</p></div>
      <LandingDisruptionDemo/>
    </section>

    <section className={styles.outcomes} aria-label="Recovery outcomes">
      <article><span>Promises protected</span><strong>5 / 7</strong><small>Customer commitments preserved</small></article>
      <article><span>Projected on time</span><strong>93.6%</strong><small>After feasible reassignment</small></article>
      <article><span>Invalid moves removed</span><strong>100%</strong><small>Skill, bay, parts, and load checked</small></article>
    </section>

    <section className={styles.system} id="system">
      <div className={styles.sectionHeading}><div><span>BUILT FOR CONSEQUENCE</span><h2>AI proposes. Service leadership decides.</h2></div><p>Operational intelligence with explicit control boundaries.</p></div>
      <div className={styles.systemGrid}>
        <article className={styles.constraintCard}><div className={styles.cardIcon}><GitBranch/></div><span>CONSTRAINT ENGINE</span><strong>Only feasible assignments survive.</strong><div className={styles.nodeMap}><i/><b/><i/><b/><i/><b/><i/></div><small>Skill · Bay · Parts · Workload</small></article>
        <article className={styles.approvalCard}><div className={styles.cardIcon}><ShieldCheck/></div><span>HUMAN CONTROL</span><strong>Nothing consequential executes silently.</strong><div className={styles.approvalVisual}><i><Check/></i><b>MANAGER APPROVAL</b></div><small>Review · Approve · Reverse</small></article>
        <article className={styles.auditCard}><div className={styles.cardIcon}><Database/></div><span>AUDIT TRAIL</span><strong>Every decision leaves evidence.</strong><div className={styles.auditVisual}><i/><p><b>14:05</b> Plan created</p><i/><p><b>14:15</b> Manager approved</p><i/><p><b>14:15</b> Assignments executed</p></div></article>
      </div>
    </section>

    <section className={styles.finalCta}>
      <span>PRODUCTION-GRADE PORTFOLIO SYSTEM</span>
      <h2>Enter the live service command center.</h2>
      <Link href="/control-room">Launch workspace <ArrowUpRight/></Link>
    </section>

    <footer className={styles.footer}><span>FIELD/OPS AI</span><p>Dealership service operations intelligence</p><Link href="/control-room">Live system</Link></footer>
  </main>;
}
