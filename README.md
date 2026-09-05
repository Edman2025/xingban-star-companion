# 星伴｜明星 IP 陪伴 MVP

一个基于产品需求文档实现的网页端 MVP，围绕完全原创虚拟明星“星遥”，覆盖手办养成、AI 陪伴聊天、官方动态、活动提醒、粉丝社区与个人成长页。

## 本地开发

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm ci
npm run build
```

默认静态产物位于 `dist/client`。托管 MiniMax API 路由时使用 `XINGBAN_SERVER_BUILD=1 npm run build` 生成服务端产物。

## MiniMax 对话与语音服务

悄悄话通过服务端 API 调用最新 MiniMax M3 生成真实回复，再用最新一代 MiniMax Speech 2.8 Turbo 合成 MP3 语音，API 密钥不会发送到浏览器。用户语音由浏览器麦克风实时识别成文字，并在本次会话中保留可回放的原始录音；不支持语音识别的浏览器会提示改用文字输入。

`server/chat_api.py` 是自建服务器的可选代理实现；复制 `.env.example` 并设置 `MINIMAX_API_KEY` 后可启动：

```bash
set -a
source .env
set +a
python3 server/chat_api.py
```

生产环境应通过 HTTPS 反向代理 `/api/chat` 与 `/api/voice` 到 `127.0.0.1:8788`。服务内置来源校验、消息长度限制、请求频率限制和上游超时。

## MVP 边界

- “星遥”为本项目原创虚拟角色，不基于任何真人、明星或现有作品角色。
- AI 聊天和 AI 语音由服务端调用 MiniMax 实时生成。语音固定使用 MiniMax 官方 `Chinese (Mandarin)_Warm_Girl` 系统音色，不采集或复刻任何真人声纹。
- 票务模块只提供官方提醒和正规合作方跳转，不提供自动抢票。
- 当前养成、聊天和提醒状态保存在用户浏览器中。
