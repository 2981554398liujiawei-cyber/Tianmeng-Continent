# 02 — 系统硬边界（System Boundaries）

> 依据任务卡 TM-P2-007 §2（强约束）、§57（禁止过度设计）、AU-001~005 与 `canon/00_DECISIONS.md` 编制。
>
> **本文件是《天梦大陆》所有系统与内容设计的硬边界**：任何实现、重构或未来规划不得越过下列任一条。与 `00_GAME_DIRECTION.md` 冲突时，以本文件的硬边界为准。
>
> 标签规范：`[CANON]`=已上线实现；`[PROJECT-AU]`=项目对原著的改编；`[PLANNED]`=未来规划；`[UNKNOWN]`=无法核实。

---

## 1. 普通宠物系统：明确不做

任务卡 §2.1 / AU-002 / C-001（已定案 `[RULED]`）。

禁止新增：

```text
PetRegistry / PetState / PetSlot /
捕捉怪物 / 孵化 / 宠物进化 / 宠物装备 / 宠物战斗回合 /
宠物忠诚 / 宠物容量 / 宠物背包 / 宠物商店 / 宠物 AI
```

（任务卡 §2.1 原文禁止项）

- 现有特殊女性伙伴即使剧情称谓出现「神契宠物」等词，也统一通过 `CompanionState` / `RelationshipState` / `Party` 实现（任务卡 §2.1）。
- **不要因此创建通用 PetSystem**（任务卡 §2.1）。
- 旧资料中的普通动物宠物只保留世界设定 / NPC 背景 / 坐骑候选 / 剧情生物，不实现玩家宠物系统（C-001 影响）。

### 1.1 `divine_contract_pet` 剧情分类说明

- `[CANON]` Sakura（樱花优子）后台 = `Companion` + `divine_contract_pet` classification（`src/game/content/companions.ts`）。
- `divine_contract_pet` 是**剧情分类字符串**，不代表存在普通 PetSystem（任务卡 §2.1；00_DECISIONS D-010）。
- 本阶段保留该字符串兼容（迁移成本高），**不强制迁移存档**；未来可再重命名（任务卡 §2.1）。
- 设计 / 文档中该词一律按「剧情称谓」理解，不得据此推导任何宠物系统能力。

---

## 2. 3v3 硬上限

任务卡 §2.2 / AU-004 / C-005（已定案 `[RULED]`）。

- friendly combatants：1–3。
- enemy combatants：1–3。

禁止为了未来做（任务卡 §2.2）：

```text
6 人队伍 / 10 敌人阵列 / 网格站位 / 前后排系统 /
行动力 / Bonus Action / Reaction 全套 5e 化
```

- 战斗仍然是本项目自己的轻量回合制（任务卡 §2.2）。
- 大型战争 / 大规模场面通过群体单位、波次、剧情表现、背景军队解决，不是 20v20 Combat DOM（AU-004）。
- `[CANON]` 现状：单体战斗入口为 `checkEnemyEncounter`（`src/game/rules/encounter.ts`），多人化落地见 `combat/party_combat.md`。

---

## 3. Combat V3 数学冻结（原文公式）

任务卡 §2.3（禁止推翻）。

以下规则不可改（任务卡 §2.3 原文）：

```text
普通命中：
(attacker AGI + D20) / 2 >= defender AGI

天然 1：
大失败

天然 20：
现有暴击语义

擦伤：
现有语义

护甲承伤：
现有公式

攻击伤害：
现有正式计算路径
```

- Party Combat V5 只是把单体战扩展为多人单位队列。
- **不要用本卡重写命中 / 护甲数学**（任务卡 §2.3）。
- `[CANON]` 代码实现锚点：`resolveHit` / `applyArmor` / `resolveAttack` / `resolveInitiative`（`src/game/rules/combat.ts`）。
- 多人战斗中命中 / 护甲 / 逃跑的落点见 `combat/party_combat.md`。

---

## 4. 无动态等级缩放

任务卡 §2.4。

禁止：

```text
玩家 2 级 → 敌人自动 2 级
玩家 10 级 → 敌人自动 10 级
队伍 3 人 → 自动多刷 2 只怪
```

（任务卡 §2.4 原文）

- 遭遇应由数据设计（Encounter V2 数据层，见 `combat/encounter_design.md`）。
- 队伍变强后，玩家应该真实感受到自己更强（任务卡 §2.4）。
- 不因队伍人数自动调整敌人数量（任务卡 §2.4 不做动态等级缩放）。
- 任务与剧情优先多解，不做动态等级缩放（CONTENT_CHANGES #8）。

---

## 5. 坐骑非战斗单位

任务卡 §18.1 / §18 / AU-003 / C-004（已定案 `[RULED]`）。

- 坐骑不作为战斗单位，不拥有自己的战斗回合，不能独立攻击。
- 只通过基础属性加成和探索能力影响角色。
- 一次只能装备一匹。
- 有正式持有 / 装备 / 更换 / 展示闭环。
- travel tags（`fast_travel` / `pursuit` / `flight` / `thunder_path`）只用于解锁探索权限、特殊选项、追逐检定 bonus、旅行事件 bonus（任务卡 §18.4 travelTags、§21）。
- 任何旧资料里「坐骑参战」的条目在本项目一律改写为属性 / 选项语义（C-004 影响）。

---

## 6. 禁止过度设计清单

