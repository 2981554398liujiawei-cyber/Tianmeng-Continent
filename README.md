# 天梦大陆（Tianmeng Continent）

单人、浏览器运行、文字叙事驱动的 D20 奇幻 CRPG。场景节点式探索、回合制战斗、角色成长与装备、NPC 对话与关系变化、分支剧情与世界状态变化。

> 当前阶段：Phase 0 — 项目骨架与 V1 开发基线（任务卡 TM-P0-001）。
> 本版本的目标是「能够稳定启动、拥有明确 GameState、能够修改状态并可靠存读档的浏览器游戏工程」，尚不含正式游戏内容。

## 技术栈

- React 19 + TypeScript + Vite
- Zustand（状态管理）
- Tailwind CSS v4（UI）
- Vitest（测试）
- localStorage（存档）
- npm（包管理器）

## 安装

```bash
npm install
```

## 启动（开发）

```bash
npm run dev
```

浏览器打开终端输出的本地地址（默认 http://localhost:5173）。

## 构建

```bash
npm run build
```

产物输出到 `dist/`。

## 测试

```bash
npm run test
```

核心单元测试覆盖：金币操作、背包操作、世界 Flag、地点切换、存档读写与异常存档回退。

## 当前已实现范围

TM-P0-001（已封板）：
- 三页面导航：主菜单（新游戏 / 继续游戏）、游戏页面（角色状态展示 / 保存）、开发者控制台
- 核心游戏类型：`Character`、`Inventory`、`Equipment`、`QuestState`、`NPCState`、`WorldState`、`GameState`
- Zustand 统一 GameStore：`newGame / loadGame / saveGame / deleteGame`、`setCurrentLocation`、`addGold / removeGold`、`addItem / removeItem`、`setFlag`
- 默认新游戏状态：骑士「石头城」、初始金币 50、基础背包（铁剑 ×1、治疗药水 ×2）、初始地点（青石村）、空任务与空世界 Flag
- 版本化存档（`{ version, savedAt, gameState }`，localStorage）：损坏/非法存档安全回退，不导致白屏；存档校验与运行时类型闭合（含 NaN/±Infinity 拒绝）
- 开发者控制台：修改金币 / 背包 / Flag / 地点、存读删档的实时状态验证
- 深色东方奇幻风格的基础 UI

TM-P0-002（内容数据基线与运行时注册表）：
- 内容注册表：`locations.ts`（4 地点）、`npcs.ts`（3 NPC）、`enemies.ts`（4 敌人）、`quests.ts`（1 任务）、`items.ts`（5 物品含兔子的路径）、`professions.ts`（4 职业）
- 统一查询出口 `content/index.ts`：`getLocation / getNpc / getEnemy / getQuest / getItem / getProfession`，不存在 ID 安全返回 undefined
- 游戏页当前位置显示注册表名称（青石村 + ID 小字）
- 数据一致性测试：交叉引用、Registry ID 一致、初始状态可解析、关键内容身份锁

TM-P0-003（D20 核心检定规则）：
- `src/game/rules/d20.ts`：属性修正 `floor((score-10)/2)`、熟练加值（1-20 五档）、`CHECK_DC` 五档标准、`rollD20` / `resolveD20Check`（确定性）/ `performD20Check`（真实掷骰）
- 天然 20 → 大成功、天然 1 → 大失败（无视 total）；非法输入抛 `RangeError`，不产生 NaN/Infinity
- 检定属即时结果，不写入 GameState / localStorage
- 开发者控制台新增「D20 检定测试」区：五项属性（读当前角色真实值）/ DC / 熟练 / 情境修正，完整计算过程与中文结果展示
- 43 个规则单元测试 + 2 项 E2E（检定显示过程与中文结果）

