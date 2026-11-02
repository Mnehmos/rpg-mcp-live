/**
 * 3D mode's overlay: the scene is the whole game, so the DM speaks in a
 * dialog box over it, choices are dialog options, and a text box appears
 * only as an event, when the hero walks up to someone or something (or
 * presses T to do something else).
 */

function isFirstPerson(text) {
  return /^(i|i'm|i've|i'll|my)\b/i.test(text.trim());
}

/** Turns what the player typed at a person, feature or foe into their turn. */
export function composeEventTurn(target, typed) {
  var text = String(typed || "").trim();
  if (!target) return text;
  if (!text) return target.prompt;
  var name = target.name || target.label || "it";
  var isPerson = target.kind === "npc" || (target.kind === "feature" && target.shape === "person");
  if (isPerson) return isFirstPerson(text) ? text : "I say to " + name + ", \"" + text.replace(/^"|"$/g, "") + "\"";
  return isFirstPerson(text) ? text + " (at " + name + ")" : "At " + name + ": " + text;
}

/** The dialog shows plain prose: drop markdown emphasis and heading marks. */
export function plainProse(text) {
  return String(text || "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1$2")
    .replace(/(^|\W)_([^_\n]+)_(?!\w)/g, "$1$2")
    .replace(/^#{1,6}\s+/gm, "");
}

export function eventCopy(target) {
  if (!target) return { title: "Your move", placeholder: "What do you do?", quick: null };
  var name = target.name || target.label;
  var isPerson = target.kind === "npc" || (target.kind === "feature" && target.shape === "person");
  if (isPerson) return { title: name, placeholder: "What do you say to " + name + "?", quick: "Just talk" };
  if (target.kind === "enemy") return { title: name, placeholder: "What do you do about " + name + "?", quick: "Face them" };
  return { title: name, placeholder: "What do you do with " + name + "?", quick: "Examine it" };
}

export function createSceneDialog(root, options) {
  var onSend = options.onSend;
  var box = document.createElement("div");
  box.className = "scene-dialog";
  box.innerHTML =
    '<div class="scene-dialog-head"><span class="scene-dialog-speaker">THE DM</span><span class="scene-dialog-status"></span>' +
    '<button type="button" class="scene-dialog-toggle" aria-label="Hide the DM\'s words">▾</button></div>' +
    '<div class="scene-dialog-text" aria-live="polite"></div>' +
    '<div class="scene-dialog-moves"></div>' +
    '<div class="scene-dialog-choices"></div>';
  var eventBox = document.createElement("form");
  eventBox.className = "scene-event";
  eventBox.hidden = true;
  eventBox.innerHTML =
    '<p class="scene-event-title"></p><p class="scene-event-description"></p>' +
    '<textarea rows="2" maxlength="2000"></textarea>' +
    '<div class="scene-event-actions"><button type="button" class="scene-event-quick"></button>' +
    '<span class="scene-event-spacer"></span><button type="button" class="scene-event-cancel">Back <kbd>Esc</kbd></button>' +
    '<button type="submit" class="scene-event-send">Do it <kbd>Enter</kbd></button></div>';
  var actButton = document.createElement("button");
  actButton.type = "button";
  actButton.className = "scene-act";
  actButton.innerHTML = "<kbd>T</kbd> Do something else";
  root.appendChild(box);
  root.appendChild(eventBox);
  root.appendChild(actButton);

  var textNode = box.querySelector(".scene-dialog-text");
  var statusNode = box.querySelector(".scene-dialog-status");
  var movesNode = box.querySelector(".scene-dialog-moves");
  var choicesNode = box.querySelector(".scene-dialog-choices");
  var input = eventBox.querySelector("textarea");
  var busy = false;
  var eventTarget = null;
  var enabled = false;

  function send(text) {
    if (busy || !text) return;
    closeEvent();
    onSend(text);
  }

  function openEvent(target) {
    if (!enabled || busy) return;
    eventTarget = target || null;
    var copy = eventCopy(eventTarget);
    eventBox.querySelector(".scene-event-title").textContent = copy.title;
    var description = eventBox.querySelector(".scene-event-description");
    description.textContent = eventTarget && eventTarget.description ? eventTarget.description : "";
    description.hidden = !description.textContent;
    var quick = eventBox.querySelector(".scene-event-quick");
    quick.textContent = copy.quick || "";
    quick.hidden = !copy.quick;
    input.placeholder = copy.placeholder;
    input.value = "";
    eventBox.hidden = false;
    root.classList.add("has-event");
    input.focus();
  }

  function closeEvent() {
    eventBox.hidden = true;
    root.classList.remove("has-event");
    eventTarget = null;
    var canvas = root.querySelector(".scene-stage-canvas");
    if (canvas) canvas.focus({ preventScroll: true });
  }

  eventBox.addEventListener("submit", function (event) {
    event.preventDefault();
    send(composeEventTurn(eventTarget, input.value));
  });
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send(composeEventTurn(eventTarget, input.value));
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeEvent();
    }
  });
  eventBox.querySelector(".scene-event-quick").addEventListener("click", function () {
    if (eventTarget) send(eventTarget.prompt);
  });
  eventBox.querySelector(".scene-event-cancel").addEventListener("click", closeEvent);
  actButton.addEventListener("click", function () { openEvent(null); });
  box.querySelector(".scene-dialog-toggle").addEventListener("click", function () {
    box.classList.toggle("is-collapsed");
  });
  choicesNode.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-prompt]");
    if (button) send(button.dataset.prompt);
  });
  // T opens a free action while the scene has focus.
  var canvas = root.querySelector(".scene-stage-canvas");
  if (canvas) canvas.addEventListener("keydown", function (event) {
    if (enabled && event.code === "KeyT") {
      event.preventDefault();
      openEvent(null);
    }
  });

  return {
    setEnabled: function (value) {
      enabled = Boolean(value);
      box.hidden = !enabled;
      actButton.hidden = !enabled;
      if (!enabled) closeEvent();
    },
    setBusy: function (value) {
      busy = Boolean(value);
      root.classList.toggle("is-dm-busy", busy);
      statusNode.textContent = busy ? "thinking…" : "";
      actButton.disabled = busy;
      choicesNode.querySelectorAll("button").forEach(function (button) { button.disabled = busy; });
      if (!busy) movesNode.textContent = "";
    },
    /** The DM's words: the latest page, or the turn streaming in. */
    showNarration: function (text) {
      box.classList.remove("is-collapsed");
      textNode.textContent = plainProse(text);
      textNode.scrollTop = textNode.scrollHeight;
    },
    showStatus: function (message) {
      if (busy && message) statusNode.textContent = message.toLowerCase() + "…";
    },
    /** A table move the DM just made (a room built, a check rolled). */
    addMove: function (label) {
      var chip = document.createElement("span");
      chip.textContent = label;
      movesNode.appendChild(chip);
    },
    showChoices: function (choices) {
      choicesNode.innerHTML = "";
      (choices || []).forEach(function (choice) {
        var button = document.createElement("button");
        button.type = "button";
        button.dataset.prompt = choice.prompt;
        button.textContent = choice.label;
        button.title = choice.prompt;
        button.disabled = busy;
        choicesNode.appendChild(button);
      });
    },
    openEvent: openEvent,
  };
}
