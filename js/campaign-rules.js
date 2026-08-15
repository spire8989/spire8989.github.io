"use strict";

const CampaignRules = Object.freeze({
  ownsCampaignItem(player, itemId) {
    return Boolean(ITEM_DEFINITIONS[itemId]?.campaignItem && player?.ownedItems?.[itemId]);
  },

  campaignItems(player) {
    return Object.keys(ITEM_DEFINITIONS)
      .filter((itemId) => this.ownsCampaignItem(player, itemId));
  },

  mainCampaignUnlocked(player) {
    return ExpeditionCatalog.isUnlocked(player, "search_for_merlin");
  },

  createShopStocks() {
    const stocks = Object.fromEntries(Object.values(SHOP_DEFINITIONS)
      .filter((shop) => shop.provisionsForSale)
      .map((shop) => [shop.id, shop.provisionsForSale.stock]));
    Object.values(SHOP_DEFINITIONS).forEach((shop) => Object.entries(shop.itemsForSale ?? {})
      .filter(([, offer]) => Number.isFinite(offer.stock))
      .forEach(([itemId, offer]) => { stocks[`${shop.id}:${itemId}`] = offer.stock; }));
    return stocks;
  },

  restockTownProvisions(shopStocks) {
    const shop = SHOP_DEFINITIONS.village_general_goods;
    const offer = shop.provisionsForSale;
    const before = Math.max(0, Number(shopStocks?.[shop.id] ?? offer.stock) || 0);
    const after = Math.min(offer.stock, before + EXPEDITION_TUNING.townProvisionRestock);
    if (shopStocks) shopStocks[shop.id] = after;
    return {
      stockBefore: before,
      stockAfter: after,
      quantity: after - before,
    };
  },

  enterLocation(player, shopStocks = null) {
    const before = player.provisions;
    if (player.provisions < EXPEDITION_TUNING.minimumTownProvisions) {
      player.provisions = EXPEDITION_TUNING.minimumTownProvisions;
    }
    const restock = shopStocks ? this.restockTownProvisions(shopStocks) : null;
    return {
      provisionsGranted: player.provisions - before,
      shopProvisionStockBefore: restock?.stockBefore ?? null,
      shopProvisionStockAfter: restock?.stockAfter ?? null,
      shopProvisionsRestocked: restock?.quantity ?? 0,
    };
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

  buyItemsTo(player, shopStocks, itemId, desiredQuantity, minimumGoldReserve = 0) {
    const shop = SHOP_DEFINITIONS.village_general_goods;
    const current = player.ownedItems[itemId] ?? 0;
    const needed = Math.max(0, Math.floor(Number(desiredQuantity) || 0) - current);
    const stock = shopStocks[`${shop.id}:${itemId}`] ?? shop.itemsForSale?.[itemId]?.stock ?? Infinity;
    const affordable = Math.floor(Math.max(0, player.currentGold - minimumGoldReserve)
      / (shop.itemsForSale?.[itemId]?.price ?? Infinity));
    const quantity = Math.min(needed, stock, affordable);
    if (quantity <= 0) {
      return {
        applied: false, quantity: 0, goldCost: 0, itemId,
        shortfall: needed, stock, reason: needed > stock ? "stock-unavailable" : "unaffordable",
      };
    }
    const result = EconomyRules.buyItem(player, shop, shopStocks, itemId, quantity);
    return { ...result, shortfall: Math.max(0, needed - result.quantity), stockBefore: stock };
  },
});
