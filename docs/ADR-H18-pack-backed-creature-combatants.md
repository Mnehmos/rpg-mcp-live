# ADR-H18: Creature combatants persist pinned references and mutable encounter state

Status: accepted, locally verified, and hosted on S8  
Date: 2026-08-06

## Context

Open5e v2 exposes complete SRD-2014 creature statblocks, but its source attack metadata is not consistently sufficient to execute an attack. The live game also must not let a model copy or override armor class, hit points, saves, attack bonuses, or damage when creating an encounter.

## Decision

An engine combatant persists only an instance id, exact creature `contentKey`, active pack hash, current hit points, alive state, conditions, and authoritative distance from the player. API and tool views hydrate the immutable statblock from the boot-verified pack.

The S3 compiler accepts only a source action whose prose exactly matches the reviewed single-target base-damage grammar. It corroborates the attack mode, to-hit value, range or reach, damage dice, bonus, and damage type. Multiattack, recharge, rider effects, legendary actions, reactions, and any divergent metadata remain tier-0 prose and return `content_tier_insufficient` if execution is requested.

`combat_start` and `spawn_creature` accept creature identity, count, and fictional placement only. They never accept source statistics. Encounter placement is persisted so later range checks use campaign state rather than model assertions.

## Consequences

- A source correction changes the pack hash and requires explicit repinning.
- Campaign JSON does not duplicate statblocks.
- The DM owns encounter identity and placement; the engine owns creature mechanics.
- S3 compiles 317 exact basic attacks across 325 SRD creatures. This is broad basic-attack coverage, not full statblock automation.
- Rich creature actions need reviewed compilers in later slices; narration may not imply that a rejected mechanic occurred.

## Rejected alternatives

- Trust caller-supplied creature stats: permits model-authored mechanics and replay drift.
- Execute Open5e attack metadata without prose corroboration: the v2 metadata contains omissions and inconsistencies.
- Copy full statblocks into every campaign: duplicates licensed source data and breaks immutable pack identity.
