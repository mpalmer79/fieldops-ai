export const workspaceRoutes = [
  { slug: "service-command", label: "Service command", title: "Service command", description: "Rooftop 01 · live service operation", operatingMode: "Live operation", dataProvenance: "LIVE DATA" },
  { slug: "shop-board", label: "Shop board", title: "Shop board", description: "Illustrative bay occupancy, work state, and customer promise risk", operatingMode: "Floor control", dataProvenance: "REFERENCE VIEW" },
  { slug: "repair-orders", label: "Repair orders", title: "Repair orders", description: "Illustrative customer promise risk, repair progression, and recovery status", operatingMode: "Promise control", dataProvenance: "REFERENCE VIEW" },
  { slug: "technicians", label: "Technicians", title: "Technicians", description: "Live workload, certification coverage, and qualified capacity", operatingMode: "Team control", dataProvenance: "LIVE DATA" },
  { slug: "performance", label: "Performance", title: "Performance", description: "Live recovery projection with illustrative seven-day trends", operatingMode: "Outcome control", dataProvenance: "HYBRID VIEW" },
  { slug: "capacity-planning", label: "Capacity Planning", title: "Capacity planning", description: "Versioned synthetic forecasts, staffing risk, and scenario decisions", operatingMode: "Planning horizon", dataProvenance: "MODELED DATA" },
  { slug: "simulation-lab", label: "Simulation Lab", title: "Simulation lab", description: "Measured dealership recovery stress tests and release readiness", operatingMode: "Measured runtime", dataProvenance: "MEASURED DATA" },
  { slug: "diagnostic-copilot", label: "Diagnostic Copilot", title: "Vehicle diagnostics", description: "Persisted workflow using curated reference evidence", operatingMode: "Grounded support", dataProvenance: "REFERENCE DATA" },
  { slug: "agentops", label: "AgentOps", title: "AI operations", description: "Persisted demo governance and release-safety state", operatingMode: "Monitored fleet", dataProvenance: "DEMO DATA" },
] as const;

export type WorkspaceRoute = (typeof workspaceRoutes)[number];
export type WorkspaceSlug = WorkspaceRoute["slug"];

export function getWorkspaceRoute(slug: string) {
  return workspaceRoutes.find((route) => route.slug === slug);
}
