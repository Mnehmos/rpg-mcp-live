# Open5e S5 Coverage

Pack: `open5e-v2-srd-2014-s5`  
Target document: `srd-2014`  
Pinned source timestamp: `2026-08-07T00:00:00.000Z`

S4 preserves S3 and adds the pinned SRD-2014 v2 spell corpus, core spell schools, v1 spell-list corroboration, and v1 SRD class-table slot progressions. Tier-2 spell programs resolve only a corroborated primary damage path; all remaining prose effects stay explicitly deferred.

## Collection totals

| Collection | Raw records | Normalized records | Compiled records |
| --- | ---: | ---: | ---: |
| conditions | 15 | 15 | 0 |
| damagetypes | 13 | 13 | 0 |
| sizes | 6 | 6 | 0 |
| documents | 7 | 7 | 0 |
| skills | 20 | 18 | 0 |
| rules | 1 | 1 | 1 |
| items | 237 | 237 | 1 |
| weapons | 37 | 37 | 0 |
| armor | 12 | 12 | 0 |
| magicitems | 499 | 499 | 0 |
| weaponproperties | 12 | 12 | 0 |
| itemrarities | 6 | 6 | 0 |
| creaturetypes | 14 | 14 | 0 |
| environments | 30 | 30 | 0 |
| creaturesets | 1 | 1 | 0 |
| creatures | 325 | 325 | 317 |
| spellschools | 8 | 8 | 0 |
| spells | 319 | 319 | 33 |
| spelllists | 7 | 7 | 0 |
| spellprogressions | 12 | 8 | 0 |
| abilities | 6 | 6 | 0 |
| languages | 19 | 18 | 0 |
| alignments | 9 | 9 | 0 |
| species | 13 | 13 | 13 |
| classes | 24 | 24 | 12 |
| backgrounds | 1 | 1 | 1 |
| feats | 1 | 1 | 0 |

## Effective fidelity by provenance

A compiled record promotes only its matching normalized source record. It does not promote the rest of that collection.

| Collection | Document | Game system | Tier 0 | Tier 1 | Tier 2 |
| --- | --- | --- | ---: | ---: | ---: |
| abilities | srd-2014 | 5e-2014 | 0 | 6 | 0 |
| alignments | srd-2014 | 5e-2014 | 0 | 9 | 0 |
| armor | srd-2014 | 5e-2014 | 0 | 12 | 0 |
| backgrounds | srd-2014 | 5e-2014 | 0 | 0 | 1 |
| classes | srd-2014 | 5e-2014 | 0 | 12 | 12 |
| conditions | srd-2014 | 5e-2014 | 15 | 0 | 0 |
| creatures | srd-2014 | 5e-2014 | 0 | 116 | 209 |
| creaturesets | srd-2014 | 5e-2014 | 0 | 1 | 0 |
| creaturetypes | srd-2014 | 5e-2014 | 0 | 14 | 0 |
| damagetypes | srd-2014 | 5e-2014 | 0 | 13 | 0 |
| documents | a5e-ag | a5e | 1 | 0 | 0 |
| documents | a5e-mm | a5e | 1 | 0 | 0 |
| documents | core | 5e-2014 | 1 | 0 | 0 |
| documents | elderberry-inn-icons | 5e-2014 | 1 | 0 | 0 |
| documents | srd-2014 | 5e-2014 | 1 | 0 | 0 |
| documents | srd-2024 | 5e-2024 | 1 | 0 | 0 |
| documents | tob | 5e-2014 | 1 | 0 | 0 |
| environments | core | 5e-2014 | 0 | 19 | 0 |
| environments | srd-2014 | 5e-2014 | 0 | 11 | 0 |
| feats | srd-2014 | 5e-2014 | 1 | 0 | 0 |
| itemrarities | srd-2014 | 5e-2014 | 0 | 6 | 0 |
| items | srd-2014 | 5e-2014 | 0 | 236 | 1 |
| languages | core | 5e-2014 | 0 | 18 | 0 |
| magicitems | srd-2014 | 5e-2014 | 0 | 499 | 0 |
| rules | srd-2014 | 5e-2014 | 0 | 0 | 1 |
| sizes | core | 5e-2014 | 0 | 6 | 0 |
| skills | srd-2014 | 5e-2014 | 0 | 18 | 0 |
| species | srd-2014 | 5e-2014 | 0 | 0 | 13 |
| spelllists | srd-2014 | 5e-2014 | 0 | 7 | 0 |
| spellprogressions | srd-2014 | 5e-2014 | 0 | 8 | 0 |
| spells | srd-2014 | 5e-2014 | 0 | 286 | 33 |
| spellschools | core | 5e-2014 | 0 | 8 | 0 |
| weaponproperties | srd-2014 | 5e-2014 | 12 | 0 | 0 |
| weapons | srd-2014 | 5e-2014 | 0 | 37 | 0 |

## Compilation and exclusion report

| Content or source key | Status | Reason |
| --- | --- | --- |
| `open5e:rule:5e-2014:srd-2014:srd_coins_exchange-rates` | compiled | Five denomination rows matched the reviewed SRD-2014 coin table exactly. |
| `open5e:condition:5e-2014:srd-2014:blinded` | deferred | Condition effect compilation remains outside S5. |
| `open5e:condition:5e-2014:srd-2014:charmed` | deferred | Condition effect compilation remains outside S5. |
| `open5e:condition:5e-2014:srd-2014:deafened` | deferred | Condition effect compilation remains outside S5. |
| `open5e:condition:5e-2014:srd-2014:exhaustion` | deferred | Condition effect compilation remains outside S5. |
| `open5e:condition:5e-2014:srd-2014:frightened` | deferred | Condition effect compilation remains outside S5. |
| `open5e:condition:5e-2014:srd-2014:grappled` | deferred | Condition effect compilation remains outside S5. |
| `open5e:condition:5e-2014:srd-2014:incapacitated` | deferred | Condition effect compilation remains outside S5. |
| `open5e:condition:5e-2014:srd-2014:invisible` | deferred | Condition effect compilation remains outside S5. |
| `open5e:condition:5e-2014:srd-2014:paralyzed` | deferred | Condition effect compilation remains outside S5. |
| `open5e:condition:5e-2014:srd-2014:petrified` | deferred | Condition effect compilation remains outside S5. |
| `open5e:condition:5e-2014:srd-2014:poisoned` | deferred | Condition effect compilation remains outside S5. |
| `open5e:condition:5e-2014:srd-2014:prone` | deferred | Condition effect compilation remains outside S5. |
| `open5e:condition:5e-2014:srd-2014:restrained` | deferred | Condition effect compilation remains outside S5. |
| `open5e:condition:5e-2014:srd-2014:stunned` | deferred | Condition effect compilation remains outside S5. |
| `open5e:condition:5e-2014:srd-2014:unconscious` | deferred | Condition effect compilation remains outside S5. |
| `a5e-ag_culture` | excluded | Source container `a5e-ag` is outside the pinned core/SRD-2014 skill registry. |
| `a5e-ag_engineering` | excluded | Source container `a5e-ag` is outside the pinned core/SRD-2014 skill registry. |

