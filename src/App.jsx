import { useState, useEffect, useCallback } from "react";

// ─── PUZZLE ──────────────────────────────────────────────────────────────────
const PUZZLES = [
  { level: 1, words: [ { id: 0, word: "BLANKET", row: 0, col: 0, direction: "across" }, { id: 1, word: "GUST", row: 3, col: 0, direction: "across" }, { id: 2, word: "TIER", row: 5, col: 0, direction: "across" }, { id: 3, word: "BLIGHT", row: 0, col: 0, direction: "down" }, { id: 4, word: "NATTER", row: 0, col: 3, direction: "down" } ] },
  { level: 2, words: [ { id: 0, word: "CHAPTER", row: 0, col: 0, direction: "across" }, { id: 1, word: "NOVA", row: 3, col: 0, direction: "across" }, { id: 2, word: "GILL", row: 4, col: 0, direction: "across" }, { id: 3, word: "CRINGE", row: 0, col: 0, direction: "down" }, { id: 4, word: "PETAL", row: 0, col: 3, direction: "down" } ] },
  { level: 3, words: [ { id: 0, word: "WHISPER", row: 0, col: 0, direction: "across" }, { id: 1, word: "BETA", row: 3, col: 0, direction: "across" }, { id: 2, word: "TALL", row: 5, col: 0, direction: "across" }, { id: 3, word: "WOMBAT", row: 0, col: 0, direction: "down" }, { id: 4, word: "SCRAWL", row: 0, col: 3, direction: "down" } ] },
  { level: 4, words: [ { id: 0, word: "JOURNEY", row: 0, col: 0, direction: "across" }, { id: 1, word: "SNAP", row: 3, col: 0, direction: "across" }, { id: 2, word: "WIDE", row: 5, col: 0, direction: "across" }, { id: 3, word: "JIGSAW", row: 0, col: 0, direction: "down" }, { id: 4, word: "RIPPLE", row: 0, col: 3, direction: "down" } ] },
  { level: 5, words: [ { id: 0, word: "COMPLEX", row: 0, col: 0, direction: "across" }, { id: 1, word: "WORN", row: 3, col: 0, direction: "across" }, { id: 2, word: "BASH", row: 5, col: 0, direction: "across" }, { id: 3, word: "COBWEB", row: 0, col: 0, direction: "down" }, { id: 4, word: "PLINTH", row: 0, col: 3, direction: "down" } ] },
  { level: 6, words: [ { id: 0, word: "FICTION", row: 0, col: 0, direction: "across" }, { id: 1, word: "MILK", row: 3, col: 0, direction: "across" }, { id: 2, word: "ROSY", row: 5, col: 0, direction: "across" }, { id: 3, word: "FARMER", row: 0, col: 0, direction: "down" }, { id: 4, word: "TURKEY", row: 0, col: 3, direction: "down" } ] },
  { level: 7, words: [ { id: 0, word: "FORWARD", row: 0, col: 0, direction: "across" }, { id: 1, word: "DOLL", row: 3, col: 0, direction: "across" }, { id: 2, word: "EAST", row: 5, col: 0, direction: "across" }, { id: 3, word: "FIDDLE", row: 0, col: 0, direction: "down" }, { id: 4, word: "WALLET", row: 0, col: 3, direction: "down" } ] },
  { level: 8, words: [ { id: 0, word: "CAPTAIN", row: 0, col: 0, direction: "across" }, { id: 1, word: "TWIG", row: 3, col: 0, direction: "across" }, { id: 2, word: "EDGE", row: 5, col: 0, direction: "across" }, { id: 3, word: "CASTLE", row: 0, col: 0, direction: "down" }, { id: 4, word: "TANGLE", row: 0, col: 3, direction: "down" } ] },
  { level: 9, words: [ { id: 0, word: "MILLION", row: 0, col: 0, direction: "across" }, { id: 1, word: "TWIG", row: 3, col: 0, direction: "across" }, { id: 2, word: "ROPE", row: 5, col: 0, direction: "across" }, { id: 3, word: "MUSTER", row: 0, col: 0, direction: "down" }, { id: 4, word: "LEAGUE", row: 0, col: 3, direction: "down" } ] },
  { level: 10, words: [ { id: 0, word: "PICTURE", row: 0, col: 0, direction: "across" }, { id: 1, word: "SNOB", row: 3, col: 0, direction: "across" }, { id: 2, word: "RUSE", row: 5, col: 0, direction: "across" }, { id: 3, word: "PULSAR", row: 0, col: 0, direction: "down" }, { id: 4, word: "TREBLE", row: 0, col: 3, direction: "down" } ] },
  { level: 11, words: [ { id: 0, word: "PATTERN", row: 0, col: 0, direction: "across" }, { id: 1, word: "DEAD", row: 3, col: 0, direction: "across" }, { id: 2, word: "NEAR", row: 5, col: 0, direction: "across" }, { id: 3, word: "PARDON", row: 0, col: 0, direction: "down" }, { id: 4, word: "TENDER", row: 0, col: 3, direction: "down" } ] },
  { level: 12, words: [ { id: 0, word: "SCIENCE", row: 0, col: 0, direction: "across" }, { id: 1, word: "FETA", row: 3, col: 0, direction: "across" }, { id: 2, word: "LACK", row: 5, col: 0, direction: "across" }, { id: 3, word: "SINFUL", row: 0, col: 0, direction: "down" }, { id: 4, word: "EMBARK", row: 0, col: 3, direction: "down" } ] },
  { level: 13, words: [ { id: 0, word: "PERFECT", row: 0, col: 0, direction: "across" }, { id: 1, word: "AGOG", row: 3, col: 0, direction: "across" }, { id: 2, word: "EXIT", row: 5, col: 0, direction: "across" }, { id: 3, word: "PIRATE", row: 0, col: 0, direction: "down" }, { id: 4, word: "FORGET", row: 0, col: 3, direction: "down" } ] },
  { level: 14, words: [ { id: 0, word: "MONSTER", row: 0, col: 0, direction: "across" }, { id: 1, word: "FLAB", row: 3, col: 0, direction: "across" }, { id: 2, word: "NOSE", row: 5, col: 0, direction: "across" }, { id: 3, word: "MUFFIN", row: 0, col: 0, direction: "down" }, { id: 4, word: "STABLE", row: 0, col: 3, direction: "down" } ] },
  { level: 15, words: [ { id: 0, word: "LIBRARY", row: 0, col: 0, direction: "across" }, { id: 1, word: "CLUB", row: 3, col: 0, direction: "across" }, { id: 2, word: "ROPE", row: 5, col: 0, direction: "across" }, { id: 3, word: "LANCER", row: 0, col: 0, direction: "down" }, { id: 4, word: "RUBBLE", row: 0, col: 3, direction: "down" } ] },
  { level: 16, words: [ { id: 0, word: "CURTAIN", row: 0, col: 0, direction: "across" }, { id: 1, word: "ARAB", row: 3, col: 0, direction: "across" }, { id: 2, word: "TREE", row: 5, col: 0, direction: "across" }, { id: 3, word: "COBALT", row: 0, col: 0, direction: "down" }, { id: 4, word: "TIMBRE", row: 0, col: 3, direction: "down" } ] },
  { level: 17, words: [ { id: 0, word: "MINERAL", row: 0, col: 0, direction: "across" }, { id: 1, word: "DUEL", row: 3, col: 0, direction: "across" }, { id: 2, word: "ROAM", row: 5, col: 0, direction: "across" }, { id: 3, word: "MURDER", row: 0, col: 0, direction: "down" }, { id: 4, word: "EMBLEM", row: 0, col: 3, direction: "down" } ] },
  { level: 18, words: [ { id: 0, word: "WARRIOR", row: 0, col: 0, direction: "across" }, { id: 1, word: "DEED", row: 3, col: 0, direction: "across" }, { id: 2, word: "RUSE", row: 5, col: 0, direction: "across" }, { id: 3, word: "WANDER", row: 0, col: 0, direction: "down" }, { id: 4, word: "RIDDLE", row: 0, col: 3, direction: "down" } ] },
  { level: 19, words: [ { id: 0, word: "HOLIDAY", row: 0, col: 0, direction: "across" }, { id: 1, word: "LULU", row: 3, col: 0, direction: "across" }, { id: 2, word: "TINT", row: 5, col: 0, direction: "across" }, { id: 3, word: "HAMLET", row: 0, col: 0, direction: "down" }, { id: 4, word: "INSULT", row: 0, col: 3, direction: "down" } ] },
  { level: 20, words: [ { id: 0, word: "FEATHER", row: 0, col: 0, direction: "across" }, { id: 1, word: "TACO", row: 3, col: 0, direction: "across" }, { id: 2, word: "NINE", row: 5, col: 0, direction: "across" }, { id: 3, word: "FASTEN", row: 0, col: 0, direction: "down" }, { id: 4, word: "THRONE", row: 0, col: 3, direction: "down" } ] },
  { level: 21, words: [ { id: 0, word: "QUARTER", row: 0, col: 0, direction: "across" }, { id: 1, word: "VIBE", row: 3, col: 0, direction: "across" }, { id: 2, word: "RUST", row: 5, col: 0, direction: "across" }, { id: 3, word: "QUIVER", row: 0, col: 0, direction: "down" }, { id: 4, word: "RECENT", row: 0, col: 3, direction: "down" } ] },
  { level: 22, words: [ { id: 0, word: "CLIMATE", row: 0, col: 0, direction: "across" }, { id: 1, word: "SKIT", row: 3, col: 0, direction: "across" }, { id: 2, word: "TREE", row: 5, col: 0, direction: "across" }, { id: 3, word: "CLOSET", row: 0, col: 0, direction: "down" }, { id: 4, word: "MYRTLE", row: 0, col: 3, direction: "down" } ] },
  { level: 23, words: [ { id: 0, word: "PROTECT", row: 0, col: 0, direction: "across" }, { id: 1, word: "TOTS", row: 3, col: 0, direction: "across" }, { id: 2, word: "ROLL", row: 5, col: 0, direction: "across" }, { id: 3, word: "PORTER", row: 0, col: 0, direction: "down" }, { id: 4, word: "TINSEL", row: 0, col: 3, direction: "down" } ] },
  { level: 24, words: [ { id: 0, word: "FANTASY", row: 0, col: 0, direction: "across" }, { id: 1, word: "GOAT", row: 3, col: 0, direction: "across" }, { id: 2, word: "RUSH", row: 5, col: 0, direction: "across" }, { id: 3, word: "FINGER", row: 0, col: 0, direction: "down" }, { id: 4, word: "THATCH", row: 0, col: 3, direction: "down" } ] },
  { level: 25, words: [ { id: 0, word: "CABINET", row: 0, col: 0, direction: "across" }, { id: 1, word: "DELI", row: 3, col: 0, direction: "across" }, { id: 2, word: "EXIT", row: 5, col: 0, direction: "across" }, { id: 3, word: "CANDLE", row: 0, col: 0, direction: "down" }, { id: 4, word: "INSIST", row: 0, col: 3, direction: "down" } ] },
  { level: 26, words: [ { id: 0, word: "SOLDIER", row: 0, col: 0, direction: "across" }, { id: 1, word: "PAPA", row: 3, col: 0, direction: "across" }, { id: 2, word: "EVIL", row: 5, col: 0, direction: "across" }, { id: 3, word: "SIMPLE", row: 0, col: 0, direction: "down" }, { id: 4, word: "DETAIL", row: 0, col: 3, direction: "down" } ] },
  { level: 27, words: [ { id: 0, word: "CHICKEN", row: 0, col: 0, direction: "across" }, { id: 1, word: "SNOB", row: 3, col: 0, direction: "across" }, { id: 2, word: "LOFT", row: 5, col: 0, direction: "across" }, { id: 3, word: "CHISEL", row: 0, col: 0, direction: "down" }, { id: 4, word: "COMBAT", row: 0, col: 3, direction: "down" } ] },
  { level: 28, words: [ { id: 0, word: "PASTURE", row: 0, col: 0, direction: "across" }, { id: 1, word: "DRAB", row: 3, col: 0, direction: "across" }, { id: 2, word: "NONE", row: 5, col: 0, direction: "across" }, { id: 3, word: "PARDON", row: 0, col: 0, direction: "down" }, { id: 4, word: "TIMBRE", row: 0, col: 3, direction: "down" } ] },
  { level: 29, words: [ { id: 0, word: "MEASURE", row: 0, col: 0, direction: "across" }, { id: 1, word: "HAIR", row: 3, col: 0, direction: "across" }, { id: 2, word: "DEMO", row: 5, col: 0, direction: "across" }, { id: 3, word: "METHOD", row: 0, col: 0, direction: "down" }, { id: 4, word: "STEREO", row: 0, col: 3, direction: "down" } ] },
  { level: 30, words: [ { id: 0, word: "WHISTLE", row: 0, col: 0, direction: "across" }, { id: 1, word: "DART", row: 3, col: 0, direction: "across" }, { id: 2, word: "RAIN", row: 5, col: 0, direction: "across" }, { id: 3, word: "WONDER", row: 0, col: 0, direction: "down" }, { id: 4, word: "SULTAN", row: 0, col: 3, direction: "down" } ] },
  { level: 31, words: [ { id: 0, word: "SUSPECT", row: 0, col: 0, direction: "across" }, { id: 1, word: "VAMP", row: 3, col: 0, direction: "across" }, { id: 2, word: "LOVE", row: 5, col: 0, direction: "across" }, { id: 3, word: "SHOVEL", row: 0, col: 0, direction: "down" }, { id: 4, word: "PURPLE", row: 0, col: 3, direction: "down" } ] },
  { level: 32, words: [ { id: 0, word: "NETWORK", row: 0, col: 0, direction: "across" }, { id: 1, word: "KNUR", row: 3, col: 0, direction: "across" }, { id: 2, word: "LOSS", row: 5, col: 0, direction: "across" }, { id: 3, word: "NICKEL", row: 0, col: 0, direction: "down" }, { id: 4, word: "WALRUS", row: 0, col: 3, direction: "down" } ] },
  { level: 33, words: [ { id: 0, word: "COMFORT", row: 0, col: 0, direction: "across" }, { id: 1, word: "DRAB", row: 3, col: 0, direction: "across" }, { id: 2, word: "ROLE", row: 5, col: 0, direction: "across" }, { id: 3, word: "CINDER", row: 0, col: 0, direction: "down" }, { id: 4, word: "FUMBLE", row: 0, col: 3, direction: "down" } ] },
  { level: 34, words: [ { id: 0, word: "WEATHER", row: 0, col: 0, direction: "across" }, { id: 1, word: "LOGO", row: 3, col: 0, direction: "across" }, { id: 2, word: "TUNE", row: 5, col: 0, direction: "across" }, { id: 3, word: "WALLET", row: 0, col: 0, direction: "down" }, { id: 4, word: "THRONE", row: 0, col: 3, direction: "down" } ] },
  { level: 35, words: [ { id: 0, word: "COLLECT", row: 0, col: 0, direction: "across" }, { id: 1, word: "WEBB", row: 3, col: 0, direction: "across" }, { id: 2, word: "BURR", row: 5, col: 0, direction: "across" }, { id: 3, word: "COBWEB", row: 0, col: 0, direction: "down" }, { id: 4, word: "LUMBER", row: 0, col: 3, direction: "down" } ] },
  { level: 36, words: [ { id: 0, word: "BRACKET", row: 0, col: 0, direction: "across" }, { id: 1, word: "HALT", row: 3, col: 0, direction: "across" }, { id: 2, word: "RULE", row: 5, col: 0, direction: "across" }, { id: 3, word: "BOTHER", row: 0, col: 0, direction: "down" }, { id: 4, word: "CASTLE", row: 0, col: 3, direction: "down" } ] },
  { level: 37, words: [ { id: 0, word: "DOLPHIN", row: 0, col: 0, direction: "across" }, { id: 1, word: "KILT", row: 3, col: 0, direction: "across" }, { id: 2, word: "YARN", row: 5, col: 0, direction: "across" }, { id: 3, word: "DONKEY", row: 0, col: 0, direction: "down" }, { id: 4, word: "PISTON", row: 0, col: 3, direction: "down" } ] },
  { level: 38, words: [ { id: 0, word: "EMPEROR", row: 0, col: 0, direction: "across" }, { id: 1, word: "BULL", row: 3, col: 0, direction: "across" }, { id: 2, word: "EASY", row: 5, col: 0, direction: "across" }, { id: 3, word: "ENABLE", row: 0, col: 0, direction: "down" }, { id: 4, word: "EMPLOY", row: 0, col: 3, direction: "down" } ] },
  { level: 39, words: [ { id: 0, word: "FASHION", row: 0, col: 0, direction: "across" }, { id: 1, word: "HIKE", row: 3, col: 0, direction: "across" }, { id: 2, word: "MALT", row: 5, col: 0, direction: "across" }, { id: 3, word: "FATHOM", row: 0, col: 0, direction: "down" }, { id: 4, word: "HONEST", row: 0, col: 3, direction: "down" } ] },
  { level: 40, words: [ { id: 0, word: "GALLERY", row: 0, col: 0, direction: "across" }, { id: 1, word: "LOAD", row: 3, col: 0, direction: "across" }, { id: 2, word: "COIN", row: 5, col: 0, direction: "across" }, { id: 3, word: "GARLIC", row: 0, col: 0, direction: "down" }, { id: 4, word: "LINDEN", row: 0, col: 3, direction: "down" } ] },
  { level: 41, words: [ { id: 0, word: "HARMONY", row: 0, col: 0, direction: "across" }, { id: 1, word: "DUET", row: 3, col: 0, direction: "across" }, { id: 2, word: "EVER", row: 5, col: 0, direction: "across" }, { id: 3, word: "HANDLE", row: 0, col: 0, direction: "down" }, { id: 4, word: "MISTER", row: 0, col: 3, direction: "down" } ] },
  { level: 42, words: [ { id: 0, word: "IMAGINE", row: 0, col: 0, direction: "across" }, { id: 1, word: "UNIT", row: 3, col: 0, direction: "across" }, { id: 2, word: "TUBE", row: 5, col: 0, direction: "across" }, { id: 3, word: "INSULT", row: 0, col: 0, direction: "down" }, { id: 4, word: "GENTLE", row: 0, col: 3, direction: "down" } ] },
  { level: 43, words: [ { id: 0, word: "LANTERN", row: 0, col: 0, direction: "across" }, { id: 1, word: "BEES", row: 3, col: 0, direction: "across" }, { id: 2, word: "ROLL", row: 5, col: 0, direction: "across" }, { id: 3, word: "LUMBER", row: 0, col: 0, direction: "down" }, { id: 4, word: "TINSEL", row: 0, col: 3, direction: "down" } ] },
  { level: 44, words: [ { id: 0, word: "NOTHING", row: 0, col: 0, direction: "across" }, { id: 1, word: "KNIT", row: 3, col: 0, direction: "across" }, { id: 2, word: "LURE", row: 5, col: 0, direction: "across" }, { id: 3, word: "NICKEL", row: 0, col: 0, direction: "down" }, { id: 4, word: "HUSTLE", row: 0, col: 3, direction: "down" } ] },
  { level: 45, words: [ { id: 0, word: "OUTLINE", row: 0, col: 0, direction: "across" }, { id: 1, word: "ETCH", row: 3, col: 0, direction: "across" }, { id: 2, word: "TOLL", row: 5, col: 0, direction: "across" }, { id: 3, word: "ORIENT", row: 0, col: 0, direction: "down" }, { id: 4, word: "LETHAL", row: 0, col: 3, direction: "down" } ] },
  { level: 46, words: [ { id: 0, word: "POSSESS", row: 0, col: 0, direction: "across" }, { id: 1, word: "DELI", row: 3, col: 0, direction: "across" }, { id: 2, word: "NICE", row: 5, col: 0, direction: "across" }, { id: 3, word: "PARDON", row: 0, col: 0, direction: "down" }, { id: 4, word: "STRIDE", row: 0, col: 3, direction: "down" } ] },
  { level: 47, words: [ { id: 0, word: "QUALITY", row: 0, col: 0, direction: "across" }, { id: 1, word: "NOON", row: 3, col: 0, direction: "across" }, { id: 2, word: "HASH", row: 5, col: 0, direction: "across" }, { id: 3, word: "QUENCH", row: 0, col: 0, direction: "down" }, { id: 4, word: "LAUNCH", row: 0, col: 3, direction: "down" } ] },
  { level: 48, words: [ { id: 0, word: "RECEIPT", row: 0, col: 0, direction: "across" }, { id: 1, word: "DATA", row: 3, col: 0, direction: "across" }, { id: 2, word: "RINK", row: 5, col: 0, direction: "across" }, { id: 3, word: "RENDER", row: 0, col: 0, direction: "down" }, { id: 4, word: "EMBARK", row: 0, col: 3, direction: "down" } ] },
  { level: 49, words: [ { id: 0, word: "SPEAKER", row: 0, col: 0, direction: "across" }, { id: 1, word: "PALE", row: 3, col: 0, direction: "across" }, { id: 2, word: "EXIT", row: 5, col: 0, direction: "across" }, { id: 3, word: "SIMPLE", row: 0, col: 0, direction: "down" }, { id: 4, word: "ACCENT", row: 0, col: 3, direction: "down" } ] },
  { level: 50, words: [ { id: 0, word: "THEATRE", row: 0, col: 0, direction: "across" }, { id: 1, word: "ARCH", row: 3, col: 0, direction: "across" }, { id: 2, word: "HORA", row: 5, col: 0, direction: "across" }, { id: 3, word: "THRASH", row: 0, col: 0, direction: "down" }, { id: 4, word: "ASTHMA", row: 0, col: 3, direction: "down" } ] },
];

