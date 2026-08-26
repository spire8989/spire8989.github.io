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

  provisionShopForLocation(locationId = "broceliande_village") {
    const location = LOCATION_DEFINITIONS[locationId];
    if (!location) return null;
    const configuredShopId = location.serviceConfig?.provisionShopId;
    if (configuredShopId && SHOP_DEFINITIONS[configuredShopId]?.provisionsForSale) {
      return SHOP_DEFINITIONS[configuredShopId];
    }
    return (location.shops ?? [])
      .map((shopId) => SHOP_DEFINITIONS[shopId])
      .find((shop) => shop?.provisionsForSale) ?? null;
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
    return this.enterLocationById(player, shopStocks, player?.currentLocationId);
  },

  enterLocationById(player, shopStocks = null, locationId = "broceliande_village") {
    const location = LOCATION_DEFINITIONS[locationId] ?? LOCATION_DEFINITIONS.broceliande_village;
    const serviceConfig = location.serviceConfig ?? {};
    const before = player.provisions;
    if (serviceConfig.autoProvisionGrant !== false
      && player.provisions < EXPEDITION_TUNING.minimumTownProvisions) {
      player.provisions = EXPEDITION_TUNING.minimumTownProvisions;
    }
    const restockShopId = serviceConfig.restockProvisionShopId
      ?? (locationId === "broceliande_village" ? "village_general_goods" : null);
    const restock = shopStocks && restockShopId
      ? this.restockLocationProvisions(shopStocks, restockShopId)
      : null;
    return {
      provisionsGranted: player.provisions - before,
      shopProvisionStockBefore: restock?.stockBefore ?? null,
      shopProvisionStockAfter: restock?.stockAfter ?? null,
      shopProvisionsRestocked: restock?.quantity ?? 0,
    };
  },

  restockLocationProvisions(shopStocks, shopId) {
    const shop = SHOP_DEFINITIONS[shopId];
    if (!shop?.provisionsForSale) return null;
    const offer = shop.provisionsForSale;
    const before = Math.max(0, Number(shopStocks?.[shop.id] ?? offer.stock) || 0);
    const restockAmount = shop.id === "village_general_goods"
      ? EXPEDITION_TUNING.townProvisionRestock
      : Math.max(1, Math.floor(offer.stock * 0.25));
    const after = Math.min(offer.stock, before + restockAmount);
    if (shopStocks) shopStocks[shop.id] = after;
    return { stockBefore: before, stockAfter: after, quantity: after - before };
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
    return this.buyProvisionsToAtLocation(player, shopStocks, "broceliande_village", desiredStock);
  },

  buyProvisionsToAtLocation(player, shopStocks, locationId, desiredStock) {
    const shop = this.provisionShopForLocation(locationId);
    if (!shop?.provisionsForSale) {
      return {
        applied: false,
        quantity: 0,
        goldCost: 0,
        shortfall: Math.max(0, Math.ceil(Number(desiredStock) || 0) - (Number(player?.provisions) || 0)),
        shopId: null,
        reason: "service-disabled",
      };
    }
    const needed = Math.max(0, Math.ceil(desiredStock - player.provisions));
    const affordable = Math.floor(player.currentGold / shop.provisionsForSale.price);
    const available = shopStocks?.[shop.id] ?? 0;
    const quantity = Math.min(needed, affordable, available);
    if (quantity <= 0) {
      return {
        applied: false,
        quantity: 0,
        goldCost: 0,
        shortfall: needed,
        shopId: shop.id,
        reason: needed <= 0
          ? "already-sufficient"
          : available <= 0 ? "no-stock" : affordable <= 0 ? "no-gold" : "purchase-not-useful",
      };
    }
    const result = EconomyRules.buyProvisions(player, shop, shopStocks, quantity);
    return {
      ...result,
      shortfall: Math.max(0, needed - result.quantity),
      shopId: shop.id,
    };
  },

  buyItemsTo(player, shopStocks, itemId, desiredQuantity, minimumGoldReserve = 0) {
    return this.buyItemsToAtShop(
      player, shopStocks, "village_general_goods", itemId, desiredQuantity, minimumGoldReserve,
    );
  },

  buyItemsToAtShop(player, shopStocks, shopId, itemId, desiredQuantity, minimumGoldReserve = 0) {
    const shop = SHOP_DEFINITIONS[shopId];
    if (!shop) {
      return {
        applied: false, quantity: 0, goldCost: 0, itemId,
        shortfall: Math.max(0, Math.floor(Number(desiredQuantity) || 0)),
        stock: 0, reason: "shop-unavailable",
      };
    }
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
