import {
  reconcileAbilityScoreAssignments,
  uniqueAbilityScoreOptions,
} from "./ability-score-pool.js";
import {
  activeCampaignStorageKey,
  campaignSessionUrl,
  isCurrentCampaignSelection,
  isConfirmedMissingCommand,
  isCurrentRequest,
  isPendingCommandConflict,
  isPendingCommandForCampaign,
  isPendingCommandResponseCurrent,
  nextRequestSequence,
  pendingCommandStorageKey,
  retryDelayMs,
  shouldRetryCampaignLoad,
} from "./campaign-resume.js";
import {
  composerSubmission,
  settleComposer,
  updateComposerCounter,
} from "./turn-composer.js";
import { isStaleCommandStatus } from "./command-status.js";
import { projectCustodyActors } from "./custody-status.mjs";

(function () {
  "use strict";

  var state = { config: null, clerk: null, session: null, engineState: null, engineBackend: null, campaigns: [], subscription: null, setupRequired: false, managerOpen: false, createMode: false, pendingPlayerText: null, pendingDeleteCampaignId: null, pendingDeleteCampaignName: null, userButtonMounted: false, characterOptions: null, characterOptionsCampaignId: null, characterOptionsLoading: null, characterOptionsLoadingCampaignId: null, contentCatalog: null, contentCatalogLoading: null, openingLoadingCampaignId: null, suggestedActions: [], sessionRefreshSequence: 0, campaignLoadSequence: 0, pendingCampaignLoadId: null };
  var $ = function (selector) { return document.querySelector(selector); };

  function showToast(message) {
    var toast = $("#toast");
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () { toast.hidden = true; }, 4200);
  }

  function setStatus(message, status) {
    var statusNode = $("#session-status");
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.dataset.state = status || "";
  }

  function currentUserId() {
    if (state.clerk && state.clerk.user && state.clerk.user.id) return state.clerk.user.id;
    if (state.config && state.config.devAuthBypass) return "dev";
    return "";
  }

  function readActiveCampaignId() {
    try {
      return window.localStorage.getItem(activeCampaignStorageKey(currentUserId())) || "";
    } catch (_error) {
      return "";
    }
  }

  function writeActiveCampaignId(campaignId) {
    var normalizedCampaignId = String(campaignId || "").trim();
    if (!normalizedCampaignId) return;
    try {
      window.localStorage.setItem(activeCampaignStorageKey(currentUserId()), normalizedCampaignId);
    } catch (_error) {
      // Storage can be disabled by privacy settings; session hydration still works.
    }
  }

  function clearActiveCampaignId() {
    try {
      window.localStorage.removeItem(activeCampaignStorageKey(currentUserId()));
    } catch (_error) {
      // Storage can be disabled by privacy settings; session hydration still works.
    }
  }

  function readPendingCommand() {
    try {
      var raw = window.localStorage.getItem(pendingCommandStorageKey(currentUserId()));
      if (!raw) return null;
      var record = JSON.parse(raw);
      if (!record || !record.campaignId || !record.clientCommandId) {
        window.localStorage.removeItem(pendingCommandStorageKey(currentUserId()));
        return null;
      }
      return {
        campaignId: String(record.campaignId),
        clientCommandId: String(record.clientCommandId),
        playerText: String(record.playerText || "")
      };
    } catch (_error) {
      return null;
    }
  }

  function writePendingCommand(record) {
    if (!record || !record.campaignId || !record.clientCommandId) return;
    try {
      window.localStorage.setItem(pendingCommandStorageKey(currentUserId()), JSON.stringify({
        campaignId: String(record.campaignId),
        clientCommandId: String(record.clientCommandId),
        playerText: String(record.playerText || "")
      }));
    } catch (_error) {
      // Storage can be disabled; the in-memory reconciliation path still works.
    }
  }

  function clearPendingCommand(clientCommandId) {
    try {
      var record = readPendingCommand();
      if (!record || !clientCommandId || record.clientCommandId === clientCommandId) {
        window.localStorage.removeItem(pendingCommandStorageKey(currentUserId()));
      }
    } catch (_error) {
      // Storage can be disabled; the in-memory reconciliation path still works.
    }
  }

  function clearPendingCommandForCampaign(campaignId) {
    var pendingCommand = readPendingCommand();
    if (!isPendingCommandForCampaign(pendingCommand, campaignId)) return;
    clearPendingCommand(pendingCommand.clientCommandId);
    state.pendingPlayerText = null;
  }

  function isCurrentPendingCommand(campaignId, clientCommandId) {
    return Boolean(state.session && state.session.id === campaignId
      && isPendingCommandResponseCurrent(readPendingCommand(), campaignId, clientCommandId));
  }

  function waitForCampaignRetry(attempt) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, retryDelayMs(attempt));
    });
  }

  function requestJson(url, options) {
    return fetch(url, Object.assign({ headers: { "Content-Type": "application/json" } }, options || {}))
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          return { response: response, data: data };
        });
      });
  }

  function loadScript(source, attributes) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = source;
      script.async = true;
      script.crossOrigin = "anonymous";
      Object.keys(attributes || {}).forEach(function (key) { script.setAttribute(key, attributes[key]); });
      script.onload = resolve;
      script.onerror = function () { reject(new Error("Unable to load authentication UI")); };
      document.head.appendChild(script);
    });
  }

  function clerkDomainFromKey(publishableKey) {
    try {
      return window.atob(publishableKey.split("_")[2]).slice(0, -1);
    } catch (_error) {
      return null;
    }
  }

  function openAuth() {
    if (isSignedIn()) {
      if (state.session) {
        state.managerOpen = true;
        state.createMode = false;
        renderOnboarding({ session: state.session, state: state.engineState, campaigns: state.campaigns });
      } else {
        refreshSession();
      }
      return;
    }
    var dialog = $("#auth-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.hidden = false;
    if (state.clerk && !state.clerk.isSignedIn && !$("#auth-mount").children.length) {
      state.clerk.mountSignIn($("#auth-mount"));
    }
  }

  function closeAuth() {
    var dialog = $("#auth-dialog");
    if (typeof dialog.close === "function") dialog.close();
    else dialog.hidden = true;
  }

  function renderIdentity() {
    var userButton = $("#user-button");
    var authState = $("#auth-state");
    var signInLinks = document.querySelectorAll('[data-action="open-auth"]');
    var setSignInLinkText = function (text) { signInLinks.forEach(function (link) { link.textContent = text; }); };
    if (state.clerk && state.clerk.isSignedIn) {
      userButton.hidden = false;
      if (!state.userButtonMounted) {
        state.clerk.mountUserButton(userButton);
        state.userButtonMounted = true;
      }
      authState.textContent = "Campaign saved to your account";
      setSignInLinkText("Manage campaigns");
    } else if (state.config && state.config.devAuthBypass) {
      authState.textContent = "Local player preview · saved locally";
      setSignInLinkText("Sign in when ready");
    } else {
      userButton.hidden = true;
      authState.textContent = "Sign in to save your campaign";
      setSignInLinkText("Sign in to save your campaign");
    }
  }

  function titleCase(value) {
    return String(value || "").replace(/(^|[-_ ])([a-z])/g, function (_match, prefix, character) {
      return prefix + character.toUpperCase();
    });
  }

  function setMarkdown(selector, value, fallback) {
    var node = $(selector);
    if (!node) return;
    var resolved = value === undefined || value === null || value === "" ? (fallback || "") : String(value);
    node.innerHTML = resolved ? renderMarkdown(resolved) : "";
  }

  function setText(selector, value, fallback) {
    var node = $(selector);
    if (node) node.textContent = value === undefined || value === null || value === "" ? (fallback || "—") : String(value);
  }

  function fillCharacterSelect(selector, options) {
    var select = $(selector);
    if (!select) return;
    var previous = select.value;
    select.innerHTML = options.map(function (option) {
      return '<option value="' + escapeHtml(option.contentKey) + '">' + escapeHtml(option.name) + '</option>';
    }).join("");
    select.disabled = options.length === 0;
    select.value = options.some(function (option) { return option.contentKey === previous; })
      ? previous
      : options[0] && options[0].contentKey || "";
  }

  function findCharacterOption(collection, contentKey) {
    var options = state.characterOptions && state.characterOptions[collection];
    return Array.isArray(options)
      ? options.find(function (option) { return option.contentKey === contentKey; }) || null
      : null;
  }

  function checkedCharacterValues(selector) {
    return Array.from(document.querySelectorAll(selector + ' input[type="checkbox"]:checked')).map(function (input) {
      return input.value;
    });
  }

  function choiceOptionHtml(option, checked, suffix, choiceCount, groupName) {
    var inputType = Number(choiceCount) === 1 ? "radio" : "checkbox";
    var inputName = inputType === "radio" ? ' name="' + escapeHtml(groupName || "character-choice") + '"' : "";
    return '<label class="character-choice-option"><input type="' + inputType + '"' + inputName + ' value="' + escapeHtml(option.contentKey || option.value) + '"' + (checked ? ' checked' : '') + '><span>' + escapeHtml(option.name) + '</span>' + (suffix ? '<small>' + escapeHtml(suffix) + '</small>' : '') + '</label>';
  }

  function enforceCharacterChoiceLimit(optionsSelector) {
    var options = $(optionsSelector);
    if (!options) return;
    var max = Number(options.dataset.maxSelections || 0);
    if (max <= 1) return;
    var inputs = Array.from(options.querySelectorAll('input[type="checkbox"]'));
    var selected = inputs.filter(function (input) { return input.checked; }).length;
    inputs.forEach(function (input) {
      input.disabled = !input.checked && selected >= max;
    });
  }

  function renderCharacterChoicePanel(panelSelector, helpSelector, optionsSelector, help, html, visible, choiceCount) {
    var panel = $(panelSelector);
    var options = $(optionsSelector);
    if (panel) panel.hidden = !visible;
    setText(helpSelector, help, "");
    if (options) {
      options.dataset.maxSelections = String(choiceCount || 0);
      options.innerHTML = html;
      enforceCharacterChoiceLimit(optionsSelector);
    }
  }

  var TOOL_CHOICE_CATALOG = {
    gaming: ["Dice Set", "Dragonchess Set", "Playing Card Set", "Three-Dragon Ante Set"],
    musical: ["Bagpipes", "Drum", "Dulcimer", "Flute", "Lute", "Lyre", "Horn", "Pan Flute", "Shawm", "Viol"],
    artisan: ["Alchemist's Supplies", "Brewer's Supplies", "Calligrapher's Supplies", "Carpenter's Tools", "Cartographer's Tools", "Cobbler's Tools", "Cook's Utensils", "Glassblower's Tools", "Jeweler's Tools", "Leatherworker's Tools", "Mason's Tools", "Painter's Supplies", "Potter's Tools", "Smith's Tools", "Tinker's Tools", "Weaver's Tools", "Woodcarver's Tools"],
    kits: ["Disguise Kit", "Forgery Kit", "Herbalism Kit", "Navigator's Tools", "Poisoner's Kit", "Thieves' Tools"],
    vehicles: ["Vehicles (Land)", "Vehicles (Water)"],
  };

  TOOL_CHOICE_CATALOG.all = TOOL_CHOICE_CATALOG.artisan
    .concat(TOOL_CHOICE_CATALOG.gaming)
    .concat(TOOL_CHOICE_CATALOG.kits)
    .concat(TOOL_CHOICE_CATALOG.musical)
    .concat(TOOL_CHOICE_CATALOG.vehicles);

  function toolKey(value) {
    return String(value || "").trim().toLocaleLowerCase();
  }

  function uniqueToolOptions(options) {
    var seen = {};
    return options.map(function (value) { return String(value || "").trim(); }).filter(function (value) {
      var key = toolKey(value);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function toolChoiceOptions(choice, defaults) {
    var description = String(choice && choice.description || "").toLocaleLowerCase();
    var explicitOptions = Array.isArray(choice && choice.options) ? choice.options.filter(Boolean) : [];
    var options = explicitOptions.slice();
    if (!explicitOptions.length && description.indexOf("gaming set") !== -1) options = options.concat(TOOL_CHOICE_CATALOG.gaming);
    if (!explicitOptions.length && description.indexOf("musical instrument") !== -1) options = options.concat(TOOL_CHOICE_CATALOG.musical);
    if (!explicitOptions.length && (description.indexOf("artisan") !== -1 || description.indexOf("tools") !== -1)) options = options.concat(TOOL_CHOICE_CATALOG.artisan);
    if (!explicitOptions.length && description.indexOf("thieves") !== -1) options.push("Thieves' Tools");
    if (!explicitOptions.length && !options.length) options = options.concat(TOOL_CHOICE_CATALOG.all);
    return uniqueToolOptions(options.concat(defaults || []));
  }

  var TOOL_DESCRIPTIONS = {
    "bagpipes": "A reed-driven wind instrument used to make music.",
    "drum": "A percussion instrument used to keep rhythm.",
    "dulcimer": "A stringed instrument played by striking its strings.",
    "flute": "A small wind instrument played by blowing across an opening.",
    "lute": "A plucked string instrument with a rounded body.",
    "lyre": "A small harp-like string instrument.",
    "horn": "A brass wind instrument used for music and signals.",
    "pan flute": "A group of pipes of different lengths played by blowing across them.",
    "shawm": "A double-reed wind instrument with a strong voice.",
    "viol": "A bowed string instrument played between the knees.",
    "dice set": "A set of dice used for games of chance and strategy.",
    "dragonchess set": "A three-dimensional chess set from the Forgotten Realms.",
    "playing card set": "A deck of cards used for games and gambling.",
    "three-dragon ante set": "A deck used for the Three-Dragon Ante card game.",
    "thieves' tools": "Tools for opening locks and disabling traps.",
    "forgery kit": "Materials used to imitate documents, seals, and handwriting.",
    "disguise kit": "Cosmetics, clothing, and props used to alter an appearance.",
    "herbalism kit": "Tools for identifying and applying herbs, plants, and natural remedies.",
    "navigator's tools": "Instruments for plotting a course and determining position at sea.",
    "poisoner's kit": "Vials and tools for identifying, preparing, and handling poisons.",
    "vehicles (land)": "Proficiency for operating and handling land vehicles such as carts and wagons.",
    "vehicles (water)": "Proficiency for operating and handling water vehicles such as boats and ships.",
    "alchemist's supplies": "Flasks, chemicals, and tools for identifying and crafting substances.",
    "brewer's supplies": "Equipment for brewing and assessing ales, wines, and other drinks.",
    "calligrapher's supplies": "Inks, quills, parchment, and tools for fine writing.",
    "carpenter's tools": "Tools for building and repairing wooden objects.",
    "cartographer's tools": "Instruments for surveying and drawing maps.",
    "cobbler's tools": "Tools for making and repairing footwear.",
    "cook's utensils": "Pots, pans, knives, and other equipment for preparing food.",
    "glassblower's tools": "A furnace and tools for shaping molten glass.",
    "jeweler's tools": "Files, pliers, and other tools for crafting and inspecting gems.",
    "leatherworker's tools": "Tools for preparing and shaping leather.",
    "mason's tools": "Chisels, hammers, and measures for working stone.",
    "painter's supplies": "Brushes, pigments, and materials for painting.",
    "potter's tools": "Tools for shaping and firing clay.",
    "smith's tools": "Hammers, tongs, and tools for working metal.",
    "tinker's tools": "Fine tools for repairing and constructing small mechanisms.",
    "weaver's tools": "Tools for spinning, weaving, and repairing cloth.",
    "woodcarver's tools": "Knives and gouges for carving wood."
  };

  function describeTool(value) {
    return TOOL_DESCRIPTIONS[toolKey(value)] || "A tool proficiency granted by this class or background.";
  }

  function updateToolChoiceDescriptions() {
    document.querySelectorAll("#character-tool-choice-options select[data-tool-choice-source]").forEach(function (select) {
      var description = select.parentNode.querySelector(".character-tool-choice-description");
      if (description) description.textContent = describeTool(select.value);
    });
  }

  function priorToolSelections() {
    var prior = {};
    document.querySelectorAll("#character-tool-choice-options select[data-tool-choice-source]").forEach(function (select) {
      var source = select.dataset.toolChoiceSource;
      var index = select.dataset.toolChoiceIndex;
      if (source && index !== undefined) prior[source + ":" + index] = select.value;
    });
    return prior;
  }

  function renderToolChoiceFields(characterClass, background) {
    var panel = $("#character-tool-choice");
    var optionsNode = $("#character-tool-choice-options");
    if (!panel || !optionsNode) return;
    var classChoice = characterClass.toolChoice;
    var backgroundChoice = background.toolChoice;
    var classCount = Number(classChoice && classChoice.count || 0);
    var backgroundCount = Number(backgroundChoice && backgroundChoice.count || 0);
    var totalCount = classCount + backgroundCount;
    panel.hidden = totalCount === 0;
    optionsNode.innerHTML = "";
    if (!totalCount) {
      setText("#character-tool-choice-help", "", "");
      return;
    }

    var prior = priorToolSelections();
    var fixedTools = (characterClass.proficiencies && characterClass.proficiencies.tools || [])
      .concat(background.toolProficiencies || []);
    var used = fixedTools.map(toolKey);
    var html = "";

    function renderGroup(source, label, choice, count, defaults) {
      var allOptions = toolChoiceOptions(choice, defaults);
      for (var index = 0; index < count; index += 1) {
        var priorValue = prior[source + ":" + index] || "";
        var available = allOptions.filter(function (option) { return used.indexOf(toolKey(option)) === -1; });
        var selected = available.find(function (option) { return toolKey(option) === toolKey(priorValue); })
          || available.find(function (option) { return toolKey(option) === toolKey(defaults && defaults[index]); })
          || available[0]
          || "";
        if (selected) used.push(toolKey(selected));
        html += '<label class="character-tool-choice-field"><span>' + escapeHtml(label + " " + (index + 1)) + '</span><select data-tool-choice-source="' + escapeHtml(source) + '" data-tool-choice-index="' + index + '"' + (available.length ? "" : " disabled") + '>'
          + (available.length ? available.map(function (option) { return '<option value="' + escapeHtml(option) + '"' + (option === selected ? ' selected' : '') + '>' + escapeHtml(option) + '</option>'; }).join("") : '<option value="">No reviewed choices available</option>')
          + '</select><small class="character-tool-choice-description"></small></label>';
      }
    }

    renderGroup("class", "Class choice", classChoice, classCount, characterClass.defaultToolChoices || []);
    renderGroup("background", "Background choice", backgroundChoice, backgroundCount, []);
    optionsNode.innerHTML = html;
    updateToolChoiceDescriptions();
    setText(
      "#character-tool-choice-help",
      "Choose " + totalCount + " total. Class: " + classCount + "; background: " + backgroundCount + ". "
        + [classChoice && classChoice.description, backgroundChoice && backgroundChoice.description].filter(Boolean).join(" "),
      ""
    );
  }

  var ABILITY_SCORE_FIELDS = [
    { key: "str", label: "Strength", short: "STR" },
    { key: "dex", label: "Dexterity", short: "DEX" },
    { key: "con", label: "Constitution", short: "CON" },
    { key: "int", label: "Intelligence", short: "INT" },
    { key: "wis", label: "Wisdom", short: "WIS" },
    { key: "cha", label: "Charisma", short: "CHA" }
  ];
  var STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

  function scorePoolForMethod(method) {
    if (method !== "rolled") return STANDARD_ARRAY.slice();
    var creation = state.engineState && state.engineState.characterCreation;
    var draft = creation && creation.abilityScoreDraft;
    return draft && Array.isArray(draft.scores) ? draft.scores.slice() : [];
  }

  function sameScorePool(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    var a = left.slice().sort(function (x, y) { return Number(x) - Number(y); });
    var b = right.slice().sort(function (x, y) { return Number(x) - Number(y); });
    return a.every(function (value, index) { return Number(value) === Number(b[index]); });
  }

  function renderAbilityScoreFields() {
    var methodSelect = $("#character-ability-method");
    var optionsNode = $("#character-ability-score-options");
    var rollsNode = $("#character-ability-rolls");
    var rollButton = $("#character-roll-stats");
    if (!methodSelect || !optionsNode) return;
    var method = methodSelect.value || "standard_array";
    var creation = state.engineState && state.engineState.characterCreation;
    var draft = creation && creation.abilityScoreDraft;
    var pool = scorePoolForMethod(method);
    var prior = {};
    optionsNode.querySelectorAll("select[data-ability-score]").forEach(function (select) {
      prior[select.dataset.abilityScore] = select.value;
    });

    if (rollButton) {
      rollButton.hidden = method !== "rolled";
      rollButton.disabled = method === "rolled" && Boolean(draft);
      rollButton.innerHTML = draft ? "Scores rolled <span>✓</span>" : "Roll my scores <span>↗</span>";
    }
    if (rollsNode) {
      rollsNode.hidden = method !== "rolled" || !draft;
      rollsNode.innerHTML = draft
        ? draft.rolls.map(function (roll, index) {
            return '<div class="ability-roll"><strong>' + escapeHtml(roll.total) + '</strong><span>' + escapeHtml("Set " + (index + 1) + " · " + roll.dice.join(" + ") + " · drop " + roll.dropped) + '</span></div>';
          }).join("")
        : "";
    }
    if (method === "rolled" && !draft) {
      optionsNode.innerHTML = '<p class="ability-score-empty">Roll six scores with the engine. Each roll is 4d6, with the lowest die dropped.</p>';
      setText("#character-ability-score-help", "The engine owns the dice. You will assign the resulting six values.", "Roll your scores before assigning them.");
      return;
    }
    var assignments = reconcileAbilityScoreAssignments(prior, pool);
    var scoreOptions = uniqueAbilityScoreOptions(pool);
    optionsNode.innerHTML = ABILITY_SCORE_FIELDS.map(function (ability) {
      var selected = assignments[ability.key];
      var options = scoreOptions.map(function (value) {
        return '<option value="' + escapeHtml(value) + '"' + (Number(value) === Number(selected) ? ' selected' : '') + '>' + escapeHtml(value) + '</option>';
      }).join("");
      return '<label class="ability-score-field"><span>' + escapeHtml(ability.short + " · " + ability.label) + '</span><select data-ability-score="' + ability.key + '" aria-label="' + escapeHtml(ability.label) + '">' + options + '</select></label>';
    }).join("");
    optionsNode.querySelectorAll("select[data-ability-score]").forEach(function (select) {
      select.addEventListener("change", function () {
        var current = {};
        optionsNode.querySelectorAll("select[data-ability-score]").forEach(function (candidate) {
          current[candidate.dataset.abilityScore] = Number(candidate.value);
        });
        var reconciled = reconcileAbilityScoreAssignments(current, pool, select.dataset.abilityScore);
        optionsNode.querySelectorAll("select[data-ability-score]").forEach(function (candidate) {
          candidate.value = String(reconciled[candidate.dataset.abilityScore]);
        });
      });
    });
    setText(
      "#character-ability-score-help",
      method === "rolled" ? "Assign each rolled value once. The engine checks the original dice result." : "Assign 15, 14, 13, 12, 10, and 8 once each.",
      "Assign one value to each ability."
    );
  }

  function renderCharacterChoiceFields() {
    if (!state.characterOptions) return;
    renderAbilityScoreFields();
    var species = findCharacterOption("species", $("#character-species-input").value);
    var characterClass = findCharacterOption("classes", $("#character-class-input").value);
    var background = findCharacterOption("backgrounds", $("#character-background-choice").value);
    if (!species || !characterClass || !background) return;

    var priorAbilities = checkedCharacterValues("#character-ability-choice-options");
    var abilityChoice = species.abilityChoice;
    var abilityOptions = (state.characterOptions.abilities || []).filter(function (ability) {
      return abilityChoice && abilityChoice.excluded.indexOf(ability.abbreviation) === -1;
    });
    var abilitySelected = priorAbilities.filter(function (contentKey) {
      return abilityOptions.some(function (ability) { return ability.contentKey === contentKey; });
    });
    if (abilityChoice && abilitySelected.length !== abilityChoice.count) {
      abilitySelected = abilityOptions.slice(0, abilityChoice.count).map(function (ability) { return ability.contentKey; });
    }
    renderCharacterChoicePanel(
      "#character-ability-choice",
      "#character-ability-choice-help",
      "#character-ability-choice-options",
      abilityChoice ? "Choose " + abilityChoice.count + " different abilities; each gains +" + abilityChoice.bonus + "." : "",
      abilityOptions.map(function (ability) {
        return choiceOptionHtml(ability, abilitySelected.indexOf(ability.contentKey) !== -1, ability.abbreviation.toUpperCase(), abilityChoice ? abilityChoice.count : 0, "ability-choice");
      }).join(""),
      Boolean(abilityChoice),
      abilityChoice ? abilityChoice.count : 0
    );

    var backgroundSkillKeys = new Set((background.skillProficiencies || []).map(function (skill) { return skill.contentKey; }));
    var classSkillChoice = characterClass.skillChoice;
    var backgroundSkillChoice = background.skillChoice;
    var skillChoiceCount = Number(classSkillChoice && classSkillChoice.count || 0) + Number(backgroundSkillChoice && backgroundSkillChoice.count || 0);
    var skillOptionMap = new Map();
    [classSkillChoice && classSkillChoice.options || [], backgroundSkillChoice && backgroundSkillChoice.options || []].forEach(function (options) {
      options.forEach(function (skill) {
        if (!backgroundSkillKeys.has(skill.contentKey) && !skillOptionMap.has(skill.contentKey)) skillOptionMap.set(skill.contentKey, skill);
      });
    });
    var skillOptions = Array.from(skillOptionMap.values());
    var priorSkills = checkedCharacterValues("#character-skill-choice-options").filter(function (contentKey) {
      return skillOptions.some(function (skill) { return skill.contentKey === contentKey; });
    });
    if (priorSkills.length !== skillChoiceCount) {
      priorSkills = skillOptions.slice(0, skillChoiceCount).map(function (skill) { return skill.contentKey; });
    }
    var fixedSkills = (background.skillProficiencies || []).map(function (skill) { return skill.name; }).join(", ");
    renderCharacterChoicePanel(
      "#character-skill-choice",
      "#character-skill-choice-help",
      "#character-skill-choice-options",
      skillChoiceCount ? "Choose " + skillChoiceCount + " total. Class: " + Number(classSkillChoice && classSkillChoice.count || 0) + "; background: " + Number(backgroundSkillChoice && backgroundSkillChoice.count || 0) + ". Fixed background skills: " + (fixedSkills || "none") + "." : "",
      skillOptions.map(function (skill) {
        return choiceOptionHtml(skill, priorSkills.indexOf(skill.contentKey) !== -1, skill.ability.toUpperCase(), skillChoiceCount, "skill-choice");
      }).join(""),
      skillChoiceCount > 0,
      skillChoiceCount
    );

    var fixedLanguageKeys = new Set((species.fixedLanguages || []).concat(background.fixedLanguages || []).map(function (language) { return language.contentKey; }));
    var languageCount = Number(species.languageChoiceCount || 0) + Number(background.languageChoiceCount || 0);
    var languageOptions = (state.characterOptions.languages || []).filter(function (language) {
      return language.selectable && !fixedLanguageKeys.has(language.contentKey);
    });
    var priorLanguages = checkedCharacterValues("#character-language-choice-options").filter(function (contentKey) {
      return languageOptions.some(function (language) { return language.contentKey === contentKey; });
    });
    if (priorLanguages.length !== languageCount) {
      priorLanguages = languageOptions.slice().sort(function (left, right) {
        return Number(left.isExotic) - Number(right.isExotic) || left.name.localeCompare(right.name);
      }).slice(0, languageCount).map(function (language) { return language.contentKey; });
    }
    var fixedLanguages = (species.fixedLanguages || []).concat(background.fixedLanguages || []).map(function (language) { return language.name; }).join(", ");
    renderCharacterChoicePanel(
      "#character-language-choice",
      "#character-language-choice-help",
      "#character-language-choice-options",
      languageCount ? "Choose " + languageCount + ". Fixed species/background languages: " + (fixedLanguages || "none") + "." : "",
      languageOptions.map(function (language) {
        return choiceOptionHtml(language, priorLanguages.indexOf(language.contentKey) !== -1, language.isExotic ? "Exotic" : "Standard", languageCount, "language-choice");
      }).join(""),
      languageCount > 0,
      languageCount
    );

    renderToolChoiceFields(characterClass, background);

    var summary = $("#character-source-summary");
    if (summary) {
      var packLabel = String(state.characterOptions.packHash || "").slice(0, 10);
      summary.textContent = species.name + " · " + characterClass.name + " · " + background.name + ". "
        + species.size + ", " + species.speedFeet + " ft; d" + characterClass.hitDie + ". "
        + "The engine applies reviewed level-one rules and starter equipment from this campaign's selected content pack " + packLabel + ".";
    }
  }

  function renderCharacterOptions() {
    if (!state.characterOptions) return;
    fillCharacterSelect("#character-species-input", (state.characterOptions.species || []).filter(function (option) { return option.selectable; }));
    fillCharacterSelect("#character-class-input", (state.characterOptions.classes || []).filter(function (option) { return option.selectable; }));
    fillCharacterSelect("#character-background-choice", (state.characterOptions.backgrounds || []).filter(function (option) { return option.selectable; }));
    fillCharacterSelect("#character-alignment-choice", state.characterOptions.alignments || []);
    renderCharacterChoiceFields();
  }

  function loadCharacterOptions(campaignId) {
    if (!isSignedIn()) return Promise.resolve(null);
    var requestedCampaignId = campaignId || (state.session && state.session.id) || "";
    if (state.characterOptions && state.characterOptionsCampaignId === requestedCampaignId) return Promise.resolve(state.characterOptions);
    if (state.characterOptionsLoading && state.characterOptionsLoadingCampaignId === requestedCampaignId) return state.characterOptionsLoading;
    state.characterOptionsLoadingCampaignId = requestedCampaignId;
    var url = "/api/character-options" + (requestedCampaignId ? "?campaignId=" + encodeURIComponent(requestedCampaignId) : "");
    state.characterOptionsLoading = requestJson(url).then(function (result) {
      if (!result.response.ok) throw new Error(result.data.error || "Open5e character options are unavailable.");
      state.characterOptions = result.data.options;
      state.characterOptionsCampaignId = requestedCampaignId;
      renderCharacterOptions();
      return state.characterOptions;
    }).catch(function (error) {
      var summary = $("#character-source-summary");
      if (summary) summary.textContent = error.message;
      showToast(error.message);
      return null;
    }).finally(function () {
      state.characterOptionsLoading = null;
      state.characterOptionsLoadingCampaignId = null;
    });
    return state.characterOptionsLoading;
  }

  function selectedCampaignLicenseKeys() {
    if (!state.contentCatalog) return [];
    var ogl = $("#campaign-ogl-input");
    return (state.contentCatalog.allowedLicenseKeys || []).filter(function (license) {
      return license !== "ogl-10a" || Boolean(ogl && ogl.checked);
    }).sort();
  }

  function renderCampaignSourceOptions() {
    if (!state.contentCatalog) return;
    var systemSelect = $("#campaign-gamesystem-input");
    var baseSelect = $("#campaign-base-document-input");
    var optionsNode = $("#campaign-source-options");
    if (!systemSelect || !baseSelect || !optionsNode) return;
    var prior = new Set(Array.from(optionsNode.querySelectorAll("input:checked")).map(function (input) { return input.value; }));
    var licenses = selectedCampaignLicenseKeys();
    var documents = (state.contentCatalog.documents || []).filter(function (document) {
      return document.gamesystem === systemSelect.value;
    });
    var baseDocuments = documents.filter(function (document) { return document.canBeBase; });
    var priorBase = baseSelect.value;
    baseSelect.innerHTML = baseDocuments.map(function (document) {
      return '<option value="' + escapeHtml(document.key) + '">' + escapeHtml(document.displayName) + '</option>';
    }).join("");
    var defaultPolicy = state.contentCatalog.defaultPolicy || {};
    baseSelect.value = baseDocuments.some(function (document) { return document.key === priorBase; })
      ? priorBase
      : baseDocuments.some(function (document) { return document.key === defaultPolicy.baseDocumentKey; })
        ? defaultPolicy.baseDocumentKey
        : baseDocuments[0] && baseDocuments[0].key || "";
    var defaultDocuments = defaultPolicy.gamesystem === systemSelect.value ? defaultPolicy.allowedDocumentKeys || [] : [];
    optionsNode.innerHTML = documents.map(function (document) {
      var allowed = (document.licenseKeys || []).some(function (license) { return licenses.indexOf(license) !== -1; });
      var isBase = document.key === baseSelect.value;
      var checked = isBase || allowed && (prior.has(document.key) || defaultDocuments.indexOf(document.key) !== -1);
      var licenseLabel = (document.licenseKeys || []).join(" / ").toUpperCase();
      return '<label class="campaign-source-option' + (allowed ? '' : ' is-locked') + '"><input type="checkbox" value="' + escapeHtml(document.key) + '"'
        + (checked ? ' checked' : '') + (isBase || !allowed ? ' disabled' : '') + '><span><strong>' + escapeHtml(document.displayName) + '</strong><small>'
        + escapeHtml(document.publisher.name + ' / ' + licenseLabel) + '</small></span></label>';
    }).join("");
    var help = $("#campaign-rules-help");
    if (help) {
      help.textContent = documents.length
        ? documents.length + " deployment-approved source" + (documents.length === 1 ? " is" : "s are") + " available for this game system. Tier-zero records remain reference-only."
        : "No playable rules base is enabled for this game system.";
    }
  }

  function renderContentCatalog() {
    if (!state.contentCatalog) return;
    var panel = $("#campaign-rules-panel");
    var systemSelect = $("#campaign-gamesystem-input");
    var oglChoice = $("#campaign-ogl-choice");
    var oglInput = $("#campaign-ogl-input");
    if (!panel || !systemSelect) return;
    panel.hidden = false;
    var defaultPolicy = state.contentCatalog.defaultPolicy || {};
    var priorSystem = systemSelect.value;
    var systems = (state.contentCatalog.allowedGamesystems || []).filter(function (gamesystem) {
      return (state.contentCatalog.documents || []).some(function (document) {
        return document.gamesystem === gamesystem && document.canBeBase;
      });
    });
    systemSelect.innerHTML = systems.map(function (gamesystem) {
      return '<option value="' + escapeHtml(gamesystem) + '">' + escapeHtml(titleCase(gamesystem)) + '</option>';
    }).join("");
    systemSelect.value = systems.indexOf(priorSystem) !== -1
      ? priorSystem
      : systems.indexOf(defaultPolicy.gamesystem) !== -1
        ? defaultPolicy.gamesystem
        : systems[0] || "";
    var oglAvailable = (state.contentCatalog.allowedLicenseKeys || []).indexOf("ogl-10a") !== -1;
    if (oglChoice) oglChoice.hidden = !oglAvailable;
    if (oglInput && !oglAvailable) oglInput.checked = false;
    setText("#campaign-pack-label", "PACK " + String(state.contentCatalog.packHash || "").slice(0, 12), "PINNED PACK");
    renderCampaignSourceOptions();
  }

  function loadContentCatalog() {
    if (!isSignedIn()) return Promise.resolve(null);
    if (state.contentCatalog) return Promise.resolve(state.contentCatalog);
    if (state.contentCatalogLoading) return state.contentCatalogLoading;
    state.contentCatalogLoading = requestJson("/api/content-catalog").then(function (result) {
      if (!result.response.ok) throw new Error(result.data.error || "The Open5e content catalog is unavailable.");
      state.contentCatalog = result.data.catalog;
      renderContentCatalog();
      return state.contentCatalog;
    }).catch(function (error) {
      showToast(error.message);
      return null;
    }).finally(function () {
      state.contentCatalogLoading = null;
    });
    return state.contentCatalogLoading;
  }

  function campaignContentPolicyPayload() {
    if (!state.contentCatalog) return null;
    var baseDocumentKey = $("#campaign-base-document-input").value;
    var documents = Array.from(document.querySelectorAll('#campaign-source-options input[type="checkbox"]'))
      .filter(function (input) { return input.checked || input.value === baseDocumentKey; })
      .map(function (input) { return input.value; });
    if (documents.indexOf(baseDocumentKey) === -1) documents.push(baseDocumentKey);
    return {
      gamesystem: $("#campaign-gamesystem-input").value,
      baseDocumentKey: baseDocumentKey,
      allowedDocumentKeys: Array.from(new Set(documents)).sort(),
      allowedLicenseKeys: selectedCampaignLicenseKeys()
    };
  }

  function renderAttributionDialog() {
    if (!state.session || !state.contentCatalog) return false;
    var policy = state.session.contentPolicy || {};
    var enabledKeys = policy.allowedDocumentKeys || [];
    var documents = enabledKeys.map(function (key) {
      return (state.contentCatalog.documents || []).find(function (document) { return document.key === key; }) || { key: key, displayName: key, publisher: { name: "Source unavailable" }, licenseKeys: [], permalink: "" };
    });
    var list = $("#attribution-list");
    if (list) {
      list.innerHTML = documents.map(function (document) {
        return '<div class="attribution-entry"><strong>' + escapeHtml(document.displayName) + '</strong><span>'
          + escapeHtml(document.publisher.name + ' / ' + (document.licenseKeys || []).join(' / ')) + '</span>'
          + (document.permalink ? '<a href="' + escapeHtml(document.permalink) + '" target="_blank" rel="noreferrer">Open source permalink ↗</a>' : '') + '</div>';
      }).join("") || '<p class="dialog-copy">No source documents are recorded for this campaign.</p>';
    }
    setText("#attribution-summary", titleCase(policy.gamesystem || "Unknown system") + " / base " + (policy.baseDocumentKey || "unknown") + " / licenses " + (policy.allowedLicenseKeys || []).join(", "), "Pinned campaign policy");
    setText("#attribution-pack", state.session.rulesVersion, "No pack identity");
    return true;
  }

  function openAttribution() {
    var open = function () {
      if (!renderAttributionDialog()) return;
      var dialog = $("#attribution-dialog");
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.hidden = false;
    };
    if (state.contentCatalog) open();
    else loadContentCatalog().then(open);
  }

  function closeAttribution() {
    var dialog = $("#attribution-dialog");
    if (typeof dialog.close === "function") dialog.close();
    else dialog.hidden = true;
  }

  function spellEntryHtml(spell) {
    var level = spell && Number(spell.level);
    var levelLabel = Number.isFinite(level) ? (level === 0 ? "Cantrip" : "Level " + level) : "Unavailable pack";
    var details = [levelLabel, spell && spell.school, spell && spell.castingTime, spell && spell.range].filter(Boolean);
    var status = spell && spell.mechanicsStatus === "compiled-primary" ? " / rules ready" : spell && spell.mechanicsStatus === "prose-only" ? " / prose only" : "";
    return '<div class="spell-entry"><strong>' + escapeHtml(spell && (spell.name || spell.contentKey) || "Unknown spell") + '</strong><small>' + escapeHtml(details.join(" / ") + status) + '</small></div>';
  }

  function featureDetailHtml(feature) {
    return markdownFeatureDetailHtml(feature);
  }

  function sourceDetailHtml(label, source) {
    return markdownSourceDetailHtml(label, source);
  }

  function renderCharacter(character) {
    if (!character) return;
    if (!character.created) {
      setText("#character-name", "Your character", "Your character");
      setText("#character-identity", "Not created yet", "Not created yet");
    } else {
      setText("#character-name", character.name, "Unnamed adventurer");
      setText("#character-identity", titleCase(character.species) + " · " + titleCase(character.className), "Adventurer");
    }
    setText("#character-background", "Background " + (character.background || "—"), "Background —");
    setText("#character-alignment", "Alignment " + (character.alignment || "—"), "Alignment —");
    setText("#character-size", "Size " + (character.size || "—"), "Size —");
    setText("#character-speed", "Speed " + (character.speed || "—") + " ft · d" + (character.hitDie || "—") + " × " + (character.hitDiceRemaining === undefined ? "—" : character.hitDiceRemaining), "Speed —");
    setText("#character-proficiency", "Proficiency +" + (character.proficiencyBonus === undefined ? "—" : character.proficiencyBonus), "Proficiency —");
    var spellcasting = character.spellcasting;
    var details = character.details || {};
    setText("#character-spellcasting", spellcasting ? "Spell DC " + spellcasting.spellSaveDc + " · +" + spellcasting.spellAttackBonus : "Spellcasting —", "Spellcasting —");
    var descriptionNode = $("#character-description");
    if (descriptionNode) {
      descriptionNode.innerHTML = renderMarkdown(character.description || "");
      descriptionNode.hidden = !character.description;
    }
    var backgroundInput = $("#character-background-input");
    var alignmentInput = $("#character-alignment-input");
    var descriptionInput = $("#character-description-input");
    if (backgroundInput) backgroundInput.value = character.background || "";
    if (alignmentInput) alignmentInput.value = character.alignment || "";
    if (descriptionInput) descriptionInput.value = character.description || "";
    [
      ["#character-player-name-input", details.playerName],
      ["#character-age-input", details.age],
      ["#character-height-input", details.height],
      ["#character-weight-input", details.weight],
      ["#character-eyes-input", details.eyes],
      ["#character-skin-input", details.skin],
      ["#character-hair-input", details.hair],
      ["#character-faction-input", details.factionName],
      ["#character-personality-input", details.personalityTraits],
      ["#character-ideals-input", details.ideals],
      ["#character-bonds-input", details.bonds],
      ["#character-flaws-input", details.flaws],
      ["#character-appearance-input", details.appearance],
      ["#character-backstory-input", details.backstory],
      ["#character-allies-input", details.allies],
      ["#character-treasure-input", details.treasure],
    ].forEach(function (entry) {
      var input = $(entry[0]);
      if (input) input.value = entry[1] || "";
    });
    var inspirationInput = $("#character-inspiration-input");
    if (inspirationInput) inspirationInput.checked = Boolean(details.inspiration);
    var tempHpInput = $("#character-temp-hp-input");
    if (tempHpInput) tempHpInput.value = Number(details.temporaryHp || 0);
    setText("#character-level", "LEVEL " + (character.level || 1));
    setText("#character-hp", character.hp, "0");
    setText("#character-max-hp", character.maxHp, "0");
    setText("#character-ac", character.ac, "—");
    var derived = character.derived || {};
    var initiative = Number(derived.initiative);
    setText("#character-initiative", Number.isFinite(initiative) ? (initiative >= 0 ? "+" : "") + initiative : "—", "—");
    setText("#character-passive-perception", derived.passivePerception, "—");
    setText("#character-hit-dice", "d" + (character.hitDie || "—") + " · " + (character.hitDiceRemaining === undefined ? "—" : character.hitDiceRemaining), "—");
    setText("#character-temp-hp", Number(details.temporaryHp || 0), "0");
    var inspirationNode = $("#character-inspiration");
    if (inspirationNode) {
      inspirationNode.textContent = details.inspiration ? "INSPIRATION · ON" : "INSPIRATION · OFF";
      inspirationNode.classList.toggle("is-on", Boolean(details.inspiration));
    }
    var totalCopper = character.currency && Number.isFinite(Number(character.currency.copper)) ? Math.max(0, Math.trunc(Number(character.currency.copper))) : Math.max(0, Math.trunc(Number(character.gold || 0) * 100));
    var breakdown = derived.currencyBreakdown || {};
    var goldCoins = Number.isFinite(Number(breakdown.gold)) ? Number(breakdown.gold) : Math.floor(totalCopper / 100);
    var silverCoins = Number.isFinite(Number(breakdown.silver)) ? Number(breakdown.silver) : Math.floor((totalCopper % 100) / 10);
    var copperCoins = Number.isFinite(Number(breakdown.copper)) ? Number(breakdown.copper) : totalCopper % 10;
    var platinumCoins = Number.isFinite(Number(breakdown.platinum)) ? Number(breakdown.platinum) : Math.floor(totalCopper / 1000);
    var electrumCoins = Number.isFinite(Number(breakdown.electrum)) ? Number(breakdown.electrum) : Math.floor((totalCopper % 1000) / 50);
    setText("#character-platinum-coins", platinumCoins, "0");
    setText("#character-gold", goldCoins, "0");
    setText("#character-gold-coins", goldCoins, "0");
    setText("#character-electrum-coins", electrumCoins, "0");
    setText("#character-silver-coins", silverCoins, "0");
    setText("#character-copper-coins", copperCoins, "0");
    setText("#character-xp", character.xp, "0");
    var carryWeight = Array.isArray(character.inventory) ? character.inventory.reduce(function (total, item) { return total + (Number(item.weight) || 0) * (Number(item.quantity) || 0); }, 0) : 0;
    setText("#character-carry-weight", carryWeight.toFixed(carryWeight % 1 ? 1 : 0), "0");
    setText("#character-carry-capacity", (Number(character.abilities && character.abilities.str) || 0) * 15, "0");
    var hp = Number(character.hp) || 0;
    var maxHp = Math.max(1, Number(character.maxHp) || 1);
    var hpFill = $("#character-hp-fill");
    if (hpFill) {
      hpFill.style.width = Math.max(0, Math.min(100, hp / maxHp * 100)) + "%";
      hpFill.classList.toggle("is-critical", hp > 0 && hp / maxHp <= .25);
    }
    var conditions = Array.isArray(character.conditions) ? character.conditions : [];
    var conditionEffects = Array.isArray(character.conditionEffects) ? character.conditionEffects : [];
    var conditionNode = $("#character-conditions");
    if (conditionNode) {
      conditionNode.hidden = conditions.length === 0;
      conditionNode.innerHTML = conditions.map(function (condition) {
        var effect = conditionEffects.filter(function (candidate) {
          return String(candidate.name || "").toLowerCase() === String(condition).toLowerCase();
        })[0];
        var duration = effect ? formatConditionDuration(effect.duration) : "";
        var source = effect && effect.sourceContentKey ? "Source-backed condition / " + effect.sourceContentKey : "Condition";
        return '<span class="condition-chip" title="' + escapeHtml(source) + '"><strong>' + escapeHtml(titleCase(condition)) + '</strong>'
          + (duration ? '<small>' + escapeHtml(duration) + '</small>' : '') + '</span>';
      }).join("");
    }
    var custodyNode = $("#character-custody");
    var custody = character.custody && typeof character.custody === "object" ? character.custody : null;
    if (custodyNode) {
      custodyNode.hidden = !custody;
      custodyNode.innerHTML = custody
        ? '<span class="condition-chip" title="' + escapeHtml("Source guard: " + custody.sourceGuardId + " / location: " + custody.locationRef) + '"><strong>' + escapeHtml(titleCase(custody.status)) + '</strong><small>Guarded by ' + escapeHtml(custody.sourceGuardId) + '</small></span>'
        : "";
    }
    var abilitiesNode = $("#character-abilities");
    if (abilitiesNode) {
      var abilityNames = ["str", "dex", "con", "int", "wis", "cha"];
      abilitiesNode.innerHTML = abilityNames.map(function (ability) {
        var score = character.abilities && character.abilities[ability] !== undefined ? character.abilities[ability] : "—";
        var modifier = typeof score === "number" ? Math.floor((score - 10) / 2) : null;
        var signedModifier = modifier === null ? "" : (modifier >= 0 ? "+" + modifier : String(modifier));
        return '<div class="ability-cell"><span>' + ability.toUpperCase() + '</span><strong>' + escapeHtml(score) + '</strong><small>' + escapeHtml(signedModifier) + '</small></div>';
      }).join("");
    }
    var skillsNode = $("#character-skills");
    if (skillsNode) {
      var skills = character.skills && typeof character.skills === "object" ? character.skills : {};
      var saves = character.savingThrows && typeof character.savingThrows === "object" ? character.savingThrows : {};
      var saveProficiencies = Array.isArray(derived.savingThrowProficiencies) ? derived.savingThrowProficiencies : [];
      var saveHtml = Object.keys(saves).map(function (ability) {
        var save = Number(saves[ability]);
        return '<div class="skill-cell save"><span>' + escapeHtml(ability.toUpperCase() + " SAVE" + (saveProficiencies.indexOf(ability) !== -1 ? " ·" : "")) + '</span><strong>' + (save >= 0 ? "+" : "") + escapeHtml(save) + '</strong></div>';
      }).join("");
      var skillHtml = Object.keys(skills).map(function (skill) {
        var value = skills[skill] || {};
        var bonus = Number(value.bonus || 0);
        return '<div class="skill-cell"><span>' + escapeHtml(titleCase(skill) + (value.proficient ? " ·" : "")) + '</span><strong>' + (bonus >= 0 ? "+" : "") + escapeHtml(bonus) + '</strong></div>';
      }).join("");
      skillsNode.innerHTML = saveHtml + skillHtml;
    }
    var attacksNode = $("#character-attacks");
    if (attacksNode) {
      var weapons = (Array.isArray(character.inventory) ? character.inventory : []).filter(function (item) { return item.kind === "weapon"; });
      attacksNode.innerHTML = weapons.length
        ? weapons.map(function (item) {
            var detail = [item.damage, item.properties && item.properties.join(", "), item.equipped ? "equipped" : "carried"].filter(Boolean).join(" · ");
            return '<div class="attack-entry"><strong>' + escapeHtml(item.name || item.id) + '</strong><small>' + escapeHtml(detail || "Weapon") + '</small></div>';
          }).join("")
        : '<p class="inventory-empty">No weapon attacks recorded.</p>';
    }
    var featuresNode = $("#character-features");
    if (featuresNode) {
      var features = Array.isArray(character.features) ? character.features : [];
      var proficiencies = character.proficiencies || {};
      var profs = [].concat(proficiencies.armor || [], proficiencies.weapons || [], proficiencies.tools || [], proficiencies.languages || []);
      featuresNode.innerHTML = features.concat(profs.map(function (item) { return "Proficient: " + item; })).map(function (item) {
        return '<span class="feature-chip">' + escapeHtml(item) + '</span>';
      }).join("") || '<p class="inventory-empty">No features recorded.</p>';
    }
    var sourceDetails = character.sourceDetails || {};
    var featureDetailsNode = $("#character-feature-details");
    if (featureDetailsNode) {
      var featureDetails = Array.isArray(sourceDetails.features) ? sourceDetails.features : [];
      featureDetailsNode.innerHTML = featureDetails.filter(function (feature) { return feature.description; }).map(markdownFeatureDetailHtml).join("");
    }
    var proficienciesNode = $("#character-proficiencies");
    if (proficienciesNode) {
      var proficiencies = character.proficiencies || {};
      var proficiencyGroups = [
        ["Armor", proficiencies.armor || []],
        ["Weapons", proficiencies.weapons || []],
        ["Tools", proficiencies.tools || []],
        ["Languages", proficiencies.languages || []]
      ];
      proficienciesNode.innerHTML = proficiencyGroups.map(function (group) {
        return '<div class="proficiency-entry"><strong>' + escapeHtml(group[0]) + '</strong><small>' + escapeHtml(group[1].length ? group[1].join(", ") : "None") + '</small></div>';
      }).join("");
    }
    var loreNode = $("#character-lore");
    var loreSection = $("#character-lore-section");
    if (loreNode) {
      var loreEntries = [
        ["Personality traits", details.personalityTraits],
        ["Ideals", details.ideals],
        ["Bonds", details.bonds],
        ["Flaws", details.flaws],
        ["Appearance", details.appearance],
        ["Backstory", details.backstory],
        ["Allies & organizations", details.allies],
        ["Treasure", details.treasure]
      ].filter(function (entry) { return entry[1]; });
      loreNode.innerHTML = loreEntries.map(function (entry) {
        return '<div class="lore-entry"><strong>' + escapeHtml(entry[0]) + '</strong><div class="markdown-body">' + renderMarkdown(entry[1]) + '</div></div>';
      }).join("");
      if (loreSection) loreSection.hidden = loreEntries.length === 0;
    }
    var sourceSection = $("#character-source-section");
    var sourceDetailsNode = $("#character-source-details");
    if (sourceDetailsNode) {
      var sourceHtml = [
        markdownSourceDetailHtml("Species", sourceDetails.species),
        markdownSourceDetailHtml("Class", sourceDetails.characterClass),
        markdownSourceDetailHtml("Background", sourceDetails.background),
        markdownSourceDetailHtml("Alignment", sourceDetails.alignment)
      ].join("");
      sourceDetailsNode.innerHTML = sourceHtml;
      if (sourceSection) sourceSection.hidden = !sourceHtml;
    }
    var spellbookSection = $("#character-spellbook-section");
    if (spellbookSection) spellbookSection.hidden = !spellcasting;
    if (spellcasting) {
      var selectionMode = spellcasting.selectionMode || "spellcasting";
      var selectionDetail = titleCase(selectionMode);
      if (spellcasting.cantripLimit !== null && spellcasting.cantripLimit !== undefined) selectionDetail += " / " + spellcasting.cantripLimit + " cantrips";
      if (spellcasting.knownSpellLimit !== null && spellcasting.knownSpellLimit !== undefined) selectionDetail += " / " + spellcasting.knownSpellLimit + " leveled";
      if (spellcasting.preparedCapacity !== null && spellcasting.preparedCapacity !== undefined) selectionDetail += " / " + spellcasting.preparedCapacity + " prepared";
      setText("#spell-selection-mode", selectionDetail.toUpperCase(), "SPELLCASTING");
      setText("#known-spell-label", selectionMode === "spellbook" ? "SPELLBOOK & CANTRIPS" : "KNOWN SPELLS", "KNOWN SPELLS");
      setText("#prepared-spell-label", selectionMode === "known" ? "PREPARATION NOT USED" : "PREPARED", "PREPARED");
      var slotsNode = $("#character-spell-slots");
      if (slotsNode) {
        var maximums = spellcasting.slotMaximums && typeof spellcasting.slotMaximums === "object" ? spellcasting.slotMaximums : {};
        slotsNode.innerHTML = Object.keys(maximums).sort(function (left, right) { return Number(left) - Number(right); }).map(function (slotLevel) {
          var maximum = Number(maximums[slotLevel]) || 0;
          var remaining = Number(spellcasting.slots && spellcasting.slots[slotLevel]) || 0;
          return '<div class="spell-slot"><span>LEVEL ' + escapeHtml(slotLevel) + '</span><strong>' + remaining + ' / ' + maximum + '</strong></div>';
        }).join("") || '<p class="inventory-empty">No spell slots at this level.</p>';
      }
      var knownSpellsNode = $("#character-known-spells");
      var knownSpells = Array.isArray(spellcasting.knownSpells) ? spellcasting.knownSpells : [];
      if (knownSpellsNode) knownSpellsNode.innerHTML = knownSpells.map(spellEntryHtml).join("") || '<p class="inventory-empty">No spells selected.</p>';
      var preparedSpellsNode = $("#character-prepared-spells");
      var preparedSpells = Array.isArray(spellcasting.preparedSpells) ? spellcasting.preparedSpells : [];
      if (preparedSpellsNode) preparedSpellsNode.innerHTML = preparedSpells.map(spellEntryHtml).join("") || '<p class="inventory-empty">No spells prepared.</p>';
      var concentrationNode = $("#character-concentration");
      if (concentrationNode) {
        concentrationNode.hidden = !spellcasting.concentration;
        concentrationNode.textContent = spellcasting.concentration
          ? "CONCENTRATING / " + (spellcasting.concentration.name || spellcasting.concentration.contentKey) + (spellcasting.concentration.startedRound ? " / since round " + spellcasting.concentration.startedRound : "")
          : "";
      }
    }
    var inventoryNode = $("#character-inventory");
    if (inventoryNode) {
      var richInventory = Array.isArray(character.inventory) ? character.inventory : [];
      inventoryNode.innerHTML = richInventory.length ? richInventory.map(function (item) {
        var stateLabel = item.equipped ? " · equipped" : "";
        var action = item.kind === "consumable"
          ? { id: "use", label: "Use" }
          : (item.kind === "weapon" || item.kind === "armor")
            ? { id: item.equipped ? "unequip" : "equip", label: item.equipped ? "Unequip" : "Equip" }
            : null;
        var actionButton = action
          ? '<button type="button" class="item-action" data-inventory-action="' + action.id + '" data-item-id="' + escapeHtml(item.id) + '" data-item-slot="' + escapeHtml(item.slot || "") + '">' + action.label + '</button>'
          : "";
        return '<div class="inventory-item"><span>' + escapeHtml(item.name || item.id) + '<small class="inventory-kind">' + escapeHtml(titleCase(item.kind || "item") + stateLabel) + '</small></span><span class="inventory-item-end"><small>×' + escapeHtml(item.quantity || 0) + '</small>' + actionButton + '</span></div>';
      }).join("") : '<p class="inventory-empty">No items carried.</p>';
    }
    setText("#character-death-saves", (character.deathSaveSuccesses || 0) + " / " + (character.deathSaveFailures || 0), "0 / 0");
  }

  function renderBeat(beat) {
    var card = $("#campaign-beat-card");
    if (!card) return;
    card.hidden = !beat;
    if (!beat) return;
    setText("#campaign-beat-title", beat.title, "The world is moving.");
    setMarkdown("#campaign-beat-description", beat.description, "");
    setText("#campaign-beat-pressure", beat.pressure, "");
    var choicesNode = $("#campaign-beat-choices");
    if (choicesNode) choicesNode.innerHTML = (Array.isArray(beat.choices) ? beat.choices : []).map(function (choice, index) {
      return '<span class="beat-choice"><b>' + (index + 1) + '</b>' + escapeHtml(choice) + '</span>';
    }).join("");
  }

  function renderQuests(quests) {
    var list = Array.isArray(quests) ? quests : [];
    var active = list.filter(function (quest) { return quest.status === "active"; });
    setText("#quest-count", active.length, "0");
    var node = $("#quest-list");
    if (!node) return;
    node.innerHTML = active.length ? active.map(function (quest) {
      var reward = quest.reward && Number(quest.reward.copper) || 0;
      var rewardGold = Math.floor(reward / 100);
      var rewardSilver = Math.floor((reward % 100) / 10);
      var rewardCopper = reward % 10;
      return '<article class="quest-entry"><div class="quest-entry-top"><strong>' + escapeHtml(quest.title) + '</strong><span>' + escapeHtml(quest.progress || 0) + '%</span></div><div class="markdown-body">' + renderMarkdown(quest.objective) + '</div><small>Reward · ' + rewardGold + ' gp ' + rewardSilver + ' sp ' + rewardCopper + ' cp · ' + escapeHtml(quest.reward && quest.reward.xp || 0) + ' XP</small></article>';
    }).join("") : '<p class="notes-empty">No active quests yet.</p>';
  }

  function renderNotes(notes) {
    var noteList = Array.isArray(notes) ? notes : [];
    setText("#notes-count", noteList.length, "0");
    var node = $("#player-notes");
    if (!node) return;
    node.innerHTML = noteList.length ? noteList.map(function (note) {
      var source = note.source === "dm" ? "DM" : "YOU";
      return '<article class="note-entry"><div class="note-entry-meta"><span class="note-source">' + source + '</span><time>' + escapeHtml(formatNoteDate(note.createdAt)) + '</time></div><div class="markdown-body">' + renderMarkdown(note.text) + '</div></article>';
    }).join("") : '<p class="notes-empty">Notes you and the DM choose to keep.</p>';
  }

  function renderProceduralNotices(notices) {
    var list = Array.isArray(notices) ? notices : [];
    var card = $("#procedural-notice-card");
    var node = $("#procedural-notices");
    if (!card || !node) return;
    card.hidden = list.length === 0;
    setText("#procedural-notice-count", list.length, "0");
    node.innerHTML = list.map(function (notice) {
      var status = titleCase(String(notice.status || "sealed"));
      var terms = notice.terms;
      var content = '<article class="procedural-notice-entry"><div class="note-entry-meta"><strong>' + escapeHtml(notice.title || "Procedural notice") + '</strong><span>' + escapeHtml(status) + '</span></div>';
      if (!terms) {
        content += '<p class="notes-empty">The operative terms remain sealed until the authorized delivery step.</p>';
      } else {
        content += '<dl class="procedural-notice-terms">'
          + '<div><dt>Authorized action</dt><dd>' + escapeHtml(terms.authorizedAction) + '</dd></div>'
          + '<div><dt>Who it governs</dt><dd>' + escapeHtml(terms.actorScope) + '</dd></div>'
          + '<div><dt>Evidence allowed</dt><dd>' + escapeHtml((terms.admissibleEvidence || []).join("; ")) + '</dd></div>'
          + '<div><dt>Evidence excluded</dt><dd>' + escapeHtml((terms.excludedEvidence || []).join("; ")) + '</dd></div>'
          + '<div><dt>Response window</dt><dd>' + escapeHtml(terms.responseWindow) + '</dd></div>'
          + '<div><dt>Attendance</dt><dd>' + escapeHtml(terms.attendance) + '</dd></div>'
          + '<div><dt>Custody effect</dt><dd>' + escapeHtml(terms.custodyEffect) + '</dd></div>'
          + '<div><dt>What changes next</dt><dd>' + escapeHtml(terms.nextChange) + '</dd></div>'
          + '</dl>';
      }
      var attempts = Array.isArray(notice.attempts) ? notice.attempts : [];
      if (attempts.length) {
        content += '<div class="procedural-notice-attempts">' + attempts.slice(-4).map(function (attempt) {
          return '<span class="notice-attempt ' + escapeHtml(attempt.outcome || "") + '">' + escapeHtml(titleCase(attempt.kind || "request")) + ': ' + escapeHtml(attempt.reason || attempt.outcome || "recorded") + '</span>';
        }).join("") + '</div>';
      }
      return content + '</article>';
    }).join("");
  }

  function formatNoteDate(value) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function formatConditionDuration(duration) {
    if (!duration || !duration.kind) return "";
    if (duration.kind === "persistent") return "until ended";
    if (duration.kind === "source-lifetime") return "while source lives";
    if (duration.kind === "fixed") return duration.amount + " " + duration.unit + (Number(duration.amount) === 1 ? "" : "s");
    if (duration.kind === "turn-boundary") {
      return "until " + duration.subject + " " + duration.boundary + " of next turn";
    }
    return "";
  }

  function combatActionRows(enemy) {
    var attacks = Array.isArray(enemy.attacks) ? enemy.attacks : [];
    var programs = Array.isArray(enemy.effectPrograms) ? enemy.effectPrograms : [];
    var resources = enemy.actionResources && typeof enemy.actionResources === "object" ? enemy.actionResources : {};
    var byAction = {};
    attacks.forEach(function (attack) {
      byAction[attack.actionKey] = {
        name: attack.name,
        actionKey: attack.actionKey,
        status: "attack ready",
        detail: (attack.attackMode || "attack") + " / " + attack.damage.diceCount + "d" + attack.damage.dieSides + (attack.damage.bonus ? (attack.damage.bonus > 0 ? "+" : "") + attack.damage.bonus : "") + " " + attack.damage.typeName
      };
    });
    programs.forEach(function (program) {
      if (!program.sourceActionKey) return;
      var executable = program.hasDeferredProse === false && program.executionMode !== "fragments" && program.executionMode !== "spell-area";
      var sequence = (program.operations || []).filter(function (operation) { return operation.kind === "attack-sequence"; })[0];
      var detail = sequence
        ? sequence.steps.map(function (step) { return step.count + "x " + step.name; }).join(" + ")
        : (program.executionMode || "compiled fragments").replaceAll("-", " ");
      byAction[program.sourceActionKey] = {
        name: program.sourceName,
        actionKey: program.sourceActionKey,
        status: executable ? "rules ready" : "prose only",
        detail: detail
      };
    });
    return Object.keys(byAction).sort().map(function (actionKey) {
      var row = byAction[actionKey];
      var resource = resources[actionKey];
      var resourceText = "";
      if (resource && resource.kind === "per-day") resourceText = " / " + (resource.usesRemaining || 0) + " left";
      if (resource && resource.kind === "recharge") resourceText = resource.available ? " / charged" : " / recharge " + (resource.rechargeMinimum || 6) + "-6";
      return '<li class="combat-action ' + (row.status === "prose only" ? "is-deferred" : "is-ready") + '"><span><strong>' + escapeHtml(row.name) + '</strong><small>' + escapeHtml(row.actionKey) + '</small></span><span>' + escapeHtml(row.status + resourceText) + '<small>' + escapeHtml(row.detail) + '</small></span></li>';
    }).join("");
  }

  function renderCombat(combat) {
    var card = $("#combat-card");
    if (!card) return;
    var active = combat && combat.status === "active";
    card.hidden = !active;
    if (!active) return;
    var enemies = Array.isArray(combat.enemies) ? combat.enemies : [];
    var enemy = enemies.filter(function (candidate) { return candidate.alive !== false; })[0] || enemies[0];
    setText("#combat-round", "ROUND " + (combat.round || 1));
    setText("#combat-name", combat.encounterName || (enemy ? enemy.name : "Hostile presence"));
    var enemyHp = enemy ? Number(enemy.hp) || 0 : 0;
    var enemyMaxHp = enemy ? Math.max(1, Number(enemy.maxHp) || 1) : 1;
    var enemyFill = $("#enemy-health-fill");
    if (enemyFill) enemyFill.style.width = Math.max(0, Math.min(100, enemyHp / enemyMaxHp * 100)) + "%";
    var budget = combat.turnBudget || {};
    var economy = budget.action && budget.action.spent ? "Action spent" : "Action ready";
    economy += budget.bonusAction && budget.bonusAction.spent ? " / bonus spent" : " / bonus ready";
    economy += budget.reaction && budget.reaction.spent ? " / reaction spent" : " / reaction ready";
    if (budget.movementFeet) economy += " / move " + Math.max(0, budget.movementFeet.available - budget.movementFeet.spent) + " ft";
    setText("#combat-detail", economy + ".");
    var enemiesNode = $("#combat-enemies");
    if (enemiesNode) enemiesNode.innerHTML = enemies.map(function (candidate) {
      var activeMarker = combat.activeActorId === candidate.id ? '<em>ACTING</em>' : '';
      var actionRows = combatActionRows(candidate);
      return '<article class="combat-enemy"><div class="combat-enemy-summary"><span><strong>' + escapeHtml(candidate.name || candidate.id) + '</strong><small>AC ' + escapeHtml(candidate.armorClass === undefined ? "?" : candidate.armorClass) + ' / ' + escapeHtml(titleCase(candidate.mechanicsStatus || "typed statblock")) + '</small></span><span>' + activeMarker + '<strong>' + escapeHtml(candidate.hp || 0) + '/' + escapeHtml(candidate.maxHp || 0) + ' HP</strong><small>' + escapeHtml(candidate.distanceFeet === undefined ? "?" : candidate.distanceFeet) + ' ft</small></span></div>'
        + (actionRows ? '<details class="combat-actions"><summary>Source-backed actions</summary><ul>' + actionRows + '</ul></details>' : '') + '</article>';
    }).join("");
  }

  function actionLabel(action) {
    return {
      observe: "I observe the current moment.",
      listen: "I listen carefully.",
      roll: "I make a general check.",
      continue: "I continue the tutorial."
    }[action] || "I take my turn.";
  }

  function renderSuggestedActions(actions, session, snapshot) {
    var heading = $("#action-heading");
    var row = $("#action-row");
    if (!heading || !row) return;

    var phase = session && session.phase;
    var hasOpening = Boolean(session && (session.worldContext || (snapshot && snapshot.worldContext)));
    var normalized = (Array.isArray(actions) ? actions : []).map(function (action, index) {
      if (!action || typeof action !== "object") return null;
      var label = String(action.label || "").trim();
      var prompt = String(action.prompt || label).trim();
      if (!label || !prompt) return null;
      return {
        id: String(action.id || "move-" + (index + 1)).trim(),
        label: label,
        prompt: prompt,
        generated: Boolean(action.prompt)
      };
    }).filter(Boolean).filter(function (action, index, list) {
      return list.findIndex(function (candidate) { return candidate.prompt.toLowerCase() === action.prompt.toLowerCase(); }) === index;
    }).slice(0, 5);

    if (!normalized.length && phase === "tutorial" && !hasOpening) {
      normalized = [{
        id: "continue",
        label: "Begin the opening",
        prompt: "I am ready to begin the story.",
        opening: true
      }];
    }
    if (!normalized.length && phase === "sandbox") {
      normalized = [
        { id: "observe", label: "Observe", prompt: actionLabel("observe") },
        { id: "listen", label: "Listen", prompt: actionLabel("listen") },
        { id: "roll", label: "Make a check", prompt: actionLabel("roll") }
      ];
    }

    heading.hidden = normalized.length === 0;
    row.hidden = normalized.length === 0;
    setText("#action-subtitle", actions && actions.length ? "Suggested by the DM" : "Rules-aware fallback");
    row.innerHTML = normalized.map(function (action, index) {
      var glyph = action.id === "roll" ? "d20" : index === 0 ? "✦" : "↗";
      var openingAttribute = action.opening ? ' data-game-action="continue"' : "";
      return '<button class="action-button action-button-generated' + (action.id === "roll" ? " action-button-roll" : "") + '" type="button" data-suggested-prompt="' + escapeHtml(action.prompt) + '"' + openingAttribute + ' title="' + escapeHtml(action.prompt) + '"' + (state.pendingPlayerText ? " disabled" : "") + '><span>' + glyph + '</span><strong>' + escapeHtml(action.label) + '</strong><small class="action-prompt">' + escapeHtml(action.prompt) + '</small></button>';
    }).join("");
  }

  function isSignedIn() {
    return Boolean((state.clerk && state.clerk.isSignedIn) || (state.config && state.config.devAuthBypass));
  }

  function setPanel(selector, hidden) {
    var panel = $(selector);
    if (panel) panel.hidden = hidden;
  }

  function renderCampaignList() {
    var wrap = $("#campaign-list-wrap");
    var list = $("#campaign-list");
    if (!wrap || !list) return;
    wrap.hidden = state.campaigns.length === 0;
    list.innerHTML = state.campaigns.map(function (campaign) {
      var active = state.session && state.session.id === campaign.id;
      var profile = campaign.campaign || {};
      var rules = campaign.contentPolicy && campaign.contentPolicy.gamesystem ? " · " + campaign.contentPolicy.gamesystem : "";
      return '<button class="campaign-card' + (active ? ' active' : '') + '" data-campaign-id="' + escapeHtml(campaign.id) + '"><span><strong>' + escapeHtml(profile.name || "Unnamed Campaign") + '</strong><small>' + escapeHtml(titleCase(campaign.phase || "character_creation")) + ' · ' + escapeHtml(profile.setting || "Open fantasy") + escapeHtml(rules) + '</small></span><span class="campaign-arrow">↗</span></button>';
    }).join("");
  }

  function renderCampaignList() {
    var wrap = $("#campaign-list-wrap");
    var list = $("#campaign-list");
    if (!wrap || !list) return;
    wrap.hidden = state.campaigns.length === 0;
    list.innerHTML = state.campaigns.map(function (campaign) {
      var active = state.session && state.session.id === campaign.id;
      var profile = campaign.campaign || {};
      var rules = campaign.contentPolicy && campaign.contentPolicy.gamesystem ? " / " + campaign.contentPolicy.gamesystem : "";
      var campaignName = profile.name || "Unnamed Campaign";
      var backendBadge = campaign.engineBackend === "reference" ? " / REFERENCE" : "";
      return '<article class="campaign-card' + (active ? ' active' : '') + '">' +
        '<button class="campaign-card-open" type="button" data-campaign-id="' + escapeHtml(campaign.id) + '" aria-label="Open ' + escapeHtml(campaignName) + '"><span><strong>' + escapeHtml(campaignName) + '</strong><small>' + escapeHtml(titleCase(campaign.phase || "character_creation") + ' / v' + (campaign.version || 0) + ' / ' + (profile.setting || "Open fantasy") + rules + backendBadge) + '</small></span><span class="campaign-arrow">-&gt;</span></button>' +
        '<div class="campaign-card-actions"><button class="campaign-delete-button" type="button" data-delete-campaign-id="' + escapeHtml(campaign.id) + '" aria-label="Delete ' + escapeHtml(campaignName) + '">Delete</button></div>' +
        '</article>';
    }).join("");
  }

  function renderOnboarding(payload) {
    var session = payload && payload.session;
    var snapshot = payload && payload.state || state.engineState || {};
    if (payload && Array.isArray(payload.campaigns)) state.campaigns = payload.campaigns;
    if (payload && Object.prototype.hasOwnProperty.call(payload, "setupRequired")) state.setupRequired = payload.setupRequired;
    renderCampaignList();

    var campaign = session && session.campaign || snapshot.campaign || null;
    var phase = session && session.phase || snapshot.phase || null;
    setText("#campaign-name", campaign ? campaign.name : "No campaign selected", "No campaign selected");
    setText("#campaign-tagline", campaign ? campaign.premise : "Build a world, then step into it.", "Build a world, then step into it.");
    var phaseButton = $("#phase-label");
    if (phaseButton) {
      phaseButton.hidden = Boolean(session);
      phaseButton.textContent = session ? titleCase(phase ? phase.replace(/_/g, " ") : "campaign") : "SET UP CAMPAIGN";
    }
    var manageButton = $("#manage-campaign-button");
    if (manageButton) {
      manageButton.hidden = !session || !isSignedIn();
      manageButton.textContent = state.managerOpen ? "Return to campaign" : "Manage campaigns";
    }

    if (!session && state.managerOpen && isSignedIn()) {
      setText("#play-title", "Manage your campaigns.");
      setPanel("#game-shell", true);
      setPanel("#character-setup", true);
      setPanel("#tutorial-panel", true);
      setPanel("#campaign-manager", false);
      setPanel("#campaign-auth-gate", true);
      setPanel("#campaign-form", !state.createMode && state.campaigns.length > 0);
      setPanel("#show-campaign-form", state.createMode || state.campaigns.length === 0);
      setText("#campaign-manager-copy", "Open a campaign, start a new one, or remove an old world from your account.");
      return;
    }

    if (!session) {
      setText("#play-title", isSignedIn() ? "Build your campaign." : "Take your seat.");
      setPanel("#game-shell", true);
      setPanel("#character-setup", true);
      setPanel("#tutorial-panel", true);
      setPanel("#campaign-manager", false);
      setPanel("#campaign-auth-gate", isSignedIn());
      setPanel("#campaign-form", !isSignedIn());
      setPanel("#show-campaign-form", true);
      setText("#campaign-manager-copy", isSignedIn() ? "Give the Dungeon Master a place, a premise, and a promise. You decide what kind of story this becomes." : "Sign in before creating a campaign. Your worlds and characters belong to your account.");
      return;
    }

    if (state.managerOpen) {
      setPanel("#game-shell", true);
      setPanel("#character-setup", true);
      setPanel("#tutorial-panel", true);
      setPanel("#campaign-manager", false);
      setPanel("#campaign-auth-gate", true);
      setPanel("#campaign-form", !state.createMode && state.campaigns.length > 0);
      setPanel("#show-campaign-form", state.createMode || state.campaigns.length === 0);
      setText("#campaign-manager-copy", "Open a campaign, start a new one, or remove an old world from your account.");
      return;
    }

    setPanel("#campaign-manager", true);
    setPanel("#campaign-auth-gate", true);
    setPanel("#show-campaign-form", true);
    if (phase === "character_creation") {
      setText("#play-title", "Create your character.");
      setPanel("#game-shell", true);
      setPanel("#character-setup", false);
      setPanel("#tutorial-panel", true);
      loadCharacterOptions();
      return;
    }
    if (phase === "tutorial") {
      var step = Number(session.tutorialStep || snapshot.tutorialStep || 0);
      var openingReady = Boolean(session.worldContext || snapshot.worldContext);
      if (openingReady) {
        setText("#play-title", "Your first scene is open.");
        setPanel("#game-shell", false);
        setPanel("#character-setup", true);
        setPanel("#tutorial-panel", true);
        return;
      }
      setText("#play-title", step > 0 ? "Learn the table." : "Your story begins now.");
      setPanel("#game-shell", true);
      setPanel("#character-setup", true);
      setPanel("#tutorial-panel", false);
      setText("#tutorial-title", step > 0 ? "One last rule." : "Learn the table.");
      setText("#tutorial-copy", step > 0 ? "You know how to speak to the world. Continue when you are ready to make it yours." : "Describe what you try in plain language. The engine resolves the rules, and the DM gives you the consequences.");
      setMarkdown("#tutorial-narration", step > 0 ? "The road is open. There is no correct quest; there is only the next choice." : (session.log && session.log.length ? session.log[session.log.length - 1].text : "You choose an action in plain language. The world answers.") );
      var tutorialStepOne = $("#tutorial-step-one");
      var tutorialStepTwo = $("#tutorial-step-two");
      if (tutorialStepOne) tutorialStepOne.className = step > 0 ? "complete" : "active";
      if (tutorialStepTwo) tutorialStepTwo.className = "";
      return;
    }
    setText("#play-title", "The next move is yours.");
    setPanel("#game-shell", false);
    setPanel("#character-setup", true);
    setPanel("#tutorial-panel", true);
  }

  function renderCustodyActors(session) {
    var node = $("#scene-actor-status");
    if (!node) return;
    var playerId = session && session.character && session.character.id;
    var rows = projectCustodyActors(session).filter(function (actor) { return actor.id !== playerId; });
    node.hidden = rows.length === 0;
    node.innerHTML = rows.map(function (actor) {
      return '<span class="condition-chip" title="' + escapeHtml("Source guard: " + actor.sourceGuardId + " / location: " + actor.locationRef) + '"><strong>' + escapeHtml(actor.name) + '</strong><small>' + escapeHtml(titleCase(actor.status)) + '</small></span>';
    }).join("");
  }

  function renderSession(payload) {
    var session = payload && payload.session;
    var previousSessionId = state.session && state.session.id;
    if (payload && payload.state) state.engineState = payload.state;
    if (payload && Object.prototype.hasOwnProperty.call(payload, "subscription")) state.subscription = payload.subscription;
    if (payload && Object.prototype.hasOwnProperty.call(payload, "engineBackend")) state.engineBackend = payload.engineBackend;
    state.session = session || null;
    if (session && session.id) writeActiveCampaignId(session.id);
    if (previousSessionId !== (state.session && state.session.id)) {
      state.characterOptions = null;
      state.characterOptionsCampaignId = null;
    }
    renderOnboarding(payload || {});
    if (!session) return;
    if (session.phase === "character_creation") loadCharacterOptions(session.id);
    var snapshot = payload.state || state.engineState || {};
    if (session.phase === "tutorial" && (session.characterCreated || (snapshot.character && snapshot.character.created)) && !session.worldContext && !snapshot.worldContext) {
      window.setTimeout(beginCampaignOpening, 0);
    }
    var character = session.character || snapshot.character;
    var combat = snapshot.combat || null;
    var campaign = session.campaign || snapshot.campaign || {};
    setText("#campaign-dossier-name", campaign.name, "Your campaign");
    setText("#campaign-dossier-setting", campaign.setting, "The world is yours to shape.");
    setText("#phase-status", titleCase(session.phase || "sandbox").toUpperCase(), "SANDBOX");
    renderCharacter(character);
    renderCustodyActors({
      character: character,
      worldContext: session.worldContext || snapshot.worldContext || null,
      controlledActors: session.controlledActors || snapshot.controlledActors || [],
    });
    renderNotes(session.playerNotes || snapshot.playerNotes || []);
    renderBeat(session.currentBeat || snapshot.currentBeat || null);
    renderQuests(session.quests || snapshot.quests || []);
    renderProceduralNotices(session.proceduralNotices || snapshot.proceduralNotices || []);
    renderCombat(combat);
    var narrationActions = payload && payload.narration && Array.isArray(payload.narration.suggestedActions)
      ? payload.narration.suggestedActions
      : null;
    var sessionActions = narrationActions || (Array.isArray(session.suggestedActions) ? session.suggestedActions : null)
      || (Array.isArray(snapshot.suggestedActions) ? snapshot.suggestedActions : []);
    state.suggestedActions = sessionActions;
    renderSuggestedActions(sessionActions, session, snapshot);

    var entries = Array.isArray(session.log) ? session.log : [];
    var logHtml = entries.map(function (entry) {
      var kind = String(entry.kind || "narration").replace(/[^a-z-]/g, "");
      var icon = kind === "roll" ? "d20" : kind === "system" ? "--" : kind === "player" ? "YOU" : "DM";
      return '<div class="log-entry ' + kind + '"><span class="log-icon">' + icon + '</span><div class="log-content markdown-body">' + renderMarkdown(entry.text) + '</div></div>';
    }).join("");
    var lastLogEntry = entries.length ? entries[entries.length - 1] : null;
    if (state.pendingPlayerText && (!lastLogEntry || lastLogEntry.text !== state.pendingPlayerText)) {
      logHtml += '<div class="log-entry player"><span class="log-icon">YOU</span><div class="log-content markdown-body">' + renderMarkdown(state.pendingPlayerText) + '</div></div>';
    }
    if (payload.narration && payload.narrationSource === "llm" && (!lastLogEntry || lastLogEntry.text !== payload.narration.text)) {
      logHtml += '<div class="log-entry narration dm-response"><span class="log-icon">DM</span><div class="log-content markdown-body">' + renderMarkdown(payload.narration.text) + '</div></div>';
    }
    var gameLog = $("#game-log");
    if (gameLog) {
      var wasNearBottom = !gameLog.dataset.initialized
        || gameLog.scrollHeight - gameLog.scrollTop - gameLog.clientHeight < 64;
      gameLog.classList.toggle("is-empty", !logHtml);
      gameLog.innerHTML = logHtml
        ? '<div class="log-stream">' + logHtml + '</div>'
        : '<div id="log-empty" class="log-empty"><span class="empty-glyph">✦</span><strong>The table is ready.</strong><p>Your campaign will take shape here.</p></div>';
      if (wasNearBottom) gameLog.scrollTop = gameLog.scrollHeight;
      gameLog.dataset.initialized = "true";
    }
    $("#integration-state").textContent = state.subscription ? "MEMBERSHIP " + state.subscription.status.toUpperCase() : "SERVER READY";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character];
    });
  }

  function renderMarkdown(value) {
    var source = String(value === undefined || value === null ? "" : value)
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ");
    if (!source.trim()) return "";

    var lines = source.split("\n");
    var html = [];
    var index = 0;

    function isHorizontalRule(line) {
      return /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line);
    }

    function tableCells(line) {
      var row = String(line || "").trim();
      if (row.charAt(0) === "|") row = row.slice(1);
      if (row.charAt(row.length - 1) === "|") row = row.slice(0, -1);
      var cells = [];
      var current = "";
      for (var charIndex = 0; charIndex < row.length; charIndex += 1) {
        var character = row.charAt(charIndex);
        if (character === "\\" && row.charAt(charIndex + 1) === "|") {
          current += "|";
          charIndex += 1;
        } else if (character === "|") {
          cells.push(current.trim());
          current = "";
        } else {
          current += character;
        }
      }
      cells.push(current.trim());
      return cells;
    }

    function isTableDivider(line) {
      var cells = tableCells(line);
      return cells.length > 0 && cells.every(function (cell) {
        return /^:?-{3,}:?$/.test(cell);
      });
    }

    function isBlockStart(at) {
      var candidate = lines[at] || "";
      if (/^\s*(?:\x60{3,}|~~~+)/.test(candidate)) return true;
      if (/^\s{0,3}#{1,6}\s+/.test(candidate)) return true;
      if (/^\s{0,3}>\s?/.test(candidate)) return true;
      if (/^\s{0,3}(?:[-+*]\s+|\d+[.)]\s+)/.test(candidate)) return true;
      if (isHorizontalRule(candidate)) return true;
      return candidate.indexOf("|") !== -1 && at + 1 < lines.length && isTableDivider(lines[at + 1]);
    }

    function listHtml(items, ordered) {
      var tag = ordered ? "ol" : "ul";
      return "<" + tag + ">" + items.map(function (item) {
        return "<li>" + renderInlineMarkdown(item) + "</li>";
      }).join("") + "</" + tag + ">";
    }

    while (index < lines.length) {
      var line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      var fence = line.match(/^\s*(\x60{3,}|~~~+)\s*([A-Za-z0-9_-]+)?\s*$/);
      if (fence) {
        var closing = fence[1].charAt(0) === "~" ? /^\s*~{3,}\s*$/ : /^\s*\x60{3,}\s*$/;
        var codeLines = [];
        index += 1;
        while (index < lines.length && !closing.test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        var language = fence[2] ? ' data-language="' + escapeHtml(fence[2]) + '"' : "";
        html.push('<pre class="markdown-code"' + language + '><code>' + escapeHtml(codeLines.join("\n")) + "</code></pre>");
        continue;
      }

      var heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        var headingText = heading[2].replace(/\s+#+\s*$/, "");
        html.push("<h" + heading[1].length + ">" + renderInlineMarkdown(headingText) + "</h" + heading[1].length + ">");
        index += 1;
        continue;
      }

      if (isHorizontalRule(line)) {
        html.push("<hr>");
        index += 1;
        continue;
      }

      if (/^\s{0,3}>\s?/.test(line)) {
        var quoteLines = [];
        while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index])) {
          quoteLines.push(lines[index].replace(/^\s{0,3}>\s?/, ""));
          index += 1;
        }
        html.push("<blockquote>" + renderMarkdown(quoteLines.join("\n")) + "</blockquote>");
        continue;
      }

      if (line.indexOf("|") !== -1 && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
        var headers = tableCells(line);
        var dividers = tableCells(lines[index + 1]);
        var rows = [];
        index += 2;
        while (index < lines.length && lines[index].trim() && lines[index].indexOf("|") !== -1) {
          rows.push(tableCells(lines[index]));
          index += 1;
        }
        var headerHtml = headers.map(function (cell, cellIndex) {
          var alignment = dividers[cellIndex] || "";
          var align = alignment.charAt(0) === ":" ? "left" : alignment.charAt(alignment.length - 1) === ":" ? "right" : "center";
          return '<th style="text-align:' + align + '">' + renderInlineMarkdown(cell) + "</th>";
        }).join("");
        var bodyHtml = rows.map(function (row) {
          return "<tr>" + headers.map(function (_header, cellIndex) {
            return '<td>' + renderInlineMarkdown(row[cellIndex] || "") + "</td>";
          }).join("") + "</tr>";
        }).join("");
        html.push('<div class="markdown-table-wrap"><table class="markdown-table"><thead><tr>' + headerHtml + "</tr></thead>" + (bodyHtml ? "<tbody>" + bodyHtml + "</tbody>" : "") + "</table></div>");
        continue;
      }

      var unordered = line.match(/^\s{0,3}[-+*]\s+(.+)$/);
      var ordered = line.match(/^\s{0,3}\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        var orderedList = Boolean(ordered);
        var listPattern = ordered ? /^\s{0,3}\d+[.)]\s+(.+)$/ : /^\s{0,3}[-+*]\s+(.+)$/;
        var items = [];
        while (index < lines.length) {
          var itemMatch = lines[index].match(listPattern);
          if (!itemMatch) break;
          var itemLines = [itemMatch[1]];
          index += 1;
          while (index < lines.length && lines[index].trim()) {
            if (listPattern.test(lines[index]) || isBlockStart(index)) break;
            if (/^\s+/.test(lines[index])) {
              itemLines.push(lines[index].replace(/^\s{2,}/, ""));
              index += 1;
            } else {
              break;
            }
          }
          items.push(itemLines.join("\n"));
        }
        html.push(listHtml(items, orderedList));
        continue;
      }

      var paragraphLines = [line];
      index += 1;
      while (index < lines.length && lines[index].trim() && !isBlockStart(index)) {
        paragraphLines.push(lines[index]);
        index += 1;
      }
      html.push("<p>" + renderInlineMarkdown(paragraphLines.join("\n")) + "</p>");
    }

    return html.join("");
  }

  function markdownFeatureDetailHtml(feature) {
    return '<details class="feature-detail"><summary><span>' + escapeHtml(feature.name || "Feature") + '</span><small>' + escapeHtml(feature.sourceName || feature.sourceType || "Rules") + '</small></summary><div class="markdown-body">' + renderMarkdown(feature.description || "No source description is available in this pack.") + '</div></details>';
  }

  function markdownSourceDetailHtml(label, source) {
    if (!source) return "";
    return '<details class="source-detail"><summary><span>' + escapeHtml(label + " / " + source.name) + '</span></summary><div class="markdown-body">' + renderMarkdown(source.description || "No source description is available in this pack.") + '</div></details>';
  }

  function renderInlineMarkdown(value) {
    var source = String(value === undefined || value === null ? "" : value);
    var tokens = [];
    var stash = function (markup) {
      var token = "\u0000md" + tokens.length + "\u0000";
      tokens.push(markup);
      return token;
    };

    source = source.replace(/\\([\\\x60*_[\]{}()#+.!|-])/g, function (_match, character) {
      return stash(escapeHtml(character));
    });
    source = source.replace(/\x60([^\n\x60]+)\x60/g, function (_match, code) {
      return stash("<code>" + escapeHtml(code) + "</code>");
    });
    source = source.replace(/!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g, function (_match, alt) {
      return stash("<span class=\"markdown-image-label\">" + escapeHtml(alt || "Image") + "</span>");
    });
    source = source.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)(?:\s+["'][^)]*["'])?\)/gi, function (_match, label, url) {
      return stash('<a href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">' + renderInlineMarkdown(label) + "</a>");
    });
    source = source.replace(/(^|[\s(])((?:https?:\/\/)[^\s<]+)/gi, function (_match, prefix, url) {
      var trailing = "";
      while (/[.,!?;:\])}]$/.test(url)) {
        trailing = url.slice(-1) + trailing;
        url = url.slice(0, -1);
      }
      return prefix + stash('<a href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">' + escapeHtml(url) + "</a>") + trailing;
    });

    var escaped = escapeHtml(source);
    escaped = escaped.replace(/(\*\*|__)(.+?)\1/g, "<strong>$2</strong>");
    escaped = escaped.replace(/~~(.+?)~~/g, "<del>$1</del>");
    escaped = escaped.replace(/(^|[^\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
    escaped = escaped.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
    escaped = escaped.replace(/  \n/g, "<br>");
    escaped = escaped.replace(/\n/g, "<br>");
    return escaped.replace(/\u0000md(\d+)\u0000/g, function (_match, tokenIndex) {
      return tokens[Number(tokenIndex)] || "";
    });
  }

  function refreshSession() {
    var sequence = nextRequestSequence(state.sessionRefreshSequence);
    state.sessionRefreshSequence = sequence;
    var pendingCommand = readPendingCommand();
    var preferredCampaignId = pendingCommand ? pendingCommand.campaignId : readActiveCampaignId();
    function resumePendingCommand() {
      var pending = readPendingCommand();
      if (!pending || state.pendingPlayerText || !state.session || state.session.id !== pending.campaignId) return Promise.resolve(false);
      state.pendingPlayerText = pending.playerText || "Your submitted action";
      renderSession({ session: state.session, state: state.engineState, subscription: state.subscription });
      return reconcilePendingCommand(pending.campaignId, pending.clientCommandId);
    }
    function applySessionResult(result) {
      if (!result) return null;
      if (!isCurrentRequest(sequence, state.sessionRefreshSequence)) return result.data;
      if (result.response.status === 401) {
        state.session = null;
        state.engineState = null;
        state.campaigns = [];
        state.characterOptions = null;
        state.characterOptionsCampaignId = null;
        state.characterOptionsLoading = null;
        state.setupRequired = false;
        state.subscription = null;
        clearActiveCampaignId();
        renderSession({ session: null, campaigns: [], setupRequired: false });
        setStatus("Sign in to begin your campaign", "auth");
        return;
      }
      if (!result.response.ok) throw new Error(result.data.error || "The table is unavailable.");
      renderSession(result.data);
      if (result.data.session && result.data.session.phase === "sandbox") setStatus("Your campaign is waiting", "ready");
      else if (result.data.session) setStatus("Your campaign is being built", "ready");
      else setStatus("Choose your world", "ready");
      if (!result.data.session && Array.isArray(result.data.campaigns) && result.data.campaigns.length > 0) {
        var campaignToLoad = pendingCommand && result.data.campaigns.some(function (campaign) { return campaign.id === pendingCommand.campaignId; })
          ? pendingCommand.campaignId
          : result.data.campaigns[0].id;
        return loadCampaign(campaignToLoad).then(function () {
          return resumePendingCommand().then(function () { return result.data; });
        });
      }
      return resumePendingCommand().then(function () { return result.data; });
    }
    function requestSession(url, attempt) {
      if (!isCurrentRequest(sequence, state.sessionRefreshSequence)) return Promise.resolve(null);
      var currentAttempt = attempt || 1;
      return requestJson(url).then(function (result) {
        if (!isCurrentRequest(sequence, state.sessionRefreshSequence)) return null;
        if (shouldRetryCampaignLoad(result.response.status) && currentAttempt < 3) {
          setStatus("Reconnecting to your campaign", "thinking");
          return waitForCampaignRetry(currentAttempt).then(function () {
            return requestSession(url, currentAttempt + 1);
          });
        }
        return result;
      }, function (error) {
        if (!isCurrentRequest(sequence, state.sessionRefreshSequence)) return null;
        if (currentAttempt < 3) {
          setStatus("Reconnecting to your campaign", "thinking");
          return waitForCampaignRetry(currentAttempt).then(function () {
            return requestSession(url, currentAttempt + 1);
          });
        }
        throw error;
      });
    }
    return requestSession(campaignSessionUrl(preferredCampaignId)).then(function (result) {
      if (!result) return null;
      if (result.response.status === 404 && preferredCampaignId) {
        if (!isCurrentRequest(sequence, state.sessionRefreshSequence)) return null;
        if (pendingCommand && pendingCommand.campaignId === preferredCampaignId) clearPendingCommand(pendingCommand.clientCommandId);
        clearActiveCampaignId();
        return requestSession("/api/session").then(applySessionResult);
      }
      return applySessionResult(result);
    }).catch(function (error) {
      if (sequence !== state.sessionRefreshSequence) return null;
      if (!state.session) renderSession({ session: null, campaigns: state.campaigns, setupRequired: false });
      setStatus("The table needs a moment", "error");
      showToast(error.message);
      return null;
    });
  }

  function newCommandId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (character) {
      var random = Math.random() * 16 | 0;
      var value = character === "x" ? random : random & 3 | 8;
      return value.toString(16);
    });
  }

  function campaignEngineBackend(campaignId) {
    var known = state.campaigns.find(function (campaign) { return campaign.id === campaignId; });
    if (known) return known.engineBackend;
    // Fall back to the currently-rendered campaign's backend only when it's
    // actually the one being reconciled (state.campaigns may not be loaded
    // yet, e.g. right after sign-in).
    if (state.session && state.session.id === campaignId) return state.engineBackend;
    return undefined;
  }

  function reconcilePendingCommand(campaignId, clientCommandId) {
    if (campaignEngineBackend(campaignId) === "reference") {
      // Reference-backend commands resolve synchronously inside the
      // original POST /commands call -- there is no async job for
      // GET /commands/:id to ever find (that endpoint only knows about
      // Lantern's command queue). If we're reconciling at all, the original
      // request's outcome was already lost (network drop, page reload) or it
      // failed; either way there's nothing left to poll for, so report it as
      // not committed immediately instead of hammering an endpoint that can
      // only ever 404. Every call site above funnels through here, so this
      // one check covers all of them. Mirrors the confirmedMissing branch
      // below exactly, just without ever polling for it.
      clearPendingCommand(clientCommandId);
      state.pendingPlayerText = null;
      renderSession({ session: state.session, state: state.engineState, subscription: state.subscription });
      setStatus("That turn was not committed; you can try again.", "ready");
      showToast("The server confirmed that turn was not committed.");
      return Promise.resolve(false);
    }
    var attempts = 0;
    var maxAttempts = 80;
    var pollDelayMs = 1500;

    function waitForNextPoll() {
      return new Promise(function (resolve) {
        window.setTimeout(resolve, pollDelayMs);
      });
    }

    function poll() {
      attempts += 1;
      return requestJson(
        "/api/campaigns/" + encodeURIComponent(campaignId) + "/commands/" + encodeURIComponent(clientCommandId)
      ).then(function (result) {
        if (isConfirmedMissingCommand(result.response.status, result.data.code)) {
          return { resolved: false, confirmedMissing: true };
        }
        if (result.response.ok && result.data.status === "resolved" && result.data.result) {
          if (isStaleCommandStatus(result.data)) {
            return refreshSession().then(function (current) {
              var currentVersion = Number(result.data.campaignVersion);
              if (current && current.session && Number(current.session.version) >= currentVersion) {
                return { resolved: true, result: current };
              }
              if (attempts >= maxAttempts) return { resolved: false, pending: true };
              return waitForNextPoll().then(poll);
            });
          }
          return { resolved: true, result: result.data.result };
        }
        if (attempts >= maxAttempts) return { resolved: false, pending: true };
        setStatus("Reconnecting to the committed turn", "thinking");
        return waitForNextPoll().then(poll);
      }).catch(function () {
        if (attempts >= maxAttempts) return { resolved: false, pending: true };
        return waitForNextPoll().then(poll);
      });
    }

    setStatus("Reconnecting to the committed turn", "thinking");
    return poll().then(function (outcome) {
      if ((outcome.resolved || outcome.confirmedMissing) && !isCurrentPendingCommand(campaignId, clientCommandId)) {
        return refreshSession().then(function () { return false; });
      }
      if (outcome.resolved) {
        clearPendingCommand(clientCommandId);
        state.pendingPlayerText = null;
        renderSession(outcome.result);
        setStatus("The world answers", "ready");
        return true;
      }
      if (outcome.confirmedMissing) {
        clearPendingCommand(clientCommandId);
        state.pendingPlayerText = null;
        renderSession({ session: state.session, state: state.engineState, subscription: state.subscription });
        setStatus("That turn was not committed; you can try again.", "ready");
        showToast("The server confirmed that turn was not committed.");
        return false;
      }
      return refreshSession().then(function () {
        setStatus(
          outcome.pending
            ? "This turn is still reconciling; keep this tab open."
            : "The table is current; confirm this turn before retrying.",
          "thinking"
        );
        showToast("The server has not confirmed this turn yet. Your text remains in the composer.");
        return false;
      });
    }).catch(function () {
      setStatus("This turn is still reconciling; keep this tab open.", "thinking");
      showToast("The server has not confirmed this turn yet. Your text remains in the composer.");
      return false;
    });
  }

  function submitCommand(command, clientCommandId) {
    if (!state.session) {
      if (isSignedIn()) {
        setStatus("Your campaign is still loading", "error");
        showToast("Your campaign has not loaded yet. Retrying the table connection.");
        refreshSession();
      } else {
        showToast("Sign in to begin your campaign.");
        openAuth();
      }
      return Promise.resolve(false);
    }

    var campaignId = state.session.id;
    var campaignPath = encodeURIComponent(campaignId);
    var commandId = clientCommandId || newCommandId();
    var pendingCommand = readPendingCommand();
    if (isPendingCommandConflict(pendingCommand, campaignId, commandId)) {
      state.pendingPlayerText = pendingCommand.playerText || "Your submitted action";
      renderSession({ session: state.session, state: state.engineState, subscription: state.subscription });
      setStatus("This turn is still reconciling; keep this tab open.", "thinking");
      showToast("Your earlier turn is still reconciling. Wait for it to settle before submitting another action.");
      reconcilePendingCommand(pendingCommand.campaignId, pendingCommand.clientCommandId);
      return Promise.resolve(false);
    }
    var expectedCampaignVersion = state.session.version;
    state.pendingPlayerText = command.playerText || actionLabel(command.action);
    writePendingCommand({ campaignId: campaignId, clientCommandId: commandId, playerText: state.pendingPlayerText });
    renderSession({ session: state.session, state: state.engineState, subscription: state.subscription });
    setStatus("The DM is thinking", "thinking");
    return requestJson("/api/campaigns/" + campaignPath + "/commands", {
      method: "POST",
      body: JSON.stringify(Object.assign({
        clientCommandId: commandId,
        expectedCampaignVersion: expectedCampaignVersion
      }, command))
    }).then(function (result) {
      if (result.response.status === 401) {
        clearPendingCommand(commandId);
        state.pendingPlayerText = null;
        openAuth();
        return false;
      }
      if (result.response.status === 409 && result.data.code === "stale_version" && result.data.session) {
        clearPendingCommand(commandId);
        state.pendingPlayerText = null;
        renderSession({ session: result.data.session, subscription: state.subscription });
        setStatus("The table moved; your view is current", "ready");
        return false;
      }
      if (result.response.status === 409 && result.data.code === "command_conflict") {
        return reconcilePendingCommand(campaignId, commandId);
      }
      if (result.response.status >= 500 || result.response.status === 408 || result.response.status === 429) {
        return reconcilePendingCommand(campaignId, commandId);
      }
      if (!result.response.ok) {
        var commandError = new Error(result.data.error || "That action could not be resolved.");
        commandError.reconcile = false;
        throw commandError;
      }
      if (!isCurrentPendingCommand(campaignId, commandId)) {
        return refreshSession().then(function () { return false; });
      }
      clearPendingCommand(commandId);
      state.pendingPlayerText = null;
      renderSession(result.data);
      setStatus("The world answers", "ready");
      return true;
    }).catch(function (error) {
      if (error && error.reconcile === false) {
        clearPendingCommand(commandId);
        state.pendingPlayerText = null;
        renderSession({ session: state.session, state: state.engineState, subscription: state.subscription });
        setStatus("The table needs a moment", "error");
        showToast(error.message);
        return false;
      }
      return reconcilePendingCommand(campaignId, commandId);
    }).catch(function (error) {
      var pending = readPendingCommand();
      if (!isPendingCommandResponseCurrent(pending, campaignId, commandId)) {
        return refreshSession().then(function () { return false; });
      }
      state.pendingPlayerText = pending && pending.clientCommandId === commandId ? pending.playerText : null;
      renderSession({ session: state.session, state: state.engineState, subscription: state.subscription });
      setStatus("This turn is still reconciling; keep this tab open.", "thinking");
      showToast(error.message || "The turn is still reconciling.");
      return false;
    });
  }

  function playAction(action) {
    if (action === "continue" && state.session && state.session.phase === "tutorial" && !(state.session.worldContext || (state.engineState && state.engineState.worldContext))) {
      return beginCampaignOpening();
    }
    if (action === "observe" || action === "listen" || action === "roll") {
      return submitCommand({ playerText: actionLabel(action) });
    }
    return submitCommand({ action: action });
  }

  function playText(playerText, clientCommandId) {
    return submitCommand({ playerText: playerText }, clientCommandId);
  }

  function createCampaign(event) {
    event.preventDefault();
    if (!isSignedIn()) { openAuth(); return; }
    var form = $("#campaign-form");
    var submit = form.querySelector("button[type=submit]");
    var feedback = $("#campaign-form-feedback");
    var payload = {
      name: $("#campaign-name-input").value.trim(),
      premise: $("#campaign-premise-input").value.trim(),
      setting: $("#campaign-setting-input").value.trim(),
      tone: $("#campaign-tone-input").value
    };
    var contentPolicy = campaignContentPolicyPayload();
    if (contentPolicy) payload.contentPolicy = contentPolicy;
    if (!payload.name || !payload.premise || !payload.setting) return;
    submit.disabled = true;
    feedback.textContent = "The world is taking shape…";
    requestJson("/api/campaigns", { method: "POST", body: JSON.stringify(payload) }).then(function (result) {
      if (!result.response.ok) throw new Error(result.data.error || "The campaign could not be created.");
      state.managerOpen = false;
      state.createMode = false;
      renderSession(result.data);
      setStatus("Create your character", "ready");
    }).catch(function (error) {
      feedback.textContent = error.message;
      showToast(error.message);
    }).finally(function () { submit.disabled = false; });
  }

  function rollCharacterStats() {
    if (!state.session || state.session.phase !== "character_creation") {
      showToast("Ability scores can only be rolled during character creation.");
      return;
    }
    var button = $("#character-roll-stats");
    var feedback = $("#character-form-feedback");
    if (button) button.disabled = true;
    if (feedback) feedback.textContent = "The engine is rolling six 4d6 sets…";
    requestJson("/api/campaigns/" + encodeURIComponent(state.session.id) + "/character/roll-stats", {
      method: "POST",
      body: JSON.stringify({
        clientCommandId: newCommandId(),
        expectedCampaignVersion: state.session.version
      })
    }).then(function (result) {
      if (result.response.status === 409 && result.data.session) {
        renderSession({ session: result.data.session, state: result.data.state, campaigns: state.campaigns, subscription: state.subscription });
        throw new Error(result.data.error || "The campaign changed; your view was refreshed.");
      }
      if (!result.response.ok) throw new Error(result.data.error || "The engine could not roll ability scores.");
      renderSession(result.data);
      var method = $("#character-ability-method");
      if (method) method.value = "rolled";
      renderAbilityScoreFields();
      if (feedback) feedback.textContent = "Assign the six rolled values, then enter the story.";
      setStatus("Assign your ability scores", "ready");
    }).catch(function (error) {
      if (feedback) feedback.textContent = error.message;
      showToast(error.message);
    }).finally(function () {
      if (button) button.disabled = false;
    });
  }

  function beginCampaignOpening() {
    if (!state.session || state.session.phase !== "tutorial") return Promise.resolve(false);
    var snapshot = state.engineState || {};
    if (state.session.worldContext || snapshot.worldContext) return Promise.resolve(true);
    if (state.openingLoadingCampaignId === state.session.id) return Promise.resolve(false);
    var campaignId = state.session.id;
    state.openingLoadingCampaignId = campaignId;
    var feedback = $("#tutorial-feedback");
    if (feedback) feedback.textContent = "The DM is opening the first situation…";
    return requestJson("/api/campaigns/" + encodeURIComponent(campaignId) + "/opening", {
      method: "POST",
      body: JSON.stringify({
        clientCommandId: newCommandId(),
        expectedCampaignVersion: state.session.version
      })
    }).then(function (result) {
      if (result.response.status === 409 && result.data.session) {
        renderSession({ session: result.data.session, state: result.data.state, campaigns: state.campaigns, subscription: state.subscription });
        return false;
      }
      if (!result.response.ok) throw new Error(result.data.error || "The DM could not open the story.");
      renderSession(result.data);
      return true;
    }).catch(function (error) {
      if (feedback) feedback.textContent = error.message + " You can try again.";
      showToast(error.message);
      return false;
    }).finally(function () {
      state.openingLoadingCampaignId = null;
    });
  }

  function createCharacter(event) {
    event.preventDefault();
    if (!state.session) { showToast("Create a campaign before creating a character."); return; }
    if (!state.characterOptions) { showToast("The Open5e character options are still loading."); loadCharacterOptions(); return; }
    var form = $("#character-form");
    var submit = form.querySelector("button[type=submit]");
    var feedback = $("#character-form-feedback");
    var species = findCharacterOption("species", $("#character-species-input").value);
    var characterClass = findCharacterOption("classes", $("#character-class-input").value);
    var background = findCharacterOption("backgrounds", $("#character-background-choice").value);
    var alignment = findCharacterOption("alignments", $("#character-alignment-choice").value);
    if (!species || !characterClass || !background || !alignment) {
      feedback.textContent = "Choose a species, class, background, and alignment.";
      return;
    }
    var abilityScoreMethod = $("#character-ability-method").value || "standard_array";
    var abilityScorePool = scorePoolForMethod(abilityScoreMethod);
    var abilityScores = {};
    var abilityScoreValues = [];
    document.querySelectorAll("#character-ability-score-options select[data-ability-score]").forEach(function (select) {
      var value = Number(select.value);
      abilityScores[select.dataset.abilityScore] = value;
      abilityScoreValues.push(value);
    });
    if (abilityScoreValues.length !== ABILITY_SCORE_FIELDS.length || !abilityScoreValues.every(function (value) { return Number.isInteger(value); }) || !sameScorePool(abilityScoreValues, abilityScorePool)) {
      feedback.textContent = abilityScoreMethod === "rolled"
        ? "Assign each of the six rolled values exactly once."
        : "Assign the standard array values 15, 14, 13, 12, 10, and 8 exactly once.";
      return;
    }
    var draft = state.engineState && state.engineState.characterCreation && state.engineState.characterCreation.abilityScoreDraft;
    if (abilityScoreMethod === "rolled" && !draft) {
      feedback.textContent = "Roll your ability scores before entering the story.";
      return;
    }
    var abilityContentKeys = checkedCharacterValues("#character-ability-choice-options");
    var abilityBonusChoices = abilityContentKeys.map(function (contentKey) {
      var ability = findCharacterOption("abilities", contentKey);
      return ability && ability.abbreviation;
    }).filter(Boolean);
    var skillKeys = checkedCharacterValues("#character-skill-choice-options");
    var languageKeys = checkedCharacterValues("#character-language-choice-options");
    var toolProficiencies = Array.from(document.querySelectorAll("#character-tool-choice-options select[data-tool-choice-source]"))
      .map(function (select) { return select.value.trim(); })
      .filter(Boolean);
    var expectedAbilityChoices = species.abilityChoice ? Number(species.abilityChoice.count) : 0;
    var expectedSkillChoices = Number(characterClass.skillChoice && characterClass.skillChoice.count || 0) + Number(background.skillChoice && background.skillChoice.count || 0);
    var expectedLanguageChoices = Number(species.languageChoiceCount || 0) + Number(background.languageChoiceCount || 0);
    var expectedToolChoices = Number(characterClass.toolChoice && characterClass.toolChoice.count || 0) + Number(background.toolChoice && background.toolChoice.count || 0);
    var selectionError = [
      [abilityBonusChoices.length, expectedAbilityChoices, "ability bonuses"],
      [skillKeys.length, expectedSkillChoices, "skills"],
      [languageKeys.length, expectedLanguageChoices, "languages"],
      [toolProficiencies.length, expectedToolChoices, "tool proficiencies"]
    ].find(function (entry) { return entry[0] !== entry[1]; });
    if (selectionError) {
      feedback.textContent = "Choose exactly " + selectionError[1] + " " + selectionError[2] + ".";
      return;
    }
    if (new Set(toolProficiencies.map(toolKey)).size !== toolProficiencies.length) {
      feedback.textContent = "Choose a different tool for each proficiency slot.";
      return;
    }
    var payload = {
      clientCommandId: newCommandId(),
      expectedCampaignVersion: state.session.version,
      name: $("#character-name-input").value.trim(),
      speciesKey: species.contentKey,
      classKey: characterClass.contentKey,
      backgroundKey: background.contentKey,
      alignmentKey: alignment.contentKey,
      abilityScoreMethod: abilityScoreMethod,
      abilityScoreDraftId: abilityScoreMethod === "rolled" && draft ? draft.id : undefined,
      abilityScores: abilityScores,
      abilityBonusChoices: abilityBonusChoices,
      skillKeys: skillKeys,
      languageKeys: languageKeys,
      toolProficiencies: toolProficiencies
    };
    if (!payload.name) return;
    submit.disabled = true;
    feedback.textContent = "Placing your character in the world…";
    requestJson("/api/campaigns/" + encodeURIComponent(state.session.id) + "/character", { method: "POST", body: JSON.stringify(payload) }).then(function (result) {
      if (result.response.status === 409 && result.data.session) {
        renderSession({ session: result.data.session, state: result.data.state, campaigns: state.campaigns, subscription: state.subscription });
        throw new Error(result.data.error || "The campaign changed; your view was refreshed.");
      }
      if (!result.response.ok) throw new Error(result.data.error || "The character could not be created.");
      renderSession(result.data);
      setStatus("The DM is opening your story", "thinking");
      return beginCampaignOpening().then(function (opened) {
        setStatus(opened ? "Your story is open" : "The story is waiting for the DM", opened ? "ready" : "error");
        return true;
      });
    }).catch(function (error) {
      feedback.textContent = error.message;
      showToast(error.message);
    }).finally(function () { submit.disabled = false; });
  }

  function editCharacter(event) {
    event.preventDefault();
    if (!state.session) return;
    var form = event.currentTarget;
    var button = form.querySelector("button[type=submit]");
    var feedback = $("#character-edit-feedback");
    var payload = {
      clientCommandId: newCommandId(),
      expectedCampaignVersion: state.session.version,
      description: $("#character-description-input").value.trim(),
      details: {
        playerName: $("#character-player-name-input").value.trim(),
        age: $("#character-age-input").value.trim(),
        height: $("#character-height-input").value.trim(),
        weight: $("#character-weight-input").value.trim(),
        eyes: $("#character-eyes-input").value.trim(),
        skin: $("#character-skin-input").value.trim(),
        hair: $("#character-hair-input").value.trim(),
        factionName: $("#character-faction-input").value.trim(),
        personalityTraits: $("#character-personality-input").value.trim(),
        ideals: $("#character-ideals-input").value.trim(),
        bonds: $("#character-bonds-input").value.trim(),
        flaws: $("#character-flaws-input").value.trim(),
        appearance: $("#character-appearance-input").value.trim(),
        backstory: $("#character-backstory-input").value.trim(),
        allies: $("#character-allies-input").value.trim(),
        treasure: $("#character-treasure-input").value.trim(),
        inspiration: Boolean($("#character-inspiration-input").checked),
        temporaryHp: Math.max(0, Number($("#character-temp-hp-input").value || 0))
      }
    };
    if (!payload.description && !Object.keys(payload.details).some(function (key) { return key !== "inspiration" && key !== "temporaryHp" && payload.details[key]; }) && !payload.details.inspiration && payload.details.temporaryHp === 0) return;
    if (button) button.disabled = true;
    if (feedback) feedback.textContent = "Saving your details…";
    requestJson("/api/campaigns/" + encodeURIComponent(state.session.id) + "/character", { method: "PATCH", body: JSON.stringify(payload) }).then(function (result) {
      if (result.response.status === 409 && result.data.session) {
        renderSession({ session: result.data.session, state: result.data.state, campaigns: state.campaigns, subscription: state.subscription });
        throw new Error("The campaign changed; your view was refreshed. Try saving again.");
      }
      if (!result.response.ok) throw new Error(result.data.error || "Your character details could not be saved.");
      renderSession(result.data);
      if (feedback) feedback.textContent = "Character details saved.";
    }).catch(function (error) {
      if (feedback) feedback.textContent = error.message;
      showToast(error.message);
    }).finally(function () { if (button) button.disabled = false; });
  }

  function inventoryAction(event) {
    var button = event.target.closest("[data-inventory-action]");
    if (!button || !state.session) return;
    var action = button.dataset.inventoryAction;
    var payload = {
      clientCommandId: newCommandId(),
      expectedCampaignVersion: state.session.version,
      action: action,
      itemId: button.dataset.itemId
    };
    if (action === "equip") payload.slot = button.dataset.itemSlot;
    button.disabled = true;
    requestJson("/api/campaigns/" + encodeURIComponent(state.session.id) + "/inventory", { method: "POST", body: JSON.stringify(payload) }).then(function (result) {
      if (result.response.status === 409 && result.data.session) {
        renderSession({ session: result.data.session, state: result.data.state, campaigns: state.campaigns, subscription: state.subscription });
        throw new Error("The campaign changed; your view was refreshed.");
      }
      if (!result.response.ok) throw new Error(result.data.error || "That inventory action could not be resolved.");
      renderSession(result.data);
      setStatus("Inventory updated", "ready");
    }).catch(function (error) {
      showToast(error.message);
    }).finally(function () { button.disabled = false; });
  }

  function addNote(event) {
    event.preventDefault();
    if (!state.session) {
      showToast("Create or open a campaign before adding a note.");
      return;
    }
    var input = $("#note-input");
    var feedback = $("#note-feedback");
    var text = input && input.value.trim();
    if (!text) return;
    var button = event.currentTarget.querySelector("button[type=submit]");
    if (button) button.disabled = true;
    if (feedback) feedback.textContent = "Saving note…";
    requestJson("/api/campaigns/" + encodeURIComponent(state.session.id) + "/notes", {
      method: "POST",
      body: JSON.stringify({
        clientCommandId: newCommandId(),
        expectedCampaignVersion: state.session.version,
        text: text
      })
    }).then(function (result) {
      if (result.response.status === 409 && result.data.session) {
        renderSession({ session: result.data.session, state: result.data.state, campaigns: state.campaigns, subscription: state.subscription });
        throw new Error("The campaign changed; your view was refreshed. Try saving the note again.");
      }
      if (!result.response.ok) throw new Error(result.data.error || "The note could not be saved.");
      renderSession(result.data);
      if (input) input.value = "";
      if (feedback) feedback.textContent = "Saved to the campaign.";
    }).catch(function (error) {
      if (feedback) feedback.textContent = error.message;
      showToast(error.message);
    }).finally(function () {
      if (button) button.disabled = false;
    });
  }

  function loadCampaign(campaignId) {
    var pendingCommand = readPendingCommand();
    if (pendingCommand && pendingCommand.campaignId !== campaignId) {
      showToast("Your submitted turn is still reconciling. Keep this campaign open.");
      if (!state.pendingPlayerText) {
        state.pendingPlayerText = pendingCommand.playerText || "Your submitted action";
        renderSession({ session: state.session, state: state.engineState, subscription: state.subscription });
        reconcilePendingCommand(pendingCommand.campaignId, pendingCommand.clientCommandId);
      }
      return Promise.resolve(false);
    }
    // A new explicit selection supersedes any refresh/retry chain for the prior campaign.
    state.sessionRefreshSequence = nextRequestSequence(state.sessionRefreshSequence);
    var loadSequence = state.campaignLoadSequence + 1;
    state.campaignLoadSequence = loadSequence;
    state.pendingCampaignLoadId = campaignId;
    var attempt = 0;
    function isCurrentLoad() {
      return isCurrentRequest(loadSequence, state.campaignLoadSequence)
        && isCurrentCampaignSelection(campaignId, state.pendingCampaignLoadId);
    }
    function requestCampaign() {
      if (!isCurrentLoad()) return Promise.resolve(false);
      attempt += 1;
      return requestJson("/api/campaigns/" + encodeURIComponent(campaignId)).then(function (result) {
        if (!isCurrentLoad()) return false;
        if (!result.response.ok) {
          if (shouldRetryCampaignLoad(result.response.status) && attempt < 3) {
            setStatus("Reconnecting to your campaign", "thinking");
            return waitForCampaignRetry(attempt).then(requestCampaign);
          }
          throw new Error(result.data.error || "That campaign could not be opened.");
        }
        if (!isCurrentLoad()) return false;
        writeActiveCampaignId(campaignId);
        state.managerOpen = false;
        state.createMode = false;
        renderSession({ session: result.data.campaign, state: result.data.state, campaigns: state.campaigns, subscription: result.data.subscription });
        setStatus("Campaign loaded", "ready");
        return true;
      }, function (error) {
        if (!isCurrentLoad()) return false;
        if (attempt < 3) {
          setStatus("Reconnecting to your campaign", "thinking");
          return waitForCampaignRetry(attempt).then(requestCampaign);
        }
        throw error;
      });
    }
    return requestCampaign().catch(function (error) {
      if (!isCurrentLoad()) return false;
      state.managerOpen = true;
      state.createMode = false;
      renderOnboarding({ session: state.session, state: state.engineState, campaigns: state.campaigns, subscription: state.subscription });
      setStatus("Campaign could not be opened. Try again.", "error");
      showToast(error.message + " Select Open to retry.");
      return false;
    }).finally(function () {
      if (isCurrentLoad()) state.pendingCampaignLoadId = null;
    });
  }

  function openDeleteCampaign(campaignId) {
    var campaign = state.campaigns.find(function (candidate) { return candidate.id === campaignId; });
    if (!campaign) {
      showToast("That campaign is no longer in your account.");
      refreshSession();
      return;
    }
    var profile = campaign.campaign || {};
    state.pendingDeleteCampaignId = campaignId;
    state.pendingDeleteCampaignName = profile.name || "this campaign";
    setText("#delete-campaign-title", "Delete " + state.pendingDeleteCampaignName + "?", "Delete this campaign?");
    setText("#delete-campaign-copy", "This permanently removes " + state.pendingDeleteCampaignName + ", its character, notes, log, commands, and events from your account.", "This permanently removes the campaign from your account.");
    var deleteFeedback = $("#delete-campaign-feedback");
    if (deleteFeedback) deleteFeedback.textContent = "";
    var confirm = $("#confirm-delete-campaign");
    if (confirm) confirm.disabled = false;
    var dialog = $("#delete-campaign-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.hidden = false;
  }

  function closeDeleteCampaign() {
    var dialog = $("#delete-campaign-dialog");
    if (dialog && typeof dialog.close === "function") dialog.close();
    else if (dialog) dialog.hidden = true;
    state.pendingDeleteCampaignId = null;
    state.pendingDeleteCampaignName = null;
  }

  function deleteCampaign() {
    var campaignId = state.pendingDeleteCampaignId;
    var campaign = state.campaigns.find(function (candidate) { return candidate.id === campaignId; });
    if (!campaign) {
      closeDeleteCampaign();
      refreshSession();
      return;
    }
    var confirm = $("#confirm-delete-campaign");
    var feedback = $("#delete-campaign-feedback");
    if (confirm) confirm.disabled = true;
    if (feedback) feedback.textContent = "Removing the campaign...";
    requestJson("/api/campaigns/" + encodeURIComponent(campaignId), {
      method: "DELETE",
      body: JSON.stringify({ expectedCampaignVersion: campaign.version, confirmation: "DELETE" })
    }).then(function (result) {
      if (result.response.status === 401) {
        closeDeleteCampaign();
        openAuth();
        return;
      }
      if (result.response.status === 409) {
        closeDeleteCampaign();
        showToast("That campaign changed in another window. Refreshing your campaign list.");
        return refreshSession();
      }
      if (!result.response.ok) throw new Error(result.data.error || "The campaign could not be deleted.");
      clearPendingCommandForCampaign(campaignId);
      state.campaigns = Array.isArray(result.data.campaigns) ? result.data.campaigns : state.campaigns.filter(function (candidate) { return candidate.id !== campaignId; });
      if (result.data.subscription) state.subscription = result.data.subscription;
      var deletingActive = state.session && state.session.id === campaignId;
      closeDeleteCampaign();
      if (deletingActive) {
        clearActiveCampaignId();
        state.session = null;
        state.engineState = null;
        state.managerOpen = true;
        state.createMode = false;
        renderSession({ session: null, campaigns: state.campaigns, subscription: state.subscription });
      } else {
        renderOnboarding({ session: state.session, state: state.engineState, campaigns: state.campaigns });
      }
      setStatus("Campaign deleted", "ready");
      showToast("Campaign deleted from your account.");
    }).catch(function (error) {
      if (feedback) feedback.textContent = error.message;
      showToast(error.message);
    }).finally(function () {
      if (confirm) confirm.disabled = false;
    });
  }

  function checkout() {
    if (!state.config.subscription.enabled) {
      showToast("Stripe is ready to connect; add STRIPE_PRICE_ID to enable checkout.");
      return;
    }
    requestJson("/api/billing/checkout", { method: "POST" }).then(function (result) {
      if (result.response.status === 401) { openAuth(); return; }
      if (!result.response.ok) throw new Error(result.data.error || "Checkout could not start.");
      window.location.assign(result.data.url);
    }).catch(function (error) { showToast(error.message); });
  }

  function setupClerk() {
    var key = state.config.clerkPublishableKey;
    if (!key) {
      $("#integration-state").textContent = state.config.devAuthBypass ? "LOCAL PREVIEW" : "AUTH NEEDED";
      if (!state.config.devAuthBypass) {
        $("#auth-fallback").textContent = "Add Clerk development keys to .env to enable sign in.";
        $("#auth-fallback").hidden = false;
      }
      renderIdentity();
      return Promise.resolve();
    }
    var domain = clerkDomainFromKey(key);
    if (!domain) return Promise.reject(new Error("The Clerk publishable key is not valid."));
    return loadScript("https://" + domain + "/npm/@clerk/ui@1/dist/ui.browser.js")
      .then(function () { return loadScript("https://" + domain + "/npm/@clerk/clerk-js@6/dist/clerk.browser.js", { "data-clerk-publishable-key": key }); })
      .then(function () {
        return window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
      })
      .then(function () {
        state.clerk = window.Clerk;
        if (typeof state.clerk.addListener === "function") {
          state.clerk.addListener(function () {
            renderIdentity();
            if (state.clerk.isSignedIn) {
              loadCharacterOptions();
              loadContentCatalog();
            } else {
              state.characterOptions = null;
              state.contentCatalog = null;
            }
            refreshSession();
          });
        }
        renderIdentity();
      });
  }

  function bind() {
    var playerInput = $("#player-input");
    var inputCounter = $("#input-counter");
    var pendingComposerSubmission = null;
    function updateInputCounter() {
      updateComposerCounter(playerInput, inputCounter);
      if (pendingComposerSubmission && playerInput.value.trim() !== pendingComposerSubmission.playerText) {
        pendingComposerSubmission = null;
      }
    }
    if (playerInput) {
      playerInput.addEventListener("input", updateInputCounter);
      updateInputCounter();
    }
    var actionRow = $("#action-row");
    if (actionRow) actionRow.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-suggested-prompt]");
      if (!button || !actionRow.contains(button) || button.disabled) return;
      button.disabled = true;
      var request = button.dataset.gameAction
        ? playAction(button.dataset.gameAction)
        : playText(button.dataset.suggestedPrompt || "I take the suggested action.");
      request.finally(function () { button.disabled = false; });
    });
    $("#chat-form").addEventListener("submit", function (event) {
      event.preventDefault();
      var input = $("#player-input");
      var button = this.querySelector("button[type=submit]");
      var playerText = input.value.trim();
      if (!playerText) return;
      pendingComposerSubmission = composerSubmission(
        pendingComposerSubmission,
        state.session && state.session.id,
        playerText,
        newCommandId
      );
      input.disabled = true;
      button.disabled = true;
      playText(playerText, pendingComposerSubmission.clientCommandId).then(function (sent) {
        if (settleComposer(input, inputCounter, sent)) pendingComposerSubmission = null;
      }).finally(function () {
        input.disabled = false;
        button.disabled = false;
        input.focus();
      });
    });
    $("#campaign-form").addEventListener("submit", createCampaign);
    $("#campaign-gamesystem-input").addEventListener("change", renderCampaignSourceOptions);
    $("#campaign-base-document-input").addEventListener("change", renderCampaignSourceOptions);
    $("#campaign-ogl-input").addEventListener("change", renderCampaignSourceOptions);
    $("#character-form").addEventListener("submit", createCharacter);
    $("#character-roll-stats").addEventListener("click", rollCharacterStats);
    $("#character-ability-method").addEventListener("change", renderAbilityScoreFields);
    ["#character-species-input", "#character-class-input", "#character-background-choice", "#character-alignment-choice"].forEach(function (selector) {
      var input = $(selector);
      if (input) input.addEventListener("change", renderCharacterChoiceFields);
    });
    ["#character-ability-choice-options", "#character-skill-choice-options", "#character-language-choice-options"].forEach(function (selector) {
      var options = $(selector);
      if (options) options.addEventListener("change", function () { enforceCharacterChoiceLimit(selector); });
    });
    $("#character-tool-choice-options").addEventListener("change", updateToolChoiceDescriptions);
    $("#character-edit-form").addEventListener("submit", editCharacter);
    $("#note-form").addEventListener("submit", addNote);
    $("#character-inventory").addEventListener("click", inventoryAction);
    document.querySelectorAll('[data-action="open-campaign-manager"]').forEach(function (button) {
      button.addEventListener("click", function () {
        state.managerOpen = !state.managerOpen;
        state.createMode = false;
        renderOnboarding({ session: state.session, state: state.engineState, campaigns: state.campaigns });
      });
    });
    document.querySelectorAll('[data-action="show-campaign-form"]').forEach(function (button) {
      button.addEventListener("click", function () {
        state.managerOpen = true;
        state.createMode = true;
        renderOnboarding({ session: state.session, state: state.engineState, campaigns: state.campaigns });
      });
    });
    $("#campaign-list").addEventListener("click", function (event) {
      var deleteButton = event.target.closest("[data-delete-campaign-id]");
      if (deleteButton) {
        openDeleteCampaign(deleteButton.dataset.deleteCampaignId);
        return;
      }
      var button = event.target.closest("[data-campaign-id]");
      if (button) loadCampaign(button.dataset.campaignId);
    });
    document.querySelectorAll('[data-action="checkout"]').forEach(function (button) { button.addEventListener("click", checkout); });
    document.querySelectorAll('[data-action="open-auth"]').forEach(function (button) { button.addEventListener("click", openAuth); });
    document.querySelectorAll('[data-action="close-auth"]').forEach(function (button) { button.addEventListener("click", closeAuth); });
    document.querySelectorAll('[data-action="open-attribution"]').forEach(function (button) { button.addEventListener("click", openAttribution); });
    document.querySelectorAll('[data-action="close-attribution"]').forEach(function (button) { button.addEventListener("click", closeAttribution); });
    document.querySelectorAll('[data-action="close-delete-campaign"]').forEach(function (button) { button.addEventListener("click", closeDeleteCampaign); });
    document.querySelectorAll('[data-action="confirm-delete-campaign"]').forEach(function (button) { button.addEventListener("click", deleteCampaign); });
    $("#auth-dialog").addEventListener("click", function (event) { if (event.target === this) closeAuth(); });
    $("#attribution-dialog").addEventListener("click", function (event) { if (event.target === this) closeAttribution(); });
    $("#delete-campaign-dialog").addEventListener("click", function (event) { if (event.target === this) closeDeleteCampaign(); });
  }

  function boot() {
    bind();
    fetch("/api/config").then(function (response) { return response.json(); }).then(function (config) {
      state.config = config;
      $("#subscription-label").textContent = config.subscription.label;
      $("#subscription-price").textContent = config.subscription.priceLabel;
      return setupClerk();
    }).then(function () {
      return Promise.all([loadContentCatalog(), refreshSession()]).then(function () {
        return loadCharacterOptions(state.session && state.session.id);
      });
    }).catch(function (error) {
      renderSession({ session: null, campaigns: state.campaigns, setupRequired: false });
      setStatus("Configuration needed", "error");
      showToast(error.message);
    });
  }

  window.addEventListener("DOMContentLoaded", boot);
}());
