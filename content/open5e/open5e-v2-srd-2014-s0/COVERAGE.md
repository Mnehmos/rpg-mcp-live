# Open5e S0 Coverage

Pack: `open5e-v2-srd-2014-s0`  
Target document: `srd-2014`  
Pinned source timestamp: `2026-08-07T00:00:00.000Z`

S0 imports reference and structured taxonomy data only. No tier-2 effect programs are compiled in this slice.

## Collection totals

| Collection | Raw records | Normalized records | Compiled records |
| --- | ---: | ---: | ---: |
| conditions | 15 | 15 | 0 |
| damagetypes | 13 | 13 | 0 |
| sizes | 6 | 6 | 0 |
| documents | 5 | 5 | 0 |

## Fidelity by provenance

| Collection | Document | Game system | Tier 0 | Tier 1 | Tier 2 |
| --- | --- | --- | ---: | ---: | ---: |
| conditions | srd-2014 | 5e-2014 | 15 | 0 | 0 |
| damagetypes | srd-2014 | 5e-2014 | 0 | 13 | 0 |
| documents | a5e-ag | a5e | 1 | 0 | 0 |
| documents | core | 5e-2014 | 1 | 0 | 0 |
| documents | elderberry-inn-icons | 5e-2014 | 1 | 0 | 0 |
| documents | srd-2014 | 5e-2014 | 1 | 0 | 0 |
| documents | srd-2024 | 5e-2024 | 1 | 0 | 0 |
| sizes | core | 5e-2014 | 0 | 6 | 0 |

## Tier-2 compilation status

Compilation was not attempted in S0. The condition prose below remains tier 0 by design; resolving it mechanically must return a structured tier rejection until a later reviewed compiler promotes it.

| Content key | Status | Reason |
| --- | --- | --- |
| `open5e:condition:5e-2014:srd-2014:blinded` | deferred | Condition effect compilation is outside S0. |
| `open5e:condition:5e-2014:srd-2014:charmed` | deferred | Condition effect compilation is outside S0. |
| `open5e:condition:5e-2014:srd-2014:deafened` | deferred | Condition effect compilation is outside S0. |
| `open5e:condition:5e-2014:srd-2014:exhaustion` | deferred | Condition effect compilation is outside S0. |
| `open5e:condition:5e-2014:srd-2014:frightened` | deferred | Condition effect compilation is outside S0. |
| `open5e:condition:5e-2014:srd-2014:grappled` | deferred | Condition effect compilation is outside S0. |
| `open5e:condition:5e-2014:srd-2014:incapacitated` | deferred | Condition effect compilation is outside S0. |
| `open5e:condition:5e-2014:srd-2014:invisible` | deferred | Condition effect compilation is outside S0. |
| `open5e:condition:5e-2014:srd-2014:paralyzed` | deferred | Condition effect compilation is outside S0. |
| `open5e:condition:5e-2014:srd-2014:petrified` | deferred | Condition effect compilation is outside S0. |
| `open5e:condition:5e-2014:srd-2014:poisoned` | deferred | Condition effect compilation is outside S0. |
| `open5e:condition:5e-2014:srd-2014:prone` | deferred | Condition effect compilation is outside S0. |
| `open5e:condition:5e-2014:srd-2014:restrained` | deferred | Condition effect compilation is outside S0. |
| `open5e:condition:5e-2014:srd-2014:stunned` | deferred | Condition effect compilation is outside S0. |
| `open5e:condition:5e-2014:srd-2014:unconscious` | deferred | Condition effect compilation is outside S0. |

Damage types and sizes are tier 1 because their imported fields are structured taxonomies. Documents are tier 0 attribution/reference metadata.

