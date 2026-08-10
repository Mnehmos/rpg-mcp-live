import { createHash } from "node:crypto";
import type {
  EngineSituationDefinitionProposal,
  EngineWorldObjectInstance,
  LanternCampaignState,
} from "./engine-contracts.js";

export function situationFixtureId(definitionKey: string, kind: string, key: string): string {
  const namespace = createHash("sha256").update(JSON.stringify(definitionKey)).digest("hex").slice(0, 12);
  return `sit:${namespace}:${kind}:${key}`;
}

function criticalRelic(sceneId: string): EngineWorldObjectInstance {
  return {
    id: "watchtower-relic",
    sceneId,
    definition: {
      key: "watchtower-relic-v1",
      sourceRef: "test-fixture:watchtower-relic",
      name: "Old Signal Relic",
      description: "A brass signal device that can warn the village.",
      material: "metal",
      tags: ["critical", "relic", "breakable"],
      affordances: ["inspect", "take", "drop", "break"],
      prerequisites: [],
      effectInteractions: [],
      weight: 4,
      criticalPolicy: {
        kind: "alternate_path",
        canDestroy: true,
        canLose: true,
        canSell: false,
        canConsume: false,
        canHide: true,
        recoveryRef: "watchtower-inscription",
      },
    },
    state: "intact",
    locationRef: "watchtower-vault",
    ownerRef: { kind: "world", id: sceneId },
    containerRef: null,
    revision: 1,
    provenance: { sourceCommandId: "test-fixture", sourceVersion: 0, occurredAt: "2026-01-01T00:00:00.000Z" },
  };
}

export function prepareWatchtowerWorld(state: LanternCampaignState): LanternCampaignState {
  const next = structuredClone(state);
  const sceneId = next.worldContext?.id ?? "watchtower-scene";
  next.worldContext = {
    id: sceneId,
    title: "The Watchtower's Unquiet Light",
    description: "An abandoned watchtower hides forces already in motion.",
    features: [...new Set([...(next.worldContext?.features ?? []), "watchtower-inscription"])],
    exits: next.worldContext?.exits ?? [],
    npcs: [
      ...(next.worldContext?.npcs.filter((npc) => npc.id !== "watchtower-warden") ?? []),
      {
        id: "watchtower-warden",
        name: "Mara, the displaced warden",
        description: "A tired warden who knows why the patrol route changed.",
        disposition: "neutral",
        goals: ["protect the displaced village", "keep the patrol from finding the relic"],
        socialDc: 14,
        relationshipScore: 0,
        memories: [],
      },
    ],
    merchants: next.worldContext?.merchants ?? [],
    objects: [
      ...(next.worldContext?.objects.filter((object) => object.id !== "watchtower-relic") ?? []),
      criticalRelic(sceneId),
    ],
  };
  return next;
}

