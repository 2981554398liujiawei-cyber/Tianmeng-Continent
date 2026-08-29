# 00 — 项目正式裁定记录（DECISIONS）

> 本文件是项目 Canon 层的正式裁定登记簿。任何进入工程资料的裁定都必须在此登记。
> 裁定遵循 `00_SOURCE_OF_TRUTH.md` 优先级；新裁定由用户明确授权或由本阶段任务卡明确指示后登记。

## 0. 本文件定位

- 记录"项目 canon 当前正式裁定"（优先级第 2 档）。
- 与 `AU_CHANGES.md`（改编登记）分工：本文件记录**裁定本身与禁止清单**；AU 文件记录**改编的原文对照**。
- 与 `CANON_CONFLICTS.md` 分工：本文件记录**已定案结论**；冲突文件记录**发现中/待裁定的冲突条目**。已定案冲突同时保留在冲突文件备查。

## 1. P2-006 Checkpoint 上下文

- 任务卡 TM-P2-007 记录上一阶段（P2-006）状态：branch `codex/p2-006-ui-combat`，repository HEAD `eaa3648`，P2-006 working tree 约 55 项未提交改动。
- 本 worktree 当前 HEAD（git log 首行）：`eaa3648 chore(deploy): bind production cloud save D1`，与任务卡记录的 P2-006 repository HEAD 一致。
- 结论：`P2_006_CHECKPOINT_SHA = eaa3648`（以任务卡第 1.1 节流程冻结 P2-006 工作区后，TM-P2-007 baseline 即此 SHA）。实际 freeze commit 的最终 SHA 以 P2-007 开工 Git 流程产出为准，本记录在此登记任务卡基准值 `eaa3648`。
- 本阶段工作分支建议：`codex/p2-007-crpg-foundation`（自 P2-006 checkpoint 创建，禁止直接污染 main）。

## 2. 本阶段 AU 裁定摘要（完整原文见 `au/AU_CHANGES.md`）

- **AU-001 Sakura 提前**：樱花女神原著属非常后期大日岛线；项目 Lv8–14 即《落樱越界》首次相遇，Lv15 前保障建立可同行神契。后期大日岛线调整为「樱花优子归乡 / 神格恢复 / 神权重建篇」，不是第二次获取。
- **AU-002 普通宠物系统删除**：原著存在普通宠物/捕捉/宠物位/孵化/进化；项目不实现普通 PetSystem。莉安雅 / 狐媚儿 / Sakura 统一以 Companion / Special Contract Companion 实现。
- **AU-003 坐骑改编**：原著坐骑有大量独立能力与骑战效果；项目坐骑**不是 Combatant、不获得独立回合、不能独立攻击**，只提供基础属性加成 / 派生属性影响 / 探索 Tag / 旅行能力 / 特殊场景选项。
- **AU-004 战斗规模**：项目固定最多 3 我方 + 3 敌方。大型战争用群体单位 / 波次 / 剧情表现 / 背景军队解决，不是 20v20 Combat DOM。
- **AU-005 MMO → 单机 CRPG**：原著是 MMO，项目不是。不做 MMO 玩家经济模拟 / 服务器排行榜竞争核心 / 实时在线 / 帮派 MMO 后台 / 100 人战场；保留世界观、任务、幸运、装备、坐骑、隐藏事件、美女 NPC、职业与原著关键故事。

## 3. 本阶段正式禁止清单（任务卡明确禁止或已裁定禁止）

### 3.1 系统层禁止

- **禁止创建普通 PetSystem**：不得出现 PetState / PetRegistry / petSlots / capturePet / hatchPet / petEquipment / petEvolution / petBattle（任务卡第 35 节）。
- **禁止 MMO 化**：MMO 玩家经济模拟、服务器排行榜竞争核心、实时在线、帮派 MMO 后台、100 人战场（AU-005）。
- **禁止负重**：Encumbrance / carryWeight / 超重速度惩罚 / 仓库重量 / 伙伴背包分摊（任务卡第 23 节）。
- **禁止实时地图移动速度**：speed +80% / 移动动画加速（任务卡第 44 节）；转换为探索权限、特殊选项、追逐检定 bonus、旅行事件 bonus。
- **禁止 RPG 棋盘**：grid / position / movement points / line-of-sight / height / pathfinding（任务卡第 84 节）。
- **禁止 AI 自由聊天**：LLM 实时生成伙伴对白（任务卡第 94 节）；始终 authored content。
- **禁止队伍动态缩放**：不因队伍人数自动调整敌人数量（任务卡第 55 节）；Encounter 是世界的一部分，队伍变强就该真的变强。
- **禁止 Encounter Variant 刷新重投**：Variant 一旦生成不得 F5 重刷（任务卡第 56 节）；需持久化 `resolvedEncounterVariants`。
- **禁止一次性塞多匹坐骑**：本阶段只实现一匹真正可获得早期坐骑（任务卡第 46 节）；不得 Lv3 白送紫焰雷翼马。

### 3.2 数值/公式禁止

- **禁止推翻 Combat V3**：命中公式 `(攻击者 AGI + D20) / 2 >= 防守者 AGI`、nat1 / nat20 / glancing / armor 继续原语义（任务卡第 66 节）。
- **禁止强制战斗公式外数值**：任务物品永不被 RNG 卡死——mandatory quest item = guaranteed 100%（任务卡第 30 节）。

