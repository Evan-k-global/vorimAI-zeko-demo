const scenarios = [...document.querySelectorAll(".scenario")];
const runButton = document.querySelector("#run-button");
const statusPill = document.querySelector("#status-pill");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const scenarioLabel = document.querySelector("#scenario-label");
let selectedScenario = "allow";

const fields = {
  timeline: document.querySelector("#timeline"),
  receiptCommitment: document.querySelector("#receipt-commitment"),
  missionCommitment: document.querySelector("#mission-commitment"),
  missionRoot: document.querySelector("#mission-root"),
  txHash: document.querySelector("#tx-hash"),
  decisionId: document.querySelector("#decision-id"),
  verdict: document.querySelector("#verdict"),
  alg: document.querySelector("#alg"),
  originalIntent: document.querySelector("#original-intent"),
  effectiveIntent: document.querySelector("#effective-intent"),
  payload: document.querySelector("#payload"),
  auditCount: document.querySelector("#audit-count"),
  auditEvents: document.querySelector("#audit-events")
};

function setStatus(kind, title, detail) {
  statusPill.textContent = kind;
  statusPill.className = `pill ${kind.toLowerCase()}`;
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

function compact(value, size = 14) {
  if (!value || value === "-") return "-";
  const text = String(value);
  return text.length > size * 2 ? `${text.slice(0, size)}...${text.slice(-size)}` : text;
}

function renderResult(result) {
  scenarioLabel.textContent = result.scenario;
  fields.timeline.innerHTML = result.timeline.map((item) => (
    `<li><span></span><strong>${item.label}</strong><small>${compact(item.detail, 18)}</small></li>`
  )).join("");
  fields.receiptCommitment.textContent = compact(result.receiptCommitment, 18);
  fields.missionCommitment.textContent = compact(result.missionCommitment, 18);
  fields.missionRoot.textContent = compact(result.missionRoot, 18);
  fields.txHash.textContent = result.simulatedTxHash;
  fields.decisionId.textContent = result.decisionId;
  fields.verdict.textContent = result.receipt.verdict;
  fields.alg.textContent = result.receipt.alg;
  fields.originalIntent.textContent = compact(result.originalIntentHash, 18);
  fields.effectiveIntent.textContent = compact(result.effectiveIntentHash, 18);
  fields.payload.textContent = JSON.stringify(result.effectivePayload, null, 2);
  fields.auditCount.textContent = `${result.auditEvents.length} events`;
  fields.auditEvents.innerHTML = result.auditEvents.map((entry, index) => (
    `<div class="audit-row">
      <strong>${index + 1}. ${entry.event.action}</strong>
      <span>${compact(entry.signature, 24)}</span>
    </div>`
  )).join("");
}

async function runDemo() {
  runButton.disabled = true;
  setStatus("Running", "Executing local flow", "Deploying the zkApp and asking Vorim for a runtime decision.");
  try {
    const response = await fetch("/api/run-demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario: selectedScenario })
    });
    const body = await response.json();
    if (!response.ok) {
      setStatus("Stopped", "Action did not settle", body.error ?? "The policy stopped the flow.");
      return;
    }
    renderResult(body);
    setStatus("Settled", "Receipt committed on Zeko", `${body.receipt.verdict} decision ${body.decisionId}`);
  } catch (error) {
    setStatus("Error", "Demo failed", error instanceof Error ? error.message : String(error));
  } finally {
    runButton.disabled = false;
  }
}

scenarios.forEach((button) => {
  button.addEventListener("click", () => {
    selectedScenario = button.dataset.scenario;
    scenarioLabel.textContent = selectedScenario;
    scenarios.forEach((item) => item.classList.toggle("is-active", item === button));
    setStatus("Idle", "Ready to run", `Selected ${selectedScenario}.`);
  });
});

runButton.addEventListener("click", runDemo);
