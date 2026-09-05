# 星伴｜明星 IP 陪伴 MVP

一个基于产品需求文档实现的网页端 MVP，以“趙露思”非官方粉丝主题为当前界面示例，覆盖手办养成、AI 陪伴聊天、动态聚合、活动提醒、粉丝社区与个人成长页。

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

## 当前角色形象

首页主视觉、顶部角色入口、角色说明和聊天头像统一使用用户确认的 `public/companion-modern-v4.png`。文件为原始图片的逐字节副本，不重新生成、不加载 Blender / GLB 模型。首页完整展示人物并将操作区放在图片下方；小头像只通过 CSS 裁切面部，保留原文件。原有养成数据、聊天记录、模型服务和系统音色保持不变。

## 一起听歌

首页“一起听歌”使用用户提供的完整 MP3 `public/audio/zhao-lusi-shi-ni-v1.mp3`（赵露思《是你》），点击后真实播放，不自动播放或预先下载歌曲。支持暂停、继续、进度拖动及加载失败重试；切换页面会暂停，聊天语音和录音也会暂停歌曲，避免声音重叠。本次首页停留期间，首次成功播放才增加养成值，暂停/继续不重复奖励。

音频保留原文件内容；项目代码许可证不授予该音频的版权或传播许可。

## MiniMax 对话与语音服务

悄悄话使用明确标注的“赵露思主题 AI 角色扮演”：以第一人称自然接话、回应用户情绪与当前聊天细节，不作为百科或客服式助手。首次回复说明主题 AI 身份，直接询问身份时明确非本人；不冒充艺人、不编造其私人经历、真实关系、行程或官方授权。聊天页标题和提示始终标明 AI 角色扮演、非本人。音色不变。

角色设定统一保存在 `server/companion_personas.json`，Sites API 和 Python 服务读取同一份内容，并在聊天响应中返回 `personaRevision`，避免两处提示词不一致。自建服务器发布时须同时部署该 JSON 和 `server/chat_api.py`，并更新实际运行的聊天服务；当前生产使用 Docker 容器 `xingban-api`，须将完整 `server` 目录只读挂载到 `/app`，不能只挂载单个 Python 文件。`deploy/xingban-chat.service` 仅为可选的 systemd 部署模板。不清空用户已有聊天记录。

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

- 当前“趙露思”主题仅为非官方粉丝向产品演示，不代表本人、工作室或任何官方机构；头像为用户提供素材，正式商用前须完成姓名、肖像及素材权利核验与授权。
- AI 聊天和 AI 语音由服务端调用 MiniMax 实时生成。语音固定使用 MiniMax 官方 `Chinese (Mandarin)_Warm_Girl` 系统音色，不采集或复刻任何真人声纹。
- 票务模块只提供官方提醒和正规合作方跳转，不提供自动抢票。
- 当前养成、聊天和提醒状态保存在用户浏览器中。
