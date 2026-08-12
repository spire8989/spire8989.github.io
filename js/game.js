"use strict";

// Keeping state in one object gives future gameplay systems a predictable home.
const gameState = {
  elapsedSeconds: 0,
  questBegun: false,
};

const ui = {
  beginButton: null,
  message: null,
};

function initializeGame() {
  ui.beginButton = document.querySelector("#begin-button");
  ui.message = document.querySelector("#game-message");

  if (!ui.beginButton || !ui.message) {
    throw new Error("Required game UI elements were not found.");
  }

  bindInput();
  requestAnimationFrame(gameLoop);
}

function bindInput() {
  // Pointer events use one input path for a mouse, pen, or touchscreen.
  ui.beginButton.addEventListener("pointerdown", handlePointerDown);
  ui.beginButton.addEventListener("pointerup", handlePointerEnd);
  ui.beginButton.addEventListener("pointercancel", handlePointerEnd);
  ui.beginButton.addEventListener("lostpointercapture", handlePointerEnd);
  ui.beginButton.addEventListener("click", beginQuest);
}

function handlePointerDown(event) {
  ui.beginButton.setPointerCapture(event.pointerId);
  ui.beginButton.classList.add("is-pressed");
}

function handlePointerEnd() {
  ui.beginButton.classList.remove("is-pressed");
}

function beginQuest() {
  gameState.questBegun = true;
  ui.beginButton.classList.add("is-confirmed");
  ui.beginButton.textContent = "Quest Accepted!";
  ui.message.textContent = "The knights prepare to depart for the Grail.";
}

function update(deltaSeconds) {
  gameState.elapsedSeconds += deltaSeconds;

  // Future gameplay simulation belongs here.
}

function render() {
  // Future canvas or DOM presentation updates belong here.
  // Static HTML/CSS already renders the current placeholder screen.
}

let previousTimestamp = null;

function gameLoop(timestamp) {
  if (previousTimestamp === null) {
    previousTimestamp = timestamp;
  }

  const elapsedMilliseconds = timestamp - previousTimestamp;
  previousTimestamp = timestamp;

  // Clamp long pauses (for example, switching tabs) to keep simulation stable.
  const deltaSeconds = Math.min(elapsedMilliseconds / 1000, 0.1);

  update(deltaSeconds);
  render();
  requestAnimationFrame(gameLoop);
}

initializeGame();
