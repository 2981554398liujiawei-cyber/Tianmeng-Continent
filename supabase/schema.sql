-- ============================================================================
-- 《天梦大陆》云存档 —— Supabase Postgres schema（TM-P2-005）
-- ============================================================================
-- 用法（二选一，均需 Supabase CLI 已登录并链接本项目）：
--   1) supabase db push
--   2) Dashboard → SQL Editor → New query → 粘贴本文件全部内容 → Run
-- 两条命令都是幂等的，可安全重复执行。
--
-- 安全模型（重要，不要改动）：
--   - 浏览器端只持有 Supabase anon key。本 schema 只 ENABLE RLS、
--     不创建任何 policy，因此 anon key / 已登录用户直连这两张表时
--     默认拒绝所有行（RLS deny-by-default）。浏览器永远拿不到存档数据。
--   - 唯一合法访问路径是 Edge Function（supabase/functions/cloud-save）：
--     它以 service role key 调用 PostgREST，service_role 属绕过 RLS 的
--     超级角色，因此可以读写；service role key 只存在于服务器端环境变量，
--     绝不进入前端 bundle / GitHub Pages / 公开仓库。
--   - 禁止为本 schema 的任何表添加 public policy（哪怕 SELECT 也不加）。
--
-- 数据独立性：
--   云存档数据保存在 Supabase Postgres，完全独立于 GitHub Pages 静态部署。
--   重新构建 / 重新发布网站不会触碰任何存档数据；口令不变，存档即不丢。
-- ============================================================================

-- 当前 vault：每个口令一个 vault（vault_id = HMAC-SHA256(secret, 口令) 的 hex，
-- 服务器只存哈希后的 id，绝不存口令本身）。
CREATE TABLE IF NOT EXISTS cloud_save_vaults (
  vault_id   TEXT PRIMARY KEY,  -- HMAC 派生的 vault 地址
  revision   BIGINT NOT NULL,   -- 乐观并发版本号（0 = 无 vault；首个写入为 1）
  payload    JSONB NOT NULL,    -- CloudVaultPayload 信封（cloudVersion=1 + savesExport）
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 历史版本：每次覆盖前的旧版快照，用于人工数据库恢复。
-- 每个 vault 的每个 revision 至多一条；Edge Function 覆盖后追加并裁剪到最近 5 条。
CREATE TABLE IF NOT EXISTS cloud_save_history (
  id         BIGSERIAL PRIMARY KEY,
  vault_id   TEXT NOT NULL,
  revision   BIGINT NOT NULL,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vault_id, revision)  -- 自带 (vault_id, revision) B-tree 索引，天然支撑按 vault 过滤
);

-- 行级安全：开启 RLS 且不建任何 policy → 非 service_role 一律无行可见。
ALTER TABLE cloud_save_vaults  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_save_history ENABLE ROW LEVEL SECURITY;
