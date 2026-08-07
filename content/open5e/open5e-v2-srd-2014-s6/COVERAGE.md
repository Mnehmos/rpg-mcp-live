# Open5e S6 Coverage

Pack: `open5e-v2-srd-2014-s6`  
Target document: `srd-2014`  
Pinned source timestamp: `2026-08-07T00:00:00.000Z`

S6 preserves S5 and imports the complete pinned SRD-2014 v2 rule/ruleset graph plus the v1-only WotC SRD sections and planes. These are read-only reference records for the DM; they do not become executable mechanics merely because their prose is available.

## Collection totals

| Collection | Raw records | Normalized records | Compiled records |
| --- | ---: | ---: | ---: |
| conditions | 15 | 15 | 0 |
| damagetypes | 13 | 13 | 0 |
| sizes | 6 | 6 | 0 |
| documents | 7 | 7 | 0 |
| skills | 20 | 18 | 0 |
| rules | 227 | 227 | 1 |
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
| rulesets | 41 | 41 | 0 |
| sections | 45 | 45 | 0 |
| planes | 8 | 8 | 0 |

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
| planes | srd-2014 | 5e-2014 | 8 | 0 | 0 |
| rules | srd-2014 | 5e-2014 | 226 | 0 | 1 |
| rulesets | srd-2014 | 5e-2014 | 41 | 0 | 0 |
| sections | srd-2014 | 5e-2014 | 45 | 0 | 0 |
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
| `open5e:item:5e-2014:srd-2014:srd_shield` | compiled | The source text matched the reviewed shield armor-class effect exactly. |
| `open5e:condition:5e-2014:srd-2014:blinded` | deferred | Condition effect compilation remains outside S6. |
| `open5e:condition:5e-2014:srd-2014:charmed` | deferred | Condition effect compilation remains outside S6. |
| `open5e:condition:5e-2014:srd-2014:deafened` | deferred | Condition effect compilation remains outside S6. |
| `open5e:condition:5e-2014:srd-2014:exhaustion` | deferred | Condition effect compilation remains outside S6. |
| `open5e:condition:5e-2014:srd-2014:frightened` | deferred | Condition effect compilation remains outside S6. |
| `open5e:condition:5e-2014:srd-2014:grappled` | deferred | Condition effect compilation remains outside S6. |
| `open5e:condition:5e-2014:srd-2014:incapacitated` | deferred | Condition effect compilation remains outside S6. |
| `open5e:condition:5e-2014:srd-2014:invisible` | deferred | Condition effect compilation remains outside S6. |
| `open5e:condition:5e-2014:srd-2014:paralyzed` | deferred | Condition effect compilation remains outside S6. |
| `open5e:condition:5e-2014:srd-2014:petrified` | deferred | Condition effect compilation remains outside S6. |
| `open5e:condition:5e-2014:srd-2014:poisoned` | deferred | Condition effect compilation remains outside S6. |
| `open5e:condition:5e-2014:srd-2014:prone` | deferred | Condition effect compilation remains outside S6. |
| `open5e:condition:5e-2014:srd-2014:restrained` | deferred | Condition effect compilation remains outside S6. |
| `open5e:condition:5e-2014:srd-2014:stunned` | deferred | Condition effect compilation remains outside S6. |
| `open5e:condition:5e-2014:srd-2014:unconscious` | deferred | Condition effect compilation remains outside S6. |
| `a5e-ag_culture` | excluded | Source container `a5e-ag` is outside the pinned core/SRD-2014 skill registry. |
| `a5e-ag_engineering` | excluded | Source container `a5e-ag` is outside the pinned core/SRD-2014 skill registry. |
| `open5e:weapon-property:5e-2014:srd-2014:srd-2014_ammunition-wp` | deferred | Weapon-property prose is displayable but is not an executable effect program in S2. |
| `open5e:weapon-property:5e-2014:srd-2014:srd-2014_finesse-wp` | deferred | Weapon-property prose is displayable but is not an executable effect program in S2. |
| `open5e:weapon-property:5e-2014:srd-2014:srd-2014_heavy-wp` | deferred | Weapon-property prose is displayable but is not an executable effect program in S2. |
| `open5e:weapon-property:5e-2014:srd-2014:srd-2014_lance-special-wp` | deferred | Weapon-property prose is displayable but is not an executable effect program in S2. |
| `open5e:weapon-property:5e-2014:srd-2014:srd-2014_light-wp` | deferred | Weapon-property prose is displayable but is not an executable effect program in S2. |
| `open5e:weapon-property:5e-2014:srd-2014:srd-2014_loading-wp` | deferred | Weapon-property prose is displayable but is not an executable effect program in S2. |
| `open5e:weapon-property:5e-2014:srd-2014:srd-2014_net-special-wp` | deferred | Weapon-property prose is displayable but is not an executable effect program in S2. |
| `open5e:weapon-property:5e-2014:srd-2014:srd-2014_range-wp` | deferred | Weapon-property prose is displayable but is not an executable effect program in S2. |
| `open5e:weapon-property:5e-2014:srd-2014:srd-2014_reach-wp` | deferred | Weapon-property prose is displayable but is not an executable effect program in S2. |
| `open5e:weapon-property:5e-2014:srd-2014:srd-2014_thrown-wp` | deferred | Weapon-property prose is displayable but is not an executable effect program in S2. |
| `open5e:weapon-property:5e-2014:srd-2014:srd-2014_two-handed-wp` | deferred | Weapon-property prose is displayable but is not an executable effect program in S2. |
| `open5e:weapon-property:5e-2014:srd-2014:srd-2014_versatile-wp` | deferred | Weapon-property prose is displayable but is not an executable effect program in S2. |
| `open5e:magic-item:5e-2014:srd-2014:srd_adamantine-armor-breastplate` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_adamantine-armor-chain-mail` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_adamantine-armor-chain-shirt` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_adamantine-armor-half-plate` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_adamantine-armor-plate` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_adamantine-armor-ring-mail` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_adamantine-armor-scale-mail` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_adamantine-armor-splint` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_amulet-of-health` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_amulet-of-proof-against-detection-and-location` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_amulet-of-the-planes` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_animated-shield` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_apparatus-of-the-crab` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_armor-of-invulnerability` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_armor-of-resistance-breastplate` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_armor-of-resistance-chain-mail` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_armor-of-resistance-chain-shirt` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_armor-of-resistance-half-plate` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_armor-of-resistance-hide` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_armor-of-resistance-leather` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_armor-of-resistance-padded` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_armor-of-resistance-plate` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_armor-of-resistance-ring-mail` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_armor-of-resistance-scale-mail` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_armor-of-resistance-splint` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_armor-of-resistance-studded-leather` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_armor-of-vulnerability` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_arrow-catching-shield` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_arrow-of-slaying` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_bag-of-beans` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_bag-of-devouring` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_bag-of-holding` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_bag-of-tricks` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_battleaxe-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_battleaxe-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_battleaxe-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_bead-of-force` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_belt-of-cloud-giant-strength` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_belt-of-dwarvenkind` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_belt-of-fire-giant-strength` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_belt-of-frost-giant-strength` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_belt-of-hill-giant-strength` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_belt-of-stone-giant-strength` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_belt-of-storm-giant-strength` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_blowgun-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_blowgun-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_blowgun-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_boots-of-elvenkind` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_boots-of-levitation` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_boots-of-speed` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_boots-of-striding-and-springing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_boots-of-the-winterlands` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_bowl-of-commanding-water-elementals` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_bracers-of-archery` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_bracers-of-defense` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_brazier-of-commanding-fire-elementals` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_brooch-of-shielding` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_broom-of-flying` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_candle-of-invocation` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_cape-of-the-mountebank` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_carpet-of-flying` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_censer-of-controlling-air-elementals` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_chime-of-opening` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_circlet-of-blasting` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_cloak-of-arachnida` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_cloak-of-displacement` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_cloak-of-elvenkind` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_cloak-of-protection` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_cloak-of-the-bat` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_cloak-of-the-manta-ray` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_club-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_club-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_club-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_crossbow-hand-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_crossbow-hand-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_crossbow-hand-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_crossbow-heavy-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_crossbow-heavy-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_crossbow-heavy-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_crossbow-light-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_crossbow-light-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_crossbow-light-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_crystal-ball` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_crystal-ball-of-mind-reading` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_crystal-ball-of-telepathy` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_crystal-ball-of-true-seeing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_cube-of-force` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_cubic-gate` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dagger-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dagger-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dagger-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dagger-of-venom` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dancing-sword-greatsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dancing-sword-longsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dancing-sword-rapier` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dancing-sword-shortsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dart-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dart-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dart-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_decanter-of-endless-water` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_deck-of-illusions` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_deck-of-many-things` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_defender-greatsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_defender-longsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_defender-rapier` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_defender-shortsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_demon-armor` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dimensional-shackles` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dragon-scale-mail` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dragon-slayer-greatsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dragon-slayer-longsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dragon-slayer-rapier` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dragon-slayer-shortsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dust-of-disappearance` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dust-of-dryness` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dust-of-sneezing-and-choking` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dwarven-plate` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_dwarven-thrower` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_efficient-quiver` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_efreeti-bottle` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_elemental-gem` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_elven-chain` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_eversmoking-bottle` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_eyes-of-charming` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_eyes-of-minute-seeing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_eyes-of-the-eagle` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_feather-token` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_figurine-of-wondrous-power-bronze-griffon` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_figurine-of-wondrous-power-ebony-fly` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_figurine-of-wondrous-power-golden-lions` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_figurine-of-wondrous-power-ivory-goats` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_figurine-of-wondrous-power-marble-elephant` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_figurine-of-wondrous-power-obsidian-steed` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_figurine-of-wondrous-power-onyx-dog` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_figurine-of-wondrous-power-serpentine-owl` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_figurine-of-wondrous-power-silver-raven` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_flail-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_flail-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_flail-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_flame-tongue-greatsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_flame-tongue-longsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_flame-tongue-rapier` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_flame-tongue-shortsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_folding-boat` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_frost-brand-greatsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_frost-brand-longsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_frost-brand-rapier` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_frost-brand-shortsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_gauntlets-of-ogre-power` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_gem-of-brightness` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_gem-of-seeing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_giant-slayer-battleaxe` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_giant-slayer-greataxe` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_giant-slayer-greatsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_giant-slayer-handaxe` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_giant-slayer-longsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_giant-slayer-rapier` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_giant-slayer-shortsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_glaive-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_glaive-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_glaive-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_glamoured-studded-leather` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_gloves-of-missile-snaring` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_gloves-of-swimming-and-climbing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_goggles-of-night` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_greataxe-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_greataxe-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_greataxe-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_greatclub-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_greatclub-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_greatclub-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_greatsword-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_greatsword-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_greatsword-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_halberd-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_halberd-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_halberd-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_hammer-of-thunderbolts` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_handaxe-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_handaxe-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_handaxe-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_handy-haversack` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_hat-of-disguise` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_headband-of-intellect` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_helm-of-brilliance` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_helm-of-comprehending-languages` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_helm-of-telepathy` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_helm-of-teleportation` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_holy-avenger-greatsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_holy-avenger-longsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_holy-avenger-rapier` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_holy-avenger-shortsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_horn-of-blasting` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_horn-of-valhalla-brass` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_horn-of-valhalla-bronze` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_horn-of-valhalla-iron` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_horn-of-valhalla-silver` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_horseshoes-of-a-zephyr` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_horseshoes-of-speed` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_immovable-rod` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_instant-fortress` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ioun-stone-absorption` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ioun-stone-agility` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ioun-stone-awareness` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ioun-stone-greater-absorption` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ioun-stone-insight` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ioun-stone-intellect` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ioun-stone-leadership` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ioun-stone-mastery` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ioun-stone-protection` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ioun-stone-regeneration` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ioun-stone-reserve` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ioun-stone-strength` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ioun-stone-sustenance` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_iron-bands-of-binding` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_iron-flask` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_javelin-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_javelin-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_javelin-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_javelin-of-lightning` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_lance-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_lance-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_lance-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_lantern-of-revealing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_light-hammer-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_light-hammer-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_light-hammer-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_longbow-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_longbow-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_longbow-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_longsword-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_longsword-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_longsword-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_luck-blade-greatsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_luck-blade-longsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_luck-blade-rapier` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_luck-blade-shortsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mace-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mace-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mace-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mace-of-disruption` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mace-of-smiting` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mace-of-terror` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mantle-of-spell-resistance` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_manual-of-bodily-health` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_manual-of-gainful-exercise` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_manual-of-golems` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_manual-of-quickness-of-action` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_marvelous-pigments` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_maul-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_maul-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_maul-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_medallion-of-thoughts` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mirror-of-life-trapping` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mithral-armor-breastplate` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mithral-armor-chain-mail` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mithral-armor-chain-shirt` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mithral-armor-half-plate` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mithral-armor-plate` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mithral-armor-ring-mail` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mithral-armor-scale-mail` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_mithral-armor-splint` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_morningstar-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_morningstar-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_morningstar-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_necklace-of-adaptation` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_necklace-of-fireballs` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_necklace-of-prayer-beads` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_net-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_net-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_net-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_nine-lives-stealer-greatsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_nine-lives-stealer-longsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_nine-lives-stealer-rapier` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_nine-lives-stealer-shortsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_oathbow` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_oil-of-etherealness` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_oil-of-sharpness` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_oil-of-slipperiness` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_orb-of-dragonkind` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_pearl-of-power` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_periapt-of-health` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_periapt-of-proof-against-poison` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_periapt-of-wound-closure` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_philter-of-love` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_pike-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_pike-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_pike-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_pipes-of-haunting` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_pipes-of-the-sewers` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_plate-armor-of-etherealness` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_portable-hole` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-animal-friendship` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-clairvoyance` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-climbing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-cloud-giant-strength` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-diminution` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-fire-giant-strength` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-flying` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-frost-giant-strength` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-gaseous-form` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-greater-healing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-growth` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-healing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-heroism` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-hill-giant-strength` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-invisibility` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-mind-reading` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-poison` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-resistance` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-speed` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-stone-giant-strength` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-storm-giant-strength` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-superior-healing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-supreme-healing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_potion-of-water-breathing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_quarterstaff-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_quarterstaff-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_quarterstaff-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_rapier-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_rapier-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_rapier-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_restorative-ointment` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-animal-influence` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-djinni-summoning` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-elemental-command` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-evasion` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-feather-falling` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-free-action` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-invisibility` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-jumping` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-mind-shielding` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-protection` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-regeneration` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-resistance` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-shooting-stars` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-spell-storing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-spell-turning` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-swimming` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-telekinesis` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-the-ram` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-three-wishes` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-warmth` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-water-walking` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_ring-of-x-ray-vision` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_robe-of-eyes` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_robe-of-scintillating-colors` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_robe-of-stars` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_robe-of-the-archmagi` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_robe-of-useful-items` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_rod-of-absorption` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_rod-of-alertness` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_rod-of-lordly-might` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_rod-of-rulership` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_rod-of-security` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_rope-of-climbing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_rope-of-entanglement` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_scarab-of-protection` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_scimitar-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_scimitar-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_scimitar-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_scimitar-of-speed` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_shield-of-missile-attraction` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_shortbow-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_shortbow-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_shortbow-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_shortsword-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_shortsword-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_shortsword-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sickle-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sickle-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sickle-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sling-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sling-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sling-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_slippers-of-spider-climbing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sovereign-glue` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_spear-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_spear-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_spear-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_spell-scroll-1st-level` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_spell-scroll-2nd-level` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_spell-scroll-3rd-level` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_spell-scroll-4th-level` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_spell-scroll-5th-level` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_spell-scroll-6th-level` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_spell-scroll-7th-level` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_spell-scroll-8th-level` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_spell-scroll-9th-level` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_spell-scroll-cantrip` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_spellguard-shield` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sphere-of-annihilation` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_staff-of-charming` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_staff-of-fire` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_staff-of-frost` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_staff-of-healing` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_staff-of-power` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_staff-of-striking` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_staff-of-swarming-insects` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_staff-of-the-magi` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_staff-of-the-python` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_staff-of-the-woodlands` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_staff-of-thunder-and-lightning` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_staff-of-withering` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_stone-of-controlling-earth-elementals` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_stone-of-good-luck-luckstone` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sun-blade` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sword-of-life-stealing-greatsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sword-of-life-stealing-longsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sword-of-life-stealing-rapier` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sword-of-life-stealing-shortsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sword-of-sharpness-greatsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sword-of-sharpness-longsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sword-of-sharpness-scimitar` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sword-of-sharpness-shortsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sword-of-wounding-greatsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sword-of-wounding-longsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sword-of-wounding-rapier` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_sword-of-wounding-shortsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_talisman-of-pure-good` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_talisman-of-the-sphere` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_talisman-of-ultimate-evil` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_tome-of-clear-thought` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_tome-of-leadership-and-influence` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_tome-of-understanding` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_trident-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_trident-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_trident-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_trident-of-fish-command` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_universal-solvent` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-battleaxe` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-blowgun` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-club` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-crossbow-hand` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-crossbow-heavy` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-crossbow-light` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-dagger` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-dart` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-flail` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-glaive` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-greataxe` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-greatclub` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-greatsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-halberd` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-handaxe` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-javelin` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-lance` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-light-hammer` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-longbow` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-longsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-mace` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-maul` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-morningstar` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-net` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-pike` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-quarterstaff` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-rapier` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-scimitar` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-shortbow` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-shortsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-sickle` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-sling` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-spear` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-trident` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-war-pick` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-warhammer` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vicious-weapon-whip` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vorpal-sword-greatsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vorpal-sword-longsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vorpal-sword-scimitar` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_vorpal-sword-shortsword` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wand-of-binding` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wand-of-enemy-detection` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wand-of-fear` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wand-of-fireballs` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wand-of-lightning-bolts` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wand-of-magic-detection` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wand-of-magic-missiles` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wand-of-paralysis` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wand-of-polymorph` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wand-of-secrets` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wand-of-the-war-mage-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wand-of-the-war-mage-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wand-of-the-war-mage-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wand-of-web` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wand-of-wonder` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_war-pick-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_war-pick-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_war-pick-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_warhammer-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_warhammer-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_warhammer-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_well-of-many-worlds` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_whip-1` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_whip-2` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_whip-3` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wind-fan` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_winged-boots` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `open5e:magic-item:5e-2014:srd-2014:srd_wings-of-flying` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |
| `creatures/exact-simple-attacks` | compiled | 317 exact single-target base-damage attacks compiled from pinned prose; source averages and compatible v2 attack metadata were checked. |
| `creatures/deferred-actions` | deferred | 627 actions remain display-only because they require multiattack, legendary/reaction timing, saves, secondary damage, conditions, recharge, or other effect semantics. |
| `tob_badlands` | excluded | A target creature payload referenced an environment outside the core/SRD-2014 partition; the raw link is preserved but is not normalized into this pack. |
| `spells/primary-damage` | compiled | 33 spells have a deterministic primary damage program sourced from typed v2 fields and corroborated damage prose. Secondary and persistent prose effects remain deferred and are reported to the DM. |
| `spells/deferred` | deferred | 286 spells remain typed references because they lack one unambiguous primary damage path or require healing, conditions, movement, summoning, repeated effects, or other uncompiled semantics. |
| `spellprogressions/v1-srd-tables` | compiled-source | 8 caster progressions were parsed from hashed v1 WotC SRD markdown tables. The v2 class slot-column duplicate/missing-row defect is preserved upstream and not silently repaired. |
| `characters/reviewed-profiles` | compiled | 13 species, 12 base classes, and 1 backgrounds have deterministic level-one creation profiles. |
| `characters/deferred-features` | deferred | Feature and feat prose without a reviewed mechanical program remains reference-only and cannot mutate character state by implication. |
| `rules-reference/v2` | reference | 227 rules are linked into 41 complete rulesets with pinned hierarchy metadata. |
| `rules-reference/v1-only` | reference | 45 legacy sections and 8 planes are preserved with explicit v1 provenance and mapped to the SRD-2014 document policy. |

