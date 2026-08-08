# ADR-H31: actor-scoped knowledge projection boundary

Status: accepted for issue #7

## Decision

The engine remains the source of truth for world facts and actor knowledge. A
world fact is either public or hidden and carries a server-owned scene, active
revision, visibility, sense requirement, and optional passive Perception DC.
Hidden facts are never placed in the DM prompt, player response, read-tool
projection, campaign view, or event evidence unless the acting actor has a
current `perceived` or `known` record for that exact fact revision.

Knowledge records are actor-scoped and persist their tier, source, provenance,
confidence, campaign version, and fact revision. Passive perception is
deterministic, evaluated once per actor/fact/revision, and respects blinded,
darkness, and the actor's persisted sense capabilities. A changed or removed
fact marks prior records stale; stale records do not reveal the fact.

The reviewed `search-hidden-fact-v1` challenge is the only active-search
producer in this slice. The server validates the fact against the current
scene before drawing, withholds failed check details, and records `known` only
after a successful check. Public projections redact hidden command arguments,
hidden state-change paths, check rolls/modifiers/DCs, and unavailable fact IDs.

## Boundaries and deferrals

- #6 owns check execution and deterministic dice; #21 owns reviewed challenge
  adjudication and retry policy.
- Actor and account authorization remain store boundaries; projection is an
  additional defense and is not a substitute for access checks.
- This slice does not implement geometric line-of-sight, range-aware senses,
  memory decay, rumors, false beliefs, or a broader discovery producer.
- The DM receives the assembled projected context object. It must not receive
  raw campaign state or infer facts absent from that projection.
