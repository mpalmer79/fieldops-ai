export type AssistantIntent =
  | "overview"
  | "recovery"
  | "governance"
  | "architecture"
  | "workspace"
  | "creator"
  | "fallback";

export type AssistantLink = {
  label: string;
  href: string;
};

export type AssistantReply = {
  intent: AssistantIntent;
  title?: string;
  paragraphs: string[];
  bullets?: string[];
  links?: AssistantLink[];
};

export const assistantPrompts = [
  "What problem does FieldOps AI solve?",
  "How does the recovery engine protect customer promises?",
  "How are AI decisions governed and audited?",
  "Who is Michael Palmer, and what else has he built?",
] as const;

export const welcomeReply: AssistantReply = {
  intent: "overview",
  title: "FieldOps Context Assistant",
  paragraphs: [
    "I can explain the product, recovery logic, workspaces, architecture, governance model, and the professional background behind the project.",
    "I am a deterministic in-app knowledge assistant backed by curated FieldOps content. I do not send your question to Claude, OpenAI, or another external model.",
  ],
};

const creatorReply: AssistantReply = {
  intent: "creator",
  title: "Michael Palmer",
  paragraphs: [
    "AI Solutions Engineer | Applied AI, LLM Systems, Workflow Automation | Full-Stack Engineering",
    "Michael Palmer combines more than 25 years of automotive retail and dealership operations experience with computer science, software engineering, and applied AI. His strongest work sits at the intersection of real operating workflows and production software.",
    "He builds systems that combine structured data, APIs, deterministic business logic, AI-assisted workflows, and human decision controls. His focus is on explainability, auditability, useful automation, and measurable business impact rather than AI for its own sake.",
    "FieldOps AI reflects that background by translating dealership service operations into a governed decision system for capacity recovery, repair-order protection, diagnostics, planning, and operational AI oversight.",
  ],
  bullets: [
    "Automotive retail operations and dealership workflow expertise",
    "Applied AI and LLM-integrated business systems",
    "React, Next.js, TypeScript, APIs, Python/FastAPI, and data-backed applications",
    "Human-in-the-loop automation, auditability, and operational decision support",
    "Computer Science studies at Southern New Hampshire University",
  ],
  links: [
    { label: "LinkedIn", href: "https://linkedin.com/in/mpalmer1234" },
    { label: "GitHub", href: "https://github.com/mpalmer79" },
    { label: "Portfolio", href: "https://mpalmer79.github.io/" },
  ],
};

const overviewReply: AssistantReply = {
  intent: "overview",
  title: "What FieldOps AI solves",
  paragraphs: [
    "FieldOps AI is a dealership service operations decision system built around one expensive operational problem: the shop plan changes after customer promises have already been made.",
    "When a technician becomes unavailable or qualified capacity tightens, the system evaluates repair orders, technician skills, bay and equipment requirements, staged parts, workload, and promise times. It then produces feasible recovery options for a manager to review instead of silently changing commitments.",
  ],
  bullets: [
    "Protect customer promise times during service disruptions",
    "Remove invalid technician and bay assignments before scoring options",
    "Expose capacity, repair-order, technician, and performance risk in one operating system",
    "Require human approval for consequential execution",
    "Persist evidence so decisions can be reviewed and audited",
  ],
};

const recoveryReply: AssistantReply = {
  intent: "recovery",
  title: "Recovery engine",
  paragraphs: [
    "The recovery flow starts with a disruption such as a technician callout. FieldOps identifies the affected repair orders, screens possible reassignment candidates against hard operating constraints, scores only feasible plans, and presents the strongest recovery plan for manager review.",
    "Customer promise protection is treated as an operating objective, but not at the expense of invalid work. A repair order cannot be moved to a technician who lacks the required qualification, capacity, equipment access, or other required constraint. If a promise cannot be preserved safely, the system surfaces the exception for advisor outreach instead of hiding it.",
  ],
  bullets: [
    "Detect exposed repair orders",
    "Exclude infeasible assignments",
    "Score valid recovery scenarios",
    "Show projected customer and workload impact",
    "Require manager approval before execution",
    "Record the decision and resulting state change",
  ],
};

const governanceReply: AssistantReply = {
  intent: "governance",
  title: "Governed AI operations",
  paragraphs: [
    "FieldOps is designed around explicit control boundaries. The system can evaluate, recommend, and simulate, but consequential changes remain subject to policy and human approval.",
    "The operating model separates hard constraints from weighted preferences. Hard constraints cannot be traded away for a better score. Policy versions, plan state transitions, approvals, execution results, and rollback activity are retained so the reasoning path can be inspected later.",
  ],
  bullets: [
    "Human approval before consequential execution",
    "Versioned decision policy",
    "Hard constraints evaluated before weighted scoring",
    "Persistent audit history",
    "Rollback and failure states retained as evidence",
    "AgentOps views for production agent health and release control",
  ],
};

