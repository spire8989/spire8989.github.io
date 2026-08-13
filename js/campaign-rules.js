"use strict";

const CampaignRules = Object.freeze({
  createShopStocks() {
    return Object.fromEntries(Object.values(SHOP_DEFINITIONS)
      .filter((shop) => shop.provisionsForSale)
      .map((shop) => [shop.id, shop.provisionsForSale.stock]));
  },

  enterLocation(player) {
    const before = player.provisions;
    if (player.provisions < EXPEDITION_TUNING.minimumTownProvisions) {
      player.provisions = EXPEDITION_TUNING.minimumTownProvisions;
    }
    return { provisionsGranted: player.provisions - before };
  },

  sellMerchantItems(player, items) {
    const shop = SHOP_DEFINITIONS.village_general_goods;
    const sales = [];
    items.forEach(({ itemId, quantity }) => {
      let remaining = quantity;
      while (remaining > 0 && player.ownedItems[itemId]
        && !EconomyRules.itemSaleBlockReason(player, shop, ITEM_DEFINITIONS[itemId])) {
        const result = EconomyRules.sellItem(player, shop, itemId);
        if (!result.applied) break;
        sales.push({ itemId, goldEarned: result.goldEarned });
        remaining -= 1;
      }
    });
    return {
      sales,
      goldEarned: sales.reduce((sum, sale) => sum + sale.goldEarned, 0),
    };
  },

  buyProvisionsTo(player, shopStocks, desiredStock) {
    const shop = SHOP_DEFINITIONS.village_general_goods;
    const needed = Math.max(0, Math.ceil(desiredStock - player.provisions));
    const affordable = Math.floor(player.currentGold / shop.provisionsForSale.price);
    const available = shopStocks[shop.id] ?? 0;
    const quantity = Math.min(needed, affordable, available);
    if (quantity <= 0) {
      return { applied: false, quantity: 0, goldCost: 0, shortfall: needed };
    }
    const result = EconomyRules.buyProvisions(player, shop, shopStocks, quantity);
    return { ...result, shortfall: Math.max(0, needed - result.quantity) };
  },
});
