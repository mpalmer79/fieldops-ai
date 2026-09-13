"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CarFront, Check, Clock3, Gauge, ShieldCheck, UserRound, Wrench } from "lucide-react";

type TechnicianStatus = "In bay" | "Road test" | "Available" | "Unavailable";

export type TechnicianCommand = {
  id: string;
  initials: string;
  name: string;
  specialty: string;
  stops: number;
  miles: number;
  utilization: number;
  status: TechnicianStatus;
  color: string;
};

type Filter = "All" | "Available" | "Load risk";

const certificationMap: Record<string, string[]> = {
  "T-147": ["GDS", "Engine", "Hybrid"],
  "T-208": ["GDS", "EV / HV", "ADAS", "Electrical"],
  "T-274": ["GDS", "Engine", "Drivability"],
  "T-319": ["GDS", "EV / HV", "ADAS", "Engine", "Master"],
};

const assignmentMap: Record<string, Array<{ order: string; vehicle: string; stage: string }>> = {
  "T-147": [{ order: "RO-48321", vehicle: "2023 GV70", stage: "Diagnosis" }, { order: "RO-48412", vehicle: "2022 G90", stage: "Repair" }],
  "T-208": [{ order: "RO-48401", vehicle: "2023 GV60", stage: "Calibration" }, { order: "RO-48389", vehicle: "2024 GV80", stage: "Quality" }],
  "T-274": [{ order: "RO-48372", vehicle: "2023 G70", stage: "Interrupted" }],
  "T-319": [{ order: "RO-48344", vehicle: "2022 G80", stage: "Quality" }, { order: "RO-48367", vehicle: "2021 GV80", stage: "Repair" }],
};

const matrixSkills = ["GDS", "EV / HV", "ADAS", "Engine", "Master"];

