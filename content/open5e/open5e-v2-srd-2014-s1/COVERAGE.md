# Open5e S1 Coverage

Pack: `open5e-v2-srd-2014-s1`  
Target document: `srd-2014`  
Pinned source timestamp: `2026-08-07T00:00:00.000Z`

S1 preserves the S0 reference spine, adds the typed SRD-2014 skill registry, and deterministically compiles the SRD coin exchange table. Conditions remain non-executable tier-0 references.

## Collection totals

| Collection | Raw records | Normalized records | Compiled records |
| --- | ---: | ---: | ---: |
| conditions | 15 | 15 | 0 |
| damagetypes | 13 | 13 | 0 |
| sizes | 6 | 6 | 0 |
| documents | 5 | 5 | 0 |
| skills | 20 | 18 | 0 |
| rules | 1 | 1 | 1 |

## Effective fidelity by provenance

A compiled record promotes only its matching normalized source record. It does not promote the rest of that collection.

| Collection | Document | Game system | Tier 0 | Tier 1 | Tier 2 |
| --- | --- | --- | ---: | ---: | ---: |
| conditions | srd-2014 | 5e-2014 | 15 | 0 | 0 |
| damagetypes | srd-2014 | 5e-2014 | 0 | 13 | 0 |
| documents | a5e-ag | a5e | 1 | 0 | 0 |
| documents | core | 5e-2014 | 1 | 0 | 0 |
| documents | elderberry-inn-icons | 5e-2014 | 1 | 0 | 0 |
| documents | srd-2014 | 5e-2014 | 1 | 0 | 0 |
| documents | srd-2024 | 5e-2024 | 1 | 0 | 0 |
| rules | srd-2014 | 5e-2014 | 0 | 0 | 1 |
| sizes | core | 5e-2014 | 0 | 6 | 0 |
| skills | srd-2014 | 5e-2014 | 0 | 18 | 0 |

## Compilation and exclusion report

| Content or source key | Status | Reason |
| --- | --- | --- |
| `open5e:rule:5e-2014:srd-2014:srd_coins_exchange-rates` | compiled | Five denomination rows matched the reviewed SRD-2014 coin table exactly. |
| `open5e:condition:5e-2014:srd-2014:blinded` | deferred | Condition effect compilation remains outside S1. |
| `open5e:condition:5e-2014:srd-2014:charmed` | deferred | Condition effect compilation remains outside S1. |
| `open5e:condition:5e-2014:srd-2014:deafened` | deferred | Condition effect compilation remains outside S1. |
| `open5e:condition:5e-2014:srd-2014:exhaustion` | deferred | Condition effect compilation remains outside S1. |
| `open5e:condition:5e-2014:srd-2014:frightened` | deferred | Condition effect compilation remains outside S1. |
| `open5e:condition:5e-2014:srd-2014:grappled` | deferred | Condition effect compilation remains outside S1. |
| `open5e:condition:5e-2014:srd-2014:incapacitated` | deferred | Condition effect compilation remains outside S1. |
| `open5e:condition:5e-2014:srd-2014:invisible` | deferred | Condition effect compilation remains outside S1. |
| `open5e:condition:5e-2014:srd-2014:paralyzed` | deferred | Condition effect compilation remains outside S1. |
| `open5e:condition:5e-2014:srd-2014:petrified` | deferred | Condition effect compilation remains outside S1. |
| `open5e:condition:5e-2014:srd-2014:poisoned` | deferred | Condition effect compilation remains outside S1. |
| `open5e:condition:5e-2014:srd-2014:prone` | deferred | Condition effect compilation remains outside S1. |
| `open5e:condition:5e-2014:srd-2014:restrained` | deferred | Condition effect compilation remains outside S1. |
| `open5e:condition:5e-2014:srd-2014:stunned` | deferred | Condition effect compilation remains outside S1. |
| `open5e:condition:5e-2014:srd-2014:unconscious` | deferred | Condition effect compilation remains outside S1. |
| `a5e-ag_culture` | excluded | Source container `a5e-ag` is outside the pinned core/SRD-2014 skill registry. |
| `a5e-ag_engineering` | excluded | Source container `a5e-ag` is outside the pinned core/SRD-2014 skill registry. |

