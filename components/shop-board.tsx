"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CarFront, Check, Clock3, Route, ShieldCheck, UserRound, Wrench } from "lucide-react";
import { serviceBays } from "@/lib/service-operations-data";

const phaseLabels = ["Check-in", "Diagnose", "Repair", "Quality", "Delivery"];

export function ShopBoard() {
  const [selectedBayId, setSelectedBayId] = useState("04");
  const selectedBay = useMemo(() => serviceBays.find(bay => bay.id === selectedBayId) ?? serviceBays[3], [selectedBayId]);
  const occupiedBays = serviceBays.filter(bay => bay.status !== "available").length;

  return <div className="shop-board-view">
    <section className="shop-board-intro">
      <div><span className="eyebrow">REFERENCE SHOP FLOOR / 12-BAY CONTROL</span><h2>Every bay, repair order, and customer promise in one view</h2><p>Select a bay to inspect the reference work state and promised-time risk.</p></div>
      <div className="shop-board-pulse"><i/><span>Illustrative layout</span><strong>Reference state</strong></div>
    </section>

    <section className="shop-board-metrics" aria-label="Shop board status">
      <div><CarFront/><span>Occupied bays<strong>{occupiedBays} / 12</strong></span></div>
      <div><Wrench/><span>Open repair orders<strong>25</strong></span></div>
      <div className="warning"><AlertTriangle/><span>At-risk promises<strong>2</strong></span></div>
      <div><Clock3/><span>Next load evaluation<strong>4:32</strong></span></div>
    </section>

    <section className="shop-board-layout">
      <div className="floor-plan" role="group" aria-label="Interactive service bay floor plan">
        <div className="floor-plan-heading"><div><span>SHOP FLOOR / NORTH WALL</span><strong>Bay occupancy and flow</strong></div><div className="floor-legend"><span><i className="active"/> Active</span><span><i className="risk"/> At risk</span><span><i className="open"/> Open</span></div></div>
        <div className="bay-plan-grid">
          {serviceBays.map(bay => <button type="button" key={bay.id} className={`floor-bay ro-form-card ${bay.status} ${selectedBay.id === bay.id ? "selected" : ""}`} onClick={() => setSelectedBayId(bay.id)} aria-label={`Bay ${bay.id}, ${bay.repairOrder}, ${bay.vehicle}, ${bay.statusLabel}`} aria-pressed={selectedBay.id === bay.id} aria-controls="selected-bay-inspector">
            <span className="floor-bay-head"><small>BAY {bay.id}</small><b>{bay.initials}</b></span>
            <CarFront aria-hidden="true"/>
            <span className="floor-bay-state">{bay.statusLabel}</span>
            <strong>{bay.repairOrder}</strong>
            <small>{bay.vehicle}</small>
          </button>)}
        </div>
        <div className="service-drive"><Route/><span>Service drive</span><i/><i/><i/></div>
      </div>

      <aside id="selected-bay-inspector" className={`bay-inspector ${selectedBay.status === "at-risk" ? "risk" : ""}`} aria-live="polite" aria-atomic="true">
        <header><span>SELECTED BAY / {selectedBay.id}</span><strong>{selectedBay.statusLabel}</strong></header>
        <div className="inspector-vehicle"><CarFront/><div><small>{selectedBay.repairOrder}</small><h3>{selectedBay.vehicle}</h3><p>{selectedBay.operation}</p></div></div>
        <dl className="inspector-facts"><div><dt><UserRound/> Technician</dt><dd>{selectedBay.technician}</dd></div><div><dt><Clock3/> Customer promise</dt><dd>{selectedBay.promised}</dd></div></dl>
        <div className="service-progress"><span>Repair progression</span><div role="list" aria-label={`Current phase: ${phaseLabels[selectedBay.phase] ?? "Not started"}`}>{phaseLabels.map((label, index) => <div role="listitem" aria-current={index === selectedBay.phase ? "step" : undefined} className={index < selectedBay.phase ? "complete" : index === selectedBay.phase ? "current" : ""} key={label}><i aria-hidden="true">{index < selectedBay.phase ? <Check/> : index + 1}</i><small>{label}</small></div>)}</div></div>
        {selectedBay.status === "at-risk" ? <div className="inspector-alert"><AlertTriangle/><div><strong>Capacity intervention required</strong><span>Assigned technician is unavailable. Recovery planning is active.</span></div></div> : <div className="inspector-safe"><ShieldCheck/><span>{selectedBay.status === "available" ? "Bay is ready for assignment" : "Work remains inside the current promise window"}</span></div>}
      </aside>
    </section>
  </div>;
}
