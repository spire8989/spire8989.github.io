"use strict";

if (new URLSearchParams(window.location.search).has("sim")) {
  initializeSimulationTools();
}

function initializeSimulationTools() {
  const panel = document.createElement("aside");
  panel.className = "simulation-tools";
  panel.setAttribute("aria-label", "Expedition simulation tools");
  panel.innerHTML = `
    <header><div><small>Developer tools</small><h2>Expedition Simulator</h2></div>
      <button type="button" data-sim-action="close" aria-label="Close simulation tools">×</button></header>
    <div class="simulation-controls">
      <label>Runs <input id="sim-runs" type="number" min="1" max="10000" value="100"></label>
      <label>Strategy <select id="sim-strategy">
        ${Object.keys(SimulationStrategies).map((name) => `<option value="${name}">${name}</option>`).join("")}
      </select></label>
      <label>Turn at distance <input id="sim-distance" type="number" min="1" value="50"></label>
      <button type="button" data-sim-action="current">Run current loadout</button>
      <button type="button" data-sim-action="suite">Run standard suite</button>
      <button type="button" data-sim-action="distribution">Encounter distribution</button>
    </div>
    <p id="sim-status" class="simulation-status">Ready. Runs execute without rendering gameplay.</p>
    <pre id="sim-summary" class="simulation-summary"></pre>
    <div class="simulation-inspect" hidden>
      <label>Inspect run <select id="sim-run-select"></select></label>
      <details><summary>Run telemetry</summary><pre id="sim-run-detail"></pre></details>
      <div><button type="button" data-sim-action="json">Download JSON</button>
        <button type="button" data-sim-action="csv">Download CSV</button></div>
    </div>
    <hr>
    <h3>Campaign Simulation</h3>
    <div class="simulation-controls campaign-simulation-controls">
      <label>Campaigns <input id="campaign-count" type="number" min="1" max="1000" value="100"></label>
      <label>Expeditions <input id="campaign-expeditions" type="number" min="1" max="100" value="10"></label>
      <label>Strategy <select id="campaign-strategy">
        ${Object.keys(SimulationStrategies).map((name) => `<option value="${name}">${name}</option>`).join("")}
      </select></label>
      <label>Between runs <select id="campaign-policy">
        ${Object.keys(BetweenExpeditionPolicies).map((name) => `<option value="${name}">${name}</option>`).join("")}
      </select></label>
      <label>Turn at <input id="campaign-distance" type="number" min="1" value="50"></label>
      <label>Starting gold <input id="campaign-gold" type="number" min="0" value="${Math.floor(game.player.currentGold)}"></label>
      <label>Starting food <input id="campaign-provisions" type="number" min="0" value="${game.player.provisions}"></label>
      <label>Starting health <input id="campaign-health" type="number" min="1" max="${HealingRules.arthurMaxHealth(game.player)}" value="${HealingRules.arthurHealth(game.player)}"></label>
      <label><input id="campaign-healing" type="checkbox" checked> Healing enabled</label>
      <button type="button" data-sim-action="campaign-current">Run current campaign</button>
      <button type="button" data-sim-action="campaign-batch">Run campaign batch</button>
    </div>
    <p id="campaign-status" class="simulation-status">Ready for repeated expeditions.</p>
    <pre id="campaign-summary" class="simulation-summary"></pre>
    <div class="campaign-inspect" hidden>
      <label>Inspect campaign <select id="campaign-run-select"></select></label>
      <details><summary>Campaign timeline</summary><pre id="campaign-run-detail"></pre></details>
      <div><button type="button" data-sim-action="campaign-json">Download campaign JSON</button>
        <button type="button" data-sim-action="campaign-compact-json">Download Compact JSON</button>
        <button type="button" data-sim-action="campaign-csv">Campaign CSV</button>
        <button type="button" data-sim-action="campaign-expedition-csv">Expedition CSV</button></div>
    </div>`;
  document.body.append(panel);
  let lastBatch = null;
  let lastCampaignBatch = null;

  panel.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-sim-action]")?.dataset.simAction;
    if (!action) return;
    if (action === "close") {
      panel.remove();
      return;
    }
    if (action === "json" && lastBatch) downloadSimulationFile(
      "grail-simulations.json", SimulationTelemetry.toJson(lastBatch), "application/json",
    );
    if (action === "csv" && lastBatch) downloadSimulationFile(
      "grail-simulations.csv", SimulationTelemetry.toCsv(lastBatch), "text/csv",
    );
    if (action === "campaign-json" && lastCampaignBatch) downloadSimulationFile(
      "grail-campaigns.json", CampaignSimulationTelemetry.toJson(lastCampaignBatch), "application/json",
    );
    if (action === "campaign-compact-json" && lastCampaignBatch) downloadSimulationFile(
      "grail-campaigns-compact.json",
      CampaignSimulationTelemetry.toCompactJson(lastCampaignBatch), "application/json",
    );
    if (action === "campaign-csv" && lastCampaignBatch) downloadSimulationFile(
      "grail-campaigns.csv", CampaignSimulationTelemetry.campaignsToCsv(lastCampaignBatch), "text/csv",
    );
    if (action === "campaign-expedition-csv" && lastCampaignBatch) downloadSimulationFile(
      "grail-campaign-expeditions.csv",
      CampaignSimulationTelemetry.expeditionsToCsv(lastCampaignBatch), "text/csv",
    );
    if (["campaign-current", "campaign-batch"].includes(action)) {
      const scenario = currentCampaignScenario(panel);
      const campaignCount = action === "campaign-current"
        ? 1 : Math.max(1, Number(panel.querySelector("#campaign-count").value) || 100);
      panel.querySelector("#campaign-status").textContent = `Running ${campaignCount} campaigns…`;
      event.target.disabled = true;
      try {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        lastCampaignBatch = CampaignSimulationRunner.runBatch({
          scenarios: [scenario], campaignsPerScenario: campaignCount,
        });
        renderCampaignBatch(panel, lastCampaignBatch);
      } finally {
        event.target.disabled = false;
      }
      return;
    }
    if (!["current", "suite", "distribution"].includes(action)) return;

    const runs = Math.max(1, Number(panel.querySelector("#sim-runs").value) || 100);
    const strategy = panel.querySelector("#sim-strategy").value;
    const distance = Math.max(1, Number(panel.querySelector("#sim-distance").value) || 50);
    const current = currentSimulationScenario(strategy, distance);
    const scenarios = action === "suite"
      ? Object.keys(SimulationStrategies).map((name) => ({ ...current, id: name, strategy: name }))
      : [current];
    const runsPerScenario = action === "distribution" ? Math.max(runs, 500) : runs;
    panel.querySelector("#sim-status").textContent = `Running ${scenarios.length * runsPerScenario} expeditions…`;
    event.target.disabled = true;
    try {
      lastBatch = await SimulationRunner.runBatchAsync({ scenarios, runsPerScenario, yieldEvery: 100 });
      renderSimulationBatch(panel, lastBatch);
    } finally {
      event.target.disabled = false;
    }
  });

  panel.querySelector("#sim-run-select").addEventListener("change", (event) => {
    const run = lastBatch?.results[Number(event.target.value)];
    panel.querySelector("#sim-run-detail").textContent = run ? JSON.stringify(run, null, 2) : "";
  });
  panel.querySelector("#campaign-run-select").addEventListener("change", (event) => {
    const campaign = lastCampaignBatch?.results[Number(event.target.value)];
    panel.querySelector("#campaign-run-detail").textContent = campaign
      ? JSON.stringify(campaign, null, 2) : "";
  });
}