### 3.3 剧情/内容禁止（本阶段）

- **禁止新地图扩张**：除两个 vertical slice 外不扩地图（任务卡第 122 节）。
- **禁止本阶段实现**：水雾殿正式主线、莉安雅正式获取、百幻桃林、狐媚儿、司马幽兰、精灵峡谷、天妖夫人、大日岛正式地图、武斗大会、天梦终局（任务卡第 121 节）。
- **Golden Rabbit 硬冻结**：quest_golden_rabbit_search = in_progress / stage 0；四 flag（asked_blacksmith / asked_apothecary / village_inquiry_reported / rabbit_lair_rechecked）均为 true；inventory 保持 rabbit_path ×1；禁止新目的地、消耗 rabbit_path、Golden Rabbit King、North Gate 联动、Mount 联动、Pet 联动、Sakura 联动、新 clue（任务卡第 108 节）。
- **禁止编造原著事实**：无法核实的事实标 `[UNKNOWN]`；未来内容标 `[PLANNED]`；项目改编标 `[PROJECT-AU]`；已上线标 `[CANON]`。
- **禁止把旧资料污染写回游戏**：发现冲突记入 `CANON_CONFLICTS.md`，不偷偷自行裁定（任务卡第 120 节）。

### 3.4 成人内容边界禁止（任务卡第 18 节）

以下**不得当作成人同意**，必须另有主动选择 / 明确关系 / 自愿推进：

```
战败 / 束缚 / 魅惑 / 精神控制 / 奴役 / 契约 / 醉酒无判断能力 /
救命 / 任务奖励 / 好感数值达到阈值
```

- 关系档案数值**绝对禁止** `lust / desire / sex / obedience / submission`（`src/game/types/relationship.ts` 注释明确）。
- RelationshipProfile values **严禁** `likes_obedience / likes_being_owned`（`src/game/content/relationships.ts` 注释明确）。
- 实际亲密场景一律 fade-to-black + 事后余韵 + 关系/状态变化，不写图形化露骨细节。
- 仅明确成年角色可参与亲密内容；本阶段六核心角色与骨架角色的成年状态见各档案字段 03（本阶段全部成年）。

## 4. 已定案事实锚（避免重复争议）

- Sakura 后台 = `Companion` + `divine_contract_pet` classification；`divine_contract_pet` 是**剧情分类**，不代表存在普通 PetSystem；未来可重命名，本阶段不强制迁移存档（任务卡第 110 节）。
- 莉安雅 / 狐媚儿后台 = `Companion`（任务卡第 36 节）。
- 存档 schema：当前 V5 为线上存档版本（任务卡第 107 节「当前线上 V5 存档」）；本阶段允许 V5→V6，仅因 MountState + resolvedEncounterVariants 需要新增永久状态（任务卡第 57 节），不塞无关字段。
- Cloud 协议 / passphrase HMAC / CAS / D1 schema 本阶段禁止改动，除非 SaveExport 因 V6 validator 需要兼容（任务卡第 106 节）。

## 5. 裁定登记表

| 编号 | 裁定 | 来源 | 状态 |
|---|---|---|---|
| D-001 | 采用任务卡第 7 节六档来源优先级 | TM-P2-007 §7 | 已定案 |
| D-002 | P2_006_CHECKPOINT_SHA 基准 = eaa3648（任务卡记录值） | TM-P2-007 §1.1 | 已定案 |
| D-003 | AU-001~005 全部采用 | TM-P2-007 §8 | 已定案 |
| D-004 | 不实现普通 PetSystem；特殊伙伴用 Companion 语义 | TM-P2-007 §35–36 | 已定案 |
| D-005 | 坐骑不是 Combatant，无独立回合/攻击 | TM-P2-007 §39 | 已定案 |
| D-006 | ~~战斗规模固定 3v3 上限~~ **SUPERSEDED（TM-P2-012-R1 P1-05）：当前冻结规则为 4v4——友方 = 主角 + 最多 3 名 active companions = 最多 4 战斗单位；敌方 = 最多 4 战斗单位；禁止回退 3v3**（原 TM-P2-007 §61 判定自 P2-009-R1 4v4 扩容起废止） | TM-P2-012-R1 P1-05 | 已定案（覆盖旧判定） |
| D-007 | 本阶段仅两个剧情 vertical slice | TM-P2-007 §122 | 已定案 |
| D-008 | Golden Rabbit 硬冻结 | TM-P2-007 §108 | 已定案 |
| D-009 | 成人内容：明确关系+自愿推进才成立，禁止同意清单 | TM-P2-007 §17–18 | 已定案 |
| D-010 | divine_contract_pet 为剧情分类字符串兼容，保留 | TM-P2-007 §110 | 已定案 |
| D-011 | 六核心 + 第二批共 14 名女性角色本阶段全部明确成年 | TM-P2-007 §14/17 | 已定案 |
| D-012 | 本阶段允许 Save V5→V6，字段限 mounts + resolvedEncounterVariants | TM-P2-007 §57 | 已定案 |
