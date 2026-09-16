const buttons = [...document.querySelectorAll(".scenario")];
const runButton = document.querySelector("#run");
const status = document.querySelector("#status");
const brandName = document.querySelector("#brand-name");
const brandLink = document.querySelector("#brand-link");
const scenarioControl = document.querySelector("#scenario-control");
const runtimeNote = document.querySelector("#runtime-note");
const boundary = document.querySelector("#poc-boundary");
let selectedScenario = "escalate";

const fields = {
  agent: document.querySelector("#agent"),
  decision: document.querySelector("#decision"),
  verdict: document.querySelector("#verdict"),
  audit: document.querySelector("#audit"),
  canonical: document.querySelector("#canonical"),
  original: document.querySelector("#original"),
  effective: document.querySelector("#effective"),
  raw: document.querySelector("#raw"),
  receipt: document.querySelector("#receipt"),
  root: document.querySelector("#root"),
  tx: document.querySelector("#tx"),
  amount: document.querySelector("#amount")
};

function compact(value, length = 14) {
  const text = String(value ?? "-");
  return text.length > length * 2 ? `${text.slice(0, length)}...${text.slice(-length)}` : text;
}

function setStatus(title, detail, kind = "") {
  status.className = `status ${kind}`;
  status.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
}

function render(result) {
  fields.agent.textContent = result.agent.id;
  fields.decision.textContent = result.vorim.decisionId;
  fields.verdict.textContent = `${result.vorim.verdict} / ${result.vorim.approvalAlgorithm}`;
  fields.audit.textContent = String(result.vorim.signedActionRecords);
  fields.canonical.textContent = result.privacy.canonicalization;
  fields.original.textContent = compact(result.privacy.originalPayloadDigest, 18);
  fields.effective.textContent = compact(result.privacy.effectivePayloadDigest, 18);
  fields.raw.textContent = result.privacy.rawPayloadPublishedToZeko ? "No" : "Never";
  fields.receipt.textContent = compact(result.zeko.receiptCommitment, 18);
  fields.root.textContent = compact(result.zeko.missionRoot, 18);
  fields.tx.textContent = compact(result.zeko.localAdapterTransaction, 18);
  fields.amount.textContent = `${result.x402.amountNativeUnits} ${result.x402.asset}`;
}

async function loadConfig() {
  const response = await fetch("/api/config");
  if (!response.ok) return;
  const config = await response.json();
  brandName.textContent = config.brand.name;
  if (config.brand.homeUrl) brandLink.href = config.brand.homeUrl;
  document.title = `Kent HOA x ${config.brand.name}: governed agent action`;
  if (config.runtimeMode === "vorim-sdk") {
    scenarioControl.hidden = true;
    runtimeNote.textContent = "Live Vorim SDK mode: Vorim supplies the real decision and signed record; this interface does not simulate either.";
    boundary.innerHTML = "<strong>Integration mode:</strong> Vorim's SDK supplies the agent identity, runtime decision, and signed records. The local adapter zkApp remains a POC anchor until the production MissionRegistry settlement path is configured.";
  }
}

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedScenario = button.dataset.scenario;
    buttons.forEach((item) => item.classList.toggle("is-active", item === button));
    setStatus("Ready", `${selectedScenario} selected.`);
  });
});

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  setStatus("Running", "Checking authority and waiting for the separate approval binding before anchoring the record.", "running");
  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario: selectedScenario })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "The action did not settle.");
    render(result);
    setStatus("Recorded", "The approved action is represented by commitments, not HOA records.", "success");
  } catch (error) {
    setStatus("Stopped", error instanceof Error ? error.message : String(error), "error");
  } finally {
    runButton.disabled = false;
  }
});

loadConfig().catch(() => {});
