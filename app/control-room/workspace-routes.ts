export const workspaceRoutes = [
  { slug: "service-command", label: "Service command", title: "Service command", description: "Rooftop 01 · live service operation", operatingMode: "Live operation" },
  { slug: "shop-board", label: "Shop board", title: "Shop board", description: "Live bay occupancy, work state, and customer promise risk", operatingMode: "Floor control" },
  { slug: "repair-orders", label: "Repair orders", title: "Repair orders", description: "Customer promise risk, repair progression, and recovery status", operatingMode: "Promise control" },
  { slug: "technicians", label: "Technicians", title: "Technicians", description: "Workload, certification coverage, and qualified capacity", operatingMode: "Team control" },
  { slug: "performance", label: "Performance", title: "Performance", description: "Customer promises, shop output, and recovery impact", operatingMode: "Outcome control" },
  { slug: "capacity-planning", label: "Capacity Planning", title: "Capacity planning", description: "Appointment forecasts, staffing risk, and scenario decisions", operatingMode: "Planning horizon" },
  { slug: "simulation-lab", label: "Simulation Lab", title: "Simulation lab", description: "Dealership recovery stress tests and release readiness", operatingMode: "Measured runtime" },
  { slug: "diagnostic-copilot", label: "Diagnostic Copilot", title: "Vehicle diagnostics", description: "Evidence, safety, parts, and repair outcomes", operatingMode: "Grounded support" },
  { slug: "agentops", label: "AgentOps", title: "AI operations", description: "Agent fleet governance and release safety", operatingMode: "Monitored fleet" },
] as const;

export type WorkspaceRoute = (typeof workspaceRoutes)[number];
export type WorkspaceSlug = WorkspaceRoute["slug"];

export function getWorkspaceRoute(slug: string) {
  return workspaceRoutes.find((route) => route.slug === slug);
}
