# Open5e Pack Upgrade Review

Review SHA-256: `7f8fdf0e0716b8cd9d26325a78a2718b5b7af3052154543130bc30b7f9076970`

From: `open5e-v2-srd-2014-s1` / `7a30c58868cb9dfd87124582a26f95cfa43577d948f3bfc5311e7ab52eb03bf3`

To: `open5e-v2-full-corpus-s8` / `56bdfbda9d59a398f3c9cb0e02aaf2b411e4280e99fb32c550cf158b38f7b07f`

## Record compatibility

| Layer | Identical | Provenance-only | Changed | Added | Removed |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normalized | 0 | 54 | 4 | 9505 | 0 |
| Compiled | 0 | 1 | 0 | 743 | 0 |

`provenance-only` means canonical bytes differ only in import timestamps. It is mechanically compatible, but remains visible in this review.

## Collection coverage delta

| Collection | Raw | Normalized | Compiled |
| --- | ---: | ---: | ---: |
| abilities | 0 -> 6 (+6) | 0 -> 18 (+18) | 0 -> 0 (+0) |
| alignments | 0 -> 9 (+9) | 0 -> 18 (+18) | 0 -> 0 (+0) |
| armor | 0 -> 25 (+25) | 0 -> 25 (+25) | 0 -> 0 (+0) |
| backgrounds | 0 -> 58 (+58) | 0 -> 58 (+58) | 0 -> 27 (+27) |
| classes | 0 -> 151 (+151) | 0 -> 151 (+151) | 0 -> 12 (+12) |
| conditions | 15 -> 21 (+6) | 15 -> 50 (+35) | 0 -> 0 (+0) |
| creatures | 0 -> 3541 (+3541) | 0 -> 3541 (+3541) | 0 -> 608 (+608) |
| creaturesets | 0 -> 1 (+1) | 0 -> 1 (+1) | 0 -> 0 (+0) |
| creaturetypes | 0 -> 14 (+14) | 0 -> 42 (+42) | 0 -> 0 (+0) |
| damagetypes | 13 -> 13 (+0) | 13 -> 26 (+13) | 0 -> 0 (+0) |
| documents | 5 -> 24 (+19) | 5 -> 24 (+19) | 0 -> 0 (+0) |
| environments | 0 -> 31 (+31) | 0 -> 31 (+31) | 0 -> 0 (+0) |
| feats | 0 -> 91 (+91) | 0 -> 91 (+91) | 0 -> 0 (+0) |
| gamesystems | 0 -> 3 (+3) | 0 -> 0 (+0) | 0 -> 0 (+0) |
| images | 0 -> 32 (+32) | 0 -> 32 (+32) | 0 -> 0 (+0) |
| itemcategories | 0 -> 24 (+24) | 0 -> 24 (+24) | 0 -> 0 (+0) |
| itemrarities | 0 -> 6 (+6) | 0 -> 6 (+6) | 0 -> 0 (+0) |
| items | 0 -> 440 (+440) | 0 -> 440 (+440) | 0 -> 1 (+1) |
| itemsets | 0 -> 20 (+20) | 0 -> 20 (+20) | 0 -> 0 (+0) |
| languages | 0 -> 19 (+19) | 0 -> 19 (+19) | 0 -> 0 (+0) |
| licenses | 0 -> 3 (+3) | 0 -> 0 (+0) | 0 -> 0 (+0) |
| magicitems | 0 -> 2319 (+2319) | 0 -> 2319 (+2319) | 0 -> 0 (+0) |
| planes | 0 -> 8 (+8) | 0 -> 8 (+8) | 0 -> 0 (+0) |
| publishers | 0 -> 6 (+6) | 0 -> 0 (+0) | 0 -> 0 (+0) |
| rules | 1 -> 283 (+282) | 1 -> 283 (+282) | 1 -> 1 (+0) |
| rulesets | 0 -> 52 (+52) | 0 -> 52 (+52) | 0 -> 0 (+0) |
| sections | 0 -> 45 (+45) | 0 -> 45 (+45) | 0 -> 0 (+0) |
| services | 0 -> 30 (+30) | 0 -> 30 (+30) | 0 -> 0 (+0) |
| sizes | 6 -> 7 (+1) | 6 -> 7 (+1) | 0 -> 0 (+0) |
| skills | 20 -> 20 (+0) | 18 -> 56 (+38) | 0 -> 0 (+0) |
| species | 0 -> 63 (+63) | 0 -> 63 (+63) | 0 -> 13 (+13) |
| spelllists | 0 -> 7 (+7) | 0 -> 7 (+7) | 0 -> 0 (+0) |
| spellprogressions | 0 -> 12 (+12) | 0 -> 8 (+8) | 0 -> 0 (+0) |
| spells | 0 -> 1955 (+1955) | 0 -> 1955 (+1955) | 0 -> 82 (+82) |
| spellschools | 0 -> 9 (+9) | 0 -> 9 (+9) | 0 -> 0 (+0) |
| weaponproperties | 0 -> 29 (+29) | 0 -> 29 (+29) | 0 -> 0 (+0) |
| weapons | 0 -> 75 (+75) | 0 -> 75 (+75) | 0 -> 0 (+0) |

## Changed normalized records

- `open5e:document:5e-2014:elderberry-inn-icons:elderberry-inn-icons`
- `open5e:document:5e-2024:srd-2024:srd-2024`
- `open5e:document:a5e:a5e-ag:a5e-ag`
- `open5e:rule:5e-2014:srd-2014:srd_coins_exchange-rates`

## Removed normalized records

None.

## Changed compiled records

None.

## Removed compiled records

None.
