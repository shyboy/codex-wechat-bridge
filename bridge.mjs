#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import {
  buildWechatPrompt,
  loadInstructionsText,
  runCodexTurn,
} from "./lib/codex.mjs";
import {
  buildMessageKey,
  getSession,
  hasRecentMessage,
  loadState,
  loadSyncBuf,
  rememberMessage,
  saveState,
  saveSyncBuf,
  upsertSession,
} from "./lib/state.mjs";
import {
  BACKOFF_DELAY_MS,
  DEFAULT_BASE_URL,
  MAX_CONSECUTIVE_FAILURES,
  RETRY_DELAY_MS,
  extractTextFromMessage,
  getUpdates,
  isInboundUserMessage,
  loadCredentials,
  sendTextMessage,
} from "./lib/wechat.mjs";

function log(message) {
  process.stderr.write(`[codex-wechat-bridge] ${message}\n`);
}

function logError(message) {
  process.stderr.write(`[codex-wechat-bridge] ERROR: ${message}\n`);
}

function parseArgs(argv) {
  const options = {
    workspace: process.cwd(),
    codexPath: "codex",
    baseUrl: DEFAULT_BASE_URL,
    sandbox: "read-only",
    fullAuto: false,
  };

  function readValue(flag, nextValue) {
    if (!nextValue || nextValue.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    return nextValue;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--workspace":
        options.workspace = readValue(token, argv[index + 1]);
        index += 1;
        break;
      case "--model":
        options.model = readValue(token, argv[index + 1]);
        index += 1;
        break;
      case "--sandbox":
        options.sandbox = readValue(token, argv[index + 1]);
        index += 1;
        break;
      case "--profile":
        options.profile = readValue(token, argv[index + 1]);
        index += 1;
        break;
      case "--codex-path":
        options.codexPath = readValue(token, argv[index + 1]);
        index += 1;
        break;
      case "--instructions":
        options.instructions = readValue(token, argv[index + 1]);
        index += 1;
        break;
      case "--instructions-file":
        options.instructionsFile = readValue(token, argv[index + 1]);
        index += 1;
        break;
      case "--base-url":
        options.baseUrl = readValue(token, argv[index + 1]);
        index += 1;
        break;
      case "--full-auto":
        options.fullAuto = true;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage: node bridge.mjs [options]

Options:
  --workspace <dir>           Workspace used for the first Codex turn
  --model <name>              Codex model override
  --sandbox <mode>            read-only | workspace-write | danger-full-access
  --full-auto                 Use Codex --full-auto instead of an explicit sandbox
  --profile <name>            Codex profile
  --codex-path <path>         Path to the codex executable
  --instructions <text>       Extra bridge instructions
  --instructions-file <file>  Read extra instructions from a file
  --base-url <url>            Override the default ilink base URL
  -h, --help                  Show this help message
`);
}

async function processMessage({ account, options, state, message, extraInstructions }) {
  const text = extractTextFromMessage(message);
  if (!text) {
    return;
  }

  const messageKey = buildMessageKey(message, text);
  if (hasRecentMessage(state, messageKey)) {
    log(`Skipping duplicate message from ${message.from_user_id ?? "unknown"}`);
    return;
  }

  const senderId = message.from_user_id ?? "unknown";
  const contextToken = message.context_token;
  if (!contextToken) {
    logError(`Skipping ${senderId}: missing context_token.`);
    rememberMessage(state, messageKey);
    saveState(state);
    return;
  }

  const session = getSession(state, senderId);
  const prompt = buildWechatPrompt({
    senderId,
    messageText: text,
    timestamp: new Date(message.create_time_ms ?? Date.now()).toISOString(),
    extraInstructions,
  });

  log(
    `${session?.threadId ? "Resuming" : "Starting"} Codex thread for ${senderId}: ${text.slice(0, 80)}`,
  );

  let codexResult;
  try {
    codexResult = await runCodexTurn({
      codexPath: options.codexPath,
      workspace: options.workspace,
      prompt,
      threadId: session?.threadId ?? null,
      model: options.model,
      sandbox: options.sandbox,
      profile: options.profile,
      fullAuto: options.fullAuto,
    });
  } catch (error) {
    if (!session?.threadId) {
      throw error;
    }

    logError(`Resume failed for ${senderId}, starting a new Codex thread.`);
    codexResult = await runCodexTurn({
      codexPath: options.codexPath,
      workspace: options.workspace,
      prompt,
      threadId: null,
      model: options.model,
      sandbox: options.sandbox,
      profile: options.profile,
      fullAuto: options.fullAuto,
    });
  }

  upsertSession(state, senderId, {
    threadId: codexResult.threadId,
    lastMessageAt: new Date().toISOString(),
  });
  rememberMessage(state, messageKey);
  saveState(state);

  const reply = codexResult.replyText.trim();
  await sendTextMessage(account.baseUrl, account.token, senderId, reply, contextToken);
  log(`Sent reply to ${senderId}: ${reply.slice(0, 80)}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  options.workspace = path.resolve(options.workspace);
  const account = loadCredentials();
  if (!account) {
    throw new Error("No saved WeChat credentials found. Run `codex-wechat-bridge setup` first.");
  }

  const extraInstructions = loadInstructionsText({
    inlineText: options.instructions,
    filePath: options.instructionsFile,
  });

  const state = loadState();
  let syncBuf = loadSyncBuf();
  let consecutiveFailures = 0;

  if (options.baseUrl) {
    account.baseUrl = options.baseUrl;
  }

  log(`Workspace: ${options.workspace}`);
  log(`Using saved WeChat account: ${account.accountId}`);
  log(`Waiting for WeChat messages...`);

  while (true) {
    try {
      const response = await getUpdates(account.baseUrl, account.token, syncBuf);
      const isError =
        (response.ret !== undefined && response.ret !== 0) ||
        (response.errcode !== undefined && response.errcode !== 0);

      if (isError) {
        consecutiveFailures += 1;
        logError(
          `getUpdates failed: ret=${response.ret} errcode=${response.errcode} errmsg=${response.errmsg ?? ""}`,
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          consecutiveFailures = 0;
          await new Promise((resolve) => setTimeout(resolve, BACKOFF_DELAY_MS));
        } else {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
        continue;
      }

      consecutiveFailures = 0;
      const nextSyncBuf = response.get_updates_buf ?? syncBuf;

      for (const message of response.msgs ?? []) {
        if (!isInboundUserMessage(message)) {
          continue;
        }

        try {
          await processMessage({
            account,
            options,
            state,
            message,
            extraInstructions,
          });
        } catch (error) {
          logError(
            `Failed to process message from ${message.from_user_id ?? "unknown"}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          if (message.context_token && message.from_user_id) {
            try {
              await sendTextMessage(
                account.baseUrl,
                account.token,
                message.from_user_id,
                "我这边刚刚处理失败了，请稍后再试一次。",
                message.context_token,
              );
            } catch (sendError) {
              logError(
                `Failed to send fallback reply to ${message.from_user_id}: ${
                  sendError instanceof Error ? sendError.message : String(sendError)
                }`,
              );
            }
          }
        }
      }

      syncBuf = nextSyncBuf;
      saveSyncBuf(syncBuf);
    } catch (error) {
      consecutiveFailures += 1;
      logError(`Polling error: ${error instanceof Error ? error.message : String(error)}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        consecutiveFailures = 0;
        await new Promise((resolve) => setTimeout(resolve, BACKOFF_DELAY_MS));
      } else {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
}

main().catch((error) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
