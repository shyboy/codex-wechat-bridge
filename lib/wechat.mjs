import crypto from "node:crypto";
import fs from "node:fs";

import {
  ACCOUNT_FILE,
  BOT_TYPE,
  DATA_DIR,
  DEFAULT_BASE_URL,
} from "./paths.mjs";

export {
  ACCOUNT_FILE,
  DATA_DIR,
  DEFAULT_BASE_URL,
};

export const LONG_POLL_TIMEOUT_MS = 35_000;
export const MAX_CONSECUTIVE_FAILURES = 3;
export const BACKOFF_DELAY_MS = 30_000;
export const RETRY_DELAY_MS = 2_000;

const MSG_TYPE_USER = 1;
const MSG_ITEM_TEXT = 1;
const MSG_ITEM_VOICE = 3;
const MSG_TYPE_BOT = 2;
const MSG_STATE_FINISH = 2;

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadCredentials() {
  try {
    if (!fs.existsSync(ACCOUNT_FILE)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(ACCOUNT_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export function saveCredentials(account) {
  ensureDataDir();
  fs.writeFileSync(ACCOUNT_FILE, JSON.stringify(account, null, 2) + "\n", "utf-8");
  try {
    fs.chmodSync(ACCOUNT_FILE, 0o600);
  } catch {
    // Best-effort on non-POSIX platforms.
  }
}

function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

function buildHeaders(token, body) {
  const headers = {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "X-WECHAT-UIN": randomWechatUin(),
  };
  if (body) {
    headers["Content-Length"] = String(Buffer.byteLength(body, "utf-8"));
  }
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

export async function apiFetch({ baseUrl, endpoint, body, token, timeoutMs }) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(endpoint, base).toString();
  const headers = buildHeaders(token, body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    return text;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

export async function fetchQRCode(baseUrl = DEFAULT_BASE_URL) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(
    `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(BOT_TYPE)}`,
    base,
  );
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`QR fetch failed: ${response.status}`);
  }
  return response.json();
}

export async function pollQRStatus(baseUrl, qrcode) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(
    `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
    base,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);

  try {
    const response = await fetch(url.toString(), {
      headers: { "iLink-App-ClientVersion": "1" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      throw new Error(`QR status failed: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === "AbortError") {
      return { status: "wait" };
    }
    throw error;
  }
}

export async function getUpdates(baseUrl, token, getUpdatesBuf) {
  try {
    const raw = await apiFetch({
      baseUrl,
      endpoint: "ilink/bot/getupdates",
      body: JSON.stringify({
        get_updates_buf: getUpdatesBuf,
        base_info: { channel_version: "codex-wechat-bridge/0.1.0" },
      }),
      token,
      timeoutMs: LONG_POLL_TIMEOUT_MS,
    });
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ret: 0, msgs: [], get_updates_buf: getUpdatesBuf };
    }
    throw error;
  }
}

function generateClientId() {
  return `codex-wechat:${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

export async function sendTextMessage(baseUrl, token, to, text, contextToken) {
  const clientId = generateClientId();
  await apiFetch({
    baseUrl,
    endpoint: "ilink/bot/sendmessage",
    body: JSON.stringify({
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: clientId,
        message_type: MSG_TYPE_BOT,
        message_state: MSG_STATE_FINISH,
        item_list: [{ type: MSG_ITEM_TEXT, text_item: { text } }],
        context_token: contextToken,
      },
      base_info: { channel_version: "codex-wechat-bridge/0.1.0" },
    }),
    token,
    timeoutMs: 15_000,
  });
  return clientId;
}

export function isInboundUserMessage(message) {
  return message?.message_type === MSG_TYPE_USER;
}

export function extractTextFromMessage(message) {
  if (!Array.isArray(message?.item_list) || message.item_list.length === 0) {
    return "";
  }

  for (const item of message.item_list) {
    if (item?.type === MSG_ITEM_TEXT && item.text_item?.text) {
      const text = item.text_item.text;
      const ref = item.ref_msg;
      if (!ref) {
        return text;
      }

      const parts = [];
      if (ref.title) {
        parts.push(ref.title);
      }

      if (parts.length === 0) {
        return text;
      }
      return `[引用: ${parts.join(" | ")}]\n${text}`;
    }

    if (item?.type === MSG_ITEM_VOICE && item.voice_item?.text) {
      return item.voice_item.text;
    }
  }

  return "";
}
