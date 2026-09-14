"use client";

import type { KeyboardEvent } from "react";
import { useMemo, useState } from "react";
import { Activity, ArrowRight, Check, Clock3, Gauge, ShieldCheck, TrendingUp, Wrench } from "lucide-react";

type MetricKey = "Promise time" | "Efficiency" | "Cycle time";

const performanceSeries: Record<MetricKey, { values: number[]; heights: number[]; unit: string; latest: string; target: string; direction: string }> = {
  "Promise time": { values: [88.4, 90.1, 91.5, 93.2, 92.7, 95.3, 94.1], heights: [48, 58, 66, 77, 73, 91, 84], unit: "%", latest: "94.1%", target: "92.0%", direction: "+1.8%" },
  "Efficiency": { values: [101, 104, 106, 109, 108, 113, 112], heights: [42, 54, 63, 76, 71, 92, 87], unit: "%", latest: "112%", target: "105%", direction: "+7 pts" },
  "Cycle time": { values: [4.7, 4.5, 4.4, 4.2, 4.1, 3.9, 3.8], heights: [90, 80, 74, 62, 55, 44, 38], unit: " hr", latest: "3.8 hr", target: "4.2 hr", direction: "-0.4 hr" },
};

const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "TODAY"];
const drivers = [
  { label: "Technician coverage", value: 96, note: "Skills matched" },
  { label: "Parts readiness", value: 91, note: "Before dispatch" },
  { label: "Bay utilization", value: 83, note: "Inside threshold" },
  { label: "Advisor response", value: 78, note: "2 callbacks open" },
];

export function PerformanceCommandCenter({ projectedSla, incident }: { projectedSla: number; incident: boolean }) {
  const [metric, setMetric] = useState<MetricKey>("Promise time");
  const series = performanceSeries[metric];
  const statusCopy = useMemo(() => incident ? "Recovery plan active" : "Shop operating inside policy", [incident]);

  function handleMetricKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: MetricKey) {
    const metrics = Object.keys(performanceSeries) as MetricKey[];
    const currentIndex = metrics.indexOf(current);
    const nextIndex = event.key === "ArrowRight" ? (currentIndex + 1) % metrics.length : event.key === "ArrowLeft" ? (currentIndex - 1 + metrics.length) % metrics.length : event.key === "Home" ? 0 : event.key === "End" ? metrics.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    setMetric(metrics[nextIndex]);
    document.getElementById(`performance-tab-${nextIndex}`)?.focus();
  }

  return <div className="performance-command-view">
    <section className="performance-command-intro">
      <div><span className="eyebrow">OPERATING OUTCOMES / CURRENT SHIFT</span><h2>Prove whether the shop is getting better</h2><p>Track customer promises, technician output, and recovery impact from one operating view.</p></div>
      <div className="performance-score"><div><strong>{projectedSla}%</strong><small>Projected on time</small></div><span><i/> {statusCopy}</span></div>
    </section>

    <section className="performance-command-metrics" aria-label="Current service performance">
      <div><ShieldCheck/><span>Promise time<strong>{incident ? "91.6%" : "94.1%"}</strong><small>{incident ? "-2.5%" : "+1.8%"}</small></span></div>
      <div><Wrench/><span>Shop efficiency<strong>{incident ? "106%" : "112%"}</strong><small>{incident ? "+1 pt" : "+7 pts"}</small></span></div>
      <div><Clock3/><span>Average cycle<strong>3.8 hr</strong><small>-0.4 hr</small></span></div>
      <div><Gauge/><span>Comeback rate<strong>1.2%</strong><small>-0.3%</small></span></div>
    </section>

    <section className="performance-command-layout">
      <div className="performance-trend-card">
        <header><div><span>7-DAY OPERATING TREND</span><strong>{metric}</strong></div><div className="performance-tabs" role="tablist" aria-label="Choose performance metric">{(Object.keys(performanceSeries) as MetricKey[]).map((option, index) => <button key={option} id={`performance-tab-${index}`} type="button" role="tab" aria-selected={metric === option} aria-controls="performance-trend-panel" tabIndex={metric === option ? 0 : -1} className={metric === option ? "active" : ""} onClick={() => setMetric(option)} onKeyDown={event => handleMetricKeyDown(event, option)}>{option}</button>)}</div></header>
        <div className="trend-summary"><div><small>Latest</small><strong>{series.latest}</strong><span>{series.direction}</span></div><div><small>Operating target</small><strong>{series.target}</strong></div></div>
        <div id="performance-trend-panel" className="performance-chart" role="tabpanel" aria-labelledby={`performance-tab-${(Object.keys(performanceSeries) as MetricKey[]).indexOf(metric)}`}>
          <span className="sr-only">{`${metric} trend for the last seven days. ${days.map((day, index) => `${day}: ${series.values[index]}${series.unit}`).join(", ")}`}</span>
          <div className="performance-target"><span>Target {series.target}</span></div>
          {series.values.map((value, index) => <div className="performance-column" key={days[index]}><div><i style={{ height: `${series.heights[index]}%` }}/><b>{value}{series.unit}</b></div><span>{days[index]}</span></div>)}
        </div>
      </div>

      <aside className="recovery-outcome-card">
        <header><span>DISRUPTION OUTCOME / ACTIVE SCENARIO</span><strong><i/> Controlled</strong></header>
        <div className="outcome-event"><Activity/><div><small>Capacity loss</small><strong>7 promises exposed</strong></div></div>
        <div className="outcome-flow" aria-label="Recovery impact"><div className="exposed"><span>EXPOSED</span><strong>7</strong></div><ArrowRight/><div className="protected"><span>PROTECTED</span><strong>5</strong></div><ArrowRight/><div className="callbacks"><span>CALLBACKS</span><strong>2</strong></div></div>
        <div className="outcome-bars"><div><span>Before recovery</span><b><i style={{ width: "100%" }}/></b><strong>7 at risk</strong></div><div><span>After recovery</span><b><i style={{ width: "29%" }}/></b><strong>2 at risk</strong></div></div>
        <div className="outcome-proof"><Check/><div><strong>5 customer promises preserved</strong><span>Qualified assignments keep work inside the current delivery window.</span></div></div>
      </aside>
    </section>

    <section className="performance-drivers">
      <header><div><span>OUTCOME DRIVERS</span><strong>What is shaping today&apos;s result</strong></div><small>Illustrative trend inputs</small></header>
      <div>{drivers.map(driver => <article key={driver.label}><div><span>{driver.label}</span><strong>{driver.value}%</strong></div><b><i style={{ width: `${driver.value}%` }}/></b><small>{driver.note}</small></article>)}</div>
      <footer><TrendingUp/><span><strong>Recovery effectiveness is holding above target</strong><small>Promise protection remains the strongest contributor to today&apos;s operating score.</small></span></footer>
    </section>
  </div>;
}
