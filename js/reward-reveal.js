"use strict";

// Reward reveals are deliberately kept outside the screen renderers. The game
// can rebuild an encounter, combat, or travel panel while this host remains
// stable and owns only the short-lived receiving-a-reward moment.
const REWARD_REVEAL_TIMINGS = Object.freeze({
  minor: Object.freeze({ impactMs: 0, holdMs: 820, exitMs: 160 }),
  normal: Object.freeze({ impactMs: 280, holdMs: 1_300, exitMs: 200 }),
  major: Object.freeze({ impactMs: 320, holdMs: 1_850, exitMs: 260 }),
});

const RewardRevealSystem = (() => {
  let pending = [];
  let active = null;
  let timerId = null;
  let lifecycleToken = 0;
  let sequence = 0;
  let contextKey = null;
  const seenEventIds = new Set();

  function host() {
    return document.querySelector("#reward-reveal-host");
  }

  function reducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  }

  function rewardPresentationSettings() {
    return typeof GLOBAL_SETTINGS !== "undefined"
      ? GLOBAL_SETTINGS.rewardPresentation ?? {}
      : {};
  }

  function holdDuration(tier) {
    const settings = rewardPresentationSettings();
    const configured = tier === "major"
      ? settings.majorHoldDurationMs
      : tier === "normal" ? settings.normalHoldDurationMs : settings.minorHoldDurationMs;
    return Number.isFinite(Number(configured)) && Number(configured) >= 0
      ? Number(configured)
      : REWARD_REVEAL_TIMINGS[tier]?.holdMs ?? 820;
  }

  function clearTimer() {
    if (timerId !== null) {
      window.clearTimeout(timerId);
      timerId = null;
    }
  }

  function setBlocking(blocking) {
    const revealHost = host();
    revealHost?.classList.toggle("is-blocking", blocking);
    revealHost?.setAttribute("aria-busy", String(blocking));
  }

  function resetHost() {
    const revealHost = host();
    if (!revealHost) return;
    revealHost.className = "reward-reveal-host";
    revealHost.replaceChildren();
    revealHost.removeAttribute("data-tier");
    revealHost.removeAttribute("aria-busy");
    revealHost.removeAttribute("aria-label");
  }

  function cancel(options = {}) {
    lifecycleToken += 1;
    clearTimer();
    pending = [];
    active = null;
    resetHost();
    if (options.resetSeen === true) seenEventIds.clear();
    if (options.keepContext !== true) contextKey = null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeTier(tier) {
    return Object.prototype.hasOwnProperty.call(REWARD_REVEAL_TIMINGS, tier)
      ? tier
      : "minor";
  }

  function modelKey(model) {
    return [model.type, model.itemId, model.materialId, model.recipeId, model.abilityId, model.knowledgeId].filter(Boolean).join(":")
      || String(model.name ?? "reward");
  }

  function groupMinorRewards(models) {
    const grouped = new Map();
    models.forEach((model) => {
      const key = modelKey(model);
      const previous = grouped.get(key);
      if (previous) {
        previous.quantity += Math.max(0, Number(model.quantity) || 0);
      } else {
        grouped.set(key, { ...model, quantity: Math.max(0, Number(model.quantity) || 0) });
      }
    });
    return [...grouped.values()];
  }

  function minorAnnouncement(models) {
    const labels = models.map((model) => {
      const quantity = Math.max(0, Number(model.quantity) || 0);
      return `${quantity} ${model.name}`;
    });
    if (labels.length === 1) return `Found ${labels[0]}.`;
    if (labels.length === 2) return `Found ${labels[0]} and ${labels[1]}.`;
    return `Found ${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}.`;
  }

  function iconMarkup(model, className = "") {
    return `<span class="reward-reveal-icon ${className}" aria-hidden="true">${model.iconHtml ?? ""}</span>`;
  }

  function renderMinor(entry) {
    const items = entry.items.map((model) => `
      <span class="reward-reveal-minor-item">
        ${iconMarkup(model)}
        <span><strong>+${Math.max(0, Number(model.quantity) || 0)}</strong> ${escapeHtml(model.name)}</span>
      </span>`).join("");
    return `<div class="reward-reveal-minor-chip" role="status">
      <span class="reward-reveal-minor-kicker">Found</span>
      <span class="reward-reveal-minor-list">${items}</span>
    </div>`;
  }

  function renderCard(model) {
    const tier = normalizeTier(model.tier);
    const quantity = Math.max(0, Number(model.quantity) || 0);
    const quantityLabel = quantity > 1 ? `×${quantity}` : "";
    return `<article class="reward-reveal-card tier-${tier} rarity-${escapeHtml(model.rarity ?? "common")}" role="status">
      <span class="reward-reveal-kicker">${escapeHtml(model.revealLabel ?? "Found")}</span>
      <div class="reward-reveal-medallion">${iconMarkup(model, "is-large")}</div>
      <strong class="reward-reveal-name">${escapeHtml(model.name)}</strong>
      <span class="reward-reveal-meta">${escapeHtml(model.rarityName ?? "Common")} · ${escapeHtml(model.categoryLabel ?? "Item")}</span>
      ${quantityLabel ? `<strong class="reward-reveal-quantity">${quantityLabel}</strong>` : ""}
      <p class="reward-reveal-description">${escapeHtml(model.description ?? "A discovery from the road.")}</p>
    </article>`;
  }

  function renderEntry(entry) {
    return entry.tier === "minor" ? renderMinor(entry) : renderCard(entry.model);
  }

  function finishEntry(token) {
    if (token !== lifecycleToken) return;
    const revealHost = host();
    if (revealHost) revealHost.classList.add("is-exiting");
    const exitMs = reducedMotion() ? 80 : (REWARD_REVEAL_TIMINGS[active.tier]?.exitMs ?? 160);
    timerId = window.setTimeout(() => {
      if (token !== lifecycleToken) return;
      clearTimer();
      active = null;
      resetHost();
      pump();
    }, exitMs);
  }

  function presentEntry(entry, token) {
    if (token !== lifecycleToken) return;
    const revealHost = host();
    if (!revealHost) {
      active = null;
      pump();
      return;
    }

    const tier = normalizeTier(entry.tier);
    active = { ...entry, tier };
    revealHost.className = `reward-reveal-host is-visible is-${tier}`;
    revealHost.dataset.tier = tier;
    revealHost.setAttribute("aria-live", "polite");
    revealHost.setAttribute("aria-label", entry.announcement ?? entry.model?.announcement ?? "Reward received.");
    revealHost.setAttribute("aria-busy", "true");
    revealHost.innerHTML = renderEntry(entry);
    setBlocking(tier !== "minor");

    const model = entry.model ?? entry.items?.[0];
    const settings = rewardPresentationSettings();
    const directSfxId = model?.sfxId;
    const discoverySfxId = model?.firstDiscovery && typeof GLOBAL_SETTINGS !== "undefined"
      ? GLOBAL_SETTINGS.firstDiscovery?.sfxId
      : null;
    const globalSfxId = tier === "major" ? settings.majorLootSfxId : settings.defaultLootSfxId;
    const soundRole = model?.soundRole ?? "loot";
    if (typeof AudioManager !== "undefined") {
      const candidates = [directSfxId, discoverySfxId, globalSfxId].filter(Boolean);
      const played = candidates.some((sfxId) => AudioManager.playSfx(sfxId));
      if (!played) AudioManager.playSemantic(soundRole);
    }
    window.requestAnimationFrame(() => {
      if (token === lifecycleToken) revealHost.classList.add("is-presented");
    });

    const holdMs = reducedMotion() ? (tier === "minor" ? 420 : 720) : holdDuration(tier);
    timerId = window.setTimeout(() => finishEntry(token), holdMs);
  }

  function pump() {
    if (active || pending.length === 0) {
      if (!active && pending.length === 0) setBlocking(false);
      return;
    }
    const entry = pending.shift();
    const tier = normalizeTier(entry.tier);
    active = { ...entry, tier };
    setBlocking(tier !== "minor");
    const token = ++lifecycleToken;
    const impactMs = reducedMotion() ? 0 : (REWARD_REVEAL_TIMINGS[tier]?.impactMs ?? 0);
    if (impactMs <= 0) {
      presentEntry(entry, token);
      return;
    }
    timerId = window.setTimeout(() => {
      clearTimer();
      presentEntry(entry, token);
    }, impactMs);
  }

  function queue(models = [], options = {}) {
    const usableModels = (Array.isArray(models) ? models : [])
      .filter((model) => model && Number(model.quantity) > 0)
      .map((model) => ({ ...model, tier: normalizeTier(model.tier) }));
    if (usableModels.length === 0) return false;

    const nextContextKey = String(options.contextKey ?? "global");
    if (contextKey !== null && contextKey !== nextContextKey) {
      cancel({ keepContext: true });
    }
    contextKey = nextContextKey;

    const eventId = String(options.eventId ?? `reward-event-${++sequence}`);
    if (seenEventIds.has(eventId)) return false;
    seenEventIds.add(eventId);

    const minorModels = groupMinorRewards(usableModels.filter((model) => model.tier === "minor"));
    const entries = [];
    if (minorModels.length > 0) {
      entries.push({
        tier: "minor",
        items: minorModels,
        announcement: minorAnnouncement(minorModels),
      });
    }
    usableModels
      .filter((model) => model.tier !== "minor")
      .forEach((model) => entries.push({
        tier: model.tier,
        model,
        announcement: model.announcement ?? `Found ${model.name}.`,
      }));
    pending.push(...entries);
    pump();
    return true;
  }

  return Object.freeze({
    queue,
    cancel,
    isBlocking: () => Boolean(active && active.tier !== "minor"),
    pendingCount: () => pending.length + (active ? 1 : 0),
  });
})();
