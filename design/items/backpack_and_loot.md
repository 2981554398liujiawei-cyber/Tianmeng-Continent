# 背包 V2 与战利品 V2（Backpack V2 & Loot V2）

> 依据任务卡 TM-P2-007 §4 Backpack V2、§5 Loot V2、§6 战斗胜利结算编制。
> 代码基线（只读核对，本卡不改）：`src/game/content/items.ts`、`src/game/types/item.ts`、`src/game/content/lootTables.ts`、`src/game/content/enemies.ts`。
> 标签规范：`[CANON]`=已上线实现；`[PROJECT-AU]`=项目改编；`[PLANNED]`=未来规划；`[UNKNOWN]`=无法核实。

## 1. 产品目标

世界页左栏不能继续随着物品增长无限变长。左栏改为"背包 + 最多 3–5 项 + [打开背包]"，全部物品移到 BackpackPanel 展示（任务卡 §4.1）。

## 2. 世界页左栏 compact 规则

最多显示最近 / 常用 3–5 项，其余全部收进 BackpackPanel。

```text
背包
12 种物品

治疗药水 ×2
铁剑 ×1
狼牙 ×3

[打开背包]
```

- 第 1 行：标题「背包」。
- 第 2 行：「N 种物品」（种类数，非总件数）`[CANON]` 现有背包为 InventoryEntry[]（itemId + quantity，`src/game/types/item.ts`），数量显示与种类数区分需在实现时明确 `[UNKNOWN]`。
- 之后最多展示 3–5 项（名称 × 数量）。
- 末尾固定 `[打开背包]` 按钮，打开 BackpackPanel。
- 不要把全部 item card 纵向塞进 GamePage（任务卡 §4.2）。

## 3. BackpackPanel

点击 `[打开背包]` 打开（任务卡 §4.2）：

- 桌面：Modal 或大 Drawer。
- 移动：全屏 / 底部全高 Drawer。

分类 tabs：

```text
[全部]
[装备]
[消耗品]
[材料]
[任务]
[特殊]
```

六类 tab 与现有七类 ItemType 的映射见 §5（C-007 收敛待办）。

## 4. 物品模型现状与差异（C-007）

### 4.1 代码现有 ItemType —— 七类 `[CANON]`

`src/game/content/items.ts` 已上线（TM-P2-004 第 65 节新增 gift）：

```ts
export type ItemType = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'quest' | 'material' | 'gift'
```

### 4.2 任务卡 §4.3 最小扩展 —— ItemCategory 五类

```ts
type ItemCategory =
  | 'equipment'
  | 'consumable'
  | 'material'
  | 'quest'
  | 'special';

type ItemRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';
```

`ItemRarity` 五档与代码 `src/game/content/items.ts` 一致 `[CANON]`（缺省视为 common）。

### 4.3 三方差异记录（照 C-007 记录，不自行裁定）

| 来源 | 类别数 | 类别清单 | 状态 |
|---|---|---|---|
| 代码 `ItemType`（`src/game/content/items.ts`） | 七类 | weapon / armor / accessory / consumable / quest / material / gift | `[CANON]` 已上线基线 |
| 任务卡 §4.3 `ItemCategory` | 五类 | equipment / consumable / material / quest / special | 最小扩展草案（§4.3 原文） |
| C-007 主张 A（引旧任务卡 §21） | 六类 | weapon / armor / consumable / material / quest / special | 冲突记录引用说法 `[UNKNOWN]` 原文出处待回查 |

- 差异焦点：
  - **accessory**：代码已有该类型（`ItemSlot` 三槽含 accessory，`src/game/types/item.ts`），任务卡两类（五类 / 六类）清单均未列出——当前物品目录无 accessory 实例，类型与槽位已预留 `[CANON]`。
  - **gift**：代码独有（`tianlong_osmanthus_cake` 天龙桂花糕，TM-P2-004 第 66 节）`[CANON]`。
  - **special**：任务卡引入、代码无对应类型。
- 裁定：照 C-007 `[OPEN]` —— 本阶段采取「不推翻现有 item model、增量扩展」方针（任务卡 §4.3："如果现有 `type` 已经可以可靠表达分类，可以复用，不要制造重复字段"）。以代码既有 `ItemType` 为基线，不新增 category 字段；`special` 与 `gift` 的归类方式待 Backpack V2 实现时收敛。产品语义不变（不因重量限拾取、quest item 保护）。

