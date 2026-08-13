"use strict";

const EconomyRules = Object.freeze({
  buyProvisions(player, shop, shopStocks, quantity) {
    const offer = shop?.provisionsForSale;
    const requested = Number(quantity);
    const stock = shopStocks?.[shop?.id] ?? 0;
    const totalCost = offer?.price * requested;
    if (!offer || !Number.isInteger(requested) || requested <= 0
      || requested > stock || player.currentGold < totalCost) {
      return { applied: false, quantity: 0, goldCost: 0, reason: "unavailable-or-unaffordable" };
    }
    player.currentGold -= totalCost;
    player.provisions += requested;
    shopStocks[shop.id] -= requested;
    return { applied: true, quantity: requested, goldCost: totalCost, reason: null };
  },

  itemSaleBlockReason(player, shop, item) {
    if (item.questItem || item.protected || item.sellable === false) return "Protected special item";
    if (Object.values(player.equippedItems).includes(item.id)) return "Currently equipped";
    if (player.packedItems.includes(item.id)) return "Currently packed";
    if (!this.shopAcceptsItem(shop, item) || !Number.isFinite(shop.sellValues[item.id])) {
      return "This vendor does not buy this item";
    }
    return "";
  },

  shopAcceptsItem(shop, item) {
    return shop.acceptedCategories.includes(item.category)
      || item.tags.some((tag) => shop.acceptedTags.includes(tag));
  },

  sellItem(player, shop, itemId) {
    const item = ITEM_DEFINITIONS[itemId];
    const reason = !shop || !item || !player.ownedItems[itemId]
      ? "Item unavailable"
      : this.itemSaleBlockReason(player, shop, item);
    if (reason) return { applied: false, goldEarned: 0, reason };
    const price = shop.sellValues[itemId];
    player.ownedItems[itemId] -= 1;
    if (player.ownedItems[itemId] <= 0) delete player.ownedItems[itemId];
    player.currentGold += price;
    return { applied: true, goldEarned: price, itemId, reason: null };
  },
});