export function watchtowerSituationDefinition(): EngineSituationDefinitionProposal {
  return {
    key: "watchtower-relic",
    title: "The Watchtower's Unquiet Light",
    summary: "A diverted patrol, a warning relic, and a concealed village create several viable paths.",
    initialNodeKey: "road",
    centralRevelationKey: "central",
    nodes: [
      { key: "road", title: "The Watchtower Road", description: "A rutted road approaches the burned tower.", visibility: "public", exitKeys: ["yard"] },
      { key: "yard", title: "The Abandoned Yard", description: "A cold brazier and fresh boot prints mark the yard.", visibility: "public", exitKeys: ["road", "vault"] },
      { key: "vault", title: "The Relic Vault", description: "A cracked stair ends at the old signal vault.", visibility: "public", exitKeys: ["yard"] },
    ],
    truths: [
      { key: "warden", title: "The warden hid the patrol route", description: "The warden diverted the patrol to protect a displaced village.", visibility: "hidden" },
      { key: "relic", title: "The relic is a warning device", description: "The relic can warn the village before the next patrol arrives.", visibility: "hidden" },
      { key: "pressure", title: "The next patrol is already moving", description: "A patrol will reach the village if nobody intervenes.", visibility: "hidden" },
    ],
    revelations: [
      { key: "central", title: "Who changed the patrol route", truthKey: "warden" },
      { key: "relic", title: "What the relic can do", truthKey: "relic" },
      { key: "pressure", title: "What happens if nobody acts", truthKey: "pressure" },
    ],
    clues: [
      { key: "map", title: "A marked patrol map", finding: "The route bends away from the village in Mara's hand.", visibility: "public", nodeKey: "yard", revelationKey: "central", difficultyBand: "gentle" },
      { key: "boots", title: "Fresh boot prints", finding: "The prints follow the altered patrol route.", visibility: "public", nodeKey: "road", revelationKey: "central", difficultyBand: "challenging" },
      { key: "inscription", title: "A scratched warning inscription", finding: "The inscription names the village the warden protected.", visibility: "public", nodeKey: "vault", revelationKey: "central", difficultyBand: "standard" },
      { key: "relic", title: "The relic's old warning plate", finding: "The plate describes the relic's warning signal.", visibility: "public", nodeKey: "vault", revelationKey: "relic", difficultyBand: "gentle" },
      { key: "signal", title: "A signal schedule", finding: "The next patrol is already on the old route.", visibility: "public", nodeKey: "yard", revelationKey: "pressure", difficultyBand: "standard" },
    ],
    actors: [{ actorRef: "watchtower-warden", goals: ["protect the village", "conceal the relic"], knowsTruthKeys: ["warden", "relic", "pressure"] }],
    roles: [{
      key: "reveal",
      capability: "reveal-location",
      preferred: { kind: "actor", ref: "watchtower-warden" },
      alternates: [{ kind: "object", ref: "watchtower-relic" }],
      fallback: { kind: "feature", ref: "watchtower-inscription" },
    }],
    pressure: {
      key: "patrol",
      title: "The patrol closes on the village",
      max: 3,
      intervalMinutes: 60,
      defaultDevelopment: { key: "patrol-arrives", title: "The patrol reaches the village", description: "The patrol arrives according to its committed route." },
    },
    criticalObject: { objectId: "watchtower-relic" },
    outcomes: [
      { key: "solve", title: "Use the truth and intact relic", terminalStatus: "resolved", reactivityTier: "booster", requirements: [
        { kind: "revelation_revealed", revelationKey: "central" },
        { kind: "role_status", roleKey: "reveal", statuses: ["preferred", "alternate", "fallback"] },
        { kind: "critical_object_state", state: "intact" },
      ] },
      { key: "expose", title: "Expose the truth through the fallback", terminalStatus: "resolved", reactivityTier: "booster", requirements: [
        { kind: "revelation_revealed", revelationKey: "central" },
        { kind: "role_status", roleKey: "reveal", statuses: ["fallback"] },
      ] },
      { key: "bargain", title: "Bargain with the warden", terminalStatus: "resolved", reactivityTier: "contextual", requirements: [
        { kind: "revelation_revealed", revelationKey: "central" },
        { kind: "role_status", roleKey: "reveal", statuses: ["preferred"] },
      ] },
      { key: "walk-away", title: "Walk away", terminalStatus: "walked-away", reactivityTier: "contextual", requirements: [] },
    ],
  };
}

export function prepareAshmereWorld(state: LanternCampaignState): LanternCampaignState {
  const next = structuredClone(state);
  next.worldContext = {
    id: "ashmere-wharf",
    title: "The Bell Beneath Ashmere",
    description: "A flooded wharf holds a mystery with no prescribed route.",
    features: ["harbor-ledger", "submerged-grate"],
    exits: [{ id: "warehouse", label: "the abandoned warehouse" }],
    npcs: [{
      id: "oren-dockhand",
      name: "Oren",
      description: "A dockhand who heard the bell below the tide.",
      disposition: "neutral",
      goals: ["keep the wharf open", "learn what rings below"],
      socialDc: 10,
      relationshipScore: 0,
      memories: [],
    }],
    merchants: [],
    objects: [],
  };
  return next;
}

