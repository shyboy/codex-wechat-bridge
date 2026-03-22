import crypto from "node:crypto";
import fs from "node:fs";

import { DATA_DIR, STATE_FILE, SYNC_BUF_FILE } from "./paths.mjs";

const DEFAULT_STATE = {
  sessions: {},
  recentMessageKeys: [],
};

export function ensureStateFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return structuredClone(DEFAULT_STATE);
    }
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    return {
      sessions: parsed.sessions ?? {},
      recentMessageKeys: Array.isArray(parsed.recentMessageKeys)
        ? parsed.recentMessageKeys
        : [],
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

export function saveState(state) {
  ensureStateFiles();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

export function loadSyncBuf() {
  try {
    if (!fs.existsSync(SYNC_BUF_FILE)) {
      return "";
    }
    return fs.readFileSync(SYNC_BUF_FILE, "utf-8");
  } catch {
    return "";
  }
}

export function saveSyncBuf(syncBuf) {
  ensureStateFiles();
  fs.writeFileSync(SYNC_BUF_FILE, syncBuf, "utf-8");
}

export function getSession(state, senderId) {
  return state.sessions[senderId] ?? null;
}

export function upsertSession(state, senderId, nextValues) {
  state.sessions[senderId] = {
    senderId,
    ...state.sessions[senderId],
    ...nextValues,
  };
}

export function buildMessageKey(message, text) {
  const raw = [
    message?.from_user_id ?? "",
    message?.to_user_id ?? "",
    message?.create_time_ms ?? "",
    message?.client_id ?? "",
    text,
  ].join("|");

  return crypto.createHash("sha1").update(raw).digest("hex");
}

export function hasRecentMessage(state, messageKey) {
  return state.recentMessageKeys.includes(messageKey);
}

export function rememberMessage(state, messageKey) {
  const next = state.recentMessageKeys.filter((item) => item !== messageKey);
  next.push(messageKey);
  state.recentMessageKeys = next.slice(-500);
}