### 4.4 ItemDefinition 现有字段（基线）`[CANON]`

`src/game/content/items.ts`：

```ts
export interface ItemDefinition {
  id: string
  name: string
  type: ItemType
  description: string
  value: number          // 基础价值（金币）
  rarity?: ItemRarity    // 缺省 common
  healAmount?: number    // 仅 consumable
  weaponDamageBonus?: number  // 仅 weapon
  armorDefenseBonus?: number  // 仅 armor
  allowedProfessions?: ProfessionId[]
  giftTags?: string[]    // 仅 gift
}
```

本阶段在 §4.3 最小扩展范围内「可复用现有 `type`」，不制造重复分类字段（任务卡 §4.3）。`stackable` / `maxStack` / `tags` 为 §4.3 列出的可选最小扩展，是否新增按实现需要（现有物品数量均为单种计数，`InventoryEntry.quantity` 已承载数量）`[UNKNOWN]`。

## 5. UI 分类 tab 映射（建议，收敛待办）

BackpackPanel 六 tab ↔ 现有七类建议映射：

| tab | 映射 ItemType | 说明 |
|---|---|---|
| 全部 | 全部 | 默认视图 |
| 装备 | weapon / armor / accessory | 对应 `ItemSlot` 三槽 |
| 消耗品 | consumable | |
| 材料 | material | 含现有 `iron_ore` 铁矿石 |
| 任务 | quest | |
| 特殊 | gift（未来 special 并入） | C-007 收敛待办：gift 归「特殊」为建议，待实现时定案 |

> 注：任务卡六 tab 无「礼物」；代码既有 `gift` 类型物品（天龙桂花糕）需要落到某一 tab，上表建议归「特殊」。此归属属 C-007 收敛范围，标注建议而非定案。

## 6. 背包行为（任务卡 §4.4）

支持：

- 分类（六 tab）。
- 基于名称的稳定排序（按物品 name 排序，实现时固定 locale 比较，避免 locale 抖动 `[UNKNOWN]` 具体实现细节）。
- 数量显示（名称 × 数量）。
- 物品详情。
- 装备。
- 卸下。
- 使用战斗外可用消耗品（`healAmount` 药水等）。
- 职业不可用提示（物品 `allowedProfessions` 不含当前职业时，装备/使用给出提示，不执行）。
- 任务物品不可误使用（`quest` 类型不允许装备/使用/丢弃）。
- 无制作系统：材料详情文案可提"未来任务或制作"，但**不出现 `[制作]` 按钮**（任务卡 §4.5）。

明确不做（任务卡 §4.4 排除清单）：

- 重量 / 负重 / 格子容量
- 物品旋转 / Tetris 背包
- 仓库 / 伙伴独立背包
- 拆分堆叠 UI
- 丢弃确认大系统

## 7. 物品详情（任务卡 §4.5 示例）

装备（防具）：

```text
硬皮甲
稀有度：普通
类型：防具

护甲 +2

适用：
战士 / 骑士 / 游侠

价值：
30 金

[装备]
```

- 字段：名称 / 稀有度（`rarity`，缺省 common）/ 类型（`type` 中文名）/ 属性（`weaponDamageBonus` / `armorDefenseBonus` / `healAmount` 等）/ 适用职业（`allowedProfessions`）/ 价值（`value` 金）。
- 存在 `allowedProfessions` 时展示"适用：职业列表"；职业不可用时按钮置灰或点击给提示（§6）。
- 已有物品基线 `[CANON]`：硬皮甲 `hardened_leather_armor`（armor +2，适用 warrior/knight/ranger，30 金）、旅行布衣 `traveler_cloth_armor`（armor +1，适用四职业，12 金）、锁子甲 `chainmail_armor`（armor +3，warrior/knight，55 金）、灵纹法袍 `arcane_robe`（armor +2，mage，40 金）、铁剑 `iron_sword`（weapon +2，30 金）、精制铁剑 `refined_iron_sword`（weapon +3，uncommon，60 金）、治疗药水 `healing_potion`（回复 8，10 金）。

材料：

```text
狼牙
材料

黑鬃狼类怪物的尖牙。
可出售，也可能用于未来任务或制作。

价值：4 金
```

- 材料详情 = 名称 / 类型 / 描述 / 价值，无装备/使用按钮（本阶段无制作系统）。
- 注：任务卡示例「狼牙 / 价值 4 金」为示意；代码现有 `black_fang` 黑鬃狼牙价值 5、`black_mane_pelt` 黑鬃狼皮价值 40（uncommon）`[CANON]`，示例与现有数值的差异不构成变更依据，实现以代码数值为准。

