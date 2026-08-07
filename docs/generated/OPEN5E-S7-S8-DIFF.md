# Open5e Pack Upgrade Review

Review SHA-256: `4400d8a1109150d4fc7adfa410fabaec12c79eda3c465b26cc7eb7e2897f0056`

From: `open5e-v2-srd-2014-s7` / `a189ccc9b1b691e790f08c2aab3e090b4f3c7f6255ab28ec94485fadbd939644`

To: `open5e-v2-full-corpus-s8` / `56bdfbda9d59a398f3c9cb0e02aaf2b411e4280e99fb32c550cf158b38f7b07f`

## Record compatibility

| Layer | Identical | Provenance-only | Changed | Added | Removed |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normalized | 0 | 1962 | 5 | 7596 | 0 |
| Compiled | 0 | 718 | 0 | 26 | 0 |

`provenance-only` means canonical bytes differ only in import timestamps. It is mechanically compatible, but remains visible in this review.

## Collection coverage delta

| Collection | Raw | Normalized | Compiled |
| --- | ---: | ---: | ---: |
| abilities | 6 -> 6 (+0) | 6 -> 18 (+12) | 0 -> 0 (+0) |
| alignments | 9 -> 9 (+0) | 9 -> 18 (+9) | 0 -> 0 (+0) |
| armor | 12 -> 25 (+13) | 12 -> 25 (+13) | 0 -> 0 (+0) |
| backgrounds | 1 -> 58 (+57) | 1 -> 58 (+57) | 1 -> 27 (+26) |
| classes | 24 -> 151 (+127) | 24 -> 151 (+127) | 12 -> 12 (+0) |
| conditions | 15 -> 21 (+6) | 15 -> 50 (+35) | 0 -> 0 (+0) |
| creatures | 325 -> 3541 (+3216) | 325 -> 3541 (+3216) | 608 -> 608 (+0) |
| creaturesets | 1 -> 1 (+0) | 1 -> 1 (+0) | 0 -> 0 (+0) |
| creaturetypes | 14 -> 14 (+0) | 14 -> 42 (+28) | 0 -> 0 (+0) |
| damagetypes | 13 -> 13 (+0) | 13 -> 26 (+13) | 0 -> 0 (+0) |
| documents | 7 -> 24 (+17) | 7 -> 24 (+17) | 0 -> 0 (+0) |
| environments | 30 -> 31 (+1) | 30 -> 31 (+1) | 0 -> 0 (+0) |
| feats | 1 -> 91 (+90) | 1 -> 91 (+90) | 0 -> 0 (+0) |
| gamesystems | 0 -> 3 (+3) | 0 -> 0 (+0) | 0 -> 0 (+0) |
| images | 0 -> 32 (+32) | 0 -> 32 (+32) | 0 -> 0 (+0) |
| itemcategories | 0 -> 24 (+24) | 0 -> 24 (+24) | 0 -> 0 (+0) |
| itemrarities | 6 -> 6 (+0) | 6 -> 6 (+0) | 0 -> 0 (+0) |
| items | 237 -> 440 (+203) | 237 -> 440 (+203) | 1 -> 1 (+0) |
| itemsets | 0 -> 20 (+20) | 0 -> 20 (+20) | 0 -> 0 (+0) |
| languages | 19 -> 19 (+0) | 18 -> 19 (+1) | 0 -> 0 (+0) |
| licenses | 0 -> 3 (+3) | 0 -> 0 (+0) | 0 -> 0 (+0) |
| magicitems | 499 -> 2319 (+1820) | 499 -> 2319 (+1820) | 0 -> 0 (+0) |
| planes | 8 -> 8 (+0) | 8 -> 8 (+0) | 0 -> 0 (+0) |
| publishers | 0 -> 6 (+6) | 0 -> 0 (+0) | 0 -> 0 (+0) |
| rules | 227 -> 283 (+56) | 227 -> 283 (+56) | 1 -> 1 (+0) |
| rulesets | 41 -> 52 (+11) | 41 -> 52 (+11) | 0 -> 0 (+0) |
| sections | 45 -> 45 (+0) | 45 -> 45 (+0) | 0 -> 0 (+0) |
| services | 0 -> 30 (+30) | 0 -> 30 (+30) | 0 -> 0 (+0) |
| sizes | 6 -> 7 (+1) | 6 -> 7 (+1) | 0 -> 0 (+0) |
| skills | 20 -> 20 (+0) | 18 -> 56 (+38) | 0 -> 0 (+0) |
| species | 13 -> 63 (+50) | 13 -> 63 (+50) | 13 -> 13 (+0) |
| spelllists | 7 -> 7 (+0) | 7 -> 7 (+0) | 0 -> 0 (+0) |
| spellprogressions | 12 -> 12 (+0) | 8 -> 8 (+0) | 0 -> 0 (+0) |
| spells | 319 -> 1955 (+1636) | 319 -> 1955 (+1636) | 82 -> 82 (+0) |
| spellschools | 8 -> 9 (+1) | 8 -> 9 (+1) | 0 -> 0 (+0) |
| weaponproperties | 12 -> 29 (+17) | 12 -> 29 (+17) | 0 -> 0 (+0) |
| weapons | 37 -> 75 (+38) | 37 -> 75 (+38) | 0 -> 0 (+0) |

## Changed normalized records

- `open5e:document:5e-2014:elderberry-inn-icons:elderberry-inn-icons`
- `open5e:document:5e-2014:tob:tob`
- `open5e:document:5e-2024:srd-2024:srd-2024`
- `open5e:document:a5e:a5e-ag:a5e-ag`
- `open5e:document:a5e:a5e-mm:a5e-mm`

## Removed normalized records

None.

## Changed compiled records

None.

## Removed compiled records

None.
