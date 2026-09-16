import { runCustomerPoc } from "../../src/customer-poc.js";
import { isMockVorimScenario } from "../../src/mock-vorim.js";
import { kentAiPoc } from "./scenario.js";

const scenario = process.argv[2] ?? "escalate";
if (!isMockVorimScenario(scenario)) {
  throw new Error(`Unknown scenario "${scenario}". Use allow, modify, escalate, fallback, or deny.`);
}

try {
  console.log(JSON.stringify(await runCustomerPoc(kentAiPoc, { scenario }), null, 2));
} catch (error) {
  console.error(JSON.stringify({
    poc: kentAiPoc.id,
    scenario,
    status: "stopped",
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exitCode = 1;
}