export function ashmereSituationDefinition(): EngineSituationDefinitionProposal {
  return {
    key: "bell-beneath-ashmere",
    title: "The Bell Beneath Ashmere",
    summary: "Witnesses, physical traces, and a rising tide support investigation, retreat, or reporting.",
    initialNodeKey: "wharf",
    centralRevelationKey: "bell-source",
    nodes: [
      { key: "wharf", title: "Ashmere Wharf", description: "Rain and tide obscure the pilings.", visibility: "public", exitKeys: ["warehouse", "cistern"] },
      { key: "warehouse", title: "Abandoned Warehouse", description: "Old manifests and rope fill the dark storehouse.", visibility: "public", exitKeys: ["wharf"] },
      { key: "cistern", title: "Flooded Cistern", description: "A submerged grate leads below the wharf.", visibility: "hidden", exitKeys: ["wharf"] },
    ],
    truths: [
      { key: "bell-source", title: "The bell rings below the wharf", description: "A submerged mechanism beneath the grate rings when the tide turns.", visibility: "hidden" },
      { key: "witness", title: "Oren heard it before", description: "Oren heard the same bell during the previous spring tide.", visibility: "hidden" },
    ],
    revelations: [
      { key: "bell-source", title: "Where the bell rings", truthKey: "bell-source" },
      { key: "witness", title: "What Oren remembers", truthKey: "witness" },
    ],
    clues: [
      { key: "red-wool", title: "Red wool on the hook", finding: "Wet red fibers are snagged below the grate.", visibility: "public", nodeKey: "wharf", revelationKey: "bell-source", difficultyBand: "standard" },
      { key: "ledger", title: "A tide-marked ledger", finding: "Bell reports align with the highest spring tides.", visibility: "public", nodeKey: "warehouse", revelationKey: "bell-source", difficultyBand: "gentle" },
      { key: "echo", title: "A metallic echo", finding: "The sound returns from directly beneath the grate.", visibility: "public", nodeKey: "wharf", revelationKey: "bell-source", difficultyBand: "challenging" },
      { key: "oren", title: "Oren's recollection", finding: "Oren heard the bell during the previous spring tide.", visibility: "public", nodeKey: "wharf", revelationKey: "witness", difficultyBand: "gentle" },
    ],
    actors: [{ actorRef: "oren-dockhand", goals: ["protect the wharf", "understand the bell"], knowsTruthKeys: ["witness"] }],
    roles: [{
      key: "witness",
      capability: "testify",
      preferred: { kind: "actor", ref: "oren-dockhand" },
      alternates: [{ kind: "feature", ref: "harbor-ledger" }],
      fallback: { kind: "clue", ref: "ledger" },
    }],
    pressure: {
      key: "tide",
      title: "The spring tide rises",
      max: 4,
      intervalMinutes: 30,
      defaultDevelopment: { key: "grate-submerged", title: "The grate submerges", description: "The rising tide covers the grate and changes the available approaches." },
    },
    outcomes: [
      { key: "report", title: "Report the verified bell", terminalStatus: "resolved", reactivityTier: "contextual", requirements: [{ kind: "revelation_revealed", revelationKey: "bell-source" }] },
      { key: "wait-for-tide", title: "Wait for the tide", terminalStatus: "resolved", reactivityTier: "systemic", requirements: [{ kind: "pressure_at_least", value: 2 }] },
      { key: "leave", title: "Leave the wharf", terminalStatus: "walked-away", reactivityTier: "contextual", requirements: [] },
    ],
  };
}

