# Crafting System

Crafting is data-driven and uses the same recipe definition in camp, town,
and inn contexts. `CraftingRules.quote` is the authoritative availability
check; `CraftingRules.craft` consumes sources only after the complete quote is
valid, so a failed craft does not partially spend ingredients or gold.

## Canonical recipe shape

New recipes use typed ingredient rows:

```js
ingredients: [
  { type: "item", id: "white_stag_shard", quantity: 1 },
  { type: "material", id: "silver", quantity: 2 },
]
```

`item` rows resolve from owned or expedition-carried/unsecured item sources.
`material` rows resolve from the secured Material Bag or expedition material
state. Every row has a positive quantity and an explicit source type; the
editor validates IDs, duplicates, and source-specific selectors.

Older recipes using `ingredients: { id: quantity }` remain readable as a
compatibility format. Their `ingredientType` determines whether the map is an
item or material map. The ContentEditor converts legacy maps to canonical
typed rows when saving; new content should not author the legacy shape.

## Editor workflow

The GrailTools Recipes view provides one row per ingredient with type and
content selectors, quantity, duplicate, reorder, and remove controls. Item and
material references are collected separately for reverse-reference and
used-by views. Recipe output, provider, rarity, starter status, gold cost,
and raw JSON fallback remain available in the same editor.

## Current mixed recipe

The `threefold_seal` blacksmith recipe combines the route relic components
White Stag Shard, Barenton Stone, and Black Glass Tear with silver and sacred
oil. The three unique components are awarded by the Ancient Standing Stone,
Barenton, and Val hooks respectively. Crafting the unique Threefold Seal grants
the `threefold_concord` passive through the item definition.

## Verification

The combat browser suite covers mixed-recipe quoting and atomic consumption.
The location suite covers the live content and crafting UI, while the
ContentEditor tests cover canonical and legacy normalization, validation,
round-trip writes, and reverse references.
