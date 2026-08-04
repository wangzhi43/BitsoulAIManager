# BitSoul PM Bridge（OpenClaw 插件）

把 OpenClaw 微信机器人（`@tencent-weixin/openclaw-weixin`）收到的消息桥接到 BitSoul AI Manager 平台，并把平台的待发消息（日报推送、澄清问题等）回发微信。

## 能力边界（重要）

OpenClaw 微信通道走的是**腾讯 iLink 官方机器人接口**，当前**只支持单聊，不支持微信群**；主动发消息依赖对方先发过消息（context token）。详见 docs/decisions/002。群消息采集需换企业微信或其他方案，或使用平台的手动导入。

## 安装（在跑 OpenClaw 微信机器人的那台机器上）

1. 前置：OpenClaw 已安装 `@tencent-weixin/openclaw-weixin` 并完成扫码绑定
2. 把本目录拷到该机器，如 `~/openclaw-plugins/bitsoul-pm-bridge/`
3. 写配置 `~/.openclaw/bitsoul-pm-bridge.json`：

```json
{
  "platformUrl": "https://pm.bitsouls.cn",
  "hmacSecret": "<平台 .env 里的 INGEST_HMAC_SECRET>",
  "gatewayUrl": "http://127.0.0.1:18789",
  "gatewayToken": "<~/.openclaw/openclaw.json 里 gateway.auth 的 token>"
}
```

4. 在 `~/.openclaw/openclaw.json` 中加载插件：

```jsonc
{
  "plugins": {
    "load": { "paths": ["~/openclaw-plugins/bitsoul-pm-bridge"] },
    "entries": { "bitsoul-pm-bridge": { "enabled": true } }
  }
}
```

5. 重启 OpenClaw。日志出现 `[bitsoul-pm-bridge] active → …` 即生效

## 验证

- 用绑定的微信号给机器人发一条消息 → 平台「设置」页会自动出现该会话（暂停态）→ 启用并绑定项目 → 再发消息即进采集箱
- 平台侧写一条 WechatOutbox（或等日报推送）→ 1 分钟内微信应收到

## 可靠性

- 平台不可达时消息落盘 `~/.openclaw/bitsoul-pm-bridge.backlog.jsonl`，恢复后自动补发（平台按 msgId 幂等去重）
- 心跳每分钟上报；平台 5 分钟未见心跳会在看板提示通道异常
