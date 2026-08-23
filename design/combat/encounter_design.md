# Encounter V2 — 遭遇设计

> 依据任务卡 TM-P2-007 §7（Encounter V2）与 §8（EnemyInstance）编制，配合现有内容代码（`src/game/content/enemies.ts` / `locations.ts`、`src/game/rules/encounter.ts`）整理迁移清单。
>
> 标签规范：`[CANON]`=已上线实现；`[PROJECT-AU]`=项目对原著的改编；`[PLANNED]`=未来规划；`[UNKNOWN]`=无法核实。
>
> 权威优先级：任务卡 §7/§8 为最高权威；代码现状仅用于确认已上线事实（`[CANON]`），不作为规则改写依据。与 `02_SYSTEM_BOUNDARIES.md` 冲突时以边界文件为准。

---

## 1. 核心定义

玩家不再直接选择 `enemyId`，而是选择 `Encounter`（任务卡 §7.1）。

建议的数据结构（任务卡 §7.1 原文）：

```ts
interface EncounterMember {
  enemyId: string;
  count: number;
}

interface EncounterVariant {
  id: string;
  weight: number;
  members: EncounterMember[];
}

interface EncounterDefinition {
  id: string;
  name: string;
  locationId: string;

  fixedMembers?: EncounterMember[];
  variants?: EncounterVariant[];

  canEscape?: boolean;

  encounterDefeatFlag?: string;
  description?: string;
}
```

约束（任务卡 §7.1）：

```text
sum(count) <= 3
```

- `fixedMembers` 与 `variants` **只能二选一**（任务卡 §7.1）。
- 硬边界复核：敌方战斗单位 1–3，满足 `sum(count) <= 3`；不因遭遇扩展突破 3v3 上限（`02_SYSTEM_BOUNDARIES.md` §2）。

### 1.1 字段语义

- `fixedMembers`：固定阵容。剧情 / Boss / 任务怪主要使用（任务卡 §7.2）。
- `variants`：带权重阵容。首次生成时按权重选一，之后固化（任务卡 §7.3，见 §3）。
- `canEscape`：整场遭遇是否可逃跑；未设置时按成员敌人注册表语义回退（`[CANON]` 敌人级 `canEscape` 见 `enemies.ts`；多人遭遇若任一成员禁止逃跑则整场禁止——实现级建议，最终以任务卡 Encounter 级字段为准）。
- `encounterDefeatFlag`：整个遭遇是否已被击败的持久化标记（用于一次性遭遇 / Boss 判重）。现有单敌内容继续沿用任务 flag 判重（`[CANON]`，见 §4），**不强制**每个遭遇配置该字段；新的一次性遭遇（如残破巡逻队之外的未来遭遇）需要时可配。

---

## 2. Weighted Encounter 示例

草原狼群（任务卡 §7.3 原文）：

```text
variant_a: 魔化狼 ×1      weight 50
variant_b: 魔化狼 ×2      weight 35
variant_c: 魔化狼 ×3      weight 15
```

- 所有 variant 成员合计 `sum(count) <= 3`（本示例最大 3）。

---

## 3. Variant 持久化（首次生成后不可 reroll）

已实现 [CANON]（src/game/rules/encounter.ts：checkEncounter / resolveEncounterVariant / currentEncounterVariantId；首次写入 world.encounterVariants 由调用方负责）。

- 首次生成 / 看见该 encounter 时选择 variant，然后写入（任务卡 §7.3）：

```text
world.encounterVariants[encounterId] = variantId
```

- 之后刷新、读档、切地点都不能重新 roll（任务卡 §7.3）。
- **禁止 F5 重刷**（任务卡 §7.3；`02_SYSTEM_BOUNDARIES.md` §11）。
- 该字段随 Save V5→V6 增加为 `world.encounterVariants`（任务卡 §3.1/§3.2；00_DECISIONS D-012）。
- 权重选择必须纯函数化（injected RNG），不读 UI、不依赖刷新时序，保证「生成一次」语义可测试。

---

## 4. 现有内容迁移（全部包进 EncounterDefinition）

任务卡 §7.4：**所有现有单 enemy combat entry 必须包进 EncounterDefinition**。

`[CANON]` 现状核对（`src/game/content/enemies.ts` 共 12 个敌人定义；`src/game/content/locations.ts` 分配地点；`src/game/rules/encounter.ts` 提供门控守卫）。

下表为迁移映射（EncounterDefinition `id` 为 `[CANON]` 已实现值；`locationId` 与门控以代码现状为准）：