/** Deterministic production-play regression fixture for issue #179. */
export function prepareSiltedBellWorld(state: LanternCampaignState): LanternCampaignState {
  const next = structuredClone(state);
  next.worldContext = {
    id: "silted-bell-wharf",
    title: "Silted Bell Wharf",
    description: "Black water laps below a sealed stair while old tide marks stripe the portcullis.",
    features: ["sealed-stair", "lower-portcullis", "tide-marks"],
    exits: [{ id: "pump-house", label: "Cross the wet boards to the pump house" }],
    npcs: [{
      id: "mara-wharfkeeper",
      name: "Mara",
      description: "The wharfkeeper watches the tide and the sealed stair.",
      disposition: "neutral",
      goals: ["keep the wharf open", "keep people away from the stair at high tide"],
      socialDc: 12,
      relationshipScore: 0,
      memories: [],
    }],
    merchants: [],
    objects: [],
  };
  return next;
}

export function siltedBellSituationDefinition(): EngineSituationDefinitionProposal {
  return {
    key: "silted-bell-wharf",
    title: "Silted Bell Wharf",
    summary: "The sealed stair, the changing tide, and Mara's account support several independent routes to the bell below.",
    initialNodeKey: "wharf",
    centralRevelationKey: "stair-source",
    nodes: [
      { key: "wharf", title: "Silted Bell Wharf", description: "Tide marks stripe the sealed lower stair.", visibility: "public", exitKeys: ["pump-house"] },
      { key: "pump-house", title: "Old Pump House", description: "Corroded controls overlook the wharf channel.", visibility: "public", exitKeys: ["wharf"] },
    ],
    truths: [
      { key: "stair-source", title: "The tide breathes through the sealed stair", description: "A submerged conduit beyond the lower portcullis draws air inward as the tide falls.", visibility: "hidden" },
      { key: "mara-witness", title: "Mara heard the lower bell", description: "Mara heard the bell answer from below during the last low tide.", visibility: "hidden" },
    ],
    revelations: [
      { key: "stair-source", title: "What lies beyond the sealed stair", truthKey: "stair-source" },
      { key: "mara-witness", title: "What Mara heard", truthKey: "mara-witness" },
    ],
    clues: [
      { key: "draft", title: "The inward draft", finding: "A faint inward draft pulses through the lower portcullis seam in time with the falling tide.", visibility: "public", nodeKey: "wharf", revelationKey: "stair-source", difficultyBand: "gentle" },
      { key: "silt-line", title: "The broken silt line", finding: "Fresh water has cut a narrow channel through the old silt below the sealed stair.", visibility: "public", nodeKey: "wharf", revelationKey: "stair-source", difficultyBand: "standard" },
      { key: "pump-gauge", title: "The reversed pump gauge", finding: "The dead pump gauge twitches backward whenever the tide drains past the lower stair.", visibility: "public", nodeKey: "pump-house", revelationKey: "stair-source", difficultyBand: "challenging" },
      { key: "mara", title: "Mara's account", finding: "Mara heard the lower bell answer during the last low tide.", visibility: "public", nodeKey: "wharf", revelationKey: "mara-witness", difficultyBand: "gentle" },
    ],
    actors: [{ actorRef: "mara-wharfkeeper", goals: ["protect the wharf", "keep the sealed stair closed at high tide"], knowsTruthKeys: ["mara-witness"] }],
    roles: [{
      key: "witness",
      capability: "testify",
      preferred: { kind: "actor", ref: "mara-wharfkeeper" },
      alternates: [{ kind: "feature", ref: "tide-marks" }],
      fallback: { kind: "clue", ref: "mara" },
    }],
    pressure: {
      key: "tide",
      title: "The tide turns",
      max: 4,
      intervalMinutes: 30,
      defaultDevelopment: { key: "stair-submerged", title: "The lower seam submerges", description: "The rising tide covers the seam and changes which approaches remain possible." },
    },
    outcomes: [
      { key: "open-route", title: "Act on the verified lower route", terminalStatus: "resolved", reactivityTier: "contextual", requirements: [{ kind: "revelation_revealed", revelationKey: "stair-source" }] },
      { key: "wait", title: "Wait for the next tide", terminalStatus: "resolved", reactivityTier: "systemic", requirements: [{ kind: "pressure_at_least", value: 2 }] },
      { key: "leave", title: "Leave the wharf", terminalStatus: "walked-away", reactivityTier: "contextual", requirements: [] },
    ],
  };
}
