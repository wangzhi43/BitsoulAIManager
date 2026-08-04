# ADR-002：微信接入实现与 iLink 单聊限制

日期：2026-08-04 ｜ 状态：已采纳（附带产品限制，需管理员知悉）

## 背景调研结论

OpenClaw 核心仓库不含微信代码；微信能力来自腾讯官方 npm 插件 `@tencent-weixin/openclaw-weixin`，底层是**腾讯 iLink 机器人开放接口**（`ilinkai.weixin.qq.com`，长轮询收 + sendmessage 发），不是 wechaty/逆向协议——合规性好于预期（封号风险显著低于逆向方案）。

但有两条硬限制：

1. **只支持单聊，不支持微信群**（插件 `chatTypes: ["direct"]` 硬编码）。「监听客户群」在当前通道做不到。
2. **主动触达受限**：发消息必须携带对方最近一次来消息的 context token——即"对方先说话，我们才能回"，不能任意时刻主动推送。

## 决策

1. 微信桥接按「OpenClaw 本地插件」实现（`bridge/openclaw-plugin-bitsoul-pm/`）：
   - `message_received` hook 转发消息与媒体到平台 ingest API（HMAC 签名、磁盘补发队列、msgId 幂等）
   - 每分钟轮询平台 outbox，经本机 Gateway 的 `message` 工具回发；心跳上报
2. 未绑定会话首次来消息时平台**自动登记为暂停态绑定**，管理员在设置页一键启用并绑定项目，免手抄 convId
3. 产品预期调整：MVP 微信入口 = **客户单聊机器人** + 手动导入兜底；日报微信推送受 context token 限制，按「尽力送达」处理

## 后续选项（如群聊是硬需求，管理员决策）

- 企业微信：`@wecom/wecom-openclaw-plugin`（合规，需企业主体与客户加企微）
- wechaty + 第三方 puppet（可收群消息，但回到封号风险）
- 维持现状：群里的需求由管理员转发给机器人单聊，或手动导入
