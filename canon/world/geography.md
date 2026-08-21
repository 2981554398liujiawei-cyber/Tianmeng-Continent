# 地理（Geography）

> 已实现地点标 `[CANON]`（来源：`src/game/content/locations.ts`，含 connections/enemyIds/requiredFlag），规划区域标 `[PLANNED]`（任务卡第 12 节 Act 结构），原著细节未核实标 `[UNKNOWN]`。

## 一、已实现区域（[CANON]）

### 1.1 青石村地区（序章舞台）

| 地点 ID | 名称 | 说明 | 敌人 |
|---|---|---|---|
| `qingshi_village` | 青石村 | 群山环抱的小村，青石铺路，炊烟袅袅 | 无 |
| `village_grassland` | 村外草原 | 连绵草坡，风吹草低，隐约可见远处巢穴轮廓 | 魔化兔、魔化狼（任务门控） |
| `abandoned_mine` | 废弃矿洞 | 早已废弃，洞口杂草丛生 | 魔化鼠 |
| `rabbit_lair` | 兔王巢穴 | 魔化兔群巢穴（需 `rabbit_lair_unlocked`） | 嘟嘟兔（Boss，一次性清场） |

连接结构：青石村 ↔ 村外草原 ↔ 兔王巢穴；青石村 ↔ 废弃矿洞。

### 1.2 天龙城地区（第二区域）

| 地点 ID | 名称 | 说明 | 敌人 |
|---|---|---|---|
| `tianlong_city` | 天龙城 | 天龙王朝皇城 | 无 |
| `tianlong_martial_hall` | 武馆 | 城中武馆，武者与守卫操练 | 无 |
| `black_stone_tower_floor1` | 黑石塔一层 | 幽暗通道（需 `black_stone_tower_unlocked`） | 骷髅士兵、骷髅队长（Boss） |
| `black_stone_tower_floor2` | 黑石塔二层 | 曲折通道，腐败与幽暗魔力（需 `black_stone_tower_floor2_unlocked`） | 僵尸→黑法师→骷髅战士（固定顺序） |
| `black_stone_tower_floor3` | 黑石塔三层 | 残破石柱围绕中央厅堂（需 `black_stone_tower_floor3_unlocked`） | 骷髅女妖 |
| `tianlong_north_gate` | 天龙城北门 | 城门向北方荒野敞开 | 黑鬃魔狼（任务门控） |

连接结构：天龙城 ↔ 武馆 / 黑石塔一层 / 北门；一层 ↔ 二层 ↔ 三层（逐层解锁）。

### 1.3 特殊事件地点（[CANON]）

| 地点 ID | 名称 | 说明 | 敌人 |
|---|---|---|---|
| `sakura_domain_fragment` | 樱华神域·破碎边界 | 神域崩落一角，随裂隙坍缩；connections=[]，只能经 Sakura 特殊事件进入 | 残灾之影（强制战斗） |

### 1.4 已实现地理事实

- `[CANON]` 青石村 → 天龙城为**单向不可逆**跨越（离开后无法返回，`departQingshiVillageToTianlongCity`）。
- `[CANON]` 北门为 Phase 2 新地点，与天龙城双向连接，无需解锁随时可参观；任务行动只在正确状态出现。
- `[CANON]` 黑石塔各层移动按钮在未解锁时可见但 disabled（复用 requiredFlag）。

## 二、规划区域（[PLANNED]，按任务卡第 12 节主结构）

| 区域 | 关联 Act | 说明 | 原著锚点 |
|---|---|---|---|
| 天马 / 星马湖 | Act II | 坐骑成长舞台 | `[UNKNOWN]`；「天马」概念见于坐骑目录（`mounts/mount_catalog.md`） |
| 水雾殿 | Act III | 莉安雅主场 | `[UNKNOWN]` 地理细节；水雾殿名见任务卡 §10（原著 112–115/167/187–207） |
| 百幻桃林 | Act IV | 司马幽兰 / 狐媚儿 | `[UNKNOWN]` |
| 秦皇古墓 / 天梦神殿 | Act V | 古墓探险 | `[UNKNOWN]`；344 起秦皇古墓待回查 |
| 东海 / 岛屿 | Act VI | 皇室线 | `[UNKNOWN]` |
| 百兽地域 | Act VII | 坐骑生态 / 紫月天 | `[UNKNOWN]` |
| 精灵峡谷 | Act VIII | 彩芷若 | `[UNKNOWN]` |
| 猴儿林 | Act IX | 武斗大会舞台 | `[UNKNOWN]` |
| 大日岛 | Act X | Sakura 归乡 / 神格恢复 | `[UNKNOWN]` 地理细节；大日岛樱花神宫见 Sakura 档案 `[CANON]` |
| 阴风殿 | Act XI | 天妖夫人 | `[UNKNOWN]` |
| 天梦仙山 | Act XII | 圣殿之王 | `[UNKNOWN]` |

## 三、地理设计规则（[PLANNED] 阶段适用）

- `[CANON]` 当前移动模型：场景节点式、无向连接 + requiredFlag 门控（`checkTravel`）。
- `[PLANNED]` 坐骑 travel tags（`fast` / `mountain` / `flight` / `storm` / `royal`）未来用于解锁探索权限、特殊选项、追逐检定 bonus、旅行事件 bonus（任务卡 §42–44）；**不做实时移动速度**。
- `[PLANNED]` 新区域必须符合「离村不可逆」与「目标驱动回查」原则：新增地图不得凭空编造，原著地点需有章段来源。
- `[CANON]` 当前地图不含大日岛本岛、水雾殿等任何 Act II+ 地点；这些区域的地图入口须在对应 Act 以正式任务/事件解锁。
