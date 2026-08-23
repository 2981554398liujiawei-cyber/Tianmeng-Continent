# 云存档部署指南（Cloudflare Worker + D1）

云存档唯一后端是 Cloudflare Worker，数据保存于 D1。前端通过一个 HTTPS POST endpoint 发送统一的 `action` 协议：`load`、`save`、`force_save`。口令经 NFKC、trim 标准化后只用于服务器端 HMAC 寻址，D1 不保存明文口令。

## 部署

1. 在 Cloudflare 创建 D1 数据库，并在 `cloud/wrangler.jsonc` 填入 `database_id`。
2. 执行 `wrangler d1 migrations apply tianmeng-cloud-save --remote`。
3. 配置 Worker secret：`wrangler secret put SAVE_PEPPER`。
4. 构建前端，并将 `VITE_CLOUD_SAVE_API_BASE` 指向 Worker URL（canonical 变量名；发布用 `npm run build:public`，见 docs/RELEASE.md）。

Worker 只接受 `POST application/json`，请求体上限 1 MB。`save` 使用 `expectedRevision` 做 CAS；冲突返回 HTTP 409，客户端必须让用户选择读取云端或强制覆盖，不能自动覆盖。

## 本地验证

```bash
npm test
npm run build
npm run qa:cloud
```

开发时可将 `VITE_CLOUD_SAVE_ENDPOINT` 指向 `qa/cloud-save-mock-server.mjs` 提供的本地 mock 服务。
