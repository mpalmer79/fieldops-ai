# FieldOps AI

FieldOps AI is an agentic field-service orchestration platform for constraint-based dispatch, dynamic route recovery, human approval, policy optimization, and auditable operational decisions.

**Live application:** [fieldops-ai.mpalm2025.chatgpt.site](https://fieldops-ai.mpalm2025.chatgpt.site)

## The operational problem

Field-service schedules deteriorate when technicians become unavailable, appointments run long, parts are missing, or urgent work arrives. Dispatchers must quickly determine which appointments can be preserved, which technicians are qualified, and which recovery plan creates the lowest operational cost without violating customer commitments.

FieldOps AI demonstrates how a bounded decision system can evaluate those tradeoffs while keeping consequential actions under human control.

## Current capabilities

- Live dispatch command center with route, technician, SLA, mileage, and risk indicators
- Deterministic recovery optimizer that evaluates technician reassignment combinations
- Hard constraints for certification, territory, parts, shift availability, and route capacity
- Weighted business objectives for SLA protection, travel, workload, overtime, and schedule stability
- Dynamic policy controls that recalculate the recommended plan
- Human approval boundary for customer rescheduling and other consequential actions
- Explainable recovery plans with rejected candidates, assignment impact, and decision criteria
- Authenticated operator roles for dispatcher, supervisor, and admin actions
- Durable D1 state for technicians, work orders, policies, disruptions, plans, assignments, and audits
- Idempotent event ingestion and optimistic concurrency checks for policies and plan transitions
- Guarded plan lifecycle with approval, execution, rejection, and compensating rollback
- Immutable decision stream backed by operational audit records
- Structured browser tools for agent-accessible simulation, policy updates, and plan execution
- Responsive desktop and mobile interface

## Demonstration workflow

1. Select **Simulate disruption** to make technician `T-274` unavailable.
2. Observe the resulting changes to SLA, mileage, and at-risk appointments.
3. Open **Review recovery plan**.
4. Inspect proposed assignments, customer impact, hard-constraint validation, and solver evidence.
5. Select **Approve and execute** to apply the five reassignments and queue two reschedules.
6. Inspect the persisted audit events in the decision stream.
7. As an admin, use **Roll back execution** to restore the original work-order assignments through a compensating action.
8. Open **Policy controls**, change an operational priority, and save a new version for the next recovery evaluation.

## Optimization model

The current scenario contains seven affected service appointments and three eligible receiving technicians. The solver performs a bounded exhaustive search across the candidate assignment space.

Under the default policy, it:

- evaluates 896 capacity-valid assignment combinations
- identifies 150 plans that preserve the required five appointments
- excludes ineligible candidates before weighted scoring
- selects the highest-scoring feasible plan

Hard constraints are never converted into weighted preferences. An assignment that violates certification, territory, parts availability, shift availability, or technician capacity is not eligible for scoring.

The remaining feasible plans are scored using normalized policy weights:

| Objective | Default weight |
|---|---:|
| SLA protection | 35% |
| Travel efficiency | 25% |
| Technician load | 20% |
| Overtime reduction | 15% |
| Schedule stability | 5% |

## Decision flow

```mermaid
flowchart TD
    A[Technician disruption] --> B[Generate candidate assignments]
    B --> C[Remove hard-constraint violations]
    C --> D[Evaluate feasible plans]
    D --> E[Score business objectives]
    E --> F{Approval required?}
    F -->|Yes| G[Dispatcher review]
    F -->|No| H[Bounded automatic action]
    G --> I[Execute or reject]
    H --> I
    I --> J[Record decision outcome]
```

## Technology

- Next.js 16 and React 19
- TypeScript
- Vinext and Cloudflare Workers
- Tailwind CSS
- Radix UI and shadcn-compatible interface primitives
- Lucide icons
- WebMCP-compatible structured browser actions
- Cloudflare D1 with generated, forward-only Drizzle migrations

## Project structure

```text
app/
  page.tsx                 Dispatch interface and operator workflows
  globals.css              Application theme and responsive layout
components/ui/             Accessible interface primitives
lib/
  dispatch-optimizer.ts    Constraints, search, scoring, and plan output
  server/                  Authentication, persistence, lifecycle, and audit services
app/api/
  operations/              Durable command-center snapshot
  disruptions/             Idempotent operational event ingestion
  policy/                  Version-guarded policy updates
  recovery-plans/          Role-guarded plan transitions
db/
  schema.ts                Indexed operational data model
drizzle/                   Generated schema migration and metadata
public/
  favicon.svg              FieldOps AI application icon
```

## Engineering boundaries

The current version is a portfolio prototype using synthetic operational data. The optimization logic is real and deterministic and now executes on the server for operational actions. The browser also computes a non-authoritative policy preview before saving.

The implementation demonstrates production-oriented controls, but it is not connected to a live field-service platform. External dispatch, customer-notification, inventory, and routing integrations remain simulated boundaries. Execution updates durable work-order state, while rollback is implemented as an explicit compensating transaction with its own audit event.

## Roadmap

- [x] Dispatch command interface
- [x] Disruption and recovery workflow
- [x] Constraint-based optimization
- [x] Configurable business policies
- [x] Persistent operational backend and event pipeline
- [ ] AgentOps monitoring and evaluation control tower
- [ ] Technician diagnostic copilot
- [ ] Demand forecasting and capacity planning
- [ ] Enterprise-scale simulation and benchmark report

## Portfolio focus

This project is designed to demonstrate more than AI-assisted user interaction. Its focus is operational decision architecture: translating a business disruption into constrained alternatives, measurable tradeoffs, explicit autonomy limits, human review, and an auditable outcome.
