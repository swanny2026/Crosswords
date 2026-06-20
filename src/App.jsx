import { useState, useEffect, useRef, useCallback } from "react";

// ─── HAPTICS ─────────────────────────────────────────────────────────────────
function hapticLight() {
  try { if (window.navigator.vibrate) window.navigator.vibrate(10); } catch(e) {}
}
function hapticMedium() {
  try { if (window.navigator.vibrate) window.navigator.vibrate(25); } catch(e) {}
}
function hapticHeavy() {
  try { if (window.navigator.vibrate) window.navigator.vibrate([30,20,30]); } catch(e) {}
}
function hapticError() {
  try { if (window.navigator.vibrate) window.navigator.vibrate([50,30,50]); } catch(e) {}
}
let sharedAC = null;

function getAudioContext() {
  try {
    if (!sharedAC) {
      sharedAC = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (sharedAC.state === 'suspended') {
      sharedAC.resume();
    }
    return sharedAC;
  } catch(e) { return null; }
}

// Unlock audio on first tap anywhere
if (typeof window !== 'undefined') {
  const unlock = () => { getAudioContext(); document.removeEventListener('touchstart', unlock); document.removeEventListener('click', unlock); };
  document.addEventListener('touchstart', unlock, {once: true});
  document.addEventListener('click', unlock, {once: true});
}

function playTone(ac, freq, start, duration, type='sine', gain=0.3) {
  try {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.connect(g);
    g.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime + start);
    g.gain.setValueAtTime(0, ac.currentTime + start);
    g.gain.linearRampToValueAtTime(gain, ac.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + start + duration);
    osc.start(ac.currentTime + start);
    osc.stop(ac.currentTime + start + duration + 0.1);
  } catch(e) {}
}

function soundCorrectLetter() {
  const ac = getAudioContext();
  if (!ac) return;
  playTone(ac, 660, 0,    0.06, 'sine', 0.2);
  playTone(ac, 880, 0.05, 0.1,  'sine', 0.15);
}

function soundCompletion() {
  const ac = getAudioContext();
  if (!ac) return;
  playTone(ac, 880,  0,    0.1,  'sine', 0.4);
  playTone(ac, 1108, 0.08, 0.15, 'sine', 0.35);
  playTone(ac, 1318, 0.18, 0.4,  'sine', 0.3);
  playTone(ac, 1760, 0.18, 0.3,  'sine', 0.15);
}

// ─── SUPABASE ────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://pprypxcjbeeuagfsfnwe.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcnlweGNqYmVldWFnZnNmbndlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MDc5NTAsImV4cCI6MjA5Njk4Mzk1MH0.lERWI7-Ce5Zf-Y2v2LqoWYNfMJa3b9AXEqQruwpF3TA";

async function dbRequest(method, path, body, extraHeaders={}) {
  try {
    const prefer = method === "POST" ? "return=representation,resolution=merge-duplicates" 
                 : method === "PATCH" ? "return=representation"
                 : "";
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        ...(prefer ? {"Prefer": prefer} : {}),
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) console.error("DB error:", res.status, text);
    return text ? JSON.parse(text) : null;
  } catch(e) { console.error("DB request failed:", e); return null; }
}

async function submitScore(data) {
  return dbRequest("POST", "scores", data);
}

async function fetchLeaderboard() {
  return dbRequest("GET", "scores?select=username,mode,level,seconds,score,streak,created_at&order=created_at.desc&limit=500");
}

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
const VAPID_PUBLIC = "BPAsAy_RLyfS3nhaesjqoAksdbXhIpkqr5P-VPQEjNjsr6IOwEEv8lDaN0rIG9mucfTgiCAf5snd0XfDDXcZW7E";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function subscribeToPush(username) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
    await dbRequest("POST", "subscriptions", { username, subscription: sub.toJSON() });
    return true;
  } catch (e) {
    console.error("Push subscription failed:", e);
    return false;
  }
}

async function requestPushPermission(username) {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") {
    return subscribeToPush(username);
  }
  if (Notification.permission === "denied") return false;
  const permission = await Notification.requestPermission();
  if (permission === "granted") return subscribeToPush(username);
  return false;
}

// Returns "taken" | "yours" | "free"
async function checkUsername(username, deviceId) {
  const rows = await dbRequest("GET", `players?username=eq.${encodeURIComponent(username)}&select=device_id,pin`);
  if (!rows || rows.length === 0) return "free";
  if (rows[0].device_id === deviceId) return "yours";
  if (rows[0].device_id === "pre-existing") return "yours";
  return { status: "taken", hasPin: !!rows[0].pin };
}

async function verifyPin(username, pin) {
  const rows = await dbRequest("GET", `players?username=eq.${encodeURIComponent(username)}&select=device_id,pin`);
  if (!rows || rows.length === 0) return false;
  return rows[0].pin === pin;
}

async function updateDeviceId(username, deviceId) {
  return dbRequest("PATCH", `players?username=eq.${encodeURIComponent(username)}`, { device_id: deviceId });
}

async function savePin(username, pin) {
  return dbRequest("PATCH", `players?username=eq.${encodeURIComponent(username)}`, { pin });
}

async function registerUsername(username, deviceId) {
  return dbRequest("POST", "players", { username, device_id: deviceId, level: 1, streak: 0 });
}

// ─── COOKIE-BASED DEVICE ID ──────────────────────────────────────────────────
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

function setCookie(name, value, days=365*5) {
  const expires = new Date(Date.now() + days*24*60*60*1000).toUTCString();
  document.cookie = `${name}=${value};expires=${expires};path=/;SameSite=Lax`;
}

function getDeviceId() {
  // Try cookie first (survives bookmark deletion)
  let id = getCookie("cw_device_id");
  if (!id) {
    // Fall back to localStorage for existing users
    id = localStorage.getItem("cw_device_id");
  }
  if (!id) {
    id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  // Always save to both cookie and localStorage
  setCookie("cw_device_id", id);
  localStorage.setItem("cw_device_id", id);
  return id;
}

// ─── SUPABASE PROGRESS SYNC ──────────────────────────────────────────────────
async function saveProgressToCloud(username, level, streak, lastDaily, dailyDone) {
  if (!username) return;
  try {
    const deviceId = getDeviceId();
    await fetch(`${SUPABASE_URL}/rest/v1/players`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        username,
        device_id: deviceId,
        level: level || 1,
        streak: streak || 0,
        last_daily: lastDaily || null,
        daily_done: dailyDone || null,
      }),
    });
  } catch(e) {}
}

