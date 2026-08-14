"use strict";

const TOAST_DEFAULT_DURATION = 2600;
const TOAST_MAX_VISIBLE = 3;
const TOAST_EXIT_DURATION = 220;
const TOAST_TYPES = new Set(["normal", "success", "warning", "major"]);

const ToastNotifications = (() => {
  const activeToasts = [];

  function region() {
    return document.querySelector("#toast-region");
  }

  function show(options = {}) {
    const toastRegion = region();
    if (!toastRegion) {
      return null;
    }

    const type = TOAST_TYPES.has(options.type) ? options.type : "normal";
    const title = String(options.title ?? "").trim();
    const message = String(options.message ?? "").trim();
    const duration = Number.isFinite(Number(options.duration))
      ? Math.max(800, Number(options.duration))
      : TOAST_DEFAULT_DURATION;
    const toast = document.createElement("article");
    toast.className = `toast toast-${type} is-entering`;
    toast.setAttribute("role", type === "warning" ? "alert" : "status");
    toast.setAttribute("aria-atomic", "true");

    const icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = ({
      normal: "·",
      success: "✓",
      warning: "!",
      major: "✦",
    })[type];

    const copy = document.createElement("span");
    copy.className = "toast-copy";
    if (title) {
      const titleElement = document.createElement("strong");
      titleElement.className = "toast-title";
      titleElement.textContent = title;
      copy.append(titleElement);
    }
    if (message) {
      const messageElement = document.createElement("span");
      messageElement.className = "toast-message";
      messageElement.textContent = message;
      copy.append(messageElement);
    }
    toast.append(icon, copy);
    toastRegion.append(toast);

    const entry = { toast, timer: null, removalTimer: null };
    activeToasts.push(entry);
    while (activeToasts.length > TOAST_MAX_VISIBLE) {
      dismiss(activeToasts[0], true);
    }

    window.requestAnimationFrame(() => {
      if (toast.isConnected) {
        toast.classList.remove("is-entering");
      }
    });
    entry.timer = window.setTimeout(() => dismiss(entry), duration);
    return toast;
  }

  function dismiss(entry, immediate = false) {
    if (!entry || !activeToasts.includes(entry)) {
      return;
    }
    activeToasts.splice(activeToasts.indexOf(entry), 1);
    if (entry.timer !== null) {
      window.clearTimeout(entry.timer);
      entry.timer = null;
    }

    if (immediate) {
      entry.toast.remove();
      return;
    }

    entry.toast.classList.add("is-leaving");
    entry.removalTimer = window.setTimeout(() => {
      entry.toast.remove();
      entry.removalTimer = null;
    }, TOAST_EXIT_DURATION);
  }

  function dismissAll() {
    [...activeToasts].forEach((entry) => dismiss(entry, true));
    // A toast whose lifetime timer has already removed its registry entry can
    // still be in its short exit animation. Clear that orphaned DOM too.
    region()?.querySelectorAll(".toast").forEach((toast) => toast.remove());
  }

  return Object.freeze({ show, dismiss, dismissAll });
})();

function showToast(options) {
  return ToastNotifications.show(options);
}
