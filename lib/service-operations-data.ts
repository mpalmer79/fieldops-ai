export type BayStatus = "in-progress" | "quality-check" | "equipment" | "at-risk" | "waiting" | "available";

export type ServiceBay = {
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
  tone: "orange" | "yellow" | "purple" | "offline" | "open";
};

export const serviceBays: ServiceBay[] = [
  { id: "01", technician: "Darius Miles", initials: "DM", repairOrder: "RO-48321", vehicle: "2023 GV70", operation: "Diagnosis", promised: "11:00 AM", status: "in-progress", statusLabel: "In progress", phase: 2, tone: "orange" },
  { id: "02", technician: "Amara Patel", initials: "AP", repairOrder: "RO-48344", vehicle: "2022 G80", operation: "Brake vibration", promised: "1:00 PM", status: "quality-check", statusLabel: "QC 12:40", phase: 4, tone: "yellow" },
  { id: "03", technician: "Sofia Chen", initials: "SC", repairOrder: "RO-48401", vehicle: "2023 GV60", operation: "ADAS calibration", promised: "2:00 PM", status: "equipment", statusLabel: "Equipment", phase: 3, tone: "purple" },
  { id: "04", technician: "Jonah Reed", initials: "JR", repairOrder: "RO-48372", vehicle: "2023 G70", operation: "Intermittent no-start", promised: "3:30 PM", status: "at-risk", statusLabel: "At risk", phase: 2, tone: "offline" },
  { id: "05", technician: "Amara Patel", initials: "AP", repairOrder: "RO-48367", vehicle: "2021 GV80", operation: "60K maintenance", promised: "3:00 PM", status: "waiting", statusLabel: "Parts staged", phase: 2, tone: "yellow" },
  { id: "06", technician: "Darius Miles", initials: "DM", repairOrder: "RO-48412", vehicle: "2022 G90", operation: "Cooling system", promised: "4:30 PM", status: "in-progress", statusLabel: "In progress", phase: 3, tone: "orange" },
  { id: "07", technician: "Sofia Chen", initials: "SC", repairOrder: "RO-48389", vehicle: "2024 GV80", operation: "Recall campaign", promised: "4:00 PM", status: "quality-check", statusLabel: "Ready", phase: 4, tone: "purple" },
  { id: "08", technician: "Unassigned", initials: "OP", repairOrder: "OPEN", vehicle: "Alignment rack", operation: "Available capacity", promised: "Open", status: "available", statusLabel: "Available", phase: 0, tone: "open" },
  { id: "09", technician: "Darius Miles", initials: "DM", repairOrder: "RO-48432", vehicle: "2024 GV70", operation: "Multipoint inspection", promised: "2:45 PM", status: "waiting", statusLabel: "Advisor hold", phase: 1, tone: "yellow" },
  { id: "10", technician: "Priya Desai", initials: "PD", repairOrder: "RO-48435", vehicle: "2022 G80", operation: "Tire mount", promised: "4:15 PM", status: "in-progress", statusLabel: "In progress", phase: 3, tone: "orange" },
  { id: "11", technician: "Amara Patel", initials: "AP", repairOrder: "RO-48441", vehicle: "2024 GV80", operation: "Final inspection", promised: "4:45 PM", status: "quality-check", statusLabel: "Quality check", phase: 4, tone: "purple" },
  { id: "12", technician: "Unassigned", initials: "OP", repairOrder: "OPEN", vehicle: "Incoming service", operation: "Staging bay", promised: "Open", status: "available", statusLabel: "Available", phase: 0, tone: "open" },
];
