"use strict";

// All gameplay randomness flows through this API. Unseeded sources deliberately
// call Math.random at use time so normal play and existing debug hooks stay random.
const GameRandom = Object.freeze({
  create(seed = null) {
    if (seed === null || seed === undefined || seed === "") {
      return createSource(null, () => Math.random());
    }

    const normalizedSeed = String(seed);
    let state = hashSeed(normalizedSeed) || 0x6d2b79f5;
    return createSource(normalizedSeed, () => {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let value = Math.imul(state ^ (state >>> 15), 1 | state);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    });
  },

  random() {
    return Math.random();
  },
});

function createSource(seed, next) {
  const source = {
    seed,
    random: () => next(),
    int(minimum, maximum) {
      const low = Math.ceil(Math.min(minimum, maximum));
      const high = Math.floor(Math.max(minimum, maximum));
      return Math.floor(source.random() * (high - low + 1)) + low;
    },
    between(minimum, maximum) {
      return minimum + source.random() * (maximum - minimum);
    },
    pick(entries) {
      return entries.length > 0 ? entries[source.int(0, entries.length - 1)] : null;
    },
    weightedChoice(entries, weightKey = "weight") {
      if (!Array.isArray(entries) || entries.length === 0) {
        return null;
      }
      const totalWeight = entries.reduce(
        (sum, entry) => sum + Math.max(Number(entry?.[weightKey]) || 0, 0),
        0,
      );
      if (totalWeight <= 0) {
        return source.pick(entries);
      }
      let roll = source.random() * totalWeight;
      for (const entry of entries) {
        roll -= Math.max(Number(entry?.[weightKey]) || 0, 0);
        if (roll <= 0) {
          return entry;
        }
      }
      return entries.at(-1);
    },
  };
  return Object.freeze(source);
}

function hashSeed(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