TM-P0-004（角色创建与新游戏入口）：
- 主菜单「新游戏」→ 角色创建页 → 确认创建 → 生成 GameState → 游戏页；返回主菜单不创建角色、不碰旧存档
- 可设置：姓名（1–16 字符 trim 校验）/ 性别（男/女）/ 职业（四职业，读 PROFESSIONS 注册表）+ 五项属性分配
- 属性分配：初始全部 8，可自由分配 14 点（`ATTRIBUTE_POINT_BUDGET`），最终五属性总和固定 54（`ATTRIBUTE_TOTAL`），范围 8–16，[−]/[+] 边界禁用，剩余点数实时显示（默认 0 / 14）；修正值调用 `getAttributeModifier`
- 初始 HP/MP 派生公式（`src/game/rules/character.ts`）：`maxHp = 10 + CON`、`maxMp = max(0, MND−2)`
- 默认预填石头城/男/骑士/14-12-10-8-10（剩余 0），与默认开发角色一致
- `createInitialGameState(input?)`：有 input 按玩家数据创建并自校验（非法姓名/性别/职业/属性抛 RangeError），无 input 保持默认
- `newGame(input?)` Store 接口；GameState 结构未改、SAVE_VERSION 仍 1、旧存档可读
- 创建新角色不自动覆盖旧存档；Continue 流程零回归
- 11 个创建校验单测 + 3 个 HP/MP 公式单测 + 9 项 E2E（创建流程/旧存档回归）

TM-P0-005（场景节点探索与合法地点移动）：
- `src/game/rules/exploration.ts`：纯函数 `checkTravel(current, target, flags)`，按序检查 当前地点存在 → 目标存在 → 相邻 → 解锁 Flag（严格 === true，1/"true" 不算），返回 `{allowed, reason?}`，无副作用
- Store 正式入口 `travelToLocation(targetId): boolean`：自身执行 checkTravel，非法移动不改 GameState；`setCurrentLocation` 保留为开发控制台专用
- 游戏页场景区：地点名称 + description + 相邻地点按钮（中文名，读 LOCATIONS 注册表）；锁定地点按钮禁用并提示「尚未找到进入此地的方法」（不暴露 requiredFlag）；未知 currentLocationId 显示「未知地点」不崩溃、无移动按钮
- 移动只改内存、不自动保存；手动保存后 Continue 恢复当前位置
- 开发者控制台新增「解锁兔王巢穴」验证按钮（setFlag('rabbit_lair_unlocked', true)）
- GameState 结构未改、SAVE_VERSION 仍 1
- 17 个探索规则单测 + 8 个 Store 移动单测 + 13 项 E2E（流程 A 基本移动 / B 锁定 / C 解锁 / D 存档恢复位置 / 未知地点边界）

TM-P0-006（最小任务状态机与任务日志）：
- `src/game/rules/quest.ts`：`canTransitionQuestStatus(from, to)` 状态机（undiscovered→available→in_progress→completable→completed；in_progress/completable→failed；completed/failed 终态）
- Store 五个任务操作（均返回 boolean，Store 自身校验，非法操作 GameState 完全不变）：`discoverQuest`（不存在→创建 available/stage0/flags{}；undiscovered→available；不重复创建；未知 ID 拒绝）/ `acceptQuest` / `markQuestCompletable` / `completeQuest`（不发奖励）/ `failQuest`
- 任务不在 quests 中视为 undiscovered；默认 quests=[] 不变；任务 ID 必须来自注册表
- GamePage 新增「附近委托」（通过 giverNpcId→NPC.locationId 判断，不写死地点）+「任务日志」（名称/状态中文/summary；completable 且位于给予者所在地时显示「提交任务」；缺失任务定义显示「未知任务」不崩溃）
- 状态中文：未发现/可接受/进行中/可完成/已完成/失败
- 任务变化只改内存不自动保存；手动保存后 Continue 恢复任务状态
- 开发者控制台新增「任务状态验证」区（发现/接受/标记可完成/完成/失败 + 当前状态）
- GameState 结构未改、SAVE_VERSION 仍 1、未新增 questJournal/activeQuestId 等
- 19 个状态机单测 + 13 个 Store 任务单测 + 10 项 E2E（发现/接受/移动保留/存档恢复/标记可完成/提交/金币不变）

