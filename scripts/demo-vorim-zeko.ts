import { isMockVorimScenario } from "../src/mock-vorim.js";
import { runVorimZekoDemo } from "../src/demo-runner.js";

const scenarioArg = process.argv[2] ?? "allow";
if (!isMockVorimScenario(scenarioArg)) {
  throw new Error(`Unknown scenario "${scenarioArg}". Use allow, modify, escalate, fallback, or deny.`);
}

try {
  const result = await runVorimZekoDemo({
    scenario: scenarioArg,
    proofsEnabled: process.env.PROOFS_ENABLED === "true"
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    scenario: scenarioArg,
    status: "stopped",
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exitCode = 1;
}
