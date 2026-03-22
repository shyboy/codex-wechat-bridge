# Codex WeChat Bridge

把微信 ClawBot 的消息转发给 Codex，再把 Codex 的回复发回微信。

你可以把它理解成一个“微信 <-> Codex”的桥接器：

- 你在微信里发消息
- 电脑上的桥接程序收到消息
- 桥接程序调用 Codex
- Codex 生成回复
- 回复自动回到微信

它适合这两类场景：

- 你想在微信里直接和 Codex 聊天
- 你想让 Codex 基于某个本地项目目录回答问题、看代码、改代码

## 先说最重要的一点

**截至 2026-03-23，这个项目还没有发布到 npm。**

所以这条命令：

```bash
npx codex-wechat-bridge setup
```

**现在不能直接用。**

你需要先把仓库下载到本地，然后在项目目录里运行本地命令。

正确做法是：

```bash
git clone https://github.com/shyboy/codex-wechat-bridge.git
cd codex-wechat-bridge
npm install
node ./cli.mjs setup
```

如果你是 Windows PowerShell，也可以这样：

```powershell
git clone https://github.com/shyboy/codex-wechat-bridge.git
cd codex-wechat-bridge
npm install
node .\cli.mjs setup
```

## 这个项目借鉴了什么

这个项目不是从零开始发明协议，而是在已有项目基础上做了改造。

主要借鉴来源：