TM-P0-007（最小战斗规则内核与敌人战斗数据）：
- `src/game/rules/combat.ts`：`getPlayerDefense = 10 + AGI修正`、`getPlayerAttackBonus = STR修正 + 熟练加值`、`getPlayerBasicDamage = max(1, 4 + STR修正)`（均复用已封板 getAttributeModifier/getProficiencyBonus）
- `resolveAttack(roll, attackBonus, defense, baseDamage)`：天然20→暴击命中伤害×2（无视 total）、天然1→大失败伤害 0（无视 total）、普通 total>=defense→命中、否则未命中；`performAttack` 复用现有 rollD20
- 输入边界：非法 roll/attackBonus/defense/baseDamage 抛 RangeError，不产生 NaN/Infinity
- 四敌人补齐 V1 战斗基线：魔化兔 HP8/防11/攻+2/伤2、魔化鼠 HP6/防10/攻+2/伤2、魔化狼 HP12/防12/攻+3/伤3、嘟嘟兔 HP24/防13/攻+4/伤4（name/description/tags/level 不变）
- 战斗规则纯输出：不修改 GameState/玩家 HP、不新增 BattleState/回合/先攻/敌人当前 HP；GamePage 无战斗功能
- 开发者控制台新增「普通攻击规则测试」区：敌人下拉（读 ENEMIES）/玩家攻击敌人/敌人攻击玩家，完整计算过程与中文结果（暴击/命中/未命中/大失败），无副作用
- GameState 结构未改、SAVE_VERSION 仍 1
- 15 个战斗规则单测 + 3 个敌人数据一致性测试 + 8 项 E2E（控制台攻击测试/HP 不变）

TM-P0-008（单敌人回合战斗 MVP）：
- LocationDefinition 新增可选 `enemyIds`：青石村 [] / 村外草原 [corrupted_rabbit] / 废弃矿洞 [corrupted_rat] / 兔王巢穴 [dudu_rabbit]（corrupted_wolf 未入遭遇）；内容测试锁定敌人 ID 可查询且地点字段不变
- GamePage 新增「附近威胁」：仅当当前地点 enemyIds 非空时显示（名称/Lv/HP/防御读 ENEMIES），[迎战]；player.hp=0 时禁用并提示「当前状态无法战斗」
- `src/pages/CombatPage.tsx`：敌人当前 HP 为本地 React 状态（不进 GameState/存档）；玩家先行动 → 敌人存活才反击（同一套 performAttack）；胜利：敌人归零立即 victory 且不反击，[返回冒险] 回原地点、HP 保留、无奖励；失败：玩家 HP 归零 defeat，攻击禁用、无负 HP，仅 [返回主菜单]（不复活/不自动读档）；战斗中不可保存/逃跑
- Store 新增 `damagePlayer(amount)`：hp = max(0, hp − amount)，仅正整数伤害，无通用 setPlayerHp
- App 保存瞬时 UI 状态 activeEnemyId（非 GameState，不进存档）；正式入口校验敌人存在且属于当前地点 enemyIds，未知 enemyId 不进战斗不崩溃
- GameState 结构未改、SAVE_VERSION 仍 1
- 4 个地点遭遇数据测试 + 5 个 damagePlayer 单测 + 9 项 E2E（迎战进战斗页/循环攻击 HP 单调非负/胜负结局/胜利返回/失败 Continue 恢复）
- TM-P0-008-R1：combat.ts 新增确定性阶段纯函数 `resolvePlayerStrike`（致死攻击→victory 不反击/未命中→敌人回合继续）与 `getCombatPhaseAfterEnemyAttack`（HP 0→defeat），CombatPage 实际使用；5 个确定性单测（致死/超额截断/未击杀反击/未命中/HP 归零）+ E2E 固定 Math.random 天然 20 第一击即胜且玩家 HP 不变

TM-P0-009（战斗胜利驱动《村外异动》任务闭环）：
- Store 新增 `resolveCombatVictory(enemyId)`：战斗胜利提交到持久 GameState 的唯一正式入口；Store 自校验（getEnemy 存在 / 当前地点存在 / 敌人属于当前地点 enemyIds），非法/伪造胜利返回 false 且 GameState 完全不变
- 推进规则：仅当 魔化兔 + 村外草原 + 《村外异动》in_progress 时 in_progress→completable（复用封板 canTransitionQuestStatus）；未接受（quests=[]）/available 不被跳过；completed 终态不回退；非任务敌人合法胜利返回 true 但 quests/gold/inventory/world 全不变
- stage/flags 不变；world.completedEvents 不变；同一敌人允许再次迎战；战斗胜利与任务推进只改内存不自动保存
- App handleVictory：返回游戏页前先调用 resolveCombatVictory；CombatPage 不接触任务
- 首个完整闭环（不依赖开发者控制台）：接受任务 → 村外草原击败魔化兔 → 胜利返回日志「可完成」（不在给予者所在地无提交按钮）→ 回青石村出现[提交任务] → 已完成，无任何奖励
- GameState 类型结构未变、SAVE_VERSION 仍 1
- 9 个 Store 单测（合法推进/未接受/available 不跳过/错误敌人/伪造胜利/未知敌人/终态不回退/无奖励副作用/不自动保存）+ 12 项 E2E 完整闭环（含固定随机一击击杀、无奖励断言）

