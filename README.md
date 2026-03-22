# Codex WeChat Bridge

将微信 ClawBot 消息桥接到 Codex，会为每个微信用户维护一条独立的 Codex 会话。

这个项目不依赖 Claude 的 `channel` 扩展。它保留微信 `ilink` 登录和收发消息能力，但把 Claude 专用的 MCP channel 推送改成了 `codex exec` / `codex exec resume` 调用，因此可以直接跑在 Codex CLI 上。

## 工作方式

```text
WeChat (iOS) -> WeChat ClawBot -> ilink API -> this bridge -> codex exec/resume -> WeChat reply
```

- 每个微信用户会绑定一个独立的 Codex thread id
- 首条消息会创建新会话，后续消息会走 `codex exec resume`
- 回复默认要求简洁、纯文本、适合微信阅读

## 前置要求

- Node.js 18+
- 已安装并可运行 `codex`
- 已完成 `codex login`
- 微信 iOS 最新版，并可使用 ClawBot

## 快速开始

### 1. 微信扫码登录

```bash
npx codex-wechat-bridge setup
```

成功后会把凭据保存在：

```text
~/.codex-wechat-bridge/account.json
```

### 2. 启动桥接

```bash
npx codex-wechat-bridge start --workspace /path/to/your/project
```

常用参数：

```bash
npx codex-wechat-bridge start \
  --workspace /path/to/your/project \
  --model gpt-5.4 \
  --sandbox workspace-write \
  --full-auto
```

### 3. 在微信里发消息

桥接器会把消息转给 Codex，并把 Codex 的最后一条回复发回微信。

## 命令

| Command | Description |
| --- | --- |
| `npx codex-wechat-bridge setup` | 微信扫码登录 |
| `npx codex-wechat-bridge start --workspace <dir>` | 启动桥接 |
| `npx codex-wechat-bridge help` | 查看帮助 |

## 运行参数

| Flag | Description |
| --- | --- |
| `--workspace <dir>` | Codex 首次建会话时使用的工作目录，默认是当前目录 |
| `--model <name>` | 指定 Codex 模型 |
| `--sandbox <mode>` | `read-only` / `workspace-write` / `danger-full-access` |
| `--full-auto` | 直接使用 Codex 的 `--full-auto` 模式 |
| `--profile <name>` | 传给 Codex CLI 的 profile |
| `--codex-path <path>` | 自定义 `codex` 可执行文件路径 |
| `--instructions <text>` | 追加一段系统说明 |
| `--instructions-file <file>` | 从文件读取额外说明 |
| `--base-url <url>` | 覆盖默认 ilink 地址 |

## 数据目录

默认状态都保存在：

```text
~/.codex-wechat-bridge/
```

其中包括：

- `account.json`：微信登录凭据
- `sessions.json`：微信用户到 Codex thread id 的映射
- `sync_buf.txt`：微信增量拉取游标

## 已知限制

- 不是实时 push 到正在运行的 Codex TUI，而是通过 `codex exec` 独立跑每次 turn
- Codex 的回复取最后一条 agent message，因此如果你故意让它输出多段结构化事件，只会回最后文本
- 微信消息是纯文本场景，复杂 Markdown 显示效果会一般

## 安全建议

- 默认先用 `--sandbox read-only` 跑通
- 只有在你明确允许改代码时再打开 `--full-auto` 或更高权限 sandbox
- 微信用户会触发真实的 Codex 调用，注意模型费用和权限边界
