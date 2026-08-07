# ADR-H17: Pack-backed equipment instances

Status: Accepted  
Date: 2026-08-06

## Context

Copying an Open5e item's name, price, weight, damage, armor class, and prose into every campaign would allow immutable definitions to drift from the campaign's pinned pack. It would also make source updates and replay evidence ambiguous. The DM still needs authority to invent original rewards and merchandise.

## Decision

A source-backed inventory or merchant instance persists only its campaign-local `id`, quantity, slot/equipped/attuned state, exact `contentKey`, and exact `packHash`. Runtime projections hydrate its definition from the verified pack. Authored items persist a typed `authoredDefinition` instead and never masquerade as Open5e content.

Structured mundane weapon and armor fields are tier 1 and may drive damage display and armor-class calculation. A mechanical prose effect requires tier 2. In S2, only the exact reviewed shield AC bonus is compiled. Magic-item prose remains tier 1; attempts to equip or use an uncompiled magic effect reject with `content_tier_insufficient` rather than silently omitting or inventing mechanics.

Merchant purchase and sale update stock, canonical copper, and inventory together in one command transaction. Event evidence records the rules version, referenced content keys, and state changes. API/session views return hydrated definitions for the DM and GUI, but raw campaign state does not.

## Consequences

- Starting equipment now uses exact SRD-2014 item keys and source prices/weights.
- Equipment AC follows imported armor formulas plus compiled stacking effects.
- A damaged, missing, or mismatched pack reference fails closed.
- Original campaign items remain possible through an explicit authored-definition path.
- Existing campaigns require the implemented S9 re-pin before hosted S8 use; they are never silently reinterpreted. Fresh production inspection found the current four aggregates use the stricter pre-pack `lantern-rules-0.1` path rather than S1.