export function TechnicianCommandCenter({ technicians }: { technicians: TechnicianCommand[] }) {
  const [selectedId, setSelectedId] = useState(technicians[3]?.id ?? technicians[0]?.id ?? "");
  const [filter, setFilter] = useState<Filter>("All");
  const selected = useMemo(() => technicians.find(technician => technician.id === selectedId) ?? technicians[0], [selectedId, technicians]);
  const visible = useMemo(() => technicians.filter(technician => filter === "Available" ? technician.status === "Available" : filter === "Load risk" ? technician.utilization >= 90 || technician.status === "Unavailable" : true), [filter, technicians]);

  if (!selected) return <div className="technician-empty">Technician data is not available.</div>;

  const certifications = certificationMap[selected.id] ?? ["GDS"];
  const assignments = assignmentMap[selected.id] ?? [];

  return <div className="technician-command-view">
    <section className="technician-command-intro">
      <div><span className="eyebrow">TECHNICIAN CONTROL / LIVE ROSTER</span><h2>Put the right skill in the right bay</h2><p>Compare workload, certification coverage, and assignment risk before moving work.</p></div>
      <div className="coverage-visual" aria-label="Certification coverage 96 percent"><div><strong>96%</strong><small>Skill coverage</small></div><span>27 technicians on roster</span></div>
    </section>

    <section className="technician-command-metrics" aria-label="Technician staffing status">
      <div><UserRound/><span>On shift<strong>24</strong></span></div>
      <div><Wrench/><span>Available now<strong>3</strong></span></div>
      <div><Gauge/><span>Average load<strong>86%</strong></span></div>
      <div className="warning"><AlertTriangle/><span>Skill gaps<strong>2</strong></span></div>
    </section>

    <section className="technician-command-layout">
      <div className="technician-load-board">
        <header><div><span>TEAM LOAD / CURRENT SHIFT</span><strong>Qualified capacity</strong></div><div className="technician-filters" role="group" aria-label="Filter technicians">{(["All", "Available", "Load risk"] as Filter[]).map(option => <button type="button" key={option} aria-pressed={filter === option} className={filter === option ? "active" : ""} onClick={() => setFilter(option)}>{option}</button>)}</div></header>
        <div className="technician-load-list">
          {visible.map(technician => <button type="button" key={technician.id} className={`technician-load-row ${technician.status.replace(" ", "-").toLowerCase()} ${selected.id === technician.id ? "selected" : ""}`} onClick={() => setSelectedId(technician.id)} aria-pressed={selected.id === technician.id} aria-controls="selected-technician-inspector" aria-label={`${technician.name}, ${technician.id}, ${technician.specialty}, ${technician.utilization}% load, ${technician.status}, ${technician.stops} active repair orders`}>
            <span className="technician-avatar" style={{ borderColor: technician.color, color: technician.color }}>{technician.initials}</span>
            <span className="technician-identity"><strong>{technician.name}</strong><small>{technician.id} / {technician.specialty}</small></span>
            <span className="technician-load"><span><i style={{ width: `${technician.utilization}%`, background: technician.color }}/></span><small>{technician.utilization}% load</small></span>
            <span className={`technician-live-status ${technician.status.replace(" ", "-").toLowerCase()}`}><i/>{technician.status}</span>
            <span className="technician-ro-count"><strong>{technician.stops}</strong><small>active ROs</small></span>
          </button>)}
          {visible.length === 0 && <div className="technician-filter-empty"><ShieldCheck/><strong>No technicians match this view</strong><span>Choose another staffing filter.</span></div>}
        </div>
      </div>

      <aside id="selected-technician-inspector" className={`technician-inspector ${selected.status === "Unavailable" ? "risk" : ""}`} aria-live="polite" aria-atomic="true">
        <header><span>SELECTED TECHNICIAN</span><strong>{selected.status}</strong></header>
        <div className="technician-profile"><span style={{ borderColor: selected.color, color: selected.color }}>{selected.initials}</span><div><small>{selected.id}</small><h3>{selected.name}</h3><p>{selected.specialty}</p></div></div>
        <div className="technician-capacity"><div className="capacity-dial" style={{ background: `conic-gradient(${selected.color} ${selected.utilization * 3.6}deg, #263239 0deg)` }}><span><strong>{selected.utilization}%</strong><small>Utilized</small></span></div><div><small>Flagged work</small><strong>{selected.miles} hr</strong><small>Active repair orders</small><strong>{selected.stops}</strong></div></div>
        <div className="technician-certifications"><span>CERTIFICATION COVERAGE</span><div>{certifications.map(certification => <small key={certification}><Check/>{certification}</small>)}</div></div>
        <div className="technician-assignments"><span>CURRENT ASSIGNMENTS</span>{assignments.map(assignment => <div key={assignment.order}><CarFront/><span><strong>{assignment.order}</strong><small>{assignment.vehicle}</small></span><b>{assignment.stage}</b></div>)}</div>
        <div className={`technician-readiness ${selected.utilization >= 90 || selected.status === "Unavailable" ? "warning" : ""}`}><Clock3/><span><strong>{selected.status === "Unavailable" ? "Recovery assignment required" : selected.utilization >= 90 ? "Near load threshold" : "Capacity inside policy"}</strong><small>{selected.status === "Unavailable" ? "Active work should be reassigned before promises change." : selected.utilization >= 90 ? "Review before adding another repair order." : "Technician can continue the current plan."}</small></span></div>
      </aside>
    </section>

    <section className="certification-matrix">
      <header><div><span>SHOP SKILL MAP</span><strong>Certification coverage by technician</strong></div><small>Qualified for assignment</small></header>
      <div className="certification-table" role="table" aria-label="Technician certification coverage" aria-rowcount={technicians.length + 1} aria-colcount={matrixSkills.length + 1}>
        <div className="certification-row certification-head" role="row"><span role="columnheader">Technician</span>{matrixSkills.map(skill => <span role="columnheader" key={skill}>{skill}</span>)}</div>
        {technicians.map(technician => <div className={`certification-row ${selected.id === technician.id ? "selected" : ""}`} key={technician.id} role="row"><span role="rowheader"><button type="button" className="certification-technician-select" onClick={() => setSelectedId(technician.id)} aria-pressed={selected.id === technician.id} aria-controls="selected-technician-inspector" aria-label={`Inspect ${technician.name}, ${technician.id}`}><i aria-hidden="true" style={{ background: technician.color }}/>{technician.initials} / {technician.id}</button></span>{matrixSkills.map(skill => { const certified = (certificationMap[technician.id] ?? []).includes(skill); return <span role="cell" key={skill} aria-label={`${skill}: ${certified ? "certified" : "not certified"}`}>{certified ? <Check aria-hidden="true"/> : <i aria-hidden="true"/>}</span>; })}</div>)}
      </div>
    </section>
  </div>;
}
