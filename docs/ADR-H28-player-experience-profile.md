# ADR-H28: Player Experience Profile Boundary

Status: Accepted

## Decision

Lantern persists a versioned `EngineExperienceProfile` beside the campaign
profile and character state. It is explicit player input, not an inferred
psychological model and not mechanics state.

The profile contains normalized combat/exploration/social/mystery weights, a
reviewed difficulty policy key, narration style and verbosity, guidance and
rules-transparency preferences, excluded/fade-to-black themes, revision and
timestamps, and a bounded feedback history. The server derives the policy key
from the difficulty enum; no profile value is read by dice, modifiers, HP,
enemy statistics, or other authoritative mechanics.

## Authority and mutation

Creation accepts the profile as an optional player-owned input for legacy
campaign compatibility. Mid-campaign profile, feedback, and boundary changes
use the existing command transaction, version, stale rejection, and replay
kernel. These commands require the explicit `player` capability. The DM tool
catalog does not expose them, and the DM runtime rejects model attempts to
invoke them.

Invalid or stale requests return without changing state, version, log, or
events. Replaying the same client command returns the stored result without
duplicating the profile revision or feedback entry.

## Privacy and narration

The player session may read the full profile. DM context receives only the
minimum projection needed for presentation and boundary filtering; feedback
notes, source, and timestamps are omitted. Ordinary messages and event
evidence contain no raw boundary strings. Sensitive model output and staged
commands are rejected or sanitized before fictional detail is committed or
narrated. Redirect, fade-to-black, and skip produce only generic safe text.

## Consequences and deferrals

- Rules transparency changes presentation only; event evidence remains
  authoritative and complete.
- Difficulty currently selects `lantern-difficulty-*-v1` policy keys only.
  Challenge-policy adjudication belongs to #21 and must remain server-owned.
- Situation selection and pacing consumers (#19/#20) may use the projection
  later without importing the profile into the mechanical resolver.
- Inferred preferences, parental-control platforms, multiplayer negotiation,
  engagement optimization, and full #21 policy execution are deferred.