- [Johnixr/claude-code-wechat-channel](https://github.com/Johnixr/claude-code-wechat-channel)
  - 这个项目完成了 `Claude Code + 微信 ClawBot` 的桥接思路
  - 本项目最初就是从它的代码结构改过来的
  - 保留并复用了它对微信 `ilink` 登录、收消息、发消息这一部分的整体思路
- `@tencent-weixin/openclaw-weixin`
  - 上游项目 README 明确说明它使用的是和这个生态项目一致的 `ilink` 协议
  - 本项目也沿用了同一套微信侧协议能力

本项目和上游的核心区别：

- 上游是给 **Claude Code** 用的，依赖 Claude 的 `channel` 扩展
- 本项目改成了给 **Codex CLI** 用
- 本项目不再依赖 Claude 的 channel 机制，而是改为使用 `codex exec` 和 `codex exec resume`

如果你想一句话理解：

> 这是一个从 `claude-code-wechat-channel` 改写而来的 `Codex` 版本。

## 它是怎么工作的

```text
微信 (iPhone) -> WeChat ClawBot -> ilink API -> 本项目 -> Codex CLI -> 本项目 -> 微信
```

更具体一点：

1. 你先用微信扫一次码，让桥接程序获得登录凭据
2. 桥接程序持续监听新的微信消息
3. 每个微信用户会对应一个独立的 Codex 会话
4. 第一条消息会新建会话
5. 后续消息会继续接着之前的会话聊
6. Codex 的最后一条文本回复会被发回微信

## 你需要准备什么

在开始之前，请先确认下面几项。

### 1. 一台能运行 Codex 的电脑

推荐：

- Windows
- macOS
- Linux

### 2. Node.js 18 或更高版本

如果你不知道自己有没有安装，打开终端执行：

```bash
node -v
```

如果能看到类似 `v22.0.0` 这样的版本号，就说明装好了。

### 3. 已安装 Codex CLI，并且已经登录

先检查：

```bash
codex --version
```

再登录：

```bash
codex login
```

### 4. 微信 iPhone 版本，并且能使用 ClawBot

注意：

- 目前这里依赖的是微信 ClawBot 的能力
- 通常需要 iPhone 端微信
- 如果你的微信里没有 ClawBot，这个项目就没法用

## 先理解一个概念：`workspace`

很多新手第一次会卡在 `--workspace`。

你可以把 `workspace` 理解为：

> Codex 在你电脑上“主要看哪个文件夹”

例如：

- 你只是想聊天测试，可以随便指定一个空文件夹
- 你想让 Codex 帮你看项目代码，就把它指向你的项目目录

Windows 例子：

```powershell
--workspace E:\projects\my-app
```

macOS / Linux 例子：

```bash
--workspace /Users/yourname/projects/my-app
```

## 给电脑小白的最简单使用方法

如果你只想先跑起来，不想研究参数，按下面做。

### 第 1 步：下载代码到本地

你有两种办法。

#### 方法 A：用 Git 下载

如果你装了 Git，执行：

```bash
git clone https://github.com/shyboy/codex-wechat-bridge.git
cd codex-wechat-bridge
```

#### 方法 B：直接下载 ZIP

如果你不会 Git，也可以：

1. 打开仓库页面  
   [https://github.com/shyboy/codex-wechat-bridge](https://github.com/shyboy/codex-wechat-bridge)
2. 点击绿色 `Code` 按钮
3. 点击 `Download ZIP`
4. 解压到你电脑上的一个文件夹
5. 用终端进入这个文件夹

例如在 Windows PowerShell 里：

```powershell
cd E:\Desktop\codex-wechat-bridge
```

### 第 2 步：安装依赖

进入项目目录后，执行：

```bash
npm install
```

这一步会安装项目需要的依赖，比如终端二维码显示组件。

### 第 3 步：扫码登录微信桥接

在项目目录里执行：

```bash
node ./cli.mjs setup
```

Windows PowerShell 里也可以写成：

```powershell
node .\cli.mjs setup
```

然后你会看到二维码。

接下来：

1. 用微信扫一扫
2. 在微信里确认授权
3. 终端提示成功

成功后，凭据会保存到：

```text
~/.codex-wechat-bridge/account.json
```

你不用手动改这个文件。

### 第 4 步：启动桥接程序

在项目目录里执行：

```bash
node ./cli.mjs start --workspace .
```

Windows PowerShell 里：

```powershell
node .\cli.mjs start --workspace .
```

如果你已经在自己的项目目录里打开了终端，那么 `.` 就表示“当前文件夹”。

如果你想让它针对另一个目录工作，就把 `.` 换成真实路径，例如：

```powershell
node .\cli.mjs start --workspace E:\Desktop\my-project
```

### 第 5 步：看到这句就表示基本启动成功

终端里应该能看到类似：

```text
[codex-wechat-bridge] Waiting for WeChat messages...
```

这表示程序已经在等微信消息了。

### 第 6 步：去微信里发一条消息

比如发：

```text
你好，你是谁？
```

如果一切正常，几秒后你会在微信里收到 Codex 的回复。

## 最推荐的新手启动方式

如果你担心 Codex 乱改文件，建议一开始用只读模式：

```bash
node ./cli.mjs start --workspace . --sandbox read-only
```

Windows PowerShell：

```powershell
node .\cli.mjs start --workspace . --sandbox read-only
```

这样更安全。

只有在你明确希望 Codex 帮你修改代码时，再考虑：

```bash
node ./cli.mjs start --workspace . --sandbox workspace-write
```

如果你已经非常确定自己的使用场景，再考虑：

```bash
node ./cli.mjs start --workspace . --full-auto
```

## 常用命令

### 微信扫码登录

```bash
node ./cli.mjs setup
```

### 启动桥接

```bash
node ./cli.mjs start --workspace /path/to/your/project
```

### 查看帮助

```bash
node ./cli.mjs help
```

## 常用参数说明

### `--workspace <dir>`

指定 Codex 主要工作的目录。

### `--model <name>`

指定模型，例如：

```bash
--model gpt-5.4
```

### `--sandbox <mode>`

常见值：

- `read-only`：只读，更安全，适合先测试
- `workspace-write`：允许修改当前工作目录
- `danger-full-access`：高权限，不建议新手一开始就用

### `--full-auto`

让 Codex 使用更自动化的执行模式。

新手建议先不要开，先把基础流程跑通。

### `--profile <name>`

如果你本地 Codex 配了 profile，可以在这里指定。

### `--codex-path <path>`

如果你的 `codex` 命令不在默认路径里，可以手动指定它。

### `--instructions <text>`

给桥接器附加一段固定说明。

例如：

```bash
--instructions "默认用中文回复，尽量简短。"
```

### `--instructions-file <file>`

从一个文本文件里读取附加说明。

### `--base-url <url>`

覆盖默认的微信 `ilink` 地址。

普通用户通常不需要改这个参数。

## 一个完整例子

如果你是 Windows 用户，在某个项目目录里打开 PowerShell，可以这样：

```powershell
git clone https://github.com/shyboy/codex-wechat-bridge.git
cd codex-wechat-bridge
npm install
node .\cli.mjs setup
node .\cli.mjs start --workspace E:\Desktop\openclaw\codex-wechat-bridge --sandbox read-only
```

如果你只是想聊天测试，可以先建一个空目录，然后：

```powershell
mkdir E:\codex-test
cd E:\codex-test
git clone https://github.com/shyboy/codex-wechat-bridge.git
cd codex-wechat-bridge
npm install
node .\cli.mjs start --workspace . --sandbox read-only
```

## 这个项目会在你的电脑上保存什么

默认保存到：

```text
~/.codex-wechat-bridge/
```

里面主要有这几个文件：

- `account.json`
  - 微信登录后的凭据
- `sessions.json`
  - 哪个微信用户对应哪个 Codex 会话
- `sync_buf.txt`
  - 微信消息同步游标

如果你想重新登录，可以删掉 `account.json` 后重新运行：

```bash
node ./cli.mjs setup
```

## 常见问题

### 1. 不需要把代码下载到本地吗？

**需要。**

因为这个项目现在还没有发布到 npm，所以不能直接写：

```bash
npx codex-wechat-bridge setup
```

当前正确流程是：

```bash
git clone https://github.com/shyboy/codex-wechat-bridge.git
cd codex-wechat-bridge
npm install
node ./cli.mjs setup
```

### 2. 终端提示找不到 `codex`

说明 Codex CLI 没装好，或者不在环境变量里。

先执行：

```bash
codex --version
```

如果这条命令都不通，先把 Codex CLI 装好。

### 3. 终端提示没有微信凭据

先执行：

```bash
node ./cli.mjs setup
```

### 4. 扫码之后还是没反应

检查下面几项：

- 你有没有在微信里点确认
- 微信端是否真的支持 ClawBot
- 电脑网络是否正常
- 终端有没有报错

### 5. 微信发消息了，但没有收到回复

先看桥接终端有没有这些信息：

- `Waiting for WeChat messages...`
- `Starting Codex thread for ...`
- `Sent reply to ...`

如果完全没有新日志，说明微信消息没有被桥接程序收到。

如果有收到消息，但没发回去，通常是：

- Codex 没登录
- Codex 调用失败
- 网络问题
- 微信侧 `context_token` 异常

### 6. 为什么回复有时候比较慢

因为中间真的调用了一次 Codex。

耗时会受到这些因素影响：

- 你的网络
- 你选的模型
- 问题复杂度
- 当前 workspace 大小

### 7. 它会不会自动改我的代码

看你怎么启动。

如果你用的是：

```bash
--sandbox read-only
```

那它默认只能读，不能改。

如果你用的是：

```bash
--sandbox workspace-write
```

那它就可能修改工作目录里的文件。

### 8. 我只是想把它当微信聊天机器人，不想碰代码

可以。

你只要给它一个普通空目录，并用只读模式启动就行：

```bash
node ./cli.mjs start --workspace . --sandbox read-only
```

## 已知限制

- 这不是把消息直接推到正在运行的 Codex TUI 窗口里
- 它本质上是通过 `codex exec` / `codex exec resume` 做桥接
- 微信是纯文本场景，复杂 Markdown 显示效果一般
- 如果你让 Codex 输出复杂结构化内容，最终发回微信的通常是最后一条文本回复
- 微信 ClawBot 能不能用，受微信端能力限制

## 安全建议

- 第一次使用，优先 `--sandbox read-only`
- 不要把它挂在高权限目录上长期裸跑
- 不要随便给陌生人开放可写工作目录
- 真实调用 Codex 可能产生模型费用，请注意成本

## 致谢

感谢这些项目提供了思路和基础：

- [Johnixr/claude-code-wechat-channel](https://github.com/Johnixr/claude-code-wechat-channel)
- `@tencent-weixin/openclaw-weixin`

本项目是在前者基础上做的 Codex 适配与重构。

## License

MIT
