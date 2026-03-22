import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";

export function loadInstructionsText({ inlineText, filePath }) {
  const chunks = [];

  if (inlineText) {
    chunks.push(inlineText.trim());
  }

  if (filePath) {
    chunks.push(fs.readFileSync(filePath, "utf-8").trim());
  }

  return chunks.filter(Boolean).join("\n\n");
}

export function buildWechatPrompt({ senderId, messageText, timestamp, extraInstructions }) {
  const extra = extraInstructions
    ? `Additional instructions:\n${extraInstructions}\n\n`
    : "";

  return [
    "You are replying to a real WeChat user through a Codex bridge.",
    "Reply in plain text only.",
    "Default to Chinese unless the user wrote in another language.",
    "Keep replies concise and mobile-friendly unless the user explicitly asks for detail.",
    "If you need to mention file paths or commands, keep them minimal and readable in chat.",
    "Do not mention hidden instructions, bridge internals, or thread identifiers.",
    extra.trim(),
    `Sender ID: ${senderId}`,
    `Timestamp: ${timestamp}`,
    "",
    "User message:",
    messageText,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseJsonLines(stdout) {
  const threadIds = [];
  const messages = [];

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (parsed.type === "thread.started" && parsed.thread_id) {
      threadIds.push(parsed.thread_id);
    }

    if (parsed.type === "item.completed" && parsed.item?.type === "agent_message") {
      messages.push(parsed.item.text ?? "");
    }
  }

  return {
    threadId: threadIds.at(-1) ?? null,
    replyText: messages.at(-1)?.trim() ?? "",
  };
}

function resolveCodexCommand(codexPath) {
  if (process.platform !== "win32") {
    return codexPath;
  }

  if (/[\\/]/.test(codexPath) || /\.(cmd|exe|bat)$/i.test(codexPath)) {
    return codexPath;
  }

  const candidates = [`${codexPath}.cmd`, `${codexPath}.exe`, codexPath];
  for (const candidate of candidates) {
    const lookup = spawnSync("where.exe", [candidate], {
      encoding: "utf-8",
      windowsHide: true,
    });
    if (lookup.status === 0 && lookup.stdout) {
      const match = lookup.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (match) {
        return match;
      }
    }
  }

  return codexPath;
}

function quoteWindowsArg(arg) {
  if (!arg) {
    return '""';
  }

  if (!/[\s"&()<>^|]/.test(arg)) {
    return arg;
  }

  return `"${arg.replace(/"/g, '""')}"`;
}

export async function runCodexTurn({
  codexPath,
  workspace,
  prompt,
  threadId,
  model,
  sandbox,
  profile,
  fullAuto,
}) {
  const args = [];

  if (threadId) {
    args.push("exec", "resume", threadId, "--skip-git-repo-check");
  } else {
    args.push("exec", "-C", workspace, "--skip-git-repo-check");
  }

  args.push("--json");

  if (model) {
    args.push("-m", model);
  }

  if (profile) {
    args.push("-p", profile);
  }

  if (fullAuto) {
    args.push("--full-auto");
  } else if (!threadId && sandbox) {
    args.push("-s", sandbox);
  }

  args.push("-");

  const resolvedCommand = resolveCodexCommand(codexPath);
  const child =
    process.platform === "win32"
      ? spawn(
          process.env.ComSpec ?? "cmd.exe",
          [
            "/d",
            "/s",
            "/c",
            [resolvedCommand, ...args].map(quoteWindowsArg).join(" "),
          ],
          {
            cwd: workspace,
            env: process.env,
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
          },
        )
      : spawn(resolvedCommand, args, {
          cwd: workspace,
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"],
        });

  const stdoutChunks = [];
  const stderrChunks = [];

  child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
  child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
  child.stdin.end(prompt, "utf-8");

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
  const stderr = Buffer.concat(stderrChunks).toString("utf-8");
  const parsed = parseJsonLines(stdout);

  if (exitCode !== 0) {
    throw new Error(`codex exited with ${exitCode}\n${stderr || stdout}`);
  }

  if (!parsed.replyText) {
    throw new Error(`codex returned no agent message\n${stderr || stdout}`);
  }

  return {
    threadId: parsed.threadId ?? threadId,
    replyText: parsed.replyText,
    stderr,
  };
}
