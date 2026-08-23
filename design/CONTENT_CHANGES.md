# 内容变更记录（CONTENT_CHANGES）

> 依据任务卡 TM-P2-007 第 38 节（§38）十项原文整理为正式变更条目。
> 标签规范：`[CANON]`=已上线实现；`[PROJECT-AU]`=项目对原著的改编；`[PLANNED]`=未来规划；`[UNKNOWN]`=无法核实。
> 本记录是《天梦大陆》相对传统规则 / 原著设定的正式内容裁定清单；后续系统与内容设计不得与之冲突。

## 变更条目

### 1. 普通宠物系统取消

普通宠物系统取消；不实现可携带、可养成的普通宠物。 `[CANON]`（方向总纲 §3 已裁定"明确不做"）`[PROJECT-AU]`（AU-002）

### 2. 特殊女性角色统一使用 Companion / Relationship 实现

特殊女性角色不引入宠物 / 召唤 / 额外养成框架，统一走伙伴（Companion）与关系（Relationship）系统。 `[CANON]`（src/game/rules/companion.ts、src/game/rules/relationship.ts 已实现）

### 3. 坐骑不作为战斗单位

坐骑只提供属性和探索能力，不进入战斗、不作为战斗单位。 `[PROJECT-AU]`（AU-003）

### 4. 战斗最多 3v3

战斗阵容最多 3v3：我方最多 3 人、敌方最多 3 人；任何战斗阵容不得超过该上限。 `[CANON]`（Encounter 敌方阵容 sum(count) ≤ 3；队伍 active 伙伴上限 MAX_ACTIVE_COMPANIONS=3；方向总纲 §3 裁定"3v3 硬上限"）

### 5. 玩家选择的是 Encounter，不是单个 enemy

玩家面对的是遭遇（Encounter），选择 / 进入的是整个遭遇而非单个敌人。 `[CANON]`（src/game/rules/encounter.ts）

### 6. 樱花优子在 15 级前通过《落樱越界》加入

樱花优子在玩家 15 级之前，通过个人支线《落樱越界》成为伙伴；"15 级前"为加入时机约束。 `[CANON]`（个人支线 S1《落樱越界》契约已实现，契约完成后 personalQuestStage=1）`[PLANNED]`（"15 级前"时机约束落地）

### 7. 后期樱花神谷剧情改为归乡 / 恢复神位

后期樱花神谷剧情线内容为归乡与恢复神位，不是"首次获得该角色"的流程。 `[PLANNED]`

### 8. 任务与剧情优先多解，不做动态等级缩放

任务与剧情设计优先提供多条解法（战斗 / 属性检定 / 职业专长 / Luck / 伙伴知识 / 环境利用 / 道具），敌人强度不做随玩家等级 / 队伍规模的动态缩放。 `[CANON]`（Encounter 数据化设计、sum ≤ 3、禁止动态等级缩放）

### 9. 女性伙伴必须拥有独立目标、支线、价值观和主线反馈

每一位女性伙伴必须具备独立的个人目标、专属支线、自身价值观，并在主线剧情中给出其视角的反馈。 `[PLANNED]`（角色模板 §26 固化字段：定位 / 价值观 / 个人支线 / 主线插话方向等）

### 10. 恋爱与伙伴是相交但独立的两套状态

恋爱（Relationship）与伙伴（Companion）是相交但独立的两套状态：伙伴状态承载加入 / 队伍 / 行动，关系状态承载好感 / 信任 / 恋爱档位，两者互不合并。 `[CANON]`（relationship 与 companion 独立模块、独立存储；恋爱档位由关系显式 flag 解锁，不占用伙伴状态）

## 关联文档

- 方向总纲（含内容裁定速查表）：`00_GAME_DIRECTION.md`
- 关系规则：`relationships/relationship_rules.md`
- Approval 规则：`relationships/approval_rules.md`
- 成人内容边界：`relationships/intimacy_rules.md`
