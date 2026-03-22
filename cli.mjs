#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function runScript(script, args = []) {
  const scriptPath = resolve(__dirname, script);
  if (!existsSync(scriptPath)) {
    console.error(`Missing script: ${scriptPath}`);
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    stdio: "inherit",
    env: process.env,
  });

  process.exit(result.status ?? 1);
}

function help() {
  console.log(`
Codex WeChat Bridge

Usage: npx codex-wechat-bridge <command> [options]

Commands:
  setup     Scan WeChat QR code and save ilink credentials
  start     Start the Codex bridge loop
  help      Show this help message

Examples:
  npx codex-wechat-bridge setup
  npx codex-wechat-bridge start --workspace E:\\projects\\my-app
  npx codex-wechat-bridge start --workspace . --model gpt-5.4 --full-auto
`);
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "setup":
    runScript("setup.mjs", args);
    break;
  case "start":
    runScript("bridge.mjs", args);
    break;
  case "help":
  case "-h":
  case "--help":
  case undefined:
    help();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    help();
    process.exit(1);
}
