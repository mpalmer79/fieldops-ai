"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CarFront, Check, Clock3, PhoneCall, ShieldCheck, UserRound, Wrench } from "lucide-react";
import { serviceBays } from "@/lib/service-operations-data";

const repairOrders = serviceBays.filter(bay => bay.repairOrder !== "OPEN").slice(0, 7);
const promisePositions: Record<string, number> = {
  "RO-48321": 18,
  "RO-48344": 36,
  "RO-48401": 48,
  "RO-48367": 62,
  "RO-48372": 68,
  "RO-48389": 76,
  "RO-48412": 84,
};
const phaseLabels = ["Checked in", "Diagnosed", "Repairing", "Quality", "Delivery"];

export function RepairOrdersBoard() {
  const [selectedOrderId, setSelectedOrderId] = useState("RO-48372");
  const selectedOrder = useMemo(() => repairOrders.find(order => order.repairOrder === selectedOrderId) ?? repairOrders[3], [selectedOrderId]);

  return <div className="repair-orders-view">
    <section className="repair-orders-intro">
      <div><span className="eyebrow">CUSTOMER PROMISE CONTROL / REFERENCE QUEUE</span><h2>See which repair orders will make their promise</h2><p>Select an illustrative order to trace its shop progress, constraint state, and next action.</p></div>
      <div className="promise-score"><span><i/> Promise health</span><strong>93.6%</strong><small>5 of 7 protected</small></div>
    </section>

    <section className="repair-order-metrics" aria-label="Repair order status">
      <div><Clock3/><span>Due before 2 PM<strong>3</strong></span></div>
      <div><ShieldCheck/><span>Promises protected<strong>5</strong></span></div>
      <div className="warning"><PhoneCall/><span>Advisor callbacks<strong>2</strong></span></div>
      <div><Wrench/><span>Average cycle time<strong>3.8 hr</strong></span></div>
    </section>

    <section className="repair-order-layout">
      <div className="promise-rail">
        <header><div><span>ACTIVE REPAIR ORDERS / TODAY</span><strong>Promise progression</strong></div><div className="promise-legend"><span><i className="work"/> Work complete</span><span><i className="deadline"/> Promise</span></div></header>
        <div className="rail-hours" aria-hidden="true"><span>10 AM</span><span>12 PM</span><span>2 PM</span><span>4 PM</span><span>6 PM</span></div>
        <div className="repair-order-list" role="group" aria-label="Select a repair order">
          {repairOrders.map(order => {
            const promise = promisePositions[order.repairOrder] ?? 72;
            const progress = Math.min(92, Math.max(10, order.phase * 20));
            return <button type="button" key={order.repairOrder} className={`repair-order-row ${order.status} ${selectedOrder.repairOrder === order.repairOrder ? "selected" : ""}`} onClick={() => setSelectedOrderId(order.repairOrder)} aria-pressed={selectedOrder.repairOrder === order.repairOrder} aria-controls="selected-repair-order" aria-label={`${order.repairOrder}, ${order.vehicle}, ${order.operation}, ${order.statusLabel}, promised ${order.promised}`}>
              <span className="ro-identity"><CarFront/><span><strong>{order.repairOrder}</strong><small>{order.vehicle}</small></span></span>
              <span className="ro-timeline" aria-hidden="true"><i className="ro-progress" style={{ width: `${progress}%` }}/><b className="ro-deadline" style={{ left: `${promise}%` }}/><em>{order.operation}</em></span>
              <span className="ro-promise"><small>{order.promised}</small><strong>{order.statusLabel}</strong></span>
            </button>;
          })}
        </div>
      </div>

      <aside id="selected-repair-order" className={`promise-inspector ${selectedOrder.status === "at-risk" ? "risk" : ""}`} aria-live="polite" aria-atomic="true">
        <header><span>SELECTED PROMISE</span><strong>{selectedOrder.statusLabel}</strong></header>
        <div className="promise-vehicle"><CarFront/><div><small>{selectedOrder.repairOrder}</small><h3>{selectedOrder.vehicle}</h3><p>{selectedOrder.operation}</p></div></div>
        <dl className="promise-facts"><div><dt><Clock3/> Promised</dt><dd>{selectedOrder.promised}</dd></div><div><dt><UserRound/> Technician</dt><dd>{selectedOrder.technician}</dd></div></dl>
        <div className="promise-progress"><span>Service journey</span><div role="list" aria-label={`Current phase: ${phaseLabels[selectedOrder.phase] ?? "Not started"}`}>{phaseLabels.map((label, index) => <div role="listitem" aria-current={index === selectedOrder.phase ? "step" : undefined} className={index < selectedOrder.phase ? "complete" : index === selectedOrder.phase ? "current" : ""} key={label}><i aria-hidden="true">{index < selectedOrder.phase ? <Check/> : index + 1}</i><small>{label}</small></div>)}</div></div>
        {selectedOrder.status === "at-risk" ? <div className="promise-recovery"><AlertTriangle/><div><strong>Recovery plan available</strong><span>Qualified reassignment can preserve the {selectedOrder.promised} promise.</span></div><ArrowRight/></div> : <div className="promise-safe"><ShieldCheck/><div><strong>Promise window protected</strong><span>No customer intervention is currently required.</span></div></div>}
        <div className="promise-control"><span>CONTROL BOUNDARY</span><p>FieldOps recommends. The service manager authorizes any customer or technician change.</p></div>
      </aside>
    </section>
  </div>;
}
