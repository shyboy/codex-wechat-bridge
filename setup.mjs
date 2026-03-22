#!/usr/bin/env node

import readline from "node:readline/promises";
import process from "node:process";

import {
  ACCOUNT_FILE,
  DEFAULT_BASE_URL,
  fetchQRCode,
  loadCredentials,
  pollQRStatus,
  saveCredentials,
} from "./lib/wechat.mjs";

function parseArgs(argv) {
  const options = { baseUrl: DEFAULT_BASE_URL };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--base-url") {
      options.baseUrl = argv[index + 1];
      index += 1;
    } else if (token === "-h" || token === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage: node setup.mjs [options]

Options:
  --base-url <url>   Override the default ilink base URL
  -h, --help         Show this help message
`);
}

async function maybeConfirmRelogin(existing) {
  if (!existing) {
    return true;
  }

  console.log(`Existing account: ${existing.accountId}`);
  console.log(`Saved at: ${existing.savedAt}`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await rl.question("Re-login with a new QR code? (y/N) ");
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const existing = loadCredentials();
  const shouldRelogin = await maybeConfirmRelogin(existing);
  if (!shouldRelogin) {
    console.log("Keeping existing credentials.");
    return;
  }

  console.log("Fetching WeChat login QR code...\n");
  const qrResponse = await fetchQRCode(options.baseUrl);

  try {
    const { default: qrcodeTerminal } = await import("qrcode-terminal");
    qrcodeTerminal.generate(qrResponse.qrcode_img_content, { small: true });
  } catch {
    console.log(`Open this QR code URL in a browser: ${qrResponse.qrcode_img_content}`);
  }

  console.log("\nScan the QR code in WeChat and confirm the login.");

  const deadline = Date.now() + 480_000;
  let printedScanned = false;

  while (Date.now() < deadline) {
    const status = await pollQRStatus(options.baseUrl, qrResponse.qrcode);

    switch (status.status) {
      case "wait":
        process.stdout.write(".");
        break;
      case "scaned":
        if (!printedScanned) {
          console.log("\nQR scanned. Confirm inside WeChat...");
          printedScanned = true;
        }
        break;
      case "expired":
        console.log("\nQR code expired. Run setup again.");
        process.exit(1);
        break;
      case "confirmed": {
        if (!status.ilink_bot_id || !status.bot_token) {
          throw new Error("Login confirmed but ilink did not return full bot info.");
        }

        const account = {
          token: status.bot_token,
          baseUrl: status.baseurl || options.baseUrl,
          accountId: status.ilink_bot_id,
          userId: status.ilink_user_id,
          savedAt: new Date().toISOString(),
        };

        saveCredentials(account);
        console.log("\nWeChat bridge login succeeded.");
        console.log(`Account ID: ${account.accountId}`);
        console.log(`User ID: ${account.userId ?? ""}`);
        console.log(`Saved credentials: ${ACCOUNT_FILE}`);
        return;
      }
      default:
        break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("\nLogin timed out. Run setup again.");
  process.exit(1);
}

main().catch((error) => {
  console.error(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