TM-P0-010（背包展示与治疗药水使用）：
- ItemDefinition 新增静态内容字段 `healAmount`（非 GameState 字段）；healing_potion 锁定 healAmount=8、type=consumable；内容测试锁定所有 healAmount 存在则必须为正整数且仅用于 consumable
- Store 新增 `useHealingPotion()`（唯一物品使用入口，未加通用 useItem）：需 gameState + 背包有药水 + 0 < hp < maxHp + 注册数据有效；成功 hp=min(maxHp, hp+8) 且药水 -1（同一 Store 更新原子完成）；满血 / HP 0（非复活道具）/ 无药水 → false 且 GameState 完全不变；最后一瓶使用后移除 inventory 条目（不存 quantity=0）；不自动保存
- GamePage 新增「背包」区：显示 inventory（名称/数量/description 读 getItem）；仅 healing_potion 显示[使用]（启用条件 0 < hp < maxHp；满血禁用提示「生命已满」；HP 0 禁用提示「当前无法使用」）；其他物品只展示；未知物品显示「未知物品 ×n（缺失物品定义：id）」不崩溃不删除
- CombatPage 未改（战斗中无背包/道具）；初始背包铁剑×1/治疗药水×2 不变
- GameState 类型结构未变、SAVE_VERSION 仍 1、旧存档继续可读
- 3 个内容数据测试 + 8 个 Store 单测（正常治疗/上限截断/满血/HP0/无药水/最后一瓶移除/无 gameState/不自动保存）+ 15 项 E2E（初始背包/满血禁用/确定性受伤 22→20→用药 22/药水×1/存档恢复）

TM-P0-011（完成《村外异动》解锁兔王巢穴）：
- `completeQuest('quest_village_monsters')` 成功（仅 completable→completed）时在同一原子更新中设置 `world.flags.rabbit_lair_unlocked = true`（先过封板状态机再产生世界效果）；其他任务不得触发；其他 world.flags 完整保留；已有 false 覆盖为 true、已有 true 保持
- 地点数据/checkTravel/travelToLocation 未改，UI 只自然读取 flag（无「任务完成则启用按钮」分支）；不发金币/物品/经验/rabbit_path；completedEvents 不变；不自动保存；开发者控制台「解锁兔王巢穴」开发按钮保留
- 完成前兔王巢穴保持锁定（required_flag_missing），提交完成后经村外草原可正常进入，可见嘟嘟兔（HP 24 · 防御 13）
- GameState 类型结构未变、SAVE_VERSION 仍 1
- 9 个 Store 单测（正常解锁/in_progress·available·failed 不解锁/其他 flag 保留/已有 false 覆盖/无奖励副作用/探索联动 checkTravel 前后对比+travelToLocation/不自动保存）+ 7 项 E2E（提交前锁定/提交后启用/进入巢穴见嘟嘟兔/存档恢复仍可进入）

## 目录结构

```
src/
├─ app/          # 应用壳与页面导航
├─ components/   # 通用组件
├─ game/
│  ├─ state/     # Zustand 游戏状态 Store
│  ├─ rules/     # 游戏规则层（后续任务卡实现）
│  ├─ content/   # 游戏内容注册表（地点/NPC/敌人/任务/物品/职业/初始状态）+ 统一查询出口
│  ├─ types/     # 核心类型定义
│  └─ utils/     # 工具（localStorage 存档等）
├─ pages/        # 主菜单 / 游戏页面 / 开发者控制台
└─ styles/       # 全局样式（Tailwind v4 主题）
```

## 后续规划（V1 目标范围）

角色创建、D20 检定、场景节点探索、回合制战斗、技能与职业、装备与物品、背包、任务系统、NPC 与关系、商店与金币、世界状态、存档读档（已完成基线）、AI 接口预留。详见任务卡 TM-P0-001 §3。