## 8. Loot V2

### 8.1 数据结构（任务卡 §5.1 原文）

```ts
interface DropEntry {
  itemId: string;
  minQuantity: number;
  maxQuantity: number;
}

interface RandomDropEntry extends DropEntry {
  baseChance: number;
}

interface LuckyDropEntry extends DropEntry {
  dc: number;
}

interface DropTable {
  guaranteed?: DropEntry[];
  random?: RandomDropEntry[];
  lucky?: LuckyDropEntry[];
}
```

EnemyDefinition 增加：

```ts
dropTable?: DropTable;
```

（现有 `EnemyDefinition` 在 `src/game/content/enemies.ts` `[CANON]`，本卡新增可选 `dropTable` 字段。）

### 8.2 三类掉落语义（公式原样引用，不得改写）

**guaranteed**：100% 获得。

**random**：Luck 影响概率：

```text
effectiveChance =
clamp(
  baseChance + luckModifier * 0.02,
  0.02,
  0.95
)
```

其中：

```text
luckModifier = floor((LCK - 10) / 2)
```

（`effectiveChance` 被夹在 0.02 与 0.95 之间。）

**lucky**：做一次 Luck D20：

```text
D20 + luckModifier >= DC
```

成功获得。

### 8.3 任务必需物禁止随机卡死（任务卡 §5.3）

若某 item 是当前任务必须获得，则必须：

- guaranteed
- 或通过任务结算单独给

不得用低概率掉落卡住任务。此项与现有一致：剧情必掉（如断裂骑士团铜牌等）绝不进入掉落表，由剧情逻辑正常获得（`src/game/content/lootTables.ts` 头部注释）`[CANON]`。

### 8.4 RNG 可测试（任务卡 §5.4）

所有 drop resolution 必须允许注入 RNG。推荐签名：

```ts
resolveDropTable(dropTable, luck, rng)
```

（`luck` 为角色有效 LCK，`rng` 可注入以支持确定性测试。）

### 8.5 现有掉落兼容迁移（任务卡 §5.5）

现有黑鬃魔狼 `black_mane_wolf` 掉落（`src/game/content/lootTables.ts` `[CANON]`）：

```ts
// 旧结构 LootTable（luckTier: success / critical_success）
{ itemId: 'black_fang', quantity: 1, guaranteed: true }         // 基础必掉
{ itemId: 'black_fang', quantity: 1, guaranteed: false, luckTier: 'success' }
{ itemId: 'black_mane_pelt', quantity: 1, guaranteed: false, luckTier: 'critical_success' }
```

**必须迁移进统一 Drop V2，不得保留两套掉落路径**（任务卡 §5.5）。

等价迁移示例（`baseChance` / `dc` 具体数值由实现按平衡定 `[UNKNOWN]`）：

```ts
black_mane_wolf: {
  guaranteed: [{ itemId: 'black_fang', minQuantity: 1, maxQuantity: 1 }],
  random:     [{ itemId: 'black_fang', minQuantity: 1, maxQuantity: 1, baseChance: /* 建议值 */ }],
  lucky:      [{ itemId: 'black_mane_pelt', minQuantity: 1, maxQuantity: 1, dc: /* 建议值 */ }],
}
```

### 8.6 8 种材料最小集（任务卡 §5.6）

本阶段新增 / 复用最多约 8 种通用材料：

```text
狼牙
狼皮
兽肉
鼠尾
破损骨片
残破布片
暗影粉尘
灵性碎片
```

- 材料命名差异：任务卡清单为通用名（狼牙 / 狼皮）；代码现有为具体名 `black_fang` 黑鬃狼牙、`black_mane_pelt` 黑鬃狼皮（黑鬃魔狼线专属）。本阶段以代码既有物品为基线，通用化命名与否属收敛待办 `[UNKNOWN]`。
- 现有材料 `iron_ore` 铁矿石（TM-P1 废弃矿洞）不在 8 种清单内，作为既有材料保留，8 种清单为"本阶段新增 / 复用最多约"的最小集，不排除既有材料 `[CANON]`。

要求：

- 每个当前正式 enemy 至少有一个合理 drop table（当前敌人清单见 §9 映射）。
- 同类 enemy 尽量复用材料。
- Boss 可以有更好概率 / 额外 lucky drop。

