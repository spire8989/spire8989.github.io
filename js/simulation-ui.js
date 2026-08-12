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
    </div>`;
  document.body.append(panel);
  let lastBatch = null;

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