const architectureReply: AssistantReply = {
  intent: "architecture",
  title: "System architecture",
  paragraphs: [
    "FieldOps AI is implemented as a full-stack Next.js and TypeScript application with server-side APIs, PostgreSQL persistence, deterministic optimization and validation logic, and a responsive operational interface deployed on Railway.",
    "The portfolio value is not a chat wrapper. The core system models operational state, constraints, persisted plans, approvals, diagnostics, benchmark evidence, and audit events. AI-oriented features sit inside that governed application architecture rather than replacing it.",
  ],
  bullets: [
    "Next.js and React application shell",
    "TypeScript domain and interface layer",
    "PostgreSQL persistent operational state",
    "Server-side recovery, diagnostic, and benchmark workflows",
    "Human approval and audit contracts",
    "Railway production deployment",
  ],
};

const workspaceDescriptions: Record<string, AssistantReply> = {
  "service-command": {
    intent: "workspace",
    title: "Service Command",
    paragraphs: ["Service Command is the disruption-control workspace. It models a technician availability failure, evaluates feasible repair-order recovery, exposes customer impact, and holds execution for manager approval."],
  },
  "shop-board": {
    intent: "workspace",
    title: "Shop Board",
    paragraphs: ["Shop Board turns bay occupancy, repair-order state, and promise risk into one operating view so a manager can see where work is flowing and where capacity is beginning to fail."],
  },
  "repair-orders": {
    intent: "workspace",
    title: "Repair Orders",
    paragraphs: ["Repair Orders focuses on customer promise progression. It surfaces which jobs are on track, which are at risk, what stage each order is in, and what recovery action is available."],
  },
  technicians: {
    intent: "workspace",
    title: "Technicians",
    paragraphs: ["Technicians compares workload, availability, skill coverage, and assignment risk so service leadership can match qualified capacity to the work actually in the shop."],
  },
  performance: {
    intent: "workspace",
    title: "Performance",
    paragraphs: ["Performance measures whether the operating system is improving customer promises and shop output, including promise attainment, efficiency, cycle time, comeback rate, and recovery impact."],
  },
  "capacity-planning": {
    intent: "workspace",
    title: "Capacity Planning",
    paragraphs: ["Capacity Planning looks ahead across the appointment horizon to find days where expected demand exceeds qualified staffed capacity, then supports recovery planning before the schedule becomes an active disruption."],
  },
  "simulation-lab": {
    intent: "workspace",
    title: "Simulation Lab",
    paragraphs: ["Simulation Lab stress-tests the recovery engine across dealership workload scales. It provides deterministic benchmark evidence, throughput and latency measurements, and release-readiness gates before operational changes are promoted."],
  },
  "diagnostic-copilot": {
    intent: "workspace",
    title: "Diagnostic Copilot",
    paragraphs: ["Diagnostic Copilot turns vehicle concerns, diagnostic trouble codes, test results, service evidence, inventory, and safety constraints into ranked verification paths while preserving explicit technician acknowledgement and human control."],
  },
  agentops: {
    intent: "workspace",
    title: "AgentOps",
    paragraphs: ["AgentOps is the governance and production control tower for operational agents. It surfaces health, decision volume, incidents, inference cost, release state, and rollback controls."],
  },
};

function currentWorkspace(pathname: string) {
  const slug = pathname.split("/").filter(Boolean).at(-1) ?? "";
  return workspaceDescriptions[slug];
}

export function resolveAssistantResponse(message: string, pathname = ""): AssistantReply {
  const normalized = message.toLowerCase().replace(/[^a-z0-9\s]/g, " ");

  if (/michael|palmer|creator|author|portfolio|linkedin|github|who built|who made|your background|about you/.test(normalized)) {
    return creatorReply;
  }

  if (/recover|recovery|disruption|callout|promise|reassign|technician unavailable|shop plan/.test(normalized)) {
    return recoveryReply;
  }

  if (/govern|audit|approval|approve|policy|human|rollback|constraint|safe|control boundary|agentops/.test(normalized)) {
    return governanceReply;
  }

  if (/architecture|stack|technology|technical|postgres|database|next js|typescript|railway|api|how is .*built/.test(normalized)) {
    return architectureReply;
  }

  if (/this page|this workspace|what am i looking at|what does this page do|explain this screen/.test(normalized)) {
    return currentWorkspace(pathname) ?? overviewReply;
  }

  if (/fieldops|field ops|problem|dealership|service department|what does .*do|what is this/.test(normalized)) {
    return overviewReply;
  }

  const workspaceMatch = Object.entries(workspaceDescriptions).find(([slug, reply]) => {
    const phrase = slug.replaceAll("-", " ");
    return normalized.includes(phrase) || normalized.includes(reply.title?.toLowerCase() ?? "");
  });

  if (workspaceMatch) return workspaceMatch[1];

  return {
    intent: "fallback",
    title: "I can help with the FieldOps portfolio system",
    paragraphs: [
      "I am intentionally scoped to the product and its portfolio context. Ask me about recovery logic, service operations, capacity planning, diagnostics, AgentOps, architecture, governance, or Michael Palmer.",
      "This response comes from the deterministic FieldOps knowledge set built into the application. No prompt is sent to Claude, OpenAI, or another external model.",
    ],
  };
}