function buildCellMap(puzzle) {
  const map = {};
  puzzle.words.forEach(({ id, word, row, col, direction }) => {
    for (let i = 0; i < word.length; i++) {
      const r = direction === "down"   ? row + i : row;
      const c = direction === "across" ? col + i : col;
      const key = `${r},${c}`;
      if (!map[key]) map[key] = { letter: word[i], wordIds: [] };
      if (!map[key].wordIds.includes(id)) map[key].wordIds.push(id);
    }
  });
  return map;
}

function getRating(s) {
  if (s < 60)  return { grade: "A", label: "Blazing" };
  if (s < 120) return { grade: "B", label: "Sharp" };
  if (s < 210) return { grade: "C", label: "Steady" };
  if (s < 330) return { grade: "D", label: "Slow" };
  if (s < 480) return { grade: "E", label: "Struggling" };
  return { grade: "F", label: "Cracked" };
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M"],
];

const C = {
  bg:         "#f2ead8",   // aged newsprint
  card:       "#ede4cc",   // slightly darker newsprint
  border:     "#b8aa8a",
  borderDark: "#8a7a5a",
  text:       "#1a1408",   // near-black ink
  textMid:    "#4a3f28",
  textLight:  "#8a7a5a",
  accent:     "#1a1408",   // ink black as accent
  accentLt:   "#d8ceb0",
  accentGlow: "#4a3f28",
  green:      "#2a5a30",   // dark broadsheet green
  greenLt:    "#c8ddb8",
  greenGlow:  "#2a5a30",
  red:        "#8a1a1a",   // dark ink red
  redLt:      "#e8c8c0",
  cellEmpty:  "#e0d5b8",   // empty cell — slightly darker newsprint
  cellFilled: "#f8f2e0",   // filled cell — bright newsprint
  keyDefault: "#d8ceb0",
  keySelected:"#1a1408",
};

