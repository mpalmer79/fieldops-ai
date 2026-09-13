"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CarFront, Check, Clock3, Route, ShieldCheck, UserRound, Wrench } from "lucide-react";

type BayStatus = "in-progress" | "quality-check" | "equipment" | "at-risk" | "waiting" | "available";

type ServiceBay = {
  id: string;
  technician: string;
  initials: string;
  repairOrder: string;
  vehicle: string;
  operation: string;
  promised: string;
  status: BayStatus;
  statusLabel: string;
  phase: number;
};

const serviceBays: ServiceBay[] = [
  { id: "01", technician: "Darius Miles", initials: "DM", repairOrder: "RO-48321", vehicle: "2023 GV70", operation: "Diagnosis", promised: "11:00 AM", status: "in-progress", statusLabel: "In progress", phase: 2 },
  { id: "02", technician: "Amara Patel", initials: "AP", repairOrder: "RO-48344", vehicle: "2022 G80", operation: "Brake vibration", promised: "1:00 PM", status: "quality-check", statusLabel: "QC 12:40", phase: 4 },
  { id: "03", technician: "Sofia Chen", initials: "SC", repairOrder: "RO-48401", vehicle: "2023 GV60", operation: "ADAS calibration", promised: "2:00 PM", status: "equipment", statusLabel: "Equipment", phase: 3 },
  { id: "04", technician: "Jonah Reed", initials: "JR", repairOrder: "RO-48372", vehicle: "2023 G70", operation: "Intermittent no-start", promised: "3:30 PM", status: "at-risk", statusLabel: "At risk", phase: 2 },
  { id: "05", technician: "Amara Patel", initials: "AP", repairOrder: "RO-48367", vehicle: "2021 GV80", operation: "60K maintenance", promised: "3:00 PM", status: "waiting", statusLabel: "Parts staged", phase: 2 },
  { id: "06", technician: "Darius Miles", initials: "DM", repairOrder: "RO-48412", vehicle: "2022 G90", operation: "Cooling system", promised: "4:30 PM", status: "in-progress", statusLabel: "In progress", phase: 3 },
  { id: "07", technician: "Sofia Chen", initials: "SC", repairOrder: "RO-48389", vehicle: "2024 GV80", operation: "Recall campaign", promised: "4:00 PM", status: "quality-check", statusLabel: "Ready", phase: 4 },
  { id: "08", technician: "Unassigned", initials: "OP", repairOrder: "OPEN", vehicle: "Alignment rack", operation: "Available capacity", promised: "Open", status: "available", statusLabel: "Available", phase: 0 },
  { id: "09", technician: "Darius Miles", initials: "DM", repairOrder: "RO-48432", vehicle: "2024 GV70", operation: "Multipoint inspection", promised: "2:45 PM", status: "waiting", statusLabel: "Advisor hold", phase: 1 },
  { id: "10", technician: "Priya Desai", initials: "PD", repairOrder: "RO-48435", vehicle: "2022 G80", operation: "Tire mount", promised: "4:15 PM", status: "in-progress", statusLabel: "In progress", phase: 3 },
  { id: "11", technician: "Amara Patel", initials: "AP", repairOrder: "RO-48441", vehicle: "2024 GV80", operation: "Final inspection", promised: "4:45 PM", status: "quality-check", statusLabel: "Quality check", phase: 4 },
  { id: "12", technician: "Unassigned", initials: "OP", repairOrder: "OPEN", vehicle: "Incoming service", operation: "Staging bay", promised: "Open", status: "available", statusLabel: "Available", phase: 0 },
];

const phaseLabels = ["Check-in", "Diagnose", "Repair", "Quality", "Delivery"];

export function ShopBoard() {
  const [selectedBayId, setSelectedBayId] = useState("04");
  const selectedBay = useMemo(() => serviceBays.find(bay => bay.id === selectedBayId) ?? serviceBays[3], [selectedBayId]);
  const occupiedBays = serviceBays.filter(bay => bay.status !== "available").length;

  return <div className="shop-board-view">
    <section className="shop-board-intro">
      <div><span className="eyebrow">LIVE SHOP FLOOR / 12-BAY CONTROL</span><h2>Every bay, repair order, and customer promise in one view</h2><p>Select a bay to inspect its current work state and promised-time risk.</p></div>
      <div className="shop-board-pulse"><i/><span>Shop signal live</span><strong>Updated now</strong></div>
    </section>

    <section className="shop-board-metrics" aria-label="Shop board status">
      <div><CarFront/><span>Occupied bays<strong>{occupiedBays} / 12</strong></span></div>
      <div><Wrench/><span>Open repair orders<strong>25</strong></span></div>
      <div className="warning"><AlertTriangle/><span>At-risk promises<strong>2</strong></span></div>
      <div><Clock3/><span>Next load evaluation<strong>4:32</strong></span></div>
    </section>

    <section className="shop-board-layout">
      <div className="floor-plan" aria-label="Interactive service bay floor plan">
        <div className="floor-plan-heading"><div><span>SHOP FLOOR / NORTH WALL</span><strong>Bay occupancy and flow</strong></div><div className="floor-legend"><span><i className="active"/> Active</span><span><i className="risk"/> At risk</span><span><i className="open"/> Open</span></div></div>
        <div className="bay-plan-grid">
          {serviceBays.map(bay => <button key={bay.id} className={`floor-bay ${bay.status} ${selectedBay.id === bay.id ? "selected" : ""}`} onClick={() => setSelectedBayId(bay.id)} aria-label={`Bay ${bay.id}, ${bay.repairOrder}, ${bay.statusLabel}`} aria-pressed={selectedBay.id === bay.id}>
            <span className="floor-bay-head"><small>BAY {bay.id}</small><b>{bay.initials}</b></span>
            <CarFront aria-hidden="true"/>
            <span className="floor-bay-state">{bay.statusLabel}</span>
            <strong>{bay.repairOrder}</strong>
            <small>{bay.vehicle}</small>
          </button>)}
        </div>
        <div className="service-drive"><Route/><span>Service drive</span><i/><i/><i/></div>
      </div>

      <aside className={`bay-inspector ${selectedBay.status === "at-risk" ? "risk" : ""}`} aria-live="polite">
        <header><span>SELECTED BAY / {selectedBay.id}</span><strong>{selectedBay.statusLabel}</strong></header>
        <div className="inspector-vehicle"><CarFront/><div><small>{selectedBay.repairOrder}</small><h3>{selectedBay.vehicle}</h3><p>{selectedBay.operation}</p></div></div>
        <dl className="inspector-facts"><div><dt><UserRound/> Technician</dt><dd>{selectedBay.technician}</dd></div><div><dt><Clock3/> Customer promise</dt><dd>{selectedBay.promised}</dd></div></dl>
        <div className="service-progress"><span>Repair progression</span><div>{phaseLabels.map((label, index) => <div className={index < selectedBay.phase ? "complete" : index === selectedBay.phase ? "current" : ""} key={label}><i>{index < selectedBay.phase ? <Check/> : index + 1}</i><small>{label}</small></div>)}</div></div>
        {selectedBay.status === "at-risk" ? <div className="inspector-alert"><AlertTriangle/><div><strong>Capacity intervention required</strong><span>Assigned technician is unavailable. Recovery planning is active.</span></div></div> : <div className="inspector-safe"><ShieldCheck/><span>{selectedBay.status === "available" ? "Bay is ready for assignment" : "Work remains inside the current promise window"}</span></div>}
      </aside>
    </section>
  </div>;
}