function currentCampaignScenario(panel) {
  return {
    id: "current-campaign",
    seed: "browser-campaign",
    expeditions: Math.max(1, Number(panel.querySelector("#campaign-expeditions").value) || 10),
    strategy: panel.querySelector("#campaign-strategy").value,
    betweenExpeditionPolicy: panel.querySelector("#campaign-policy").value,
    turnaroundDistance: Math.max(1, Number(panel.querySelector("#campaign-distance").value) || 50),
    healingEnabled: panel.querySelector("#campaign-healing").checked,
    startingState: {
      ...JSON.parse(JSON.stringify(game.player)),
      currentGold: Math.max(0, Number(panel.querySelector("#campaign-gold").value) || 0),
      provisions: Math.max(0, Number(panel.querySelector("#campaign-provisions").value) || 0),
      arthurHealth: Math.min(
        HealingRules.arthurMaxHealth(game.player),
        Math.max(1, Number(panel.querySelector("#campaign-health").value) || 1),
      ),
    },
  };
}

function renderCampaignBatch(panel, batch) {
  const summary = batch.summary;
  panel.querySelector("#campaign-status").textContent = `${summary.totalCampaigns} campaigns in ${batch.durationMs.toFixed(1)} ms`;
  panel.querySelector("#campaign-summary").textContent = JSON.stringify(summary, null, 2);
  const inspect = panel.querySelector(".campaign-inspect");
  inspect.hidden = false;
  const select = panel.querySelector("#campaign-run-select");
  select.innerHTML = batch.results.map((campaign, index) => (
    `<option value="${index}">${index + 1}: ${campaign.stopReason} · ${campaign.expeditionsAttempted} runs · ${campaign.endingGold}g</option>`
  )).join("");
  panel.querySelector("#campaign-run-detail").textContent = JSON.stringify(batch.results[0], null, 2);
}

function currentSimulationScenario(strategy, distance) {
  return {
    id: "current-loadout",
    seed: "browser-current",
    companion: game.player.selectedCompanion,
    provisions: Math.min(game.preparationSupplies || 24, partyProvisionCapacity(game.player.selectedCompanion)),
    loadout: { ...game.player.equippedItems },
    packContents: [...game.player.packedItems],
    strategy,
    turnaroundPolicy: { type: "fixedDistance", distance },
    startingState: {
      ownedItems: { ...game.player.ownedItems },
      learnedKnowledge: [...game.player.learnedKnowledge],
      campaignFlags: { ...(game.player.campaignFlags ?? {}) },
      provisions: Math.max(game.player.provisions, game.preparationSupplies || 24),
    },
  };
}

function renderSimulationBatch(panel, batch) {
  const summary = batch.summary;
  panel.querySelector("#sim-status").textContent = `${summary.totalRuns} runs in ${batch.durationMs.toFixed(1)} ms`;
  panel.querySelector("#sim-summary").textContent = JSON.stringify({
    totalRuns: summary.totalRuns,
    returnRate: summary.returnRate,
    failureRate: summary.deathOrFailureRate,
    averageMaximumDistance: summary.averageMaximumDistance,
    averageHealthRemaining: summary.averageHealthRemaining,
    averageLootValue: summary.averageLootValue,
    averageEncounters: summary.averageEncounterCount,
    averageCombats: summary.averageCombatCount,
    mostFrequentEncounters: summary.encounters.slice(0, 8),
  }, null, 2);
  const inspect = panel.querySelector(".simulation-inspect");
  inspect.hidden = false;
  const select = panel.querySelector("#sim-run-select");
  select.innerHTML = batch.results.map((run, index) => (
    `<option value="${index}">${index + 1}: ${run.seed} · ${run.outcome} · ${run.maximumDistance}</option>`
  )).join("");
  panel.querySelector("#sim-run-detail").textContent = JSON.stringify(batch.results[0], null, 2);
}

function downloadSimulationFile(filename, contents, mimeType) {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
