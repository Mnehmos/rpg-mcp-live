# Audit: Inventory, Ownership, Equipment, Containers, Economy, Consumables, and Magic Items

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#8` `[P1][Inventory] Ownership, equipment, containers, economy, consumables, and magic items`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1.

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** Inventory is the **most mature** of the Phase-1 greenfield issues. Lantern already models an **authoritative item instance** with stable identity, quantity, dual provenance (Open5e content *or* DM-authored), equipment slot, weight, and value — and the equip/unequip/drop/merchant/loot loop is transactional and exactly-once. The gaps are specific and enumerable: **no containers, no charges, attunement stored-but-unenforced, two-handed/shield conflicts are same-slot-only, ammunition never decrements, consumables heal-only, encumbrance is display-only, and all 2,319 magic items are tier-1 prose blocked from equip/use.** This issue is mostly *extension*, not foundation.

---

## 1. Method and verification

Code inspected (`file:line`): `src/engine-contracts.ts` (`EngineInventoryItem` `:668-677`, `EngineItemDefinition` `:644-666`, `EngineCurrency` `:624-626`, `EngineCurrencyBreakdown` `:628-635`, slots enum `:69-77`), `src/engine-domain.ts` (`resolveEquipItem` `:921-954`, `resolveUnequipItem` `:956-974`, `resolveDropItem` `:976-994`, `resolveUseItem` `:2911-2950`, `resolveMerchantTrade` `:625-694`, `deriveArmorClass` `:3894-3914`, `resolveLoot` `:2777-2841`, encumbrance view `:4357`, `addInventory`/stacking `:3999`, `syncCurrencyProjection` `:3990`), `src/open5e-rules.ts` (`carryCapacity` `:404-406`), `src/content/open5e-import.ts` (magic-item tier `:4584,4480`; shield equipment-effect `:4072-4083`). Tests: `engine.test.ts:1199` (buy/equip/AC/unequip/sell), `:829` (loot). Observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| Item/content identity vs. instance identity | `LANTERN_IMPLEMENTED` | `EngineInventoryItem` `engine-contracts.ts:668-677`: `id, quantity, contentKey?/packHash? | authoredDefinition, slot, equipped, attuned`. `normalizeInventoryItem` throws without `id` (`open5e-rules.ts:413`). Dual provenance — content-keyed *or* DM-authored. |
| Ownership and transfer | `LANTERN_PARTIAL` | All items live on `character.inventory` (single owner = the PC). Transfer *between* owners/containers does not exist (no multi-actor inventory — couples to #16/#17). Merchant buy/sell is an ownership transfer to/from the merchant listing (`resolveMerchantTrade` `:625-694`). |
| Inventory capacity and weight | `LANTERN_PARTIAL` | Weight summed (`engine-domain.ts:3993-3996`); `carryCapacity = str×15` (`open5e-rules.ts:404-406`); `encumbered` flag computed in view (`:4357`). **No mechanical effect** — no speed penalty, no check disadvantage, no move block. Display-only. |
| Containers and nested storage | `ABSENT` | `inventory: EngineInventoryItem[]` is a flat array (`engine-contracts.ts:780`); no container/location/"where" field on items. |
| Equipment slots, two-handed, shields, ammunition, off-hand | `LANTERN_PARTIAL` / `ABSENT` | Slots enum `:69-77`; equip clears same-slot occupants (`:941-944`) and recomputes AC (`:949`). **No two-handed-occupies-offhand check, no main/off mutual exclusion beyond identical slot, no ammunition consumption** (the player attack path is hardcoded `1d8+Str` and never looks at a weapon — see #3). |
| Consumables and healing | `LANTERN_PARTIAL` | `resolveUseItem` `:2911-2950`: consumable-only (`:2924`), applies **healing only** to HP (`:2929`), decrements quantity (`:2932`), tier gate (`:2921-2923`). No buff/condition/temp-HP from consumables. **Not gated on `unconscious`** — see #9 BROKEN note. |
| Charges, attunement, curses, identification, magic-item effects | `ABSENT`/`PARTIAL`/`CONTENT_ONLY` | attunement: `attuned`/`attunementRequired` stored (`:676,650`) but **never enforced on equip** (`resolveEquipItem` `:921-954` has no check). charges: `ABSENT` (creature `actionResources` exist `:884-890` but no item charges). curse: `ABSENT` (no field). identification: `ABSENT`. magic-item effect: `CONTENT_ONLY` — imported tier-1 prose (`open5e-import.ts:4584`: *"the magic effect remains prose"*); **blocked from equip and use** (`engine-domain.ts:932,2921` require `mechanicsTier===2`). |
| Merchant pricing, scarcity, services, buy/sell, currency | `LANTERN_IMPLEMENTED` | `resolveMerchantTrade` `:625-694`: prices server-owned (`buyPriceCopper/sellPriceCopper` from merchant listing `:637`); stock with `-1`=unlimited (`:641`); insufficient-funds/stock/not-owned guards (`:642,651,658`); currency arithmetic on `character.currency.copper`. Note: currency is a single `{copper}` scalar; denominations are a derived **view projection** (`EngineCurrencyBreakdown` `:628-635`), not separate coin tracks. |
| Loot generation/claiming | `LANTERN_IMPLEMENTED` | `resolveLoot` `:2777-2841`: gated `combat.status==="ended"` + `!lootClaimed` (exactly-once); authors items + currency + XP into the PC. |
| Theft and stolen-property recognition | `ABSENT` | No stolen/ownership-provenance flag; belongs with #13 (social/law). |
| Crafting/repair seams | `ABSENT` | No crafting/repair; couples to #6 (tool checks) and #12 (downtime). |
| Item provenance and duplication protections | `LANTERN_IMPLEMENTED` | Content-key + packHash provenance; `id` uniqueness enforced; stacking by id+not-equipped (`:3999`); command-id idempotency (kernel). |

## 3. First-slice feasibility (issue's KISS slice)

Issue slice: *loot battleaxe + arrows + potion + coin → transfer exactly once → into a container → enforce weight/capacity → equip battleaxe → consume potion via canonical healing → buy/sell one item → refresh/restart identical. Then one simple magic item reusing #2.*

**What exists and is solid:** instance identity, dual provenance, equip/AC, merchant buy/sell, exactly-once loot, quantity decrement, currency arithmetic, transactional persistence. The end-to-end economy loop is largely **already proven** (`engine.test.ts:1199,829`).

**What must be built/extended:**
- **Containers** with bounded nesting + a location field on items (currently flat array).
- **Weight/capacity enforcement** (reject invalid moves; currently display-only).
- **Two-handed/shield/duplicate-slot conflict** checks (needed by #3's weapon derivation too).
- **Ammunition** decrement on the *resolved* ranged action (needs #3's weapon-aware attack).
- **Consumables via canonical effect/healing** (needs #4's `applyHealing`; currently healing-only and not clearing `unconscious` — #9).
- **One reviewed magic item** as a #2 charge/modifier effect with cleanup on unequip/deplete — currently all magic items are tier-1 prose, **blocked from equip/use**.

## 4. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| Stable content provenance + unique instance/stack identity | Yes | `:668-677`; `open5e-rules.ts:413` |
| Ownership + container location explicit and consistent | Partial | ownership yes; containers absent |
| Transfers/loot/purchase/sale/consumption/equipment atomic + exactly once | Mostly | all atomic (kernel); containers/charges paths new |
| Capacity/weight server-derived + enforced; invalid moves reject | Partial | derived but **not enforced** |
| Equipment conflicts (shield/two-handed/duplicate-slot) enforced | Partial | same-slot only |
| Weapon/armor derivation in #3 reads equipped instances, not strings | No | #3 attack is hardcoded; **define the read surface jointly** |
| Ammunition decremented only on correct resolved action | No | absent (needs #3) |
| Consumable applies effect + removes/decrements atomically | Partial | healing-only; not effect-driven |
| Healing from consumables uses shared #4 path | No | #4 `applyHealing` not built; potion leaves `unconscious` (BROKEN) |
| Merchant prices + currency arithmetic server-owned, before/after recorded | Yes | `:625-694` |
| Loot cannot be claimed twice under new command ID | Yes | `lootClaimed` |
| One reviewed magic item reuses #2 + cleans up on unequip/deplete | No | magic items blocked from equip/use |
| Refresh/restart preserves containers/quantities/equipment/charges/ownership | Partial | quantities/equipment/ownership persist; containers/charges new |
| Focused tests (transfer, full container, equip conflict, ammo, consumable rollback, insufficient funds, duplicate loot, replay, effect cleanup) | Partial | buy/equip/loot tested; the rest new |

## 5. Dependencies and risks

- **#2 (effects)** — magic-item charge/modifier effects + source-linked cleanup on unequip/deplete.
- **#3 (combat)** — equipped-weapon attack derivation must read these instances; define the read surface jointly. This is the key coordination point.
- **#4 (magic)** — canonical `applyHealing` for potions; fixes the #9 BROKEN potion path.
- **#6 (resolution)** — tool checks for crafting/repair/lockpicking (later).
- **#13 (social)** — stolen-property provenance and theft consequences (later).
- **Risk:** the equipped-instance read surface is shared with #3 — if #8 and #3 diverge, weapon attacks and AC derivation disagree. Lock the contract first.
- **Risk:** currency is a single copper scalar with a *view* breakdown; if physical-coin inventory/change-making is ever needed (e.g., weight of coin, exact-change theft), the model must change. Confirm single-scalar is acceptable for the slice.

## 6. Recommendation

Sequence: with **#2/#3/#4 → #8** (EPIC guide). Because the base loop is already proven, prioritize the **gaps that unblock other issues**: (1) define the equipped-instance read surface for #3; (2) make consumables route through #4's `applyHealing` (fixes #9); (3) add containers + weight enforcement. Defer the reviewed magic item until #2's charge/modifier primitives exist. Do **not** build a bespoke item-effect path — reuse #2.
