# 云存档部署指南（TM-P2-005）

《天梦大陆》云存档：GitHub Pages 静态前端 + Supabase Edge Function + Postgres。
前端只负责把五槽存档装进信封（`CloudVaultPayload`）通过 HTTPS POST 到 Edge Function；
服务器用口令派生 vault 地址并做乐观并发写入。口令本身永不上传明文存储，只以 HMAC 哈希形式出现。

## 架构速览

```
浏览器（GitHub Pages）
  │  POST {action, passphrase, expectedRevision?, payload}   （HTTPS，≤1MB）
  ▼
Supabase Edge Function  /cloud-save     （--no-verify-jwt）
  │  vaultId = HMAC-SHA256(VAULT_HMAC_SECRET, passphrase)   （hex）
  ▼
Postgres（service role key，绕过 RLS）
  cloud_save_vaults   ← 当前版本（CAS revision）
  cloud_save_history  ← 覆盖前快照（保留最近 5 条）
```

## 部署步骤（约 10 分钟，全是人工配置）

前置：本机安装并登录 Supabase CLI（`supabase login`），项目已链接（`supabase link --project-ref <ref>`）。

1. **建表**（二选一）
   - `supabase db push`
   - 或：Supabase Dashboard → SQL Editor → 粘贴 `supabase/schema.sql` 全部内容 → Run。
   schema 已 ENABLE RLS 且不建任何 policy，anon key 直连一律被拒，只放行 service role。

2. **部署 Edge Function**
   ```bash
   supabase functions deploy cloud-save --no-verify-jwt
   ```
   `--no-verify-jwt` 必带：前端 fetch 不带 Authorization 头，默认 JWT 网关会把请求挡在 401。

3. **设置 secrets**（真实值只进 Supabase，绝不进前端/仓库）
   ```bash
   supabase secrets set VAULT_HMAC_SECRET=<随机长串> \
     SUPABASE_URL=https://<project-ref>.supabase.co \
     SUPABASE_SERVICE_ROLE_KEY=<service role key>
   ```
   可选：`supabase secrets set CORS_ORIGINS=https://2981554398liujiawei-cyber.github.io,http://localhost:5173`
   （缺省已含生产域名与 localhost 5173/5199/5198，一般无需设置。）

4. **前端注入 endpoint**（构建时）
   ```bash
   # 本机构建
   set VITE_CLOUD_SAVE_ENDPOINT=https://<project-ref>.functions.supabase.co/cloud-save && npm run build
   # 或 CI：在构建步骤注入同名环境变量
   ```
   把 `dist/` 部署到 GitHub Pages（仓库现有流程即可）。未配置该变量时，前端自动进入仅本机模式，不影响本地游玩。

## 环境变量说明

| 变量 | 用途 | 存放位置 |
| --- | --- | --- |
| `VITE_CLOUD_SAVE_ENDPOINT` | 前端 fetch 的 Edge Function 公网 URL（唯一暴露给客户端） | 构建环境 / CI，可进 VITE_* |
| `VAULT_HMAC_SECRET` | 口令 → vaultId 的 HMAC 密钥（服务器机密） | Supabase secrets，绝不进 VITE_* |
| `SUPABASE_URL` | 项目 REST 地址（服务器内部使用） | Supabase secrets，绝不进 VITE_* |
| `SUPABASE_SERVICE_ROLE_KEY` | PostgREST 管理员密钥（可绕过 RLS，最高机密） | Supabase secrets，绝不进 VITE_* |
| `CORS_ORIGINS`（可选） | 逗号分隔的浏览器允许来源 | Supabase secrets |

**service role key 是最高机密**：它拥有绕过 RLS 的数据库权限。一旦被塞进 `VITE_*`、
打进 `dist/` 或提交到公开仓库（GitHub Pages 仓库默认公开），任何人都能读写全部玩家的云存档。
请自查：前端仓库 grep `SUPABASE_SERVICE_ROLE_KEY`、`service_role`，构建产物 grep 同样的串，
都应无命中。泄露即视为失陷，立即在 Dashboard 轮换该 key。

## 产品语义：口令即 vault 地址

- 口令不经过加密存储，服务器只保存 `HMAC-SHA256(secret, 口令)` 的哈希作为 vault_id。
- **不存在“密码错误”**：任何 8–128 位的口令都能解锁；匹配不到 vault 时返回
  `exists:false`，表示“这个口令目前没有云存档”，而不是报错。
- 口令大小写有意义（只 trim，不 lowercase）：`MySave` 与 `mysave` 是两个不同 vault。
- 忘掉口令等于忘掉 vault 地址，服务器无法找回——请提醒玩家妥善保管。

## 历史版本（cloud_save_history）

每次覆盖前，服务器先把旧版写入 `cloud_save_history`，并裁剪到每个 vault 最近 **5 条**。
用途：人工数据库恢复（比如玩家误覆盖后，管理员在 SQL 编辑器按 vault_id 查历史 payload 还原）。
不是用户可见功能，不做版本浏览接口；5 条上限由 Edge Function 维护。

## 本地调试（可选）

1. 本地 `.env.local` 填好 `VAULT_HMAC_SECRET` / `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
   （连测试项目或生产项目都行，注意这是本机私密文件，勿提交）。
2. `supabase functions serve cloud-save --env-file .env.local` 起本地函数
   （默认 `http://127.0.0.1:54321/functions/v1/cloud-save`，本地函数不过 JWT 网关）。
3. 前端开发时把 `VITE_CLOUD_SAVE_ENDPOINT` 指向该本地地址再 `npm run dev`。
4. 本地 Postgres 先跑一遍 `supabase/schema.sql`（`supabase db reset` 或 SQL 编辑器）。

## 故障排查

- **浏览器 console 报 CORS 拦截**：检查 `CORS_ORIGINS` 是否包含当前页面的 Origin
  （GitHub Pages 生产域名、或本地 dev 的 `http://localhost:5173` 等，端口必须精确匹配）。
- **请求被 401 拒绝**：Edge Function 部署时漏了 `--no-verify-jwt`，重新部署。
- **409 conflict 频繁**：属正常乐观并发语义——另一个设备刚保存过；前端会引导用户
  选择“读取云端最新版”或“强制覆盖”，不是故障。
- **口令正确却 exists:false**：vault 是按 HMAC 哈希寻址的，`VAULT_HMAC_SECRET` 更换后
  旧口令会指向新哈希、找不到旧 vault。线上 secret 一经启用不要随意更换。
- **修改 schema 后**：重新 `supabase db push` 即可；两张表用 `IF NOT EXISTS`，幂等。

## 验证（可选，冒烟）

```bash
curl -X POST https://<project-ref>.functions.supabase.co/cloud-save \
  -H 'Content-Type: application/json' \
  -d '{"action":"load","passphrase":"smoke-test-pass-1234"}'
# 期望 200：{"ok":true,"exists":false,"revision":0,"payload":null}
```
随后可再 POST `save`（expectedRevision 0）与 `force_save` 各一次验证写入与覆盖，再 load 确认 revision 递增。
