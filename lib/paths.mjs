import os from "node:os";
import path from "node:path";

export const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export const BOT_TYPE = "3";
export const DATA_DIR = path.join(os.homedir(), ".codex-wechat-bridge");
export const ACCOUNT_FILE = path.join(DATA_DIR, "account.json");
export const STATE_FILE = path.join(DATA_DIR, "sessions.json");
export const SYNC_BUF_FILE = path.join(DATA_DIR, "sync_buf.txt");
