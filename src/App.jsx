import { useState, useEffect, useRef, useCallback } from "react";

// ─── SUPABASE ────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://pprypxcjbeeuagfsfnwe.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcnlweGNqYmVldWFnZnNmbndlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MDc5NTAsImV4cCI6MjA5Njk4Mzk1MH0.lERWI7-Ce5Zf-Y2v2LqoWYNfMJa3b9AXEqQruwpF3TA";

async function dbRequest(method, path, body) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": method === "POST" ? "return=representation" : "",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch { return null; }
}

async function submitScore(data) {
  return dbRequest("POST", "scores", data);
}

async function fetchLeaderboard() {
  return dbRequest("GET", "scores?select=username,mode,level,seconds,score,streak,created_at&order=created_at.desc&limit=500");
}

// Returns "taken" | "yours" | "free"
async function checkUsername(username, deviceId) {
  const rows = await dbRequest("GET", `players?username=eq.${encodeURIComponent(username)}&select=device_id`);
  if (!rows || rows.length === 0) return "free";
  if (rows[0].device_id === deviceId) return "yours";
  return "taken";
}

async function registerUsername(username, deviceId) {
  return dbRequest("POST", "players", { username, device_id: deviceId });
}

function getDeviceId() {
  let id = localStorage.getItem("cw_device_id");
  if (!id) {
    id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    localStorage.setItem("cw_device_id", id);
  }
  return id;
}

// ─── SCORING ─────────────────────────────────────────────────────────────────
function calcScore(seconds) {
  if (seconds < 30)  return 100;
  if (seconds < 60)  return 90;
  if (seconds < 90)  return 80;
  if (seconds < 120) return 70;
  if (seconds < 180) return 60;
  if (seconds < 240) return 50;
  if (seconds < 300) return 40;
  if (seconds < 420) return 30;
  if (seconds < 540) return 20;
  return 10;
}

function getGrade(score) {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  if (score >= 25) return "E";
  return "F";
}

// ─── DAILY PUZZLE SELECTION ──────────────────────────────────────────────────
function getDailyIndex() {
  const start = new Date("2024-01-01");
  const now   = new Date();
  const diff  = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  return diff % 30;
}

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