| 现有敌人（`[CANON]`） | Encounter id（`[CANON]` 已实现 id，见 src/game/content/encounters.ts） | locationId | 类型 | 成员 | 门控现状（`[CANON]`，来自 encounter.ts） |
|---|---|---|---|---|---|
| 魔化兔 `corrupted_rabbit` | `encounter_corrupted_rabbit` | `village_grassland` | fixed | 魔化兔×1 | 普通遭遇，无额外前置 |
| 魔化狼 `corrupted_wolf` | `encounter_corrupted_wolf` | `village_grassland` | fixed | 魔化狼×1 | `quest_grassland_wolf` in_progress 才可战 |
| 魔化鼠 `corrupted_rat` | `encounter_corrupted_rat` | `abandoned_mine` | fixed | 魔化鼠×1 | 普通遭遇，无额外前置 |
| 嘟嘟兔 `dudu_rabbit` | `encounter_dudu_rabbit` | `rabbit_lair` | fixed | 嘟嘟兔×1 | 一次性 Boss；已持有 `rabbit_path` 禁止再战 |
| 骷髅士兵 `skeleton_soldier` | `encounter_skeleton_soldier` | `black_stone_tower_floor1` | fixed | 骷髅士兵×1 | 一层固定顺序前置 |
| 骷髅队长 `skeleton_captain` | `encounter_skeleton_captain` | `black_stone_tower_floor1` | fixed | 骷髅队长×1 | 士兵击败后（Boss） |
| 僵尸 `tower_zombie` | `encounter_tower_zombie` | `black_stone_tower_floor2` | fixed | 僵尸×1 | 二层固定顺序第一场 |
| 黑法师 `black_mage` | `encounter_black_mage` | `black_stone_tower_floor2` | fixed | 黑法师×1 | 僵尸击败后 |
| 骷髅战士 `skeleton_warrior` | `encounter_skeleton_warrior` | `black_stone_tower_floor2` | fixed | 骷髅战士×1 | 入口区两敌击败后 |
| 骷髅女妖 `skeleton_witch` | `encounter_skeleton_witch` | `black_stone_tower_floor3` | fixed | 骷髅女妖×1 | 三层全部前置链 |
| 黑鬃魔狼 `black_mane_wolf` | `encounter_black_mane_wolf` | `tianlong_north_gate` | fixed | 黑鬃魔狼×1 | `quest_north_gate_missing_patrol` in_progress + 痕迹已查 |
| 残灾之影 `sakura_calamity_fragment` | `encounter_sakura_calamity_fragment` | `sakura_domain_fragment` | fixed | 残灾之影×1 | 仅 guest 状态 + 神域 + 未击败可战；`canEscape=false`（强制战斗） |

### 4.1 外部 authoritative path

任务卡 §7.4：

```text
checkEncounter(...)
startEncounter(...)
```

- 可保留兼容 wrapper，但 UI 不再直接依赖 `startCombat(enemyId)`。
- 迁移原则：把现有 `checkEnemyEncounter`（`[CANON]`，`src/game/rules/encounter.ts`）的门控逻辑映射到 `checkEncounter(encounterId)`；敌人注册表与任务 flag 判重（`combatXp.ts` `isFirstKillPending` `[CANON]`）保持不变。

---

## 5. 新增：非主线可选多怪遭遇「残破巡逻队」

任务卡 §7.5：为 production 真正验证多人战斗，在不推进现有主线、不改 Golden Rabbit 的前提下，增加一个可忽略、非剧情门禁的多怪 Encounter。

**要求**（任务卡 §7.5）：

- 玩家可以不打。
- 不影响主线 flag。
- 打赢有 XP / Loot。
- 主要用于展示 2-enemy combat。
- 不强行把现有 Journey 难度翻倍。

**建议定义**（已实现 `[CANON]`；见 src/game/content/encounters.ts）：

```text
残破巡逻队（broken_patrol）
locationId：black_stone_tower_floor2（黑石塔二层；已实现）

variants:
  broken_patrol_a: 骷髅战士 ×2            weight 60
  broken_patrol_b: 骷髅战士 ×1 + 黑法师 ×1 weight 40
```

- 两个 variant 均 `sum(count) = 2 <= 3`。
- 骷髅战士 / 黑法师均已存在 `[CANON]`（`enemies.ts`），不新增敌人。
- 与主线解耦：不设置 `encounterDefeatFlag`（避免影响主线 flag 判重），胜利只发放 XP / Loot；不提供进入该遭遇的任务门禁，玩家可忽略。
- **禁止**用该遭遇自动刷新 / 动态补怪（`02_SYSTEM_BOUNDARIES.md` §4 无动态缩放）。

---

## 6. EnemyInstance（多敌区分）

多个相同敌人必须区分（任务卡 §8 原文）：

```ts
interface EnemyInstance {
  instanceId: string;
  enemyId: string;
  currentHp: number;
  maxHp: number;
}
```

UI 显示：

```text
骷髅战士①
骷髅战士②
```

- 生产 UI 不得显示内部实例 ID（任务卡 §8）。
- 战斗中由 Encounter 展开为 `EnemyInstance[]`，每个实例独立 HP / 独立 pendingLoot（掉落闭环见 `combat/party_combat.md`）。

---

## 7. 边界与禁止（本设计适用）

- 不做动态等级缩放：遭遇由数据设计，队伍变强就真实变强（任务卡 §2.4；`02_SYSTEM_BOUNDARIES.md` §4）。
- 不做 procedural dungeon generator（任务卡 §57；`02_SYSTEM_BOUNDARIES.md` §6）。
- 不做 Encounter variant 刷新重投（任务卡 §7.3；本文件 §3）。
- 不因遭遇配置突破 3v3（任务卡 §2.2）。
- 不新增敌人即可表达的遭遇，不得为凑数新建敌人注册表条目（与 `[CANON]` 数据最小变动原则一致）。

## 8. 关联文档

- Party Combat V5：`combat/party_combat.md`
- 系统硬边界：`02_SYSTEM_BOUNDARIES.md`
- 内容注册表：`src/game/content/enemies.ts`、`locations.ts`
- 门控规则：`src/game/rules/encounter.ts`、`combatXp.ts`
