import type {
  RecoveryOptimizationState,
  RecoveryTechnicianInput,
  RecoveryWorkOrderInput,
} from "@/lib/dispatch-optimizer";

export type DemoTechnicianSeed = RecoveryTechnicianInput & {
  specialty: string;
};

export const demoTechnicians: DemoTechnicianSeed[] = [
  {
    id: "T-147",
    name: "Darius Miles",
    specialty: "Engine performance",
    status: "IN_BAY",
    territory: "ROOFTOP_01",
    skills: ["engine", "drivability", "electrical"],
    parts: ["CKP-39180-2M100", "PAD-FRT-G80"],
    routeCapacity: 8,
    activeStops: 6,
    routeMiles: 42.8,
    utilization: 86,
  },
  {
    id: "T-208",
    name: "Sofia Chen",
    specialty: "Electrical & ADAS",
    status: "ROAD_TEST",
    territory: "ROOFTOP_01",
    skills: ["electrical", "adas", "maintenance"],
    parts: ["CAM-ADAS-GV60"],
    routeCapacity: 8,
    activeStops: 7,
    routeMiles: 36.2,
    utilization: 91,
  },
  {
    id: "T-274",
    name: "Jonah Reed",
    specialty: "Drivability",
    status: "IN_BAY",
    territory: "ROOFTOP_01",
    skills: ["drivability", "engine", "maintenance"],
    parts: ["CKP-39180-2M100", "THERM-G90"],
    routeCapacity: 7,
    activeStops: 5,
    routeMiles: 31.4,
    utilization: 74,
  },
  {
    id: "T-319",
    name: "Amara Patel",
    specialty: "Master technician",
    status: "IN_BAY",
    territory: "ROOFTOP_01",
    skills: ["engine", "drivability", "brakes", "electrical", "adas", "maintenance"],
    parts: ["CKP-39180-2M100", "PAD-FRT-G80", "CAM-ADAS-GV60", "THERM-G90"],
    routeCapacity: 9,
    activeStops: 7,
    routeMiles: 39.1,
    utilization: 94,
  },
];

export const demoWorkOrders: RecoveryWorkOrderInput[] = [
  { id: "WO-48321", serviceOperation: "Check-engine diagnosis", vehicle: "2023 GV70", window: "11:00 AM", requiredSkill: "drivability", partCode: "CKP-39180-2M100" },
  { id: "WO-48344", serviceOperation: "Brake vibration", vehicle: "2022 G80", window: "1:00 PM", requiredSkill: "brakes", partCode: "PAD-FRT-G80" },
  { id: "WO-48367", serviceOperation: "60K maintenance", vehicle: "2021 GV80", window: "3:00 PM", requiredSkill: "maintenance", partCode: null },
  { id: "WO-48372", serviceOperation: "Intermittent no-start", vehicle: "2023 G70", window: "3:30 PM", requiredSkill: "drivability", partCode: "CKP-39180-2M100" },
  { id: "WO-48389", serviceOperation: "Recall campaign", vehicle: "2024 GV80", window: "4:00 PM", requiredSkill: "engine", partCode: null },
  { id: "WO-48401", serviceOperation: "ADAS calibration", vehicle: "2023 GV60", window: "2:00 PM", requiredSkill: "adas", partCode: "CAM-ADAS-GV60" },
  { id: "WO-48412", serviceOperation: "Cooling-system repair", vehicle: "2022 G90", window: "4:30 PM", requiredSkill: "engine", partCode: "THERM-G90" },
];

export function createDemoRecoveryState(territory = "ROOFTOP_01"): RecoveryOptimizationState {
  return {
    territory,
    disruptedTechnicianId: "T-274",
    disruptedTechnicianName: "Jonah Reed",
    technicians: demoTechnicians.map(technician => ({
      ...technician,
      territory,
      skills: [...technician.skills],
      parts: [...technician.parts],
    })),
    workOrders: demoWorkOrders.map(workOrder => ({ ...workOrder })),
  };
}