async function loadProgressFromCloud(username) {
  try {
    // Get highest level from scores
    const scores = await dbRequest("GET", 
      `scores?username=eq.${encodeURIComponent(username)}&select=level,streak,mode&order=created_at.desc&limit=100`
    );
    if (!scores || scores.length === 0) return null;
    
    // Get highest regular game level
    const regularScores = scores.filter(s => s.mode === "regular");
    const maxLevel = regularScores.length > 0 
      ? Math.max(...regularScores.map(s => parseInt(s.level)||1)) + 1
      : 1;
    
    // Get highest streak
    const maxStreak = Math.max(...scores.map(s => parseInt(s.streak)||0));
    
    return {
      level: Math.min(maxLevel, 250),
      streak: maxStreak,
    };
  } catch(e) { return null; }
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

// URL-based progress restore: ?restore=username,level,streak
function checkRestoreParam() {
  try {
    const params = new URLSearchParams(window.location.search);
    const restore = params.get("restore");
    if (!restore) return;
    const [username, level, streak] = restore.split(",");
    if (username) localStorage.setItem("cw_username", username);
    if (level) localStorage.setItem("cw_level", level);
    if (streak) localStorage.setItem("cw_streak", streak);
    // Clean URL
    window.history.replaceState({}, "", window.location.pathname);
  } catch(e) {}
}
checkRestoreParam();

// ─── PUZZLES ─────────────────────────────────────────────────────────────────
const PUZZLES = [
{ level: 1, words: [   {id:0,word:"HEDGE",row:0,col:0,direction:"across"},{id:1,word:"IDEAL",row:2,col:0,direction:"across"},{id:2,word:"TASTE",row:4,col:0,direction:"across"},{id:3,word:"HEIST",row:0,col:0,direction:"down"},{id:4,word:"DRESS",row:0,col:2,direction:"down"}   ] },
  { level: 2, words: [   {id:0,word:"INCOME",row:0,col:0,direction:"across"},{id:1,word:"EAST",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"INVEST",row:0,col:0,direction:"down"},{id:4,word:"OYSTER",row:0,col:3,direction:"down"}   ] },
  { level: 3, words: [   {id:0,word:"STORAGE",row:0,col:0,direction:"across"},{id:1,word:"INTRO",row:2,col:0,direction:"across"},{id:2,word:"TENSE",row:4,col:0,direction:"across"},{id:3,word:"SWIFT",row:0,col:0,direction:"down"},{id:4,word:"OFTEN",row:0,col:2,direction:"down"}   ] },
  { level: 4, words: [   {id:0,word:"CHALK",row:0,col:0,direction:"across"},{id:1,word:"INTRO",row:2,col:0,direction:"across"},{id:2,word:"ERROR",row:4,col:0,direction:"across"},{id:3,word:"CRIME",row:0,col:0,direction:"down"},{id:4,word:"ACTOR",row:0,col:2,direction:"down"}   ] },
  { level: 5, words: [ {id:0,word:"CLOSE",row:0,col:0,direction:"across"},{id:1,word:"VOTER",row:2,col:0,direction:"across"},{id:2,word:"RENEW",row:4,col:0,direction:"across"},{id:3,word:"COVER",row:0,col:0,direction:"down"},{id:4,word:"OFTEN",row:0,col:2,direction:"down"} ] },
  { level: 6, words: [   {id:0,word:"LOYAL",row:0,col:0,direction:"across"},{id:1,word:"COURT",row:2,col:0,direction:"across"},{id:2,word:"LIGHT",row:4,col:0,direction:"across"},{id:3,word:"LOCAL",row:0,col:0,direction:"down"},{id:4,word:"YOUNG",row:0,col:2,direction:"down"}   ] },
  { level: 7, words: [   {id:0,word:"STATION",row:0,col:0,direction:"across"},{id:1,word:"MOOD",row:3,col:0,direction:"across"},{id:2,word:"TIER",row:5,col:0,direction:"across"},{id:3,word:"SUBMIT",row:0,col:0,direction:"down"},{id:4,word:"TENDER",row:0,col:3,direction:"down"}   ] },
  { level: 8, words: [ {id:0,word:"TRACE",row:0,col:0,direction:"across"},{id:1,word:"RETRY",row:2,col:0,direction:"across"},{id:2,word:"WORRY",row:4,col:0,direction:"across"},{id:3,word:"THREW",row:0,col:0,direction:"down"},{id:4,word:"ACTOR",row:0,col:2,direction:"down"} ] },
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
  { level: 19, words: [ {id:0,word:"COVER",row:0,col:0,direction:"across"},{id:1,word:"ARGUE",row:2,col:0,direction:"across"},{id:2,word:"SPEED",row:4,col:0,direction:"across"},{id:3,word:"CHAOS",row:0,col:0,direction:"down"},{id:4,word:"VAGUE",row:0,col:2,direction:"down"} ] },
  { level: 20, words: [   {id:0,word:"PROFILE",row:0,col:0,direction:"across"},{id:1,word:"CORD",row:3,col:0,direction:"across"},{id:2,word:"LANE",row:5,col:0,direction:"across"},{id:3,word:"PENCIL",row:0,col:0,direction:"down"},{id:4,word:"FIDDLE",row:0,col:3,direction:"down"}   ] },
  { level: 21, words: [ {id:0,word:"EQUIP",row:0,col:0,direction:"across"},{id:1,word:"IMAGE",row:2,col:0,direction:"across"},{id:2,word:"TREND",row:4,col:0,direction:"across"},{id:3,word:"EXIST",row:0,col:0,direction:"down"},{id:4,word:"USAGE",row:0,col:2,direction:"down"} ] },
  { level: 22, words: [   {id:0,word:"ACCENT",row:0,col:0,direction:"across"},{id:1,word:"INCH",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"ARTIST",row:0,col:0,direction:"down"},{id:4,word:"EITHER",row:0,col:3,direction:"down"}   ] },
  { level: 23, words: [   {id:0,word:"DEVOUR",row:0,col:0,direction:"across"},{id:1,word:"VISIT",row:2,col:0,direction:"across"},{id:2,word:"DONOR",row:4,col:0,direction:"across"},{id:3,word:"DIVIDE",row:0,col:0,direction:"down"},{id:4,word:"UTTER",row:0,col:4,direction:"down"}   ] },
  { level: 24, words: [   {id:0,word:"REQUIRE",row:0,col:0,direction:"across"},{id:1,word:"PRESS",row:2,col:0,direction:"across"},{id:2,word:"LAYER",row:4,col:0,direction:"across"},{id:3,word:"REPEL",row:0,col:0,direction:"down"},{id:4,word:"QUERY",row:0,col:2,direction:"down"}   ] },
  { level: 25, words: [ {id:0,word:"MOUSE",row:0,col:0,direction:"across"},{id:1,word:"STIFF",row:2,col:0,direction:"across"},{id:2,word:"CANDY",row:4,col:0,direction:"across"},{id:3,word:"MUSIC",row:0,col:0,direction:"down"},{id:4,word:"UNION",row:0,col:2,direction:"down"} ] },
  { level: 26, words: [   {id:0,word:"BREATH",row:0,col:0,direction:"across"},{id:1,word:"KNOW",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"BASKET",row:0,col:0,direction:"down"},{id:4,word:"ANSWER",row:0,col:3,direction:"down"}   ] },
  { level: 27, words: [   {id:0,word:"BRANCH",row:0,col:0,direction:"across"},{id:1,word:"TOMB",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"BETTER",row:0,col:0,direction:"down"},{id:4,word:"NIMBLE",row:0,col:3,direction:"down"}   ] },
  { level: 28, words: [   {id:0,word:"CONTAIN",row:0,col:0,direction:"across"},{id:1,word:"ARROW",row:2,col:0,direction:"across"},{id:2,word:"ENEMY",row:4,col:0,direction:"across"},{id:3,word:"CHASE",row:0,col:0,direction:"down"},{id:4,word:"NERVE",row:0,col:2,direction:"down"}   ] },
  { level: 29, words: [   {id:0,word:"PURPOSE",row:0,col:0,direction:"across"},{id:1,word:"REEF",row:3,col:0,direction:"across"},{id:2,word:"LEFT",row:5,col:0,direction:"across"},{id:3,word:"PETROL",row:0,col:0,direction:"down"},{id:4,word:"PROFIT",row:0,col:3,direction:"down"}   ] },
  { level: 30, words: [ {id:0,word:"BURST",row:0,col:0,direction:"across"},{id:1,word:"ACUTE",row:2,col:0,direction:"across"},{id:2,word:"DREAM",row:4,col:0,direction:"across"},{id:3,word:"BOARD",row:0,col:0,direction:"down"},{id:4,word:"ROUTE",row:0,col:2,direction:"down"} ] },
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
  { level: 41, words: [ {id:0,word:"CYCLE",row:0,col:0,direction:"across"},{id:1,word:"BLEAK",row:2,col:0,direction:"across"},{id:2,word:"NINJA",row:4,col:0,direction:"across"},{id:3,word:"CABIN",row:0,col:0,direction:"down"},{id:4,word:"CLEAN",row:0,col:2,direction:"down"} ] },
  { level: 42, words: [   {id:0,word:"NAIVE",row:0,col:0,direction:"across"},{id:1,word:"VAPOR",row:2,col:0,direction:"across"},{id:2,word:"LATCH",row:4,col:0,direction:"across"},{id:3,word:"NOVEL",row:0,col:0,direction:"down"},{id:4,word:"INPUT",row:0,col:2,direction:"down"}   ] },
  { level: 43, words: [   {id:0,word:"FORCE",row:0,col:0,direction:"across"},{id:1,word:"UPPER",row:2,col:0,direction:"across"},{id:2,word:"ELDER",row:4,col:0,direction:"across"},{id:3,word:"FLUTE",row:0,col:0,direction:"down"},{id:4,word:"RAPID",row:0,col:2,direction:"down"}   ] },
  { level: 44, words: [   {id:0,word:"FLIGHT",row:0,col:0,direction:"across"},{id:1,word:"TREND",row:2,col:0,direction:"across"},{id:2,word:"OZONE",row:4,col:0,direction:"across"},{id:3,word:"FATHOM",row:0,col:0,direction:"down"},{id:4,word:"HEDGE",row:0,col:4,direction:"down"}   ] },
  { level: 45, words: [   {id:0,word:"PROCEED",row:0,col:0,direction:"across"},{id:1,word:"THOU",row:3,col:0,direction:"across"},{id:2,word:"NOON",row:5,col:0,direction:"across"},{id:3,word:"PISTON",row:0,col:0,direction:"down"},{id:4,word:"COLUMN",row:0,col:3,direction:"down"}   ] },
  { level: 46, words: [ {id:0,word:"NEVER",row:0,col:0,direction:"across"},{id:1,word:"ISSUE",row:2,col:0,direction:"across"},{id:2,word:"EXTRA",row:4,col:0,direction:"across"},{id:3,word:"NOISE",row:0,col:0,direction:"down"},{id:4,word:"VISIT",row:0,col:2,direction:"down"} ] },
  { level: 47, words: [   {id:0,word:"GRUMPY",row:0,col:0,direction:"across"},{id:1,word:"IDEAL",row:2,col:0,direction:"across"},{id:2,word:"ERROR",row:4,col:0,direction:"across"},{id:3,word:"GLIDER",row:0,col:0,direction:"down"},{id:4,word:"POLAR",row:0,col:4,direction:"down"}   ] },
  { level: 48, words: [ {id:0,word:"GREEN",row:0,col:0,direction:"across"},{id:1,word:"OLIVE",row:2,col:0,direction:"across"},{id:2,word:"SCENE",row:4,col:0,direction:"across"},{id:3,word:"GLOSS",row:0,col:0,direction:"down"},{id:4,word:"ELITE",row:0,col:2,direction:"down"} ] },
  { level: 49, words: [   {id:0,word:"POTTER",row:0,col:0,direction:"across"},{id:1,word:"RAID",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"PARROT",row:0,col:0,direction:"down"},{id:4,word:"TENDER",row:0,col:3,direction:"down"}   ] },
  { level: 50, words: [   {id:0,word:"ECLIPSE",row:0,col:0,direction:"across"},{id:1,word:"ONCE",row:3,col:0,direction:"across"},{id:2,word:"TUFT",row:5,col:0,direction:"across"},{id:3,word:"EFFORT",row:0,col:0,direction:"down"},{id:4,word:"INVEST",row:0,col:3,direction:"down"}   ] },
  { level: 51, words: [   {id:0,word:"MOUNT",row:0,col:0,direction:"across"},{id:1,word:"DISCO",row:2,col:0,direction:"across"},{id:2,word:"LATCH",row:4,col:0,direction:"across"},{id:3,word:"MODEL",row:0,col:0,direction:"down"},{id:4,word:"UPSET",row:0,col:2,direction:"down"}   ] },
  { level: 52, words: [   {id:0,word:"STRIFE",row:0,col:0,direction:"across"},{id:1,word:"LANCE",row:2,col:0,direction:"across"},{id:2,word:"CRUSH",row:4,col:0,direction:"across"},{id:3,word:"SELECT",row:0,col:0,direction:"down"},{id:4,word:"FRESH",row:0,col:4,direction:"down"}   ] },
  { level: 53, words: [   {id:0,word:"MURDER",row:0,col:0,direction:"across"},{id:1,word:"SUPER",row:2,col:0,direction:"across"},{id:2,word:"RULER",row:4,col:0,direction:"across"},{id:3,word:"MISERY",row:0,col:0,direction:"down"},{id:4,word:"ERROR",row:0,col:4,direction:"down"}   ] },
  { level: 54, words: [ {id:0,word:"TENSE",row:0,col:0,direction:"across"},{id:1,word:"MORAL",row:2,col:0,direction:"across"},{id:2,word:"OPERA",row:4,col:0,direction:"across"},{id:3,word:"TEMPO",row:0,col:0,direction:"down"},{id:4,word:"NURSE",row:0,col:2,direction:"down"} ] },
  { level: 55, words: [ {id:0,word:"STEAL",row:0,col:0,direction:"across"},{id:1,word:"EXTRA",row:2,col:0,direction:"across"},{id:2,word:"LEARN",row:4,col:0,direction:"across"},{id:3,word:"SPELL",row:0,col:0,direction:"down"},{id:4,word:"EXTRA",row:0,col:2,direction:"down"} ] },
  { level: 56, words: [   {id:0,word:"LONELY",row:0,col:0,direction:"across"},{id:1,word:"INCH",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"LAVISH",row:0,col:0,direction:"down"},{id:4,word:"EITHER",row:0,col:3,direction:"down"}   ] },
  { level: 57, words: [ {id:0,word:"EXIST",row:0,col:0,direction:"across"},{id:1,word:"INURE",row:2,col:0,direction:"across"},{id:2,word:"ENEMY",row:4,col:0,direction:"across"},{id:3,word:"ELITE",row:0,col:0,direction:"down"},{id:4,word:"INURE",row:0,col:2,direction:"down"} ] },
  { level: 58, words: [   {id:0,word:"SIMILAR",row:0,col:0,direction:"across"},{id:1,word:"ONSET",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"STONE",row:0,col:0,direction:"down"},{id:4,word:"MISER",row:0,col:2,direction:"down"}   ] },
  { level: 59, words: [ {id:0,word:"DANCE",row:0,col:0,direction:"across"},{id:1,word:"NIGHT",row:2,col:0,direction:"across"},{id:2,word:"RETRY",row:4,col:0,direction:"across"},{id:3,word:"DONOR",row:0,col:0,direction:"down"},{id:4,word:"NIGHT",row:0,col:2,direction:"down"} ] },
  { level: 60, words: [   {id:0,word:"STATUS",row:0,col:0,direction:"across"},{id:1,word:"ROAM",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"SECRET",row:0,col:0,direction:"down"},{id:4,word:"TREMOR",row:0,col:3,direction:"down"}   ] },
  { level: 61, words: [ {id:0,word:"GREET",row:0,col:0,direction:"across"},{id:1,word:"EAGLE",row:2,col:0,direction:"across"},{id:2,word:"TREAT",row:4,col:0,direction:"across"},{id:3,word:"GREAT",row:0,col:0,direction:"down"},{id:4,word:"EAGLE",row:0,col:2,direction:"down"} ] },
  { level: 62, words: [   {id:0,word:"DELIVER",row:0,col:0,direction:"across"},{id:1,word:"ALSO",row:3,col:0,direction:"across"},{id:2,word:"EMIT",row:5,col:0,direction:"across"},{id:3,word:"DAMAGE",row:0,col:0,direction:"down"},{id:4,word:"IMPORT",row:0,col:3,direction:"down"}   ] },
  { level: 63, words: [ {id:0,word:"MAPLE",row:0,col:0,direction:"across"},{id:1,word:"GUISE",row:2,col:0,direction:"across"},{id:2,word:"CHEAP",row:4,col:0,direction:"across"},{id:3,word:"MAGIC",row:0,col:0,direction:"down"},{id:4,word:"PRIZE",row:0,col:2,direction:"down"} ] },
  { level: 64, words: [   {id:0,word:"BLEND",row:0,col:0,direction:"across"},{id:1,word:"AGAIN",row:2,col:0,direction:"across"},{id:2,word:"DREAM",row:4,col:0,direction:"across"},{id:3,word:"BRAND",row:0,col:0,direction:"down"},{id:4,word:"EVADE",row:0,col:2,direction:"down"}   ] },
  { level: 65, words: [   {id:0,word:"HAPPEN",row:0,col:0,direction:"across"},{id:1,word:"THEN",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"HUNTER",row:0,col:0,direction:"down"},{id:4,word:"PLUNGE",row:0,col:3,direction:"down"}   ] },
  { level: 66, words: [ {id:0,word:"JUDGE",row:0,col:0,direction:"across"},{id:1,word:"WOULD",row:2,col:0,direction:"across"},{id:2,word:"LATCH",row:4,col:0,direction:"across"},{id:3,word:"JEWEL",row:0,col:0,direction:"down"},{id:4,word:"DOUBT",row:0,col:2,direction:"down"} ] },
  { level: 67, words: [ {id:0,word:"OTHER",row:0,col:0,direction:"across"},{id:1,word:"ESSAY",row:2,col:0,direction:"across"},{id:2,word:"ADEPT",row:4,col:0,direction:"across"},{id:3,word:"OPERA",row:0,col:0,direction:"down"},{id:4,word:"HASTE",row:0,col:2,direction:"down"} ] },
  { level: 68, words: [   {id:0,word:"SEGMENT",row:0,col:0,direction:"across"},{id:1,word:"OZONE",row:2,col:0,direction:"across"},{id:2,word:"TASTE",row:4,col:0,direction:"across"},{id:3,word:"SPORT",row:0,col:0,direction:"down"},{id:4,word:"GLOSS",row:0,col:2,direction:"down"}   ] },
  { level: 69, words: [ {id:0,word:"TENTH",row:0,col:0,direction:"across"},{id:1,word:"SEVEN",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"TASTE",row:0,col:0,direction:"down"},{id:4,word:"NEVER",row:0,col:2,direction:"down"} ] },
  { level: 70, words: [   {id:0,word:"SUBMIT",row:0,col:0,direction:"across"},{id:1,word:"UNIT",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"SLOUCH",row:0,col:0,direction:"down"},{id:4,word:"MUSTER",row:0,col:3,direction:"down"}   ] },
  { level: 71, words: [   {id:0,word:"FOREST",row:0,col:0,direction:"across"},{id:1,word:"LANCE",row:2,col:0,direction:"across"},{id:2,word:"OZONE",row:4,col:0,direction:"across"},{id:3,word:"FOLLOW",row:0,col:0,direction:"down"},{id:4,word:"SCENE",row:0,col:4,direction:"down"}   ] },
  { level: 72, words: [   {id:0,word:"EVIDENT",row:0,col:0,direction:"across"},{id:1,word:"UPPER",row:2,col:0,direction:"across"},{id:2,word:"LOYAL",row:4,col:0,direction:"across"},{id:3,word:"EQUAL",row:0,col:0,direction:"down"},{id:4,word:"IMPLY",row:0,col:2,direction:"down"}   ] },
  { level: 73, words: [ {id:0,word:"CLIMB",row:0,col:0,direction:"across"},{id:1,word:"AWFUL",row:2,col:0,direction:"across"},{id:2,word:"HARSH",row:4,col:0,direction:"across"},{id:3,word:"CRASH",row:0,col:0,direction:"down"},{id:4,word:"INFER",row:0,col:2,direction:"down"} ] },
  { level: 74, words: [   {id:0,word:"LESSEN",row:0,col:0,direction:"across"},{id:1,word:"YOUNG",row:2,col:0,direction:"across"},{id:2,word:"USAGE",row:4,col:0,direction:"across"},{id:3,word:"LAYOUT",row:0,col:0,direction:"down"},{id:4,word:"EAGLE",row:0,col:4,direction:"down"}   ] },
  { level: 75, words: [   {id:0,word:"COLUMN",row:0,col:0,direction:"across"},{id:1,word:"TUNA",row:3,col:0,direction:"across"},{id:2,word:"MIRROR",row:5,col:0,direction:"across"},{id:3,word:"CUSTOM",row:0,col:0,direction:"down"},{id:4,word:"UNFAIR",row:0,col:3,direction:"down"}   ] },
  { level: 76, words: [   {id:0,word:"OZONE",row:0,col:0,direction:"across"},{id:1,word:"SHIFT",row:2,col:0,direction:"across"},{id:2,word:"THEFT",row:4,col:0,direction:"across"},{id:3,word:"ONSET",row:0,col:0,direction:"down"},{id:4,word:"OLIVE",row:0,col:2,direction:"down"}   ] },
  { level: 77, words: [   {id:0,word:"BLESS",row:0,col:0,direction:"across"},{id:1,word:"EVENT",row:2,col:0,direction:"across"},{id:2,word:"DITCH",row:4,col:0,direction:"across"},{id:3,word:"BLEND",row:0,col:0,direction:"down"},{id:4,word:"EVENT",row:0,col:2,direction:"down"}   ] },
  { level: 78, words: [   {id:0,word:"FANTASY",row:0,col:0,direction:"across"},{id:1,word:"FIGHT",row:2,col:0,direction:"across"},{id:2,word:"HOTEL",row:4,col:0,direction:"across"},{id:3,word:"FIFTH",row:0,col:0,direction:"down"},{id:4,word:"NIGHT",row:0,col:2,direction:"down"}   ] },
  { level: 79, words: [   {id:0,word:"GIVEN",row:0,col:0,direction:"across"},{id:1,word:"ACTOR",row:2,col:0,direction:"across"},{id:2,word:"SURGE",row:4,col:0,direction:"across"},{id:3,word:"GLASS",row:0,col:0,direction:"down"},{id:4,word:"VOTER",row:0,col:2,direction:"down"}   ] },
  { level: 80, words: [ {id:0,word:"INTRO",row:0,col:0,direction:"across"},{id:1,word:"SLIDE",row:2,col:0,direction:"across"},{id:2,word:"ELECT",row:4,col:0,direction:"across"},{id:3,word:"ISSUE",row:0,col:0,direction:"down"},{id:4,word:"TRITE",row:0,col:2,direction:"down"} ] },
  { level: 81, words: [   {id:0,word:"SUFFER",row:0,col:0,direction:"across"},{id:1,word:"LANCE",row:2,col:0,direction:"across"},{id:2,word:"ANGRY",row:4,col:0,direction:"across"},{id:3,word:"SULTAN",row:0,col:0,direction:"down"},{id:4,word:"ENEMY",row:0,col:4,direction:"down"}   ] },
  { level: 82, words: [   {id:0,word:"COMFORT",row:0,col:0,direction:"across"},{id:1,word:"ANGRY",row:2,col:0,direction:"across"},{id:2,word:"MATCH",row:4,col:0,direction:"across"},{id:3,word:"CHARM",row:0,col:0,direction:"down"},{id:4,word:"MIGHT",row:0,col:2,direction:"down"}   ] },
  { level: 83, words: [   {id:0,word:"RESCUE",row:0,col:0,direction:"across"},{id:1,word:"DEED",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"RENDER",row:0,col:0,direction:"down"},{id:4,word:"CANDLE",row:0,col:3,direction:"down"}   ] },
  { level: 84, words: [   {id:0,word:"BLAND",row:0,col:0,direction:"across"},{id:1,word:"OLIVE",row:2,col:0,direction:"across"},{id:2,word:"DREAD",row:4,col:0,direction:"across"},{id:3,word:"BROOD",row:0,col:0,direction:"down"},{id:4,word:"ASIDE",row:0,col:2,direction:"down"}   ] },
  { level: 85, words: [   {id:0,word:"CARRY",row:0,col:0,direction:"across"},{id:1,word:"ONSET",row:2,col:0,direction:"across"},{id:2,word:"HINGE",row:4,col:0,direction:"across"},{id:3,word:"CLOTH",row:0,col:0,direction:"down"},{id:4,word:"RESIN",row:0,col:2,direction:"down"}   ] },
  { level: 86, words: [   {id:0,word:"MAGIC",row:0,col:0,direction:"across"},{id:1,word:"DRESS",row:2,col:0,direction:"across"},{id:2,word:"LODGE",row:4,col:0,direction:"across"},{id:3,word:"MODEL",row:0,col:0,direction:"down"},{id:4,word:"GREED",row:0,col:2,direction:"down"}   ] },
  { level: 87, words: [   {id:0,word:"COURAGE",row:0,col:0,direction:"across"},{id:1,word:"ASIDE",row:2,col:0,direction:"across"},{id:2,word:"SUNNY",row:4,col:0,direction:"across"},{id:3,word:"CLASS",row:0,col:0,direction:"down"},{id:4,word:"UNION",row:0,col:2,direction:"down"}   ] },
  { level: 88, words: [ {id:0,word:"WATCH",row:0,col:0,direction:"across"},{id:1,word:"RALLY",row:2,col:0,direction:"across"},{id:2,word:"DEPTH",row:4,col:0,direction:"across"},{id:3,word:"WORLD",row:0,col:0,direction:"down"},{id:4,word:"TULIP",row:0,col:2,direction:"down"} ] },
  { level: 89, words: [   {id:0,word:"UNUSUAL",row:0,col:0,direction:"across"},{id:1,word:"PATCH",row:2,col:0,direction:"across"},{id:2,word:"RELAY",row:4,col:0,direction:"across"},{id:3,word:"UPPER",row:0,col:0,direction:"down"},{id:4,word:"UNTIL",row:0,col:2,direction:"down"}   ] },
  { level: 90, words: [   {id:0,word:"MISSING",row:0,col:0,direction:"across"},{id:1,word:"ICON",row:3,col:0,direction:"across"},{id:2,word:"EVIL",row:5,col:0,direction:"across"},{id:3,word:"MOTIVE",row:0,col:0,direction:"down"},{id:4,word:"SIGNAL",row:0,col:3,direction:"down"}   ] },
  { level: 91, words: [ {id:0,word:"CHILD",row:0,col:0,direction:"across"},{id:1,word:"OUTER",row:2,col:0,direction:"across"},{id:2,word:"DIRTY",row:4,col:0,direction:"across"},{id:3,word:"CLOUD",row:0,col:0,direction:"down"},{id:4,word:"INTER",row:0,col:2,direction:"down"} ] },
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
  { level: 158, words: [ {id:0,word:"TROUT",row:0,col:0,direction:"across"},{id:1,word:"ENTER",row:2,col:0,direction:"across"},{id:2,word:"DANCE",row:4,col:0,direction:"across"},{id:3,word:"TREND",row:0,col:0,direction:"down"},{id:4,word:"OFTEN",row:0,col:2,direction:"down"} ] },
  { level: 159, words: [   {id:0,word:"CAVERN",row:0,col:0,direction:"across"},{id:1,word:"NIGHT",row:2,col:0,direction:"across"},{id:2,word:"PENNY",row:4,col:0,direction:"across"},{id:3,word:"CANOPY",row:0,col:0,direction:"down"},{id:4,word:"RETRY",row:0,col:4,direction:"down"}   ] },
  { level: 160, words: [   {id:0,word:"BRONZE",row:0,col:0,direction:"across"},{id:1,word:"FOCUS",row:2,col:0,direction:"across"},{id:2,word:"EVERY",row:4,col:0,direction:"across"},{id:3,word:"BUFFER",row:0,col:0,direction:"down"},{id:4,word:"ZESTY",row:0,col:4,direction:"down"}   ] },
  { level: 161, words: [ {id:0,word:"PIZZA",row:0,col:0,direction:"across"},{id:1,word:"ISSUE",row:2,col:0,direction:"across"},{id:2,word:"KAYAK",row:4,col:0,direction:"across"},{id:3,word:"PRICK",row:0,col:0,direction:"down"},{id:4,word:"ZESTY",row:0,col:2,direction:"down"} ] },
  { level: 162, words: [  {id:0,word:"EXACT",row:0,col:0,direction:"across"},{id:1,word:"RAMEN",row:2,col:0,direction:"across"},{id:2,word:"RIDER",row:4,col:0,direction:"across"},{id:3,word:"ERROR",row:0,col:0,direction:"down"},{id:4,word:"ARMED",row:0,col:2,direction:"down"}  ] },
  { level: 163, words: [ {id:0,word:"DRESS",row:0,col:0,direction:"across"},{id:1,word:"IDEAL",row:2,col:0,direction:"across"},{id:2,word:"KAYAK",row:4,col:0,direction:"across"},{id:3,word:"DRINK",row:0,col:0,direction:"down"},{id:4,word:"EVERY",row:0,col:2,direction:"down"} ] },
  { level: 164, words: [ {id:0,word:"GUARD",row:0,col:0,direction:"across"},{id:1,word:"ABOUT",row:2,col:0,direction:"across"},{id:2,word:"EXTRA",row:4,col:0,direction:"across"},{id:3,word:"GRATE",row:0,col:0,direction:"down"},{id:4,word:"ABOUT",row:0,col:2,direction:"down"} ] },
  { level: 165, words: [   {id:0,word:"GLITCH",row:0,col:0,direction:"across"},{id:1,word:"AGILE",row:2,col:0,direction:"across"},{id:2,word:"ELDER",row:4,col:0,direction:"across"},{id:3,word:"GRAVEL",row:0,col:0,direction:"down"},{id:4,word:"CHEER",row:0,col:4,direction:"down"}   ] },
  { level: 166, words: [ {id:0,word:"AHEAD",row:0,col:0,direction:"across"},{id:1,word:"OFTEN",row:2,col:0,direction:"across"},{id:2,word:"EVADE",row:4,col:0,direction:"across"},{id:3,word:"AWOKE",row:0,col:0,direction:"down"},{id:4,word:"EXTRA",row:0,col:2,direction:"down"} ] },
  { level: 167, words: [   {id:0,word:"PAPAL",row:0,col:0,direction:"across"},{id:1,word:"DEATH",row:2,col:0,direction:"across"},{id:2,word:"LUNCH",row:4,col:0,direction:"across"},{id:3,word:"PEDAL",row:0,col:0,direction:"down"},{id:4,word:"PLAIN",row:0,col:2,direction:"down"}   ] },
  { level: 168, words: [ {id:0,word:"ASIDE",row:0,col:0,direction:"across"},{id:1,word:"GROAN",row:2,col:0,direction:"across"},{id:2,word:"LOYAL",row:4,col:0,direction:"across"},{id:3,word:"ANGEL",row:0,col:0,direction:"down"},{id:4,word:"IVORY",row:0,col:2,direction:"down"} ] },
  { level: 169, words: [   {id:0,word:"REWARD",row:0,col:0,direction:"across"},{id:1,word:"OGRE",row:3,col:0,direction:"across"},{id:2,word:"MIRROR",row:5,col:0,direction:"across"},{id:3,word:"REFORM",row:0,col:0,direction:"down"},{id:4,word:"APPEAR",row:0,col:3,direction:"down"}   ] },
  { level: 170, words: [   {id:0,word:"UNRULY",row:0,col:0,direction:"across"},{id:1,word:"IVORY",row:2,col:0,direction:"across"},{id:2,word:"UNTIL",row:4,col:0,direction:"across"},{id:3,word:"UNIQUE",row:0,col:0,direction:"down"},{id:4,word:"LOYAL",row:0,col:4,direction:"down"}   ] },
  { level: 171, words: [   {id:0,word:"TIMBER",row:0,col:0,direction:"across"},{id:1,word:"TEND",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"TEETER",row:0,col:0,direction:"down"},{id:4,word:"BUNDLE",row:0,col:3,direction:"down"}   ] },
  { level: 172, words: [ {id:0,word:"DISCO",row:0,col:0,direction:"across"},{id:1,word:"NOISE",row:2,col:0,direction:"across"},{id:2,word:"RULER",row:4,col:0,direction:"across"},{id:3,word:"DONOR",row:0,col:0,direction:"down"},{id:4,word:"SWIRL",row:0,col:2,direction:"down"} ] },
  { level: 173, words: [   {id:0,word:"SERVANT",row:0,col:0,direction:"across"},{id:1,word:"ENDS",row:3,col:0,direction:"across"},{id:2,word:"NAIL",row:5,col:0,direction:"across"},{id:3,word:"SOLEMN",row:0,col:0,direction:"down"},{id:4,word:"VESSEL",row:0,col:3,direction:"down"}   ] },
  { level: 174, words: [   {id:0,word:"LEGAL",row:0,col:0,direction:"across"},{id:1,word:"VIOLA",row:2,col:0,direction:"across"},{id:2,word:"RELAY",row:4,col:0,direction:"across"},{id:3,word:"LIVER",row:0,col:0,direction:"down"},{id:4,word:"GROWL",row:0,col:2,direction:"down"}   ] },
  { level: 175, words: [ {id:0,word:"THEFT",row:0,col:0,direction:"across"},{id:1,word:"RAINY",row:2,col:0,direction:"across"},{id:2,word:"WHERE",row:4,col:0,direction:"across"},{id:3,word:"THREW",row:0,col:0,direction:"down"},{id:4,word:"ELITE",row:0,col:2,direction:"down"} ] },
  { level: 176, words: [   {id:0,word:"RIDDLE",row:0,col:0,direction:"across"},{id:1,word:"COBRA",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"RACKET",row:0,col:0,direction:"down"},{id:4,word:"LEASH",row:0,col:4,direction:"down"}   ] },
  { level: 177, words: [   {id:0,word:"REFLECT",row:0,col:0,direction:"across"},{id:1,word:"UNDO",row:3,col:0,direction:"across"},{id:2,word:"TAUT",row:5,col:0,direction:"across"},{id:3,word:"RESULT",row:0,col:0,direction:"down"},{id:4,word:"LAYOUT",row:0,col:3,direction:"down"}   ] },
  { level: 178, words: [   {id:0,word:"CRINGE",row:0,col:0,direction:"across"},{id:1,word:"RABBI",row:2,col:0,direction:"across"},{id:2,word:"USAGE",row:4,col:0,direction:"across"},{id:3,word:"CIRCUS",row:0,col:0,direction:"down"},{id:4,word:"GUIDE",row:0,col:4,direction:"down"}   ] },
  { level: 179, words: [  {id:0,word:"THERMAL",row:0,col:0,direction:"across"},{id:1,word:"GRACE",row:2,col:0,direction:"across"},{id:2,word:"LEERY",row:4,col:0,direction:"across"},{id:3,word:"TOGGLE",row:0,col:0,direction:"down"},{id:4,word:"EVADE",row:0,col:2,direction:"down"}  ] },
  { level: 180, words: [   {id:0,word:"HUSTLE",row:0,col:0,direction:"across"},{id:1,word:"TANG",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"HUNTER",row:0,col:0,direction:"down"},{id:4,word:"TOGGLE",row:0,col:3,direction:"down"}   ] },
  { level: 181, words: [  {id:0,word:"CLARIFY",row:0,col:0,direction:"across"},{id:1,word:"SHED",row:3,col:0,direction:"across"},{id:2,word:"ROAR",row:5,col:0,direction:"across"},{id:3,word:"CENSOR",row:0,col:0,direction:"down"},{id:4,word:"RENDER",row:0,col:3,direction:"down"}  ] },
  { level: 182, words: [   {id:0,word:"DEFEAT",row:0,col:0,direction:"across"},{id:1,word:"GLOB",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"DAGGER",row:0,col:0,direction:"down"},{id:4,word:"ENABLE",row:0,col:3,direction:"down"}   ] },
  { level: 183, words: [   {id:0,word:"HARBOUR",row:0,col:0,direction:"across"},{id:1,word:"TECH",row:3,col:0,direction:"across"},{id:2,word:"REAP",row:5,col:0,direction:"across"},{id:3,word:"HUNTER",row:0,col:0,direction:"down"},{id:4,word:"BISHOP",row:0,col:3,direction:"down"}   ] },
  { level: 184, words: [ {id:0,word:"FAINT",row:0,col:0,direction:"across"},{id:1,word:"ACTOR",row:2,col:0,direction:"across"},{id:2,word:"EARLY",row:4,col:0,direction:"across"},{id:3,word:"FLAME",row:0,col:0,direction:"down"},{id:4,word:"INTER",row:0,col:2,direction:"down"} ] },
  { level: 185, words: [ {id:0,word:"RALLY",row:0,col:0,direction:"across"},{id:1,word:"SEVEN",row:2,col:0,direction:"across"},{id:2,word:"NORTH",row:4,col:0,direction:"across"},{id:3,word:"RESIN",row:0,col:0,direction:"down"},{id:4,word:"LOVER",row:0,col:2,direction:"down"} ] },
  { level: 186, words: [ {id:0,word:"FANCY",row:0,col:0,direction:"across"},{id:1,word:"RANCH",row:2,col:0,direction:"across"},{id:2,word:"TRAMP",row:4,col:0,direction:"across"},{id:3,word:"FIRST",row:0,col:0,direction:"down"},{id:4,word:"NINJA",row:0,col:2,direction:"down"} ] },
  { level: 187, words: [   {id:0,word:"EMBRACE",row:0,col:0,direction:"across"},{id:1,word:"EYED",row:3,col:0,direction:"across"},{id:2,word:"DRUM",row:5,col:0,direction:"across"},{id:3,word:"EXTEND",row:0,col:0,direction:"down"},{id:4,word:"RANDOM",row:0,col:3,direction:"down"}   ] },
  { level: 188, words: [ {id:0,word:"BREAK",row:0,col:0,direction:"across"},{id:1,word:"INDEX",row:2,col:0,direction:"across"},{id:2,word:"FERAL",row:4,col:0,direction:"across"},{id:3,word:"BRIEF",row:0,col:0,direction:"down"},{id:4,word:"ELDER",row:0,col:2,direction:"down"} ] },
  { level: 189, words: [ {id:0,word:"PULSE",row:0,col:0,direction:"across"},{id:1,word:"ISSUE",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"PRICE",row:0,col:0,direction:"down"},{id:4,word:"LASER",row:0,col:2,direction:"down"} ] },
  { level: 190, words: [   {id:0,word:"SUPPLY",row:0,col:0,direction:"across"},{id:1,word:"ORCA",row:3,col:0,direction:"across"},{id:2,word:"GRIEVE",row:5,col:0,direction:"across"},{id:3,word:"STRONG",row:0,col:0,direction:"down"},{id:4,word:"PIRATE",row:0,col:3,direction:"down"}   ] },
  { level: 191, words: [ {id:0,word:"SERVE",row:0,col:0,direction:"across"},{id:1,word:"ROMAN",row:2,col:0,direction:"across"},{id:2,word:"PANIC",row:4,col:0,direction:"across"},{id:3,word:"STRAP",row:0,col:0,direction:"down"},{id:4,word:"ROMAN",row:0,col:2,direction:"down"} ] },
  { level: 192, words: [   {id:0,word:"ARREST",row:0,col:0,direction:"across"},{id:1,word:"WEAR",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"ANSWER",row:0,col:0,direction:"down"},{id:4,word:"EMERGE",row:0,col:3,direction:"down"}   ] },
  { level: 193, words: [   {id:0,word:"CREST",row:0,col:0,direction:"across"},{id:1,word:"ADEPT",row:2,col:0,direction:"across"},{id:2,word:"HOTEL",row:4,col:0,direction:"across"},{id:3,word:"CRASH",row:0,col:0,direction:"down"},{id:4,word:"EVENT",row:0,col:2,direction:"down"}   ] },
  { level: 194, words: [   {id:0,word:"TROUBLE",row:0,col:0,direction:"across"},{id:1,word:"PUFF",row:3,col:0,direction:"across"},{id:2,word:"EARL",row:5,col:0,direction:"across"},{id:3,word:"TEMPLE",row:0,col:0,direction:"down"},{id:4,word:"USEFUL",row:0,col:3,direction:"down"}   ] },
  { level: 195, words: [   {id:0,word:"BEGAN",row:0,col:0,direction:"across"},{id:1,word:"DYING",row:2,col:0,direction:"across"},{id:2,word:"ENEMY",row:4,col:0,direction:"across"},{id:3,word:"BADGE",row:0,col:0,direction:"down"},{id:4,word:"GLIDE",row:0,col:2,direction:"down"}   ] },
  { level: 196, words: [ {id:0,word:"ARISE",row:0,col:0,direction:"across"},{id:1,word:"INTRO",row:2,col:0,direction:"across"},{id:2,word:"EARLY",row:4,col:0,direction:"across"},{id:3,word:"AGILE",row:0,col:0,direction:"down"},{id:4,word:"INTER",row:0,col:2,direction:"down"} ] },
  { level: 197, words: [ {id:0,word:"GLOBE",row:0,col:0,direction:"across"},{id:1,word:"ONSET",row:2,col:0,direction:"across"},{id:2,word:"ENTER",row:4,col:0,direction:"across"},{id:3,word:"GROVE",row:0,col:0,direction:"down"},{id:4,word:"ONSET",row:0,col:2,direction:"down"} ] },
  { level: 198, words: [   {id:0,word:"RELATE",row:0,col:0,direction:"across"},{id:1,word:"INFO",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"RADISH",row:0,col:0,direction:"down"},{id:4,word:"ARMOUR",row:0,col:3,direction:"down"}   ] },
  { level: 199, words: [ {id:0,word:"THORN",row:0,col:0,direction:"across"},{id:1,word:"INTRO",row:2,col:0,direction:"across"},{id:2,word:"DIRTY",row:4,col:0,direction:"across"},{id:3,word:"TRIED",row:0,col:0,direction:"down"},{id:4,word:"OUTER",row:0,col:2,direction:"down"} ] },
  { level: 200, words: [ {id:0,word:"SKILL",row:0,col:0,direction:"across"},{id:1,word:"EMPTY",row:2,col:0,direction:"across"},{id:2,word:"LATCH",row:4,col:0,direction:"across"},{id:3,word:"SPELL",row:0,col:0,direction:"down"},{id:4,word:"INPUT",row:0,col:2,direction:"down"} ] },
  { level: 201, words: [   {id:0,word:"ADVANCE",row:0,col:0,direction:"across"},{id:1,word:"UNDO",row:3,col:0,direction:"across"},{id:2,word:"NERD",row:5,col:0,direction:"across"},{id:3,word:"AUBURN",row:0,col:0,direction:"down"},{id:4,word:"ACCORD",row:0,col:3,direction:"down"}   ] },
  { level: 202, words: [ {id:0,word:"SLOSH",row:0,col:0,direction:"across"},{id:1,word:"AHEAD",row:2,col:0,direction:"across"},{id:2,word:"DEATH",row:4,col:0,direction:"across"},{id:3,word:"STAND",row:0,col:0,direction:"down"},{id:4,word:"OPERA",row:0,col:2,direction:"down"} ] },
  { level: 203, words: [   {id:0,word:"SETTING",row:0,col:0,direction:"across"},{id:1,word:"TOMB",row:3,col:0,direction:"across"},{id:2,word:"CUBE",row:5,col:0,direction:"across"},{id:3,word:"STATIC",row:0,col:0,direction:"down"},{id:4,word:"TUMBLE",row:0,col:3,direction:"down"}   ] },
  { level: 204, words: [ {id:0,word:"COBRA",row:0,col:0,direction:"across"},{id:1,word:"AWOKE",row:2,col:0,direction:"across"},{id:2,word:"HEDGE",row:4,col:0,direction:"across"},{id:3,word:"COACH",row:0,col:0,direction:"down"},{id:4,word:"BLOOD",row:0,col:2,direction:"down"} ] },
  { level: 205, words: [   {id:0,word:"DISTURB",row:0,col:0,direction:"across"},{id:1,word:"AUNT",row:3,col:0,direction:"across"},{id:2,word:"TIER",row:5,col:0,direction:"across"},{id:3,word:"DEPART",row:0,col:0,direction:"down"},{id:4,word:"TEETER",row:0,col:3,direction:"down"}   ] },
  { level: 206, words: [   {id:0,word:"STANZA",row:0,col:0,direction:"across"},{id:1,word:"GRASS",row:2,col:0,direction:"across"},{id:2,word:"ANGRY",row:4,col:0,direction:"across"},{id:3,word:"SIGNAL",row:0,col:0,direction:"down"},{id:4,word:"ZESTY",row:0,col:4,direction:"down"}   ] },
  { level: 207, words: [   {id:0,word:"GROVEL",row:0,col:0,direction:"across"},{id:1,word:"YOUNG",row:2,col:0,direction:"across"},{id:2,word:"EXIST",row:4,col:0,direction:"across"},{id:3,word:"GEYSER",row:0,col:0,direction:"down"},{id:4,word:"EIGHT",row:0,col:4,direction:"down"}   ] },
  { level: 208, words: [   {id:0,word:"MAJOR",row:0,col:0,direction:"across"},{id:1,word:"TAUNT",row:2,col:0,direction:"across"},{id:2,word:"RETRY",row:4,col:0,direction:"across"},{id:3,word:"MOTOR",row:0,col:0,direction:"down"},{id:4,word:"JOUST",row:0,col:2,direction:"down"}   ] },
  { level: 209, words: [   {id:0,word:"TAMPER",row:0,col:0,direction:"across"},{id:1,word:"RIVET",row:2,col:0,direction:"across"},{id:2,word:"STEER",row:4,col:0,direction:"across"},{id:3,word:"THRASH",row:0,col:0,direction:"down"},{id:4,word:"ENTER",row:0,col:4,direction:"down"}   ] },
  { level: 210, words: [   {id:0,word:"COBALT",row:0,col:0,direction:"across"},{id:1,word:"BRAND",row:2,col:0,direction:"across"},{id:2,word:"ELITE",row:4,col:0,direction:"across"},{id:3,word:"COBWEB",row:0,col:0,direction:"down"},{id:4,word:"LODGE",row:0,col:4,direction:"down"}   ] },
  { level: 211, words: [   {id:0,word:"INTENDS",row:0,col:0,direction:"across"},{id:1,word:"ALSO",row:3,col:0,direction:"across"},{id:2,word:"RIOT",row:5,col:0,direction:"across"},{id:3,word:"IMPAIR",row:0,col:0,direction:"down"},{id:4,word:"EFFORT",row:0,col:3,direction:"down"}   ] },
  { level: 212, words: [ {id:0,word:"HEIST",row:0,col:0,direction:"across"},{id:1,word:"BRAVE",row:2,col:0,direction:"across"},{id:2,word:"THEFT",row:4,col:0,direction:"across"},{id:3,word:"HABIT",row:0,col:0,direction:"down"},{id:4,word:"IMAGE",row:0,col:2,direction:"down"} ] },
  { level: 213, words: [   {id:0,word:"PROTEST",row:0,col:0,direction:"across"},{id:1,word:"RING",row:3,col:0,direction:"across"},{id:2,word:"LOBE",row:5,col:0,direction:"across"},{id:3,word:"PETROL",row:0,col:0,direction:"down"},{id:4,word:"TOGGLE",row:0,col:3,direction:"down"}   ] },
  { level: 214, words: [   {id:0,word:"COMPLY",row:0,col:0,direction:"across"},{id:1,word:"SAGA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"CENSOR",row:0,col:0,direction:"down"},{id:4,word:"PALACE",row:0,col:3,direction:"down"}   ] },
  { level: 215, words: [   {id:0,word:"ROBUST",row:0,col:0,direction:"across"},{id:1,word:"PAPAL",row:2,col:0,direction:"across"},{id:2,word:"ADMIT",row:4,col:0,direction:"across"},{id:3,word:"REPEAT",row:0,col:0,direction:"down"},{id:4,word:"SPLIT",row:0,col:4,direction:"down"}   ] },
  { level: 216, words: [   {id:0,word:"ASSIGN",row:0,col:0,direction:"across"},{id:1,word:"IDEA",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"ARTIST",row:0,col:0,direction:"down"},{id:4,word:"IMPAIR",row:0,col:3,direction:"down"}   ] },
  { level: 217, words: [   {id:0,word:"DEMAND",row:0,col:0,direction:"across"},{id:1,word:"OGRE",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"DEVOUR",row:0,col:0,direction:"down"},{id:4,word:"ADHERE",row:0,col:3,direction:"down"}   ] },
  { level: 218, words: [   {id:0,word:"PREVIEW",row:0,col:0,direction:"across"},{id:1,word:"MULL",row:3,col:0,direction:"across"},{id:2,word:"TWIT",row:5,col:0,direction:"across"},{id:3,word:"PERMIT",row:0,col:0,direction:"down"},{id:4,word:"VIOLET",row:0,col:3,direction:"down"}   ] },
  { level: 219, words: [   {id:0,word:"REALITY",row:0,col:0,direction:"across"},{id:1,word:"EARS",row:3,col:0,direction:"across"},{id:2,word:"LIEN",row:5,col:0,direction:"across"},{id:3,word:"REVEAL",row:0,col:0,direction:"down"},{id:4,word:"LESSON",row:0,col:3,direction:"down"}   ] },
  { level: 220, words: [   {id:0,word:"INJURED",row:0,col:0,direction:"across"},{id:1,word:"DOUBT",row:2,col:0,direction:"across"},{id:2,word:"ENTER",row:4,col:0,direction:"across"},{id:3,word:"INDIE",row:0,col:0,direction:"down"},{id:4,word:"JOUST",row:0,col:2,direction:"down"}   ] },
  { level: 221, words: [ {id:0,word:"WORSE",row:0,col:0,direction:"across"},{id:1,word:"STUFF",row:2,col:0,direction:"across"},{id:2,word:"ENEMY",row:4,col:0,direction:"across"},{id:3,word:"WASTE",row:0,col:0,direction:"down"},{id:4,word:"ROUTE",row:0,col:2,direction:"down"} ] },
  { level: 222, words: [   {id:0,word:"JUGGLE",row:0,col:0,direction:"across"},{id:1,word:"TUBE",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"JESTER",row:0,col:0,direction:"down"},{id:4,word:"GRIEVE",row:0,col:3,direction:"down"}   ] },
  { level: 223, words: [   {id:0,word:"CLUSTER",row:0,col:0,direction:"across"},{id:1,word:"POND",row:3,col:0,direction:"across"},{id:2,word:"YORE",row:5,col:0,direction:"across"},{id:3,word:"COMPLY",row:0,col:0,direction:"down"},{id:4,word:"SUBDUE",row:0,col:3,direction:"down"}   ] },
  { level: 224, words: [   {id:0,word:"FLATTEN",row:0,col:0,direction:"across"},{id:1,word:"ZERO",row:3,col:0,direction:"across"},{id:2,word:"EARN",row:5,col:0,direction:"across"},{id:3,word:"FIZZLE",row:0,col:0,direction:"down"},{id:4,word:"TYCOON",row:0,col:3,direction:"down"}   ] },
  { level: 225, words: [   {id:0,word:"JUMPING",row:0,col:0,direction:"across"},{id:1,word:"IDEA",row:3,col:0,direction:"across"},{id:2,word:"LIKE",row:5,col:0,direction:"across"},{id:3,word:"JOVIAL",row:0,col:0,direction:"down"},{id:4,word:"PALACE",row:0,col:3,direction:"down"}   ] },
  { level: 226, words: [   {id:0,word:"CUSTOM",row:0,col:0,direction:"across"},{id:1,word:"FLAP",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"CONFER",row:0,col:0,direction:"down"},{id:4,word:"TRIPLE",row:0,col:3,direction:"down"}   ] },
  { level: 227, words: [   {id:0,word:"HIGHEST",row:0,col:0,direction:"across"},{id:1,word:"TOMB",row:3,col:0,direction:"across"},{id:2,word:"RIFE",row:5,col:0,direction:"across"},{id:3,word:"HUNTER",row:0,col:0,direction:"down"},{id:4,word:"HOBBLE",row:0,col:3,direction:"down"}   ] },
  { level: 228, words: [   {id:0,word:"CONFIDE",row:0,col:0,direction:"across"},{id:1,word:"FIZZ",row:3,col:0,direction:"across"},{id:2,word:"RAKE",row:5,col:0,direction:"across"},{id:3,word:"CONFER",row:0,col:0,direction:"down"},{id:4,word:"FIZZLE",row:0,col:3,direction:"down"}   ] },
  { level: 229, words: [ {id:0,word:"PRICK",row:0,col:0,direction:"across"},{id:1,word:"INFER",row:2,col:0,direction:"across"},{id:2,word:"THROW",row:4,col:0,direction:"across"},{id:3,word:"PRINT",row:0,col:0,direction:"down"},{id:4,word:"INFER",row:0,col:2,direction:"down"} ] },
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
  { level: 250, words: [   {id:0,word:"ALBEIT",row:0,col:0,direction:"across"},{id:1,word:"INFO",row:3,col:0,direction:"across"},{id:2,word:"GRIEVE",row:5,col:0,direction:"across"},{id:3,word:"AILING",row:0,col:0,direction:"down"},{id:4,word:"ENCODE",row:0,col:3,direction:"down"}   ] },
  { level: 251, words: [ {id:0,word:"CHEER",row:0,col:0,direction:"across"},{id:1,word:"ADEPT",row:2,col:0,direction:"across"},{id:2,word:"METER",row:4,col:0,direction:"across"},{id:3,word:"CHARM",row:0,col:0,direction:"down"},{id:4,word:"ERECT",row:0,col:2,direction:"down"} ] },
  { level: 252, words: [ {id:0,word:"ISSUE",row:0,col:0,direction:"across"},{id:1,word:"NOISY",row:2,col:0,direction:"across"},{id:2,word:"REEDY",row:4,col:0,direction:"across"},{id:3,word:"INNER",row:0,col:0,direction:"down"},{id:4,word:"SPIRE",row:0,col:2,direction:"down"} ] },
  { level: 253, words: [ {id:0,word:"LEAFY",row:0,col:0,direction:"across"},{id:1,word:"YIELD",row:2,col:0,direction:"across"},{id:2,word:"LATCH",row:4,col:0,direction:"across"},{id:3,word:"LOYAL",row:0,col:0,direction:"down"},{id:4,word:"AVERT",row:0,col:2,direction:"down"} ] },
  { level: 254, words: [ {id:0,word:"CONVEY",row:0,col:0,direction:"across"},{id:1,word:"FIST",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"CONFER",row:0,col:0,direction:"down"},{id:4,word:"VIRTUE",row:0,col:3,direction:"down"} ] },
  { level: 255, words: [ {id:0,word:"MENTAL",row:0,col:0,direction:"across"},{id:1,word:"TANG",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"MUSTER",row:0,col:0,direction:"down"},{id:4,word:"TINGLE",row:0,col:3,direction:"down"} ] },
  { level: 256, words: [ {id:0,word:"ARCHER",row:0,col:0,direction:"across"},{id:1,word:"FORGE",row:2,col:0,direction:"across"},{id:2,word:"RITZY",row:4,col:0,direction:"across"},{id:3,word:"AFFORD",row:0,col:0,direction:"down"},{id:4,word:"EVERY",row:0,col:4,direction:"down"} ] },
  { level: 257, words: [ {id:0,word:"GRUMPY",row:0,col:0,direction:"across"},{id:1,word:"GROAN",row:2,col:0,direction:"across"},{id:2,word:"LEERY",row:4,col:0,direction:"across"},{id:3,word:"GIGGLE",row:0,col:0,direction:"down"},{id:4,word:"PINEY",row:0,col:4,direction:"down"} ] },
  { level: 258, words: [ {id:0,word:"LADEN",row:0,col:0,direction:"across"},{id:1,word:"NONCE",row:2,col:0,direction:"across"},{id:2,word:"HERBY",row:4,col:0,direction:"across"},{id:3,word:"LUNCH",row:0,col:0,direction:"down"},{id:4,word:"DONOR",row:0,col:2,direction:"down"} ] },
  { level: 259, words: [ {id:0,word:"SWEPT",row:0,col:0,direction:"across"},{id:1,word:"UNIFY",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"SOUPY",row:0,col:0,direction:"down"},{id:4,word:"ELITE",row:0,col:2,direction:"down"} ] },
  { level: 260, words: [ {id:0,word:"STOOD",row:0,col:0,direction:"across"},{id:1,word:"ALTAR",row:2,col:0,direction:"across"},{id:2,word:"KINKY",row:4,col:0,direction:"across"},{id:3,word:"SPARK",row:0,col:0,direction:"down"},{id:4,word:"OFTEN",row:0,col:2,direction:"down"} ] },
  { level: 261, words: [ {id:0,word:"FLORA",row:0,col:0,direction:"across"},{id:1,word:"LYING",row:2,col:0,direction:"across"},{id:2,word:"DREAM",row:4,col:0,direction:"across"},{id:3,word:"FILED",row:0,col:0,direction:"down"},{id:4,word:"OXIDE",row:0,col:2,direction:"down"} ] },
  { level: 262, words: [ {id:0,word:"GLOOM",row:0,col:0,direction:"across"},{id:1,word:"RETCH",row:2,col:0,direction:"across"},{id:2,word:"HOTLY",row:4,col:0,direction:"across"},{id:3,word:"GIRTH",row:0,col:0,direction:"down"},{id:4,word:"OCTET",row:0,col:2,direction:"down"} ] },
  { level: 263, words: [ {id:0,word:"CRIME",row:0,col:0,direction:"across"},{id:1,word:"AFFIX",row:2,col:0,direction:"across"},{id:2,word:"MERCY",row:4,col:0,direction:"across"},{id:3,word:"CHARM",row:0,col:0,direction:"down"},{id:4,word:"INFER",row:0,col:2,direction:"down"} ] },
  { level: 264, words: [ {id:0,word:"REVOLT",row:0,col:0,direction:"across"},{id:1,word:"OMIT",row:3,col:0,direction:"across"},{id:2,word:"MIRROR",row:5,col:0,direction:"across"},{id:3,word:"REFORM",row:0,col:0,direction:"down"},{id:4,word:"OYSTER",row:0,col:3,direction:"down"} ] },
  { level: 265, words: [ {id:0,word:"JANGLE",row:0,col:0,direction:"across"},{id:1,word:"TANG",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"JESTER",row:0,col:0,direction:"down"},{id:4,word:"GURGLE",row:0,col:3,direction:"down"} ] },
  { level: 266, words: [ {id:0,word:"BRAZEN",row:0,col:0,direction:"across"},{id:1,word:"TRITE",row:2,col:0,direction:"across"},{id:2,word:"ODDLY",row:4,col:0,direction:"across"},{id:3,word:"BOTTOM",row:0,col:0,direction:"down"},{id:4,word:"EVERY",row:0,col:4,direction:"down"} ] },
  { level: 267, words: [ {id:0,word:"RENDER",row:0,col:0,direction:"across"},{id:1,word:"FABLE",row:2,col:0,direction:"across"},{id:2,word:"RUNNY",row:4,col:0,direction:"across"},{id:3,word:"REFORM",row:0,col:0,direction:"down"},{id:4,word:"EVERY",row:0,col:4,direction:"down"} ] },
  { level: 268, words: [ {id:0,word:"STAID",row:0,col:0,direction:"across"},{id:1,word:"VIOLA",row:2,col:0,direction:"across"},{id:2,word:"REGAL",row:4,col:0,direction:"across"},{id:3,word:"SAVOR",row:0,col:0,direction:"down"},{id:4,word:"ALONG",row:0,col:2,direction:"down"} ] },
  { level: 269, words: [ {id:0,word:"WHOLE",row:0,col:0,direction:"across"},{id:1,word:"AUNTS",row:2,col:0,direction:"across"},{id:2,word:"HYENA",row:4,col:0,direction:"across"},{id:3,word:"WRATH",row:0,col:0,direction:"down"},{id:4,word:"OUNCE",row:0,col:2,direction:"down"} ] },
  { level: 270, words: [ {id:0,word:"FAMED",row:0,col:0,direction:"across"},{id:1,word:"OUNCE",row:2,col:0,direction:"across"},{id:2,word:"THREW",row:4,col:0,direction:"across"},{id:3,word:"FROST",row:0,col:0,direction:"down"},{id:4,word:"MANOR",row:0,col:2,direction:"down"} ] },
  { level: 271, words: [ {id:0,word:"RECAP",row:0,col:0,direction:"across"},{id:1,word:"TACKY",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"RETRY",row:0,col:0,direction:"down"},{id:4,word:"CYCLE",row:0,col:2,direction:"down"} ] },
  { level: 272, words: [ {id:0,word:"USHER",row:0,col:0,direction:"across"},{id:1,word:"PAPAL",row:2,col:0,direction:"across"},{id:2,word:"ROOMY",row:4,col:0,direction:"across"},{id:3,word:"UPPER",row:0,col:0,direction:"down"},{id:4,word:"HIPPO",row:0,col:2,direction:"down"} ] },
  { level: 273, words: [ {id:0,word:"COVET",row:0,col:0,direction:"across"},{id:1,word:"SOGGY",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"CUSHY",row:0,col:0,direction:"down"},{id:4,word:"VAGUE",row:0,col:2,direction:"down"} ] },
  { level: 274, words: [ {id:0,word:"DECREE",row:0,col:0,direction:"across"},{id:1,word:"GRAB",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"DAGGER",row:0,col:0,direction:"down"},{id:4,word:"RAMBLE",row:0,col:3,direction:"down"} ] },
  { level: 275, words: [ {id:0,word:"BARELY",row:0,col:0,direction:"across"},{id:1,word:"TYPE",row:3,col:0,direction:"across"},{id:2,word:"WEDDED",row:5,col:0,direction:"across"},{id:3,word:"BESTOW",row:0,col:0,direction:"down"},{id:4,word:"EXTEND",row:0,col:3,direction:"down"} ] },
  { level: 276, words: [ {id:0,word:"JIGSAW",row:0,col:0,direction:"across"},{id:1,word:"NEWER",row:2,col:0,direction:"across"},{id:2,word:"LOFTY",row:4,col:0,direction:"across"},{id:3,word:"JUNGLE",row:0,col:0,direction:"down"},{id:4,word:"ARRAY",row:0,col:4,direction:"down"} ] },
  { level: 277, words: [ {id:0,word:"VIOLET",row:0,col:0,direction:"across"},{id:1,word:"NINJA",row:2,col:0,direction:"across"},{id:2,word:"SPORT",row:4,col:0,direction:"across"},{id:3,word:"VANISH",row:0,col:0,direction:"down"},{id:4,word:"EXALT",row:0,col:4,direction:"down"} ] },
  { level: 278, words: [ {id:0,word:"CAPER",row:0,col:0,direction:"across"},{id:1,word:"EVOKE",row:2,col:0,direction:"across"},{id:2,word:"TREAT",row:4,col:0,direction:"across"},{id:3,word:"CLEFT",row:0,col:0,direction:"down"},{id:4,word:"PROBE",row:0,col:2,direction:"down"} ] },
  { level: 279, words: [ {id:0,word:"BAWDY",row:0,col:0,direction:"across"},{id:1,word:"AHEAD",row:2,col:0,direction:"across"},{id:2,word:"DRYER",row:4,col:0,direction:"across"},{id:3,word:"BRAND",row:0,col:0,direction:"down"},{id:4,word:"WEEPY",row:0,col:2,direction:"down"} ] },
  { level: 280, words: [ {id:0,word:"TREND",row:0,col:0,direction:"across"},{id:1,word:"NIGHT",row:2,col:0,direction:"across"},{id:2,word:"ERROR",row:4,col:0,direction:"across"},{id:3,word:"TENSE",row:0,col:0,direction:"down"},{id:4,word:"EAGER",row:0,col:2,direction:"down"} ] },
  { level: 281, words: [ {id:0,word:"NAVAL",row:0,col:0,direction:"across"},{id:1,word:"VALUE",row:2,col:0,direction:"across"},{id:2,word:"RIDGE",row:4,col:0,direction:"across"},{id:3,word:"NEVER",row:0,col:0,direction:"down"},{id:4,word:"VALID",row:0,col:2,direction:"down"} ] },
  { level: 282, words: [ {id:0,word:"GROVE",row:0,col:0,direction:"across"},{id:1,word:"ANTIC",row:2,col:0,direction:"across"},{id:2,word:"EMCEE",row:4,col:0,direction:"across"},{id:3,word:"GRADE",row:0,col:0,direction:"down"},{id:4,word:"OPTIC",row:0,col:2,direction:"down"} ] },
  { level: 283, words: [ {id:0,word:"ABIDE",row:0,col:0,direction:"across"},{id:1,word:"ICING",row:2,col:0,direction:"across"},{id:2,word:"ENTRY",row:4,col:0,direction:"across"},{id:3,word:"ARISE",row:0,col:0,direction:"down"},{id:4,word:"IDIOT",row:0,col:2,direction:"down"} ] },
  { level: 284, words: [ {id:0,word:"CHAPEL",row:0,col:0,direction:"across"},{id:1,word:"DAIS",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"CONDOR",row:0,col:0,direction:"down"},{id:4,word:"PURSUE",row:0,col:3,direction:"down"} ] },
  { level: 285, words: [ {id:0,word:"HEROIC",row:0,col:0,direction:"across"},{id:1,word:"TACO",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"HUNTER",row:0,col:0,direction:"down"},{id:4,word:"OPPOSE",row:0,col:3,direction:"down"} ] },
  { level: 286, words: [ {id:0,word:"PATENT",row:0,col:0,direction:"across"},{id:1,word:"NEVER",row:2,col:0,direction:"across"},{id:2,word:"ENSUE",row:4,col:0,direction:"across"},{id:3,word:"PONDER",row:0,col:0,direction:"down"},{id:4,word:"NURSE",row:0,col:4,direction:"down"} ] },
  { level: 287, words: [ {id:0,word:"FINGER",row:0,col:0,direction:"across"},{id:1,word:"STOIC",row:2,col:0,direction:"across"},{id:2,word:"EVOKE",row:4,col:0,direction:"across"},{id:3,word:"FOSTER",row:0,col:0,direction:"down"},{id:4,word:"EMCEE",row:0,col:4,direction:"down"} ] },
  { level: 288, words: [ {id:0,word:"FRISK",row:0,col:0,direction:"across"},{id:1,word:"RIDER",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"FORAY",row:0,col:0,direction:"down"},{id:4,word:"INDIE",row:0,col:2,direction:"down"} ] },
  { level: 289, words: [ {id:0,word:"BLEND",row:0,col:0,direction:"across"},{id:1,word:"READY",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"BURLY",row:0,col:0,direction:"down"},{id:4,word:"EVADE",row:0,col:2,direction:"down"} ] },
  { level: 290, words: [ {id:0,word:"DATED",row:0,col:0,direction:"across"},{id:1,word:"IDIOT",row:2,col:0,direction:"across"},{id:2,word:"YOKEL",row:4,col:0,direction:"across"},{id:3,word:"DAISY",row:0,col:0,direction:"down"},{id:4,word:"THICK",row:0,col:2,direction:"down"} ] },
  { level: 291, words: [ {id:0,word:"COMMA",row:0,col:0,direction:"across"},{id:1,word:"ENTRY",row:2,col:0,direction:"across"},{id:2,word:"ROOMY",row:4,col:0,direction:"across"},{id:3,word:"CLEAR",row:0,col:0,direction:"down"},{id:4,word:"MOTTO",row:0,col:2,direction:"down"} ] },
  { level: 292, words: [ {id:0,word:"SERUM",row:0,col:0,direction:"across"},{id:1,word:"ODDLY",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"STONY",row:0,col:0,direction:"down"},{id:4,word:"RIDGE",row:0,col:2,direction:"down"} ] },
  { level: 293, words: [ {id:0,word:"PRIVY",row:0,col:0,direction:"across"},{id:1,word:"LEAPT",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"POLLY",row:0,col:0,direction:"down"},{id:4,word:"IMAGE",row:0,col:2,direction:"down"} ] },
  { level: 294, words: [ {id:0,word:"SETTLE",row:0,col:0,direction:"across"},{id:1,word:"DELI",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"SENDER",row:0,col:0,direction:"down"},{id:4,word:"THRIVE",row:0,col:3,direction:"down"} ] },
  { level: 295, words: [ {id:0,word:"HAZARD",row:0,col:0,direction:"across"},{id:1,word:"LANE",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"HEALTH",row:0,col:0,direction:"down"},{id:4,word:"APPEAR",row:0,col:3,direction:"down"} ] },
  { level: 296, words: [ {id:0,word:"FOLLOW",row:0,col:0,direction:"across"},{id:1,word:"IMAGE",row:2,col:0,direction:"across"},{id:2,word:"CLOWN",row:4,col:0,direction:"across"},{id:3,word:"FLINCH",row:0,col:0,direction:"down"},{id:4,word:"OCEAN",row:0,col:4,direction:"down"} ] },
  { level: 297, words: [ {id:0,word:"TRIPLE",row:0,col:0,direction:"across"},{id:1,word:"OPERA",row:2,col:0,direction:"across"},{id:2,word:"GAUDY",row:4,col:0,direction:"across"},{id:3,word:"TROUGH",row:0,col:0,direction:"down"},{id:4,word:"LEAFY",row:0,col:4,direction:"down"} ] },
  { level: 298, words: [ {id:0,word:"SWIRL",row:0,col:0,direction:"across"},{id:1,word:"OPERA",row:2,col:0,direction:"across"},{id:2,word:"TOLLS",row:4,col:0,direction:"across"},{id:3,word:"SCOUT",row:0,col:0,direction:"down"},{id:4,word:"IDEAL",row:0,col:2,direction:"down"} ] },
  { level: 299, words: [ {id:0,word:"READY",row:0,col:0,direction:"across"},{id:1,word:"IDIOT",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"RAINY",row:0,col:0,direction:"down"},{id:4,word:"ASIDE",row:0,col:2,direction:"down"} ] },
  { level: 300, words: [ {id:0,word:"DOLCE",row:0,col:0,direction:"across"},{id:1,word:"RIPEN",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"DIRTY",row:0,col:0,direction:"down"},{id:4,word:"LAPSE",row:0,col:2,direction:"down"} ] },
  { level: 301, words: [ {id:0,word:"CHIEF",row:0,col:0,direction:"across"},{id:1,word:"VISIT",row:2,col:0,direction:"across"},{id:2,word:"LEERY",row:4,col:0,direction:"across"},{id:3,word:"CIVIL",row:0,col:0,direction:"down"},{id:4,word:"ISSUE",row:0,col:2,direction:"down"} ] },
  { level: 302, words: [ {id:0,word:"COBRA",row:0,col:0,direction:"across"},{id:1,word:"USAGE",row:2,col:0,direction:"across"},{id:2,word:"LADEN",row:4,col:0,direction:"across"},{id:3,word:"CRUEL",row:0,col:0,direction:"down"},{id:4,word:"BLAND",row:0,col:2,direction:"down"} ] },
  { level: 303, words: [ {id:0,word:"RIPEN",row:0,col:0,direction:"across"},{id:1,word:"ERROR",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"REEDY",row:0,col:0,direction:"down"},{id:4,word:"PURSE",row:0,col:2,direction:"down"} ] },
  { level: 304, words: [ {id:0,word:"DECREE",row:0,col:0,direction:"across"},{id:1,word:"ORCA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"DEVOUR",row:0,col:0,direction:"down"},{id:4,word:"RELATE",row:0,col:3,direction:"down"} ] },
  { level: 305, words: [ {id:0,word:"ATTACH",row:0,col:0,direction:"across"},{id:1,word:"ONCE",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"ALMOST",row:0,col:0,direction:"down"},{id:4,word:"APPEAR",row:0,col:3,direction:"down"} ] },
  { level: 306, words: [ {id:0,word:"HEARTH",row:0,col:0,direction:"across"},{id:1,word:"GROUP",row:2,col:0,direction:"across"},{id:2,word:"LOUSY",row:4,col:0,direction:"across"},{id:3,word:"HUGELY",row:0,col:0,direction:"down"},{id:4,word:"TIPSY",row:0,col:4,direction:"down"} ] },
  { level: 307, words: [ {id:0,word:"ASPECT",row:0,col:0,direction:"across"},{id:1,word:"KNAVE",row:2,col:0,direction:"across"},{id:2,word:"EMBED",row:4,col:0,direction:"across"},{id:3,word:"ANKLET",row:0,col:0,direction:"down"},{id:4,word:"CLEWD",row:0,col:4,direction:"down"} ] },
  { level: 308, words: [ {id:0,word:"OFFER",row:0,col:0,direction:"across"},{id:1,word:"STUNT",row:2,col:0,direction:"across"},{id:2,word:"TREND",row:4,col:0,direction:"across"},{id:3,word:"ONSET",row:0,col:0,direction:"down"},{id:4,word:"FLUTE",row:0,col:2,direction:"down"} ] },
  { level: 309, words: [ {id:0,word:"BLOOD",row:0,col:0,direction:"across"},{id:1,word:"OXIDE",row:2,col:0,direction:"across"},{id:2,word:"ENEMY",row:4,col:0,direction:"across"},{id:3,word:"BROKE",row:0,col:0,direction:"down"},{id:4,word:"OLIVE",row:0,col:2,direction:"down"} ] },
  { level: 310, words: [ {id:0,word:"PENNY",row:0,col:0,direction:"across"},{id:1,word:"NONCE",row:2,col:0,direction:"across"},{id:2,word:"LEAFY",row:4,col:0,direction:"across"},{id:3,word:"PANEL",row:0,col:0,direction:"down"},{id:4,word:"NINJA",row:0,col:2,direction:"down"} ] },
  { level: 311, words: [ {id:0,word:"BAWDY",row:0,col:0,direction:"across"},{id:1,word:"ICING",row:2,col:0,direction:"across"},{id:2,word:"GREET",row:4,col:0,direction:"across"},{id:3,word:"BEING",row:0,col:0,direction:"down"},{id:4,word:"WHILE",row:0,col:2,direction:"down"} ] },
  { level: 312, words: [ {id:0,word:"LYING",row:0,col:0,direction:"across"},{id:1,word:"GREEN",row:2,col:0,direction:"across"},{id:2,word:"CATCH",row:4,col:0,direction:"across"},{id:3,word:"LOGIC",row:0,col:0,direction:"down"},{id:4,word:"INEPT",row:0,col:2,direction:"down"} ] },
  { level: 313, words: [ {id:0,word:"SMOKY",row:0,col:0,direction:"across"},{id:1,word:"ATONE",row:2,col:0,direction:"across"},{id:2,word:"LEERY",row:4,col:0,direction:"across"},{id:3,word:"SNAIL",row:0,col:0,direction:"down"},{id:4,word:"OZONE",row:0,col:2,direction:"down"} ] },
  { level: 314, words: [ {id:0,word:"ENCODE",row:0,col:0,direction:"across"},{id:1,word:"HOBO",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"EITHER",row:0,col:0,direction:"down"},{id:4,word:"OPPOSE",row:0,col:3,direction:"down"} ] },
  { level: 315, words: [ {id:0,word:"RAMBLE",row:0,col:0,direction:"across"},{id:1,word:"KNOT",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"ROCKET",row:0,col:0,direction:"down"},{id:4,word:"BARTER",row:0,col:3,direction:"down"} ] },
  { level: 316, words: [ {id:0,word:"CRAFTY",row:0,col:0,direction:"across"},{id:1,word:"OBESE",row:2,col:0,direction:"across"},{id:2,word:"CREED",row:4,col:0,direction:"across"},{id:3,word:"CHOICE",row:0,col:0,direction:"down"},{id:4,word:"TREND",row:0,col:4,direction:"down"} ] },
  { level: 317, words: [ {id:0,word:"ACCRUE",row:0,col:0,direction:"across"},{id:1,word:"CHIEF",row:2,col:0,direction:"across"},{id:2,word:"ROOST",row:4,col:0,direction:"across"},{id:3,word:"ACCORD",row:0,col:0,direction:"down"},{id:4,word:"UNFIT",row:0,col:4,direction:"down"} ] },
  { level: 318, words: [ {id:0,word:"ANTIC",row:0,col:0,direction:"across"},{id:1,word:"OUTDO",row:2,col:0,direction:"across"},{id:2,word:"ELECT",row:4,col:0,direction:"across"},{id:3,word:"ALONE",row:0,col:0,direction:"down"},{id:4,word:"TITLE",row:0,col:2,direction:"down"} ] },
  { level: 319, words: [ {id:0,word:"SHAME",row:0,col:0,direction:"across"},{id:1,word:"GAUZE",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"SOGGY",row:0,col:0,direction:"down"},{id:4,word:"ACUTE",row:0,col:2,direction:"down"} ] },
  { level: 320, words: [ {id:0,word:"GROVE",row:0,col:0,direction:"across"},{id:1,word:"OUTER",row:2,col:0,direction:"across"},{id:2,word:"LATCH",row:4,col:0,direction:"across"},{id:3,word:"GROWL",row:0,col:0,direction:"down"},{id:4,word:"OCTET",row:0,col:2,direction:"down"} ] },
  { level: 321, words: [ {id:0,word:"POLKA",row:0,col:0,direction:"across"},{id:1,word:"LIGHT",row:2,col:0,direction:"across"},{id:2,word:"YACHT",row:4,col:0,direction:"across"},{id:3,word:"POLLY",row:0,col:0,direction:"down"},{id:4,word:"LOGIC",row:0,col:2,direction:"down"} ] },
  { level: 322, words: [ {id:0,word:"SPIRE",row:0,col:0,direction:"across"},{id:1,word:"ARISE",row:2,col:0,direction:"across"},{id:2,word:"ENTER",row:4,col:0,direction:"across"},{id:3,word:"SHADE",row:0,col:0,direction:"down"},{id:4,word:"IDIOT",row:0,col:2,direction:"down"} ] },
  { level: 323, words: [ {id:0,word:"EARLY",row:0,col:0,direction:"across"},{id:1,word:"GLOOM",row:2,col:0,direction:"across"},{id:2,word:"RETCH",row:4,col:0,direction:"across"},{id:3,word:"EAGER",row:0,col:0,direction:"down"},{id:4,word:"ROOST",row:0,col:2,direction:"down"} ] },
  { level: 324, words: [ {id:0,word:"GLIDER",row:0,col:0,direction:"across"},{id:1,word:"TIFF",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"GLITCH",row:0,col:0,direction:"down"},{id:4,word:"DIFFER",row:0,col:3,direction:"down"} ] },
  { level: 325, words: [ {id:0,word:"ADVISE",row:0,col:0,direction:"across"},{id:1,word:"HOBO",row:3,col:0,direction:"across"},{id:2,word:"ADHERE",row:5,col:0,direction:"across"},{id:3,word:"ASTHMA",row:0,col:0,direction:"down"},{id:4,word:"IMPOSE",row:0,col:3,direction:"down"} ] },
  { level: 326, words: [ {id:0,word:"DEFEAT",row:0,col:0,direction:"across"},{id:1,word:"FLANK",row:2,col:0,direction:"across"},{id:2,word:"NURSE",row:4,col:0,direction:"across"},{id:3,word:"DEFEND",row:0,col:0,direction:"down"},{id:4,word:"ANKLE",row:0,col:4,direction:"down"} ] },
  { level: 327, words: [ {id:0,word:"TOGGLE",row:0,col:0,direction:"across"},{id:1,word:"RIPEN",row:2,col:0,direction:"across"},{id:2,word:"LEMUR",row:4,col:0,direction:"across"},{id:3,word:"TURTLE",row:0,col:0,direction:"down"},{id:4,word:"LONER",row:0,col:4,direction:"down"} ] },
  { level: 328, words: [ {id:0,word:"RAPID",row:0,col:0,direction:"across"},{id:1,word:"EXALT",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"REEDY",row:0,col:0,direction:"down"},{id:4,word:"PLACE",row:0,col:2,direction:"down"} ] },
  { level: 329, words: [ {id:0,word:"TARDY",row:0,col:0,direction:"across"},{id:1,word:"URBAN",row:2,col:0,direction:"across"},{id:2,word:"SASSY",row:4,col:0,direction:"across"},{id:3,word:"THUGS",row:0,col:0,direction:"down"},{id:4,word:"REBUS",row:0,col:2,direction:"down"} ] },
  { level: 330, words: [ {id:0,word:"WARTY",row:0,col:0,direction:"across"},{id:1,word:"REBEL",row:2,col:0,direction:"across"},{id:2,word:"ENDOW",row:4,col:0,direction:"across"},{id:3,word:"WORSE",row:0,col:0,direction:"down"},{id:4,word:"RABID",row:0,col:2,direction:"down"} ] },
  { level: 331, words: [ {id:0,word:"STORY",row:0,col:0,direction:"across"},{id:1,word:"APTLY",row:2,col:0,direction:"across"},{id:2,word:"PERCH",row:4,col:0,direction:"across"},{id:3,word:"STAMP",row:0,col:0,direction:"down"},{id:4,word:"OUTER",row:0,col:2,direction:"down"} ] },
  { level: 332, words: [ {id:0,word:"ROWDY",row:0,col:0,direction:"across"},{id:1,word:"BARON",row:2,col:0,direction:"across"},{id:2,word:"DRYER",row:4,col:0,direction:"across"},{id:3,word:"RABID",row:0,col:0,direction:"down"},{id:4,word:"WORRY",row:0,col:2,direction:"down"} ] },
  { level: 333, words: [ {id:0,word:"KITTY",row:0,col:0,direction:"across"},{id:1,word:"ENEMY",row:2,col:0,direction:"across"},{id:2,word:"LATCH",row:4,col:0,direction:"across"},{id:3,word:"KNEEL",row:0,col:0,direction:"down"},{id:4,word:"TREAT",row:0,col:2,direction:"down"} ] },
  { level: 334, words: [ {id:0,word:"PIRATE",row:0,col:0,direction:"across"},{id:1,word:"REAL",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"PARROT",row:0,col:0,direction:"down"},{id:4,word:"ANTLER",row:0,col:3,direction:"down"} ] },
  { level: 335, words: [ {id:0,word:"ANKLET",row:0,col:0,direction:"across"},{id:1,word:"EPIC",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"ARREST",row:0,col:0,direction:"down"},{id:4,word:"LANCER",row:0,col:3,direction:"down"} ] },
  { level: 336, words: [ {id:0,word:"ALWAYS",row:0,col:0,direction:"across"},{id:1,word:"TUNIC",row:2,col:0,direction:"across"},{id:2,word:"INERT",row:4,col:0,direction:"across"},{id:3,word:"ATTAIN",row:0,col:0,direction:"down"},{id:4,word:"YACHT",row:0,col:4,direction:"down"} ] },
  { level: 337, words: [ {id:0,word:"OPTION",row:0,col:0,direction:"across"},{id:1,word:"INEPT",row:2,col:0,direction:"across"},{id:2,word:"IGLOO",row:4,col:0,direction:"across"},{id:3,word:"ORIGIN",row:0,col:0,direction:"down"},{id:4,word:"OUTDO",row:0,col:4,direction:"down"} ] },
  { level: 338, words: [ {id:0,word:"TIGHT",row:0,col:0,direction:"across"},{id:1,word:"INDIE",row:2,col:0,direction:"across"},{id:2,word:"DRYER",row:4,col:0,direction:"across"},{id:3,word:"TRIED",row:0,col:0,direction:"down"},{id:4,word:"GIDDY",row:0,col:2,direction:"down"} ] },
  { level: 339, words: [ {id:0,word:"SANDY",row:0,col:0,direction:"across"},{id:1,word:"ARISE",row:2,col:0,direction:"across"},{id:2,word:"KNELT",row:4,col:0,direction:"across"},{id:3,word:"SPANK",row:0,col:0,direction:"down"},{id:4,word:"NOISE",row:0,col:2,direction:"down"} ] },
  { level: 340, words: [ {id:0,word:"SMASH",row:0,col:0,direction:"across"},{id:1,word:"EXALT",row:2,col:0,direction:"across"},{id:2,word:"DREAM",row:4,col:0,direction:"across"},{id:3,word:"SPEND",row:0,col:0,direction:"down"},{id:4,word:"ADAGE",row:0,col:2,direction:"down"} ] },
  { level: 341, words: [ {id:0,word:"CREST",row:0,col:0,direction:"across"},{id:1,word:"OCEAN",row:2,col:0,direction:"across"},{id:2,word:"KAYAK",row:4,col:0,direction:"across"},{id:3,word:"CROAK",row:0,col:0,direction:"down"},{id:4,word:"ENEMY",row:0,col:2,direction:"down"} ] },
  { level: 342, words: [ {id:0,word:"CAROL",row:0,col:0,direction:"across"},{id:1,word:"COVER",row:2,col:0,direction:"across"},{id:2,word:"ENTER",row:4,col:0,direction:"across"},{id:3,word:"CYCLE",row:0,col:0,direction:"down"},{id:4,word:"RIVET",row:0,col:2,direction:"down"} ] },
  { level: 343, words: [ {id:0,word:"ODDLY",row:0,col:0,direction:"across"},{id:1,word:"NONCE",row:2,col:0,direction:"across"},{id:2,word:"ERROR",row:4,col:0,direction:"across"},{id:3,word:"OUNCE",row:0,col:0,direction:"down"},{id:4,word:"DONOR",row:0,col:2,direction:"down"} ] },
  { level: 344, words: [ {id:0,word:"JUNGLE",row:0,col:0,direction:"across"},{id:1,word:"GIFT",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"JOGGER",row:0,col:0,direction:"down"},{id:4,word:"GENTLE",row:0,col:3,direction:"down"} ] },
  { level: 345, words: [ {id:0,word:"ARCHER",row:0,col:0,direction:"across"},{id:1,word:"EMIT",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"ASPECT",row:0,col:0,direction:"down"},{id:4,word:"HALTER",row:0,col:3,direction:"down"} ] },
  { level: 346, words: [ {id:0,word:"LOUDLY",row:0,col:0,direction:"across"},{id:1,word:"TEMPO",row:2,col:0,direction:"across"},{id:2,word:"ABBEY",row:4,col:0,direction:"across"},{id:3,word:"LETHAL",row:0,col:0,direction:"down"},{id:4,word:"LOOPY",row:0,col:4,direction:"down"} ] },
  { level: 347, words: [ {id:0,word:"ENABLE",row:0,col:0,direction:"across"},{id:1,word:"POLKA",row:2,col:0,direction:"across"},{id:2,word:"NEEDY",row:4,col:0,direction:"across"},{id:3,word:"EXPAND",row:0,col:0,direction:"down"},{id:4,word:"LEAFY",row:0,col:4,direction:"down"} ] },
  { level: 348, words: [ {id:0,word:"LIMIT",row:0,col:0,direction:"across"},{id:1,word:"MOUNT",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"LUMPY",row:0,col:0,direction:"down"},{id:4,word:"MOUSE",row:0,col:2,direction:"down"} ] },
  { level: 349, words: [ {id:0,word:"TRACE",row:0,col:0,direction:"across"},{id:1,word:"LABEL",row:2,col:0,direction:"across"},{id:2,word:"SURLY",row:4,col:0,direction:"across"},{id:3,word:"TOLLS",row:0,col:0,direction:"down"},{id:4,word:"ARBOR",row:0,col:2,direction:"down"} ] },
  { level: 350, words: [ {id:0,word:"VOGUE",row:0,col:0,direction:"across"},{id:1,word:"GROVE",row:2,col:0,direction:"across"},{id:2,word:"EMPTY",row:4,col:0,direction:"across"},{id:3,word:"VAGUE",row:0,col:0,direction:"down"},{id:4,word:"GROUP",row:0,col:2,direction:"down"} ] },
  { level: 351, words: [ {id:0,word:"MAPLE",row:0,col:0,direction:"across"},{id:1,word:"LYING",row:2,col:0,direction:"across"},{id:2,word:"NEEDY",row:4,col:0,direction:"across"},{id:3,word:"MELON",row:0,col:0,direction:"down"},{id:4,word:"PRICE",row:0,col:2,direction:"down"} ] },
  { level: 352, words: [ {id:0,word:"ABORT",row:0,col:0,direction:"across"},{id:1,word:"INTRO",row:2,col:0,direction:"across"},{id:2,word:"EBONY",row:4,col:0,direction:"across"},{id:3,word:"ARISE",row:0,col:0,direction:"down"},{id:4,word:"OUTDO",row:0,col:2,direction:"down"} ] },
  { level: 353, words: [ {id:0,word:"TASTE",row:0,col:0,direction:"across"},{id:1,word:"TUNIC",row:2,col:0,direction:"across"},{id:2,word:"ERECT",row:4,col:0,direction:"across"},{id:3,word:"TITLE",row:0,col:0,direction:"down"},{id:4,word:"SINCE",row:0,col:2,direction:"down"} ] },
  { level: 354, words: [ {id:0,word:"LUMBER",row:0,col:0,direction:"across"},{id:1,word:"OMIT",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"LAYOUT",row:0,col:0,direction:"down"},{id:4,word:"BITTER",row:0,col:3,direction:"down"} ] },
  { level: 355, words: [ {id:0,word:"SURVEY",row:0,col:0,direction:"across"},{id:1,word:"DART",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"SENDER",row:0,col:0,direction:"down"},{id:4,word:"VIRTUE",row:0,col:3,direction:"down"} ] },
  { level: 356, words: [ {id:0,word:"HARDLY",row:0,col:0,direction:"across"},{id:1,word:"REEDY",row:2,col:0,direction:"across"},{id:2,word:"LOCAL",row:4,col:0,direction:"across"},{id:3,word:"HURDLE",row:0,col:0,direction:"down"},{id:4,word:"LOYAL",row:0,col:4,direction:"down"} ] },
  { level: 357, words: [ {id:0,word:"DECIDE",row:0,col:0,direction:"across"},{id:1,word:"MELON",row:2,col:0,direction:"across"},{id:2,word:"INTER",row:4,col:0,direction:"across"},{id:3,word:"DOMAIN",row:0,col:0,direction:"down"},{id:4,word:"DONOR",row:0,col:4,direction:"down"} ] },
  { level: 358, words: [ {id:0,word:"OFTEN",row:0,col:0,direction:"across"},{id:1,word:"EVOKE",row:2,col:0,direction:"across"},{id:2,word:"NUTTY",row:4,col:0,direction:"across"},{id:3,word:"OCEAN",row:0,col:0,direction:"down"},{id:4,word:"TROUT",row:0,col:2,direction:"down"} ] },
  { level: 359, words: [ {id:0,word:"ADULT",row:0,col:0,direction:"across"},{id:1,word:"TAUNT",row:2,col:0,direction:"across"},{id:2,word:"CAPER",row:4,col:0,direction:"across"},{id:3,word:"ANTIC",row:0,col:0,direction:"down"},{id:4,word:"USURP",row:0,col:2,direction:"down"} ] },
  { level: 360, words: [ {id:0,word:"BRAVE",row:0,col:0,direction:"across"},{id:1,word:"NUTTY",row:2,col:0,direction:"across"},{id:2,word:"STRAY",row:4,col:0,direction:"across"},{id:3,word:"BONUS",row:0,col:0,direction:"down"},{id:4,word:"ALTAR",row:0,col:2,direction:"down"} ] },
  { level: 361, words: [ {id:0,word:"SPICY",row:0,col:0,direction:"across"},{id:1,word:"ELDER",row:2,col:0,direction:"across"},{id:2,word:"REEDY",row:4,col:0,direction:"across"},{id:3,word:"SPEAR",row:0,col:0,direction:"down"},{id:4,word:"INDIE",row:0,col:2,direction:"down"} ] },
  { level: 362, words: [ {id:0,word:"SOUTH",row:0,col:0,direction:"across"},{id:1,word:"INTER",row:2,col:0,direction:"across"},{id:2,word:"PILOT",row:4,col:0,direction:"across"},{id:3,word:"SKIMP",row:0,col:0,direction:"down"},{id:4,word:"UNTIL",row:0,col:2,direction:"down"} ] },
  { level: 363, words: [ {id:0,word:"HOMER",row:0,col:0,direction:"across"},{id:1,word:"USURP",row:2,col:0,direction:"across"},{id:2,word:"TATTY",row:4,col:0,direction:"across"},{id:3,word:"HAUNT",row:0,col:0,direction:"down"},{id:4,word:"MOUNT",row:0,col:2,direction:"down"} ] },
  { level: 364, words: [ {id:0,word:"MURDER",row:0,col:0,direction:"across"},{id:1,word:"DATA",row:3,col:0,direction:"across"},{id:2,word:"WEDDED",row:5,col:0,direction:"across"},{id:3,word:"MEADOW",row:0,col:0,direction:"down"},{id:4,word:"DEMAND",row:0,col:3,direction:"down"} ] },
  { level: 365, words: [ {id:0,word:"CANNON",row:0,col:0,direction:"across"},{id:1,word:"WOMB",row:3,col:0,direction:"across"},{id:2,word:"BREEZE",row:5,col:0,direction:"across"},{id:3,word:"COBWEB",row:0,col:0,direction:"down"},{id:4,word:"NIMBLE",row:0,col:3,direction:"down"} ] },
  { level: 366, words: [ {id:0,word:"BELONG",row:0,col:0,direction:"across"},{id:1,word:"UNCLE",row:2,col:0,direction:"across"},{id:2,word:"HANDY",row:4,col:0,direction:"across"},{id:3,word:"BOUGHT",row:0,col:0,direction:"down"},{id:4,word:"NEEDY",row:0,col:4,direction:"down"} ] },
  { level: 367, words: [ {id:0,word:"TINGLE",row:0,col:0,direction:"across"},{id:1,word:"EMBED",row:2,col:0,direction:"across"},{id:2,word:"EAGLE",row:4,col:0,direction:"across"},{id:3,word:"TEETER",row:0,col:0,direction:"down"},{id:4,word:"LODGE",row:0,col:4,direction:"down"} ] },
  { level: 368, words: [ {id:0,word:"TREND",row:0,col:0,direction:"across"},{id:1,word:"URBAN",row:2,col:0,direction:"across"},{id:2,word:"SADLY",row:4,col:0,direction:"across"},{id:3,word:"THUGS",row:0,col:0,direction:"down"},{id:4,word:"EMBED",row:0,col:2,direction:"down"} ] },
  { level: 369, words: [ {id:0,word:"TITLE",row:0,col:0,direction:"across"},{id:1,word:"TWIXT",row:2,col:0,direction:"across"},{id:2,word:"LEERY",row:4,col:0,direction:"across"},{id:3,word:"TOTAL",row:0,col:0,direction:"down"},{id:4,word:"TRITE",row:0,col:2,direction:"down"} ] },
  { level: 370, words: [ {id:0,word:"CROCK",row:0,col:0,direction:"across"},{id:1,word:"ASIDE",row:2,col:0,direction:"across"},{id:2,word:"TREND",row:4,col:0,direction:"across"},{id:3,word:"CRAFT",row:0,col:0,direction:"down"},{id:4,word:"OXIDE",row:0,col:2,direction:"down"} ] },
  { level: 371, words: [ {id:0,word:"ADOPT",row:0,col:0,direction:"across"},{id:1,word:"AXIAL",row:2,col:0,direction:"across"},{id:2,word:"ERECT",row:4,col:0,direction:"across"},{id:3,word:"ADAGE",row:0,col:0,direction:"down"},{id:4,word:"OLIVE",row:0,col:2,direction:"down"} ] },
  { level: 372, words: [ {id:0,word:"BRINY",row:0,col:0,direction:"across"},{id:1,word:"INDEX",row:2,col:0,direction:"across"},{id:2,word:"ENEMY",row:4,col:0,direction:"across"},{id:3,word:"BRIDE",row:0,col:0,direction:"down"},{id:4,word:"INDIE",row:0,col:2,direction:"down"} ] },
  { level: 373, words: [ {id:0,word:"REALM",row:0,col:0,direction:"across"},{id:1,word:"OUTER",row:2,col:0,direction:"across"},{id:2,word:"TURBO",row:4,col:0,direction:"across"},{id:3,word:"ROOST",row:0,col:0,direction:"down"},{id:4,word:"AFTER",row:0,col:2,direction:"down"} ] },
  { level: 374, words: [ {id:0,word:"ORDEAL",row:0,col:0,direction:"across"},{id:1,word:"LASH",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"OUTLET",row:0,col:0,direction:"down"},{id:4,word:"EITHER",row:0,col:3,direction:"down"} ] },
  { level: 375, words: [ {id:0,word:"HOBBLE",row:0,col:0,direction:"across"},{id:1,word:"BAIT",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"HARBOR",row:0,col:0,direction:"down"},{id:4,word:"BATTLE",row:0,col:3,direction:"down"} ] },
  { level: 376, words: [ {id:0,word:"RUGGED",row:0,col:0,direction:"across"},{id:1,word:"MOUSE",row:2,col:0,direction:"across"},{id:2,word:"LEANT",row:4,col:0,direction:"across"},{id:3,word:"RAMBLE",row:0,col:0,direction:"down"},{id:4,word:"EJECT",row:0,col:4,direction:"down"} ] },
  { level: 377, words: [ {id:0,word:"OPPOSE",row:0,col:0,direction:"across"},{id:1,word:"DONOR",row:2,col:0,direction:"across"},{id:2,word:"ALLAY",row:4,col:0,direction:"across"},{id:3,word:"ORDEAL",row:0,col:0,direction:"down"},{id:4,word:"SORRY",row:0,col:4,direction:"down"} ] },
  { level: 378, words: [ {id:0,word:"SLEET",row:0,col:0,direction:"across"},{id:1,word:"AMBER",row:2,col:0,direction:"across"},{id:2,word:"PEDAL",row:4,col:0,direction:"across"},{id:3,word:"SWAMP",row:0,col:0,direction:"down"},{id:4,word:"EMBED",row:0,col:2,direction:"down"} ] },
  { level: 379, words: [ {id:0,word:"HABIT",row:0,col:0,direction:"across"},{id:1,word:"ROOST",row:2,col:0,direction:"across"},{id:2,word:"YUMMY",row:4,col:0,direction:"across"},{id:3,word:"HERBY",row:0,col:0,direction:"down"},{id:4,word:"BLOOM",row:0,col:2,direction:"down"} ] },
  { level: 380, words: [ {id:0,word:"JUICE",row:0,col:0,direction:"across"},{id:1,word:"KNELT",row:2,col:0,direction:"across"},{id:2,word:"RETCH",row:4,col:0,direction:"across"},{id:3,word:"JOKER",row:0,col:0,direction:"down"},{id:4,word:"INERT",row:0,col:2,direction:"down"} ] },
  { level: 381, words: [ {id:0,word:"COLON",row:0,col:0,direction:"across"},{id:1,word:"ANVIL",row:2,col:0,direction:"across"},{id:2,word:"HARSH",row:4,col:0,direction:"across"},{id:3,word:"COACH",row:0,col:0,direction:"down"},{id:4,word:"LOVER",row:0,col:2,direction:"down"} ] },
  { level: 382, words: [ {id:0,word:"SLICK",row:0,col:0,direction:"across"},{id:1,word:"OPERA",row:2,col:0,direction:"across"},{id:2,word:"CATCH",row:4,col:0,direction:"across"},{id:3,word:"STOIC",row:0,col:0,direction:"down"},{id:4,word:"INEPT",row:0,col:2,direction:"down"} ] },
  { level: 383, words: [ {id:0,word:"LOUSY",row:0,col:0,direction:"across"},{id:1,word:"NEEDY",row:2,col:0,direction:"across"},{id:2,word:"RIDER",row:4,col:0,direction:"across"},{id:3,word:"LONER",row:0,col:0,direction:"down"},{id:4,word:"UPEND",row:0,col:2,direction:"down"} ] },
  { level: 384, words: [ {id:0,word:"TEETER",row:0,col:0,direction:"across"},{id:1,word:"PUMP",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"TAMPER",row:0,col:0,direction:"down"},{id:4,word:"TRIPLE",row:0,col:3,direction:"down"} ] },
  { level: 385, words: [ {id:0,word:"ASSIGN",row:0,col:0,direction:"across"},{id:1,word:"AREA",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"ATTACH",row:0,col:0,direction:"down"},{id:4,word:"IMPAIR",row:0,col:3,direction:"down"} ] },
  { level: 386, words: [ {id:0,word:"SUBMIT",row:0,col:0,direction:"across"},{id:1,word:"LEARN",row:2,col:0,direction:"across"},{id:2,word:"ACTOR",row:4,col:0,direction:"across"},{id:3,word:"SULTAN",row:0,col:0,direction:"down"},{id:4,word:"INNER",row:0,col:4,direction:"down"} ] },
  { level: 387, words: [ {id:0,word:"MIRROR",row:0,col:0,direction:"across"},{id:1,word:"LODGE",row:2,col:0,direction:"across"},{id:2,word:"EXTRA",row:4,col:0,direction:"across"},{id:3,word:"MOLTEN",row:0,col:0,direction:"down"},{id:4,word:"OPERA",row:0,col:4,direction:"down"} ] },
  { level: 388, words: [ {id:0,word:"EVENT",row:0,col:0,direction:"across"},{id:1,word:"RESIN",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"EARLY",row:0,col:0,direction:"down"},{id:4,word:"ENSUE",row:0,col:2,direction:"down"} ] },
  { level: 389, words: [ {id:0,word:"CUBED",row:0,col:0,direction:"across"},{id:1,word:"ODDLY",row:2,col:0,direction:"across"},{id:2,word:"NEEDY",row:4,col:0,direction:"across"},{id:3,word:"CROWN",row:0,col:0,direction:"down"},{id:4,word:"BADGE",row:0,col:2,direction:"down"} ] },
  { level: 390, words: [ {id:0,word:"CURED",row:0,col:0,direction:"across"},{id:1,word:"LOUSY",row:2,col:0,direction:"across"},{id:2,word:"NEEDY",row:4,col:0,direction:"across"},{id:3,word:"COLON",row:0,col:0,direction:"down"},{id:4,word:"ROUGE",row:0,col:2,direction:"down"} ] },
  { level: 391, words: [ {id:0,word:"FETUS",row:0,col:0,direction:"across"},{id:1,word:"TARDY",row:2,col:0,direction:"across"},{id:2,word:"DREAD",row:4,col:0,direction:"across"},{id:3,word:"FATED",row:0,col:0,direction:"down"},{id:4,word:"TERSE",row:0,col:2,direction:"down"} ] },
  { level: 392, words: [ {id:0,word:"ABUZZ",row:0,col:0,direction:"across"},{id:1,word:"INFER",row:2,col:0,direction:"across"},{id:2,word:"ENTRY",row:4,col:0,direction:"across"},{id:3,word:"ABIDE",row:0,col:0,direction:"down"},{id:4,word:"UNFIT",row:0,col:2,direction:"down"} ] },
  { level: 393, words: [ {id:0,word:"ZONAL",row:0,col:0,direction:"across"},{id:1,word:"NOISY",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"ZINGY",row:0,col:0,direction:"down"},{id:4,word:"NAIVE",row:0,col:2,direction:"down"} ] },
  { level: 394, words: [ {id:0,word:"MEADOW",row:0,col:0,direction:"across"},{id:1,word:"EARL",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"MODEST",row:0,col:0,direction:"down"},{id:4,word:"DOLLAR",row:0,col:3,direction:"down"} ] },
  { level: 395, words: [ {id:0,word:"BREATH",row:0,col:0,direction:"across"},{id:1,word:"GLOW",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"BLIGHT",row:0,col:0,direction:"down"},{id:4,word:"ANSWER",row:0,col:3,direction:"down"} ] },
  { level: 396, words: [ {id:0,word:"ASSUME",row:0,col:0,direction:"across"},{id:1,word:"SEVEN",row:2,col:0,direction:"across"},{id:2,word:"EMPTY",row:4,col:0,direction:"across"},{id:3,word:"ANSWER",row:0,col:0,direction:"down"},{id:4,word:"MINTY",row:0,col:4,direction:"down"} ] },
  { level: 397, words: [ {id:0,word:"UNRULY",row:0,col:0,direction:"across"},{id:1,word:"VEINY",row:2,col:0,direction:"across"},{id:2,word:"INNER",row:4,col:0,direction:"across"},{id:3,word:"UNVEIL",row:0,col:0,direction:"down"},{id:4,word:"LAYER",row:0,col:4,direction:"down"} ] },
  { level: 398, words: [ {id:0,word:"STONY",row:0,col:0,direction:"across"},{id:1,word:"TWEED",row:2,col:0,direction:"across"},{id:2,word:"PANIC",row:4,col:0,direction:"across"},{id:3,word:"SETUP",row:0,col:0,direction:"down"},{id:4,word:"OCEAN",row:0,col:2,direction:"down"} ] },
  { level: 399, words: [ {id:0,word:"SNIFF",row:0,col:0,direction:"across"},{id:1,word:"LEERY",row:2,col:0,direction:"across"},{id:2,word:"DELTA",row:4,col:0,direction:"across"},{id:3,word:"SOLID",row:0,col:0,direction:"down"},{id:4,word:"IDEAL",row:0,col:2,direction:"down"} ] },
  { level: 400, words: [ {id:0,word:"REPAY",row:0,col:0,direction:"across"},{id:1,word:"UPSET",row:2,col:0,direction:"across"},{id:2,word:"DRYER",row:4,col:0,direction:"across"},{id:3,word:"ROUND",row:0,col:0,direction:"down"},{id:4,word:"PUSHY",row:0,col:2,direction:"down"} ] },
  { level: 401, words: [ {id:0,word:"SLANG",row:0,col:0,direction:"across"},{id:1,word:"NOISE",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"SANDY",row:0,col:0,direction:"down"},{id:4,word:"ARISE",row:0,col:2,direction:"down"} ] },
  { level: 402, words: [ {id:0,word:"NEWER",row:0,col:0,direction:"across"},{id:1,word:"INDIE",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"NOISY",row:0,col:0,direction:"down"},{id:4,word:"WEDGE",row:0,col:2,direction:"down"} ] },
  { level: 403, words: [ {id:0,word:"ELECT",row:0,col:0,direction:"across"},{id:1,word:"EXIST",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"ENEMY",row:0,col:0,direction:"down"},{id:4,word:"ELITE",row:0,col:2,direction:"down"} ] },
  { level: 404, words: [ {id:0,word:"THRASH",row:0,col:0,direction:"across"},{id:1,word:"TACO",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"TEETER",row:0,col:0,direction:"down"},{id:4,word:"ALCOVE",row:0,col:3,direction:"down"} ] },
  { level: 405, words: [ {id:0,word:"LINGER",row:0,col:0,direction:"across"},{id:1,word:"YORE",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"LAWYER",row:0,col:0,direction:"down"},{id:4,word:"GRIEVE",row:0,col:3,direction:"down"} ] },
  { level: 406, words: [ {id:0,word:"GENDER",row:0,col:0,direction:"across"},{id:1,word:"OPTIC",row:2,col:0,direction:"across"},{id:2,word:"THOSE",row:4,col:0,direction:"across"},{id:3,word:"GROWTH",row:0,col:0,direction:"down"},{id:4,word:"EMCEE",row:0,col:4,direction:"down"} ] },
  { level: 407, words: [ {id:0,word:"GLITCH",row:0,col:0,direction:"across"},{id:1,word:"OUTDO",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"GROVEL",row:0,col:0,direction:"down"},{id:4,word:"CLOTH",row:0,col:4,direction:"down"} ] },
  { level: 408, words: [ {id:0,word:"KNELT",row:0,col:0,direction:"across"},{id:1,word:"DRAPE",row:2,col:0,direction:"across"},{id:2,word:"SNEER",row:4,col:0,direction:"across"},{id:3,word:"KUDOS",row:0,col:0,direction:"down"},{id:4,word:"EVADE",row:0,col:2,direction:"down"} ] },
  { level: 409, words: [ {id:0,word:"CIVIC",row:0,col:0,direction:"across"},{id:1,word:"USURP",row:2,col:0,direction:"across"},{id:2,word:"BOTCH",row:4,col:0,direction:"across"},{id:3,word:"CRUMB",row:0,col:0,direction:"down"},{id:4,word:"VAULT",row:0,col:2,direction:"down"} ] },
  { level: 410, words: [ {id:0,word:"SNARE",row:0,col:0,direction:"across"},{id:1,word:"EVOKE",row:2,col:0,direction:"across"},{id:2,word:"LEERY",row:4,col:0,direction:"across"},{id:3,word:"SHELL",row:0,col:0,direction:"down"},{id:4,word:"ALONE",row:0,col:2,direction:"down"} ] },
  { level: 411, words: [ {id:0,word:"EVICT",row:0,col:0,direction:"across"},{id:1,word:"OCTET",row:2,col:0,direction:"across"},{id:2,word:"ERROR",row:4,col:0,direction:"across"},{id:3,word:"EMOTE",row:0,col:0,direction:"down"},{id:4,word:"INTER",row:0,col:2,direction:"down"} ] },
  { level: 412, words: [ {id:0,word:"GLOBE",row:0,col:0,direction:"across"},{id:1,word:"UNFIT",row:2,col:0,direction:"across"},{id:2,word:"ERROR",row:4,col:0,direction:"across"},{id:3,word:"GAUZE",row:0,col:0,direction:"down"},{id:4,word:"OFFER",row:0,col:2,direction:"down"} ] },
  { level: 413, words: [ {id:0,word:"GRASS",row:0,col:0,direction:"across"},{id:1,word:"MAGIC",row:2,col:0,direction:"across"},{id:2,word:"ALLAY",row:4,col:0,direction:"across"},{id:3,word:"GAMMA",row:0,col:0,direction:"down"},{id:4,word:"ANGEL",row:0,col:2,direction:"down"} ] },
  { level: 414, words: [ {id:0,word:"PUDDLE",row:0,col:0,direction:"across"},{id:1,word:"TIER",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"POTTER",row:0,col:0,direction:"down"},{id:4,word:"DECREE",row:0,col:3,direction:"down"} ] },
  { level: 415, words: [ {id:0,word:"PISTON",row:0,col:0,direction:"across"},{id:1,word:"DING",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"PONDER",row:0,col:0,direction:"down"},{id:4,word:"TOGGLE",row:0,col:3,direction:"down"} ] },
  { level: 416, words: [ {id:0,word:"GADGET",row:0,col:0,direction:"across"},{id:1,word:"ICING",row:2,col:0,direction:"across"},{id:2,word:"ENTER",row:4,col:0,direction:"across"},{id:3,word:"GLIDER",row:0,col:0,direction:"down"},{id:4,word:"EAGER",row:0,col:4,direction:"down"} ] },
  { level: 417, words: [ {id:0,word:"CINDER",row:0,col:0,direction:"across"},{id:1,word:"AORTA",row:2,col:0,direction:"across"},{id:2,word:"THEFT",row:4,col:0,direction:"across"},{id:3,word:"CRAFTY",row:0,col:0,direction:"down"},{id:4,word:"EXALT",row:0,col:4,direction:"down"} ] },
  { level: 418, words: [ {id:0,word:"GLOSS",row:0,col:0,direction:"across"},{id:1,word:"UNCLE",row:2,col:0,direction:"across"},{id:2,word:"EARTH",row:4,col:0,direction:"across"},{id:3,word:"GAUZE",row:0,col:0,direction:"down"},{id:4,word:"OCCUR",row:0,col:2,direction:"down"} ] },
  { level: 419, words: [ {id:0,word:"DREAD",row:0,col:0,direction:"across"},{id:1,word:"COCOA",row:2,col:0,direction:"across"},{id:2,word:"LEERY",row:4,col:0,direction:"across"},{id:3,word:"DECAL",row:0,col:0,direction:"down"},{id:4,word:"EMCEE",row:0,col:2,direction:"down"} ] },
  { level: 420, words: [ {id:0,word:"GRAFT",row:0,col:0,direction:"across"},{id:1,word:"OUTDO",row:2,col:0,direction:"across"},{id:2,word:"PERCH",row:4,col:0,direction:"across"},{id:3,word:"GROUP",row:0,col:0,direction:"down"},{id:4,word:"AFTER",row:0,col:2,direction:"down"} ] },
  { level: 421, words: [ {id:0,word:"CRISP",row:0,col:0,direction:"across"},{id:1,word:"REEDY",row:2,col:0,direction:"across"},{id:2,word:"DITCH",row:4,col:0,direction:"across"},{id:3,word:"CURED",row:0,col:0,direction:"down"},{id:4,word:"INEPT",row:0,col:2,direction:"down"} ] },
  { level: 422, words: [ {id:0,word:"GLOOM",row:0,col:0,direction:"across"},{id:1,word:"OCEAN",row:2,col:0,direction:"across"},{id:2,word:"SPEND",row:4,col:0,direction:"across"},{id:3,word:"GROSS",row:0,col:0,direction:"down"},{id:4,word:"OBESE",row:0,col:2,direction:"down"} ] },
  { level: 423, words: [ {id:0,word:"CUSHY",row:0,col:0,direction:"across"},{id:1,word:"ELECT",row:2,col:0,direction:"across"},{id:2,word:"TARDY",row:4,col:0,direction:"across"},{id:3,word:"CLEFT",row:0,col:0,direction:"down"},{id:4,word:"SMEAR",row:0,col:2,direction:"down"} ] },
  { level: 424, words: [ {id:0,word:"TERROR",row:0,col:0,direction:"across"},{id:1,word:"DIET",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"TENDER",row:0,col:0,direction:"down"},{id:4,word:"RUSTLE",row:0,col:3,direction:"down"} ] },
  { level: 425, words: [ {id:0,word:"ENDURE",row:0,col:0,direction:"across"},{id:1,word:"IDEA",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"ENRICH",row:0,col:0,direction:"down"},{id:4,word:"UNFAIR",row:0,col:3,direction:"down"} ] },
  { level: 426, words: [ {id:0,word:"FINISH",row:0,col:0,direction:"across"},{id:1,word:"INFER",row:2,col:0,direction:"across"},{id:2,word:"HOIST",row:4,col:0,direction:"across"},{id:3,word:"FLIGHT",row:0,col:0,direction:"down"},{id:4,word:"STRUT",row:0,col:4,direction:"down"} ] },
  { level: 427, words: [ {id:0,word:"NOISLY",row:0,col:0,direction:"across"},{id:1,word:"BRAVE",row:2,col:0,direction:"across"},{id:2,word:"LEAKY",row:4,col:0,direction:"across"},{id:3,word:"NIBBLE",row:0,col:0,direction:"down"},{id:4,word:"LEERY",row:0,col:4,direction:"down"} ] },
  { level: 428, words: [ {id:0,word:"SHAPE",row:0,col:0,direction:"across"},{id:1,word:"USURP",row:2,col:0,direction:"across"},{id:2,word:"GREAT",row:4,col:0,direction:"across"},{id:3,word:"STUNG",row:0,col:0,direction:"down"},{id:4,word:"ACUTE",row:0,col:2,direction:"down"} ] },
  { level: 429, words: [ {id:0,word:"LOWLY",row:0,col:0,direction:"across"},{id:1,word:"YIELD",row:2,col:0,direction:"across"},{id:2,word:"LEERY",row:4,col:0,direction:"across"},{id:3,word:"LOYAL",row:0,col:0,direction:"down"},{id:4,word:"WHERE",row:0,col:2,direction:"down"} ] },
  { level: 430, words: [ {id:0,word:"SMACK",row:0,col:0,direction:"across"},{id:1,word:"EMOTE",row:2,col:0,direction:"across"},{id:2,word:"PRESS",row:4,col:0,direction:"across"},{id:3,word:"STEEP",row:0,col:0,direction:"down"},{id:4,word:"ATONE",row:0,col:2,direction:"down"} ] },
  { level: 431, words: [ {id:0,word:"BUNNY",row:0,col:0,direction:"across"},{id:1,word:"ARISE",row:2,col:0,direction:"across"},{id:2,word:"DRYER",row:4,col:0,direction:"across"},{id:3,word:"BLAND",row:0,col:0,direction:"down"},{id:4,word:"NOISY",row:0,col:2,direction:"down"} ] },
  { level: 432, words: [ {id:0,word:"QUEEN",row:0,col:0,direction:"across"},{id:1,word:"EARLY",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"QUERY",row:0,col:0,direction:"down"},{id:4,word:"EERIE",row:0,col:2,direction:"down"} ] },
  { level: 433, words: [ {id:0,word:"PETTY",row:0,col:0,direction:"across"},{id:1,word:"OPERA",row:2,col:0,direction:"across"},{id:2,word:"DRESS",row:4,col:0,direction:"across"},{id:3,word:"PROUD",row:0,col:0,direction:"down"},{id:4,word:"THESE",row:0,col:2,direction:"down"} ] },
  { level: 434, words: [ {id:0,word:"ANYONE",row:0,col:0,direction:"across"},{id:1,word:"ORCA",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"ARDOUR",row:0,col:0,direction:"down"},{id:4,word:"ORNATE",row:0,col:3,direction:"down"} ] },
  { level: 435, words: [ {id:0,word:"SELECT",row:0,col:0,direction:"across"},{id:1,word:"ORCA",row:3,col:0,direction:"across"},{id:2,word:"GRIEVE",row:5,col:0,direction:"across"},{id:3,word:"STRONG",row:0,col:0,direction:"down"},{id:4,word:"ESCAPE",row:0,col:3,direction:"down"} ] },
  { level: 436, words: [ {id:0,word:"MOLTEN",row:0,col:0,direction:"across"},{id:1,word:"RECAP",row:2,col:0,direction:"across"},{id:2,word:"AWFUL",row:4,col:0,direction:"across"},{id:3,word:"MORTAL",row:0,col:0,direction:"down"},{id:4,word:"EXPEL",row:0,col:4,direction:"down"} ] },
  { level: 437, words: [ {id:0,word:"ADJUST",row:0,col:0,direction:"across"},{id:1,word:"EAGER",row:2,col:0,direction:"across"},{id:2,word:"USURP",row:4,col:0,direction:"across"},{id:3,word:"AVENUE",row:0,col:0,direction:"down"},{id:4,word:"STREP",row:0,col:4,direction:"down"} ] },
  { level: 438, words: [ {id:0,word:"ESSAY",row:0,col:0,direction:"across"},{id:1,word:"GROUP",row:2,col:0,direction:"across"},{id:2,word:"REPAY",row:4,col:0,direction:"across"},{id:3,word:"EAGER",row:0,col:0,direction:"down"},{id:4,word:"STOOP",row:0,col:2,direction:"down"} ] },
  { level: 439, words: [ {id:0,word:"ACTOR",row:0,col:0,direction:"across"},{id:1,word:"USURP",row:2,col:0,direction:"across"},{id:2,word:"ZAPPY",row:4,col:0,direction:"across"},{id:3,word:"ABUZZ",row:0,col:0,direction:"down"},{id:4,word:"THUMP",row:0,col:2,direction:"down"} ] },
  { level: 440, words: [ {id:0,word:"GIRTH",row:0,col:0,direction:"across"},{id:1,word:"ALLAY",row:2,col:0,direction:"across"},{id:2,word:"PARRY",row:4,col:0,direction:"across"},{id:3,word:"GRASP",row:0,col:0,direction:"down"},{id:4,word:"RULER",row:0,col:2,direction:"down"} ] },
  { level: 441, words: [ {id:0,word:"ABOUT",row:0,col:0,direction:"across"},{id:1,word:"DANCE",row:2,col:0,direction:"across"},{id:2,word:"DWELT",row:4,col:0,direction:"across"},{id:3,word:"AIDED",row:0,col:0,direction:"down"},{id:4,word:"OUNCE",row:0,col:2,direction:"down"} ] },
  { level: 442, words: [ {id:0,word:"TENSE",row:0,col:0,direction:"across"},{id:1,word:"ICING",row:2,col:0,direction:"across"},{id:2,word:"ELEGY",row:4,col:0,direction:"across"},{id:3,word:"TRITE",row:0,col:0,direction:"down"},{id:4,word:"NAIVE",row:0,col:2,direction:"down"} ] },
  { level: 443, words: [ {id:0,word:"AIDED",row:0,col:0,direction:"across"},{id:1,word:"INDEX",row:2,col:0,direction:"across"},{id:2,word:"EJECT",row:4,col:0,direction:"across"},{id:3,word:"ASIDE",row:0,col:0,direction:"down"},{id:4,word:"DODGE",row:0,col:2,direction:"down"} ] },
  { level: 444, words: [ {id:0,word:"PIRATE",row:0,col:0,direction:"across"},{id:1,word:"LIEU",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"PILLAR",row:0,col:0,direction:"down"},{id:4,word:"ASSUME",row:0,col:3,direction:"down"} ] },
  { level: 445, words: [ {id:0,word:"CRISIS",row:0,col:0,direction:"across"},{id:1,word:"TIFF",row:3,col:0,direction:"across"},{id:2,word:"MIRROR",row:5,col:0,direction:"across"},{id:3,word:"CUSTOM",row:0,col:0,direction:"down"},{id:4,word:"SUFFER",row:0,col:3,direction:"down"} ] },
  { level: 446, words: [ {id:0,word:"JUNGLE",row:0,col:0,direction:"across"},{id:1,word:"VIOLA",row:2,col:0,direction:"across"},{id:2,word:"ABBEY",row:4,col:0,direction:"across"},{id:3,word:"JOVIAL",row:0,col:0,direction:"down"},{id:4,word:"LEAFY",row:0,col:4,direction:"down"} ] },
  { level: 447, words: [ {id:0,word:"IMPORT",row:0,col:0,direction:"across"},{id:1,word:"VAULT",row:2,col:0,direction:"across"},{id:2,word:"TABBY",row:4,col:0,direction:"across"},{id:3,word:"INVITE",row:0,col:0,direction:"down"},{id:4,word:"RETRY",row:0,col:4,direction:"down"} ] },
  { level: 448, words: [ {id:0,word:"BLOWN",row:0,col:0,direction:"across"},{id:1,word:"AMEND",row:2,col:0,direction:"across"},{id:2,word:"DRAWN",row:4,col:0,direction:"across"},{id:3,word:"BRAID",row:0,col:0,direction:"down"},{id:4,word:"OPERA",row:0,col:2,direction:"down"} ] },
  { level: 449, words: [ {id:0,word:"CARGO",row:0,col:0,direction:"across"},{id:1,word:"AVAIL",row:2,col:0,direction:"across"},{id:2,word:"RUMOR",row:4,col:0,direction:"across"},{id:3,word:"CHAIR",row:0,col:0,direction:"down"},{id:4,word:"REALM",row:0,col:2,direction:"down"} ] },
  { level: 450, words: [ {id:0,word:"MESSY",row:0,col:0,direction:"across"},{id:1,word:"NEEDY",row:2,col:0,direction:"across"},{id:2,word:"YOKEL",row:4,col:0,direction:"across"},{id:3,word:"MANLY",row:0,col:0,direction:"down"},{id:4,word:"SLEEK",row:0,col:2,direction:"down"} ] },
  { level: 451, words: [ {id:0,word:"NIGHT",row:0,col:0,direction:"across"},{id:1,word:"NOISY",row:2,col:0,direction:"across"},{id:2,word:"AMEND",row:4,col:0,direction:"across"},{id:3,word:"NINJA",row:0,col:0,direction:"down"},{id:4,word:"GUIDE",row:0,col:2,direction:"down"} ] },
  { level: 452, words: [ {id:0,word:"STAGE",row:0,col:0,direction:"across"},{id:1,word:"IGLOO",row:2,col:0,direction:"across"},{id:2,word:"KAYAK",row:4,col:0,direction:"across"},{id:3,word:"SMIRK",row:0,col:0,direction:"down"},{id:4,word:"ALLAY",row:0,col:2,direction:"down"} ] },
  { level: 453, words: [ {id:0,word:"CLONE",row:0,col:0,direction:"across"},{id:1,word:"ISSUE",row:2,col:0,direction:"across"},{id:2,word:"POTTY",row:4,col:0,direction:"across"},{id:3,word:"CHIMP",row:0,col:0,direction:"down"},{id:4,word:"ONSET",row:0,col:2,direction:"down"} ] },
  { level: 454, words: [ {id:0,word:"GOBBLE",row:0,col:0,direction:"across"},{id:1,word:"WALK",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"GROWTH",row:0,col:0,direction:"down"},{id:4,word:"BEAKER",row:0,col:3,direction:"down"} ] },
  { level: 455, words: [ {id:0,word:"HUSTLE",row:0,col:0,direction:"across"},{id:1,word:"TUFT",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"HALTER",row:0,col:0,direction:"down"},{id:4,word:"TURTLE",row:0,col:3,direction:"down"} ] },
  { level: 456, words: [ {id:0,word:"CHANGE",row:0,col:0,direction:"across"},{id:1,word:"NINJA",row:2,col:0,direction:"across"},{id:2,word:"OXIDE",row:4,col:0,direction:"across"},{id:3,word:"CANNON",row:0,col:0,direction:"down"},{id:4,word:"GRADE",row:0,col:4,direction:"down"} ] },
  { level: 457, words: [ {id:0,word:"LANCER",row:0,col:0,direction:"across"},{id:1,word:"ULTRA",row:2,col:0,direction:"across"},{id:2,word:"CHASE",row:4,col:0,direction:"across"},{id:3,word:"LAUNCH",row:0,col:0,direction:"down"},{id:4,word:"ERASE",row:0,col:4,direction:"down"} ] },
  { level: 458, words: [ {id:0,word:"TITLE",row:0,col:0,direction:"across"},{id:1,word:"STIFF",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"TESTY",row:0,col:0,direction:"down"},{id:4,word:"TWICE",row:0,col:2,direction:"down"} ] },
  { level: 459, words: [ {id:0,word:"PHASE",row:0,col:0,direction:"across"},{id:1,word:"NATTY",row:2,col:0,direction:"across"},{id:2,word:"YACHT",row:4,col:0,direction:"across"},{id:3,word:"PINKY",row:0,col:0,direction:"down"},{id:4,word:"ANTIC",row:0,col:2,direction:"down"} ] },
  { level: 460, words: [ {id:0,word:"AORTA",row:0,col:0,direction:"across"},{id:1,word:"GOUGE",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"ANGRY",row:0,col:0,direction:"down"},{id:4,word:"ROUTE",row:0,col:2,direction:"down"} ] },
  { level: 461, words: [ {id:0,word:"SPAWN",row:0,col:0,direction:"across"},{id:1,word:"USURP",row:2,col:0,direction:"across"},{id:2,word:"KITTY",row:4,col:0,direction:"across"},{id:3,word:"STUCK",row:0,col:0,direction:"down"},{id:4,word:"ADULT",row:0,col:2,direction:"down"} ] },
  { level: 462, words: [ {id:0,word:"YOUNG",row:0,col:0,direction:"across"},{id:1,word:"EXCEL",row:2,col:0,direction:"across"},{id:2,word:"DREAM",row:4,col:0,direction:"across"},{id:3,word:"YIELD",row:0,col:0,direction:"down"},{id:4,word:"UNCLE",row:0,col:2,direction:"down"} ] },
  { level: 463, words: [ {id:0,word:"SNIFF",row:0,col:0,direction:"across"},{id:1,word:"LUSTY",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"SULKY",row:0,col:0,direction:"down"},{id:4,word:"ISSUE",row:0,col:2,direction:"down"} ] },
  { level: 464, words: [ {id:0,word:"CANOPY",row:0,col:0,direction:"across"},{id:1,word:"UNIT",row:3,col:0,direction:"across"},{id:2,word:"HORROR",row:5,col:0,direction:"across"},{id:3,word:"CROUCH",row:0,col:0,direction:"down"},{id:4,word:"OYSTER",row:0,col:3,direction:"down"} ] },
  { level: 465, words: [ {id:0,word:"HARDLY",row:0,col:0,direction:"across"},{id:1,word:"LULL",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"HAMLET",row:0,col:0,direction:"down"},{id:4,word:"DOLLAR",row:0,col:3,direction:"down"} ] },
  { level: 466, words: [ {id:0,word:"LONELY",row:0,col:0,direction:"across"},{id:1,word:"VASTY",row:2,col:0,direction:"across"},{id:2,word:"LABEL",row:4,col:0,direction:"across"},{id:3,word:"LOVELY",row:0,col:0,direction:"down"},{id:4,word:"LOYAL",row:0,col:4,direction:"down"} ] },
  { level: 467, words: [ {id:0,word:"LOUDLY",row:0,col:0,direction:"across"},{id:1,word:"TAFFY",row:2,col:0,direction:"across"},{id:2,word:"ACTOR",row:4,col:0,direction:"across"},{id:3,word:"LETHAL",row:0,col:0,direction:"down"},{id:4,word:"LAYER",row:0,col:4,direction:"down"} ] },
  { level: 468, words: [ {id:0,word:"RABID",row:0,col:0,direction:"across"},{id:1,word:"MOODY",row:2,col:0,direction:"across"},{id:2,word:"REEDY",row:4,col:0,direction:"across"},{id:3,word:"RUMOR",row:0,col:0,direction:"down"},{id:4,word:"BROKE",row:0,col:2,direction:"down"} ] },
  { level: 469, words: [ {id:0,word:"DELAY",row:0,col:0,direction:"across"},{id:1,word:"INNER",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"DEITY",row:0,col:0,direction:"down"},{id:4,word:"LANCE",row:0,col:2,direction:"down"} ] },
  { level: 470, words: [ {id:0,word:"AMISS",row:0,col:0,direction:"across"},{id:1,word:"RAINY",row:2,col:0,direction:"across"},{id:2,word:"EAGLE",row:4,col:0,direction:"across"},{id:3,word:"AGREE",row:0,col:0,direction:"down"},{id:4,word:"ICING",row:0,col:2,direction:"down"} ] },
  { level: 471, words: [ {id:0,word:"LOFTY",row:0,col:0,direction:"across"},{id:1,word:"NEEDY",row:2,col:0,direction:"across"},{id:2,word:"ENDOW",row:4,col:0,direction:"across"},{id:3,word:"LANCE",row:0,col:0,direction:"down"},{id:4,word:"FIELD",row:0,col:2,direction:"down"} ] },
  { level: 472, words: [ {id:0,word:"GLOVE",row:0,col:0,direction:"across"},{id:1,word:"ITCHY",row:2,col:0,direction:"across"},{id:2,word:"EARLY",row:4,col:0,direction:"across"},{id:3,word:"GUIDE",row:0,col:0,direction:"down"},{id:4,word:"OCCUR",row:0,col:2,direction:"down"} ] },
  { level: 473, words: [ {id:0,word:"SKULL",row:0,col:0,direction:"across"},{id:1,word:"LYING",row:2,col:0,direction:"across"},{id:2,word:"DRYER",row:4,col:0,direction:"across"},{id:3,word:"SOLID",row:0,col:0,direction:"down"},{id:4,word:"UNIFY",row:0,col:2,direction:"down"} ] },
  { level: 474, words: [ {id:0,word:"CLOSET",row:0,col:0,direction:"across"},{id:1,word:"TRIM",row:3,col:0,direction:"across"},{id:2,word:"CANNON",row:5,col:0,direction:"across"},{id:3,word:"CRITIC",row:0,col:0,direction:"down"},{id:4,word:"SUMMON",row:0,col:3,direction:"down"} ] },
  { level: 475, words: [ {id:0,word:"RANDOM",row:0,col:0,direction:"across"},{id:1,word:"BOAR",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"RUBBER",row:0,col:0,direction:"down"},{id:4,word:"DECREE",row:0,col:3,direction:"down"} ] },
  { level: 476, words: [ {id:0,word:"RENTAL",row:0,col:0,direction:"across"},{id:1,word:"LARVA",row:2,col:0,direction:"across"},{id:2,word:"TWIRL",row:4,col:0,direction:"across"},{id:3,word:"RELATE",row:0,col:0,direction:"down"},{id:4,word:"AVAIL",row:0,col:4,direction:"down"} ] },
  { level: 477, words: [ {id:0,word:"ARDENT",row:0,col:0,direction:"across"},{id:1,word:"CHANT",row:2,col:0,direction:"across"},{id:2,word:"ENVOY",row:4,col:0,direction:"across"},{id:3,word:"ARCHER",row:0,col:0,direction:"down"},{id:4,word:"NATTY",row:0,col:4,direction:"down"} ] },
  { level: 478, words: [ {id:0,word:"SPITE",row:0,col:0,direction:"across"},{id:1,word:"OLIVE",row:2,col:0,direction:"across"},{id:2,word:"CATCH",row:4,col:0,direction:"across"},{id:3,word:"STOIC",row:0,col:0,direction:"down"},{id:4,word:"IDIOT",row:0,col:2,direction:"down"} ] },
  { level: 479, words: [ {id:0,word:"YOUNG",row:0,col:0,direction:"across"},{id:1,word:"MEALY",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"YUMMY",row:0,col:0,direction:"down"},{id:4,word:"USAGE",row:0,col:2,direction:"down"} ] },
  { level: 480, words: [ {id:0,word:"HONEY",row:0,col:0,direction:"across"},{id:1,word:"FUNGI",row:2,col:0,direction:"across"},{id:2,word:"YIELD",row:4,col:0,direction:"across"},{id:3,word:"HEFTY",row:0,col:0,direction:"down"},{id:4,word:"NONCE",row:0,col:2,direction:"down"} ] },
  { level: 481, words: [ {id:0,word:"USAGE",row:0,col:0,direction:"across"},{id:1,word:"FOUND",row:2,col:0,direction:"across"},{id:2,word:"TWERP",row:4,col:0,direction:"across"},{id:3,word:"UNFIT",row:0,col:0,direction:"down"},{id:4,word:"ACUTE",row:0,col:2,direction:"down"} ] },
  { level: 482, words: [ {id:0,word:"ANGRY",row:0,col:0,direction:"across"},{id:1,word:"FEAST",row:2,col:0,direction:"across"},{id:2,word:"LATCH",row:4,col:0,direction:"across"},{id:3,word:"AWFUL",row:0,col:0,direction:"down"},{id:4,word:"GRAFT",row:0,col:2,direction:"down"} ] },
  { level: 483, words: [ {id:0,word:"CRIME",row:0,col:0,direction:"across"},{id:1,word:"EXPEL",row:2,col:0,direction:"across"},{id:2,word:"RULER",row:4,col:0,direction:"across"},{id:3,word:"CLEAR",row:0,col:0,direction:"down"},{id:4,word:"IMPEL",row:0,col:2,direction:"down"} ] },
  { level: 484, words: [ {id:0,word:"RADISH",row:0,col:0,direction:"across"},{id:1,word:"ALSO",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"REPAIR",row:0,col:0,direction:"down"},{id:4,word:"IMPOSE",row:0,col:3,direction:"down"} ] },
  { level: 485, words: [ {id:0,word:"SADDLE",row:0,col:0,direction:"across"},{id:1,word:"RING",row:3,col:0,direction:"across"},{id:2,word:"TERROR",row:5,col:0,direction:"across"},{id:3,word:"SECRET",row:0,col:0,direction:"down"},{id:4,word:"DAGGER",row:0,col:3,direction:"down"} ] },
  { level: 486, words: [ {id:0,word:"FLYING",row:0,col:0,direction:"across"},{id:1,word:"INNER",row:2,col:0,direction:"across"},{id:2,word:"CHAFE",row:4,col:0,direction:"across"},{id:3,word:"FLINCH",row:0,col:0,direction:"down"},{id:4,word:"NERVE",row:0,col:4,direction:"down"} ] },
  { level: 487, words: [ {id:0,word:"CANDLE",row:0,col:0,direction:"across"},{id:1,word:"MELON",row:2,col:0,direction:"across"},{id:2,word:"DONOR",row:4,col:0,direction:"across"},{id:3,word:"COMEDY",row:0,col:0,direction:"down"},{id:4,word:"LINER",row:0,col:4,direction:"down"} ] },
  { level: 488, words: [ {id:0,word:"BLADE",row:0,col:0,direction:"across"},{id:1,word:"ROOST",row:2,col:0,direction:"across"},{id:2,word:"TITHE",row:4,col:0,direction:"across"},{id:3,word:"BURST",row:0,col:0,direction:"down"},{id:4,word:"AFOOT",row:0,col:2,direction:"down"} ] },
  { level: 489, words: [ {id:0,word:"TOUGH",row:0,col:0,direction:"across"},{id:1,word:"INDEX",row:2,col:0,direction:"across"},{id:2,word:"DIRTY",row:4,col:0,direction:"across"},{id:3,word:"THIRD",row:0,col:0,direction:"down"},{id:4,word:"UDDER",row:0,col:2,direction:"down"} ] },
  { level: 490, words: [ {id:0,word:"STEAL",row:0,col:0,direction:"across"},{id:1,word:"PIETY",row:2,col:0,direction:"across"},{id:2,word:"RETCH",row:4,col:0,direction:"across"},{id:3,word:"SUPER",row:0,col:0,direction:"down"},{id:4,word:"ERECT",row:0,col:2,direction:"down"} ] },
  { level: 491, words: [ {id:0,word:"STEAM",row:0,col:0,direction:"across"},{id:1,word:"USAGE",row:2,col:0,direction:"across"},{id:2,word:"KNELT",row:4,col:0,direction:"across"},{id:3,word:"STUCK",row:0,col:0,direction:"down"},{id:4,word:"EVADE",row:0,col:2,direction:"down"} ] },
  { level: 492, words: [ {id:0,word:"LONER",row:0,col:0,direction:"across"},{id:1,word:"VOILA",row:2,col:0,direction:"across"},{id:2,word:"REEDY",row:4,col:0,direction:"across"},{id:3,word:"LOVER",row:0,col:0,direction:"down"},{id:4,word:"NOISE",row:0,col:2,direction:"down"} ] },
  { level: 493, words: [ {id:0,word:"ACTOR",row:0,col:0,direction:"across"},{id:1,word:"EBONY",row:2,col:0,direction:"across"},{id:2,word:"DUNCE",row:4,col:0,direction:"across"},{id:3,word:"AHEAD",row:0,col:0,direction:"down"},{id:4,word:"THORN",row:0,col:2,direction:"down"} ] },
  { level: 494, words: [ {id:0,word:"BREACH",row:0,col:0,direction:"across"},{id:1,word:"HOBO",row:3,col:0,direction:"across"},{id:2,word:"RECEDE",row:5,col:0,direction:"across"},{id:3,word:"BOTHER",row:0,col:0,direction:"down"},{id:4,word:"ANYONE",row:0,col:3,direction:"down"} ] },
  { level: 495, words: [ {id:0,word:"NEARLY",row:0,col:0,direction:"across"},{id:1,word:"RAGA",row:3,col:0,direction:"across"},{id:2,word:"WEDDED",row:5,col:0,direction:"across"},{id:3,word:"NARROW",row:0,col:0,direction:"down"},{id:4,word:"REGARD",row:0,col:3,direction:"down"} ] },
  { level: 496, words: [ {id:0,word:"FIDDLE",row:0,col:0,direction:"across"},{id:1,word:"TACKY",row:2,col:0,direction:"across"},{id:2,word:"REPEL",row:4,col:0,direction:"across"},{id:3,word:"FUTURE",row:0,col:0,direction:"down"},{id:4,word:"LOYAL",row:0,col:4,direction:"down"} ] },
  { level: 497, words: [ {id:0,word:"REVEAL",row:0,col:0,direction:"across"},{id:1,word:"TRACE",row:2,col:0,direction:"across"},{id:2,word:"IDIOT",row:4,col:0,direction:"across"},{id:3,word:"RETAIN",row:0,col:0,direction:"down"},{id:4,word:"ADEPT",row:0,col:4,direction:"down"} ] },
  { level: 498, words: [ {id:0,word:"WHOLE",row:0,col:0,direction:"across"},{id:1,word:"ARISE",row:2,col:0,direction:"across"},{id:2,word:"HYENA",row:4,col:0,direction:"across"},{id:3,word:"WRATH",row:0,col:0,direction:"down"},{id:4,word:"OXIDE",row:0,col:2,direction:"down"} ] },
  { level: 499, words: [ {id:0,word:"RUDDY",row:0,col:0,direction:"across"},{id:1,word:"SOFTY",row:2,col:0,direction:"across"},{id:2,word:"NURSE",row:4,col:0,direction:"across"},{id:3,word:"RESIN",row:0,col:0,direction:"down"},{id:4,word:"DEFER",row:0,col:2,direction:"down"} ] },
  { level: 500, words: [ {id:0,word:"FINAL",row:0,col:0,direction:"across"},{id:1,word:"OUNCE",row:2,col:0,direction:"across"},{id:2,word:"AGAIN",row:4,col:0,direction:"across"},{id:3,word:"FLORA",row:0,col:0,direction:"down"},{id:4,word:"NINJA",row:0,col:2,direction:"down"} ] }
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

  const d = new Date();
  const dateStr = d.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});
  const modeLabel = mode==="daily" ? `Daily Challenge — ${dateStr}` : `Level ${level}`;
  const streakLine = mode==="daily" && streak>0 ? `🔥 ${streak} day streak\n` : "";

  const shareText = [
    `🗞 CROSSWORDS`,
    `${modeLabel}`,
    ``,
    `⏱ ${fmt(seconds)}`,
    streakLine.trim(),
    `Play at: ${window.location.href}`,
  ].filter(Boolean).join("\n");

  function share() {
    if (navigator.share) navigator.share({title:"Crosswords",text:shareText}).catch(()=>{});
    else navigator.clipboard.writeText(shareText).then(()=>alert("Copied to clipboard!"));
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
        {/* Header */}
        <div style={{borderTop:`3px solid ${C.text}`,borderBottom:`3px solid ${C.text}`,padding:"6px 0",marginBottom:16,textAlign:"center"}}>
          <div style={{fontSize:20,fontWeight:"bold",letterSpacing:"0.1em"}}>CROSSWORDS</div>
          <div style={{fontSize:11,color:C.textLight,letterSpacing:"0.2em",textTransform:"uppercase"}}>{modeLabel}</div>
        </div>

        {/* Time — the only stat */}
        <div style={{fontSize:56,fontWeight:"bold",color:C.text,lineHeight:1}}>{fmt(seconds)}</div>
        <div style={{fontSize:12,color:C.textLight,marginTop:4,letterSpacing:"0.1em",textTransform:"uppercase"}}>completion time</div>

        {mode==="daily" && streak>0 && (
          <div style={{fontSize:14,color:C.gold,fontWeight:"bold",marginTop:12}}>🔥 {streak} day streak</div>
        )}

        <button onClick={share} style={{
          marginTop:24,background:C.text,border:"none",borderRadius:10,
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
  const [tab,    setTab]    = useState("streak"); // streak | points | speed | today

  useEffect(()=>{
    fetchLeaderboard().then(data=>setScores(data||[]));
  },[]);

  const fmt = s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const todayKey = getTodayKey();

  // Aggregate per user for all-time tabs
  const userMap = {};
  (scores||[]).forEach(s=>{
    if (!userMap[s.username]) userMap[s.username]={username:s.username,streak:0,totalScore:0,count:0,times:[],bestDaily:null};
    const u=userMap[s.username];
    u.totalScore += (s.score||0);
    u.count++;
    if (s.seconds) u.times.push(s.seconds);
    if (s.mode==="daily" && s.seconds && (u.bestDaily===null || s.seconds < u.bestDaily)) u.bestDaily=s.seconds;
    if (s.streak>u.streak) u.streak=s.streak;
  });

  const users = Object.values(userMap).map(u=>({
    ...u,
    avgTime: u.times.length ? Math.round(u.times.reduce((a,b)=>a+b,0)/u.times.length) : 9999,
  }));

  // Today's daily — one entry per user, best time if submitted multiple times
  const todayMap = {};
  (scores||[]).filter(s=>s.mode==="daily" && s.created_at?.startsWith(todayKey.replace(/-(\d)$/,"-0$1").replace(/-(\d)-/,"-0$1-"))||
    (s.mode==="daily" && s.created_at && (()=>{
      const d=new Date(s.created_at);
      return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`===todayKey;
    })())
  ).forEach(s=>{
    if (!todayMap[s.username] || s.seconds < todayMap[s.username].seconds) {
      todayMap[s.username] = s;
    }
  });
  const todayEntries = Object.values(todayMap).sort((a,b)=>a.seconds-b.seconds);

  const sorted = tab==="today" ? [] : [...users].sort((a,b)=>{
    if (tab==="streak") return b.streak-a.streak || b.count-a.count;
    if (tab==="points") return b.totalScore-a.totalScore || b.count-a.count;
    return a.avgTime-b.avgTime || b.count-a.count;
  });

  const medalColor = i=>i===0?"#c9a227":i===1?"#9a9a9a":i===2?"#8a5a2a":C.accentLt;
  const medalText  = i=>i<3?"#fff":C.textMid;

  const displayList = tab==="today" ? todayEntries : sorted;
  const isEmpty = tab==="today" ? todayEntries.length===0 : sorted.length===0;

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

        {/* Tabs — 2x2 grid to fit 4 */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:16}}>
          {[["streak","🔥 Streak"],["points","⭐ Points"],["speed","⚡ Avg Time"],["today","📰 Today"]].map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)} style={{
              padding:"9px 4px",borderRadius:8,fontSize:12,fontWeight:"bold",
              background:tab===key?C.text:C.card,
              color:tab===key?C.bg:C.textMid,
              border:`1px solid ${C.border}`,cursor:"pointer",fontFamily:"Georgia,serif",
            }}>{label}</button>
          ))}
        </div>

        {tab==="today" && (
          <div style={{fontSize:12,color:C.textLight,marginBottom:12,textAlign:"center",fontStyle:"italic"}}>
            Today's daily challenge — fastest completions
          </div>
        )}

        {scores===null ? (
          <div style={{textAlign:"center",color:C.textLight,padding:40}}>Loading...</div>
        ) : isEmpty ? (
          <div style={{textAlign:"center",color:C.textLight,padding:40,fontStyle:"italic"}}>
            {tab==="today" ? "Nobody has completed today's challenge yet — be the first!" : "No scores yet — be the first!"}
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {displayList.map((u,i)=>{
              const isMe = u.username === localStorage.getItem("cw_username");
              return (
              <div key={u.username} style={{
                background: isMe ? C.goldLt : C.card,
                border:`1px solid ${isMe ? C.gold : i<3 ? C.borderDark : C.border}`,
                borderRadius:10,padding:"12px 16px",
                display:"flex",alignItems:"center",gap:12,
              }}>
                <div style={{
                  width:28,height:28,borderRadius:"50%",
                  background:medalColor(i),display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:11,fontWeight:"bold",color:medalText(i),flexShrink:0,
                  lineHeight:1,fontFamily:"Georgia,serif",paddingTop:1,
                }}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:"bold",fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {u.username}{isMe && <span style={{fontSize:11,color:C.gold,marginLeft:6}}>← you</span>}
                  </div>
                  <div style={{fontSize:11,color:C.textLight}}>
                    {tab==="today" ? `Score: ${u.score}/100` : `${u.count} puzzle${u.count!==1?"s":""} completed`}
                    {tab==="streak" && u.bestDaily && <span style={{marginLeft:6,color:C.gold}}>⚡ {fmt(u.bestDaily)}</span>}
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontWeight:"bold",fontSize:18,color:C.text}}>
                    {tab==="streak"?`${u.streak}🔥`:tab==="points"?u.totalScore:tab==="today"?fmt(u.seconds):fmt(u.avgTime)}
                  </div>
                  <div style={{fontSize:10,color:C.textLight}}>
                    {tab==="streak"?"days":tab==="points"?"total pts":"time"}
                  </div>
                </div>
              </div>
              );
            })}
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
const BANNED_WORDS_SUBSTRING = [
  "fuck","shit","cunt","pussy","arse","twat","wank","bastard","bollocks",
  "slut","whore","nigger","nigga","chink","faggot","retard","spastic",
  "rape","pedo","paedo","nazi","hitler","porn","nude","naked","dildo",
  "viagra","spunk","boobs",
].map(w=>w.toLowerCase());

// These are only banned as whole words to avoid blocking legitimate names
const BANNED_WORDS_WHOLE = [
  "ass","dick","cock","fag","cum","sex","tits","bitch","prick",
].map(w=>w.toLowerCase());

function containsBannedWord(name) {
  const lower = name.toLowerCase();
  if (BANNED_WORDS_SUBSTRING.some(w => lower.includes(w))) return true;
  if (BANNED_WORDS_WHOLE.some(w => new RegExp(`\\b${w}\\b`).test(lower))) return true;
  return false;
}

function UsernameScreen({ onSet }) {
  const [value,       setValue]       = useState("");
  const [error,       setError]       = useState("");
  const [checking,    setChecking]    = useState(false);
  const [showHow,     setShowHow]     = useState(false);
  const [pinMode,     setPinMode]     = useState(null); // null | "recover" | "setup"
  const [pinUsername, setPinUsername] = useState("");
  const [pinValue,    setPinValue]    = useState("");

  async function submit() {
    const name = value.trim();
    if (!name)           { setError("Please enter a username"); return; }
    if (name.length < 2) { setError("At least 2 characters"); return; }
    if (name.length > 20){ setError("Max 20 characters"); return; }
    if (containsBannedWord(name)) { setError("Please choose an appropriate username"); return; }

    // Returning player on same device — skip check
    const savedName = localStorage.getItem("cw_username");
    if (savedName === name) { onSet(name); return; }

    setChecking(true);
    setError("");
    const deviceId = getDeviceId();

    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve("timeout"), 5000));
    const checkPromise = checkUsername(name, deviceId);
    const status = await Promise.race([checkPromise, timeoutPromise]);

    setChecking(false);

    if (status === "timeout" || status === "yours") {
      onSet(name);
      return;
    }

    if (status === "free") {
      // New user — register and ask to set PIN
      await registerUsername(name, deviceId);
      onSet(name, true); // true = show PIN setup
      return;
    }

    if (typeof status === "object" && status.status === "taken") {
      // Username taken — show PIN recovery
      setPinMode("recover");
      setPinUsername(name);
      return;
    }

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

        {/* PIN Recovery mode */}
        {pinMode==="recover" && (
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:12}}>
            <div style={{fontSize:14,fontWeight:"bold",marginBottom:4}}>"{pinUsername}" is taken</div>
            <div style={{fontSize:13,color:C.textMid,marginBottom:12}}>Enter your 4-digit PIN to recover your account</div>
            <input
              value={pinValue}
              onChange={e=>setPinValue(e.target.value.replace(/\D/g,"").slice(0,4))}
              placeholder="Enter PIN"
              inputMode="numeric"
              maxLength={4}
              style={{
                width:"100%",background:C.bg,border:`1.5px solid ${C.borderDark}`,
                borderRadius:10,padding:"14px 16px",color:C.text,
                fontSize:24,fontFamily:"Georgia,serif",marginBottom:8,
                boxSizing:"border-box",outline:"none",textAlign:"center",
                letterSpacing:"0.5em",
              }}
            />
            {error&&<div style={{fontSize:13,color:C.red,marginBottom:8,fontStyle:"italic"}}>{error}</div>}
            <button onClick={async()=>{
              if (pinValue.length !== 4) { setError("Please enter your 4-digit PIN"); return; }
              setChecking(true); setError("");
              const ok = await verifyPin(pinUsername, pinValue);
              if (ok) {
                await updateDeviceId(pinUsername, getDeviceId());
                // Load progress from scores table
                const progress = await loadProgressFromCloud(pinUsername);
                if (progress) {
                  if (progress.level) localStorage.setItem("cw_level", String(progress.level));
                  if (progress.streak) localStorage.setItem("cw_streak", String(progress.streak));
                }
                localStorage.setItem("cw_username", pinUsername);
                localStorage.setItem("cw_pin_set", "1");
                setChecking(false);
                // Reload to pick up all restored values fresh
                window.location.reload();
              } else {
                setError("Incorrect PIN — please try again");
                setChecking(false);
              }
            }} disabled={checking} style={{
              width:"100%",background:C.text,border:"none",borderRadius:10,
              color:C.bg,padding:"14px",fontSize:16,fontWeight:"bold",
              cursor:"pointer",fontFamily:"Georgia,serif",marginBottom:8,
            }}>{checking ? "Checking..." : "Recover Account →"}</button>
            <button onClick={()=>{setPinMode(null);setError("");setPinValue("");}} style={{
              width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:10,
              color:C.textMid,padding:"11px",fontSize:13,cursor:"pointer",fontFamily:"Georgia,serif",
            }}>← Try a different username</button>
          </div>
        )}

        {/* Normal username input */}
        {!pinMode && (<>
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
          <button onClick={submit} disabled={checking} style={{
            width:"100%",background:checking?C.card:C.text,border:"none",borderRadius:10,
            color:checking?C.textMid:C.bg,padding:"14px",fontSize:16,fontWeight:"bold",
            cursor:checking?"default":"pointer",fontFamily:"Georgia,serif",marginBottom:10,
          }}>{checking ? "Checking..." : "Play Now →"}</button>
          <button onClick={()=>setShowHow(true)} style={{
            width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:10,
            color:C.textMid,padding:"11px",fontSize:13,cursor:"pointer",fontFamily:"Georgia,serif",
          }}>❓ How to Play</button>
        </>)}
      </div>
    </div>
  );
}

// ─── PIN SETUP ───────────────────────────────────────────────────────────────
function PinSetup({ username, onDone }) {
  const [pin,     setPin]     = useState("");
  const [confirm, setConfirm] = useState("");
  const [error,   setError]   = useState("");
  const [saving,  setSaving]  = useState(false);

  async function save() {
    if (pin.length !== 4) { setError("Please enter a 4-digit PIN"); return; }
    if (pin !== confirm)  { setError("PINs don't match — try again"); return; }
    setSaving(true);
    await savePin(username, pin);
    localStorage.setItem("cw_pin_set", "1");
    setSaving(false);
    onDone();
  }

  return (
    <div style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20,
    }}>
      <div style={{
        background:C.bg,borderRadius:20,padding:28,width:"100%",maxWidth:340,
        border:`2px solid ${C.borderDark}`,textAlign:"center",
      }}>
        <div style={{fontSize:28,marginBottom:8}}>🔐</div>
        <div style={{fontSize:18,fontWeight:"bold",marginBottom:6}}>Set a recovery PIN</div>
        <div style={{fontSize:13,color:C.textMid,marginBottom:20}}>
          Choose a 4-digit PIN to protect your progress. If you ever lose access you can use it to recover your account.
        </div>
        <input
          value={pin}
          onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,4))}
          placeholder="Choose PIN"
          inputMode="numeric"
          maxLength={4}
          style={{
            width:"100%",background:C.card,border:`1.5px solid ${C.borderDark}`,
            borderRadius:10,padding:"14px",color:C.text,fontSize:24,
            fontFamily:"Georgia,serif",marginBottom:8,boxSizing:"border-box",
            outline:"none",textAlign:"center",letterSpacing:"0.5em",
          }}
        />
        <input
          value={confirm}
          onChange={e=>setConfirm(e.target.value.replace(/\D/g,"").slice(0,4))}
          placeholder="Confirm PIN"
          inputMode="numeric"
          maxLength={4}
          style={{
            width:"100%",background:C.card,border:`1.5px solid ${C.borderDark}`,
            borderRadius:10,padding:"14px",color:C.text,fontSize:24,
            fontFamily:"Georgia,serif",marginBottom:8,boxSizing:"border-box",
            outline:"none",textAlign:"center",letterSpacing:"0.5em",
          }}
        />
        {error&&<div style={{fontSize:13,color:C.red,marginBottom:8,fontStyle:"italic"}}>{error}</div>}
        <button onClick={save} disabled={saving} style={{
          width:"100%",background:C.text,border:"none",borderRadius:10,
          color:C.bg,padding:"14px",fontSize:16,fontWeight:"bold",
          cursor:"pointer",fontFamily:"Georgia,serif",marginBottom:8,
        }}>{saving ? "Saving..." : "Set PIN →"}</button>
        <button onClick={()=>{ localStorage.setItem("cw_pin_set","1"); onDone(); }} style={{
          width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:10,
          color:C.textMid,padding:"11px",fontSize:13,cursor:"pointer",fontFamily:"Georgia,serif",
        }}>Maybe later</button>
      </div>
    </div>
  );
}

// ─── INSTALL GUIDE ───────────────────────────────────────────────────────────
function InstallGuide({ onClose, hasPins }) {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"Georgia,serif",color:C.text,overflowY:"auto"}}>
      <div style={{maxWidth:480,margin:"0 auto",padding:"24px 16px 60px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:C.text}}>←</button>
          <div style={{fontSize:22,fontWeight:"bold"}}>Add to Home Screen</div>
        </div>

        {!hasPins && (
          <div style={{background:"#fff3cd",border:"1px solid #ffc107",borderRadius:12,padding:16,marginBottom:20}}>
            <div style={{fontSize:15,fontWeight:"bold",marginBottom:4}}>⚠️ Set your PIN first!</div>
            <div style={{fontSize:13,color:"#856404"}}>Before adding to your home screen, please set a recovery PIN in Settings. Without it, you may lose your progress if you ever delete the icon.</div>
          </div>
        )}

        {/* iOS Guide */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:12}}>
          <div style={{fontSize:16,fontWeight:"bold",marginBottom:12}}>🍎 iPhone / iPad</div>
          {[
            {n:1, text:"Open this game in Safari (not Chrome)"},
            {n:2, text:'Tap the Share button at the bottom of the screen (the box with an arrow pointing up)'},
            {n:3, text:'Scroll down and tap "Add to Home Screen"'},
            {n:4, text:'Tap "Add" in the top right corner'},
            {n:5, text:"The game icon will appear on your home screen"},
          ].map(({n,text})=>(
            <div key={n} style={{display:"flex",gap:12,marginBottom:10,alignItems:"flex-start"}}>
              <div style={{
                width:24,height:24,borderRadius:"50%",background:C.text,color:C.bg,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:12,fontWeight:"bold",flexShrink:0,marginTop:1,
              }}>{n}</div>
              <div style={{fontSize:14,color:C.textMid,lineHeight:1.5}}>{text}</div>
            </div>
          ))}
          <div style={{fontSize:12,color:C.textLight,marginTop:8,fontStyle:"italic",borderTop:`1px solid ${C.border}`,paddingTop:8}}>
            Note: Push notifications require iOS 16.4 or later and must be enabled after adding to home screen.
          </div>
        </div>

        {/* Android Guide */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:12}}>
          <div style={{fontSize:16,fontWeight:"bold",marginBottom:12}}>🤖 Android</div>
          {[
            {n:1, text:"Open this game in Chrome"},
            {n:2, text:'Tap the three dots menu in the top right'},
            {n:3, text:'Tap "Add to Home screen"'},
            {n:4, text:'Tap "Add" to confirm'},
            {n:5, text:"The game icon will appear on your home screen"},
          ].map(({n,text})=>(
            <div key={n} style={{display:"flex",gap:12,marginBottom:10,alignItems:"flex-start"}}>
              <div style={{
                width:24,height:24,borderRadius:"50%",background:C.text,color:C.bg,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:12,fontWeight:"bold",flexShrink:0,marginTop:1,
              }}>{n}</div>
              <div style={{fontSize:14,color:C.textMid,lineHeight:1.5}}>{text}</div>
            </div>
          ))}
          <div style={{fontSize:12,color:C.textLight,marginTop:8,fontStyle:"italic",borderTop:`1px solid ${C.border}`,paddingTop:8}}>
            Note: Push notifications work automatically on Android without any extra steps.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SETTINGS SCREEN ─────────────────────────────────────────────────────────
function SettingsScreen({ username, currentLevel, onClose, onResetProgress, onSetPin, onInstallGuide }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const hasPins = !!localStorage.getItem("cw_pin_set");

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"Georgia,serif",color:C.text,overflowY:"auto"}}>
      <div style={{maxWidth:480,margin:"0 auto",padding:"24px 16px 60px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:C.text}}>←</button>
          <div style={{fontSize:22,fontWeight:"bold"}}>Settings</div>
        </div>

        {/* Account */}
        <div style={{fontSize:11,letterSpacing:"0.2em",color:C.textLight,textTransform:"uppercase",marginBottom:8}}>Account</div>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:20,overflow:"hidden"}}>
          <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontSize:12,color:C.textLight}}>Signed in as</div>
            <div style={{fontSize:16,fontWeight:"bold"}}>{username}</div>
          </div>
          <button onClick={onSetPin} style={{
            width:"100%",background:"none",border:"none",padding:"14px 16px",
            color:C.text,textAlign:"left",cursor:"pointer",fontFamily:"Georgia,serif",
            fontSize:15,borderBottom:`1px solid ${C.border}`,
          }}>
            🔐 {hasPins ? "Change recovery PIN" : "Set recovery PIN"}
            {!hasPins && <span style={{fontSize:11,color:"#c0392b",marginLeft:8,fontWeight:"bold"}}>Recommended</span>}
          </button>
          <button onClick={onInstallGuide} style={{
            width:"100%",background:"none",border:"none",padding:"14px 16px",
            color:C.text,textAlign:"left",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:15,
          }}>📱 Add to Home Screen</button>
        </div>

        {/* Progress */}
        <div style={{fontSize:11,letterSpacing:"0.2em",color:C.textLight,textTransform:"uppercase",marginBottom:8}}>Progress</div>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:20,overflow:"hidden"}}>
          <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontSize:12,color:C.textLight}}>Current level</div>
            <div style={{fontSize:16,fontWeight:"bold"}}>{currentLevel} of 500</div>
          </div>
          {currentLevel > 1 && !confirmReset && (
            <button onClick={()=>setConfirmReset(true)} style={{
              width:"100%",background:"none",border:"none",padding:"14px 16px",
              color:"#c0392b",textAlign:"left",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:15,
            }}>↩ Reset progress to Level 1</button>
          )}
          {confirmReset && (
            <div style={{padding:"14px 16px"}}>
              <div style={{fontSize:14,color:C.textMid,marginBottom:12}}>Are you sure? This cannot be undone.</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setConfirmReset(false)} style={{
                  flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:8,
                  padding:"10px",fontSize:13,cursor:"pointer",fontFamily:"Georgia,serif",color:C.textMid,
                }}>Cancel</button>
                <button onClick={()=>{ onResetProgress(); onClose(); }} style={{
                  flex:1,background:"#c0392b",border:"none",borderRadius:8,
                  padding:"10px",fontSize:13,fontWeight:"bold",cursor:"pointer",
                  fontFamily:"Georgia,serif",color:"white",
                }}>Reset</button>
              </div>
            </div>
          )}
        </div>

        {/* About */}
        <div style={{fontSize:11,letterSpacing:"0.2em",color:C.textLight,textTransform:"uppercase",marginBottom:8}}>About</div>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:14,color:C.textMid,lineHeight:1.6}}>
            CROSSWORDS is a free daily word puzzle game.<br/>
            500 levels · 365 daily challenges<br/>
            <span style={{color:C.textLight,fontSize:12}}>crosswordsgame.co.uk</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HOME SCREEN ─────────────────────────────────────────────────────────────
function HomeScreen({ username, currentLevel, streak, onPlay, onDaily, onLeaderboard, onHowToPlay, onResetProgress, onShareDaily, onSetPin, onSettings, dailyDone }) {
  const todayKey = getTodayKey();
  const d = new Date();
  const dateStr = d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});

  return (
    <div style={{
      minHeight:"100vh",background:C.bg,fontFamily:"Georgia,serif",color:C.text,
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,
    }}>
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
          <div style={{fontSize:13,color:C.textLight,marginTop:4}}>Level {currentLevel} / 500</div>
          {(()=>{
            const pbDaily = localStorage.getItem("cw_pb_daily");
            const fmt = s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
            if (!pbDaily) return null;
            return (
              <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,textAlign:"center"}}>
                <div style={{fontSize:11,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.1em"}}>Daily Challenge PB</div>
                <div style={{fontSize:16,fontWeight:"bold",color:C.gold}}>⚡ {fmt(parseInt(pbDaily))}</div>
              </div>
            );
          })()}
        </div>

        {/* Daily Challenge */}
        <button onClick={dailyDone ? undefined : onDaily} disabled={dailyDone} style={{
          width:"100%",background:dailyDone?C.card:C.text,
          border:`2px solid ${dailyDone?C.border:C.text}`,
          borderRadius:12,padding:"18px 20px",marginBottom:dailyDone?6:12,
          color:dailyDone?C.textMid:C.bg,textAlign:"left",
          cursor:dailyDone?"default":"pointer",
          opacity:dailyDone?0.6:1,
          fontFamily:"Georgia,serif",
        }}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase",opacity:0.7,marginBottom:4}}>
                {dailyDone?"✓ Completed — come back tomorrow":"Today"}
              </div>
              <div style={{fontSize:20,fontWeight:"bold"}}>Daily Challenge</div>
              <div style={{fontSize:12,opacity:0.7,marginTop:2}}>{dateStr}</div>
            </div>
            <div style={{fontSize:32}}>📰</div>
          </div>
        </button>
        {dailyDone && (
          <button onClick={onShareDaily} style={{
            width:"100%",background:"none",border:`1px solid ${C.border}`,
            borderRadius:10,padding:"9px",color:C.textMid,
            cursor:"pointer",fontFamily:"Georgia,serif",fontSize:13,
            marginBottom:12,
          }}>📤 Share your result</button>
        )}

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
                <div style={{fontSize:12,color:C.textLight,marginTop:2}}>Level {currentLevel} of 500</div>
              </div>
              <div style={{fontSize:32}}>📖</div>
            </div>
          </button>
        </div>

        {/* Bottom row */}
        <div style={{display:"flex",gap:8}}>
          <button onClick={onLeaderboard} style={{
            flex:1,background:"none",border:`1px solid ${C.border}`,
            borderRadius:12,padding:"14px 6px",
            color:C.textMid,cursor:"pointer",fontFamily:"Georgia,serif",fontSize:13,
          }}>🏆 Leaderboard</button>
          <button onClick={onHowToPlay} style={{
            flex:1,background:"none",border:`1px solid ${C.border}`,
            borderRadius:12,padding:"14px 6px",
            color:C.textMid,cursor:"pointer",fontFamily:"Georgia,serif",fontSize:13,
          }}>❓ How to Play</button>
          <button onClick={onSettings} style={{
            background:"none",border:`1px solid ${C.border}`,
            borderRadius:12,padding:"14px 16px",
            color:C.textMid,cursor:"pointer",fontFamily:"Georgia,serif",fontSize:18,
          }}>⚙️</button>
        </div>
      </div>
    </div>
  );
}

// ─── PUSH PROMPT CHECK ───────────────────────────────────────────────────────
function PushPromptCheck({ username }) {
  const [show, setShow] = useState(false);

  useEffect(()=>{
    async function check() {
      // Don't show if browser notifications explicitly denied
      if (typeof Notification !== "undefined" && Notification.permission === "denied") return;

      // Check subscriptions table — if already subscribed don't ask
      try {
        const rows = await dbRequest("GET", `subscriptions?username=eq.${encodeURIComponent(username)}&select=id&limit=1`);
        if (rows && rows.length > 0) return; // already subscribed
      } catch(e) {}

      // Show the prompt
      setShow(true);
    }
    check();
  }, [username]);

  if (!show) return null;
  return <PushPrompt username={username} onDone={()=>setShow(false)}/>;
}
function PushPrompt({ username, onDone }) {
  const [state, setState] = useState("idle"); // idle | asking | done

  async function handleEnable() {
    setState("asking");
    const ok = await requestPushPermission(username);
    setState(ok ? "done" : "denied");
    if (onDone) onDone();
  }

  function handleDismiss() {
    setState("done");
    if (onDone) onDone();
  }

  if (state === "done" || state === "denied") return null;

  return (
    <div style={{
      background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
      padding:"14px 16px",marginTop:12,textAlign:"center",
    }}>
      <div style={{fontSize:22,marginBottom:6}}>🔔</div>
      <div style={{fontSize:14,fontWeight:"bold",marginBottom:4}}>Never miss a daily challenge</div>
      <div style={{fontSize:12,color:C.textMid,marginBottom:12}}>
        Get a notification each day when the new puzzle drops
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={handleDismiss} style={{
          flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:8,
          color:C.textMid,padding:"9px",fontSize:12,cursor:"pointer",fontFamily:"Georgia,serif",
        }}>Not now</button>
        <button onClick={handleEnable} disabled={state==="asking"} style={{
          flex:2,background:C.text,border:"none",borderRadius:8,
          color:C.bg,padding:"9px",fontSize:12,fontWeight:"bold",
          cursor:"pointer",fontFamily:"Georgia,serif",
        }}>{state==="asking" ? "Enabling..." : "Enable notifications"}</button>
      </div>
    </div>
  );
}

// ─── GAME ────────────────────────────────────────────────────────────────────
function Game({ username, puzzle, mode, level, streak, onComplete, onNext, onBack, blocked }) {
  // If daily already completed and we're not in won state yet, go back
  const [hasStarted, setHasStarted] = useState(false);
  useEffect(()=>{ setHasStarted(true); }, []);
  if (blocked && !hasStarted) { onBack(); return null; }
  const cellMap = buildCellMap(puzzle);
  const allKeys = Object.keys(cellMap);
  const coords  = allKeys.map(k=>k.split(",").map(Number));
  const maxRow  = Math.max(...coords.map(([r])=>r));
  const maxCol  = Math.max(...coords.map(([,c])=>c));

  const [revealed,       setRevealed]       = useState(new Set());
  const [guessedWords,   setGuessedWords]   = useState(new Set());
  const isDaily=mode==="daily";
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
  const [isPerfect,      setIsPerfect]      = useState(true); // no wrong guesses yet
  const [hintUsed,       setHintUsed]       = useState(false);

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
    soundCompletion();
    hapticHeavy();
    const score=calcScore(seconds);
    const grade=getGrade(score);
    const perfect=isPerfect&&!hintUsed;
    const res={score,grade,seconds,perfect};
    setResult(res);
    submitScore({username,mode,level,seconds,score,grade,streak,created_at:new Date().toISOString()});
    onComplete(res);
    if (perfect) {
      // Bigger celebration for perfect game
      setConfetti(true);
      setTimeout(()=>setConfetti(false), 4000);
      setTimeout(()=>showBurst("⭐","Perfect!","No wrong guesses!",C.goldLt,false),300);
    } else {
      setTimeout(()=>showBurst("🏆","Complete!",`${score}/100 — Grade ${grade}`,mode==="daily"?C.goldLt:C.greenLt,true),300);
    }
  },[puzzle.words.length,revealAll,seconds,username,mode,level,streak,isPerfect,hintUsed,onComplete,showBurst]);

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
      soundCorrectLetter();
      hapticLight();
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
      setIsPerfect(false);
      hapticError();
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
        @keyframes cellFlip{0%{transform:rotateY(0deg);background:${C.cellBg}}50%{transform:rotateY(90deg);background:${C.cellBg}}51%{transform:rotateY(90deg);background:${C.cellFilled}}100%{transform:rotateY(0deg);background:${C.cellFilled}}}
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
              // Stagger flip animation based on position for wave effect
              const delay = isPop ? `${(r*3+c)*0.04}s` : "0s";
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
                  transition:"border-color 0.2s",
                  animation:isPop?`cellFlip 0.5s ease ${delay} both`:"none",
                  userSelect:"none",zIndex:1,
                  perspective:"200px",
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

        {/* Hint button — appears when down to last guess */}
        {gameState==="playing" && letterLeft===1 && !hintUsed && (
          <div style={{textAlign:"center",marginTop:8}}>
            <button onClick={()=>{
              // Reveal one random unrevealed letter
              const unrevealed = Object.entries(cellMap)
                .filter(([k])=>!revealed.has(k))
                .map(([,v])=>v.letter);
              if (!unrevealed.length) return;
              const uniqueUnrevealed = [...new Set(unrevealed)];
              const hintLetter = uniqueUnrevealed[Math.floor(Math.random()*uniqueUnrevealed.length)];
              const hits = Object.entries(cellMap).filter(([,v])=>v.letter===hintLetter).map(([k])=>k);
              const newRevealed = new Set(revealed);
              hits.forEach(k=>newRevealed.add(k));
              setRevealed(newRevealed);
              pulseKeys(hits);
              setCorrectLetters(prev=>new Set([...prev,hintLetter]));
              setHintUsed(true);
              setIsPerfect(false);
              const completed = checkCompletedWords(newRevealed, guessedWords);
              if (completed.length>0) {
                const newGuessed = new Set([...guessedWords,...completed.map(w=>w.id)]);
                setGuessedWords(newGuessed);
                const bonus = completed.length*2;
                setLetterLeft(n=>n+bonus);
                setTimeout(()=>checkWin(newGuessed),500);
              } else {
                showBurst("💡",`${hintLetter} revealed!`,"Free hint used",C.goldLt);
              }
            }} style={{
              background:C.goldLt,border:`1px solid ${C.gold}`,borderRadius:10,
              padding:"10px 24px",color:C.text,fontSize:14,fontWeight:"bold",
              cursor:"pointer",fontFamily:"Georgia,serif",
            }}>💡 Reveal a letter (last chance!)</button>
          </div>
        )}
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
                {result?.perfect && (
                  <div style={{fontSize:13,color:C.gold,fontWeight:"bold",marginBottom:6,
                    background:C.goldLt,borderRadius:8,padding:"4px 12px",display:"inline-block"}}>
                    ⭐ Perfect — no wrong guesses!
                  </div>
                )}
                {isDaily && (()=>{
                  const prev = parseInt(localStorage.getItem("cw_pb_daily")||"999999");
                  const isNewPB = result && result.seconds <= prev;
                  return isNewPB ? (
                    <div style={{fontSize:13,color:"#2a9d8f",fontWeight:"bold",marginBottom:6,
                      background:"#e8f8f5",borderRadius:8,padding:"4px 12px",display:"inline-block"}}>
                      ⚡ New personal best!
                    </div>
                  ) : null;
                })()}
                {isDaily&&(result?.streak||streak)>0&&(
                  <div style={{fontSize:16,color:C.gold,fontWeight:"bold",marginBottom:4}}>
                    🔥 {result?.streak||streak} day streak
                    {(result?.streak||streak)>=100&&<span style={{marginLeft:8,fontSize:12,background:C.gold,color:C.bg,borderRadius:6,padding:"2px 8px"}}>💯 Legend</span>}
                    {(result?.streak||streak)>=30&&(result?.streak||streak)<100&&<span style={{marginLeft:8,fontSize:12,background:C.gold,color:C.bg,borderRadius:6,padding:"2px 8px"}}>🏆 30+ days</span>}
                    {(result?.streak||streak)>=7&&(result?.streak||streak)<30&&<span style={{marginLeft:8,fontSize:12,background:C.gold,color:C.bg,borderRadius:6,padding:"2px 8px"}}>⭐ 7+ days</span>}
                  </div>
                )}
                {isDaily&&(result?.streak||streak)>=100&&(
                  <div style={{fontSize:12,color:C.textMid,marginBottom:8,fontStyle:"italic"}}>You are unstoppable!</div>
                )}
                {isDaily&&(result?.streak||streak)>=30&&(result?.streak||streak)<100&&(
                  <div style={{fontSize:12,color:C.textMid,marginBottom:8,fontStyle:"italic"}}>Legendary dedication!</div>
                )}
                {isDaily&&(result?.streak||streak)>=7&&(result?.streak||streak)<30&&(
                  <div style={{fontSize:12,color:C.textMid,marginBottom:8,fontStyle:"italic"}}>One week strong — keep it up!</div>
                )}
                <div style={{fontSize:72,fontWeight:"bold",color:C.text,lineHeight:1}}>{result.grade}</div>
                <div style={{fontSize:22,color:C.text,marginTop:4}}>{result.score}<span style={{fontSize:14,color:C.textLight}}>/100</span></div>
                <div style={{fontSize:13,color:C.textLight,marginTop:2,fontFamily:"monospace"}}>{fmt(result.seconds)}</div>
                {/* Push notification opt-in — daily only */}
                {isDaily && <PushPromptCheck username={username} />}
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
                  setRevealed(new Set());setGuessedWords(new Set());setLetterLeft(startingLetters);
                  setSeconds(0);setGameState("playing");setSelected(null);
                  setWrongLetters(new Set());setCorrectLetters(new Set());
                  setToast(null);setPulsingCells(new Set());setBurst(null);setConfetti(false);
                  setIsPerfect(true);setHintUsed(false);
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
function DailyShareCard({ streak, onClose }) {
  const saved = JSON.parse(localStorage.getItem("cw_daily_result")||"{}");
  return (
    <ShareCard
      username=""
      mode="daily"
      level={0}
      score={saved.score||0}
      grade={saved.grade||""}
      seconds={saved.seconds||0}
      streak={streak}
      puzzle={DAILY_PUZZLES[getDailyIndex()]}
      revealed={new Set()}
      onClose={onClose}
    />
  );
}

export default function Crosswords() {
  const [username, setUsername] = useState(()=>localStorage.getItem("cw_username")||"");
  const [screen,   setScreen]   = useState("home");
  const [streak,   setStreak]   = useState(()=>parseInt(localStorage.getItem("cw_streak")||"0"));
  const [currentLevel, setCurrentLevel] = useState(()=>Math.min(Math.max(parseInt(localStorage.getItem("cw_level")||"1"),1),500));
  const [dailyDone,    setDailyDone]    = useState(()=>localStorage.getItem("cw_daily_done")===getTodayKey());
  const [showDailyPrompt, setShowDailyPrompt] = useState(false);
  const [showHowToPlay,   setShowHowToPlay]   = useState(false);

  // On first load — try to restore/sync progress from cloud via device ID
  useEffect(()=>{
    async function tryCloudRestore() {
      const deviceId = getDeviceId();
      // Find username by device ID
      const playerRows = await dbRequest("GET", `players?device_id=eq.${encodeURIComponent(deviceId)}&select=username,pin&limit=1`);
      const cloudUsername = playerRows && playerRows.length > 0 ? playerRows[0].username : null;
      const cloudPin = playerRows && playerRows.length > 0 ? playerRows[0].pin : null;
      const nameToUse = cloudUsername || username;
      if (!nameToUse) return;

      // Set username if not already set
      if (cloudUsername && !localStorage.getItem("cw_username")) {
        localStorage.setItem("cw_username", cloudUsername);
        setUsername(cloudUsername);
      }

      // Mark PIN as set if one exists in the database
      if (cloudPin && !localStorage.getItem("cw_pin_set")) {
        localStorage.setItem("cw_pin_set", "1");
      }

      // Load progress from scores table
      const progress = await loadProgressFromCloud(nameToUse);
      if (!progress) return;

      if (progress.level && progress.level > parseInt(localStorage.getItem("cw_level")||"1")) {
        localStorage.setItem("cw_level", String(progress.level));
        setCurrentLevel(progress.level);
      }
      if (progress.streak && progress.streak > parseInt(localStorage.getItem("cw_streak")||"0")) {
        localStorage.setItem("cw_streak", String(progress.streak));
        setStreak(progress.streak);
      }
    }
    tryCloudRestore();
  }, []);

  // On first load after username set, prompt for daily if not done
  useEffect(()=>{
    if (username && !dailyDone && screen==="home") setShowDailyPrompt(true);
  },[username]);

  function handleUsernameSet(name, isNew=false) {
    localStorage.setItem("cw_username", name);
    setUsername(name);
    if (!dailyDone) setShowDailyPrompt(true);
    if (isNew) setShowPinSetup(true);
    saveProgressToCloud(name, currentLevel, streak,
      localStorage.getItem("cw_last_daily"),
      localStorage.getItem("cw_daily_done"));
  }

  function handleDailyComplete(result) {
    const todayKey = getTodayKey();
    const lastDay  = localStorage.getItem("cw_last_daily");
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
    const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()+1}-${yesterday.getDate()}`;
    const newStreak = (lastDay===yesterdayKey || lastDay===todayKey) ? streak+1 : 1;
    setStreak(newStreak);
    localStorage.setItem("cw_streak", String(newStreak));
    localStorage.setItem("cw_last_daily", todayKey);
    localStorage.setItem("cw_daily_done", todayKey);
    localStorage.setItem("cw_daily_result", JSON.stringify({seconds: result.seconds, score: result.score, grade: result.grade}));
    setDailyDone(true);
    result.streak = newStreak;
    // Save daily personal best
    const prevBest = parseInt(localStorage.getItem("cw_pb_daily")||"999999");
    if (result.seconds < prevBest) localStorage.setItem("cw_pb_daily", String(result.seconds));
    // Save to cloud
    saveProgressToCloud(username, currentLevel, newStreak, todayKey, todayKey);
  }

  function handleLevelComplete(result) {
    // Don't advance the level yet — wait until player taps Next
  }

  function handleNextLevel() {
    const next = Math.min(currentLevel+1,500);
    setCurrentLevel(next);
    localStorage.setItem("cw_level",String(next));
    saveProgressToCloud(username, next, streak,
      localStorage.getItem("cw_last_daily"),
      localStorage.getItem("cw_daily_done"));
  }

  const [showDailyShare, setShowDailyShare] = useState(false);
  const [showPinSetup,   setShowPinSetup]   = useState(false);
  const [showSettings,   setShowSettings]   = useState(false);
  const [showInstall,    setShowInstall]    = useState(false);

  // Show PIN setup for existing users who haven't set one yet
  useEffect(()=>{
    if (username && !localStorage.getItem("cw_pin_set")) {
      // Small delay so home screen loads first
      setTimeout(()=>setShowPinSetup(true), 1500);
    }
  }, [username]);

  function handleShareDaily() {
    setShowDailyShare(true);
  }

  function handleResetProgress() {
    setCurrentLevel(1);
    localStorage.setItem("cw_level","1");
  }

  if (!username) return <UsernameScreen onSet={handleUsernameSet}/>;

  if (showSettings) return (
    <SettingsScreen
      username={username}
      currentLevel={currentLevel}
      onClose={()=>setShowSettings(false)}
      onResetProgress={handleResetProgress}
      onSetPin={()=>{ localStorage.removeItem("cw_pin_set"); setShowPinSetup(true); setShowSettings(false); }}
      onInstallGuide={()=>{ setShowInstall(true); setShowSettings(false); }}
    />
  );

  if (showInstall) return (
    <InstallGuide
      onClose={()=>setShowInstall(false)}
      hasPins={!!localStorage.getItem("cw_pin_set")}
    />
  );

  if (screen==="daily") {
    const idx = getDailyIndex();
    const dailyPuzzle = DAILY_PUZZLES[idx];
    // Block re-entry if already completed — but only before the game starts
    // Don't redirect mid-game (won state handles its own display)
    return (
      <Game
        username={username}
        puzzle={dailyPuzzle}
        mode="daily"
        level={idx+1}
        streak={streak}
        onComplete={handleDailyComplete}
        onBack={()=>setScreen("home")}
        blocked={dailyDone}
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
      {showDailyShare && <DailyShareCard streak={streak} onClose={()=>setShowDailyShare(false)}/>}
      {showPinSetup && <PinSetup username={username} onDone={()=>setShowPinSetup(false)}/>}
      <HomeScreen
        username={username}
        currentLevel={currentLevel}
        streak={streak}
        dailyDone={dailyDone}
        onPlay={()=>setScreen("game")}
        onDaily={()=>{ if (!dailyDone) setScreen("daily"); }}
        onLeaderboard={()=>setScreen("leaderboard")}
        onHowToPlay={()=>setShowHowToPlay(true)}
        onResetProgress={handleResetProgress}
        onShareDaily={handleShareDaily}
        onSetPin={()=>{ localStorage.removeItem("cw_pin_set"); setShowPinSetup(true); }}
        onSettings={()=>setShowSettings(true)}
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
