# 星伴｜明星 IP 陪伴 MVP

一个基于产品需求文档实现的网页端 MVP，覆盖虚构明星角色选择、手办养成、AI 陪伴聊天、官方动态、活动提醒、粉丝社区与个人成长页。

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

静态产物位于 `dist/client`。生产环境配置模板见 `deploy/xingban.xunlian.co.conf`。

## MiniMax 聊天服务

悄悄话功能通过 `server/chat_api.py` 在服务端调用 MiniMax，API 密钥不会发送到浏览器。复制 `.env.example` 并设置 `MINIMAX_API_KEY` 后启动：

```bash
set -a
source .env
set +a
python3 server/chat_api.py
```

生产环境应通过 HTTPS 反向代理 `/api/chat` 到 `127.0.0.1:8788`。服务内置来源校验、消息长度限制、请求频率限制和上游超时。

## MVP 边界

- 所有明星角色均为虚构演示角色，不代表任何真人授权或代言。
- AI 聊天由服务端调用 MiniMax 实时生成；角色设定、知识库和真人音色仍需获得 IP 权利方授权后才能用于正式商业运营。
- 票务模块只提供官方提醒和正规合作方跳转，不提供自动抢票。
- 当前养成、聊天和提醒状态保存在用户浏览器中。
