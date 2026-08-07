# Legacy Lantern Campaign Upgrade Review

Review SHA-256: `1c7e72b9b6d57e2ca9de10e6bed524e2ba62272ef09adc1e4cffbceb86c8f38d`

From: `lantern-rules-0.1` (unversioned content identity)

To: `open5e-v2-full-corpus-s8` / `56bdfbda9d59a398f3c9cb0e02aaf2b411e4280e99fb32c550cf158b38f7b07f`

## Preconditions

- The campaign rulesVersion is exactly lantern-rules-0.1.
- The campaign contains no contentKey, conditionContentKey, sourceContentKey, packHash, or character source marker.
- The target pack passed installed-pack checksum, schema, provenance, ordering, and reference verification.

## Atomic transforms

- Normalize the campaign content policy beneath the deployment default.
- Set rulesVersion to the exact target Open5e pack identity.
- Increment the campaign version once and append one system log entry.
- Commit one content_repin event with the target rules identity and no inferred source content keys.

## Historical event policy

- Do not rewrite pre-pack event bytes.
- Treat an event with no rulesVersion and no contentKeys as legacy unversioned evidence.
- Reject an unversioned event that claims content keys because its source pack cannot be proven.