// ─── CONFETTI ────────────────────────────────────────────────────────────────
function Confetti({ active }) {
  if (!active) return null;
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i, x: Math.random() * 100, delay: Math.random() * 0.7,
    color: ["#c0622a","#e8824a","#2d7a4a","#4ab870","#f5c842","#6a8fd8","#d45f8a"][i % 7],
    size: 6 + Math.random() * 9, round: Math.random() > 0.5,
  }));
  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:999 }}>
      {pieces.map(p => (
        <div key={p.id} style={{
          position:"absolute", left:`${p.x}%`, top:"-14px",
          width:p.size, height:p.size,
          borderRadius: p.round ? "50%" : "2px",
          background: p.color,
          animation:`cfFall 1.6s ${p.delay}s ease-in forwards`,
        }} />
      ))}
      <style>{`@keyframes cfFall{0%{transform:translateY(0) rotate(0);}100%{transform:translateY(110vh) rotate(900deg);}}`}</style>
    </div>
  );
}

// ─── BURST ───────────────────────────────────────────────────────────────────
function Burst({ show, emoji, headline, sub, bg }) {
  return (
    <div style={{
      position:"fixed", inset:0,
      display:"flex", alignItems:"center", justifyContent:"center",
      pointerEvents:"none", zIndex:998,
      opacity: show ? 1 : 0,
      transform: show ? "scale(1)" : "scale(0.75)",
      transition:"opacity 0.15s, transform 0.15s",
    }}>
      <div style={{
        background: bg, borderRadius:20, padding:"24px 44px",
        textAlign:"center", boxShadow:"0 20px 60px rgba(0,0,0,0.18)",
        border:`1.5px solid ${C.borderDark}`,
      }}>
        <div style={{ fontSize:48, lineHeight:1, marginBottom:6 }}>{emoji}</div>
        <div style={{ fontSize:24, fontWeight:"bold", color:C.text, marginBottom:3 }}>{headline}</div>
        {sub && <div style={{ fontSize:14, color:C.textMid, fontStyle:"italic" }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
export default function Crosswords() {
  const savedLevel = parseInt(localStorage.getItem("crosswords_level") || "1", 10);
  const initialLevel = Math.min(Math.max(savedLevel, 1), PUZZLES.length);
  const [currentLevel, setCurrentLevel] = useState(initialLevel);
  const puzzle = PUZZLES[currentLevel - 1];
  const cellMap = buildCellMap(puzzle);
  const allKeys = Object.keys(cellMap);
  const coords  = allKeys.map(k => k.split(",").map(Number));
  const maxRow  = Math.max(...coords.map(([r]) => r));
  const maxCol  = Math.max(...coords.map(([,c]) => c));

  const [revealed,       setRevealed]       = useState(new Set());
  const [guessedWords,   setGuessedWords]   = useState(new Set());
  const [letterLeft,     setLetterLeft]     = useState(5);
  const [seconds,        setSeconds]        = useState(0);
  const [gameState,      setGameState]      = useState("playing");
  const [selected,       setSelected]       = useState(null);   // letter staged for confirm
  const [wrongLetters,   setWrongLetters]   = useState(new Set());
  const [correctLetters, setCorrectLetters] = useState(new Set());
  const [toast,          setToast]          = useState(null);
  const [pulsingCells,   setPulsingCells]   = useState(new Set());
  const [burst,          setBurst]          = useState(null);
  const [confetti,       setConfetti]       = useState(false);

  useEffect(() => {
    if (gameState !== "playing") return;
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [gameState]);

  const showToast = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2200);
  };

  const showBurst = useCallback((emoji, headline, sub, bg, withConfetti = false) => {
    setBurst({ emoji, headline, sub, bg });
    if (withConfetti) { setConfetti(true); setTimeout(() => setConfetti(false), 2000); }
    setTimeout(() => setBurst(null), 1600);
  }, []);

  const pulseKeys = (keys) => {
    setPulsingCells(new Set(keys));
    setTimeout(() => setPulsingCells(new Set()), 700);
  };

  const revealAll = useCallback(() => setRevealed(new Set(allKeys)), [allKeys]);

  const checkWin = useCallback((newGuessed) => {
    if (newGuessed.size === puzzle.words.length) {
      revealAll();
      setGameState("won");
      setTimeout(() => showBurst("🏆", "Puzzle Complete!", getRating(seconds).label, C.accentLt, true), 300);
    }
  }, [puzzle.words.length, revealAll, seconds, showBurst]);

  // ── Check if any word is fully revealed ──────────────────────────────────
  function checkCompletedWords(newRevealed, currentGuessed) {
    const newlyCompleted = puzzle.words.filter(w => {
      if (currentGuessed.has(w.id)) return false;
      return Array.from({ length: w.word.length }, (_, i) => {
        const r = w.direction === "down"   ? w.row + i : w.row;
        const c = w.direction === "across" ? w.col + i : w.col;
        return newRevealed.has(`${r},${c}`);
      }).every(Boolean);
    });
    return newlyCompleted;
  }

  // ── Handle key tap ────────────────────────────────────────────────────────
  function handleKeyTap(letter) {
    if (gameState !== "playing") return;
    if (wrongLetters.has(letter) || correctLetters.has(letter)) {
      showToast(`Already tried ${letter}`);
      return;
    }

    if (selected === letter) {
      // Second tap — confirm the guess
      confirmGuess(letter);
      setSelected(null);
    } else {
      // First tap — stage it
      setSelected(letter);
    }
  }

  function confirmGuess(letter) {
    if (letterLeft <= 0) { showToast("No letter guesses left"); return; }

    const hits = Object.entries(cellMap).filter(([, v]) => v.letter === letter).map(([k]) => k);

    if (hits.length > 0) {
      const newRevealed = new Set(revealed);
      hits.forEach(k => newRevealed.add(k));
      setRevealed(newRevealed);
      pulseKeys(hits);
      const newCorrect = new Set([...correctLetters, letter]);
      setCorrectLetters(newCorrect);

      // Check if any word is now fully revealed
      const completed = checkCompletedWords(newRevealed, guessedWords);
      if (completed.length > 0) {
        const newGuessed = new Set([...guessedWords, ...completed.map(w => w.id)]);
        setGuessedWords(newGuessed);
        const bonusLetters = completed.length * 2;
        setLetterLeft(n => n + bonusLetters);
        const isLastWord = newGuessed.size === puzzle.words.length;
        if (isLastWord) {
          // Win — skip the word burst, let checkWin handle the celebration
        } else {
          const names = completed.map(w => w.word).join(" & ");
          showBurst("🎉", `${names}!`, `+${bonusLetters} letter guesses`, C.greenLt, true);
        }
        setTimeout(() => checkWin(newGuessed), isLastWord ? 0 : 500);
      } else {
        showBurst("✨", `${letter}!`, `${hits.length} cell${hits.length > 1 ? "s" : ""} revealed`, C.accentLt);
      }
      // Correct — free guess, no cost

    } else {
      setWrongLetters(prev => new Set([...prev, letter]));
      setLetterLeft(prev => {
        const next = prev - 1;
        if (next <= 0) {
          revealAll();
          setGameState("lost");
          setTimeout(() => showBurst("💀", "No guesses left", "Solution revealed above", C.redLt), 200);
        } else {
          showToast(`No ${letter} in the puzzle — ${next} guess${next === 1 ? "" : "es"} left`, "bad");
        }
        return next;
      });
    }
  }

  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const rating = getRating(seconds);
  const CELL = 54, GAP = 5;

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"Georgia, serif", color:C.text }}>
      <Confetti active={confetti} />
      {burst && <Burst show={!!burst} {...burst} />}

      <style>{`
        @keyframes cellPop {
          0%   { transform:scale(1); }
          35%  { transform:scale(1.2); background:#f8f2d8; box-shadow:0 0 16px rgba(26,20,8,0.2); }
          100% { transform:scale(1); }
        }
        @keyframes badShake {
          0%,100% { transform:translateX(0); }
          25%     { transform:translateX(-8px); }
          75%     { transform:translateX(8px); }
        }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(6px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes keyPulse {
          0%   { transform:scale(1); }
          40%  { transform:scale(1.18); }
          100% { transform:scale(1); }
        }
        * { box-sizing:border-box; }
        button { cursor:pointer; font-family:Georgia,serif; border:none; }
        button:active { transform:scale(0.94); }
      `}</style>

      <div style={{ maxWidth:500, margin:"0 auto", padding:"28px 12px 40px" }}>

        {/* ── HEADER ── */}
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <div style={{ fontSize:40, fontWeight:"bold", letterSpacing:"0.12em", color:C.accent, lineHeight:1, fontVariant:"small-caps", textTransform:"uppercase", borderTop:`3px solid ${C.text}`, borderBottom:`3px solid ${C.text}`, padding:"6px 0", display:"inline-block" }}>
            CROSSWORDS
          </div>
          <div style={{ fontSize:11, letterSpacing:"0.3em", color:C.textLight, textTransform:"uppercase", marginTop:10 }}>
            Level {puzzle.level}
          </div>

        </div>

        {/* ── STATS ── */}
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:18, marginBottom:22 }}>
<Stat label="Time"    value={fmt(seconds)} mono />
          <Divider />
          <Stat label="Letters" value={letterLeft} colour={C.accent} />
          <Divider />
          <Stat label="Words"   value={`${guessedWords.size}/${puzzle.words.length}`} colour={C.green} />
        </div>

        {/* ── GRID ── */}
        <div style={{ display:"flex", justifyContent:"center", marginBottom:20 }}>
          <div style={{
            position:"relative",
            width:  (maxCol + 1) * (CELL + GAP) - GAP,
            height: (maxRow + 1) * (CELL + GAP) - GAP,
          }}>
            {/* Solved word highlights */}
            {puzzle.words.filter(w => guessedWords.has(w.id)).map(w => (
              <div key={`hl-${w.id}`} style={{
                position:"absolute",
                left: w.col * (CELL + GAP) - 3,
                top:  w.row * (CELL + GAP) - 3,
                width:  (w.direction === "across" ? w.word.length * (CELL + GAP) - GAP : CELL) + 6,
                height: (w.direction === "down"   ? w.word.length * (CELL + GAP) - GAP : CELL) + 6,
                borderRadius:12,
                border:`2.5px solid ${C.greenGlow}`,
                background:"rgba(74,184,112,0.07)",
                zIndex:0, pointerEvents:"none",
              }} />
            ))}

            {/* Cells */}
            {Object.entries(cellMap).map(([key, { letter }]) => {
              const [r, c] = key.split(",").map(Number);
              const isRev  = revealed.has(key);
              const isPop  = pulsingCells.has(key);
              return (
                <div key={key} style={{
                  position:"absolute",
                  left: c * (CELL + GAP), top: r * (CELL + GAP),
                  width:CELL, height:CELL, borderRadius:8,
                  background: isRev ? C.cellFilled : C.cellEmpty,
                  border:`2px solid ${isRev ? C.accentGlow : C.borderDark}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize: isRev ? 22 : 13,
                  fontWeight:"bold",
                  fontFamily: isRev ? "Georgia, serif" : "inherit",
                  color: isRev ? C.text : C.borderDark,
                  transition:"background 0.25s, border-color 0.25s",
                  animation: isPop ? "cellPop 0.6s ease" : "none",
                  boxShadow: isRev ? "0 2px 12px rgba(192,98,42,0.1)" : "none",
                  userSelect:"none", zIndex:1,
                }}>
                  {isRev ? letter : "·"}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── TOAST ── */}
        <div style={{
          height:22, textAlign:"center", fontSize:13, fontStyle:"italic",
          color: toast?.type === "bad" ? C.red : C.textMid,
          opacity: toast ? 1 : 0, transition:"opacity 0.2s",
          marginBottom:14,
          animation: toast?.type === "bad" ? "badShake 0.35s ease" : "none",
        }}>{toast?.msg}</div>

        {/* ── SELECTED LETTER INDICATOR ── */}
        {gameState === "playing" && (
          <div style={{
            textAlign:"center", marginBottom:12, height:36,
            display:"flex", alignItems:"center", justifyContent:"center", gap:10,
          }}>
            {selected ? (
              <>
                <div style={{
                  width:36, height:36, borderRadius:8,
                  background:C.accent, color:"#fff",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:20, fontWeight:"bold",
                  boxShadow:"0 4px 14px rgba(192,98,42,0.35)",
                  animation:"keyPulse 0.3s ease",
                }}>{selected}</div>
                <div style={{ fontSize:13, color:C.accent, fontStyle:"italic" }}>
                  Tap {selected} again to confirm
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{
                    background:"none", color:C.textLight,
                    fontSize:18, padding:"0 4px", lineHeight:1,
                  }}>✕</button>
              </>
            ) : (
              <div style={{ fontSize:12, color:C.textLight, fontStyle:"italic" }}>
                Tap a letter to select, tap again to confirm
              </div>
            )}
          </div>
        )}

        {/* ── KEYBOARD ── */}
        {gameState === "playing" && (
          <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"center" }}>
            {ROWS.map((row, ri) => (
              <div key={ri} style={{ display:"flex", gap:5 }}>
                {row.map(l => {
                  const isCorrect  = correctLetters.has(l);
                  const isWrong    = wrongLetters.has(l);
                  const isUsed     = isCorrect || isWrong;
                  const isSelected = selected === l;
                  return (
                    <button
                      key={l}
                      onClick={() => !isUsed && handleKeyTap(l)}
                      style={{
                        width:  34, height: 42, borderRadius:7,
                        fontSize:14, fontWeight:"bold",
                        background: isSelected ? C.accent
                                  : isCorrect  ? C.greenLt
                                  : isWrong    ? C.redLt
                                  : C.keyDefault,
                        color:  isSelected ? "#fff"
                              : isCorrect  ? C.green
                              : isWrong    ? C.red
                              : C.text,
                        border: isSelected ? `2px solid ${C.accentGlow}`
                              : isCorrect  ? `2px solid ${C.greenGlow}`
                              : isWrong    ? `2px solid ${C.red}`
                              : `2px solid transparent`,
                        opacity: isUsed && !isSelected ? 0.6 : 1,
                        transform: isSelected ? "scale(1.12)" : "scale(1)",
                        transition:"all 0.15s",
                        boxShadow: isSelected ? `0 4px 14px rgba(26,20,8,0.25)` : "none",
                        cursor: isUsed ? "default" : "pointer",
                      }}>
                      {l}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* ── END SCREEN ── */}
        {gameState !== "playing" && (
          <div style={{
            background: gameState === "won" ? C.greenLt : C.redLt,
            border:`1.5px solid ${gameState === "won" ? C.greenGlow : C.red}`,
            borderRadius:18, padding:"36px 24px", textAlign:"center",
            animation:"fadeUp 0.3s ease",
          }}>
            {gameState === "won" ? (
              <>
                <div style={{ fontSize:11, letterSpacing:"0.3em", color:C.green, textTransform:"uppercase", marginBottom:8 }}>Puzzle solved</div>
                <div style={{ fontSize:88, fontWeight:"bold", color:C.accent, lineHeight:1 }}>{rating.grade}</div>
                <div style={{ fontSize:16, color:C.textMid, marginTop:8 }}>{rating.label}</div>
                <div style={{ fontSize:13, color:C.textLight, marginTop:4, fontFamily:"monospace" }}>{fmt(seconds)}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize:32, marginBottom:8 }}>💀</div>
                <div style={{ fontSize:18, fontWeight:"bold", color:C.red, marginBottom:8 }}>Out of guesses!</div>
                <div style={{ fontSize:13, color:C.textMid, fontStyle:"italic" }}>Think you know the words? Try again!</div>
              </>
            )}
            <button
              onClick={() => {
                if (gameState === "won" && currentLevel < PUZZLES.length) {
                  const next = currentLevel + 1;
                  localStorage.setItem("crosswords_level", next);
                  setCurrentLevel(next);
                } else {
                  localStorage.setItem("crosswords_level", gameState === "won" ? 1 : currentLevel);
                }
                // Reset all game state
                setRevealed(new Set());
                setGuessedWords(new Set());
                setLetterLeft(5);
                setSeconds(0);
                setGameState("playing");
                setSelected(null);
                setWrongLetters(new Set());
                setCorrectLetters(new Set());
                setToast(null);
                setPulsingCells(new Set());
                setBurst(null);
                setConfetti(false);
              }}
              style={{
                marginTop:24, background:C.accent, border:"none",
                borderRadius:12, color:"#fff", padding:"14px 44px",
                fontSize:15, fontWeight:"bold", letterSpacing:"0.05em",
              }}>
              {gameState === "won" ? (currentLevel < PUZZLES.length ? "Next Level" : "Play Again") : "Try Again"}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

function Stat({ label, value, mono, colour }) {
  return (
    <div style={{ textAlign:"center" }}>
      <div style={{
        fontSize:18, fontWeight:"bold",
        fontFamily: mono ? "monospace" : "Georgia, serif",
        color: colour || "#3d2e1e",
      }}>{value}</div>
      <div style={{ fontSize:10, color:"#b09a7e", textTransform:"uppercase", letterSpacing:"0.15em", marginTop:2 }}>{label}</div>
    </div>
  );
}

function Divider() {
  return <div style={{ width:1, height:30, background:"#e8d9c4" }} />;
}