### 8.7 每敌人 drop table 建议映射（依据 §5.6 + 现有敌人 tags）

以下为**建议映射**（结构满足"至少一个合理 drop table"），`baseChance` / `dc` 具体数值与最终材料归属以平衡与内容核定为准 `[UNKNOWN]`：

| 敌人（`src/game/content/enemies.ts`） | 类型 | guaranteed | random | lucky（Boss / 高等级额外） |
|---|---|---|---|---|
| 魔化兔 `corrupted_rabbit` | beast | 兽肉 ×1 | 兽肉（低概率） | — |
| 魔化鼠 `corrupted_rat` | beast | 鼠尾 ×1 | 兽肉（低概率） | — |
| 魔化狼 `corrupted_wolf` | beast | 狼牙 ×1 | 兽肉 | 狼皮（狼类高幸运） |
| 嘟嘟兔 `dudu_rabbit`（Boss） | beast/boss | 兽肉 ×2 | 兽肉 | 灵性碎片（Boss 额外 lucky） |
| 骷髅士兵 `skeleton_soldier` | undead | 破损骨片 ×1 | — | — |
| 骷髅队长 `skeleton_captain`（Boss） | undead/boss | 破损骨片 ×1 | 破损骨片 | 灵性碎片（Boss 额外 lucky） |
| 僵尸 `tower_zombie` | undead | 残破布片 ×1 | 破损骨片 | — |
| 黑法师 `black_mage` | undead | 残破布片 ×1 | — | 暗影粉尘 |
| 骷髅战士 `skeleton_warrior` | undead | 破损骨片 ×1 | 残破布片 | — |
| 骷髅女妖 `skeleton_witch` | undead | 破损骨片 ×1 | — | 灵性碎片 |
| 黑鬃魔狼 `black_mane_wolf` | beast | 狼牙 ×1 | 狼牙 | 狼皮（见 §8.5 迁移） |
| 残灾之影 `sakura_calamity_fragment` | calamity/shadow | 暗影粉尘 ×1 | — | 灵性碎片 |

- 复用原则：兽类（狼 / 兔 / 鼠）复用 兽肉、狼牙、狼皮；鼠类专属 鼠尾；亡灵类复用 破损骨片、残破布片；暗影 / 灾厄类用 暗影粉尘、灵性碎片。完全符合任务卡 §5.6"同类 enemy 尽量复用材料"。
- 残灾之影为强制剧情战（`canEscape: false`）`[CANON]`，其掉落不承载任务必需物，满足"正式 enemy 至少一个合理 drop table"。

## 9. 战斗胜利结算（任务卡 §6）

VictorySummary 统一显示：

```text
战斗胜利

击败：
骷髅战士 ×2
黑法师 ×1

冒险阅历 +80
金币 +17

战利品：
破损骨片 ×3
残破布片 ×1
暗影粉尘 ×1

已收入背包

[返回冒险]
```

- 本阶段不做背包容量：**战利品在 victory transaction 中自动收入背包**。
- 按钮只是关闭结算，不承担"是否获得"的逻辑。
- 展示字段：击败敌人清单 / 冒险阅历（XP）/ 金币 / 战利品 / "已收入背包"。
- 与现有 `adventureXpReward`（首次正式击败，重复 0 XP）`[CANON]` 保持：VictorySummary 展示"冒险阅历"按现有规则取值。

## 10. 状态汇总

| 项 | 状态 |
|---|---|
| ItemType 七类基线（accessory/gift 含内） | `[CANON]` |
| ItemRarity 五档 | `[CANON]` |
| ItemCategory 五类（任务卡 §4.3） | `[PLANNED]` 最小扩展草案 |
| ItemCategory 六类（C-007 引旧 §21） | `[UNKNOWN]` 原文出处待回查 |
| special / gift 归类收敛 | `[OPEN]`（C-007 收敛待办，本卡定 six-tab 归属建议） |
| DropTable 三结构 | `[PLANNED]` §5.1 |
| 黑鬃魔狼迁移 Drop V2 | `[PLANNED]` §5.5，不得保留两套路径 |
| 8 种材料最小集 | `[PLANNED]` §5.6 |
| 每正式敌人至少一个 drop table | `[PLANNED]` 建议映射见 §8.7 |
| VictorySummary 统一结算 | `[PLANNED]` §6 |
| 制作系统 | 本阶段明确不做，无 `[制作]` 按钮 |