任务卡 §57 原文。禁止：

```text
ECS
Redux 重构
Event Sourcing
巨型 CombatEngine class hierarchy
AI planner
Skill DSL
Loot DSL
Mount skill tree
Pet System
Grid combat
pathfinding
3D
full D&D action economy
procedural dungeon generator
```

（任务卡 §57 原文禁止项）

- 优先：**纯函数 + 数据 registry + 少量 UI component**（任务卡 §57）。
- 设计文档本身也不得引入上述架构作为未来规划（本文件 §6 覆盖所有未来阶段）。

---

## 7. MMO 化禁止

AU-005 / C-002（已定案 `[RULED]`）。

- 项目是单机浏览器文字 CRPG，不是 MMO。
- 不做：MMO 玩家经济模拟 / 服务器排行榜竞争核心 / 实时在线 / 帮派 MMO 后台 / 100 人战场。
- 保留：世界观、任务、幸运、装备、坐骑、隐藏事件、美女 NPC、职业与原著关键故事（AU-005）。
- Act 9（猴儿林大型赛事）是单机内的战力展示舞台，**不实现 MMO 排行榜模拟器**（任务卡 §25）。

---

## 8. 负重禁止

任务卡 §4.4 / 00_DECISIONS 3.1。

- 禁止：Encumbrance / carryWeight / 超重速度惩罚 / 仓库重量 / 伙伴背包分摊。
- 背包不因重量限制拾取；背包的分类 / 容量 / 详情按 Backpack V2（`design/items/`）设计，与重量无关。

---

## 9. 实时地图移动速度禁止

任务卡 §18.4、§21 / 00_DECISIONS 3.1。

- 禁止：speed +80% / 移动动画加速等实时速度表现。
- 坐骑 / 敏捷类「速度」一律转换为：探索权限、特殊选项、追逐检定 bonus、旅行事件 bonus。

---

## 10. AI 自由聊天禁止

00_DECISIONS 3.1（任务卡 §23 原则 4「伙伴必须对自己的知识领域插话」支持 authored 对白）。

- 禁止：LLM 实时生成伙伴对白。
- 伙伴对白、插话、支线、事件文案一律 **authored content**（预先编写）。

---

## 11. Encounter Variant 刷新重投禁止

任务卡 §7.3 / 00_DECISIONS 3.1。

- Encounter variant 一旦生成，禁止 F5 重刷 / 刷新 / 读档重投。
- 首次生成 / 看见该 encounter 时选择 variant，写入：

```text
world.encounterVariants[encounterId] = variantId
```

- 之后刷新、读档、切地点都不能重新 roll（任务卡 §7.3）。
- 本阶段允许 Save V5→V6，字段仅限 `ownedMountIds`/`equippedMountId` + `world.encounterVariants`（任务卡 §3.1/§3.2；00_DECISIONS D-012），不塞无关字段。
- 详细数据结构见 `combat/encounter_design.md`。

---

## 12. 补充内容边界

以下条目同样属于硬边界，禁止违反：

- **任务关键物不被 RNG 卡死**：mandatory quest item = guaranteed 100%（任务卡 §5.3；00_DECISIONS 3.2），不许强制战斗公式外数值。
- **Golden Rabbit 硬冻结**：`quest_golden_rabbit_search` = `in_progress` / `stage 0`；四调查 flag 保持 `true`；背包 `rabbit_path ×1`；禁止新目的地、消耗 `rabbit_path`、Golden Rabbit King、North Gate / Mount / Pet / Sakura 联动、新 clue（任务卡 §39）。详见 `01_WORLD_AND_MAIN_PLOT.md` §1.1。
- **本阶段禁止实现 Act II+ 正式内容**：水雾殿 / 莉安雅 / 百幻桃林 / 狐媚儿 / 司马幽兰 / 精灵峡谷 / 天妖夫人 / 大日岛正式地图 / 武斗大会 / 天梦终局（任务卡 §1/§56 本阶段范围）；除两个剧情 vertical slice 外不扩地图（任务卡 §1/§56 本阶段范围）。
- **禁止编造原著事实**：无法核实标 `[UNKNOWN]`，未来标 `[PLANNED]`，改编标 `[PROJECT-AU]`，已上线标 `[CANON]`。
- **禁止把旧资料污染写回游戏**：发现冲突记入 `canon/CANON_CONFLICTS.md`，不自行偷偷裁定（canon/CANON_CONFLICTS.md 项目约定；任务卡 §6 不自行搜索外部资料）。

---

## 13. 任务卡编号口径说明

本文档及 design/ 各文件的「任务卡 §NN」均指《TM-P2-007_核心RPG系统扩展_任务卡.md》的章节编号（顶层 #1–#61 及子节 §x.y）。canon/ 层草稿沿用了更早任务卡/规划稿的旧编号（如 §108、§120、§121–122），不代表本任务卡章节；以任务卡正文为准，canon 旧编号仅作资料溯源。

---

## 14. 关联文档

- 世界与主线总纲：`01_WORLD_AND_MAIN_PLOT.md`
- 游戏方向总纲：`00_GAME_DIRECTION.md`
- Encounter V2 设计：`combat/encounter_design.md`
- Party Combat V5 设计：`combat/party_combat.md`
- 裁定记录：`canon/00_DECISIONS.md`、`canon/CANON_CONFLICTS.md`