// ─── PUZZLES ─────────────────────────────────────────────────────────────────
const PUZZLES = [
  { level: 1, words: [   {id:0,word:"HEDGE",row:0,col:0,direction:"across"},{id:1,word:"IDEAL",row:2,col:0,direction:"across"},{id:2,word:"TASTE",row:4,col:0,direction:"across"},{id:3,word:"HEIST",row:0,col:0,direction:"down"},{id:4,word:"DRESS",row:0,col:2,direction:"down"}   ] },
  { level: 2, words: [   {id:0,word:"INCOME",row:0,col:0,direction:"across"},{id:1,word:"EAST",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"INVEST",row:0,col:0,direction:"down"},{id:4,word:"OYSTER",row:0,col:3,direction:"down"}   ] },
  { level: 3, words: [   {id:0,word:"STORAGE",row:0,col:0,direction:"across"},{id:1,word:"INTRO",row:2,col:0,direction:"across"},{id:2,word:"TENSE",row:4,col:0,direction:"across"},{id:3,word:"SWIFT",row:0,col:0,direction:"down"},{id:4,word:"OFTEN",row:0,col:2,direction:"down"}   ] },
  { level: 4, words: [   {id:0,word:"CHALK",row:0,col:0,direction:"across"},{id:1,word:"INTRO",row:2,col:0,direction:"across"},{id:2,word:"ERROR",row:4,col:0,direction:"across"},{id:3,word:"CRIME",row:0,col:0,direction:"down"},{id:4,word:"ACTOR",row:0,col:2,direction:"down"}   ] },
  { level: 5, words: [   {id:0,word:"CLOSE",row:0,col:0,direction:"across"},{id:1,word:"IDLE",row:2,col:0,direction:"across"},{id:2,word:"BUDDY",row:4,col:0,direction:"across"},{id:3,word:"CLIMB",row:0,col:0,direction:"down"},{id:4,word:"ENEMY",row:0,col:4,direction:"down"}   ] },
  { level: 6, words: [   {id:0,word:"LOYAL",row:0,col:0,direction:"across"},{id:1,word:"COURT",row:2,col:0,direction:"across"},{id:2,word:"LIGHT",row:4,col:0,direction:"across"},{id:3,word:"LOCAL",row:0,col:0,direction:"down"},{id:4,word:"YOUNG",row:0,col:2,direction:"down"}   ] },
  { level: 7, words: [   {id:0,word:"STATION",row:0,col:0,direction:"across"},{id:1,word:"MOOD",row:3,col:0,direction:"across"},{id:2,word:"TIER",row:5,col:0,direction:"across"},{id:3,word:"SUBMIT",row:0,col:0,direction:"down"},{id:4,word:"TENDER",row:0,col:3,direction:"down"}   ] },
  { level: 8, words: [   {id:0,word:"TRACE",row:0,col:0,direction:"across"},{id:1,word:"EAST",row:2,col:0,direction:"across"},{id:2,word:"TIGER",row:4,col:0,direction:"across"},{id:3,word:"TREAT",row:0,col:0,direction:"down"},{id:4,word:"ENTER",row:0,col:4,direction:"down"}   ] },
  { level: 9, words: [   {id:0,word:"EVERY",row:0,col:0,direction:"across"},{id:1,word:"ANGRY",row:2,col:0,direction:"across"},{id:2,word:"TITLE",row:4,col:0,direction:"across"},{id:3,word:"EXACT",row:0,col:0,direction:"down"},{id:4,word:"EIGHT",row:0,col:2,direction:"down"}   ] },
  { level: 10, words: [   {id:0,word:"CAPTAIN",row:0,col:0,direction:"across"},{id:1,word:"EVADE",row:2,col:0,direction:"across"},{id:2,word:"KNOWN",row:4,col:0,direction:"across"},{id:3,word:"CLERK",row:0,col:0,direction:"down"},{id:4,word:"PIANO",row:0,col:2,direction:"down"}   ] },
  { level: 11, words: [   {id:0,word:"OBTAIN",row:0,col:0,direction:"across"},{id:1,word:"INPUT",row:2,col:0,direction:"across"},{id:2,word:"INTRO",row:4,col:0,direction:"across"},{id:3,word:"ORIGIN",row:0,col:0,direction:"down"},{id:4,word:"INTRO",row:0,col:4,direction:"down"}   ] },
  { level: 12, words: [   {id:0,word:"FIGHT",row:0,col:0,direction:"across"},{id:1,word:"USAGE",row:2,col:0,direction:"across"},{id:2,word:"DISCO",row:4,col:0,direction:"across"},{id:3,word:"FOUND",row:0,col:0,direction:"down"},{id:4,word:"GRASS",row:0,col:2,direction:"down"}   ] },
  { level: 13, words: [   {id:0,word:"LIBERTY",row:0,col:0,direction:"across"},{id:1,word:"EDGE",row:3,col:0,direction:"across"},{id:2,word:"YARD",row:5,col:0,direction:"across"},{id:3,word:"LIVELY",row:0,col:0,direction:"down"},{id:4,word:"EXTEND",row:0,col:3,direction:"down"}   ] },
  { level: 14, words: [   {id:0,word:"DOMAIN",row:0,col:0,direction:"across"},{id:1,word:"NINJA",row:2,col:0,direction:"across"},{id:2,word:"EAGLE",row:4,col:0,direction:"across"},{id:3,word:"DONKEY",row:0,col:0,direction:"down"},{id:4,word:"IMAGE",row:0,col:4,direction:"down"}   ] },
  { level: 15, words: [   {id:0,word:"FORWARD",row:0,col:0,direction:"across"},{id:1,word:"TRAP",row:3,col:0,direction:"across"},{id:2,word:"RAIN",row:5,col:0,direction:"across"},{id:3,word:"FOSTER",row:0,col:0,direction:"down"},{id:4,word:"WEAPON",row:0,col:3,direction:"down"}   ] },
  { level: 16, words: [   {id:0,word:"BANQUET",row:0,col:0,direction:"across"},{id:1,word:"URBAN",row:2,col:0,direction:"across"},{id:2,word:"TREND",row:4,col:0,direction:"across"},{id:3,word:"BLUNT",row:0,col:0,direction:"down"},{id:4,word:"NOBLE",row:0,col:2,direction:"down"}   ] },
  { level: 17, words: [   {id:0,word:"PATCH",row:0,col:0,direction:"across"},{id:1,word:"OPTIC",row:2,col:0,direction:"across"},{id:2,word:"DRESS",row:4,col:0,direction:"across"},{id:3,word:"PROUD",row:0,col:0,direction:"down"},{id:4,word:"TITLE",row:0,col:2,direction:"down"}   ] },
  { level: 18, words: [   {id:0,word:"WHOLE",row:0,col:0,direction:"across"},{id:1,word:"DISCO",row:2,col:0,direction:"across"},{id:2,word:"ENTRY",row:4,col:0,direction:"across"},{id:3,word:"WEDGE",row:0,col:0,direction:"down"},{id:4,word:"ONSET",row:0,col:2,direction:"down"}   ] },
  { level: 19, words: [   {id:0,word:"COVER",row:0,col:0,direction:"across"},{id:1,word:"OVAL",row:2,col:0,direction:"across"},{id:2,word:"ENEMY",row:4,col:0,direction:"across"},{id:3,word:"CLONE",row:0,col:0,direction:"down"},{id:4,word:"RALLY",row:0,col:4,direction:"down"}   ] },
  { level: 20, words: [   {id:0,word:"PROFILE",row:0,col:0,direction:"across"},{id:1,word:"CORD",row:3,col:0,direction:"across"},{id:2,word:"LANE",row:5,col:0,direction:"across"},{id:3,word:"PENCIL",row:0,col:0,direction:"down"},{id:4,word:"FIDDLE",row:0,col:3,direction:"down"}   ] },
  { level: 21, words: [   {id:0,word:"EQUIP",row:0,col:0,direction:"across"},{id:1,word:"UNDO",row:2,col:0,direction:"across"},{id:2,word:"LANCE",row:4,col:0,direction:"across"},{id:3,word:"EQUAL",row:0,col:0,direction:"down"},{id:4,word:"PROSE",row:0,col:4,direction:"down"}   ] },
  { level: 22, words: [   {id:0,word:"ACCENT",row:0,col:0,direction:"across"},{id:1,word:"INCH",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"ARTIST",row:0,col:0,direction:"down"},{id:4,word:"EITHER",row:0,col:3,direction:"down"}   ] },
  { level: 23, words: [   {id:0,word:"DEVOUR",row:0,col:0,direction:"across"},{id:1,word:"VISIT",row:2,col:0,direction:"across"},{id:2,word:"DONOR",row:4,col:0,direction:"across"},{id:3,word:"DIVIDE",row:0,col:0,direction:"down"},{id:4,word:"UTTER",row:0,col:4,direction:"down"}   ] },
  { level: 24, words: [   {id:0,word:"REQUIRE",row:0,col:0,direction:"across"},{id:1,word:"PRESS",row:2,col:0,direction:"across"},{id:2,word:"LAYER",row:4,col:0,direction:"across"},{id:3,word:"REPEL",row:0,col:0,direction:"down"},{id:4,word:"QUERY",row:0,col:2,direction:"down"}   ] },
  { level: 25, words: [   {id:0,word:"MOUSE",row:0,col:0,direction:"across"},{id:1,word:"RING",row:2,col:0,direction:"across"},{id:2,word:"HABIT",row:4,col:0,direction:"across"},{id:3,word:"MARCH",row:0,col:0,direction:"down"},{id:4,word:"EIGHT",row:0,col:4,direction:"down"}   ] },
  { level: 26, words: [   {id:0,word:"BREATH",row:0,col:0,direction:"across"},{id:1,word:"KNOW",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"BASKET",row:0,col:0,direction:"down"},{id:4,word:"ANSWER",row:0,col:3,direction:"down"}   ] },
  { level: 27, words: [   {id:0,word:"BRANCH",row:0,col:0,direction:"across"},{id:1,word:"TOMB",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"BETTER",row:0,col:0,direction:"down"},{id:4,word:"NIMBLE",row:0,col:3,direction:"down"}   ] },
  { level: 28, words: [   {id:0,word:"CONTAIN",row:0,col:0,direction:"across"},{id:1,word:"ARROW",row:2,col:0,direction:"across"},{id:2,word:"ENEMY",row:4,col:0,direction:"across"},{id:3,word:"CHASE",row:0,col:0,direction:"down"},{id:4,word:"NERVE",row:0,col:2,direction:"down"}   ] },
  { level: 29, words: [   {id:0,word:"PURPOSE",row:0,col:0,direction:"across"},{id:1,word:"REEF",row:3,col:0,direction:"across"},{id:2,word:"LEFT",row:5,col:0,direction:"across"},{id:3,word:"PETROL",row:0,col:0,direction:"down"},{id:4,word:"PROFIT",row:0,col:3,direction:"down"}   ] },
  { level: 30, words: [   {id:0,word:"BURST",row:0,col:0,direction:"across"},{id:1,word:"ABLE",row:2,col:0,direction:"across"},{id:2,word:"HUMID",row:4,col:0,direction:"across"},{id:3,word:"BEACH",row:0,col:0,direction:"down"},{id:4,word:"TREND",row:0,col:4,direction:"down"}   ] },
  { level: 31, words: [   {id:0,word:"HEALTH",row:0,col:0,direction:"across"},{id:1,word:"MOUSE",row:2,col:0,direction:"across"},{id:2,word:"ELECT",row:4,col:0,direction:"across"},{id:3,word:"HAMLET",row:0,col:0,direction:"down"},{id:4,word:"TREAT",row:0,col:4,direction:"down"}   ] },
  { level: 32, words: [   {id:0,word:"DECIDED",row:0,col:0,direction:"across"},{id:1,word:"ALSO",row:3,col:0,direction:"across"},{id:2,word:"LAST",row:5,col:0,direction:"across"},{id:3,word:"DETAIL",row:0,col:0,direction:"down"},{id:4,word:"IMPORT",row:0,col:3,direction:"down"}   ] },
  { level: 33, words: [   {id:0,word:"GUILTY",row:0,col:0,direction:"across"},{id:1,word:"ULTRA",row:2,col:0,direction:"across"},{id:2,word:"GREAT",row:4,col:0,direction:"across"},{id:3,word:"GRUDGE",row:0,col:0,direction:"down"},{id:4,word:"TOAST",row:0,col:4,direction:"down"}   ] },
  { level: 34, words: [   {id:0,word:"LEMON",row:0,col:0,direction:"across"},{id:1,word:"TITLE",row:2,col:0,direction:"across"},{id:2,word:"HARSH",row:4,col:0,direction:"across"},{id:3,word:"LATCH",row:0,col:0,direction:"down"},{id:4,word:"METER",row:0,col:2,direction:"down"}   ] },
  { level: 35, words: [   {id:0,word:"REPLACE",row:0,col:0,direction:"across"},{id:1,word:"ARMY",row:3,col:0,direction:"across"},{id:2,word:"NEAR",row:5,col:0,direction:"across"},{id:3,word:"RETAIN",row:0,col:0,direction:"down"},{id:4,word:"LAWYER",row:0,col:3,direction:"down"}   ] },
  { level: 36, words: [   {id:0,word:"PLANT",row:0,col:0,direction:"across"},{id:1,word:"THEFT",row:2,col:0,direction:"across"},{id:2,word:"HEDGE",row:4,col:0,direction:"across"},{id:3,word:"PATCH",row:0,col:0,direction:"down"},{id:4,word:"AHEAD",row:0,col:2,direction:"down"}   ] },
  { level: 37, words: [   {id:0,word:"ANIMAL",row:0,col:0,direction:"across"},{id:1,word:"HOOD",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"ANCHOR",row:0,col:0,direction:"down"},{id:4,word:"MIDDLE",row:0,col:3,direction:"down"}   ] },
  { level: 38, words: [   {id:0,word:"BEYOND",row:0,col:0,direction:"across"},{id:1,word:"TACO",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"BUTTER",row:0,col:0,direction:"down"},{id:4,word:"OPPOSE",row:0,col:3,direction:"down"}   ] },
  { level: 39, words: [   {id:0,word:"BELOW",row:0,col:0,direction:"across"},{id:1,word:"AGAIN",row:2,col:0,direction:"across"},{id:2,word:"TENTH",row:4,col:0,direction:"across"},{id:3,word:"BLAST",row:0,col:0,direction:"down"},{id:4,word:"LEARN",row:0,col:2,direction:"down"}   ] },
  { level: 40, words: [   {id:0,word:"MERIT",row:0,col:0,direction:"across"},{id:1,word:"TENSE",row:2,col:0,direction:"across"},{id:2,word:"ROWDY",row:4,col:0,direction:"across"},{id:3,word:"METER",row:0,col:0,direction:"down"},{id:4,word:"RENEW",row:0,col:2,direction:"down"}   ] },
  { level: 41, words: [   {id:0,word:"CYCLE",row:0,col:0,direction:"across"},{id:1,word:"BOOT",row:2,col:0,direction:"across"},{id:2,word:"NINJA",row:4,col:0,direction:"across"},{id:3,word:"CABIN",row:0,col:0,direction:"down"},{id:4,word:"EXTRA",row:0,col:4,direction:"down"}   ] },
  { level: 42, words: [   {id:0,word:"NAIVE",row:0,col:0,direction:"across"},{id:1,word:"VAPOR",row:2,col:0,direction:"across"},{id:2,word:"LATCH",row:4,col:0,direction:"across"},{id:3,word:"NOVEL",row:0,col:0,direction:"down"},{id:4,word:"INPUT",row:0,col:2,direction:"down"}   ] },
  { level: 43, words: [   {id:0,word:"FORCE",row:0,col:0,direction:"across"},{id:1,word:"UPPER",row:2,col:0,direction:"across"},{id:2,word:"ELDER",row:4,col:0,direction:"across"},{id:3,word:"FLUTE",row:0,col:0,direction:"down"},{id:4,word:"RAPID",row:0,col:2,direction:"down"}   ] },
  { level: 44, words: [   {id:0,word:"FLIGHT",row:0,col:0,direction:"across"},{id:1,word:"TREND",row:2,col:0,direction:"across"},{id:2,word:"OZONE",row:4,col:0,direction:"across"},{id:3,word:"FATHOM",row:0,col:0,direction:"down"},{id:4,word:"HEDGE",row:0,col:4,direction:"down"}   ] },
  { level: 45, words: [   {id:0,word:"PROCEED",row:0,col:0,direction:"across"},{id:1,word:"THOU",row:3,col:0,direction:"across"},{id:2,word:"NOON",row:5,col:0,direction:"across"},{id:3,word:"PISTON",row:0,col:0,direction:"down"},{id:4,word:"COLUMN",row:0,col:3,direction:"down"}   ] },
  { level: 46, words: [   {id:0,word:"NEVER",row:0,col:0,direction:"across"},{id:1,word:"ICON",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"NOISE",row:0,col:0,direction:"down"},{id:4,word:"RANCH",row:0,col:4,direction:"down"}   ] },
  { level: 47, words: [   {id:0,word:"GRUMPY",row:0,col:0,direction:"across"},{id:1,word:"IDEAL",row:2,col:0,direction:"across"},{id:2,word:"ERROR",row:4,col:0,direction:"across"},{id:3,word:"GLIDER",row:0,col:0,direction:"down"},{id:4,word:"POLAR",row:0,col:4,direction:"down"}   ] },
  { level: 48, words: [   {id:0,word:"GREEN",row:0,col:0,direction:"across"},{id:1,word:"ICON",row:2,col:0,direction:"across"},{id:2,word:"FLORA",row:4,col:0,direction:"across"},{id:3,word:"GRIEF",row:0,col:0,direction:"down"},{id:4,word:"NINJA",row:0,col:4,direction:"down"}   ] },
  { level: 49, words: [   {id:0,word:"POTTER",row:0,col:0,direction:"across"},{id:1,word:"RAID",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"PARROT",row:0,col:0,direction:"down"},{id:4,word:"TENDER",row:0,col:3,direction:"down"}   ] },
  { level: 50, words: [   {id:0,word:"ECLIPSE",row:0,col:0,direction:"across"},{id:1,word:"ONCE",row:3,col:0,direction:"across"},{id:2,word:"TUFT",row:5,col:0,direction:"across"},{id:3,word:"EFFORT",row:0,col:0,direction:"down"},{id:4,word:"INVEST",row:0,col:3,direction:"down"}   ] },
  { level: 51, words: [   {id:0,word:"MOUNT",row:0,col:0,direction:"across"},{id:1,word:"DISCO",row:2,col:0,direction:"across"},{id:2,word:"LATCH",row:4,col:0,direction:"across"},{id:3,word:"MODEL",row:0,col:0,direction:"down"},{id:4,word:"UPSET",row:0,col:2,direction:"down"}   ] },
  { level: 52, words: [   {id:0,word:"STRIFE",row:0,col:0,direction:"across"},{id:1,word:"LANCE",row:2,col:0,direction:"across"},{id:2,word:"CRUSH",row:4,col:0,direction:"across"},{id:3,word:"SELECT",row:0,col:0,direction:"down"},{id:4,word:"FRESH",row:0,col:4,direction:"down"}   ] },
  { level: 53, words: [   {id:0,word:"MURDER",row:0,col:0,direction:"across"},{id:1,word:"SUPER",row:2,col:0,direction:"across"},{id:2,word:"RULER",row:4,col:0,direction:"across"},{id:3,word:"MISERY",row:0,col:0,direction:"down"},{id:4,word:"ERROR",row:0,col:4,direction:"down"}   ] },
  { level: 54, words: [   {id:0,word:"TENSE",row:0,col:0,direction:"across"},{id:1,word:"MUSE",row:2,col:0,direction:"across"},{id:2,word:"ONSET",row:4,col:0,direction:"across"},{id:3,word:"TEMPO",row:0,col:0,direction:"down"},{id:4,word:"ELECT",row:0,col:4,direction:"down"}   ] },
  { level: 55, words: [   {id:0,word:"STEAL",row:0,col:0,direction:"across"},{id:1,word:"IDEA",row:2,col:0,direction:"across"},{id:2,word:"KNOWN",row:4,col:0,direction:"across"},{id:3,word:"STICK",row:0,col:0,direction:"down"},{id:4,word:"LEARN",row:0,col:4,direction:"down"}   ] },
  { level: 56, words: [   {id:0,word:"LONELY",row:0,col:0,direction:"across"},{id:1,word:"INCH",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"LAVISH",row:0,col:0,direction:"down"},{id:4,word:"EITHER",row:0,col:3,direction:"down"}   ] },
  { level: 57, words: [   {id:0,word:"EXIST",row:0,col:0,direction:"across"},{id:1,word:"IDEA",row:2,col:0,direction:"across"},{id:2,word:"ELITE",row:4,col:0,direction:"across"},{id:3,word:"ELITE",row:0,col:0,direction:"down"},{id:4,word:"TRACE",row:0,col:4,direction:"down"}   ] },
  { level: 58, words: [   {id:0,word:"SIMILAR",row:0,col:0,direction:"across"},{id:1,word:"ONSET",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"STONE",row:0,col:0,direction:"down"},{id:4,word:"MISER",row:0,col:2,direction:"down"}   ] },
  { level: 59, words: [   {id:0,word:"DANCE",row:0,col:0,direction:"across"},{id:1,word:"NEAR",row:2,col:0,direction:"across"},{id:2,word:"ROUGH",row:4,col:0,direction:"across"},{id:3,word:"DONOR",row:0,col:0,direction:"down"},{id:4,word:"EARTH",row:0,col:4,direction:"down"}   ] },
  { level: 60, words: [   {id:0,word:"STATUS",row:0,col:0,direction:"across"},{id:1,word:"ROAM",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"SECRET",row:0,col:0,direction:"down"},{id:4,word:"TREMOR",row:0,col:3,direction:"down"}   ] },
  { level: 61, words: [   {id:0,word:"GREET",row:0,col:0,direction:"across"},{id:1,word:"AREA",row:2,col:0,direction:"across"},{id:2,word:"STEAL",row:4,col:0,direction:"across"},{id:3,word:"GLASS",row:0,col:0,direction:"down"},{id:4,word:"TRAIL",row:0,col:4,direction:"down"}   ] },
  { level: 62, words: [   {id:0,word:"DELIVER",row:0,col:0,direction:"across"},{id:1,word:"ALSO",row:3,col:0,direction:"across"},{id:2,word:"EMIT",row:5,col:0,direction:"across"},{id:3,word:"DAMAGE",row:0,col:0,direction:"down"},{id:4,word:"IMPORT",row:0,col:3,direction:"down"}   ] },
  { level: 63, words: [   {id:0,word:"MAPLE",row:0,col:0,direction:"across"},{id:1,word:"GUST",row:2,col:0,direction:"across"},{id:2,word:"COBRA",row:4,col:0,direction:"across"},{id:3,word:"MAGIC",row:0,col:0,direction:"down"},{id:4,word:"EXTRA",row:0,col:4,direction:"down"}   ] },
  { level: 64, words: [   {id:0,word:"BLEND",row:0,col:0,direction:"across"},{id:1,word:"AGAIN",row:2,col:0,direction:"across"},{id:2,word:"DREAM",row:4,col:0,direction:"across"},{id:3,word:"BRAND",row:0,col:0,direction:"down"},{id:4,word:"EVADE",row:0,col:2,direction:"down"}   ] },
  { level: 65, words: [   {id:0,word:"HAPPEN",row:0,col:0,direction:"across"},{id:1,word:"THEN",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"HUNTER",row:0,col:0,direction:"down"},{id:4,word:"PLUNGE",row:0,col:3,direction:"down"}   ] },
  { level: 66, words: [   {id:0,word:"JUDGE",row:0,col:0,direction:"across"},{id:1,word:"IDLE",row:2,col:0,direction:"across"},{id:2,word:"ENEMY",row:4,col:0,direction:"across"},{id:3,word:"JUICE",row:0,col:0,direction:"down"},{id:4,word:"ENEMY",row:0,col:4,direction:"down"}   ] },
  { level: 67, words: [   {id:0,word:"OTHER",row:0,col:0,direction:"across"},{id:1,word:"THOU",row:2,col:0,direction:"across"},{id:2,word:"NORTH",row:4,col:0,direction:"across"},{id:3,word:"OFTEN",row:0,col:0,direction:"down"},{id:4,word:"ROUGH",row:0,col:4,direction:"down"}   ] },
  { level: 68, words: [   {id:0,word:"SEGMENT",row:0,col:0,direction:"across"},{id:1,word:"OZONE",row:2,col:0,direction:"across"},{id:2,word:"TASTE",row:4,col:0,direction:"across"},{id:3,word:"SPORT",row:0,col:0,direction:"down"},{id:4,word:"GLOSS",row:0,col:2,direction:"down"}   ] },
  { level: 69, words: [   {id:0,word:"TENTH",row:0,col:0,direction:"across"},{id:1,word:"ICON",row:2,col:0,direction:"across"},{id:2,word:"EAGLE",row:4,col:0,direction:"across"},{id:3,word:"TRITE",row:0,col:0,direction:"down"},{id:4,word:"HINGE",row:0,col:4,direction:"down"}   ] },
  { level: 70, words: [   {id:0,word:"SUBMIT",row:0,col:0,direction:"across"},{id:1,word:"UNIT",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"SLOUCH",row:0,col:0,direction:"down"},{id:4,word:"MUSTER",row:0,col:3,direction:"down"}   ] },
  { level: 71, words: [   {id:0,word:"FOREST",row:0,col:0,direction:"across"},{id:1,word:"LANCE",row:2,col:0,direction:"across"},{id:2,word:"OZONE",row:4,col:0,direction:"across"},{id:3,word:"FOLLOW",row:0,col:0,direction:"down"},{id:4,word:"SCENE",row:0,col:4,direction:"down"}   ] },
  { level: 72, words: [   {id:0,word:"EVIDENT",row:0,col:0,direction:"across"},{id:1,word:"UPPER",row:2,col:0,direction:"across"},{id:2,word:"LOYAL",row:4,col:0,direction:"across"},{id:3,word:"EQUAL",row:0,col:0,direction:"down"},{id:4,word:"IMPLY",row:0,col:2,direction:"down"}   ] },
  { level: 73, words: [   {id:0,word:"CLIMB",row:0,col:0,direction:"across"},{id:1,word:"MEAN",row:2,col:0,direction:"across"},{id:2,word:"TEACH",row:4,col:0,direction:"across"},{id:3,word:"COMET",row:0,col:0,direction:"down"},{id:4,word:"BENCH",row:0,col:4,direction:"down"}   ] },
  { level: 74, words: [   {id:0,word:"LESSEN",row:0,col:0,direction:"across"},{id:1,word:"YOUNG",row:2,col:0,direction:"across"},{id:2,word:"USAGE",row:4,col:0,direction:"across"},{id:3,word:"LAYOUT",row:0,col:0,direction:"down"},{id:4,word:"EAGLE",row:0,col:4,direction:"down"}   ] },
  { level: 75, words: [   {id:0,word:"COLUMN",row:0,col:0,direction:"across"},{id:1,word:"TUNA",row:3,col:0,direction:"across"},{id:2,word:"MIRROR",row:5,col:0,direction:"across"},{id:3,word:"CUSTOM",row:0,col:0,direction:"down"},{id:4,word:"UNFAIR",row:0,col:3,direction:"down"}   ] },
  { level: 76, words: [   {id:0,word:"OZONE",row:0,col:0,direction:"across"},{id:1,word:"SHIFT",row:2,col:0,direction:"across"},{id:2,word:"THEFT",row:4,col:0,direction:"across"},{id:3,word:"ONSET",row:0,col:0,direction:"down"},{id:4,word:"OLIVE",row:0,col:2,direction:"down"}   ] },
  { level: 77, words: [   {id:0,word:"BLESS",row:0,col:0,direction:"across"},{id:1,word:"EVENT",row:2,col:0,direction:"across"},{id:2,word:"DITCH",row:4,col:0,direction:"across"},{id:3,word:"BLEND",row:0,col:0,direction:"down"},{id:4,word:"EVENT",row:0,col:2,direction:"down"}   ] },
  { level: 78, words: [   {id:0,word:"FANTASY",row:0,col:0,direction:"across"},{id:1,word:"FIGHT",row:2,col:0,direction:"across"},{id:2,word:"HOTEL",row:4,col:0,direction:"across"},{id:3,word:"FIFTH",row:0,col:0,direction:"down"},{id:4,word:"NIGHT",row:0,col:2,direction:"down"}   ] },
  { level: 79, words: [   {id:0,word:"GIVEN",row:0,col:0,direction:"across"},{id:1,word:"ACTOR",row:2,col:0,direction:"across"},{id:2,word:"SURGE",row:4,col:0,direction:"across"},{id:3,word:"GLASS",row:0,col:0,direction:"down"},{id:4,word:"VOTER",row:0,col:2,direction:"down"}   ] },
  { level: 80, words: [  {id:0,word:"INTRO",row:0,col:0,direction:"across"},{id:1,word:"SUIT",row:2,col:0,direction:"across"},{id:2,word:"ENTER",row:4,col:0,direction:"across"},{id:3,word:"ISSUE",row:0,col:0,direction:"down"},{id:4,word:"OUTER",row:0,col:4,direction:"down"}  ] },
  { level: 81, words: [   {id:0,word:"SUFFER",row:0,col:0,direction:"across"},{id:1,word:"LANCE",row:2,col:0,direction:"across"},{id:2,word:"ANGRY",row:4,col:0,direction:"across"},{id:3,word:"SULTAN",row:0,col:0,direction:"down"},{id:4,word:"ENEMY",row:0,col:4,direction:"down"}   ] },
  { level: 82, words: [   {id:0,word:"COMFORT",row:0,col:0,direction:"across"},{id:1,word:"ANGRY",row:2,col:0,direction:"across"},{id:2,word:"MATCH",row:4,col:0,direction:"across"},{id:3,word:"CHARM",row:0,col:0,direction:"down"},{id:4,word:"MIGHT",row:0,col:2,direction:"down"}   ] },
  { level: 83, words: [   {id:0,word:"RESCUE",row:0,col:0,direction:"across"},{id:1,word:"DEED",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"RENDER",row:0,col:0,direction:"down"},{id:4,word:"CANDLE",row:0,col:3,direction:"down"}   ] },
  { level: 84, words: [   {id:0,word:"BLAND",row:0,col:0,direction:"across"},{id:1,word:"OLIVE",row:2,col:0,direction:"across"},{id:2,word:"DREAD",row:4,col:0,direction:"across"},{id:3,word:"BROOD",row:0,col:0,direction:"down"},{id:4,word:"ASIDE",row:0,col:2,direction:"down"}   ] },
  { level: 85, words: [   {id:0,word:"CARRY",row:0,col:0,direction:"across"},{id:1,word:"ONSET",row:2,col:0,direction:"across"},{id:2,word:"HINGE",row:4,col:0,direction:"across"},{id:3,word:"CLOTH",row:0,col:0,direction:"down"},{id:4,word:"RESIN",row:0,col:2,direction:"down"}   ] },
  { level: 86, words: [   {id:0,word:"MAGIC",row:0,col:0,direction:"across"},{id:1,word:"DRESS",row:2,col:0,direction:"across"},{id:2,word:"LODGE",row:4,col:0,direction:"across"},{id:3,word:"MODEL",row:0,col:0,direction:"down"},{id:4,word:"GREED",row:0,col:2,direction:"down"}   ] },
  { level: 87, words: [   {id:0,word:"COURAGE",row:0,col:0,direction:"across"},{id:1,word:"ASIDE",row:2,col:0,direction:"across"},{id:2,word:"SUNNY",row:4,col:0,direction:"across"},{id:3,word:"CLASS",row:0,col:0,direction:"down"},{id:4,word:"UNION",row:0,col:2,direction:"down"}   ] },
  { level: 88, words: [   {id:0,word:"WATCH",row:0,col:0,direction:"across"},{id:1,word:"DEED",row:2,col:0,direction:"across"},{id:2,word:"ELITE",row:4,col:0,direction:"across"},{id:3,word:"WEDGE",row:0,col:0,direction:"down"},{id:4,word:"HEDGE",row:0,col:4,direction:"down"}   ] },
  { level: 89, words: [   {id:0,word:"UNUSUAL",row:0,col:0,direction:"across"},{id:1,word:"PATCH",row:2,col:0,direction:"across"},{id:2,word:"RELAY",row:4,col:0,direction:"across"},{id:3,word:"UPPER",row:0,col:0,direction:"down"},{id:4,word:"UNTIL",row:0,col:2,direction:"down"}   ] },
  { level: 90, words: [   {id:0,word:"MISSING",row:0,col:0,direction:"across"},{id:1,word:"ICON",row:3,col:0,direction:"across"},{id:2,word:"EVIL",row:5,col:0,direction:"across"},{id:3,word:"MOTIVE",row:0,col:0,direction:"down"},{id:4,word:"SIGNAL",row:0,col:3,direction:"down"}   ] },
  { level: 91, words: [  {id:0,word:"CHILD",row:0,col:0,direction:"across"},{id:1,word:"COIN",row:2,col:0,direction:"across"},{id:2,word:"EAGLE",row:4,col:0,direction:"across"},{id:3,word:"CYCLE",row:0,col:0,direction:"down"},{id:4,word:"DANCE",row:0,col:4,direction:"down"}  ] },
  { level: 92, words: [   {id:0,word:"METER",row:0,col:0,direction:"across"},{id:1,word:"DREAM",row:2,col:0,direction:"across"},{id:2,word:"LODGE",row:4,col:0,direction:"across"},{id:3,word:"MODEL",row:0,col:0,direction:"down"},{id:4,word:"TREND",row:0,col:2,direction:"down"}   ] },
  { level: 93, words: [   {id:0,word:"ADHERE",row:0,col:0,direction:"across"},{id:1,word:"OVER",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"ARMOUR",row:0,col:0,direction:"down"},{id:4,word:"EMERGE",row:0,col:3,direction:"down"}   ] },
  { level: 94, words: [   {id:0,word:"UNDERGO",row:0,col:0,direction:"across"},{id:1,word:"TRICK",row:2,col:0,direction:"across"},{id:2,word:"AHEAD",row:4,col:0,direction:"across"},{id:3,word:"ULTRA",row:0,col:0,direction:"down"},{id:4,word:"DRIVE",row:0,col:2,direction:"down"}   ] },
  { level: 95, words: [   {id:0,word:"SHAME",row:0,col:0,direction:"across"},{id:1,word:"AHEAD",row:2,col:0,direction:"across"},{id:2,word:"ELDER",row:4,col:0,direction:"across"},{id:3,word:"SLATE",row:0,col:0,direction:"down"},{id:4,word:"AHEAD",row:0,col:2,direction:"down"}   ] },
  { level: 96, words: [   {id:0,word:"UPSET",row:0,col:0,direction:"across"},{id:1,word:"BLESS",row:2,col:0,direction:"across"},{id:2,word:"NERVE",row:4,col:0,direction:"across"},{id:3,word:"URBAN",row:0,col:0,direction:"down"},{id:4,word:"STEER",row:0,col:2,direction:"down"}   ] },
  { level: 97, words: [   {id:0,word:"OLIVE",row:0,col:0,direction:"across"},{id:1,word:"THEFT",row:2,col:0,direction:"across"},{id:2,word:"RELAY",row:4,col:0,direction:"across"},{id:3,word:"OUTER",row:0,col:0,direction:"down"},{id:4,word:"IDEAL",row:0,col:2,direction:"down"}   ] },
  { level: 98, words: [   {id:0,word:"DIVIDE",row:0,col:0,direction:"across"},{id:1,word:"MORAL",row:2,col:0,direction:"across"},{id:2,word:"NINJA",row:4,col:0,direction:"across"},{id:3,word:"DEMAND",row:0,col:0,direction:"down"},{id:4,word:"DELTA",row:0,col:4,direction:"down"}   ] },
  { level: 99, words: [   {id:0,word:"ANCIENT",row:0,col:0,direction:"across"},{id:1,word:"URBAN",row:2,col:0,direction:"across"},{id:2,word:"EXACT",row:4,col:0,direction:"across"},{id:3,word:"ACUTE",row:0,col:0,direction:"down"},{id:4,word:"COBRA",row:0,col:2,direction:"down"}   ] },
  { level: 100, words: [   {id:0,word:"WARMTH",row:0,col:0,direction:"across"},{id:1,word:"DISC",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"WONDER",row:0,col:0,direction:"down"},{id:4,word:"MUSCLE",row:0,col:3,direction:"down"}   ] },
  { level: 101, words: [   {id:0,word:"INSPIRE",row:0,col:0,direction:"across"},{id:1,word:"DEATH",row:2,col:0,direction:"across"},{id:2,word:"ENEMY",row:4,col:0,direction:"across"},{id:3,word:"INDIE",row:0,col:0,direction:"down"},{id:4,word:"SHADE",row:0,col:2,direction:"down"}   ] },
  { level: 102, words: [   {id:0,word:"MINERAL",row:0,col:0,direction:"across"},{id:1,word:"RIVET",row:2,col:0,direction:"across"},{id:2,word:"HARSH",row:4,col:0,direction:"across"},{id:3,word:"MARCH",row:0,col:0,direction:"down"},{id:4,word:"NEVER",row:0,col:2,direction:"down"}   ] },
  { level: 103, words: [   {id:0,word:"NATURE",row:0,col:0,direction:"across"},{id:1,word:"THEFT",row:2,col:0,direction:"across"},{id:2,word:"EVERY",row:4,col:0,direction:"across"},{id:3,word:"NATTER",row:0,col:0,direction:"down"},{id:4,word:"RETRY",row:0,col:4,direction:"down"}   ] },
  { level: 104, words: [   {id:0,word:"WORKING",row:0,col:0,direction:"across"},{id:1,word:"RIDER",row:2,col:0,direction:"across"},{id:2,word:"ENEMY",row:4,col:0,direction:"across"},{id:3,word:"WORSE",row:0,col:0,direction:"down"},{id:4,word:"RIDGE",row:0,col:2,direction:"down"}   ] },
  { level: 105, words: [   {id:0,word:"FAILING",row:0,col:0,direction:"across"},{id:1,word:"INTRO",row:2,col:0,direction:"across"},{id:2,word:"THREW",row:4,col:0,direction:"across"},{id:3,word:"FAINT",row:0,col:0,direction:"down"},{id:4,word:"INTER",row:0,col:2,direction:"down"}   ] },
  { level: 106, words: [   {id:0,word:"WHISTLE",row:0,col:0,direction:"across"},{id:1,word:"METER",row:2,col:0,direction:"across"},{id:2,word:"NORTH",row:4,col:0,direction:"across"},{id:3,word:"WOMAN",row:0,col:0,direction:"down"},{id:4,word:"INTER",row:0,col:2,direction:"down"}   ] },
  { level: 107, words: [   {id:0,word:"STONE",row:0,col:0,direction:"across"},{id:1,word:"LUSTY",row:2,col:0,direction:"across"},{id:2,word:"ENTRY",row:4,col:0,direction:"across"},{id:3,word:"SOLVE",row:0,col:0,direction:"down"},{id:4,word:"ONSET",row:0,col:2,direction:"down"}   ] },
  { level: 108, words: [   {id:0,word:"FOUNDED",row:0,col:0,direction:"across"},{id:1,word:"BOOM",row:3,col:0,direction:"across"},{id:2,word:"EVIL",row:5,col:0,direction:"across"},{id:3,word:"FUMBLE",row:0,col:0,direction:"down"},{id:4,word:"NORMAL",row:0,col:3,direction:"down"}   ] },
  { level: 109, words: [   {id:0,word:"STEADY",row:0,col:0,direction:"across"},{id:1,word:"REPEL",row:2,col:0,direction:"across"},{id:2,word:"LEAKY",row:4,col:0,direction:"across"},{id:3,word:"STROLL",row:0,col:0,direction:"down"},{id:4,word:"DELAY",row:0,col:4,direction:"down"}   ] },
  { level: 110, words: [   {id:0,word:"RENTAL",row:0,col:0,direction:"across"},{id:1,word:"GREET",row:2,col:0,direction:"across"},{id:2,word:"ELDER",row:4,col:0,direction:"across"},{id:3,word:"RUGGED",row:0,col:0,direction:"down"},{id:4,word:"ACTOR",row:0,col:4,direction:"down"}   ] },
  { level: 111, words: [   {id:0,word:"SPIRE",row:0,col:0,direction:"across"},{id:1,word:"ENEMY",row:2,col:0,direction:"across"},{id:2,word:"POLAR",row:4,col:0,direction:"across"},{id:3,word:"SLEEP",row:0,col:0,direction:"down"},{id:4,word:"IDEAL",row:0,col:2,direction:"down"}   ] },
  { level: 112, words: [   {id:0,word:"APPEAR",row:0,col:0,direction:"across"},{id:1,word:"OVER",row:3,col:0,direction:"across"},{id:2,word:"BREEZE",row:5,col:0,direction:"across"},{id:3,word:"ABSORB",row:0,col:0,direction:"down"},{id:4,word:"EMERGE",row:0,col:3,direction:"down"}   ] },
  { level: 113, words: [   {id:0,word:"SURVEY",row:0,col:0,direction:"across"},{id:1,word:"DIET",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"SENDER",row:0,col:0,direction:"down"},{id:4,word:"VIRTUE",row:0,col:3,direction:"down"}   ] },
  { level: 114, words: [   {id:0,word:"PISTOL",row:0,col:0,direction:"across"},{id:1,word:"INPUT",row:2,col:0,direction:"across"},{id:2,word:"TIGER",row:4,col:0,direction:"across"},{id:3,word:"PLINTH",row:0,col:0,direction:"down"},{id:4,word:"OUTER",row:0,col:4,direction:"down"}   ] },
  { level: 115, words: [   {id:0,word:"IMPLORE",row:0,col:0,direction:"across"},{id:1,word:"THORN",row:2,col:0,direction:"across"},{id:2,word:"OPERA",row:4,col:0,direction:"across"},{id:3,word:"INTRO",row:0,col:0,direction:"down"},{id:4,word:"PROSE",row:0,col:2,direction:"down"}   ] },
  { level: 116, words: [   {id:0,word:"COMPOSE",row:0,col:0,direction:"across"},{id:1,word:"OUTER",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"CLOSE",row:0,col:0,direction:"down"},{id:4,word:"METER",row:0,col:2,direction:"down"}   ] },
  { level: 117, words: [   {id:0,word:"ENDURE",row:0,col:0,direction:"across"},{id:1,word:"IDEA",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"ENRICH",row:0,col:0,direction:"down"},{id:4,word:"UNFAIR",row:0,col:3,direction:"down"}   ] },
  { level: 118, words: [   {id:0,word:"SOLEMN",row:0,col:0,direction:"across"},{id:1,word:"RULER",row:2,col:0,direction:"across"},{id:2,word:"VAULT",row:4,col:0,direction:"across"},{id:3,word:"STRIVE",row:0,col:0,direction:"down"},{id:4,word:"MERIT",row:0,col:4,direction:"down"}   ] },
  { level: 119, words: [   {id:0,word:"WHETHER",row:0,col:0,direction:"across"},{id:1,word:"METER",row:2,col:0,direction:"across"},{id:2,word:"NERVE",row:4,col:0,direction:"across"},{id:3,word:"WOMAN",row:0,col:0,direction:"down"},{id:4,word:"ENTER",row:0,col:2,direction:"down"}   ] },
  { level: 120, words: [   {id:0,word:"MODESTY",row:0,col:0,direction:"across"},{id:1,word:"UPSET",row:2,col:0,direction:"across"},{id:2,word:"TROUT",row:4,col:0,direction:"across"},{id:3,word:"MOUNT",row:0,col:0,direction:"down"},{id:4,word:"DISCO",row:0,col:2,direction:"down"}   ] },
  { level: 121, words: [   {id:0,word:"WARRIOR",row:0,col:0,direction:"across"},{id:1,word:"SUPER",row:2,col:0,direction:"across"},{id:2,word:"ELDER",row:4,col:0,direction:"across"},{id:3,word:"WASTE",row:0,col:0,direction:"down"},{id:4,word:"RAPID",row:0,col:2,direction:"down"}   ] },
  { level: 122, words: [   {id:0,word:"PROPHET",row:0,col:0,direction:"across"},{id:1,word:"LATCH",row:2,col:0,direction:"across"},{id:2,word:"ERROR",row:4,col:0,direction:"across"},{id:3,word:"PULSE",row:0,col:0,direction:"down"},{id:4,word:"OUTER",row:0,col:2,direction:"down"}   ] },
  { level: 123, words: [   {id:0,word:"WALTZED",row:0,col:0,direction:"across"},{id:1,word:"RISKY",row:2,col:0,direction:"across"},{id:2,word:"ERROR",row:4,col:0,direction:"across"},{id:3,word:"WORSE",row:0,col:0,direction:"down"},{id:4,word:"LASER",row:0,col:2,direction:"down"}   ] },
  { level: 124, words: [   {id:0,word:"CLOSET",row:0,col:0,direction:"across"},{id:1,word:"AHEAD",row:2,col:0,direction:"across"},{id:2,word:"ENTER",row:4,col:0,direction:"across"},{id:3,word:"CHAPEL",row:0,col:0,direction:"down"},{id:4,word:"ELDER",row:0,col:4,direction:"down"}   ] },
  { level: 125, words: [   {id:0,word:"REDUCED",row:0,col:0,direction:"across"},{id:1,word:"LIVER",row:2,col:0,direction:"across"},{id:2,word:"RULER",row:4,col:0,direction:"across"},{id:3,word:"RULER",row:0,col:0,direction:"down"},{id:4,word:"DEVIL",row:0,col:2,direction:"down"}   ] },
  { level: 126, words: [   {id:0,word:"STUDIED",row:0,col:0,direction:"across"},{id:1,word:"INFER",row:2,col:0,direction:"across"},{id:2,word:"LATCH",row:4,col:0,direction:"across"},{id:3,word:"SWIRL",row:0,col:0,direction:"down"},{id:4,word:"UNFIT",row:0,col:2,direction:"down"}   ] },
  { level: 127, words: [   {id:0,word:"VIRTUE",row:0,col:0,direction:"across"},{id:1,word:"VOID",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"VELVET",row:0,col:0,direction:"down"},{id:4,word:"TENDER",row:0,col:3,direction:"down"}   ] },
  { level: 128, words: [   {id:0,word:"UTTER",row:0,col:0,direction:"across"},{id:1,word:"SPIRE",row:2,col:0,direction:"across"},{id:2,word:"TREAT",row:4,col:0,direction:"across"},{id:3,word:"UPSET",row:0,col:0,direction:"down"},{id:4,word:"TRITE",row:0,col:2,direction:"down"}   ] },
  { level: 129, words: [   {id:0,word:"HOSTAGE",row:0,col:0,direction:"across"},{id:1,word:"MARCH",row:2,col:0,direction:"across"},{id:2,word:"DREAM",row:4,col:0,direction:"across"},{id:3,word:"HUMID",row:0,col:0,direction:"down"},{id:4,word:"SURGE",row:0,col:2,direction:"down"}   ] },
  { level: 130, words: [   {id:0,word:"FERTILE",row:0,col:0,direction:"across"},{id:1,word:"USED",row:3,col:0,direction:"across"},{id:2,word:"EVER",row:5,col:0,direction:"across"},{id:3,word:"FUTURE",row:0,col:0,direction:"down"},{id:4,word:"TENDER",row:0,col:3,direction:"down"}   ] },
  { level: 131, words: [   {id:0,word:"CIRCLE",row:0,col:0,direction:"across"},{id:1,word:"NINJA",row:2,col:0,direction:"across"},{id:2,word:"ENEMY",row:4,col:0,direction:"across"},{id:3,word:"CONVEY",row:0,col:0,direction:"down"},{id:4,word:"LEAKY",row:0,col:4,direction:"down"}   ] },
  { level: 132, words: [   {id:0,word:"REFUSES",row:0,col:0,direction:"across"},{id:1,word:"PRESS",row:2,col:0,direction:"across"},{id:2,word:"LODGE",row:4,col:0,direction:"across"},{id:3,word:"REPEL",row:0,col:0,direction:"down"},{id:4,word:"FIELD",row:0,col:2,direction:"down"}   ] },
  { level: 133, words: [   {id:0,word:"WITHOUT",row:0,col:0,direction:"across"},{id:1,word:"USAGE",row:2,col:0,direction:"across"},{id:2,word:"DRESS",row:4,col:0,direction:"across"},{id:3,word:"WOULD",row:0,col:0,direction:"down"},{id:4,word:"TRACE",row:0,col:2,direction:"down"}   ] },
  { level: 134, words: [   {id:0,word:"ENTAIL",row:0,col:0,direction:"across"},{id:1,word:"FLORA",row:2,col:0,direction:"across"},{id:2,word:"CURVE",row:4,col:0,direction:"across"},{id:3,word:"EFFECT",row:0,col:0,direction:"down"},{id:4,word:"IMAGE",row:0,col:4,direction:"down"}   ] },
  { level: 135, words: [   {id:0,word:"MONSTER",row:0,col:0,direction:"across"},{id:1,word:"TERM",row:3,col:0,direction:"across"},{id:2,word:"EMIT",row:5,col:0,direction:"across"},{id:3,word:"MYRTLE",row:0,col:0,direction:"down"},{id:4,word:"SUBMIT",row:0,col:3,direction:"down"}   ] },
  { level: 136, words: [   {id:0,word:"BLOKE",row:0,col:0,direction:"across"},{id:1,word:"ABOVE",row:2,col:0,direction:"across"},{id:2,word:"DREAD",row:4,col:0,direction:"across"},{id:3,word:"BOARD",row:0,col:0,direction:"down"},{id:4,word:"OZONE",row:0,col:2,direction:"down"}   ] },
  { level: 137, words: [   {id:0,word:"COUNTED",row:0,col:0,direction:"across"},{id:1,word:"ACTOR",row:2,col:0,direction:"across"},{id:2,word:"EXACT",row:4,col:0,direction:"across"},{id:3,word:"CRANE",row:0,col:0,direction:"down"},{id:4,word:"ULTRA",row:0,col:2,direction:"down"}   ] },
  { level: 138, words: [   {id:0,word:"DERIVED",row:0,col:0,direction:"across"},{id:1,word:"DELTA",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"DODGE",row:0,col:0,direction:"down"},{id:4,word:"RULER",row:0,col:2,direction:"down"}   ] },
  { level: 139, words: [   {id:0,word:"ANTLER",row:0,col:0,direction:"across"},{id:1,word:"THIRD",row:2,col:0,direction:"across"},{id:2,word:"NEVER",row:4,col:0,direction:"across"},{id:3,word:"ATTEND",row:0,col:0,direction:"down"},{id:4,word:"ELDER",row:0,col:4,direction:"down"}   ] },
  { level: 140, words: [   {id:0,word:"ASCEND",row:0,col:0,direction:"across"},{id:1,word:"STEER",row:2,col:0,direction:"across"},{id:2,word:"RANCH",row:4,col:0,direction:"across"},{id:3,word:"ABSORB",row:0,col:0,direction:"down"},{id:4,word:"NORTH",row:0,col:4,direction:"down"}   ] },
  { level: 141, words: [   {id:0,word:"IMPAIR",row:0,col:0,direction:"across"},{id:1,word:"INCH",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"INSIST",row:0,col:0,direction:"down"},{id:4,word:"ARCHER",row:0,col:3,direction:"down"}   ] },
  { level: 142, words: [  {id:0,word:"DROPLET",row:0,col:0,direction:"across"},{id:1,word:"EASE",row:3,col:0,direction:"across"},{id:2,word:"TORN",row:5,col:0,direction:"across"},{id:3,word:"DESERT",row:0,col:0,direction:"down"},{id:4,word:"PIGEON",row:0,col:3,direction:"down"}  ] },
  { level: 143, words: [   {id:0,word:"CONFER",row:0,col:0,direction:"across"},{id:1,word:"USAGE",row:2,col:0,direction:"across"},{id:2,word:"SHOUT",row:4,col:0,direction:"across"},{id:3,word:"CLUMSY",row:0,col:0,direction:"down"},{id:4,word:"EVENT",row:0,col:4,direction:"down"}   ] },
  { level: 144, words: [   {id:0,word:"FILTER",row:0,col:0,direction:"across"},{id:1,word:"GRIP",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"FLIGHT",row:0,col:0,direction:"down"},{id:4,word:"TAMPER",row:0,col:3,direction:"down"}   ] },
  { level: 145, words: [   {id:0,word:"LEOPARD",row:0,col:0,direction:"across"},{id:1,word:"BASIC",row:2,col:0,direction:"across"},{id:2,word:"LATCH",row:4,col:0,direction:"across"},{id:3,word:"LABEL",row:0,col:0,direction:"down"},{id:4,word:"ONSET",row:0,col:2,direction:"down"}   ] },
  { level: 146, words: [   {id:0,word:"SHELTER",row:0,col:0,direction:"across"},{id:1,word:"EIGHT",row:2,col:0,direction:"across"},{id:2,word:"DITCH",row:4,col:0,direction:"across"},{id:3,word:"SPEND",row:0,col:0,direction:"down"},{id:4,word:"EIGHT",row:0,col:2,direction:"down"}   ] },
  { level: 147, words: [   {id:0,word:"BLONDE",row:0,col:0,direction:"across"},{id:1,word:"NEWER",row:2,col:0,direction:"across"},{id:2,word:"RALLY",row:4,col:0,direction:"across"},{id:3,word:"BINARY",row:0,col:0,direction:"down"},{id:4,word:"DIRTY",row:0,col:4,direction:"down"}   ] },
  { level: 148, words: [   {id:0,word:"TRAINED",row:0,col:0,direction:"across"},{id:1,word:"UNDO",row:3,col:0,direction:"across"},{id:2,word:"EASE",row:5,col:0,direction:"across"},{id:3,word:"TENURE",row:0,col:0,direction:"down"},{id:4,word:"IMPOSE",row:0,col:3,direction:"down"}   ] },
  { level: 149, words: [   {id:0,word:"REVIEWS",row:0,col:0,direction:"across"},{id:1,word:"UNDO",row:3,col:0,direction:"across"},{id:2,word:"TYPE",row:5,col:0,direction:"across"},{id:3,word:"RESULT",row:0,col:0,direction:"down"},{id:4,word:"IMPOSE",row:0,col:3,direction:"down"}   ] },
  { level: 150, words: [   {id:0,word:"STEPSON",row:0,col:0,direction:"across"},{id:1,word:"EARTH",row:2,col:0,direction:"across"},{id:2,word:"LAYER",row:4,col:0,direction:"across"},{id:3,word:"STEAL",row:0,col:0,direction:"down"},{id:4,word:"EARLY",row:0,col:2,direction:"down"}   ] },
  { level: 151, words: [   {id:0,word:"RECKON",row:0,col:0,direction:"across"},{id:1,word:"PIANO",row:2,col:0,direction:"across"},{id:2,word:"AWOKE",row:4,col:0,direction:"across"},{id:3,word:"REPEAT",row:0,col:0,direction:"down"},{id:4,word:"OZONE",row:0,col:4,direction:"down"}   ] },
  { level: 152, words: [   {id:0,word:"BOUNTY",row:0,col:0,direction:"across"},{id:1,word:"AUNT",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"BREATH",row:0,col:0,direction:"down"},{id:4,word:"NATTER",row:0,col:3,direction:"down"}   ] },
  { level: 153, words: [   {id:0,word:"BENCH",row:0,col:0,direction:"across"},{id:1,word:"RANCH",row:2,col:0,direction:"across"},{id:2,word:"TRAWL",row:4,col:0,direction:"across"},{id:3,word:"BURST",row:0,col:0,direction:"down"},{id:4,word:"NINJA",row:0,col:2,direction:"down"}   ] },
  { level: 154, words: [   {id:0,word:"ABSOLVE",row:0,col:0,direction:"across"},{id:1,word:"HALO",row:3,col:0,direction:"across"},{id:2,word:"RISE",row:5,col:0,direction:"across"},{id:3,word:"ARCHER",row:0,col:0,direction:"down"},{id:4,word:"OPPOSE",row:0,col:3,direction:"down"}   ] },
  { level: 155, words: [   {id:0,word:"BOYCOTT",row:0,col:0,direction:"across"},{id:1,word:"TOLD",row:3,col:0,direction:"across"},{id:2,word:"EDGE",row:5,col:0,direction:"across"},{id:3,word:"BATTLE",row:0,col:0,direction:"down"},{id:4,word:"CANDLE",row:0,col:3,direction:"down"}   ] },
  { level: 156, words: [   {id:0,word:"NOBLE",row:0,col:0,direction:"across"},{id:1,word:"RALLY",row:2,col:0,direction:"across"},{id:2,word:"ELECT",row:4,col:0,direction:"across"},{id:3,word:"NURSE",row:0,col:0,direction:"down"},{id:4,word:"BILGE",row:0,col:2,direction:"down"}   ] },
  { level: 157, words: [   {id:0,word:"JIGSAW",row:0,col:0,direction:"across"},{id:1,word:"NURSE",row:2,col:0,direction:"across"},{id:2,word:"LIMIT",row:4,col:0,direction:"across"},{id:3,word:"JUNGLE",row:0,col:0,direction:"down"},{id:4,word:"ADEPT",row:0,col:4,direction:"down"}   ] },
  { level: 158, words: [   {id:0,word:"TROUT",row:0,col:0,direction:"across"},{id:1,word:"ALOE",row:2,col:0,direction:"across"},{id:2,word:"PRINT",row:4,col:0,direction:"across"},{id:3,word:"TRAMP",row:0,col:0,direction:"down"},{id:4,word:"TREAT",row:0,col:4,direction:"down"}   ] },
  { level: 159, words: [   {id:0,word:"CAVERN",row:0,col:0,direction:"across"},{id:1,word:"NIGHT",row:2,col:0,direction:"across"},{id:2,word:"PENNY",row:4,col:0,direction:"across"},{id:3,word:"CANOPY",row:0,col:0,direction:"down"},{id:4,word:"RETRY",row:0,col:4,direction:"down"}   ] },
  { level: 160, words: [   {id:0,word:"BRONZE",row:0,col:0,direction:"across"},{id:1,word:"FOCUS",row:2,col:0,direction:"across"},{id:2,word:"EVERY",row:4,col:0,direction:"across"},{id:3,word:"BUFFER",row:0,col:0,direction:"down"},{id:4,word:"ZESTY",row:0,col:4,direction:"down"}   ] },
  { level: 161, words: [   {id:0,word:"PIZZA",row:0,col:0,direction:"across"},{id:1,word:"ROAR",row:2,col:0,direction:"across"},{id:2,word:"ELITE",row:4,col:0,direction:"across"},{id:3,word:"PURGE",row:0,col:0,direction:"down"},{id:4,word:"AGREE",row:0,col:4,direction:"down"}   ] },
  { level: 162, words: [  {id:0,word:"EXACT",row:0,col:0,direction:"across"},{id:1,word:"RAMEN",row:2,col:0,direction:"across"},{id:2,word:"RIDER",row:4,col:0,direction:"across"},{id:3,word:"ERROR",row:0,col:0,direction:"down"},{id:4,word:"ARMED",row:0,col:2,direction:"down"}  ] },
  { level: 163, words: [   {id:0,word:"DRESS",row:0,col:0,direction:"across"},{id:1,word:"NOVA",row:2,col:0,direction:"across"},{id:2,word:"EQUAL",row:4,col:0,direction:"across"},{id:3,word:"DANCE",row:0,col:0,direction:"down"},{id:4,word:"SMALL",row:0,col:4,direction:"down"}   ] },
  { level: 164, words: [   {id:0,word:"GUARD",row:0,col:0,direction:"across"},{id:1,word:"OATS",row:2,col:0,direction:"across"},{id:2,word:"PIANO",row:4,col:0,direction:"across"},{id:3,word:"GROUP",row:0,col:0,direction:"down"},{id:4,word:"DISCO",row:0,col:4,direction:"down"}   ] },
  { level: 165, words: [   {id:0,word:"GLITCH",row:0,col:0,direction:"across"},{id:1,word:"AGILE",row:2,col:0,direction:"across"},{id:2,word:"ELDER",row:4,col:0,direction:"across"},{id:3,word:"GRAVEL",row:0,col:0,direction:"down"},{id:4,word:"CHEER",row:0,col:4,direction:"down"}   ] },
  { level: 166, words: [   {id:0,word:"AHEAD",row:0,col:0,direction:"across"},{id:1,word:"OPEN",row:2,col:0,direction:"across"},{id:2,word:"ERROR",row:4,col:0,direction:"across"},{id:3,word:"AWOKE",row:0,col:0,direction:"down"},{id:4,word:"DONOR",row:0,col:4,direction:"down"}   ] },
  { level: 167, words: [   {id:0,word:"PAPAL",row:0,col:0,direction:"across"},{id:1,word:"DEATH",row:2,col:0,direction:"across"},{id:2,word:"LUNCH",row:4,col:0,direction:"across"},{id:3,word:"PEDAL",row:0,col:0,direction:"down"},{id:4,word:"PLAIN",row:0,col:2,direction:"down"}   ] },
  { level: 168, words: [   {id:0,word:"ASIDE",row:0,col:0,direction:"across"},{id:1,word:"MEND",row:2,col:0,direction:"across"},{id:2,word:"TIGER",row:4,col:0,direction:"across"},{id:3,word:"ADMIT",row:0,col:0,direction:"down"},{id:4,word:"ELDER",row:0,col:4,direction:"down"}   ] },
  { level: 169, words: [   {id:0,word:"REWARD",row:0,col:0,direction:"across"},{id:1,word:"OGRE",row:3,col:0,direction:"across"},{id:2,word:"MIRROR",row:5,col:0,direction:"across"},{id:3,word:"REFORM",row:0,col:0,direction:"down"},{id:4,word:"APPEAR",row:0,col:3,direction:"down"}   ] },
  { level: 170, words: [   {id:0,word:"UNRULY",row:0,col:0,direction:"across"},{id:1,word:"IVORY",row:2,col:0,direction:"across"},{id:2,word:"UNTIL",row:4,col:0,direction:"across"},{id:3,word:"UNIQUE",row:0,col:0,direction:"down"},{id:4,word:"LOYAL",row:0,col:4,direction:"down"}   ] },
  { level: 171, words: [   {id:0,word:"TIMBER",row:0,col:0,direction:"across"},{id:1,word:"TEND",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"TEETER",row:0,col:0,direction:"down"},{id:4,word:"BUNDLE",row:0,col:3,direction:"down"}   ] },
  { level: 172, words: [   {id:0,word:"DISCO",row:0,col:0,direction:"across"},{id:1,word:"NOUS",row:2,col:0,direction:"across"},{id:2,word:"RIVET",row:4,col:0,direction:"across"},{id:3,word:"DONOR",row:0,col:0,direction:"down"},{id:4,word:"ONSET",row:0,col:4,direction:"down"}   ] },
  { level: 173, words: [   {id:0,word:"SERVANT",row:0,col:0,direction:"across"},{id:1,word:"ENDS",row:3,col:0,direction:"across"},{id:2,word:"NAIL",row:5,col:0,direction:"across"},{id:3,word:"SOLEMN",row:0,col:0,direction:"down"},{id:4,word:"VESSEL",row:0,col:3,direction:"down"}   ] },
  { level: 174, words: [   {id:0,word:"LEGAL",row:0,col:0,direction:"across"},{id:1,word:"VIOLA",row:2,col:0,direction:"across"},{id:2,word:"RELAY",row:4,col:0,direction:"across"},{id:3,word:"LIVER",row:0,col:0,direction:"down"},{id:4,word:"GROWL",row:0,col:2,direction:"down"}   ] },
  { level: 175, words: [   {id:0,word:"THEFT",row:0,col:0,direction:"across"},{id:1,word:"RAGA",row:2,col:0,direction:"across"},{id:2,word:"WOMAN",row:4,col:0,direction:"across"},{id:3,word:"THREW",row:0,col:0,direction:"down"},{id:4,word:"TRAIN",row:0,col:4,direction:"down"}   ] },
  { level: 176, words: [   {id:0,word:"RIDDLE",row:0,col:0,direction:"across"},{id:1,word:"COBRA",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"RACKET",row:0,col:0,direction:"down"},{id:4,word:"LEASH",row:0,col:4,direction:"down"}   ] },
  { level: 177, words: [   {id:0,word:"REFLECT",row:0,col:0,direction:"across"},{id:1,word:"UNDO",row:3,col:0,direction:"across"},{id:2,word:"TAUT",row:5,col:0,direction:"across"},{id:3,word:"RESULT",row:0,col:0,direction:"down"},{id:4,word:"LAYOUT",row:0,col:3,direction:"down"}   ] },
  { level: 178, words: [   {id:0,word:"CRINGE",row:0,col:0,direction:"across"},{id:1,word:"RABBI",row:2,col:0,direction:"across"},{id:2,word:"USAGE",row:4,col:0,direction:"across"},{id:3,word:"CIRCUS",row:0,col:0,direction:"down"},{id:4,word:"GUIDE",row:0,col:4,direction:"down"}   ] },
  { level: 179, words: [  {id:0,word:"THERMAL",row:0,col:0,direction:"across"},{id:1,word:"GRACE",row:2,col:0,direction:"across"},{id:2,word:"LEERY",row:4,col:0,direction:"across"},{id:3,word:"TOGGLE",row:0,col:0,direction:"down"},{id:4,word:"EVADE",row:0,col:2,direction:"down"}  ] },
  { level: 180, words: [   {id:0,word:"HUSTLE",row:0,col:0,direction:"across"},{id:1,word:"TANG",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"HUNTER",row:0,col:0,direction:"down"},{id:4,word:"TOGGLE",row:0,col:3,direction:"down"}   ] },
  { level: 181, words: [  {id:0,word:"CLARIFY",row:0,col:0,direction:"across"},{id:1,word:"SHED",row:3,col:0,direction:"across"},{id:2,word:"ROAR",row:5,col:0,direction:"across"},{id:3,word:"CENSOR",row:0,col:0,direction:"down"},{id:4,word:"RENDER",row:0,col:3,direction:"down"}  ] },
  { level: 182, words: [   {id:0,word:"DEFEAT",row:0,col:0,direction:"across"},{id:1,word:"GLOB",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"DAGGER",row:0,col:0,direction:"down"},{id:4,word:"ENABLE",row:0,col:3,direction:"down"}   ] },
  { level: 183, words: [   {id:0,word:"HARBOUR",row:0,col:0,direction:"across"},{id:1,word:"TECH",row:3,col:0,direction:"across"},{id:2,word:"REAP",row:5,col:0,direction:"across"},{id:3,word:"HUNTER",row:0,col:0,direction:"down"},{id:4,word:"BISHOP",row:0,col:3,direction:"down"}   ] },
  { level: 184, words: [   {id:0,word:"FAINT",row:0,col:0,direction:"across"},{id:1,word:"ORCA",row:2,col:0,direction:"across"},{id:2,word:"RIVET",row:4,col:0,direction:"across"},{id:3,word:"FLOUR",row:0,col:0,direction:"down"},{id:4,word:"TOAST",row:0,col:4,direction:"down"}   ] },
  { level: 185, words: [   {id:0,word:"RALLY",row:0,col:0,direction:"across"},{id:1,word:"LIEU",row:2,col:0,direction:"across"},{id:2,word:"YOUNG",row:4,col:0,direction:"across"},{id:3,word:"RELAY",row:0,col:0,direction:"down"},{id:4,word:"YOUNG",row:0,col:4,direction:"down"}   ] },
  { level: 186, words: [   {id:0,word:"FANCY",row:0,col:0,direction:"across"},{id:1,word:"LIEU",row:2,col:0,direction:"across"},{id:2,word:"YOUNG",row:4,col:0,direction:"across"},{id:3,word:"FOLLY",row:0,col:0,direction:"down"},{id:4,word:"YOUNG",row:0,col:4,direction:"down"}   ] },
  { level: 187, words: [   {id:0,word:"EMBRACE",row:0,col:0,direction:"across"},{id:1,word:"EYED",row:3,col:0,direction:"across"},{id:2,word:"DRUM",row:5,col:0,direction:"across"},{id:3,word:"EXTEND",row:0,col:0,direction:"down"},{id:4,word:"RANDOM",row:0,col:3,direction:"down"}   ] },
  { level: 188, words: [   {id:0,word:"BREAK",row:0,col:0,direction:"across"},{id:1,word:"INFO",row:2,col:0,direction:"across"},{id:2,word:"FLOCK",row:4,col:0,direction:"across"},{id:3,word:"BRIEF",row:0,col:0,direction:"down"},{id:4,word:"KNOCK",row:0,col:4,direction:"down"}   ] },
  { level: 189, words: [   {id:0,word:"PULSE",row:0,col:0,direction:"across"},{id:1,word:"UNIT",row:2,col:0,direction:"across"},{id:2,word:"BOXER",row:4,col:0,direction:"across"},{id:3,word:"PLUMB",row:0,col:0,direction:"down"},{id:4,word:"ENTER",row:0,col:4,direction:"down"}   ] },
  { level: 190, words: [   {id:0,word:"SUPPLY",row:0,col:0,direction:"across"},{id:1,word:"ORCA",row:3,col:0,direction:"across"},{id:2,word:"GRIEVE",row:5,col:0,direction:"across"},{id:3,word:"STRONG",row:0,col:0,direction:"down"},{id:4,word:"PIRATE",row:0,col:3,direction:"down"}   ] },
  { level: 191, words: [   {id:0,word:"SERVE",row:0,col:0,direction:"across"},{id:1,word:"OGRE",row:2,col:0,direction:"across"},{id:2,word:"TAUNT",row:4,col:0,direction:"across"},{id:3,word:"SHORT",row:0,col:0,direction:"down"},{id:4,word:"ELECT",row:0,col:4,direction:"down"}   ] },
  { level: 192, words: [   {id:0,word:"ARREST",row:0,col:0,direction:"across"},{id:1,word:"WEAR",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"ANSWER",row:0,col:0,direction:"down"},{id:4,word:"EMERGE",row:0,col:3,direction:"down"}   ] },
  { level: 193, words: [   {id:0,word:"CREST",row:0,col:0,direction:"across"},{id:1,word:"ADEPT",row:2,col:0,direction:"across"},{id:2,word:"HOTEL",row:4,col:0,direction:"across"},{id:3,word:"CRASH",row:0,col:0,direction:"down"},{id:4,word:"EVENT",row:0,col:2,direction:"down"}   ] },
  { level: 194, words: [   {id:0,word:"TROUBLE",row:0,col:0,direction:"across"},{id:1,word:"PUFF",row:3,col:0,direction:"across"},{id:2,word:"EARL",row:5,col:0,direction:"across"},{id:3,word:"TEMPLE",row:0,col:0,direction:"down"},{id:4,word:"USEFUL",row:0,col:3,direction:"down"}   ] },
  { level: 195, words: [   {id:0,word:"BEGAN",row:0,col:0,direction:"across"},{id:1,word:"DYING",row:2,col:0,direction:"across"},{id:2,word:"ENEMY",row:4,col:0,direction:"across"},{id:3,word:"BADGE",row:0,col:0,direction:"down"},{id:4,word:"GLIDE",row:0,col:2,direction:"down"}   ] },
  { level: 196, words: [   {id:0,word:"ARISE",row:0,col:0,direction:"across"},{id:1,word:"AMID",row:2,col:0,direction:"across"},{id:2,word:"NEVER",row:4,col:0,direction:"across"},{id:3,word:"AGAIN",row:0,col:0,direction:"down"},{id:4,word:"ELDER",row:0,col:4,direction:"down"}   ] },
  { level: 197, words: [   {id:0,word:"GLOBE",row:0,col:0,direction:"across"},{id:1,word:"OBOE",row:2,col:0,direction:"across"},{id:2,word:"NIGHT",row:4,col:0,direction:"across"},{id:3,word:"GROAN",row:0,col:0,direction:"down"},{id:4,word:"ELECT",row:0,col:4,direction:"down"}   ] },
  { level: 198, words: [   {id:0,word:"RELATE",row:0,col:0,direction:"across"},{id:1,word:"INFO",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"RADISH",row:0,col:0,direction:"down"},{id:4,word:"ARMOUR",row:0,col:3,direction:"down"}   ] },
  { level: 199, words: [   {id:0,word:"THORN",row:0,col:0,direction:"across"},{id:1,word:"ARAB",row:2,col:0,direction:"across"},{id:2,word:"NOISE",row:4,col:0,direction:"across"},{id:3,word:"TRAIN",row:0,col:0,direction:"down"},{id:4,word:"NOBLE",row:0,col:4,direction:"down"}   ] },
  { level: 200, words: [   {id:0,word:"SKILL",row:0,col:0,direction:"across"},{id:1,word:"VISA",row:2,col:0,direction:"across"},{id:2,word:"NORTH",row:4,col:0,direction:"across"},{id:3,word:"SEVEN",row:0,col:0,direction:"down"},{id:4,word:"LEASH",row:0,col:4,direction:"down"}   ] },
  { level: 201, words: [   {id:0,word:"ADVANCE",row:0,col:0,direction:"across"},{id:1,word:"UNDO",row:3,col:0,direction:"across"},{id:2,word:"NERD",row:5,col:0,direction:"across"},{id:3,word:"AUBURN",row:0,col:0,direction:"down"},{id:4,word:"ACCORD",row:0,col:3,direction:"down"}   ] },
  { level: 202, words: [   {id:0,word:"SLOSH",row:0,col:0,direction:"across"},{id:1,word:"ORBS",row:2,col:0,direction:"across"},{id:2,word:"EAGLE",row:4,col:0,direction:"across"},{id:3,word:"SCONE",row:0,col:0,direction:"down"},{id:4,word:"HASTE",row:0,col:4,direction:"down"}   ] },
  { level: 203, words: [   {id:0,word:"SETTING",row:0,col:0,direction:"across"},{id:1,word:"TOMB",row:3,col:0,direction:"across"},{id:2,word:"CUBE",row:5,col:0,direction:"across"},{id:3,word:"STATIC",row:0,col:0,direction:"down"},{id:4,word:"TUMBLE",row:0,col:3,direction:"down"}   ] },
  { level: 204, words: [   {id:0,word:"COBRA",row:0,col:0,direction:"across"},{id:1,word:"ONTO",row:2,col:0,direction:"across"},{id:2,word:"SHAME",row:4,col:0,direction:"across"},{id:3,word:"CROSS",row:0,col:0,direction:"down"},{id:4,word:"AWOKE",row:0,col:4,direction:"down"}   ] },
  { level: 205, words: [   {id:0,word:"DISTURB",row:0,col:0,direction:"across"},{id:1,word:"AUNT",row:3,col:0,direction:"across"},{id:2,word:"TIER",row:5,col:0,direction:"across"},{id:3,word:"DEPART",row:0,col:0,direction:"down"},{id:4,word:"TEETER",row:0,col:3,direction:"down"}   ] },
  { level: 206, words: [   {id:0,word:"STANZA",row:0,col:0,direction:"across"},{id:1,word:"GRASS",row:2,col:0,direction:"across"},{id:2,word:"ANGRY",row:4,col:0,direction:"across"},{id:3,word:"SIGNAL",row:0,col:0,direction:"down"},{id:4,word:"ZESTY",row:0,col:4,direction:"down"}   ] },
  { level: 207, words: [   {id:0,word:"GROVEL",row:0,col:0,direction:"across"},{id:1,word:"YOUNG",row:2,col:0,direction:"across"},{id:2,word:"EXIST",row:4,col:0,direction:"across"},{id:3,word:"GEYSER",row:0,col:0,direction:"down"},{id:4,word:"EIGHT",row:0,col:4,direction:"down"}   ] },
  { level: 208, words: [   {id:0,word:"MAJOR",row:0,col:0,direction:"across"},{id:1,word:"TAUNT",row:2,col:0,direction:"across"},{id:2,word:"RETRY",row:4,col:0,direction:"across"},{id:3,word:"MOTOR",row:0,col:0,direction:"down"},{id:4,word:"JOUST",row:0,col:2,direction:"down"}   ] },
  { level: 209, words: [   {id:0,word:"TAMPER",row:0,col:0,direction:"across"},{id:1,word:"RIVET",row:2,col:0,direction:"across"},{id:2,word:"STEER",row:4,col:0,direction:"across"},{id:3,word:"THRASH",row:0,col:0,direction:"down"},{id:4,word:"ENTER",row:0,col:4,direction:"down"}   ] },
  { level: 210, words: [   {id:0,word:"COBALT",row:0,col:0,direction:"across"},{id:1,word:"BRAND",row:2,col:0,direction:"across"},{id:2,word:"ELITE",row:4,col:0,direction:"across"},{id:3,word:"COBWEB",row:0,col:0,direction:"down"},{id:4,word:"LODGE",row:0,col:4,direction:"down"}   ] },
  { level: 211, words: [   {id:0,word:"INTENDS",row:0,col:0,direction:"across"},{id:1,word:"ALSO",row:3,col:0,direction:"across"},{id:2,word:"RIOT",row:5,col:0,direction:"across"},{id:3,word:"IMPAIR",row:0,col:0,direction:"down"},{id:4,word:"EFFORT",row:0,col:3,direction:"down"}   ] },
  { level: 212, words: [   {id:0,word:"HEIST",row:0,col:0,direction:"across"},{id:1,word:"NOVA",row:2,col:0,direction:"across"},{id:2,word:"EQUAL",row:4,col:0,direction:"across"},{id:3,word:"HINGE",row:0,col:0,direction:"down"},{id:4,word:"TRAWL",row:0,col:4,direction:"down"}   ] },
  { level: 213, words: [   {id:0,word:"PROTEST",row:0,col:0,direction:"across"},{id:1,word:"RING",row:3,col:0,direction:"across"},{id:2,word:"LOBE",row:5,col:0,direction:"across"},{id:3,word:"PETROL",row:0,col:0,direction:"down"},{id:4,word:"TOGGLE",row:0,col:3,direction:"down"}   ] },
  { level: 214, words: [   {id:0,word:"COMPLY",row:0,col:0,direction:"across"},{id:1,word:"SAGA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"CENSOR",row:0,col:0,direction:"down"},{id:4,word:"PALACE",row:0,col:3,direction:"down"}   ] },
  { level: 215, words: [   {id:0,word:"ROBUST",row:0,col:0,direction:"across"},{id:1,word:"PAPAL",row:2,col:0,direction:"across"},{id:2,word:"ADMIT",row:4,col:0,direction:"across"},{id:3,word:"REPEAT",row:0,col:0,direction:"down"},{id:4,word:"SPLIT",row:0,col:4,direction:"down"}   ] },
  { level: 216, words: [   {id:0,word:"ASSIGN",row:0,col:0,direction:"across"},{id:1,word:"IDEA",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"ARTIST",row:0,col:0,direction:"down"},{id:4,word:"IMPAIR",row:0,col:3,direction:"down"}   ] },
  { level: 217, words: [   {id:0,word:"DEMAND",row:0,col:0,direction:"across"},{id:1,word:"OGRE",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"DEVOUR",row:0,col:0,direction:"down"},{id:4,word:"ADHERE",row:0,col:3,direction:"down"}   ] },
  { level: 218, words: [   {id:0,word:"PREVIEW",row:0,col:0,direction:"across"},{id:1,word:"MULL",row:3,col:0,direction:"across"},{id:2,word:"TWIT",row:5,col:0,direction:"across"},{id:3,word:"PERMIT",row:0,col:0,direction:"down"},{id:4,word:"VIOLET",row:0,col:3,direction:"down"}   ] },
  { level: 219, words: [   {id:0,word:"REALITY",row:0,col:0,direction:"across"},{id:1,word:"EARS",row:3,col:0,direction:"across"},{id:2,word:"LIEN",row:5,col:0,direction:"across"},{id:3,word:"REVEAL",row:0,col:0,direction:"down"},{id:4,word:"LESSON",row:0,col:3,direction:"down"}   ] },
  { level: 220, words: [   {id:0,word:"INJURED",row:0,col:0,direction:"across"},{id:1,word:"DOUBT",row:2,col:0,direction:"across"},{id:2,word:"ENTER",row:4,col:0,direction:"across"},{id:3,word:"INDIE",row:0,col:0,direction:"down"},{id:4,word:"JOUST",row:0,col:2,direction:"down"}   ] },
  { level: 221, words: [   {id:0,word:"WORSE",row:0,col:0,direction:"across"},{id:1,word:"IDLE",row:2,col:0,direction:"across"},{id:2,word:"LUSTY",row:4,col:0,direction:"across"},{id:3,word:"WHIRL",row:0,col:0,direction:"down"},{id:4,word:"ENEMY",row:0,col:4,direction:"down"}   ] },
  { level: 222, words: [   {id:0,word:"JUGGLE",row:0,col:0,direction:"across"},{id:1,word:"TUBE",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"JESTER",row:0,col:0,direction:"down"},{id:4,word:"GRIEVE",row:0,col:3,direction:"down"}   ] },
  { level: 223, words: [   {id:0,word:"CLUSTER",row:0,col:0,direction:"across"},{id:1,word:"POND",row:3,col:0,direction:"across"},{id:2,word:"YORE",row:5,col:0,direction:"across"},{id:3,word:"COMPLY",row:0,col:0,direction:"down"},{id:4,word:"SUBDUE",row:0,col:3,direction:"down"}   ] },
  { level: 224, words: [   {id:0,word:"FLATTEN",row:0,col:0,direction:"across"},{id:1,word:"ZERO",row:3,col:0,direction:"across"},{id:2,word:"EARN",row:5,col:0,direction:"across"},{id:3,word:"FIZZLE",row:0,col:0,direction:"down"},{id:4,word:"TYCOON",row:0,col:3,direction:"down"}   ] },
  { level: 225, words: [   {id:0,word:"JUMPING",row:0,col:0,direction:"across"},{id:1,word:"IDEA",row:3,col:0,direction:"across"},{id:2,word:"LIKE",row:5,col:0,direction:"across"},{id:3,word:"JOVIAL",row:0,col:0,direction:"down"},{id:4,word:"PALACE",row:0,col:3,direction:"down"}   ] },
  { level: 226, words: [   {id:0,word:"CUSTOM",row:0,col:0,direction:"across"},{id:1,word:"FLAP",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"CONFER",row:0,col:0,direction:"down"},{id:4,word:"TRIPLE",row:0,col:3,direction:"down"}   ] },
  { level: 227, words: [   {id:0,word:"HIGHEST",row:0,col:0,direction:"across"},{id:1,word:"TOMB",row:3,col:0,direction:"across"},{id:2,word:"RIFE",row:5,col:0,direction:"across"},{id:3,word:"HUNTER",row:0,col:0,direction:"down"},{id:4,word:"HOBBLE",row:0,col:3,direction:"down"}   ] },
  { level: 228, words: [   {id:0,word:"CONFIDE",row:0,col:0,direction:"across"},{id:1,word:"FIZZ",row:3,col:0,direction:"across"},{id:2,word:"RAKE",row:5,col:0,direction:"across"},{id:3,word:"CONFER",row:0,col:0,direction:"down"},{id:4,word:"FIZZLE",row:0,col:3,direction:"down"}   ] },
  { level: 229, words: [  {id:0,word:"PRICK",row:0,col:0,direction:"across"},{id:1,word:"ROTI",row:2,col:0,direction:"across"},{id:2,word:"ELATE",row:4,col:0,direction:"across"},{id:3,word:"PURGE",row:0,col:0,direction:"down"},{id:4,word:"KNIFE",row:0,col:4,direction:"down"}  ] },
  { level: 230, words: [   {id:0,word:"SETTLE",row:0,col:0,direction:"across"},{id:1,word:"PRESS",row:2,col:0,direction:"across"},{id:2,word:"LUSTY",row:4,col:0,direction:"across"},{id:3,word:"SUPPLY",row:0,col:0,direction:"down"},{id:4,word:"LUSTY",row:0,col:4,direction:"down"}   ] },
  { level: 231, words: [   {id:0,word:"STARE",row:0,col:0,direction:"across"},{id:1,word:"OCEAN",row:2,col:0,direction:"across"},{id:2,word:"HOTEL",row:4,col:0,direction:"across"},{id:3,word:"SLOSH",row:0,col:0,direction:"down"},{id:4,word:"ADEPT",row:0,col:2,direction:"down"}   ] },
  { level: 232, words: [   {id:0,word:"UPWARDS",row:0,col:0,direction:"across"},{id:1,word:"ZESTY",row:2,col:0,direction:"across"},{id:2,word:"PRESS",row:4,col:0,direction:"across"},{id:3,word:"UNZIP",row:0,col:0,direction:"down"},{id:4,word:"WASTE",row:0,col:2,direction:"down"}   ] },
  { level: 233, words: [   {id:0,word:"ADMIRE",row:0,col:0,direction:"across"},{id:1,word:"REPEL",row:2,col:0,direction:"across"},{id:2,word:"FERRY",row:4,col:0,direction:"across"},{id:3,word:"ADRIFT",row:0,col:0,direction:"down"},{id:4,word:"RALLY",row:0,col:4,direction:"down"}   ] },
  { level: 234, words: [   {id:0,word:"UNFAIR",row:0,col:0,direction:"across"},{id:1,word:"VIDEO",row:2,col:0,direction:"across"},{id:2,word:"IMPLY",row:4,col:0,direction:"across"},{id:3,word:"UNVEIL",row:0,col:0,direction:"down"},{id:4,word:"IVORY",row:0,col:4,direction:"down"}   ] },
  { level: 235, words: [  {id:0,word:"ALCOVE",row:0,col:0,direction:"across"},{id:1,word:"LEANT",row:2,col:0,direction:"across"},{id:2,word:"NAVAL",row:4,col:0,direction:"across"},{id:3,word:"AILING",row:0,col:0,direction:"down"},{id:4,word:"VITAL",row:0,col:4,direction:"down"}  ] },
  { level: 236, words: [   {id:0,word:"REFEREE",row:0,col:0,direction:"across"},{id:1,word:"AWOL",row:3,col:0,direction:"across"},{id:2,word:"DRUM",row:5,col:0,direction:"across"},{id:3,word:"REGARD",row:0,col:0,direction:"down"},{id:4,word:"EMBLEM",row:0,col:3,direction:"down"}   ] },
  { level: 237, words: [   {id:0,word:"ASTHMA",row:0,col:0,direction:"across"},{id:1,word:"TROUT",row:2,col:0,direction:"across"},{id:2,word:"VOTER",row:4,col:0,direction:"across"},{id:3,word:"ACTIVE",row:0,col:0,direction:"down"},{id:4,word:"METER",row:0,col:4,direction:"down"}   ] },
  { level: 238, words: [  {id:0,word:"ORBITAL",row:0,col:0,direction:"across"},{id:1,word:"ALOE",row:3,col:0,direction:"across"},{id:2,word:"EAST",row:5,col:0,direction:"across"},{id:3,word:"ORNATE",row:0,col:0,direction:"down"},{id:4,word:"INSECT",row:0,col:3,direction:"down"}  ] },
  { level: 239, words: [   {id:0,word:"REBEL",row:0,col:0,direction:"across"},{id:1,word:"VIOLA",row:2,col:0,direction:"across"},{id:2,word:"TREND",row:4,col:0,direction:"across"},{id:3,word:"RIVET",row:0,col:0,direction:"down"},{id:4,word:"BLOKE",row:0,col:2,direction:"down"}   ] },
  { level: 240, words: [   {id:0,word:"MILDEW",row:0,col:0,direction:"across"},{id:1,word:"ROTA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"MIRROR",row:0,col:0,direction:"down"},{id:4,word:"DEBATE",row:0,col:3,direction:"down"}   ] },
  { level: 241, words: [   {id:0,word:"BETTER",row:0,col:0,direction:"across"},{id:1,word:"KELP",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"BEAKER",row:0,col:0,direction:"down"},{id:4,word:"TRIPLE",row:0,col:3,direction:"down"}   ] },
  { level: 242, words: [   {id:0,word:"HYGIENE",row:0,col:0,direction:"across"},{id:1,word:"IMAGE",row:2,col:0,direction:"across"},{id:2,word:"UPSET",row:4,col:0,direction:"across"},{id:3,word:"HAIKU",row:0,col:0,direction:"down"},{id:4,word:"GRASS",row:0,col:2,direction:"down"}   ] },
  { level: 243, words: [   {id:0,word:"PACKAGE",row:0,col:0,direction:"across"},{id:1,word:"LUSH",row:3,col:0,direction:"across"},{id:2,word:"REAR",row:5,col:0,direction:"across"},{id:3,word:"PILLAR",row:0,col:0,direction:"down"},{id:4,word:"KOSHER",row:0,col:3,direction:"down"}   ] },
  { level: 244, words: [   {id:0,word:"SUMMON",row:0,col:0,direction:"across"},{id:1,word:"DAFT",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"SENDER",row:0,col:0,direction:"down"},{id:4,word:"MYRTLE",row:0,col:3,direction:"down"}   ] },
  { level: 245, words: [   {id:0,word:"SIGNALS",row:0,col:0,direction:"across"},{id:1,word:"POUT",row:3,col:0,direction:"across"},{id:2,word:"YEAR",row:5,col:0,direction:"across"},{id:3,word:"SUPPLY",row:0,col:0,direction:"down"},{id:4,word:"NATTER",row:0,col:3,direction:"down"}   ] },
  { level: 246, words: [   {id:0,word:"TEACHER",row:0,col:0,direction:"across"},{id:1,word:"ADMIT",row:2,col:0,direction:"across"},{id:2,word:"PATCH",row:4,col:0,direction:"across"},{id:3,word:"TRAMP",row:0,col:0,direction:"down"},{id:4,word:"ADMIT",row:0,col:2,direction:"down"}   ] },
  { level: 247, words: [   {id:0,word:"AUBURN",row:0,col:0,direction:"across"},{id:1,word:"IDEA",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"ADRIFT",row:0,col:0,direction:"down"},{id:4,word:"UNFAIR",row:0,col:3,direction:"down"}   ] },
  { level: 248, words: [   {id:0,word:"GATEWAY",row:0,col:0,direction:"across"},{id:1,word:"MAGIC",row:2,col:0,direction:"across"},{id:2,word:"ACTOR",row:4,col:0,direction:"across"},{id:3,word:"GAMMA",row:0,col:0,direction:"down"},{id:4,word:"TIGHT",row:0,col:2,direction:"down"}   ] },
  { level: 249, words: [   {id:0,word:"AILING",row:0,col:0,direction:"across"},{id:1,word:"HOBO",row:3,col:0,direction:"across"},{id:2,word:"ADHERE",row:5,col:0,direction:"across"},{id:3,word:"ASTHMA",row:0,col:0,direction:"down"},{id:4,word:"IMPOSE",row:0,col:3,direction:"down"}   ] },
  { level: 250, words: [   {id:0,word:"ALBEIT",row:0,col:0,direction:"across"},{id:1,word:"INFO",row:3,col:0,direction:"across"},{id:2,word:"GRIEVE",row:5,col:0,direction:"across"},{id:3,word:"AILING",row:0,col:0,direction:"down"},{id:4,word:"ENCODE",row:0,col:3,direction:"down"}   ] }
];

const DAILY_PUZZLES = [

  { day: 1, words: [  {id:0,word:"WHISKEY",row:0,col:0,direction:"across"},{id:1,word:"PLEA",row:3,col:0,direction:"across"},{id:2,word:"NAIL",row:5,col:0,direction:"across"},{id:3,word:"WEAPON",row:0,col:0,direction:"down"},{id:4,word:"SCRAWL",row:0,col:3,direction:"down"}  ] },
  { day: 2, words: [  {id:0,word:"CENSOR",row:0,col:0,direction:"across"},{id:1,word:"GOLD",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"CAUGHT",row:0,col:0,direction:"down"},{id:4,word:"SENDER",row:0,col:3,direction:"down"}  ] },
  { day: 3, words: [  {id:0,word:"BOTHER",row:0,col:0,direction:"across"},{id:1,word:"ACTOR",row:2,col:0,direction:"across"},{id:2,word:"TIGER",row:4,col:0,direction:"across"},{id:3,word:"BEAUTY",row:0,col:0,direction:"down"},{id:4,word:"ERROR",row:0,col:4,direction:"down"}  ] },
  { day: 4, words: [  {id:0,word:"TENSION",row:0,col:0,direction:"across"},{id:1,word:"BITE",row:3,col:0,direction:"across"},{id:2,word:"EAST",row:5,col:0,direction:"across"},{id:3,word:"TREBLE",row:0,col:0,direction:"down"},{id:4,word:"SELECT",row:0,col:3,direction:"down"}  ] },
  { day: 5, words: [  {id:0,word:"EITHER",row:0,col:0,direction:"across"},{id:1,word:"LIAR",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"EYELET",row:0,col:0,direction:"down"},{id:4,word:"HORROR",row:0,col:3,direction:"down"}  ] },
  { day: 6, words: [  {id:0,word:"FATHOM",row:0,col:0,direction:"across"},{id:1,word:"LANCE",row:2,col:0,direction:"across"},{id:2,word:"OPERA",row:4,col:0,direction:"across"},{id:3,word:"FOLLOW",row:0,col:0,direction:"down"},{id:4,word:"OPERA",row:0,col:4,direction:"down"}  ] },
  { day: 7, words: [  {id:0,word:"ACCOUNT",row:0,col:0,direction:"across"},{id:1,word:"IDLE",row:3,col:0,direction:"across"},{id:2,word:"EARL",row:5,col:0,direction:"across"},{id:3,word:"ACTIVE",row:0,col:0,direction:"down"},{id:4,word:"ORDEAL",row:0,col:3,direction:"down"}  ] },
  { day: 8, words: [  {id:0,word:"SUBDUE",row:0,col:0,direction:"across"},{id:1,word:"NEAR",row:3,col:0,direction:"across"},{id:2,word:"ADHERE",row:5,col:0,direction:"across"},{id:3,word:"STANZA",row:0,col:0,direction:"down"},{id:4,word:"DECREE",row:0,col:3,direction:"down"}  ] },
  { day: 9, words: [  {id:0,word:"STRIKE",row:0,col:0,direction:"across"},{id:1,word:"DISCO",row:2,col:0,direction:"across"},{id:2,word:"LEMON",row:4,col:0,direction:"across"},{id:3,word:"SADDLE",row:0,col:0,direction:"down"},{id:4,word:"KNOWN",row:0,col:4,direction:"down"}  ] },
  { day: 10, words: [  {id:0,word:"RETURNS",row:0,col:0,direction:"across"},{id:1,word:"EDGE",row:3,col:0,direction:"across"},{id:2,word:"EVIL",row:5,col:0,direction:"across"},{id:3,word:"RECEDE",row:0,col:0,direction:"down"},{id:4,word:"UNVEIL",row:0,col:3,direction:"down"}  ] },
  { day: 11, words: [  {id:0,word:"BISHOP",row:0,col:0,direction:"across"},{id:1,word:"ARAB",row:3,col:0,direction:"across"},{id:2,word:"ADHERE",row:5,col:0,direction:"across"},{id:3,word:"BANANA",row:0,col:0,direction:"down"},{id:4,word:"HUMBLE",row:0,col:3,direction:"down"}  ] },
  { day: 12, words: [  {id:0,word:"STROLL",row:0,col:0,direction:"across"},{id:1,word:"OFTEN",row:2,col:0,direction:"across"},{id:2,word:"CLOSE",row:4,col:0,direction:"across"},{id:3,word:"SLOUCH",row:0,col:0,direction:"down"},{id:4,word:"LANCE",row:0,col:4,direction:"down"}  ] },
  { day: 13, words: [  {id:0,word:"FALSELY",row:0,col:0,direction:"across"},{id:1,word:"TOGA",row:3,col:0,direction:"across"},{id:2,word:"REEL",row:5,col:0,direction:"across"},{id:3,word:"FILTER",row:0,col:0,direction:"down"},{id:4,word:"SCRAWL",row:0,col:3,direction:"down"}  ] },
  { day: 14, words: [  {id:0,word:"ENSURE",row:0,col:0,direction:"across"},{id:1,word:"ORCA",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"EXPORT",row:0,col:0,direction:"down"},{id:4,word:"UNFAIR",row:0,col:3,direction:"down"}  ] },
  { day: 15, words: [  {id:0,word:"GAMBLE",row:0,col:0,direction:"across"},{id:1,word:"ULTRA",row:2,col:0,direction:"across"},{id:2,word:"GRAVY",row:4,col:0,direction:"across"},{id:3,word:"GRUDGE",row:0,col:0,direction:"down"},{id:4,word:"LEAKY",row:0,col:4,direction:"down"}  ] },
  { day: 16, words: [  {id:0,word:"ROUGHLY",row:0,col:0,direction:"across"},{id:1,word:"EASE",row:3,col:0,direction:"across"},{id:2,word:"EDGE",row:5,col:0,direction:"across"},{id:3,word:"RECEDE",row:0,col:0,direction:"down"},{id:4,word:"GRIEVE",row:0,col:3,direction:"down"}  ] },
  { day: 17, words: [  {id:0,word:"SHADOW",row:0,col:0,direction:"across"},{id:1,word:"TONG",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"SWITCH",row:0,col:0,direction:"down"},{id:4,word:"DAGGER",row:0,col:3,direction:"down"}  ] },
  { day: 18, words: [  {id:0,word:"EYELET",row:0,col:0,direction:"across"},{id:1,word:"PIZZA",row:2,col:0,direction:"across"},{id:2,word:"ROUTE",row:4,col:0,direction:"across"},{id:3,word:"EXPORT",row:0,col:0,direction:"down"},{id:4,word:"EVADE",row:0,col:4,direction:"down"}  ] },
  { day: 19, words: [  {id:0,word:"ENCLOSE",row:0,col:0,direction:"across"},{id:1,word:"EASE",row:3,col:0,direction:"across"},{id:2,word:"DUTY",row:5,col:0,direction:"across"},{id:3,word:"EXTEND",row:0,col:0,direction:"down"},{id:4,word:"LONELY",row:0,col:3,direction:"down"}  ] },
  { day: 20, words: [  {id:0,word:"CRITIC",row:0,col:0,direction:"across"},{id:1,word:"STAB",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"CLOSET",row:0,col:0,direction:"down"},{id:4,word:"TIMBER",row:0,col:3,direction:"down"}  ] },
  { day: 21, words: [  {id:0,word:"INSIST",row:0,col:0,direction:"across"},{id:1,word:"LODGE",row:2,col:0,direction:"across"},{id:2,word:"NAVAL",row:4,col:0,direction:"across"},{id:3,word:"ISLAND",row:0,col:0,direction:"down"},{id:4,word:"STEEL",row:0,col:4,direction:"down"}  ] },
  { day: 22, words: [  {id:0,word:"ESSENCE",row:0,col:0,direction:"across"},{id:1,word:"UNDO",row:3,col:0,direction:"across"},{id:2,word:"EASE",row:5,col:0,direction:"across"},{id:3,word:"ENDURE",row:0,col:0,direction:"down"},{id:4,word:"ENCODE",row:0,col:3,direction:"down"}  ] },
  { day: 23, words: [  {id:0,word:"RECEDE",row:0,col:0,direction:"across"},{id:1,word:"OATH",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"REVOLT",row:0,col:0,direction:"down"},{id:4,word:"EITHER",row:0,col:3,direction:"down"}  ] },
  { day: 24, words: [  {id:0,word:"CHAPEL",row:0,col:0,direction:"across"},{id:1,word:"IMAGE",row:2,col:0,direction:"across"},{id:2,word:"GRANT",row:4,col:0,direction:"across"},{id:3,word:"CRINGE",row:0,col:0,direction:"down"},{id:4,word:"EVENT",row:0,col:4,direction:"down"}  ] },
  { day: 25, words: [  {id:0,word:"PUSHING",row:0,col:0,direction:"across"},{id:1,word:"TEAL",row:3,col:0,direction:"across"},{id:2,word:"LASH",row:5,col:0,direction:"across"},{id:3,word:"PISTOL",row:0,col:0,direction:"down"},{id:4,word:"HEALTH",row:0,col:3,direction:"down"}  ] },
  { day: 26, words: [  {id:0,word:"ENRICH",row:0,col:0,direction:"across"},{id:1,word:"ORCA",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"EFFORT",row:0,col:0,direction:"down"},{id:4,word:"IMPAIR",row:0,col:3,direction:"down"}  ] },
  { day: 27, words: [  {id:0,word:"DAMAGE",row:0,col:0,direction:"across"},{id:1,word:"GLOOM",row:2,col:0,direction:"across"},{id:2,word:"EXTRA",row:4,col:0,direction:"across"},{id:3,word:"DAGGER",row:0,col:0,direction:"down"},{id:4,word:"GAMMA",row:0,col:4,direction:"down"}  ] },
  { day: 28, words: [  {id:0,word:"REVISED",row:0,col:0,direction:"across"},{id:1,word:"PAVE",row:3,col:0,direction:"across"},{id:2,word:"EAST",row:5,col:0,direction:"across"},{id:3,word:"RIPPLE",row:0,col:0,direction:"down"},{id:4,word:"INVEST",row:0,col:3,direction:"down"}  ] },
  { day: 29, words: [  {id:0,word:"SYMBOL",row:0,col:0,direction:"across"},{id:1,word:"MASK",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"SUBMIT",row:0,col:0,direction:"down"},{id:4,word:"BEAKER",row:0,col:3,direction:"down"}  ] },
  { day: 30, words: [  {id:0,word:"BETRAY",row:0,col:0,direction:"across"},{id:1,word:"ANKLE",row:2,col:0,direction:"across"},{id:2,word:"EXACT",row:4,col:0,direction:"across"},{id:3,word:"BEAKER",row:0,col:0,direction:"down"},{id:4,word:"ADEPT",row:0,col:4,direction:"down"}  ] },
  { day: 31, words: [  {id:0,word:"GLITTER",row:0,col:0,direction:"across"},{id:1,word:"SLOT",row:3,col:0,direction:"across"},{id:2,word:"ROAR",row:5,col:0,direction:"across"},{id:3,word:"GEYSER",row:0,col:0,direction:"down"},{id:4,word:"TEETER",row:0,col:3,direction:"down"}  ] },
  { day: 32, words: [ {id:0,word:"PLUNGE",row:0,col:0,direction:"across"},{id:1,word:"EARL",row:3,col:0,direction:"across"},{id:2,word:"TRUDGE",row:5,col:0,direction:"across"},{id:3,word:"PATENT",row:0,col:0,direction:"down"},{id:4,word:"NAILED",row:0,col:3,direction:"down"} ] },
  { day: 33, words: [  {id:0,word:"SOOTHE",row:0,col:0,direction:"across"},{id:1,word:"AGAIN",row:2,col:0,direction:"across"},{id:2,word:"OZONE",row:4,col:0,direction:"across"},{id:3,word:"SEASON",row:0,col:0,direction:"down"},{id:4,word:"HINGE",row:0,col:4,direction:"down"}  ] },
  { day: 34, words: [  {id:0,word:"FINDING",row:0,col:0,direction:"across"},{id:1,word:"LOOK",row:3,col:0,direction:"across"},{id:2,word:"WHEN",row:5,col:0,direction:"across"},{id:3,word:"FELLOW",row:0,col:0,direction:"down"},{id:4,word:"DARKEN",row:0,col:3,direction:"down"}  ] },
  { day: 35, words: [  {id:0,word:"SELECT",row:0,col:0,direction:"across"},{id:1,word:"VISA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"SHIVER",row:0,col:0,direction:"down"},{id:4,word:"ESCAPE",row:0,col:3,direction:"down"}  ] },
  { day: 36, words: [  {id:0,word:"COMBAT",row:0,col:0,direction:"across"},{id:1,word:"NINJA",row:2,col:0,direction:"across"},{id:2,word:"EIGHT",row:4,col:0,direction:"across"},{id:3,word:"CONVEY",row:0,col:0,direction:"down"},{id:4,word:"APART",row:0,col:4,direction:"down"}  ] },
  { day: 37, words: [  {id:0,word:"BURNISH",row:0,col:0,direction:"across"},{id:1,word:"GRAB",row:3,col:0,direction:"across"},{id:2,word:"TIDE",row:5,col:0,direction:"across"},{id:3,word:"BLIGHT",row:0,col:0,direction:"down"},{id:4,word:"NIMBLE",row:0,col:3,direction:"down"}  ] },
  { day: 38, words: [  {id:0,word:"SCRAWL",row:0,col:0,direction:"across"},{id:1,word:"TACO",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"SWITCH",row:0,col:0,direction:"down"},{id:4,word:"ARMOUR",row:0,col:3,direction:"down"}  ] },
  { day: 39, words: [  {id:0,word:"SIGNAL",row:0,col:0,direction:"across"},{id:1,word:"DOUBT",row:2,col:0,direction:"across"},{id:2,word:"LOWER",row:4,col:0,direction:"across"},{id:3,word:"SADDLE",row:0,col:0,direction:"down"},{id:4,word:"ACTOR",row:0,col:4,direction:"down"}  ] },
  { day: 40, words: [  {id:0,word:"TALKING",row:0,col:0,direction:"across"},{id:1,word:"GASH",row:3,col:0,direction:"across"},{id:2,word:"EVER",row:5,col:0,direction:"across"},{id:3,word:"TANGLE",row:0,col:0,direction:"down"},{id:4,word:"KOSHER",row:0,col:3,direction:"down"}  ] },
  { day: 41, words: [  {id:0,word:"VISAGE",row:0,col:0,direction:"across"},{id:1,word:"THAW",row:3,col:0,direction:"across"},{id:2,word:"MIRROR",row:5,col:0,direction:"across"},{id:3,word:"VICTIM",row:0,col:0,direction:"down"},{id:4,word:"ANSWER",row:0,col:3,direction:"down"}  ] },
  { day: 42, words: [  {id:0,word:"REVEAL",row:0,col:0,direction:"across"},{id:1,word:"FORGE",row:2,col:0,direction:"across"},{id:2,word:"RIVET",row:4,col:0,direction:"across"},{id:3,word:"REFORM",row:0,col:0,direction:"down"},{id:4,word:"ADEPT",row:0,col:4,direction:"down"}  ] },
  { day: 43, words: [  {id:0,word:"NERVOUS",row:0,col:0,direction:"across"},{id:1,word:"UNIT",row:3,col:0,direction:"across"},{id:2,word:"EASE",row:5,col:0,direction:"across"},{id:3,word:"NATURE",row:0,col:0,direction:"down"},{id:4,word:"VIRTUE",row:0,col:3,direction:"down"}  ] },
  { day: 44, words: [  {id:0,word:"GURGLE",row:0,col:0,direction:"across"},{id:1,word:"GUTS",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"GADGET",row:0,col:0,direction:"down"},{id:4,word:"GEYSER",row:0,col:3,direction:"down"}  ] },
  { day: 45, words: [  {id:0,word:"INCITE",row:0,col:0,direction:"across"},{id:1,word:"VIOLA",row:2,col:0,direction:"across"},{id:2,word:"SPORT",row:4,col:0,direction:"across"},{id:3,word:"INVEST",row:0,col:0,direction:"down"},{id:4,word:"TOAST",row:0,col:4,direction:"down"}  ] },
  { day: 46, words: [  {id:0,word:"TRIUMPH",row:0,col:0,direction:"across"},{id:1,word:"PUFF",row:3,col:0,direction:"across"},{id:2,word:"EARL",row:5,col:0,direction:"across"},{id:3,word:"TRIPLE",row:0,col:0,direction:"down"},{id:4,word:"USEFUL",row:0,col:3,direction:"down"}  ] },
  { day: 47, words: [  {id:0,word:"CONDOR",row:0,col:0,direction:"across"},{id:1,word:"TANG",row:3,col:0,direction:"across"},{id:2,word:"MIRROR",row:5,col:0,direction:"across"},{id:3,word:"CUSTOM",row:0,col:0,direction:"down"},{id:4,word:"DAGGER",row:0,col:3,direction:"down"}  ] },
  { day: 48, words: [  {id:0,word:"COMMIT",row:0,col:0,direction:"across"},{id:1,word:"NINJA",row:2,col:0,direction:"across"},{id:2,word:"OLIVE",row:4,col:0,direction:"across"},{id:3,word:"CANNON",row:0,col:0,direction:"down"},{id:4,word:"IMAGE",row:0,col:4,direction:"down"}  ] },
  { day: 49, words: [  {id:0,word:"MAGNIFY",row:0,col:0,direction:"across"},{id:1,word:"DRAB",row:3,col:0,direction:"across"},{id:2,word:"WANE",row:5,col:0,direction:"across"},{id:3,word:"MEADOW",row:0,col:0,direction:"down"},{id:4,word:"NIMBLE",row:0,col:3,direction:"down"}  ] },
  { day: 50, words: [  {id:0,word:"HALTER",row:0,col:0,direction:"across"},{id:1,word:"LOST",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"HAMLET",row:0,col:0,direction:"down"},{id:4,word:"TEETER",row:0,col:3,direction:"down"}  ] },
  { day: 51, words: [  {id:0,word:"PERMIT",row:0,col:0,direction:"across"},{id:1,word:"SHORT",row:2,col:0,direction:"across"},{id:2,word:"OCCUR",row:4,col:0,direction:"across"},{id:3,word:"PISTON",row:0,col:0,direction:"down"},{id:4,word:"INTER",row:0,col:4,direction:"down"}  ] },
  { day: 52, words: [  {id:0,word:"ABSENCE",row:0,col:0,direction:"across"},{id:1,word:"HERB",row:3,col:0,direction:"across"},{id:2,word:"AIDE",row:5,col:0,direction:"across"},{id:3,word:"ASTHMA",row:0,col:0,direction:"down"},{id:4,word:"ENABLE",row:0,col:3,direction:"down"}  ] },
  { day: 53, words: [  {id:0,word:"ALLIED",row:0,col:0,direction:"across"},{id:1,word:"IDEA",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"ARTIST",row:0,col:0,direction:"down"},{id:4,word:"IMPAIR",row:0,col:3,direction:"down"}  ] },
  { day: 54, words: [ {id:0,word:"OUTLET",row:0,col:0,direction:"across"},{id:1,word:"INDIE",row:2,col:0,direction:"across"},{id:2,word:"IVORY",row:4,col:0,direction:"across"},{id:3,word:"ORIGIN",row:0,col:0,direction:"down"},{id:4,word:"ENEMY",row:0,col:4,direction:"down"} ] },
  { day: 55, words: [  {id:0,word:"DEPOSIT",row:0,col:0,direction:"across"},{id:1,word:"IDLE",row:3,col:0,direction:"across"},{id:2,word:"LARD",row:5,col:0,direction:"across"},{id:3,word:"DENIAL",row:0,col:0,direction:"down"},{id:4,word:"OFFEND",row:0,col:3,direction:"down"}  ] },
  { day: 56, words: [  {id:0,word:"HUNTER",row:0,col:0,direction:"across"},{id:1,word:"EXAM",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"HONEST",row:0,col:0,direction:"down"},{id:4,word:"TREMOR",row:0,col:3,direction:"down"}  ] },
  { day: 57, words: [  {id:0,word:"WICKED",row:0,col:0,direction:"across"},{id:1,word:"RIDGE",row:2,col:0,direction:"across"},{id:2,word:"TREAT",row:4,col:0,direction:"across"},{id:3,word:"WARMTH",row:0,col:0,direction:"down"},{id:4,word:"EVENT",row:0,col:4,direction:"down"}  ] },
  { day: 58, words: [  {id:0,word:"REBUILD",row:0,col:0,direction:"across"},{id:1,word:"INFO",row:3,col:0,direction:"across"},{id:2,word:"TRAD",row:5,col:0,direction:"across"},{id:3,word:"RESIST",row:0,col:0,direction:"down"},{id:4,word:"UNFOLD",row:0,col:3,direction:"down"}  ] },
  { day: 59, words: [  {id:0,word:"ORIGIN",row:0,col:0,direction:"across"},{id:1,word:"TOMB",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"OYSTER",row:0,col:0,direction:"down"},{id:4,word:"GAMBLE",row:0,col:3,direction:"down"}  ] },
  { day: 60, words: [  {id:0,word:"ACCORD",row:0,col:0,direction:"across"},{id:1,word:"KNOWN",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"ANKLET",row:0,col:0,direction:"down"},{id:4,word:"RANCH",row:0,col:4,direction:"down"}  ] },
  { day: 61, words: [  {id:0,word:"SILENCE",row:0,col:0,direction:"across"},{id:1,word:"FILE",row:3,col:0,direction:"across"},{id:2,word:"LEND",row:5,col:0,direction:"across"},{id:3,word:"SINFUL",row:0,col:0,direction:"down"},{id:4,word:"EXTEND",row:0,col:3,direction:"down"}  ] },
  { day: 62, words: [  {id:0,word:"ALMOST",row:0,col:0,direction:"across"},{id:1,word:"EMIT",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"ALBEIT",row:0,col:0,direction:"down"},{id:4,word:"OYSTER",row:0,col:3,direction:"down"}  ] },
  { day: 63, words: [  {id:0,word:"MYRTLE",row:0,col:0,direction:"across"},{id:1,word:"SPAWN",row:2,col:0,direction:"across"},{id:2,word:"RIDGE",row:4,col:0,direction:"across"},{id:3,word:"MISERY",row:0,col:0,direction:"down"},{id:4,word:"LANCE",row:0,col:4,direction:"down"}  ] },
  { day: 64, words: [  {id:0,word:"SUMMARY",row:0,col:0,direction:"across"},{id:1,word:"VOID",row:3,col:0,direction:"across"},{id:2,word:"YORE",row:5,col:0,direction:"across"},{id:3,word:"SURVEY",row:0,col:0,direction:"down"},{id:4,word:"MIDDLE",row:0,col:3,direction:"down"}  ] },
  { day: 65, words: [  {id:0,word:"EMBLEM",row:0,col:0,direction:"across"},{id:1,word:"EASY",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"EXCEPT",row:0,col:0,direction:"down"},{id:4,word:"LAWYER",row:0,col:3,direction:"down"}  ] },
  { day: 66, words: [  {id:0,word:"JESTER",row:0,col:0,direction:"across"},{id:1,word:"VOTER",row:2,col:0,direction:"across"},{id:2,word:"ANGRY",row:4,col:0,direction:"across"},{id:3,word:"JOVIAL",row:0,col:0,direction:"down"},{id:4,word:"EARLY",row:0,col:4,direction:"down"}  ] },
  { day: 67, words: [  {id:0,word:"TYPICAL",row:0,col:0,direction:"across"},{id:1,word:"VETO",row:3,col:0,direction:"across"},{id:2,word:"LIKE",row:5,col:0,direction:"across"},{id:3,word:"TRAVEL",row:0,col:0,direction:"down"},{id:4,word:"IMPOSE",row:0,col:3,direction:"down"}  ] },
  { day: 68, words: [  {id:0,word:"DAGGER",row:0,col:0,direction:"across"},{id:1,word:"LONG",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"DOLLAR",row:0,col:0,direction:"down"},{id:4,word:"GIGGLE",row:0,col:3,direction:"down"}  ] },
  { day: 69, words: [  {id:0,word:"DEFINE",row:0,col:0,direction:"across"},{id:1,word:"FLOUR",row:2,col:0,direction:"across"},{id:2,word:"NOISE",row:4,col:0,direction:"across"},{id:3,word:"DEFEND",row:0,col:0,direction:"down"},{id:4,word:"NURSE",row:0,col:4,direction:"down"}  ] },
  { day: 70, words: [  {id:0,word:"EXTENDS",row:0,col:0,direction:"across"},{id:1,word:"AIDE",row:3,col:0,direction:"across"},{id:2,word:"DUET",row:5,col:0,direction:"across"},{id:3,word:"ERRAND",row:0,col:0,direction:"down"},{id:4,word:"EXPECT",row:0,col:3,direction:"down"}  ] },
  { day: 71, words: [  {id:0,word:"SIMPLE",row:0,col:0,direction:"across"},{id:1,word:"OMEN",row:3,col:0,direction:"across"},{id:2,word:"GRIEVE",row:5,col:0,direction:"across"},{id:3,word:"STRONG",row:0,col:0,direction:"down"},{id:4,word:"PLUNGE",row:0,col:3,direction:"down"}  ] },
  { day: 72, words: [  {id:0,word:"VANISH",row:0,col:0,direction:"across"},{id:1,word:"REPEL",row:2,col:0,direction:"across"},{id:2,word:"UPSET",row:4,col:0,direction:"across"},{id:3,word:"VIRTUE",row:0,col:0,direction:"down"},{id:4,word:"SPLIT",row:0,col:4,direction:"down"}  ] },
  { day: 73, words: [  {id:0,word:"MEDICAL",row:0,col:0,direction:"across"},{id:1,word:"BIDE",row:3,col:0,direction:"across"},{id:2,word:"RIFT",row:5,col:0,direction:"across"},{id:3,word:"MEMBER",row:0,col:0,direction:"down"},{id:4,word:"INVEST",row:0,col:3,direction:"down"}  ] },
  { day: 74, words: [  {id:0,word:"DONKEY",row:0,col:0,direction:"across"},{id:1,word:"EYED",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"DESERT",row:0,col:0,direction:"down"},{id:4,word:"KINDER",row:0,col:3,direction:"down"}  ] },
  { day: 75, words: [  {id:0,word:"HAMLET",row:0,col:0,direction:"across"},{id:1,word:"RIDGE",row:2,col:0,direction:"across"},{id:2,word:"INPUT",row:4,col:0,direction:"across"},{id:3,word:"HEROIC",row:0,col:0,direction:"down"},{id:4,word:"EVENT",row:0,col:4,direction:"down"}  ] },
  { day: 76, words: [  {id:0,word:"DISABLE",row:0,col:0,direction:"across"},{id:1,word:"ALSO",row:3,col:0,direction:"across"},{id:2,word:"NEAR",row:5,col:0,direction:"across"},{id:3,word:"DOMAIN",row:0,col:0,direction:"down"},{id:4,word:"ARDOUR",row:0,col:3,direction:"down"}  ] },
  { day: 77, words: [  {id:0,word:"REPAIR",row:0,col:0,direction:"across"},{id:1,word:"INFO",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"RADISH",row:0,col:0,direction:"down"},{id:4,word:"ARDOUR",row:0,col:3,direction:"down"}  ] },
  { day: 78, words: [  {id:0,word:"PUZZLE",row:0,col:0,direction:"across"},{id:1,word:"SUNNY",row:2,col:0,direction:"across"},{id:2,word:"OCCUR",row:4,col:0,direction:"across"},{id:3,word:"PISTOL",row:0,col:0,direction:"down"},{id:4,word:"LAYER",row:0,col:4,direction:"down"}  ] },
  { day: 79, words: [  {id:0,word:"LARGELY",row:0,col:0,direction:"across"},{id:1,word:"SEND",row:3,col:0,direction:"across"},{id:2,word:"NEAR",row:5,col:0,direction:"across"},{id:3,word:"LESSEN",row:0,col:0,direction:"down"},{id:4,word:"GLIDER",row:0,col:3,direction:"down"}  ] },
  { day: 80, words: [  {id:0,word:"DEFEND",row:0,col:0,direction:"across"},{id:1,word:"FAIR",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"DIFFER",row:0,col:0,direction:"down"},{id:4,word:"EMERGE",row:0,col:3,direction:"down"}  ] },
  { day: 81, words: [  {id:0,word:"LESSON",row:0,col:0,direction:"across"},{id:1,word:"NAIVE",row:2,col:0,direction:"across"},{id:2,word:"LEMON",row:4,col:0,direction:"across"},{id:3,word:"LONELY",row:0,col:0,direction:"down"},{id:4,word:"OCEAN",row:0,col:4,direction:"down"}  ] },
  { day: 82, words: [  {id:0,word:"UNIFORM",row:0,col:0,direction:"across"},{id:1,word:"AUNT",row:3,col:0,direction:"across"},{id:2,word:"REAR",row:5,col:0,direction:"across"},{id:3,word:"UNFAIR",row:0,col:0,direction:"down"},{id:4,word:"FOSTER",row:0,col:3,direction:"down"}  ] },
  { day: 83, words: [  {id:0,word:"TERROR",row:0,col:0,direction:"across"},{id:1,word:"DATA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"TENDER",row:0,col:0,direction:"down"},{id:4,word:"RELATE",row:0,col:3,direction:"down"}  ] },
  { day: 84, words: [  {id:0,word:"TENDER",row:0,col:0,direction:"across"},{id:1,word:"MOTOR",row:2,col:0,direction:"across"},{id:2,word:"LEAKY",row:4,col:0,direction:"across"},{id:3,word:"TUMBLE",row:0,col:0,direction:"down"},{id:4,word:"EARLY",row:0,col:4,direction:"down"}  ] },
  { day: 85, words: [ {id:0,word:"TURNING",row:0,col:0,direction:"across"},{id:1,word:"POOL",row:3,col:0,direction:"across"},{id:2,word:"EVER",row:5,col:0,direction:"across"},{id:3,word:"TOPPLE",row:0,col:0,direction:"down"},{id:4,word:"NOBLER",row:0,col:3,direction:"down"} ] },
  { day: 86, words: [  {id:0,word:"REJECT",row:0,col:0,direction:"across"},{id:1,word:"INCH",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"RESIST",row:0,col:0,direction:"down"},{id:4,word:"EITHER",row:0,col:3,direction:"down"}  ] },
  { day: 87, words: [  {id:0,word:"CASTLE",row:0,col:0,direction:"across"},{id:1,word:"NINJA",row:2,col:0,direction:"across"},{id:2,word:"LUSTY",row:4,col:0,direction:"across"},{id:3,word:"CANDLE",row:0,col:0,direction:"down"},{id:4,word:"LEAKY",row:0,col:4,direction:"down"}  ] },
  { day: 88, words: [  {id:0,word:"SMALLER",row:0,col:0,direction:"across"},{id:1,word:"EPIC",row:3,col:0,direction:"across"},{id:2,word:"NEAR",row:5,col:0,direction:"across"},{id:3,word:"STREWN",row:0,col:0,direction:"down"},{id:4,word:"LANCER",row:0,col:3,direction:"down"}  ] },
  { day: 89, words: [  {id:0,word:"MISERY",row:0,col:0,direction:"across"},{id:1,word:"THOU",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"MUSTER",row:0,col:0,direction:"down"},{id:4,word:"ENSURE",row:0,col:3,direction:"down"}  ] },
  { day: 90, words: [ {id:0,word:"HUMBLE",row:0,col:0,direction:"across"},{id:1,word:"RISEN",row:2,col:0,direction:"across"},{id:2,word:"OTHER",row:4,col:0,direction:"across"},{id:3,word:"HORROR",row:0,col:0,direction:"down"},{id:4,word:"LONER",row:0,col:4,direction:"down"} ] },
  { day: 91, words: [ {id:0,word:"ORDERED",row:0,col:0,direction:"across"},{id:1,word:"AREA",row:3,col:0,direction:"across"},{id:2,word:"EYED",row:5,col:0,direction:"across"},{id:3,word:"ORNATE",row:0,col:0,direction:"down"},{id:4,word:"ERRAND",row:0,col:3,direction:"down"} ] },
  { day: 92, words: [  {id:0,word:"TEETER",row:0,col:0,direction:"across"},{id:1,word:"RUNG",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"TERROR",row:0,col:0,direction:"down"},{id:4,word:"TANGLE",row:0,col:3,direction:"down"}  ] },
  { day: 93, words: [  {id:0,word:"RUSTLE",row:0,col:0,direction:"across"},{id:1,word:"GRAVY",row:2,col:0,direction:"across"},{id:2,word:"EQUAL",row:4,col:0,direction:"across"},{id:3,word:"RUGGED",row:0,col:0,direction:"down"},{id:4,word:"LOYAL",row:0,col:4,direction:"down"}  ] },
  { day: 94, words: [  {id:0,word:"HANDLES",row:0,col:0,direction:"across"},{id:1,word:"BALE",row:3,col:0,direction:"across"},{id:2,word:"EMIT",row:5,col:0,direction:"across"},{id:3,word:"HUMBLE",row:0,col:0,direction:"down"},{id:4,word:"DEFEAT",row:0,col:3,direction:"down"}  ] },
  { day: 95, words: [  {id:0,word:"ROCKET",row:0,col:0,direction:"across"},{id:1,word:"USED",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"ROBUST",row:0,col:0,direction:"down"},{id:4,word:"KINDER",row:0,col:3,direction:"down"}  ] },
  { day: 96, words: [  {id:0,word:"DETAIL",row:0,col:0,direction:"across"},{id:1,word:"NERVE",row:2,col:0,direction:"across"},{id:2,word:"EQUAL",row:4,col:0,direction:"across"},{id:3,word:"DANGER",row:0,col:0,direction:"down"},{id:4,word:"IDEAL",row:0,col:4,direction:"down"}  ] },
  { day: 97, words: [  {id:0,word:"CAPSULE",row:0,col:0,direction:"across"},{id:1,word:"DENT",row:3,col:0,direction:"across"},{id:2,word:"RAIN",row:5,col:0,direction:"across"},{id:3,word:"CINDER",row:0,col:0,direction:"down"},{id:4,word:"SULTAN",row:0,col:3,direction:"down"}  ] },
  { day: 98, words: [  {id:0,word:"TANGLE",row:0,col:0,direction:"across"},{id:1,word:"TWIT",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"TEETER",row:0,col:0,direction:"down"},{id:4,word:"GENTLE",row:0,col:3,direction:"down"}  ] },
  { day: 99, words: [  {id:0,word:"CANDLE",row:0,col:0,direction:"across"},{id:1,word:"THIRD",row:2,col:0,direction:"across"},{id:2,word:"LANCE",row:4,col:0,direction:"across"},{id:3,word:"CATTLE",row:0,col:0,direction:"down"},{id:4,word:"LODGE",row:0,col:4,direction:"down"}  ] },
  { day: 100, words: [  {id:0,word:"CASCADE",row:0,col:0,direction:"across"},{id:1,word:"VILE",row:3,col:0,direction:"across"},{id:2,word:"SHUN",row:5,col:0,direction:"across"},{id:3,word:"CANVAS",row:0,col:0,direction:"down"},{id:4,word:"CAVERN",row:0,col:3,direction:"down"}  ] },
  { day: 101, words: [  {id:0,word:"EXCUSE",row:0,col:0,direction:"across"},{id:1,word:"ORCA",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"EFFORT",row:0,col:0,direction:"down"},{id:4,word:"UNFAIR",row:0,col:3,direction:"down"}  ] },
  { day: 102, words: [  {id:0,word:"GLIDER",row:0,col:0,direction:"across"},{id:1,word:"LASER",row:2,col:0,direction:"across"},{id:2,word:"ENTER",row:4,col:0,direction:"across"},{id:3,word:"GOLDEN",row:0,col:0,direction:"down"},{id:4,word:"ERROR",row:0,col:4,direction:"down"}  ] },
  { day: 103, words: [  {id:0,word:"VENTURE",row:0,col:0,direction:"across"},{id:1,word:"IDEA",row:3,col:0,direction:"across"},{id:2,word:"HIGH",row:5,col:0,direction:"across"},{id:3,word:"VANISH",row:0,col:0,direction:"down"},{id:4,word:"THRASH",row:0,col:3,direction:"down"}  ] },
  { day: 104, words: [  {id:0,word:"MIDDLE",row:0,col:0,direction:"across"},{id:1,word:"TEAR",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"MUSTER",row:0,col:0,direction:"down"},{id:4,word:"DECREE",row:0,col:3,direction:"down"}  ] },
  { day: 105, words: [  {id:0,word:"RODENT",row:0,col:0,direction:"across"},{id:1,word:"THROW",row:2,col:0,direction:"across"},{id:2,word:"INTER",row:4,col:0,direction:"across"},{id:3,word:"RETAIN",row:0,col:0,direction:"down"},{id:4,word:"NEWER",row:0,col:4,direction:"down"}  ] },
  { day: 106, words: [  {id:0,word:"EXTREME",row:0,col:0,direction:"across"},{id:1,word:"AMOK",row:3,col:0,direction:"across"},{id:2,word:"EMIT",row:5,col:0,direction:"across"},{id:3,word:"ESTATE",row:0,col:0,direction:"down"},{id:4,word:"RACKET",row:0,col:3,direction:"down"}  ] },
  { day: 107, words: [  {id:0,word:"BESTOW",row:0,col:0,direction:"across"},{id:1,word:"TERM",row:3,col:0,direction:"across"},{id:2,word:"MIRROR",row:5,col:0,direction:"across"},{id:3,word:"BOTTOM",row:0,col:0,direction:"down"},{id:4,word:"TREMOR",row:0,col:3,direction:"down"}  ] },
  { day: 108, words: [  {id:0,word:"BRUTAL",row:0,col:0,direction:"across"},{id:1,word:"SOLAR",row:2,col:0,direction:"across"},{id:2,word:"OZONE",row:4,col:0,direction:"across"},{id:3,word:"BISHOP",row:0,col:0,direction:"down"},{id:4,word:"AGREE",row:0,col:4,direction:"down"}  ] },
  { day: 109, words: [  {id:0,word:"CENTURY",row:0,col:0,direction:"across"},{id:1,word:"MOOD",row:3,col:0,direction:"across"},{id:2,word:"YEAR",row:5,col:0,direction:"across"},{id:3,word:"CLUMSY",row:0,col:0,direction:"down"},{id:4,word:"TENDER",row:0,col:3,direction:"down"}  ] },
  { day: 110, words: [  {id:0,word:"WINTER",row:0,col:0,direction:"across"},{id:1,word:"DEEP",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"WONDER",row:0,col:0,direction:"down"},{id:4,word:"TEMPLE",row:0,col:3,direction:"down"}  ] },
  { day: 111, words: [  {id:0,word:"BOTTOM",row:0,col:0,direction:"across"},{id:1,word:"SHAME",row:2,col:0,direction:"across"},{id:2,word:"OFTEN",row:4,col:0,direction:"across"},{id:3,word:"BESTOW",row:0,col:0,direction:"down"},{id:4,word:"OCEAN",row:0,col:4,direction:"down"}  ] },
  { day: 112, words: [ {id:0,word:"RUNNING",row:0,col:0,direction:"across"},{id:1,word:"EVER",row:3,col:0,direction:"across"},{id:2,word:"THAW",row:5,col:0,direction:"across"},{id:3,word:"REJECT",row:0,col:0,direction:"down"},{id:4,word:"NARROW",row:0,col:3,direction:"down"} ] },
  { day: 113, words: [  {id:0,word:"BITTER",row:0,col:0,direction:"across"},{id:1,word:"LOOM",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"BALLOT",row:0,col:0,direction:"down"},{id:4,word:"TREMOR",row:0,col:3,direction:"down"}  ] },
  { day: 114, words: [  {id:0,word:"PLINTH",row:0,col:0,direction:"across"},{id:1,word:"TITLE",row:2,col:0,direction:"across"},{id:2,word:"NIGHT",row:4,col:0,direction:"across"},{id:3,word:"PATENT",row:0,col:0,direction:"down"},{id:4,word:"THEFT",row:0,col:4,direction:"down"}  ] },
  { day: 115, words: [  {id:0,word:"HOLIDAY",row:0,col:0,direction:"across"},{id:1,word:"LOGO",row:3,col:0,direction:"across"},{id:2,word:"HINT",row:5,col:0,direction:"across"},{id:3,word:"HEALTH",row:0,col:0,direction:"down"},{id:4,word:"IMPORT",row:0,col:3,direction:"down"}  ] },
  { day: 116, words: [  {id:0,word:"OYSTER",row:0,col:0,direction:"across"},{id:1,word:"LARD",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"OUTLET",row:0,col:0,direction:"down"},{id:4,word:"TENDER",row:0,col:3,direction:"down"}  ] },
  { day: 117, words: [  {id:0,word:"RUBBER",row:0,col:0,direction:"across"},{id:1,word:"SUGAR",row:2,col:0,direction:"across"},{id:2,word:"LUSTY",row:4,col:0,direction:"across"},{id:3,word:"RESULT",row:0,col:0,direction:"down"},{id:4,word:"EARLY",row:0,col:4,direction:"down"}  ] },
  { day: 118, words: [  {id:0,word:"INSTEAD",row:0,col:0,direction:"across"},{id:1,word:"OVER",row:3,col:0,direction:"across"},{id:2,word:"EVER",row:5,col:0,direction:"across"},{id:3,word:"INCOME",row:0,col:0,direction:"down"},{id:4,word:"TERROR",row:0,col:3,direction:"down"}  ] },
  { day: 119, words: [  {id:0,word:"GEYSER",row:0,col:0,direction:"across"},{id:1,word:"GULF",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"GADGET",row:0,col:0,direction:"down"},{id:4,word:"SUFFER",row:0,col:3,direction:"down"}  ] },
  { day: 120, words: [  {id:0,word:"AGENCY",row:0,col:0,direction:"across"},{id:1,word:"LANCE",row:2,col:0,direction:"across"},{id:2,word:"ENTER",row:4,col:0,direction:"across"},{id:3,word:"ALLIED",row:0,col:0,direction:"down"},{id:4,word:"CLEAR",row:0,col:4,direction:"down"}  ] },
  { day: 121, words: [  {id:0,word:"PROMOTE",row:0,col:0,direction:"across"},{id:1,word:"TOMB",row:3,col:0,direction:"across"},{id:2,word:"RIFE",row:5,col:0,direction:"across"},{id:3,word:"POTTER",row:0,col:0,direction:"down"},{id:4,word:"MARBLE",row:0,col:3,direction:"down"}  ] },
  { day: 122, words: [ {id:0,word:"HEROIC",row:0,col:0,direction:"across"},{id:1,word:"PUMA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"HAMPER",row:0,col:0,direction:"down"},{id:4,word:"ORNATE",row:0,col:3,direction:"down"} ] },
  { day: 123, words: [  {id:0,word:"REFUSE",row:0,col:0,direction:"across"},{id:1,word:"FORGE",row:2,col:0,direction:"across"},{id:2,word:"REBEL",row:4,col:0,direction:"across"},{id:3,word:"REFORM",row:0,col:0,direction:"down"},{id:4,word:"SHELL",row:0,col:4,direction:"down"}  ] },
  { day: 124, words: [  {id:0,word:"SKILFUL",row:0,col:0,direction:"across"},{id:1,word:"USED",row:3,col:0,direction:"across"},{id:2,word:"HOUR",row:5,col:0,direction:"across"},{id:3,word:"SLOUCH",row:0,col:0,direction:"down"},{id:4,word:"LEADER",row:0,col:3,direction:"down"}  ] },
  { day: 125, words: [  {id:0,word:"TAVERN",row:0,col:0,direction:"across"},{id:1,word:"ROTA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"TERROR",row:0,col:0,direction:"down"},{id:4,word:"ESCAPE",row:0,col:3,direction:"down"}  ] },
  { day: 126, words: [  {id:0,word:"CANNON",row:0,col:0,direction:"across"},{id:1,word:"INPUT",row:2,col:0,direction:"across"},{id:2,word:"GIVEN",row:4,col:0,direction:"across"},{id:3,word:"CRINGE",row:0,col:0,direction:"down"},{id:4,word:"OFTEN",row:0,col:4,direction:"down"}  ] },
  { day: 127, words: [  {id:0,word:"SCANNER",row:0,col:0,direction:"across"},{id:1,word:"POEM",row:3,col:0,direction:"across"},{id:2,word:"YELL",row:5,col:0,direction:"across"},{id:3,word:"SUPPLY",row:0,col:0,direction:"down"},{id:4,word:"NORMAL",row:0,col:3,direction:"down"}  ] },
  { day: 128, words: [  {id:0,word:"BREEZE",row:0,col:0,direction:"across"},{id:1,word:"TOGA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"BETTER",row:0,col:0,direction:"down"},{id:4,word:"ESCAPE",row:0,col:3,direction:"down"}  ] },
  { day: 129, words: [  {id:0,word:"STOREY",row:0,col:0,direction:"across"},{id:1,word:"CLEAR",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"SECRET",row:0,col:0,direction:"down"},{id:4,word:"EARTH",row:0,col:4,direction:"down"}  ] },
  { day: 130, words: [  {id:0,word:"MINIMUM",row:0,col:0,direction:"across"},{id:1,word:"INFO",row:3,col:0,direction:"across"},{id:2,word:"EDGE",row:5,col:0,direction:"across"},{id:3,word:"MOTIVE",row:0,col:0,direction:"down"},{id:4,word:"INCOME",row:0,col:3,direction:"down"}  ] },
  { day: 131, words: [  {id:0,word:"JANGLE",row:0,col:0,direction:"across"},{id:1,word:"GRAD",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"JOGGER",row:0,col:0,direction:"down"},{id:4,word:"GRUDGE",row:0,col:3,direction:"down"}  ] },
  { day: 132, words: [  {id:0,word:"ENABLE",row:0,col:0,direction:"across"},{id:1,word:"EMPTY",row:2,col:0,direction:"across"},{id:2,word:"GROWL",row:4,col:0,direction:"across"},{id:3,word:"EMERGE",row:0,col:0,direction:"down"},{id:4,word:"LOYAL",row:0,col:4,direction:"down"}  ] },
  { day: 133, words: [  {id:0,word:"WAITING",row:0,col:0,direction:"across"},{id:1,word:"MUSE",row:3,col:0,direction:"across"},{id:2,word:"HYMN",row:5,col:0,direction:"across"},{id:3,word:"WARMTH",row:0,col:0,direction:"down"},{id:4,word:"TAVERN",row:0,col:3,direction:"down"}  ] },
  { day: 134, words: [  {id:0,word:"EXPORT",row:0,col:0,direction:"across"},{id:1,word:"LOUT",row:3,col:0,direction:"across"},{id:2,word:"MIRROR",row:5,col:0,direction:"across"},{id:3,word:"EMBLEM",row:0,col:0,direction:"down"},{id:4,word:"OYSTER",row:0,col:3,direction:"down"}  ] },
  { day: 135, words: [  {id:0,word:"BEAKER",row:0,col:0,direction:"across"},{id:1,word:"OLIVE",row:2,col:0,direction:"across"},{id:2,word:"ZESTY",row:4,col:0,direction:"across"},{id:3,word:"BRONZE",row:0,col:0,direction:"down"},{id:4,word:"ENEMY",row:0,col:4,direction:"down"}  ] },
  { day: 136, words: [  {id:0,word:"HEALTHY",row:0,col:0,direction:"across"},{id:1,word:"DUTY",row:3,col:0,direction:"across"},{id:2,word:"EVER",row:5,col:0,direction:"across"},{id:3,word:"HANDLE",row:0,col:0,direction:"down"},{id:4,word:"LAWYER",row:0,col:3,direction:"down"}  ] },
  { day: 137, words: [ {id:0,word:"ANCHOR",row:0,col:0,direction:"across"},{id:1,word:"OUST",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"ARMOUR",row:0,col:0,direction:"down"},{id:4,word:"HUSTLE",row:0,col:3,direction:"down"} ] },
  { day: 138, words: [  {id:0,word:"HAZARD",row:0,col:0,direction:"across"},{id:1,word:"MERIT",row:2,col:0,direction:"across"},{id:2,word:"EVERY",row:4,col:0,direction:"across"},{id:3,word:"HAMLET",row:0,col:0,direction:"down"},{id:4,word:"RETRY",row:0,col:4,direction:"down"}  ] },
  { day: 139, words: [  {id:0,word:"LECTURE",row:0,col:0,direction:"across"},{id:1,word:"NOVA",row:3,col:0,direction:"across"},{id:2,word:"HIGH",row:5,col:0,direction:"across"},{id:3,word:"LAUNCH",row:0,col:0,direction:"down"},{id:4,word:"THRASH",row:0,col:3,direction:"down"}  ] },
  { day: 140, words: [  {id:0,word:"GRUDGE",row:0,col:0,direction:"across"},{id:1,word:"SAGA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"GEYSER",row:0,col:0,direction:"down"},{id:4,word:"DEBATE",row:0,col:3,direction:"down"}  ] },
  { day: 141, words: [  {id:0,word:"LUMBER",row:0,col:0,direction:"across"},{id:1,word:"YOUNG",row:2,col:0,direction:"across"},{id:2,word:"USAGE",row:4,col:0,direction:"across"},{id:3,word:"LAYOUT",row:0,col:0,direction:"down"},{id:4,word:"EAGLE",row:0,col:4,direction:"down"}  ] },
  { day: 142, words: [  {id:0,word:"SUCCESS",row:0,col:0,direction:"across"},{id:1,word:"FEED",row:3,col:0,direction:"across"},{id:2,word:"LAKE",row:5,col:0,direction:"across"},{id:3,word:"SINFUL",row:0,col:0,direction:"down"},{id:4,word:"CANDLE",row:0,col:3,direction:"down"}  ] },
  { day: 143, words: [  {id:0,word:"ABLAZE",row:0,col:0,direction:"across"},{id:1,word:"IDLE",row:3,col:0,direction:"across"},{id:2,word:"GRIEVE",row:5,col:0,direction:"across"},{id:3,word:"AILING",row:0,col:0,direction:"down"},{id:4,word:"ADHERE",row:0,col:3,direction:"down"}  ] },
  { day: 144, words: [  {id:0,word:"FIGURE",row:0,col:0,direction:"across"},{id:1,word:"MORAL",row:2,col:0,direction:"across"},{id:2,word:"NEVER",row:4,col:0,direction:"across"},{id:3,word:"FAMINE",row:0,col:0,direction:"down"},{id:4,word:"RULER",row:0,col:4,direction:"down"}  ] },
  { day: 145, words: [  {id:0,word:"CONCERN",row:0,col:0,direction:"across"},{id:1,word:"THOU",row:3,col:0,direction:"across"},{id:2,word:"NIGH",row:5,col:0,direction:"across"},{id:3,word:"COTTON",row:0,col:0,direction:"down"},{id:4,word:"CROUCH",row:0,col:3,direction:"down"}  ] },
  { day: 146, words: [  {id:0,word:"HARBOR",row:0,col:0,direction:"across"},{id:1,word:"EAST",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"HONEST",row:0,col:0,direction:"down"},{id:4,word:"BITTER",row:0,col:3,direction:"down"}  ] },
  { day: 147, words: [  {id:0,word:"BEAUTY",row:0,col:0,direction:"across"},{id:1,word:"USAGE",row:2,col:0,direction:"across"},{id:2,word:"APART",row:4,col:0,direction:"across"},{id:3,word:"BRUTAL",row:0,col:0,direction:"down"},{id:4,word:"TREAT",row:0,col:4,direction:"down"}  ] },
  { day: 148, words: [  {id:0,word:"MAXIMAL",row:0,col:0,direction:"across"},{id:1,word:"TUNA",row:3,col:0,direction:"across"},{id:2,word:"EYED",row:5,col:0,direction:"across"},{id:3,word:"MYRTLE",row:0,col:0,direction:"down"},{id:4,word:"ISLAND",row:0,col:3,direction:"down"}  ] },
  { day: 149, words: [ {id:0,word:"RESULT",row:0,col:0,direction:"across"},{id:1,word:"OKRA",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"REVOLT",row:0,col:0,direction:"down"},{id:4,word:"UNFAIR",row:0,col:3,direction:"down"} ] },
  { day: 150, words: [  {id:0,word:"BUNGLE",row:0,col:0,direction:"across"},{id:1,word:"THORN",row:2,col:0,direction:"across"},{id:2,word:"OCCUR",row:4,col:0,direction:"across"},{id:3,word:"BOTTOM",row:0,col:0,direction:"down"},{id:4,word:"LINER",row:0,col:4,direction:"down"}  ] },
  { day: 151, words: [  {id:0,word:"CULTURE",row:0,col:0,direction:"across"},{id:1,word:"THOU",row:3,col:0,direction:"across"},{id:2,word:"EDGE",row:5,col:0,direction:"across"},{id:3,word:"CASTLE",row:0,col:0,direction:"down"},{id:4,word:"TENURE",row:0,col:3,direction:"down"}  ] },
  { day: 152, words: [  {id:0,word:"COBWEB",row:0,col:0,direction:"across"},{id:1,word:"TRAD",row:3,col:0,direction:"across"},{id:2,word:"MIRROR",row:5,col:0,direction:"across"},{id:3,word:"CUSTOM",row:0,col:0,direction:"down"},{id:4,word:"WONDER",row:0,col:3,direction:"down"}  ] },
  { day: 153, words: [  {id:0,word:"LAWYER",row:0,col:0,direction:"across"},{id:1,word:"ACTOR",row:2,col:0,direction:"across"},{id:2,word:"ERROR",row:4,col:0,direction:"across"},{id:3,word:"LEADER",row:0,col:0,direction:"down"},{id:4,word:"ERROR",row:0,col:4,direction:"down"}  ] },
  { day: 154, words: [  {id:0,word:"INVALID",row:0,col:0,direction:"across"},{id:1,word:"EASE",row:3,col:0,direction:"across"},{id:2,word:"TEND",row:5,col:0,direction:"across"},{id:3,word:"INTENT",row:0,col:0,direction:"down"},{id:4,word:"ATTEND",row:0,col:3,direction:"down"}  ] },
  { day: 155, words: [  {id:0,word:"INVITE",row:0,col:0,direction:"across"},{id:1,word:"ALSO",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"IMPAIR",row:0,col:0,direction:"down"},{id:4,word:"IMPOSE",row:0,col:3,direction:"down"}  ] },
  { day: 156, words: [  {id:0,word:"EXPERT",row:0,col:0,direction:"across"},{id:1,word:"BLUES",row:2,col:0,direction:"across"},{id:2,word:"RESIN",row:4,col:0,direction:"across"},{id:3,word:"EMBARK",row:0,col:0,direction:"down"},{id:4,word:"RESIN",row:0,col:4,direction:"down"}  ] },
  { day: 157, words: [  {id:0,word:"STAMMER",row:0,col:0,direction:"across"},{id:1,word:"RUDE",row:3,col:0,direction:"across"},{id:2,word:"LAZY",row:5,col:0,direction:"across"},{id:3,word:"SPIRAL",row:0,col:0,direction:"down"},{id:4,word:"MISERY",row:0,col:3,direction:"down"}  ] },
  { day: 158, words: [  {id:0,word:"LEADER",row:0,col:0,direction:"across"},{id:1,word:"NAIL",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"LAUNCH",row:0,col:0,direction:"down"},{id:4,word:"DOLLAR",row:0,col:3,direction:"down"}  ] },
  { day: 159, words: [  {id:0,word:"DENIAL",row:0,col:0,direction:"across"},{id:1,word:"VIDEO",row:2,col:0,direction:"across"},{id:2,word:"UPSET",row:4,col:0,direction:"across"},{id:3,word:"DEVOUR",row:0,col:0,direction:"down"},{id:4,word:"ADOPT",row:0,col:4,direction:"down"}  ] },
  { day: 160, words: [  {id:0,word:"ZEALOUS",row:0,col:0,direction:"across"},{id:1,word:"LONE",row:3,col:0,direction:"across"},{id:2,word:"TINY",row:5,col:0,direction:"across"},{id:3,word:"ZEALOT",row:0,col:0,direction:"down"},{id:4,word:"LONELY",row:0,col:3,direction:"down"}  ] },
  { day: 161, words: [  {id:0,word:"BATTLE",row:0,col:0,direction:"across"},{id:1,word:"TRAP",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"BITTER",row:0,col:0,direction:"down"},{id:4,word:"TEMPLE",row:0,col:3,direction:"down"}  ] },
  { day: 162, words: [  {id:0,word:"RACKET",row:0,col:0,direction:"across"},{id:1,word:"CRIME",row:2,col:0,direction:"across"},{id:2,word:"EVENT",row:4,col:0,direction:"across"},{id:3,word:"ROCKET",row:0,col:0,direction:"down"},{id:4,word:"EVENT",row:0,col:4,direction:"down"}  ] },
  { day: 163, words: [  {id:0,word:"BENEFIT",row:0,col:0,direction:"across"},{id:1,word:"IDEA",row:3,col:0,direction:"across"},{id:2,word:"NERD",row:5,col:0,direction:"across"},{id:3,word:"BENIGN",row:0,col:0,direction:"down"},{id:4,word:"ERRAND",row:0,col:3,direction:"down"}  ] },
  { day: 164, words: [  {id:0,word:"SADDLE",row:0,col:0,direction:"across"},{id:1,word:"TOLL",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"SWITCH",row:0,col:0,direction:"down"},{id:4,word:"DOLLAR",row:0,col:3,direction:"down"}  ] },
  { day: 165, words: [  {id:0,word:"PARDON",row:0,col:0,direction:"across"},{id:1,word:"LOGIC",row:2,col:0,direction:"across"},{id:2,word:"ACTOR",row:4,col:0,direction:"across"},{id:3,word:"PILLAR",row:0,col:0,direction:"down"},{id:4,word:"OCCUR",row:0,col:4,direction:"down"}  ] },
  { day: 166, words: [  {id:0,word:"CEILING",row:0,col:0,direction:"across"},{id:1,word:"TALE",row:3,col:0,direction:"across"},{id:2,word:"EASY",row:5,col:0,direction:"across"},{id:3,word:"CASTLE",row:0,col:0,direction:"down"},{id:4,word:"LONELY",row:0,col:3,direction:"down"}  ] },
  { day: 167, words: [  {id:0,word:"BOBBIN",row:0,col:0,direction:"across"},{id:1,word:"THIN",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"BUTTER",row:0,col:0,direction:"down"},{id:4,word:"BRONZE",row:0,col:3,direction:"down"}  ] },
  { day: 168, words: [  {id:0,word:"ATTACK",row:0,col:0,direction:"across"},{id:1,word:"BASIC",row:2,col:0,direction:"across"},{id:2,word:"RIDGE",row:4,col:0,direction:"across"},{id:3,word:"AUBURN",row:0,col:0,direction:"down"},{id:4,word:"CYCLE",row:0,col:4,direction:"down"}  ] },
  { day: 169, words: [  {id:0,word:"SOCIETY",row:0,col:0,direction:"across"},{id:1,word:"MEMO",row:3,col:0,direction:"across"},{id:2,word:"TOME",row:5,col:0,direction:"across"},{id:3,word:"SUBMIT",row:0,col:0,direction:"down"},{id:4,word:"INCOME",row:0,col:3,direction:"down"}  ] },
  { day: 170, words: [ {id:0,word:"ARMOUR",row:0,col:0,direction:"across"},{id:1,word:"OMIT",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"ALMOST",row:0,col:0,direction:"down"},{id:4,word:"OYSTER",row:0,col:3,direction:"down"} ] },
  { day: 171, words: [  {id:0,word:"LETHAL",row:0,col:0,direction:"across"},{id:1,word:"NEVER",row:2,col:0,direction:"across"},{id:2,word:"LODGE",row:4,col:0,direction:"across"},{id:3,word:"LONELY",row:0,col:0,direction:"down"},{id:4,word:"AGREE",row:0,col:4,direction:"down"}  ] },
  { day: 172, words: [  {id:0,word:"GRAVITY",row:0,col:0,direction:"across"},{id:1,word:"GOAL",row:3,col:0,direction:"across"},{id:2,word:"EMIT",row:5,col:0,direction:"across"},{id:3,word:"GIGGLE",row:0,col:0,direction:"down"},{id:4,word:"VIOLET",row:0,col:3,direction:"down"}  ] },
  { day: 173, words: [  {id:0,word:"HEARTH",row:0,col:0,direction:"across"},{id:1,word:"THOU",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"HUNTER",row:0,col:0,direction:"down"},{id:4,word:"REDUCE",row:0,col:3,direction:"down"}  ] },
  { day: 174, words: [  {id:0,word:"FORMAL",row:0,col:0,direction:"across"},{id:1,word:"STORM",row:2,col:0,direction:"across"},{id:2,word:"EXIST",row:4,col:0,direction:"across"},{id:3,word:"FOSTER",row:0,col:0,direction:"down"},{id:4,word:"ADMIT",row:0,col:4,direction:"down"}  ] },
  { day: 175, words: [  {id:0,word:"PERHAPS",row:0,col:0,direction:"across"},{id:1,word:"DOTE",row:3,col:0,direction:"across"},{id:2,word:"NEWT",row:5,col:0,direction:"across"},{id:3,word:"PARDON",row:0,col:0,direction:"down"},{id:4,word:"HONEST",row:0,col:3,direction:"down"}  ] },
  { day: 176, words: [  {id:0,word:"TARGET",row:0,col:0,direction:"across"},{id:1,word:"MEND",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"TREMOR",row:0,col:0,direction:"down"},{id:4,word:"GRUDGE",row:0,col:3,direction:"down"}  ] },
  { day: 177, words: [  {id:0,word:"REVOLT",row:0,col:0,direction:"across"},{id:1,word:"STAND",row:2,col:0,direction:"across"},{id:2,word:"SPICE",row:4,col:0,direction:"across"},{id:3,word:"RESIST",row:0,col:0,direction:"down"},{id:4,word:"LODGE",row:0,col:4,direction:"down"}  ] },
  { day: 178, words: [  {id:0,word:"EXCEEDS",row:0,col:0,direction:"across"},{id:1,word:"ONTO",row:3,col:0,direction:"across"},{id:2,word:"EAST",row:5,col:0,direction:"across"},{id:3,word:"ENCODE",row:0,col:0,direction:"down"},{id:4,word:"EXPORT",row:0,col:3,direction:"down"}  ] },
  { day: 179, words: [  {id:0,word:"SWITCH",row:0,col:0,direction:"across"},{id:1,word:"FLIP",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"SUFFER",row:0,col:0,direction:"down"},{id:4,word:"TRIPLE",row:0,col:3,direction:"down"}  ] },
  { day: 180, words: [  {id:0,word:"BUBBLE",row:0,col:0,direction:"across"},{id:1,word:"ONSET",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"BROKEN",row:0,col:0,direction:"down"},{id:4,word:"LATCH",row:0,col:4,direction:"down"}  ] },
  { day: 181, words: [  {id:0,word:"TORTURE",row:0,col:0,direction:"across"},{id:1,word:"BUMP",row:3,col:0,direction:"across"},{id:2,word:"EASE",row:5,col:0,direction:"across"},{id:3,word:"TUMBLE",row:0,col:0,direction:"down"},{id:4,word:"TOPPLE",row:0,col:3,direction:"down"}  ] },
  { day: 182, words: [  {id:0,word:"LAWFUL",row:0,col:0,direction:"across"},{id:1,word:"NEWT",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"LAUNCH",row:0,col:0,direction:"down"},{id:4,word:"FILTER",row:0,col:3,direction:"down"}  ] },
  { day: 183, words: [  {id:0,word:"MUSCLE",row:0,col:0,direction:"across"},{id:1,word:"RENEW",row:2,col:0,direction:"across"},{id:2,word:"LAYER",row:4,col:0,direction:"across"},{id:3,word:"MARBLE",row:0,col:0,direction:"down"},{id:4,word:"LOWER",row:0,col:4,direction:"down"}  ] },
  { day: 184, words: [  {id:0,word:"CONDEMN",row:0,col:0,direction:"across"},{id:1,word:"SOUL",row:3,col:0,direction:"across"},{id:2,word:"TOUR",row:5,col:0,direction:"across"},{id:3,word:"CLOSET",row:0,col:0,direction:"down"},{id:4,word:"DOLLAR",row:0,col:3,direction:"down"}  ] },
  { day: 185, words: [  {id:0,word:"CINDER",row:0,col:0,direction:"across"},{id:1,word:"DATA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"CONDOR",row:0,col:0,direction:"down"},{id:4,word:"DAMAGE",row:0,col:3,direction:"down"}  ] },
  { day: 186, words: [  {id:0,word:"THRIVE",row:0,col:0,direction:"across"},{id:1,word:"VIRAL",row:2,col:0,direction:"across"},{id:2,word:"RIDGE",row:4,col:0,direction:"across"},{id:3,word:"TAVERN",row:0,col:0,direction:"down"},{id:4,word:"VALUE",row:0,col:4,direction:"down"}  ] },
  { day: 187, words: [  {id:0,word:"PRIVATE",row:0,col:0,direction:"across"},{id:1,word:"ZEAL",row:3,col:0,direction:"across"},{id:2,word:"EAST",row:5,col:0,direction:"across"},{id:3,word:"PUZZLE",row:0,col:0,direction:"down"},{id:4,word:"VIOLET",row:0,col:3,direction:"down"}  ] },
  { day: 188, words: [  {id:0,word:"BOUGHT",row:0,col:0,direction:"across"},{id:1,word:"GRAB",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"BADGER",row:0,col:0,direction:"down"},{id:4,word:"GAMBLE",row:0,col:3,direction:"down"}  ] },
  { day: 189, words: [  {id:0,word:"DEBATE",row:0,col:0,direction:"across"},{id:1,word:"COBRA",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"DECREE",row:0,col:0,direction:"down"},{id:4,word:"TEACH",row:0,col:4,direction:"down"}  ] },
  { day: 190, words: [  {id:0,word:"FOREVER",row:0,col:0,direction:"across"},{id:1,word:"MULL",row:3,col:0,direction:"across"},{id:2,word:"LOFT",row:5,col:0,direction:"across"},{id:3,word:"FORMAL",row:0,col:0,direction:"down"},{id:4,word:"EYELET",row:0,col:3,direction:"down"}  ] },
  { day: 191, words: [  {id:0,word:"IMPORT",row:0,col:0,direction:"across"},{id:1,word:"EMIT",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"INSECT",row:0,col:0,direction:"down"},{id:4,word:"OYSTER",row:0,col:3,direction:"down"}  ] },
  { day: 192, words: [  {id:0,word:"HARDEN",row:0,col:0,direction:"across"},{id:1,word:"RABBI",row:2,col:0,direction:"across"},{id:2,word:"OZONE",row:4,col:0,direction:"across"},{id:3,word:"HORROR",row:0,col:0,direction:"down"},{id:4,word:"ELITE",row:0,col:4,direction:"down"}  ] },
  { day: 193, words: [  {id:0,word:"KILLING",row:0,col:0,direction:"across"},{id:1,word:"HOLY",row:3,col:0,direction:"across"},{id:2,word:"REAR",row:5,col:0,direction:"across"},{id:3,word:"KOSHER",row:0,col:0,direction:"down"},{id:4,word:"LAWYER",row:0,col:3,direction:"down"}  ] },
  { day: 194, words: [  {id:0,word:"PIGEON",row:0,col:0,direction:"across"},{id:1,word:"DATA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"PONDER",row:0,col:0,direction:"down"},{id:4,word:"ESCAPE",row:0,col:3,direction:"down"}  ] },
  { day: 195, words: [  {id:0,word:"MEMBER",row:0,col:0,direction:"across"},{id:1,word:"RIVET",row:2,col:0,direction:"across"},{id:2,word:"LASER",row:4,col:0,direction:"across"},{id:3,word:"MYRTLE",row:0,col:0,direction:"down"},{id:4,word:"ENTER",row:0,col:4,direction:"down"}  ] },
  { day: 196, words: [  {id:0,word:"IMPULSE",row:0,col:0,direction:"across"},{id:1,word:"UNDO",row:3,col:0,direction:"across"},{id:2,word:"TUCK",row:5,col:0,direction:"across"},{id:3,word:"INSULT",row:0,col:0,direction:"down"},{id:4,word:"UNLOCK",row:0,col:3,direction:"down"}  ] },
  { day: 197, words: [  {id:0,word:"ERRAND",row:0,col:0,direction:"across"},{id:1,word:"EDGE",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"EXPERT",row:0,col:0,direction:"down"},{id:4,word:"APPEAR",row:0,col:3,direction:"down"}  ] },
  { day: 198, words: [  {id:0,word:"CLUMSY",row:0,col:0,direction:"across"},{id:1,word:"REPEL",row:2,col:0,direction:"across"},{id:2,word:"ADEPT",row:4,col:0,direction:"across"},{id:3,word:"CEREAL",row:0,col:0,direction:"down"},{id:4,word:"SPLIT",row:0,col:4,direction:"down"}  ] },
  { day: 199, words: [ {id:0,word:"PLANNED",row:0,col:0,direction:"across"},{id:1,word:"MOOR",row:3,col:0,direction:"across"},{id:2,word:"THAW",row:5,col:0,direction:"across"},{id:3,word:"PERMIT",row:0,col:0,direction:"down"},{id:4,word:"NARROW",row:0,col:3,direction:"down"} ] },
  { day: 200, words: [  {id:0,word:"BESIDE",row:0,col:0,direction:"across"},{id:1,word:"HALO",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"BOTHER",row:0,col:0,direction:"down"},{id:4,word:"IMPOSE",row:0,col:3,direction:"down"}  ] },
  { day: 201, words: [  {id:0,word:"FOSTER",row:0,col:0,direction:"across"},{id:1,word:"RIVET",row:2,col:0,direction:"across"},{id:2,word:"STUDY",row:4,col:0,direction:"across"},{id:3,word:"FOREST",row:0,col:0,direction:"down"},{id:4,word:"ENTRY",row:0,col:4,direction:"down"}  ] },
  { day: 202, words: [  {id:0,word:"RICHEST",row:0,col:0,direction:"across"},{id:1,word:"AGED",row:3,col:0,direction:"across"},{id:2,word:"EDGE",row:5,col:0,direction:"across"},{id:3,word:"RELATE",row:0,col:0,direction:"down"},{id:4,word:"HURDLE",row:0,col:3,direction:"down"}  ] },
  { day: 203, words: [  {id:0,word:"HORROR",row:0,col:0,direction:"across"},{id:1,word:"RIND",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"HEARTH",row:0,col:0,direction:"down"},{id:4,word:"RENDER",row:0,col:3,direction:"down"}  ] },
  { day: 204, words: [  {id:0,word:"RESIST",row:0,col:0,direction:"across"},{id:1,word:"VALUE",row:2,col:0,direction:"across"},{id:2,word:"LEGAL",row:4,col:0,direction:"across"},{id:3,word:"REVOLT",row:0,col:0,direction:"down"},{id:4,word:"SHELL",row:0,col:4,direction:"down"}  ] },
  { day: 205, words: [  {id:0,word:"PERFORM",row:0,col:0,direction:"across"},{id:1,word:"TONG",row:3,col:0,direction:"across"},{id:2,word:"NEAR",row:5,col:0,direction:"across"},{id:3,word:"PISTON",row:0,col:0,direction:"down"},{id:4,word:"FINGER",row:0,col:3,direction:"down"}  ] },
  { day: 206, words: [  {id:0,word:"TRIPLE",row:0,col:0,direction:"across"},{id:1,word:"TOPS",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"TEETER",row:0,col:0,direction:"down"},{id:4,word:"PURSUE",row:0,col:3,direction:"down"}  ] },
  { day: 207, words: [  {id:0,word:"CRISIS",row:0,col:0,direction:"across"},{id:1,word:"MOUNT",row:2,col:0,direction:"across"},{id:2,word:"INTRO",row:4,col:0,direction:"across"},{id:3,word:"COMMIT",row:0,col:0,direction:"down"},{id:4,word:"INTRO",row:0,col:4,direction:"down"}  ] },
  { day: 208, words: [  {id:0,word:"EXPLAIN",row:0,col:0,direction:"across"},{id:1,word:"UGLY",row:3,col:0,direction:"across"},{id:2,word:"EVER",row:5,col:0,direction:"across"},{id:3,word:"ENSURE",row:0,col:0,direction:"down"},{id:4,word:"LAWYER",row:0,col:3,direction:"down"}  ] },
  { day: 209, words: [  {id:0,word:"ACTIVE",row:0,col:0,direction:"across"},{id:1,word:"LOGO",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"ANTLER",row:0,col:0,direction:"down"},{id:4,word:"INCOME",row:0,col:3,direction:"down"}  ] },
  { day: 210, words: [  {id:0,word:"ENTITY",row:0,col:0,direction:"across"},{id:1,word:"TRAIN",row:2,col:0,direction:"across"},{id:2,word:"TOXIC",row:4,col:0,direction:"across"},{id:3,word:"ESTATE",row:0,col:0,direction:"down"},{id:4,word:"TUNIC",row:0,col:4,direction:"down"}  ] },
  { day: 211, words: [  {id:0,word:"VISITOR",row:0,col:0,direction:"across"},{id:1,word:"SAVE",row:3,col:0,direction:"across"},{id:2,word:"LOUT",row:5,col:0,direction:"across"},{id:3,word:"VESSEL",row:0,col:0,direction:"down"},{id:4,word:"INTENT",row:0,col:3,direction:"down"}  ] },
  { day: 212, words: [  {id:0,word:"STRIVE",row:0,col:0,direction:"across"},{id:1,word:"ONTO",row:3,col:0,direction:"across"},{id:2,word:"GRIEVE",row:5,col:0,direction:"across"},{id:3,word:"STRONG",row:0,col:0,direction:"down"},{id:4,word:"INCOME",row:0,col:3,direction:"down"}  ] },
  { day: 213, words: [  {id:0,word:"CANVAS",row:0,col:0,direction:"across"},{id:1,word:"BEING",row:2,col:0,direction:"across"},{id:2,word:"EQUAL",row:4,col:0,direction:"across"},{id:3,word:"COBWEB",row:0,col:0,direction:"down"},{id:4,word:"ANGEL",row:0,col:4,direction:"down"}  ] },
  { day: 214, words: [  {id:0,word:"IMPOSED",row:0,col:0,direction:"across"},{id:1,word:"EARL",row:3,col:0,direction:"across"},{id:2,word:"THAT",row:5,col:0,direction:"across"},{id:3,word:"INTENT",row:0,col:0,direction:"down"},{id:4,word:"OUTLET",row:0,col:3,direction:"down"}  ] },
  { day: 215, words: [  {id:0,word:"PENCIL",row:0,col:0,direction:"across"},{id:1,word:"EYED",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"PATENT",row:0,col:0,direction:"down"},{id:4,word:"CINDER",row:0,col:3,direction:"down"}  ] },
  { day: 216, words: [  {id:0,word:"TEMPLE",row:0,col:0,direction:"across"},{id:1,word:"CROWN",row:2,col:0,direction:"across"},{id:2,word:"OTHER",row:4,col:0,direction:"across"},{id:3,word:"TYCOON",row:0,col:0,direction:"down"},{id:4,word:"LINER",row:0,col:4,direction:"down"}  ] },
  { day: 217, words: [  {id:0,word:"HIMSELF",row:0,col:0,direction:"across"},{id:1,word:"RUST",row:3,col:0,direction:"across"},{id:2,word:"RICE",row:5,col:0,direction:"across"},{id:3,word:"HORROR",row:0,col:0,direction:"down"},{id:4,word:"SOOTHE",row:0,col:3,direction:"down"}  ] },
  { day: 218, words: [  {id:0,word:"MOTIVE",row:0,col:0,direction:"across"},{id:1,word:"DELI",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"MURDER",row:0,col:0,direction:"down"},{id:4,word:"INVITE",row:0,col:3,direction:"down"}  ] },
  { day: 219, words: [  {id:0,word:"PATENT",row:0,col:0,direction:"across"},{id:1,word:"NEWER",row:2,col:0,direction:"across"},{id:2,word:"INDIE",row:4,col:0,direction:"across"},{id:3,word:"PENCIL",row:0,col:0,direction:"down"},{id:4,word:"NERVE",row:0,col:4,direction:"down"}  ] },
  { day: 220, words: [  {id:0,word:"CAPTURE",row:0,col:0,direction:"across"},{id:1,word:"SLIP",row:3,col:0,direction:"across"},{id:2,word:"TUBE",row:5,col:0,direction:"across"},{id:3,word:"CLOSET",row:0,col:0,direction:"down"},{id:4,word:"TRIPLE",row:0,col:3,direction:"down"}  ] },
  { day: 221, words: [  {id:0,word:"GOBLIN",row:0,col:0,direction:"across"},{id:1,word:"LEES",row:3,col:0,direction:"across"},{id:2,word:"CANNON",row:5,col:0,direction:"across"},{id:3,word:"GARLIC",row:0,col:0,direction:"down"},{id:4,word:"LESSEN",row:0,col:3,direction:"down"}  ] },
  { day: 222, words: [  {id:0,word:"STOLEN",row:0,col:0,direction:"across"},{id:1,word:"ULTRA",row:2,col:0,direction:"across"},{id:2,word:"CURVE",row:4,col:0,direction:"across"},{id:3,word:"SOURCE",row:0,col:0,direction:"down"},{id:4,word:"EVADE",row:0,col:4,direction:"down"}  ] },
  { day: 223, words: [  {id:0,word:"OUTSIDE",row:0,col:0,direction:"across"},{id:1,word:"GURU",row:3,col:0,direction:"across"},{id:2,word:"NIGH",row:5,col:0,direction:"across"},{id:3,word:"ORIGIN",row:0,col:0,direction:"down"},{id:4,word:"SLOUCH",row:0,col:3,direction:"down"}  ] },
  { day: 224, words: [  {id:0,word:"MODEST",row:0,col:0,direction:"across"},{id:1,word:"TOMB",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"MUSTER",row:0,col:0,direction:"down"},{id:4,word:"ENABLE",row:0,col:3,direction:"down"}  ] },
  { day: 225, words: [  {id:0,word:"KINDER",row:0,col:0,direction:"across"},{id:1,word:"SPOKE",row:2,col:0,direction:"across"},{id:2,word:"EMPTY",row:4,col:0,direction:"across"},{id:3,word:"KOSHER",row:0,col:0,direction:"down"},{id:4,word:"ENEMY",row:0,col:4,direction:"down"}  ] },
  { day: 226, words: [  {id:0,word:"VIOLENT",row:0,col:0,direction:"across"},{id:1,word:"TIFF",row:3,col:0,direction:"across"},{id:2,word:"MULL",row:5,col:0,direction:"across"},{id:3,word:"VICTIM",row:0,col:0,direction:"down"},{id:4,word:"LAWFUL",row:0,col:3,direction:"down"}  ] },
  { day: 227, words: [  {id:0,word:"TUMBLE",row:0,col:0,direction:"across"},{id:1,word:"UNIT",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"TROUGH",row:0,col:0,direction:"down"},{id:4,word:"BITTER",row:0,col:3,direction:"down"}  ] },
  { day: 228, words: [  {id:0,word:"GOLDEN",row:0,col:0,direction:"across"},{id:1,word:"USAGE",row:2,col:0,direction:"across"},{id:2,word:"GRAVY",row:4,col:0,direction:"across"},{id:3,word:"GRUDGE",row:0,col:0,direction:"down"},{id:4,word:"EVERY",row:0,col:4,direction:"down"}  ] },
  { day: 229, words: [  {id:0,word:"RELEASE",row:0,col:0,direction:"across"},{id:1,word:"UNDO",row:3,col:0,direction:"across"},{id:2,word:"EAST",row:5,col:0,direction:"across"},{id:3,word:"REFUSE",row:0,col:0,direction:"down"},{id:4,word:"EXPORT",row:0,col:3,direction:"down"}  ] },
  { day: 230, words: [  {id:0,word:"LANCER",row:0,col:0,direction:"across"},{id:1,word:"NEED",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"LAUNCH",row:0,col:0,direction:"down"},{id:4,word:"CINDER",row:0,col:3,direction:"down"}  ] },
  { day: 231, words: [  {id:0,word:"ACCRUE",row:0,col:0,direction:"across"},{id:1,word:"LUNCH",row:2,col:0,direction:"across"},{id:2,word:"NEWER",row:4,col:0,direction:"across"},{id:3,word:"AILING",row:0,col:0,direction:"down"},{id:4,word:"USHER",row:0,col:4,direction:"down"}  ] },
  { day: 232, words: [  {id:0,word:"FAILURE",row:0,col:0,direction:"across"},{id:1,word:"USED",row:3,col:0,direction:"across"},{id:2,word:"EVER",row:5,col:0,direction:"across"},{id:3,word:"FIGURE",row:0,col:0,direction:"down"},{id:4,word:"LEADER",row:0,col:3,direction:"down"}  ] },
  { day: 233, words: [  {id:0,word:"BLIGHT",row:0,col:0,direction:"across"},{id:1,word:"TOPS",row:3,col:0,direction:"across"},{id:2,word:"MIRROR",row:5,col:0,direction:"across"},{id:3,word:"BOTTOM",row:0,col:0,direction:"down"},{id:4,word:"GEYSER",row:0,col:3,direction:"down"}  ] },
  { day: 234, words: [  {id:0,word:"TREMOR",row:0,col:0,direction:"across"},{id:1,word:"CATCH",row:2,col:0,direction:"across"},{id:2,word:"OUTER",row:4,col:0,direction:"across"},{id:3,word:"TYCOON",row:0,col:0,direction:"down"},{id:4,word:"OTHER",row:0,col:4,direction:"down"}  ] },
  { day: 235, words: [  {id:0,word:"CABINET",row:0,col:0,direction:"across"},{id:1,word:"COLA",row:3,col:0,direction:"across"},{id:2,word:"EYED",row:5,col:0,direction:"across"},{id:3,word:"CIRCLE",row:0,col:0,direction:"down"},{id:4,word:"ISLAND",row:0,col:3,direction:"down"}  ] },
  { day: 236, words: [  {id:0,word:"INSULT",row:0,col:0,direction:"across"},{id:1,word:"ORCA",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"IMPORT",row:0,col:0,direction:"down"},{id:4,word:"UNFAIR",row:0,col:3,direction:"down"}  ] },
  { day: 237, words: [  {id:0,word:"PORTAL",row:0,col:0,direction:"across"},{id:1,word:"LYING",row:2,col:0,direction:"across"},{id:2,word:"CAMEL",row:4,col:0,direction:"across"},{id:3,word:"PALACE",row:0,col:0,direction:"down"},{id:4,word:"ANGEL",row:0,col:4,direction:"down"}  ] },
  { day: 238, words: [  {id:0,word:"FRANTIC",row:0,col:0,direction:"across"},{id:1,word:"HERB",row:3,col:0,direction:"across"},{id:2,word:"MULE",row:5,col:0,direction:"across"},{id:3,word:"FATHOM",row:0,col:0,direction:"down"},{id:4,word:"NIMBLE",row:0,col:3,direction:"down"}  ] },
  { day: 239, words: [  {id:0,word:"SAMPLE",row:0,col:0,direction:"across"},{id:1,word:"DATA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"SENDER",row:0,col:0,direction:"down"},{id:4,word:"PALACE",row:0,col:3,direction:"down"}  ] },
  { day: 240, words: [  {id:0,word:"TROUGH",row:0,col:0,direction:"across"},{id:1,word:"MOUSE",row:2,col:0,direction:"across"},{id:2,word:"ELECT",row:4,col:0,direction:"across"},{id:3,word:"TIMBER",row:0,col:0,direction:"down"},{id:4,word:"GREAT",row:0,col:4,direction:"down"}  ] },
  { day: 241, words: [  {id:0,word:"EMOTION",row:0,col:0,direction:"across"},{id:1,word:"OVER",row:3,col:0,direction:"across"},{id:2,word:"TOUR",row:5,col:0,direction:"across"},{id:3,word:"EXPORT",row:0,col:0,direction:"down"},{id:4,word:"TERROR",row:0,col:3,direction:"down"}  ] },
  { day: 242, words: [  {id:0,word:"RUMBLE",row:0,col:0,direction:"across"},{id:1,word:"UNIT",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"RESULT",row:0,col:0,direction:"down"},{id:4,word:"BARTER",row:0,col:3,direction:"down"}  ] },
  { day: 243, words: [  {id:0,word:"OCCUPY",row:0,col:0,direction:"across"},{id:1,word:"FLORA",row:2,col:0,direction:"across"},{id:2,word:"NAIVE",row:4,col:0,direction:"across"},{id:3,word:"OFFEND",row:0,col:0,direction:"down"},{id:4,word:"PHASE",row:0,col:4,direction:"down"}  ] },
  { day: 244, words: [  {id:0,word:"DROUGHT",row:0,col:0,direction:"across"},{id:1,word:"ONTO",row:3,col:0,direction:"across"},{id:2,word:"RISK",row:5,col:0,direction:"across"},{id:3,word:"DEVOUR",row:0,col:0,direction:"down"},{id:4,word:"UNLOCK",row:0,col:3,direction:"down"}  ] },
  { day: 245, words: [  {id:0,word:"MIRROR",row:0,col:0,direction:"across"},{id:1,word:"TOMB",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"MUSTER",row:0,col:0,direction:"down"},{id:4,word:"RUMBLE",row:0,col:3,direction:"down"}  ] },
  { day: 246, words: [ {id:0,word:"ORNATE",row:0,col:0,direction:"across"},{id:1,word:"TEMPO",row:2,col:0,direction:"across"},{id:2,word:"ELECT",row:4,col:0,direction:"across"},{id:3,word:"OUTLET",row:0,col:0,direction:"down"},{id:4,word:"TROUT",row:0,col:4,direction:"down"} ] },
  { day: 247, words: [  {id:0,word:"FEEDING",row:0,col:0,direction:"across"},{id:1,word:"IDLE",row:3,col:0,direction:"across"},{id:2,word:"EAST",row:5,col:0,direction:"across"},{id:3,word:"FAMINE",row:0,col:0,direction:"down"},{id:4,word:"DESERT",row:0,col:3,direction:"down"}  ] },
  { day: 248, words: [  {id:0,word:"HERALD",row:0,col:0,direction:"across"},{id:1,word:"BURR",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"HARBOR",row:0,col:0,direction:"down"},{id:4,word:"ACCRUE",row:0,col:3,direction:"down"}  ] },
  { day: 249, words: [  {id:0,word:"SECRET",row:0,col:0,direction:"across"},{id:1,word:"RIDER",row:2,col:0,direction:"across"},{id:2,word:"NORTH",row:4,col:0,direction:"across"},{id:3,word:"STRONG",row:0,col:0,direction:"down"},{id:4,word:"EARTH",row:0,col:4,direction:"down"}  ] },
  { day: 250, words: [  {id:0,word:"OUTDOOR",row:0,col:0,direction:"across"},{id:1,word:"GANG",row:3,col:0,direction:"across"},{id:2,word:"NEAR",row:5,col:0,direction:"across"},{id:3,word:"ORIGIN",row:0,col:0,direction:"down"},{id:4,word:"DAGGER",row:0,col:3,direction:"down"}  ] },
  { day: 251, words: [  {id:0,word:"RANDOM",row:0,col:0,direction:"across"},{id:1,word:"UNDO",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"RESULT",row:0,col:0,direction:"down"},{id:4,word:"DEVOUR",row:0,col:3,direction:"down"}  ] },
  { day: 252, words: [  {id:0,word:"DECIDE",row:0,col:0,direction:"across"},{id:1,word:"FINAL",row:2,col:0,direction:"across"},{id:2,word:"ENTRY",row:4,col:0,direction:"across"},{id:3,word:"DIFFER",row:0,col:0,direction:"down"},{id:4,word:"DELAY",row:0,col:4,direction:"down"}  ] },
  { day: 253, words: [  {id:0,word:"INITIAL",row:0,col:0,direction:"across"},{id:1,word:"IDLE",row:3,col:0,direction:"across"},{id:2,word:"EARN",row:5,col:0,direction:"across"},{id:3,word:"INCITE",row:0,col:0,direction:"down"},{id:4,word:"TAVERN",row:0,col:3,direction:"down"}  ] },
  { day: 254, words: [ {id:0,word:"BANANA",row:0,col:0,direction:"across"},{id:1,word:"HULA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"BOTHER",row:0,col:0,direction:"down"},{id:4,word:"ABLAZE",row:0,col:3,direction:"down"} ] },
  { day: 255, words: [  {id:0,word:"INVEST",row:0,col:0,direction:"across"},{id:1,word:"VIDEO",row:2,col:0,direction:"across"},{id:2,word:"TITLE",row:4,col:0,direction:"across"},{id:3,word:"INVITE",row:0,col:0,direction:"down"},{id:4,word:"SPOKE",row:0,col:4,direction:"down"}  ] },
  { day: 256, words: [  {id:0,word:"KINGDOM",row:0,col:0,direction:"across"},{id:1,word:"DRAG",row:3,col:0,direction:"across"},{id:2,word:"ROLE",row:5,col:0,direction:"across"},{id:3,word:"KINDER",row:0,col:0,direction:"down"},{id:4,word:"GIGGLE",row:0,col:3,direction:"down"}  ] },
  { day: 257, words: [  {id:0,word:"WEAPON",row:0,col:0,direction:"across"},{id:1,word:"MULL",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"WARMTH",row:0,col:0,direction:"down"},{id:4,word:"PILLAR",row:0,col:3,direction:"down"}  ] },
  { day: 258, words: [  {id:0,word:"REMOTE",row:0,col:0,direction:"across"},{id:1,word:"WHOLE",row:2,col:0,direction:"across"},{id:2,word:"RIVET",row:4,col:0,direction:"across"},{id:3,word:"REWARD",row:0,col:0,direction:"down"},{id:4,word:"TREAT",row:0,col:4,direction:"down"}  ] },
  { day: 259, words: [  {id:0,word:"SURPLUS",row:0,col:0,direction:"across"},{id:1,word:"RAID",row:3,col:0,direction:"across"},{id:2,word:"EVER",row:5,col:0,direction:"across"},{id:3,word:"SOURCE",row:0,col:0,direction:"down"},{id:4,word:"PONDER",row:0,col:3,direction:"down"}  ] },
  { day: 260, words: [ {id:0,word:"ACCEPT",row:0,col:0,direction:"across"},{id:1,word:"HULA",row:3,col:0,direction:"across"},{id:2,word:"ADHERE",row:5,col:0,direction:"across"},{id:3,word:"ASTHMA",row:0,col:0,direction:"down"},{id:4,word:"ESTATE",row:0,col:3,direction:"down"} ] },
  { day: 261, words: [ {id:0,word:"NICKEL",row:0,col:0,direction:"across"},{id:1,word:"INNER",row:2,col:0,direction:"across"},{id:2,word:"EPOCH",row:4,col:0,direction:"across"},{id:3,word:"NAILED",row:0,col:0,direction:"down"},{id:4,word:"EARTH",row:0,col:4,direction:"down"} ] },
  { day: 262, words: [  {id:0,word:"WALKING",row:0,col:0,direction:"across"},{id:1,word:"MYTH",row:3,col:0,direction:"across"},{id:2,word:"HAIR",row:5,col:0,direction:"across"},{id:3,word:"WARMTH",row:0,col:0,direction:"down"},{id:4,word:"KOSHER",row:0,col:3,direction:"down"}  ] },
  { day: 263, words: [  {id:0,word:"SHIVER",row:0,col:0,direction:"across"},{id:1,word:"VEST",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"SILVER",row:0,col:0,direction:"down"},{id:4,word:"VIRTUE",row:0,col:3,direction:"down"}  ] },
  { day: 264, words: [ {id:0,word:"NICKEL",row:0,col:0,direction:"across"},{id:1,word:"MAPLE",row:2,col:0,direction:"across"},{id:2,word:"LUSTY",row:4,col:0,direction:"across"},{id:3,word:"NIMBLE",row:0,col:0,direction:"down"},{id:4,word:"ENEMY",row:0,col:4,direction:"down"} ] },
  { day: 265, words: [  {id:0,word:"LANTERN",row:0,col:0,direction:"across"},{id:1,word:"EASE",row:3,col:0,direction:"across"},{id:2,word:"YARN",row:5,col:0,direction:"across"},{id:3,word:"LIVELY",row:0,col:0,direction:"down"},{id:4,word:"TAVERN",row:0,col:3,direction:"down"}  ] },
  { day: 266, words: [  {id:0,word:"ARCHER",row:0,col:0,direction:"across"},{id:1,word:"HARD",row:3,col:0,direction:"across"},{id:2,word:"ADHERE",row:5,col:0,direction:"across"},{id:3,word:"ASTHMA",row:0,col:0,direction:"down"},{id:4,word:"HURDLE",row:0,col:3,direction:"down"}  ] },
  { day: 267, words: [  {id:0,word:"SINGLE",row:0,col:0,direction:"across"},{id:1,word:"VIOLA",row:2,col:0,direction:"across"},{id:2,word:"GRAVY",row:4,col:0,direction:"across"},{id:3,word:"SAVAGE",row:0,col:0,direction:"down"},{id:4,word:"LEAKY",row:0,col:4,direction:"down"}  ] },
  { day: 268, words: [  {id:0,word:"CAREFUL",row:0,col:0,direction:"across"},{id:1,word:"NAIL",row:3,col:0,direction:"across"},{id:2,word:"EXAM",row:5,col:0,direction:"across"},{id:3,word:"CHANGE",row:0,col:0,direction:"down"},{id:4,word:"EMBLEM",row:0,col:3,direction:"down"}  ] },
  { day: 269, words: [  {id:0,word:"PURSUE",row:0,col:0,direction:"across"},{id:1,word:"DEEP",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"PONDER",row:0,col:0,direction:"down"},{id:4,word:"SAMPLE",row:0,col:3,direction:"down"}  ] },
  { day: 270, words: [  {id:0,word:"ASSERT",row:0,col:0,direction:"across"},{id:1,word:"SKULL",row:2,col:0,direction:"across"},{id:2,word:"ENJOY",row:4,col:0,direction:"across"},{id:3,word:"ANSWER",row:0,col:0,direction:"down"},{id:4,word:"RELAY",row:0,col:4,direction:"down"}  ] },
  { day: 271, words: [  {id:0,word:"BELIEFS",row:0,col:0,direction:"across"},{id:1,word:"NINE",row:3,col:0,direction:"across"},{id:2,word:"HOLD",row:5,col:0,direction:"across"},{id:3,word:"BRANCH",row:0,col:0,direction:"down"},{id:4,word:"INDEED",row:0,col:3,direction:"down"}  ] },
  { day: 272, words: [  {id:0,word:"THRASH",row:0,col:0,direction:"across"},{id:1,word:"GROW",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"TARGET",row:0,col:0,direction:"down"},{id:4,word:"ANSWER",row:0,col:3,direction:"down"}  ] },
  { day: 273, words: [  {id:0,word:"GRAVEL",row:0,col:0,direction:"across"},{id:1,word:"INPUT",row:2,col:0,direction:"across"},{id:2,word:"COBRA",row:4,col:0,direction:"across"},{id:3,word:"GLITCH",row:0,col:0,direction:"down"},{id:4,word:"EXTRA",row:0,col:4,direction:"down"}  ] },
  { day: 274, words: [  {id:0,word:"REMOVED",row:0,col:0,direction:"across"},{id:1,word:"IDLE",row:3,col:0,direction:"across"},{id:2,word:"HEAL",row:5,col:0,direction:"across"},{id:3,word:"RADISH",row:0,col:0,direction:"down"},{id:4,word:"ORDEAL",row:0,col:3,direction:"down"}  ] },
  { day: 275, words: [  {id:0,word:"STATIC",row:0,col:0,direction:"across"},{id:1,word:"THUD",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"SWITCH",row:0,col:0,direction:"down"},{id:4,word:"TENDER",row:0,col:3,direction:"down"}  ] },
  { day: 276, words: [  {id:0,word:"ISLAND",row:0,col:0,direction:"across"},{id:1,word:"CHAIR",row:2,col:0,direction:"across"},{id:2,word:"TENTH",row:4,col:0,direction:"across"},{id:3,word:"INCITE",row:0,col:0,direction:"down"},{id:4,word:"NORTH",row:0,col:4,direction:"down"}  ] },
  { day: 277, words: [  {id:0,word:"LEADING",row:0,col:0,direction:"across"},{id:1,word:"EVER",row:3,col:0,direction:"across"},{id:2,word:"YORE",row:5,col:0,direction:"across"},{id:3,word:"LONELY",row:0,col:0,direction:"down"},{id:4,word:"DECREE",row:0,col:3,direction:"down"}  ] },
  { day: 278, words: [  {id:0,word:"ADRIFT",row:0,col:0,direction:"across"},{id:1,word:"HOBO",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"ARCHER",row:0,col:0,direction:"down"},{id:4,word:"IMPOSE",row:0,col:3,direction:"down"}  ] },
  { day: 279, words: [ {id:0,word:"FELLOW",row:0,col:0,direction:"across"},{id:1,word:"IMAGE",row:2,col:0,direction:"across"},{id:2,word:"CROWN",row:4,col:0,direction:"across"},{id:3,word:"FLINCH",row:0,col:0,direction:"down"},{id:4,word:"OCEAN",row:0,col:4,direction:"down"} ] },
  { day: 280, words: [  {id:0,word:"JUSTIFY",row:0,col:0,direction:"across"},{id:1,word:"GRAB",row:3,col:0,direction:"across"},{id:2,word:"EDGE",row:5,col:0,direction:"across"},{id:3,word:"JINGLE",row:0,col:0,direction:"down"},{id:4,word:"TUMBLE",row:0,col:3,direction:"down"}  ] },
  { day: 281, words: [  {id:0,word:"PARROT",row:0,col:0,direction:"across"},{id:1,word:"NERD",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"PLINTH",row:0,col:0,direction:"down"},{id:4,word:"RENDER",row:0,col:3,direction:"down"}  ] },
  { day: 282, words: [  {id:0,word:"EXPAND",row:0,col:0,direction:"across"},{id:1,word:"TIGER",row:2,col:0,direction:"across"},{id:2,word:"IMAGE",row:4,col:0,direction:"across"},{id:3,word:"ENTAIL",row:0,col:0,direction:"down"},{id:4,word:"NURSE",row:0,col:4,direction:"down"}  ] },
  { day: 283, words: [  {id:0,word:"SESSION",row:0,col:0,direction:"across"},{id:1,word:"VILE",row:3,col:0,direction:"across"},{id:2,word:"RENT",row:5,col:0,direction:"across"},{id:3,word:"SHIVER",row:0,col:0,direction:"down"},{id:4,word:"SELECT",row:0,col:3,direction:"down"}  ] },
  { day: 284, words: [  {id:0,word:"TOPPLE",row:0,col:0,direction:"across"},{id:1,word:"UNIT",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"TROUGH",row:0,col:0,direction:"down"},{id:4,word:"POTTER",row:0,col:3,direction:"down"}  ] },
  { day: 285, words: [  {id:0,word:"SMOOTH",row:0,col:0,direction:"across"},{id:1,word:"OPERA",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"STOLEN",row:0,col:0,direction:"down"},{id:4,word:"TEACH",row:0,col:4,direction:"down"}  ] },
  { day: 286, words: [  {id:0,word:"HELPING",row:0,col:0,direction:"across"},{id:1,word:"ACID",row:3,col:0,direction:"across"},{id:2,word:"DARN",row:5,col:0,direction:"across"},{id:3,word:"HAZARD",row:0,col:0,direction:"down"},{id:4,word:"PARDON",row:0,col:3,direction:"down"}  ] },
  { day: 287, words: [  {id:0,word:"DIFFER",row:0,col:0,direction:"across"},{id:1,word:"EMIT",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"DEFEAT",row:0,col:0,direction:"down"},{id:4,word:"FILTER",row:0,col:3,direction:"down"}  ] },
  { day: 288, words: [  {id:0,word:"ATTAIN",row:0,col:0,direction:"across"},{id:1,word:"KNIFE",row:2,col:0,direction:"across"},{id:2,word:"EQUAL",row:4,col:0,direction:"across"},{id:3,word:"ANKLET",row:0,col:0,direction:"down"},{id:4,word:"IDEAL",row:0,col:4,direction:"down"}  ] },
  { day: 289, words: [  {id:0,word:"PREMIER",row:0,col:0,direction:"across"},{id:1,word:"ROBE",row:3,col:0,direction:"across"},{id:2,word:"LIFT",row:5,col:0,direction:"across"},{id:3,word:"PETROL",row:0,col:0,direction:"down"},{id:4,word:"MODEST",row:0,col:3,direction:"down"}  ] },
  { day: 290, words: [  {id:0,word:"SPIRAL",row:0,col:0,direction:"across"},{id:1,word:"OOZE",row:3,col:0,direction:"across"},{id:2,word:"GRIEVE",row:5,col:0,direction:"across"},{id:3,word:"STRONG",row:0,col:0,direction:"down"},{id:4,word:"RECEDE",row:0,col:3,direction:"down"}  ] },
  { day: 291, words: [  {id:0,word:"JOVIAL",row:0,col:0,direction:"across"},{id:1,word:"NINJA",row:2,col:0,direction:"across"},{id:2,word:"LEMON",row:4,col:0,direction:"across"},{id:3,word:"JUNGLE",row:0,col:0,direction:"down"},{id:4,word:"AGAIN",row:0,col:4,direction:"down"}  ] },
  { day: 292, words: [  {id:0,word:"SURFACE",row:0,col:0,direction:"across"},{id:1,word:"EYED",row:3,col:0,direction:"across"},{id:2,word:"NODE",row:5,col:0,direction:"across"},{id:3,word:"SOLEMN",row:0,col:0,direction:"down"},{id:4,word:"FIDDLE",row:0,col:3,direction:"down"}  ] },
  { day: 293, words: [  {id:0,word:"HANDLE",row:0,col:0,direction:"across"},{id:1,word:"ROTA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"HORROR",row:0,col:0,direction:"down"},{id:4,word:"DEBATE",row:0,col:3,direction:"down"}  ] },
  { day: 294, words: [ {id:0,word:"NOZZLE",row:0,col:0,direction:"across"},{id:1,word:"IMPLY",row:2,col:0,direction:"across"},{id:2,word:"EQUAL",row:4,col:0,direction:"across"},{id:3,word:"NAILED",row:0,col:0,direction:"down"},{id:4,word:"LOYAL",row:0,col:4,direction:"down"} ] },
  { day: 295, words: [  {id:0,word:"PLEASED",row:0,col:0,direction:"across"},{id:1,word:"DATA",row:3,col:0,direction:"across"},{id:2,word:"RAVE",row:5,col:0,direction:"across"},{id:3,word:"PONDER",row:0,col:0,direction:"down"},{id:4,word:"ABLAZE",row:0,col:3,direction:"down"}  ] },
  { day: 296, words: [ {id:0,word:"LAUNCH",row:0,col:0,direction:"across"},{id:1,word:"OMIT",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"LAYOUT",row:0,col:0,direction:"down"},{id:4,word:"NATTER",row:0,col:3,direction:"down"} ] },
  { day: 297, words: [  {id:0,word:"SINFUL",row:0,col:0,direction:"across"},{id:1,word:"PATCH",row:2,col:0,direction:"across"},{id:2,word:"LOVER",row:4,col:0,direction:"across"},{id:3,word:"SUPPLY",row:0,col:0,direction:"down"},{id:4,word:"USHER",row:0,col:4,direction:"down"}  ] },
  { day: 298, words: [ {id:0,word:"VILLAGE",row:0,col:0,direction:"across"},{id:1,word:"SAGE",row:3,col:0,direction:"across"},{id:2,word:"LAZY",row:5,col:0,direction:"across"},{id:3,word:"VESSEL",row:0,col:0,direction:"down"},{id:4,word:"LIVELY",row:0,col:3,direction:"down"} ] },
  { day: 299, words: [  {id:0,word:"CANOPY",row:0,col:0,direction:"across"},{id:1,word:"TANG",row:3,col:0,direction:"across"},{id:2,word:"CANNON",row:5,col:0,direction:"across"},{id:3,word:"CRITIC",row:0,col:0,direction:"down"},{id:4,word:"ORIGIN",row:0,col:3,direction:"down"}  ] },
  { day: 300, words: [  {id:0,word:"AROUND",row:0,col:0,direction:"across"},{id:1,word:"KNOWN",row:2,col:0,direction:"across"},{id:2,word:"EXTRA",row:4,col:0,direction:"across"},{id:3,word:"ANKLET",row:0,col:0,direction:"down"},{id:4,word:"NINJA",row:0,col:4,direction:"down"}  ] },
  { day: 301, words: [  {id:0,word:"MESSAGE",row:0,col:0,direction:"across"},{id:1,word:"DEFT",row:3,col:0,direction:"across"},{id:2,word:"RISE",row:5,col:0,direction:"across"},{id:3,word:"MURDER",row:0,col:0,direction:"down"},{id:4,word:"SOOTHE",row:0,col:3,direction:"down"}  ] },
  { day: 302, words: [  {id:0,word:"FIDDLE",row:0,col:0,direction:"across"},{id:1,word:"GEAR",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"FINGER",row:0,col:0,direction:"down"},{id:4,word:"DECREE",row:0,col:3,direction:"down"}  ] },
  { day: 303, words: [  {id:0,word:"REGARD",row:0,col:0,direction:"across"},{id:1,word:"NIGHT",row:2,col:0,direction:"across"},{id:2,word:"ENJOY",row:4,col:0,direction:"across"},{id:3,word:"RENDER",row:0,col:0,direction:"down"},{id:4,word:"RETRY",row:0,col:4,direction:"down"}  ] },
  { day: 304, words: [  {id:0,word:"LINKING",row:0,col:0,direction:"across"},{id:1,word:"SHED",row:3,col:0,direction:"across"},{id:2,word:"NEAR",row:5,col:0,direction:"across"},{id:3,word:"LESSON",row:0,col:0,direction:"down"},{id:4,word:"KINDER",row:0,col:3,direction:"down"}  ] },
  { day: 305, words: [  {id:0,word:"TOGGLE",row:0,col:0,direction:"across"},{id:1,word:"BALE",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"TIMBER",row:0,col:0,direction:"down"},{id:4,word:"GRIEVE",row:0,col:3,direction:"down"}  ] },
  { day: 306, words: [  {id:0,word:"OUTRUN",row:0,col:0,direction:"across"},{id:1,word:"TIGHT",row:2,col:0,direction:"across"},{id:2,word:"OTHER",row:4,col:0,direction:"across"},{id:3,word:"OPTION",row:0,col:0,direction:"down"},{id:4,word:"UTTER",row:0,col:4,direction:"down"}  ] },
  { day: 307, words: [  {id:0,word:"KNOWING",row:0,col:0,direction:"across"},{id:1,word:"DEED",row:3,col:0,direction:"across"},{id:2,word:"ROAR",row:5,col:0,direction:"across"},{id:3,word:"KINDER",row:0,col:0,direction:"down"},{id:4,word:"WONDER",row:0,col:3,direction:"down"}  ] },
  { day: 308, words: [  {id:0,word:"EXPECT",row:0,col:0,direction:"across"},{id:1,word:"HAIR",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"EITHER",row:0,col:0,direction:"down"},{id:4,word:"EMERGE",row:0,col:3,direction:"down"}  ] },
  { day: 309, words: [  {id:0,word:"BALLOT",row:0,col:0,direction:"across"},{id:1,word:"TRITE",row:2,col:0,direction:"across"},{id:2,word:"OCEAN",row:4,col:0,direction:"across"},{id:3,word:"BUTTON",row:0,col:0,direction:"down"},{id:4,word:"OCEAN",row:0,col:4,direction:"down"}  ] },
  { day: 310, words: [  {id:0,word:"STOPPED",row:0,col:0,direction:"across"},{id:1,word:"IDEA",row:3,col:0,direction:"across"},{id:2,word:"EASE",row:5,col:0,direction:"across"},{id:3,word:"STRIFE",row:0,col:0,direction:"down"},{id:4,word:"PALACE",row:0,col:3,direction:"down"}  ] },
  { day: 311, words: [  {id:0,word:"CREDIT",row:0,col:0,direction:"across"},{id:1,word:"MEMO",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"COMMIT",row:0,col:0,direction:"down"},{id:4,word:"DEVOUR",row:0,col:3,direction:"down"}  ] },
  { day: 312, words: [  {id:0,word:"JUNGLE",row:0,col:0,direction:"across"},{id:1,word:"GRAVY",row:2,col:0,direction:"across"},{id:2,word:"EQUAL",row:4,col:0,direction:"across"},{id:3,word:"JOGGER",row:0,col:0,direction:"down"},{id:4,word:"LOYAL",row:0,col:4,direction:"down"}  ] },
  { day: 313, words: [  {id:0,word:"RELAXED",row:0,col:0,direction:"across"},{id:1,word:"UNDO",row:3,col:0,direction:"across"},{id:2,word:"NEAR",row:5,col:0,direction:"across"},{id:3,word:"RETURN",row:0,col:0,direction:"down"},{id:4,word:"ARMOUR",row:0,col:3,direction:"down"}  ] },
  { day: 314, words: [  {id:0,word:"PALACE",row:0,col:0,direction:"across"},{id:1,word:"RAIL",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"PARROT",row:0,col:0,direction:"down"},{id:4,word:"ANTLER",row:0,col:3,direction:"down"}  ] },
  { day: 315, words: [  {id:0,word:"VELVET",row:0,col:0,direction:"across"},{id:1,word:"STONE",row:2,col:0,direction:"across"},{id:2,word:"GREAT",row:4,col:0,direction:"across"},{id:3,word:"VISAGE",row:0,col:0,direction:"down"},{id:4,word:"EVENT",row:0,col:4,direction:"down"}  ] },
  { day: 316, words: [  {id:0,word:"BARRIER",row:0,col:0,direction:"across"},{id:1,word:"FEED",row:3,col:0,direction:"across"},{id:2,word:"TIER",row:5,col:0,direction:"across"},{id:3,word:"BUFFET",row:0,col:0,direction:"down"},{id:4,word:"RENDER",row:0,col:3,direction:"down"}  ] },
  { day: 317, words: [  {id:0,word:"CIRCUS",row:0,col:0,direction:"across"},{id:1,word:"DAWN",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"CINDER",row:0,col:0,direction:"down"},{id:4,word:"CRINGE",row:0,col:3,direction:"down"}  ] },
  { day: 318, words: [  {id:0,word:"UNIQUE",row:0,col:0,direction:"across"},{id:1,word:"EXIST",row:2,col:0,direction:"across"},{id:2,word:"ULTRA",row:4,col:0,direction:"across"},{id:3,word:"USEFUL",row:0,col:0,direction:"down"},{id:4,word:"ULTRA",row:0,col:4,direction:"down"}  ] },
  { day: 319, words: [  {id:0,word:"DESERVE",row:0,col:0,direction:"across"},{id:1,word:"INFO",row:3,col:0,direction:"across"},{id:2,word:"EAST",row:5,col:0,direction:"across"},{id:3,word:"DIVIDE",row:0,col:0,direction:"down"},{id:4,word:"EXPORT",row:0,col:3,direction:"down"}  ] },
  { day: 320, words: [  {id:0,word:"MARVEL",row:0,col:0,direction:"across"},{id:1,word:"TAUT",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"MUSTER",row:0,col:0,direction:"down"},{id:4,word:"VIRTUE",row:0,col:3,direction:"down"}  ] },
  { day: 321, words: [  {id:0,word:"FUTURE",row:0,col:0,direction:"across"},{id:1,word:"LOYAL",row:2,col:0,direction:"across"},{id:2,word:"OUTER",row:4,col:0,direction:"across"},{id:3,word:"FOLLOW",row:0,col:0,direction:"down"},{id:4,word:"RULER",row:0,col:4,direction:"down"}  ] },
  { day: 322, words: [  {id:0,word:"WEATHER",row:0,col:0,direction:"across"},{id:1,word:"KING",row:3,col:0,direction:"across"},{id:2,word:"RAVE",row:5,col:0,direction:"across"},{id:3,word:"WICKER",row:0,col:0,direction:"down"},{id:4,word:"TOGGLE",row:0,col:3,direction:"down"}  ] },
  { day: 323, words: [  {id:0,word:"DANGER",row:0,col:0,direction:"across"},{id:1,word:"EYED",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"DEFEAT",row:0,col:0,direction:"down"},{id:4,word:"GLIDER",row:0,col:3,direction:"down"}  ] },
  { day: 324, words: [  {id:0,word:"EMPIRE",row:0,col:0,direction:"across"},{id:1,word:"TRAIN",row:2,col:0,direction:"across"},{id:2,word:"TRASH",row:4,col:0,direction:"across"},{id:3,word:"ENTITY",row:0,col:0,direction:"down"},{id:4,word:"RANCH",row:0,col:4,direction:"down"}  ] },
  { day: 325, words: [  {id:0,word:"GROUNDS",row:0,col:0,direction:"across"},{id:1,word:"MEMO",row:3,col:0,direction:"across"},{id:2,word:"YANK",row:5,col:0,direction:"across"},{id:3,word:"GRUMPY",row:0,col:0,direction:"down"},{id:4,word:"UNLOCK",row:0,col:3,direction:"down"}  ] },
  { day: 326, words: [  {id:0,word:"DEPART",row:0,col:0,direction:"across"},{id:1,word:"FETA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"DIFFER",row:0,col:0,direction:"down"},{id:4,word:"ABLAZE",row:0,col:3,direction:"down"}  ] },
  { day: 327, words: [  {id:0,word:"INDEED",row:0,col:0,direction:"across"},{id:1,word:"PRESS",row:2,col:0,direction:"across"},{id:2,word:"IVORY",row:4,col:0,direction:"across"},{id:3,word:"IMPAIR",row:0,col:0,direction:"down"},{id:4,word:"ESSAY",row:0,col:4,direction:"down"}  ] },
  { day: 328, words: [  {id:0,word:"MAGICAL",row:0,col:0,direction:"across"},{id:1,word:"THOU",row:3,col:0,direction:"across"},{id:2,word:"RAZE",row:5,col:0,direction:"across"},{id:3,word:"MUSTER",row:0,col:0,direction:"down"},{id:4,word:"INDUCE",row:0,col:3,direction:"down"}  ] },
  { day: 329, words: [  {id:0,word:"ASPECT",row:0,col:0,direction:"across"},{id:1,word:"IDEA",row:3,col:0,direction:"across"},{id:2,word:"GRIEVE",row:5,col:0,direction:"across"},{id:3,word:"AILING",row:0,col:0,direction:"down"},{id:4,word:"ESCAPE",row:0,col:3,direction:"down"}  ] },
  { day: 330, words: [  {id:0,word:"EMBARK",row:0,col:0,direction:"across"},{id:1,word:"LEGAL",row:2,col:0,direction:"across"},{id:2,word:"SUNNY",row:4,col:0,direction:"across"},{id:3,word:"ENLIST",row:0,col:0,direction:"down"},{id:4,word:"RALLY",row:0,col:4,direction:"down"}  ] },
  { day: 331, words: [  {id:0,word:"OPINION",row:0,col:0,direction:"across"},{id:1,word:"EXAM",row:3,col:0,direction:"across"},{id:2,word:"TALL",row:5,col:0,direction:"across"},{id:3,word:"OBJECT",row:0,col:0,direction:"down"},{id:4,word:"NORMAL",row:0,col:3,direction:"down"}  ] },
  { day: 332, words: [  {id:0,word:"FLYING",row:0,col:0,direction:"across"},{id:1,word:"TACO",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"FOSTER",row:0,col:0,direction:"down"},{id:4,word:"IMPOSE",row:0,col:3,direction:"down"}  ] },
  { day: 333, words: [  {id:0,word:"INTENT",row:0,col:0,direction:"across"},{id:1,word:"SUPER",row:2,col:0,direction:"across"},{id:2,word:"SLICE",row:4,col:0,direction:"across"},{id:3,word:"INSIST",row:0,col:0,direction:"down"},{id:4,word:"NERVE",row:0,col:4,direction:"down"}  ] },
  { day: 334, words: [  {id:0,word:"DECLARE",row:0,col:0,direction:"across"},{id:1,word:"INCH",row:3,col:0,direction:"across"},{id:2,word:"EVIL",row:5,col:0,direction:"across"},{id:3,word:"DIVIDE",row:0,col:0,direction:"down"},{id:4,word:"LETHAL",row:0,col:3,direction:"down"}  ] },
  { day: 335, words: [  {id:0,word:"HURDLE",row:0,col:0,direction:"across"},{id:1,word:"TEAR",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"HUNTER",row:0,col:0,direction:"down"},{id:4,word:"DECREE",row:0,col:3,direction:"down"}  ] },
  { day: 336, words: [  {id:0,word:"INDUCE",row:0,col:0,direction:"across"},{id:1,word:"SHAKE",row:2,col:0,direction:"across"},{id:2,word:"STOUT",row:4,col:0,direction:"across"},{id:3,word:"INSIST",row:0,col:0,direction:"down"},{id:4,word:"CREST",row:0,col:4,direction:"down"}  ] },
  { day: 337, words: [  {id:0,word:"MANAGED",row:0,col:0,direction:"across"},{id:1,word:"DUPE",row:3,col:0,direction:"across"},{id:2,word:"WILT",row:5,col:0,direction:"across"},{id:3,word:"MEADOW",row:0,col:0,direction:"down"},{id:4,word:"ARREST",row:0,col:3,direction:"down"}  ] },
  { day: 338, words: [  {id:0,word:"WITHER",row:0,col:0,direction:"across"},{id:1,word:"KNOB",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"WICKER",row:0,col:0,direction:"down"},{id:4,word:"HOBBLE",row:0,col:3,direction:"down"}  ] },
  { day: 339, words: [  {id:0,word:"ANSWER",row:0,col:0,direction:"across"},{id:1,word:"CHEST",row:2,col:0,direction:"across"},{id:2,word:"OPERA",row:4,col:0,direction:"across"},{id:3,word:"ANCHOR",row:0,col:0,direction:"down"},{id:4,word:"EXTRA",row:0,col:4,direction:"down"}  ] },
  { day: 340, words: [  {id:0,word:"DISMISS",row:0,col:0,direction:"across"},{id:1,word:"IDLE",row:3,col:0,direction:"across"},{id:2,word:"EASY",row:5,col:0,direction:"across"},{id:3,word:"DIVINE",row:0,col:0,direction:"down"},{id:4,word:"MISERY",row:0,col:3,direction:"down"}  ] },
  { day: 341, words: [  {id:0,word:"VICTIM",row:0,col:0,direction:"across"},{id:1,word:"VAMP",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"VELVET",row:0,col:0,direction:"down"},{id:4,word:"TAMPER",row:0,col:3,direction:"down"}  ] },
  { day: 342, words: [  {id:0,word:"REFORM",row:0,col:0,direction:"across"},{id:1,word:"DEVIL",row:2,col:0,direction:"across"},{id:2,word:"CURLY",row:4,col:0,direction:"across"},{id:3,word:"REDUCE",row:0,col:0,direction:"down"},{id:4,word:"RALLY",row:0,col:4,direction:"down"}  ] },
  { day: 343, words: [  {id:0,word:"FOCUSED",row:0,col:0,direction:"across"},{id:1,word:"DATA",row:3,col:0,direction:"across"},{id:2,word:"EVER",row:5,col:0,direction:"across"},{id:3,word:"FIDDLE",row:0,col:0,direction:"down"},{id:4,word:"UNFAIR",row:0,col:3,direction:"down"}  ] },
  { day: 344, words: [  {id:0,word:"BARELY",row:0,col:0,direction:"across"},{id:1,word:"TACO",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"BITTER",row:0,col:0,direction:"down"},{id:4,word:"ENCODE",row:0,col:3,direction:"down"}  ] },
  { day: 345, words: [  {id:0,word:"REPEAT",row:0,col:0,direction:"across"},{id:1,word:"NIGHT",row:2,col:0,direction:"across"},{id:2,word:"ACTOR",row:4,col:0,direction:"across"},{id:3,word:"RENTAL",row:0,col:0,direction:"down"},{id:4,word:"ACTOR",row:0,col:4,direction:"down"}  ] },
  { day: 346, words: [  {id:0,word:"SELFISH",row:0,col:0,direction:"across"},{id:1,word:"AUNT",row:3,col:0,direction:"across"},{id:2,word:"YEAR",row:5,col:0,direction:"across"},{id:3,word:"STEADY",row:0,col:0,direction:"down"},{id:4,word:"FOSTER",row:0,col:3,direction:"down"}  ] },
  { day: 347, words: [  {id:0,word:"ARTIST",row:0,col:0,direction:"across"},{id:1,word:"ONTO",row:3,col:0,direction:"across"},{id:2,word:"BREEZE",row:5,col:0,direction:"across"},{id:3,word:"ABSORB",row:0,col:0,direction:"down"},{id:4,word:"INCOME",row:0,col:3,direction:"down"}  ] },
  { day: 348, words: [  {id:0,word:"PONDER",row:0,col:0,direction:"across"},{id:1,word:"RIVET",row:2,col:0,direction:"across"},{id:2,word:"ULTRA",row:4,col:0,direction:"across"},{id:3,word:"PURSUE",row:0,col:0,direction:"down"},{id:4,word:"EXTRA",row:0,col:4,direction:"down"}  ] },
  { day: 349, words: [  {id:0,word:"DEVOTED",row:0,col:0,direction:"across"},{id:1,word:"EDGE",row:3,col:0,direction:"across"},{id:2,word:"DEAD",row:5,col:0,direction:"across"},{id:3,word:"DEFEND",row:0,col:0,direction:"down"},{id:4,word:"OFFEND",row:0,col:3,direction:"down"}  ] },
  { day: 350, words: [  {id:0,word:"REDUCE",row:0,col:0,direction:"across"},{id:1,word:"ORCA",row:3,col:0,direction:"across"},{id:2,word:"MIRROR",row:5,col:0,direction:"across"},{id:3,word:"REFORM",row:0,col:0,direction:"down"},{id:4,word:"UNFAIR",row:0,col:3,direction:"down"}  ] },
  { day: 351, words: [  {id:0,word:"PATRON",row:0,col:0,direction:"across"},{id:1,word:"OPTIC",row:2,col:0,direction:"across"},{id:2,word:"INFER",row:4,col:0,direction:"across"},{id:3,word:"PROFIT",row:0,col:0,direction:"down"},{id:4,word:"OCCUR",row:0,col:4,direction:"down"}  ] },
  { day: 352, words: [  {id:0,word:"FLOWING",row:0,col:0,direction:"across"},{id:1,word:"USED",row:3,col:0,direction:"across"},{id:2,word:"EARN",row:5,col:0,direction:"across"},{id:3,word:"FUTURE",row:0,col:0,direction:"down"},{id:4,word:"WARDEN",row:0,col:3,direction:"down"}  ] },
  { day: 353, words: [  {id:0,word:"RETAIN",row:0,col:0,direction:"across"},{id:1,word:"KNOW",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"ROCKET",row:0,col:0,direction:"down"},{id:4,word:"ANSWER",row:0,col:3,direction:"down"}  ] },
  { day: 354, words: [  {id:0,word:"WARDEN",row:0,col:0,direction:"across"},{id:1,word:"CREEP",row:2,col:0,direction:"across"},{id:2,word:"ENJOY",row:4,col:0,direction:"across"},{id:3,word:"WICKER",row:0,col:0,direction:"down"},{id:4,word:"EMPTY",row:0,col:4,direction:"down"}  ] },
  { day: 355, words: [  {id:0,word:"GREATLY",row:0,col:0,direction:"across"},{id:1,word:"EARL",row:3,col:0,direction:"across"},{id:2,word:"NEWT",row:5,col:0,direction:"across"},{id:3,word:"GOVERN",row:0,col:0,direction:"down"},{id:4,word:"ANKLET",row:0,col:3,direction:"down"}  ] },
  { day: 356, words: [  {id:0,word:"BUTTON",row:0,col:0,direction:"across"},{id:1,word:"THOU",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"BUTTER",row:0,col:0,direction:"down"},{id:4,word:"TENURE",row:0,col:3,direction:"down"}  ] },
  { day: 357, words: [  {id:0,word:"HONEST",row:0,col:0,direction:"across"},{id:1,word:"SUGAR",row:2,col:0,direction:"across"},{id:2,word:"LODGE",row:4,col:0,direction:"across"},{id:3,word:"HUSTLE",row:0,col:0,direction:"down"},{id:4,word:"SERVE",row:0,col:4,direction:"down"}  ] },
  { day: 358, words: [  {id:0,word:"WARRANT",row:0,col:0,direction:"across"},{id:1,word:"KNOT",row:3,col:0,direction:"across"},{id:2,word:"DUEL",row:5,col:0,direction:"across"},{id:3,word:"WICKED",row:0,col:0,direction:"down"},{id:4,word:"RENTAL",row:0,col:3,direction:"down"}  ] },
  { day: 359, words: [  {id:0,word:"BUFFET",row:0,col:0,direction:"across"},{id:1,word:"THUD",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"BITTER",row:0,col:0,direction:"down"},{id:4,word:"FIDDLE",row:0,col:3,direction:"down"}  ] },
  { day: 360, words: [  {id:0,word:"MUSSEL",row:0,col:0,direction:"across"},{id:1,word:"ROUTE",row:2,col:0,direction:"across"},{id:2,word:"EMPTY",row:4,col:0,direction:"across"},{id:3,word:"MARVEL",row:0,col:0,direction:"down"},{id:4,word:"ENEMY",row:0,col:4,direction:"down"}  ] },
  { day: 361, words: [  {id:0,word:"NUCLEAR",row:0,col:0,direction:"across"},{id:1,word:"MAZE",row:3,col:0,direction:"across"},{id:2,word:"LEVY",row:5,col:0,direction:"across"},{id:3,word:"NORMAL",row:0,col:0,direction:"down"},{id:4,word:"LIVELY",row:0,col:3,direction:"down"}  ] },
  { day: 362, words: [  {id:0,word:"WANDER",row:0,col:0,direction:"across"},{id:1,word:"MEMO",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"WARMTH",row:0,col:0,direction:"down"},{id:4,word:"DEVOUR",row:0,col:3,direction:"down"}  ] },
  { day: 363, words: [  {id:0,word:"EXCEPT",row:0,col:0,direction:"across"},{id:1,word:"THROW",row:2,col:0,direction:"across"},{id:2,word:"NEVER",row:4,col:0,direction:"across"},{id:3,word:"EXTEND",row:0,col:0,direction:"down"},{id:4,word:"POWER",row:0,col:4,direction:"down"}  ] },
  { day: 364, words: [  {id:0,word:"FREEDOM",row:0,col:0,direction:"across"},{id:1,word:"UNDO",row:3,col:0,direction:"across"},{id:2,word:"EAST",row:5,col:0,direction:"across"},{id:3,word:"FUTURE",row:0,col:0,direction:"down"},{id:4,word:"EXPORT",row:0,col:3,direction:"down"}  ] },
  { day: 365, words: [  {id:0,word:"JOSTLE",row:0,col:0,direction:"across"},{id:1,word:"THOU",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"JESTER",row:0,col:0,direction:"down"},{id:4,word:"TENURE",row:0,col:3,direction:"down"}  ] }
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
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

const ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M"],
];

const C = {
  bg:"#f2ead8", card:"#ede4cc", border:"#b8aa8a", borderDark:"#8a7a5a",
  text:"#1a1408", textMid:"#4a3f28", textLight:"#8a7a5a",
  accent:"#1a1408", accentLt:"#d8ceb0", accentGlow:"#4a3f28",
  green:"#2a5a30", greenLt:"#c8ddb8", greenGlow:"#2a5a30",
  red:"#8a1a1a", redLt:"#e8c8c0", gold:"#b8860b", goldLt:"#fdf0c0",
  cellBg:"#e0d5b8", cellFilled:"#f8f2e0", keyDefault:"#d8ceb0",
};

// ─── CONFETTI ────────────────────────────────────────────────────────────────
function Confetti({ active }) {
  if (!active) return null;
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id:i, x:Math.random()*100, delay:Math.random()*0.7,
    color:["#1a1408","#b8860b","#2a5a30","#4ab870","#f5c842","#6a8fd8"][i%6],
    size:6+Math.random()*9, round:Math.random()>0.5,
  }));
  return (
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:999}}>
      {pieces.map(p=>(
        <div key={p.id} style={{
          position:"absolute",left:`${p.x}%`,top:"-14px",
          width:p.size,height:p.size,borderRadius:p.round?"50%":"2px",
          background:p.color,animation:`cfFall 1.6s ${p.delay}s ease-in forwards`,
        }}/>
      ))}
      <style>{`@keyframes cfFall{0%{transform:translateY(0) rotate(0);}100%{transform:translateY(110vh) rotate(900deg);}}`}</style>
    </div>
  );
}

// ─── BURST ───────────────────────────────────────────────────────────────────
function Burst({ show, emoji, headline, sub, bg }) {
  return (
    <div style={{
      position:"fixed",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
      pointerEvents:"none",zIndex:998,
      opacity:show?1:0,transform:show?"scale(1)":"scale(0.75)",
      transition:"opacity 0.15s, transform 0.15s",
    }}>
      <div style={{
        background:bg||C.accentLt,borderRadius:20,padding:"24px 44px",
        textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,0.18)",
        border:`1.5px solid ${C.borderDark}`,
      }}>
        <div style={{fontSize:48,lineHeight:1,marginBottom:6}}>{emoji}</div>
        <div style={{fontSize:24,fontWeight:"bold",color:C.text,marginBottom:3}}>{headline}</div>
        {sub&&<div style={{fontSize:14,color:C.textMid,fontStyle:"italic"}}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── GRID SILHOUETTE (for share card) ────────────────────────────────────────
function GridSilhouette({ puzzle, revealed }) {
  const cellMap = buildCellMap(puzzle);
  const coords  = Object.keys(cellMap).map(k=>k.split(",").map(Number));
  const maxRow  = Math.max(...coords.map(([r])=>r));
  const maxCol  = Math.max(...coords.map(([,c])=>c));
  const CELL=14, GAP=2;
  return (
    <div style={{
      position:"relative",
      width:(maxCol+1)*(CELL+GAP)-GAP,
      height:(maxRow+1)*(CELL+GAP)-GAP,
      margin:"0 auto",
    }}>
      {Object.entries(cellMap).map(([key])=>{
        const [r,c]=key.split(",").map(Number);
        const isRev = revealed.has(key);
        return (
          <div key={key} style={{
            position:"absolute",
            left:c*(CELL+GAP),top:r*(CELL+GAP),
            width:CELL,height:CELL,borderRadius:2,
            background:isRev?C.gold:C.cellBg,
            border:`1px solid ${isRev?C.gold:C.borderDark}`,
          }}/>
        );
      })}
    </div>
  );
}

// ─── SHARE CARD ──────────────────────────────────────────────────────────────
function ShareCard({ username, mode, level, score, grade, seconds, streak, puzzle, revealed, onClose }) {
  const fmt = s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const todayKey = getTodayKey();
  const gradeEmoji = {A:"🏆",B:"⭐",C:"✅",D:"📖",E:"💪",F:"🎯"};
  const modeLabel = mode==="daily" ? `Daily Challenge — ${todayKey}` : `Level ${level}`;
  const streakLine = mode==="daily" && streak>0 ? `🔥 ${streak} day streak\n` : "";
  const shareText = `🗞 CROSSWORDS\n${username} — ${modeLabel}\nScore: ${score}/100  Grade: ${grade} ${gradeEmoji[grade]||""}\n${streakLine}Time: ${fmt(seconds)}\nPlay at: ${window.location.href}`;

  function share() {
    if (navigator.share) navigator.share({title:"Crosswords",text:shareText}).catch(()=>{});
    else navigator.clipboard.writeText(shareText).then(()=>alert("Copied!"));
  }

  return (
    <div style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,
    }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:C.bg,borderRadius:20,padding:28,textAlign:"center",
        width:300,border:`2px solid ${C.borderDark}`,
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{borderTop:`3px solid ${C.text}`,borderBottom:`3px solid ${C.text}`,padding:"6px 0",marginBottom:16}}>
          <div style={{fontSize:20,fontWeight:"bold",letterSpacing:"0.1em"}}>CROSSWORDS</div>
          <div style={{fontSize:11,color:C.textLight,letterSpacing:"0.2em",textTransform:"uppercase"}}>{modeLabel}</div>
        </div>

        {/* Grid silhouette */}
        <div style={{marginBottom:16,padding:8,background:C.card,borderRadius:10,border:`1px solid ${C.border}`}}>
          <GridSilhouette puzzle={puzzle} revealed={revealed}/>
        </div>

        <div style={{fontSize:13,color:C.textLight,marginBottom:2}}>{username}</div>
        {mode==="daily" && streak>0 && (
          <div style={{fontSize:15,color:C.gold,fontWeight:"bold",marginBottom:6}}>🔥 {streak} day streak</div>
        )}
        <div style={{fontSize:72,fontWeight:"bold",color:C.text,lineHeight:1}}>{grade}</div>
        <div style={{fontSize:13,color:C.textMid,marginTop:4}}>{score}/100 · {fmt(seconds)}</div>

        <button onClick={share} style={{
          marginTop:20,background:C.text,border:"none",borderRadius:10,
          color:C.bg,padding:"12px 32px",fontSize:15,fontWeight:"bold",
          cursor:"pointer",width:"100%",fontFamily:"Georgia,serif",
        }}>Share 📤</button>
        <button onClick={onClose} style={{
          marginTop:8,background:"none",border:`1px solid ${C.border}`,
          borderRadius:10,color:C.textMid,padding:"10px 32px",
          fontSize:13,cursor:"pointer",width:"100%",fontFamily:"Georgia,serif",
        }}>Close</button>
      </div>
    </div>
  );
}

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────
function Leaderboard({ onClose }) {
  const [scores, setScores] = useState(null);
  const [tab,    setTab]    = useState("streak"); // streak | points | level

  useEffect(()=>{
    fetchLeaderboard().then(data=>setScores(data||[]));
  },[]);

  const fmt = s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  // Aggregate per user
  const userMap = {};
  (scores||[]).forEach(s=>{
    if (!userMap[s.username]) userMap[s.username]={username:s.username,streak:0,totalScore:0,count:0,grades:[]};
    const u=userMap[s.username];
    u.totalScore += (s.score||0);
    u.count++;
    u.grades.push(s.score||0);
    if (s.streak>u.streak) u.streak=s.streak;
  });

  const users = Object.values(userMap).map(u=>({
    ...u,
    avgScore: u.grades.length ? Math.round(u.grades.reduce((a,b)=>a+b,0)/u.grades.length) : 0,
    avgGrade: (avg => avg>=90?"A":avg>=75?"B":avg>=60?"C":avg>=45?"D":avg>=25?"E":"F")(
      u.grades.length ? Math.round(u.grades.reduce((a,b)=>a+b,0)/u.grades.length) : 0
    ),
  }));

  const sorted = [...users].sort((a,b)=>{
    if (tab==="streak") return b.streak-a.streak || b.count-a.count;
    if (tab==="points") return b.totalScore-a.totalScore || b.count-a.count;
    return b.avgScore-a.avgScore || b.count-a.count;
  });

  const medalColor = i=>i===0?"#c9a227":i===1?"#9a9a9a":i===2?"#8a5a2a":C.accentLt;
  const medalText  = i=>i<3?"#fff":C.textMid;

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"Georgia,serif",color:C.text,overflowY:"auto"}}>
      <div style={{maxWidth:480,margin:"0 auto",padding:"24px 16px 60px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:C.text}}>←</button>
          <div>
            <div style={{fontSize:10,letterSpacing:"0.3em",color:C.textLight,textTransform:"uppercase"}}>Rankings</div>
            <div style={{fontSize:26,fontWeight:"bold",letterSpacing:"0.08em"}}>LEADERBOARD</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          {[["streak","🔥 Streak"],["points","⭐ Points"],["grade","🎓 Avg Grade"]].map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)} style={{
              flex:1,padding:"9px 4px",borderRadius:8,fontSize:12,fontWeight:"bold",
              background:tab===key?C.text:C.card,
              color:tab===key?C.bg:C.textMid,
              border:`1px solid ${C.border}`,cursor:"pointer",fontFamily:"Georgia,serif",
            }}>{label}</button>
          ))}
        </div>

        {scores===null ? (
          <div style={{textAlign:"center",color:C.textLight,padding:40}}>Loading...</div>
        ) : sorted.length===0 ? (
          <div style={{textAlign:"center",color:C.textLight,padding:40,fontStyle:"italic"}}>No scores yet — be the first!</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {sorted.map((u,i)=>(
              <div key={u.username} style={{
                background:C.card,border:`1px solid ${i<3?C.borderDark:C.border}`,
                borderRadius:10,padding:"12px 16px",
                display:"flex",alignItems:"center",gap:12,
              }}>
                <div style={{
                  width:28,height:28,borderRadius:"50%",
                  background:medalColor(i),display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:12,fontWeight:"bold",color:medalText(i),flexShrink:0,
                }}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:"bold",fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.username}</div>
                  <div style={{fontSize:11,color:C.textLight}}>{u.count} puzzle{u.count!==1?"s":""} completed</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontWeight:"bold",fontSize:18,color:C.text}}>
                    {tab==="streak"?`${u.streak}🔥`:tab==="points"?u.totalScore:`${u.avgGrade} (${u.avgScore})`}
                  </div>
                  <div style={{fontSize:10,color:C.textLight}}>
                    {tab==="streak"?"days":tab==="points"?"total pts":"avg grade"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── HOW TO PLAY MODAL ───────────────────────────────────────────────────────
function HowToPlay({ onClose }) {
  const steps = [
    { emoji:"🗞", title:"What is Crosswords?", body:"A daily word puzzle game. Letters hide inside a crossword grid — your job is to reveal them all by guessing letters one at a time." },
    { emoji:"⌨️", title:"Tap to guess", body:"Tap a letter on the keyboard to select it (it highlights). Tap it again to confirm your guess. Changed your mind? Tap ✕ to deselect." },
    { emoji:"✅", title:"Correct letters", body:"If the letter appears in the grid, all matching cells light up instantly — for free! Completing a word gives you +2 bonus letter guesses." },
    { emoji:"❌", title:"Wrong letters", body:"If the letter is not in the grid, you lose one guess. You start with 5 guesses — use them wisely!" },
    { emoji:"⚡", title:"Cascade effect", body:"Revealing a word can uncover letters shared with other words, triggering a chain reaction. Smart guesses go further!" },
    { emoji:"⏱", title:"Your score", body:"Scores are out of 100 based on how quickly you complete the puzzle. Under 30 seconds = 100 points. Grade A–F is awarded at the end." },
    { emoji:"📰", title:"Daily Challenge", body:"A harder puzzle drops every day. Complete it to build your 🔥 streak. Miss a day and it resets — so come back daily!" },
    { emoji:"🏆", title:"Leaderboard", body:"Scores are saved and ranked publicly. Compete for the highest streak, most total points, or furthest level reached." },
  ];

  return (
    <div style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",
      display:"flex",alignItems:"flex-start",justifyContent:"center",
      zIndex:1000,overflowY:"auto",padding:"24px 16px",
    }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:C.bg,borderRadius:20,padding:"28px 24px",
        width:"100%",maxWidth:400,border:`2px solid ${C.borderDark}`,
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{borderTop:`3px solid ${C.text}`,borderBottom:`3px solid ${C.text}`,padding:"6px 0",marginBottom:24,textAlign:"center"}}>
          <div style={{fontSize:11,letterSpacing:"0.3em",color:C.textLight,textTransform:"uppercase",marginBottom:2}}>Guide</div>
          <div style={{fontSize:22,fontWeight:"bold",letterSpacing:"0.08em"}}>HOW TO PLAY</div>
        </div>

        {/* Steps */}
        <div style={{display:"flex",flexDirection:"column",gap:16,marginBottom:24}}>
          {steps.map((s,i)=>(
            <div key={i} style={{display:"flex",gap:14,alignItems:"flex-start"}}>
              <div style={{fontSize:26,lineHeight:1,flexShrink:0,marginTop:2}}>{s.emoji}</div>
              <div>
                <div style={{fontWeight:"bold",fontSize:14,color:C.text,marginBottom:3}}>{s.title}</div>
                <div style={{fontSize:13,color:C.textMid,lineHeight:1.5}}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Score table */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:"bold",color:C.textMid,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10}}>Score Guide</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px 0",fontSize:12}}>
            {[["Under 30s","100pts","A"],["Under 1min","90pts","A"],["Under 2min","70pts","B"],["Under 4min","50pts","C"],["Under 9min","20pts","E"],["9min+","10pts","F"]].map(([time,pts,grade])=>(
              <div key={time} style={{display:"contents"}}>
                <div style={{color:C.textLight}}>{time}</div>
                <div style={{color:C.textMid,textAlign:"center"}}>{pts}</div>
                <div style={{fontWeight:"bold",color:C.text,textAlign:"right"}}>Grade {grade}</div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={onClose} style={{
          width:"100%",background:C.text,border:"none",borderRadius:10,
          color:C.bg,padding:"14px",fontSize:15,fontWeight:"bold",
          cursor:"pointer",fontFamily:"Georgia,serif",
        }}>Got it — Play Now!</button>
      </div>
    </div>
  );
}

// ─── USERNAME SCREEN ─────────────────────────────────────────────────────────
function UsernameScreen({ onSet }) {
  const [value,    setValue]    = useState("");
  const [error,    setError]    = useState("");
  const [showHow,  setShowHow]  = useState(false);

  async function submit() {
    const name = value.trim();
    if (!name)           { setError("Please enter a username"); return; }
    if (name.length < 2) { setError("At least 2 characters"); return; }
    if (name.length > 20){ setError("Max 20 characters"); return; }
    onSet(name);
  }

  return (
    <div style={{
      minHeight:"100vh",background:C.bg,fontFamily:"Georgia,serif",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      padding:24,overflowY:"auto",
    }}>
      {showHow && <HowToPlay onClose={()=>setShowHow(false)}/>}

      {/* Masthead */}
      <div style={{borderTop:`3px solid ${C.text}`,borderBottom:`3px solid ${C.text}`,padding:"8px 0",marginBottom:6,textAlign:"center",width:"100%",maxWidth:340}}>
        <div style={{fontSize:11,letterSpacing:"0.35em",color:C.textLight,textTransform:"uppercase",marginBottom:4}}>Word Puzzle</div>
        <div style={{fontSize:36,fontWeight:"bold",letterSpacing:"0.1em"}}>CROSSWORDS</div>
      </div>
      <div style={{fontSize:12,color:C.textLight,marginBottom:20,letterSpacing:"0.1em"}}></div>

      {/* Description */}
      <div style={{
        width:"100%",maxWidth:340,background:C.card,
        border:`1px solid ${C.border}`,borderRadius:12,
        padding:"16px 18px",marginBottom:20,
      }}>
        <div style={{fontSize:15,color:C.text,lineHeight:1.6,marginBottom:12}}>
          A crossword puzzle game where you reveal hidden words by guessing letters — one tap at a time.
        </div>
        <div style={{display:"flex",gap:16,fontSize:12,color:C.textLight}}>
          <span>📖 250 levels</span>
          <span>📰 Daily challenge</span>
          <span>🏆 Leaderboard</span>
        </div>
      </div>

      {/* Username input */}
      <div style={{width:"100%",maxWidth:340}}>
        <div style={{fontSize:13,color:C.textMid,marginBottom:10,textAlign:"center"}}>
          Choose a username to track your scores on the leaderboard
        </div>
        <input
          value={value}
          onChange={e=>{setValue(e.target.value);setError("");}}
          onKeyDown={e=>e.key==="Enter"&&submit()}
          placeholder="Your name..."
          maxLength={20}
          autoFocus
          style={{
            width:"100%",background:C.card,border:`1.5px solid ${C.borderDark}`,
            borderRadius:10,padding:"14px 16px",color:C.text,
            fontSize:18,fontFamily:"Georgia,serif",marginBottom:8,
            boxSizing:"border-box",outline:"none",
          }}
        />
        {error&&<div style={{fontSize:13,color:C.red,marginBottom:8,fontStyle:"italic"}}>{error}</div>}
        <button onClick={submit} style={{
          width:"100%",background:C.text,border:"none",borderRadius:10,
          color:C.bg,padding:"14px",fontSize:16,fontWeight:"bold",
          cursor:"pointer",fontFamily:"Georgia,serif",marginBottom:10,
        }}>Play Now →</button>
        <button onClick={()=>setShowHow(true)} style={{
          width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:10,
          color:C.textMid,padding:"11px",fontSize:13,cursor:"pointer",fontFamily:"Georgia,serif",
        }}>❓ How to Play</button>
      </div>
    </div>
  );
}

// ─── HOME SCREEN ─────────────────────────────────────────────────────────────
function HomeScreen({ username, currentLevel, streak, onPlay, onDaily, onLeaderboard, onHowToPlay, onResetProgress, dailyDone }) {
  const todayKey = getTodayKey();
  const d = new Date();
  const dateStr = d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div style={{
      minHeight:"100vh",background:C.bg,fontFamily:"Georgia,serif",color:C.text,
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,
    }}>

      {/* Reset confirmation modal */}
      {confirmReset && (
        <div style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",
          display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:24,
        }}>
          <div style={{
            background:C.bg,borderRadius:16,padding:"28px 24px",textAlign:"center",
            width:"100%",maxWidth:320,border:`2px solid ${C.borderDark}`,
            boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
          }}>
            <div style={{fontSize:32,marginBottom:12}}>↩</div>
            <div style={{fontSize:18,fontWeight:"bold",marginBottom:8}}>Reset Progress?</div>
            <div style={{fontSize:14,color:C.textMid,lineHeight:1.5,marginBottom:24}}>
              This will reset your regular game back to Level 1. Your daily streak and leaderboard scores will not be affected.
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmReset(false)} style={{
                flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:10,
                color:C.textMid,padding:"13px",fontSize:14,cursor:"pointer",fontFamily:"Georgia,serif",
              }}>Cancel</button>
              <button onClick={()=>{ setConfirmReset(false); onResetProgress(); }} style={{
                flex:1,background:C.red,border:"none",borderRadius:10,
                color:"#fff",padding:"13px",fontSize:14,fontWeight:"bold",
                cursor:"pointer",fontFamily:"Georgia,serif",
              }}>Reset</button>
            </div>
          </div>
        </div>
      )}
      <div style={{width:"100%",maxWidth:380}}>
        {/* Masthead */}
        <div style={{borderTop:`3px solid ${C.text}`,borderBottom:`3px solid ${C.text}`,padding:"8px 0",marginBottom:6,textAlign:"center"}}>
          <div style={{fontSize:11,letterSpacing:"0.35em",color:C.textLight,textTransform:"uppercase",marginBottom:4}}>Word Puzzle</div>
          <div style={{fontSize:36,fontWeight:"bold",letterSpacing:"0.1em"}}>CROSSWORDS</div>
        </div>
        <div style={{fontSize:12,color:C.textLight,textAlign:"center",marginBottom:32,fontStyle:"italic"}}>{dateStr}</div>

        {/* Welcome */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:16,textAlign:"center"}}>
          <div style={{fontSize:13,color:C.textLight}}>Welcome back</div>
          <div style={{fontSize:20,fontWeight:"bold"}}>{username}</div>
          {streak>0&&<div style={{fontSize:14,color:C.gold,marginTop:4}}>🔥 {streak} day streak</div>}
          <div style={{fontSize:13,color:C.textLight,marginTop:4}}>Level {currentLevel} / 250</div>
        </div>

        {/* Daily Challenge */}
        <button onClick={onDaily} style={{
          width:"100%",background:dailyDone?C.card:C.text,
          border:`2px solid ${dailyDone?C.border:C.text}`,
          borderRadius:12,padding:"18px 20px",marginBottom:12,
          color:dailyDone?C.textMid:C.bg,textAlign:"left",cursor:"pointer",
          fontFamily:"Georgia,serif",
        }}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase",opacity:0.7,marginBottom:4}}>
                {dailyDone?"✓ Completed":"Today"}
              </div>
              <div style={{fontSize:20,fontWeight:"bold"}}>Daily Challenge</div>
              <div style={{fontSize:12,opacity:0.7,marginTop:2}}>{dateStr}</div>
            </div>
            <div style={{fontSize:32}}>📰</div>
          </div>
        </button>

        {/* Regular Game */}
        <div style={{marginBottom:12}}>
          <button onClick={onPlay} style={{
            width:"100%",background:C.card,border:`1px solid ${C.border}`,
            borderRadius:12,padding:"18px 20px",marginBottom:6,
            color:C.text,textAlign:"left",cursor:"pointer",fontFamily:"Georgia,serif",
          }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase",color:C.textLight,marginBottom:4}}>Continue</div>
                <div style={{fontSize:20,fontWeight:"bold"}}>Regular Game</div>
                <div style={{fontSize:12,color:C.textLight,marginTop:2}}>Level {currentLevel} of 250</div>
              </div>
              <div style={{fontSize:32}}>📖</div>
            </div>
          </button>
          {currentLevel > 1 && (
            <button onClick={()=>setConfirmReset(true)} style={{
              width:"100%",background:"none",border:`1px solid ${C.border}`,
              borderRadius:10,padding:"9px",color:C.textLight,
              cursor:"pointer",fontFamily:"Georgia,serif",fontSize:12,
            }}>↩ Reset progress to Level 1</button>
          )}
        </div>

        {/* Bottom row */}
        <div style={{display:"flex",gap:10}}>
          <button onClick={onLeaderboard} style={{
            flex:1,background:"none",border:`1px solid ${C.border}`,
            borderRadius:12,padding:"14px 10px",
            color:C.textMid,cursor:"pointer",fontFamily:"Georgia,serif",fontSize:14,
          }}>🏆 Leaderboard</button>
          <button onClick={onHowToPlay} style={{
            flex:1,background:"none",border:`1px solid ${C.border}`,
            borderRadius:12,padding:"14px 10px",
            color:C.textMid,cursor:"pointer",fontFamily:"Georgia,serif",fontSize:14,
          }}>❓ How to Play</button>
        </div>
      </div>
    </div>
  );
}

// ─── GAME ────────────────────────────────────────────────────────────────────
function Game({ username, puzzle, mode, level, streak, onComplete, onNext, onBack }) {
  const cellMap = buildCellMap(puzzle);
  const allKeys = Object.keys(cellMap);
  const coords  = allKeys.map(k=>k.split(",").map(Number));
  const maxRow  = Math.max(...coords.map(([r])=>r));
  const maxCol  = Math.max(...coords.map(([,c])=>c));

  const [revealed,       setRevealed]       = useState(new Set());
  const [guessedWords,   setGuessedWords]   = useState(new Set());
  const startingLetters = isDaily ? 5 : level <= 50 ? 6 : level <= 175 ? 5 : 4;
  const [letterLeft,     setLetterLeft]     = useState(startingLetters);
  const [seconds,        setSeconds]        = useState(0);
  const [gameState,      setGameState]      = useState("playing");
  const [selected,       setSelected]       = useState(null);
  const [wrongLetters,   setWrongLetters]   = useState(new Set());
  const [correctLetters, setCorrectLetters] = useState(new Set());
  const [toast,          setToast]          = useState(null);
  const [pulsingCells,   setPulsingCells]   = useState(new Set());
  const [burst,          setBurst]          = useState(null);
  const [confetti,       setConfetti]       = useState(false);
  const [showShare,      setShowShare]      = useState(false);
  const [result,         setResult]         = useState(null);

  useEffect(()=>{
    if (gameState!=="playing") return;
    const t=setInterval(()=>setSeconds(s=>s+1),1000);
    return ()=>clearInterval(t);
  },[gameState]);

  const showToast=(msg,type="info")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2200); };

  const showBurst=useCallback((emoji,headline,sub,bg,withConfetti=false)=>{
    setBurst({emoji,headline,sub,bg});
    if (withConfetti){ setConfetti(true); setTimeout(()=>setConfetti(false),2000); }
    setTimeout(()=>setBurst(null),1600);
  },[]);

  const pulseKeys=keys=>{ setPulsingCells(new Set(keys)); setTimeout(()=>setPulsingCells(new Set()),700); };
  const revealAll=useCallback(()=>setRevealed(new Set(allKeys)),[allKeys]);

  function checkCompletedWords(newRevealed,currentGuessed) {
    return puzzle.words.filter(w=>{
      if (currentGuessed.has(w.id)) return false;
      return Array.from({length:w.word.length},(_,i)=>{
        const r=w.direction==="down"?w.row+i:w.row;
        const c=w.direction==="across"?w.col+i:w.col;
        return newRevealed.has(`${r},${c}`);
      }).every(Boolean);
    });
  }

  const checkWin=useCallback((newGuessed)=>{
    if (newGuessed.size!==puzzle.words.length) return;
    revealAll();
    setGameState("won");
    const score=calcScore(seconds);
    const grade=getGrade(score);
    const res={score,grade,seconds};
    setResult(res);
    // Submit to Supabase
    submitScore({username,mode,level,seconds,score,grade,streak,created_at:new Date().toISOString()});
    onComplete(res);
    setTimeout(()=>showBurst("🏆","Complete!",`${score}/100 — Grade ${grade}`,mode==="daily"?C.goldLt:C.greenLt,true),300);
  },[puzzle.words.length,revealAll,seconds,username,mode,level,streak,onComplete,showBurst]);

  function handleKeyTap(letter) {
    if (gameState!=="playing") return;
    if (wrongLetters.has(letter)||correctLetters.has(letter)){ showToast(`Already tried ${letter}`); return; }
    if (selected===letter){ confirmGuess(letter); setSelected(null); }
    else setSelected(letter);
  }

  function confirmGuess(letter) {
    if (letterLeft<=0){ showToast("No guesses left"); return; }
    const hits=Object.entries(cellMap).filter(([,v])=>v.letter===letter).map(([k])=>k);
    if (hits.length>0) {
      const newRevealed=new Set(revealed);
      hits.forEach(k=>newRevealed.add(k));
      setRevealed(newRevealed);
      pulseKeys(hits);
      setCorrectLetters(prev=>new Set([...prev,letter]));
      const completed=checkCompletedWords(newRevealed,guessedWords);
      if (completed.length>0) {
        const newGuessed=new Set([...guessedWords,...completed.map(w=>w.id)]);
        setGuessedWords(newGuessed);
        const bonus=completed.length*2;
        setLetterLeft(n=>n+bonus);
        const isLast=newGuessed.size===puzzle.words.length;
        if (!isLast) showBurst("🎉",`${completed.map(w=>w.word).join(" & ")}!`,`+${bonus} guesses`,C.greenLt,true);
        setTimeout(()=>checkWin(newGuessed),isLast?0:500);
      } else {
        showBurst("✨",`${letter}!`,`${hits.length} cell${hits.length>1?"s":""} revealed`,C.accentLt);
      }
    } else {
      setWrongLetters(prev=>new Set([...prev,letter]));
      setLetterLeft(prev=>{
        const next=prev-1;
        if (next<=0){ setGameState("lost"); showToast("Out of guesses — try again!","bad"); }
        else showToast(`No ${letter} — ${next} left`,"bad");
        return next;
      });
    }
  }

  const fmt=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const CELL=54,GAP=5;
  const isDaily=mode==="daily";

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"Georgia,serif",color:C.text}}>
      <Confetti active={confetti}/>
      {burst&&<Burst show={!!burst} {...burst}/>}
      {showShare&&result&&(
        <ShareCard
          username={username} mode={mode} level={level}
          score={result.score} grade={result.grade} seconds={result.seconds}
          streak={streak} puzzle={puzzle} revealed={revealed}
          onClose={()=>setShowShare(false)}
        />
      )}

      <style>{`
        @keyframes cellPop{0%{transform:scale(1)}35%{transform:scale(1.2);background:#f8f2d8}100%{transform:scale(1)}}
        @keyframes badShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;}
        button{cursor:pointer;font-family:Georgia,serif;transition:transform 0.1s;}
        button:active{transform:scale(0.96);}
        input:focus{outline:none;}
      `}</style>

      <div style={{maxWidth:500,margin:"0 auto",padding:"16px 12px 48px"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <button onClick={onBack} style={{background:"none",border:"none",fontSize:20,color:C.text}}>←</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:10,letterSpacing:"0.3em",color:C.textLight,textTransform:"uppercase"}}>
              {isDaily?"Daily Challenge":`Level ${level} of 250`}
            </div>
            <div style={{fontSize:22,fontWeight:"bold",letterSpacing:"0.08em",borderBottom:`2px solid ${C.text}`,paddingBottom:2}}>
              CROSSWORDS
            </div>
          </div>
          {isDaily&&<div style={{fontSize:14,color:C.gold}}>🔥{streak}</div>}
          {!isDaily&&<div style={{width:32}}/>}
        </div>

        {/* Stats */}
        <div style={{display:"flex",justifyContent:"space-between",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 16px",marginBottom:12}}>
          {[
            {label:"Time",  val:fmt(seconds), mono:true},
            {label:"Guesses",val:letterLeft},
            {label:"Words",  val:`${guessedWords.size}/${puzzle.words.length}`},
          ].map(({label,val,mono},i,arr)=>(
            <div key={label} style={{textAlign:"center",flex:1,borderRight:i<arr.length-1?`1px solid ${C.border}`:"none"}}>
              <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.1em"}}>{label}</div>
              <div style={{fontSize:18,fontWeight:"bold",fontFamily:mono?"monospace":"inherit"}}>{val}</div>
            </div>
          ))}
        </div>

        {/* Toast */}
        <div style={{
          height:22,textAlign:"center",fontSize:13,fontStyle:"italic",
          color:toast?.type==="bad"?C.red:C.textMid,
          opacity:toast?1:0,transition:"opacity 0.2s",marginBottom:10,
          animation:toast?.type==="bad"?"badShake 0.35s ease":"none",
        }}>{toast?.msg}</div>

        {/* Grid */}
        <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
          <div style={{
            position:"relative",
            width:(maxCol+1)*(CELL+GAP)-GAP,
            height:(maxRow+1)*(CELL+GAP)-GAP,
          }}>
            {puzzle.words.filter(w=>guessedWords.has(w.id)).map(w=>(
              <div key={`hl-${w.id}`} style={{
                position:"absolute",
                left:w.col*(CELL+GAP)-3,top:w.row*(CELL+GAP)-3,
                width:(w.direction==="across"?w.word.length*(CELL+GAP)-GAP:CELL)+6,
                height:(w.direction==="down"?w.word.length*(CELL+GAP)-GAP:CELL)+6,
                borderRadius:12,border:`2.5px solid ${C.greenGlow}`,
                background:"rgba(42,90,48,0.06)",zIndex:0,pointerEvents:"none",
              }}/>
            ))}
            {Object.entries(cellMap).map(([key,{letter}])=>{
              const [r,c]=key.split(",").map(Number);
              const isRev=revealed.has(key);
              const isPop=pulsingCells.has(key);
              return (
                <div key={key} style={{
                  position:"absolute",left:c*(CELL+GAP),top:r*(CELL+GAP),
                  width:CELL,height:CELL,borderRadius:8,
                  background:isRev?C.cellFilled:C.cellBg,
                  border:`2px solid ${isRev?C.accentGlow:C.borderDark}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:isRev?22:13,fontWeight:"bold",
                  color:isRev?C.text:C.borderDark,
                  fontFamily:isRev?"Georgia,serif":"inherit",
                  transition:"background 0.25s, border-color 0.25s",
                  animation:isPop?"cellPop 0.6s ease":"none",
                  userSelect:"none",zIndex:1,
                }}>
                  {isRev?letter:"·"}
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected indicator */}
        {gameState==="playing"&&(
          <div style={{textAlign:"center",marginBottom:10,height:30,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
            {selected?(
              <>
                <div style={{width:30,height:30,borderRadius:7,background:C.text,color:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:"bold"}}>{selected}</div>
                <div style={{fontSize:12,color:C.textMid,fontStyle:"italic"}}>Tap {selected} again to confirm</div>
                <button onClick={()=>setSelected(null)} style={{background:"none",border:"none",color:C.textLight,fontSize:16}}>✕</button>
              </>
            ):(
              <div style={{fontSize:11,color:C.textLight,fontStyle:"italic"}}>Tap a letter to select, tap again to confirm</div>
            )}
          </div>
        )}

        {/* Keyboard */}
        {gameState==="playing"&&(
          <div style={{display:"flex",flexDirection:"column",gap:5,alignItems:"center"}}>
            {ROWS.map((row,ri)=>(
              <div key={ri} style={{display:"flex",gap:4}}>
                {row.map(l=>{
                  const isCorrect=correctLetters.has(l);
                  const isWrong=wrongLetters.has(l);
                  const isUsed=isCorrect||isWrong;
                  const isSel=selected===l;
                  return (
                    <button key={l} onClick={()=>!isUsed&&handleKeyTap(l)} style={{
                      width:32,height:40,borderRadius:6,fontSize:13,fontWeight:"bold",
                      background:isSel?C.text:isCorrect?C.greenLt:isWrong?C.redLt:C.keyDefault,
                      color:isSel?C.bg:isCorrect?C.green:isWrong?C.red:C.text,
                      border:isSel?`2px solid ${C.accentGlow}`:isCorrect?`2px solid ${C.greenGlow}`:isWrong?`2px solid ${C.red}`:`2px solid transparent`,
                      opacity:isUsed&&!isSel?0.6:1,
                      transform:isSel?"scale(1.12)":"scale(1)",
                      transition:"all 0.15s",cursor:isUsed?"default":"pointer",
                    }}>{l}</button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* End screen */}
        {gameState!=="playing"&&(
          <div style={{
            background:gameState==="won"?(isDaily?C.goldLt:C.greenLt):C.redLt,
            border:`1.5px solid ${gameState==="won"?(isDaily?C.gold:C.greenGlow):C.red}`,
            borderRadius:16,padding:"28px 20px",textAlign:"center",
            animation:"fadeUp 0.3s ease",
          }}>
            {gameState==="won"&&result?(
              <>
                <div style={{fontSize:10,letterSpacing:"0.3em",color:isDaily?C.gold:C.green,textTransform:"uppercase",marginBottom:6}}>
                  {isDaily?"Daily Challenge Complete!":"Level Complete!"}
                </div>
                {isDaily&&streak>0&&<div style={{fontSize:16,color:C.gold,fontWeight:"bold",marginBottom:8}}>🔥 {streak} day streak</div>}
                <div style={{fontSize:72,fontWeight:"bold",color:C.text,lineHeight:1}}>{result.grade}</div>
                <div style={{fontSize:22,color:C.text,marginTop:4}}>{result.score}<span style={{fontSize:14,color:C.textLight}}>/100</span></div>
                <div style={{fontSize:13,color:C.textLight,marginTop:2,fontFamily:"monospace"}}>{fmt(result.seconds)}</div>
                <div style={{display:"flex",gap:10,marginTop:20}}>
                  <button onClick={()=>setShowShare(true)} style={{
                    flex:1,background:C.card,border:`1px solid ${C.border}`,
                    borderRadius:10,color:C.text,padding:"12px",fontSize:14,fontWeight:"bold",
                  }}>Share 📤</button>
                  <button onClick={onBack} style={{
                    flex:1,background:C.card,border:`1px solid ${C.border}`,
                    borderRadius:10,color:C.text,padding:"12px",fontSize:14,fontWeight:"bold",
                  }}>{isDaily?"Home 🏠":"Home"}</button>
                </div>
                {!isDaily && (
                  <button onClick={()=>{ onNext(); }} style={{
                    marginTop:10,width:"100%",background:C.text,border:"none",
                    borderRadius:10,color:C.bg,padding:"14px",fontSize:15,fontWeight:"bold",
                  }}>Next Level →</button>
                )}
              </>
            ):(
              <>
                <div style={{fontSize:32,marginBottom:8}}>💀</div>
                <div style={{fontSize:18,fontWeight:"bold",color:C.red,marginBottom:6}}>Out of guesses!</div>
                <div style={{fontSize:13,color:C.textMid,fontStyle:"italic",marginBottom:20}}>Think you know the words? Try again!</div>
                <button onClick={()=>{
                  setRevealed(new Set());setGuessedWords(new Set());setLetterLeft(5);
                  setSeconds(0);setGameState("playing");setSelected(null);
                  setWrongLetters(new Set());setCorrectLetters(new Set());
                  setToast(null);setPulsingCells(new Set());setBurst(null);setConfetti(false);
                }} style={{
                  width:"100%",background:C.text,border:"none",borderRadius:10,
                  color:C.bg,padding:"14px",fontSize:15,fontWeight:"bold",
                }}>Try Again</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ROOT ────────────────────────────────────────────────────────────────────
export default function Crosswords() {
  const [username, setUsername] = useState(()=>localStorage.getItem("cw_username")||"");
  const [screen,   setScreen]   = useState("home");
  const [streak,   setStreak]   = useState(()=>parseInt(localStorage.getItem("cw_streak")||"0"));
  const [currentLevel, setCurrentLevel] = useState(()=>Math.min(Math.max(parseInt(localStorage.getItem("cw_level")||"1"),1),250));
  const [dailyDone,    setDailyDone]    = useState(()=>localStorage.getItem("cw_daily_done")===getTodayKey());
  const [showDailyPrompt, setShowDailyPrompt] = useState(false);
  const [showHowToPlay,   setShowHowToPlay]   = useState(false);

  // On first load after username set, prompt for daily if not done
  useEffect(()=>{
    if (username && !dailyDone && screen==="home") setShowDailyPrompt(true);
  },[username]);

  function handleUsernameSet(name) {
    localStorage.setItem("cw_username",name);
    setUsername(name);
    if (!dailyDone) setShowDailyPrompt(true);
  }

  function handleDailyComplete(result) {
    const todayKey = getTodayKey();
    const lastDay  = localStorage.getItem("cw_last_daily");
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
    const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()+1}-${yesterday.getDate()}`;
    const newStreak = lastDay===yesterdayKey ? streak+1 : 1;
    setStreak(newStreak);
    localStorage.setItem("cw_streak",String(newStreak));
    localStorage.setItem("cw_last_daily",todayKey);
    localStorage.setItem("cw_daily_done",todayKey);
    setDailyDone(true);
  }

  function handleLevelComplete(result) {
    // Don't advance the level yet — wait until player taps Next
    // Just persist so if they leave and come back we do not lose progress
  }

  function handleNextLevel() {
    const next = Math.min(currentLevel+1,250);
    setCurrentLevel(next);
    localStorage.setItem("cw_level",String(next));
    // Stay on game screen — Game component will re-render with new puzzle via key prop
  }

  function handleResetProgress() {
    setCurrentLevel(1);
    localStorage.setItem("cw_level","1");
  }

  if (!username) return <UsernameScreen onSet={handleUsernameSet}/>;

  if (screen==="leaderboard") return <Leaderboard onClose={()=>setScreen("home")}/>;

  if (screen==="daily") {
    const idx = getDailyIndex();
    const dailyPuzzle = DAILY_PUZZLES[idx];
    return (
      <Game
        username={username}
        puzzle={dailyPuzzle}
        mode="daily"
        level={idx+1}
        streak={streak}
        onComplete={handleDailyComplete}
        onBack={()=>setScreen("home")}
      />
    );
  }

  if (screen==="game") {
    const puzzle = PUZZLES[currentLevel-1];
    return (
      <Game
        key={currentLevel}
        username={username}
        puzzle={puzzle}
        mode="regular"
        level={currentLevel}
        streak={streak}
        onComplete={handleLevelComplete}
        onNext={handleNextLevel}
        onBack={()=>setScreen("home")}
      />
    );
  }

  // Home screen
  return (
    <>
      {showHowToPlay && <HowToPlay onClose={()=>setShowHowToPlay(false)}/>}
      <HomeScreen
        username={username}
        currentLevel={currentLevel}
        streak={streak}
        dailyDone={dailyDone}
        onPlay={()=>setScreen("game")}
        onDaily={()=>setScreen("daily")}
        onLeaderboard={()=>setScreen("leaderboard")}
        onHowToPlay={()=>setShowHowToPlay(true)}
        onResetProgress={handleResetProgress}
      />

      {/* Daily prompt overlay */}
      {showDailyPrompt&&(
        <div style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",
          display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:24,
        }}>
          <div style={{
            background:C.bg,borderRadius:20,padding:28,textAlign:"center",
            width:"100%",maxWidth:340,border:`2px solid ${C.borderDark}`,
          }}>
            <div style={{fontSize:36,marginBottom:8}}>📰</div>
            <div style={{fontSize:11,letterSpacing:"0.2em",color:C.textLight,textTransform:"uppercase",marginBottom:4}}>Ready?</div>
            <div style={{fontSize:22,fontWeight:"bold",marginBottom:8}}>Daily Challenge</div>
            <div style={{fontSize:14,color:C.textMid,marginBottom:24}}>
              A new harder puzzle every day. Complete it to build your streak!
            </div>
            {streak>0&&<div style={{fontSize:15,color:C.gold,fontWeight:"bold",marginBottom:16}}>🔥 Current streak: {streak} days</div>}
            <button onClick={()=>{setShowDailyPrompt(false);setScreen("daily");}} style={{
              width:"100%",background:C.text,border:"none",borderRadius:10,
              color:C.bg,padding:"14px",fontSize:16,fontWeight:"bold",
              cursor:"pointer",fontFamily:"Georgia,serif",marginBottom:10,
            }}>Play Daily Challenge</button>
            <button onClick={()=>setShowDailyPrompt(false)} style={{
              width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:10,
              color:C.textMid,padding:"12px",fontSize:14,cursor:"pointer",fontFamily:"Georgia,serif",
            }}>Maybe Later</button>
          </div>
        </div>
      )}
    </>
  );
}
