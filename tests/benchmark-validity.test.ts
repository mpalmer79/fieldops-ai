import assert from "node:assert/strict";
import { test } from "vitest";
import {
  auditBenchmarkAssignment,
  benchmarkDeterminismEvidence,
  benchmarkGateThresholds,
  evaluateBenchmarkPerformanceGates,
  isBenchmarkAssignmentEligible,
  runBenchmarkConstraintFixtures,
  type BenchmarkConstraintFacts,
} from "../lib/server/benchmark-store";

const eligible: BenchmarkConstraintFacts = {
  skillEligible: true,
  territoryEligible: true,
  partAvailable: true,
  capacityAvailable: true,
};

test("the independent assignment auditor detects every forced hard-constraint violation", () => {
  for (const constraint of Object.keys(eligible) as Array<keyof BenchmarkConstraintFacts>) {
    const facts = { ...eligible, [constraint]: false };
    const audit = auditBenchmarkAssignment(facts, true);
    assert.equal(audit.valid, false);
    assert.deepEqual(audit.violatedConstraints, [constraint]);
  }
});

test("the constraint engine accepts the valid fixture and rejects every negative fixture", () => {
  assert.equal(isBenchmarkAssignmentEligible(eligible), true);
  const fixtures = runBenchmarkConstraintFixtures();
  assert.equal(fixtures.passed, true);
  assert.equal(fixtures.fixtureCount, 5);
});

test("the constraint gate fails when a regressed engine accepts invalid assignments", () => {
  const fixtures = runBenchmarkConstraintFixtures(() => true);
  assert.equal(fixtures.passed, false);
  assert.equal(fixtures.results.every(result => result.engineRejected), false);
});

test("the constraint gate fails when an engine rejects every assignment", () => {
  assert.equal(runBenchmarkConstraintFixtures(() => false).passed, false);
});

test("determinism evidence survives traversal changes and distinguishes another seed", () => {
  const evidence = benchmarkDeterminismEvidence("small", 72_001);
  assert.equal(evidence.passed, true);
  assert.notEqual(evidence.checksum, evidence.differentSeedChecksum);
});

test("performance gates use floors without a comparable baseline", () => {
  assert.deepEqual(benchmarkGateThresholds(null), {
    throughput: 500_000,
    p95ShardMs: 25,
    source: "floor",
  });
});

test("performance gates fail material throughput and latency regressions", () => {
  const baseline = { throughput: 2_000_000, p95ShardMs: 4 };
  const thresholds = benchmarkGateThresholds(baseline);
  assert.deepEqual(thresholds, {
    throughput: 1_400_000,
    p95ShardMs: 7,
    source: "baseline",
  });
  assert.deepEqual(
    evaluateBenchmarkPerformanceGates({ throughput: 1_300_000, p95ShardMs: 8 }, baseline),
    { thresholds, throughputPassed: false, tailLatencyPassed: false },
  );
});
