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

TM-P0-012（击败嘟嘟兔获得唯一《兔子的路径》）：
- `resolveCombatVictory` 仍为唯一正式胜利提交入口（Store 自校验敌人/地点/所属关系）；新增固定 Boss 战利品分支：兔王巢穴击败嘟嘟兔且背包无 rabbit_path 时，在同一次 Store 更新中加入 `{ itemId:'rabbit_path', quantity:1 }`（未用通用 addItem 拼接、无掉落表/权重/随机）
- 唯一性：已有 ×1 再胜利不复制、不产生重复 entry（单测 B/C 硬锁）；错误地点伪造 Boss 胜利 false 且 GameState 完全不变；其他敌人（魔化兔/鼠/狼）无任何掉落；魔化兔任务推进零回归
- 除 inventory 外 player/equipment/quests/world 全不变（gold 不变、HP/MP 不恢复、rabbit_lair_unlocked 不变、completedEvents 不变）；不自动保存
- 无奖励弹窗/结算页；CombatPage 不直接发奖励；Boss 可重复迎战但只获得一次藏宝图；rabbit_path 定义未改（type=quest 藏宝图）
- GameState 类型结构未变、SAVE_VERSION 仍 1
- 8 个 Store 单测（正常 Boss 胜利/重复不复制/预先已有/错误地点伪造 false/其他敌人无奖励/魔化兔推进零回归/无额外副作用/不自动保存）+ 6 项 E2E（Boss 战前无藏宝图/固定随机击败嘟嘟兔/返回后 ×1 与描述/存档恢复仍 ×1）

TM-P0-013（铁剑装备与武器伤害加成）：
- ItemDefinition 新增静态字段 `weaponDamageBonus`；iron_sword=2（id/name/type/description/value 不变）；内容测试锁定 weaponDamageBonus 存在则正整数且仅 weapon，其他物品不携带
- combat.ts 新增 `getPlayerAttackDamage(str, weaponDamageBonus=0) = getPlayerBasicDamage(str) + bonus`（getPlayerBasicDamage 语义不变）；0/正整数允许，-1/1.5/NaN/Infinity 抛 RangeError，返回保证 finite；暴击公式未改（baseDamage 8 → 天然20 → 16）
- Store 新增 `equipWeapon(itemId)` / `unequipWeapon()`：equip 需 gameState + 物品存在 + type=weapon + 背包拥有 quantity>=1（装备不消耗 inventory，equipment.weapon 仅记录 ID）；非法（未知/药水/任务物品/未拥有/无 gameState）→ false 全不变；卸下 weapon→null 且 inventory 不变，已 null → false；未实现 equipArmor/equipAccessory/equipItem
- GamePage 新增「装备」区（武器：未装备/铁剑，名称读 getItem，未知装备显示未知武器+id 不崩溃）；背包铁剑显示[装备]/[卸下]（只调 Store action）；药水仍只有[使用]、任务物品无按钮
- CombatPage 玩家攻击改用 getPlayerAttackDamage（读当前装备，缺失/未知/非 weapon 安全按 0），玩家区显示武器行；命中率/attackBonus 未受影响；开发者控制台攻击测试同步使用相同伤害规则
- GameState 类型结构未变、SAVE_VERSION 仍 1、旧存档兼容（equipment 字段已存在）
- 3 个内容测试 + 6 个战斗伤害单测 + 8 个 Store 装备单测（正常/非武器/未知/未拥有/卸下/重复卸下/无 gameState/不自动保存）+ 12 项 E2E（装备 UI/roll 7 命中造成 8 点伤害一击胜利/卸下恢复/存档恢复）

TM-P0-014（青石村药师商店与治疗药水购买）：
- Store 新增 `buyHealingPotion()`（唯一购买入口，未实现通用 buyItem/purchase/shopTransaction）：Store 自校验当前地点存在药师（getNpc('apothecary').locationId === 当前地点，不硬编码）、商品数据（getItem('healing_potion') 存在/consumable/value 正整数）、金币充足（gold >= value）；价格唯一来源 ItemDefinition.value（10）
- 成功：gold -= value 且药水 +1（无条目新建 {itemId,quantity:1}）在同一次 Store 更新中原子完成（未拼接 removeGold/addItem）；gold 永不为负（恰好 10→0）；quantity 使用 Number.isSafeInteger 防溢出（MAX_SAFE_INTEGER 时购买失败状态不变）；失败（错误地点/金币不足/药师不在/商品异常/无 gameState）→ false 且 GameState 完全不变
- 购买不治疗（HP/MP 不变）；CombatPage 未改（战斗中无商店）；不自动保存
- GamePage 新增「药师的小铺」：仅当前地点存在药师时显示（青石村）；商品名称/description/healAmount/value 全部读注册表；金币不足时[购买]禁用并显示「金币不足」（UI 禁用非安全边界，Store 独立校验）
- GameState 类型结构未变、SAVE_VERSION 仍 1
- 9 个 Store 单测（正常购买/无条目新建/恰好够/不足 false 不变/错误地点 false 不变/无 gameState/不治疗/不自动保存/数量安全边界）+ 14 项 E2E（商店显示与价格/购买 50→40 药水×3/存档恢复/确定性受伤 20 后购买不治疗→背包使用恢复/金币耗尽按钮禁用+金币不足+不为负）

TM-P0-015（青石村附近人物与最小对话交互）：
- NpcDefinition 新增静态字段 `greeting`；村长/铁匠/药师三句固定问候语严格使用任务卡原文（内容测试精确锁定完整文本，非 toContain）；id/name/role/locationId/summary 全部保持原值；未加 dialogueTree/nodes/choices/scripts
- GamePage 新增「附近人物」区：按 npc.locationId === 当前地点动态过滤（读 NPCS 注册表，无硬编码列表）；每张卡片显示名称/role/summary/[交谈]；无 NPC 地点（村外草原/废弃矿洞/兔王巢穴）整个区域隐藏
- 对话状态 `activeNpcId: string | null` 仅 React 本地状态（非 GameState、不持久化、不初始化 NpcState）；点击[交谈]显示「与X交谈」面板（名称/role/greeting 全读注册表，JSX 未复制文案）+[结束交谈]；同时仅一个活动对话（再点他人直接切换）；结束交谈 → null 且不改任何 GameState；成功移动后自动清除（移动失败不清）
- 面板显示前重新校验 getNpc(activeNpcId) 存在且 locationId === 当前地点，未知/缺失/离场视为无活动对话不崩溃
- 对话不推进任务（委托区/日志独立）、不购买物品（商店区独立共存）、不修改 npcStates/关系值；交谈状态不进存档（Continue 后无活动对话）
- GameState 类型结构未变、SAVE_VERSION 仍 1
- 3 个内容测试（greeting 非空/三句精确锁定/既有资料不变）+ 13 项 E2E（附近人物与 summary/村长交谈全文与结束消失/药师交谈后商店仍在/移动清除对话且草原无附近人物/返回后对话保持关闭）

TM-P0-016（废弃矿洞调查 D20 正式玩法接入）：
- Store 新增唯一正式调查入口 `investigateAbandonedMine(): D20CheckResult | null`：合法条件 gameState + currentLocationId==='abandoned_mine' + flags.abandoned_mine_investigation === undefined；否则 null 且 GameState 完全不变
- 正式复用 performD20Check（MND 属性值 + level + CHECK_DC.moderate=12 + proficient:false + situationalModifier:0；未复制 rollD20/修正公式/天然1·20/DC 判断）；D20 异常安全（角色数据非法如 level=0 抛 RangeError → return null 状态不变页面不崩溃）
- 结果持久化：flags.abandoned_mine_investigation = 'success' | 'failure'（critical_success/success → success，failure/critical_failure → failure），与 D20 结算在同一次 Store 更新中原子完成（未调通用 setFlag 二次更新）；一次性检定（flag 已存在 → null 不再掷骰）；唯一持久变化即该 flag（player/inventory/equipment/quests/currentLocationId/completedEvents/npcStates/其他 flags 全不变），无奖励、不推进任务、不影响魔化鼠战斗、不自动保存
- GamePage「调查矿洞」区：仅废弃矿洞显示；未调查时显示提示语 +「心智检定 · DC 12」（DC 来自 CHECK_DC.moderate，属性读 player.attributes.mnd，未复制常量）+[仔细调查]；点击后即时显示完整结算（D20 X + 心智修正 Y = Z / DC / 结果：成功/大成功/大失败）+ 持久成功/失败文本 +「调查已完成」；调查后不再显示[仔细调查]；离开矿洞清空即时结果（返回后读 flag 显示持久结果且不可重掷）
- GameState 类型结构未变、SAVE_VERSION 仍 1；未新增 investigations/checks/skillChecks/explorationEvents
- 9 个 Store 单测（成功 total12/失败 total11/天然20/天然1/错误地点 null 不变/已调查禁止重掷且不再调用随机数/非法 level=0 不抛 null/无副作用/不自动保存）+ 9 项 E2E（调查入口与 DC 12/固定天然20 大成功即时显示+成功文本+调查已完成+按钮消失/移动返回不可重掷/存档恢复仍不可重掷）

TM-P0-017（无敌人地点隐藏「附近威胁」）：
- GamePage「附近威胁」整个区域仅当 `(location?.enemyIds?.length ?? 0) > 0` 时渲染；青石村（enemyIds=[]）不显示；删除「这里暂时没有威胁」空状态文案（不再用空状态替代隐藏）
- 未知地点（getLocation undefined）不显示威胁区且保持不崩溃；有敌人地点（村外草原/废弃矿洞/兔王巢穴）卡片行为完全不变（名称/等级/HP/防御/[迎战]/HP≤0 时「当前状态无法战斗」）
- 未修改内容注册表（各地 enemyIds 原样）、未修改 Store/GameState/WorldState/EnemyDefinition/LocationDefinition/SAVE_VERSION（仍 1）；未拆新组件
- 5 项 E2E（青石村无附近威胁且无空状态文案且附近人物/药师的小铺/附近委托正常/村外草原显示魔化兔 HP 8 防御 11 迎战/返回青石村后威胁区消失）

TM-P0-018（《村外异动》固定金币奖励）：
- QuestDefinition 新增可选静态字段 `goldReward?: number`；quest_village_monsters 固定 20（内容测试锁定 ===20，且所有 goldReward 若存在必须安全正整数）；未加 rewards[]/RewardDefinition/itemRewards/xpReward
- completeQuest 仍严格要求 completable→completed（状态机不变，不可完成状态 false 且金币/flag 不变）；成功完成时在同一次原子 Store 更新中一并：quest.status=completed + player.gold += goldReward +（《村外异动》）rabbit_lair_unlocked=true；返回 true
- 金币安全边界：gold 非负安全整数 + goldReward 正安全整数 + gold+goldReward 仍安全整数，否则 false 且 GameState 完全不变（任务保持 completable，未用 BigInt）
- 不可重复领奖：completed 后再次调用 false（状态机承担）；已完成旧状态不补发；不发物品（rabbit_path 仍仅嘟嘟兔胜利可得）/不发经验（保持 Lv.1）/不恢复 HP·MP/不新增任何 flag/completedEvents 不变/不自动保存
- GamePage 任务日志显示「奖励：N 金币」（读 quest.goldReward，JSX 未复制 20）；提交后金币即时 50→70；无奖励弹窗；药师商店无需修改即可消费奖励金币
- GameState 类型结构未变、SAVE_VERSION 仍 1
- 2 个内容测试（goldReward=20/安全正整数约束）+ 7 个 Store 单测（正常奖励原子完成/不可完成状态不奖励/重复完成不重复/已完成不补发/金币溢出拒绝/无额外副作用/不自动保存）+ 6 项 E2E（P006·P009 提交后金币 50→70 与奖励显示/存档恢复任务 completed+金币 70+解锁保留/任务金币商店消费 70→60 药水+1）

TM-P0-019（《兔子的路径》新线索突出展示）：
- GamePage 新增「新的线索」突出展示区：仅当背包实际拥有 rabbit_path（itemId 匹配且 quantity>=1）且 getItem('rabbit_path') 存在时显示；名称与 description 全部读注册表（JSX 未复制「兔子的路径/藏宝图/黄金兔子王」第二份文案）；与地点无关（青石村/村外草原/废弃矿洞/兔王巢穴均显示）
- 唯一性：用 some 判定，quantity>1 也只渲染一个线索区；缺失 ItemDefinition（getItem 返回 undefined）→ 隐藏区域不崩溃、背包未知物品降级照常、不自动删除条目
- 不新增 [使用]/[查看]/[追踪] 等按钮；不新增 useRabbitPath/examineRabbitPath 等 Action；不新增任何 World Flag/持久状态（线索显示只由既有 inventory 决定）；不新增黄金兔子王实体/地点/任务/新地图；藏宝图不能移动玩家
- 原背包 rabbit_path ×1 展示保持（新线索区为额外突出展示，不替代背包）；药水/铁剑行为不变；存档无需新逻辑（inventory 已持久化，保存→Continue 自然恢复）
- 本卡无 Store/GameState 修改；GameState 类型结构未变、SAVE_VERSION 仍 1
- 3 项 E2E（未获得藏宝图时新游戏不显示新的线索/Boss 正式流程返回冒险显示新的线索区（含藏宝图与黄金兔子王）/保存 Continue 后新的线索仍显示）

TM-P0-020（废弃矿洞魔化鼠掉落铁矿石）：
- ItemType 新增唯一类型 `material`（weapon/armor/accessory/consumable/quest/material，未加 junk/crafting/ore/resource/loot）；新增静态物品 iron_ore（id/name=铁矿石/type=material/description 精确锁定/value=5，无 healAmount/weaponDamageBonus）；内容测试精确锁定全部字段
- resolveCombatVictory 仍是唯一正式胜利提交入口（前置三重校验保留：enemyId 存在/当前地点存在/敌人属于当前地点 enemyIds）；新增固定战利品分支：废弃矿洞击败魔化鼠 → 铁矿石 +1（重复胜利堆叠更新同一 entry，不建重复条目）；未新增 grantIronOre/lootEnemy 等 Action，App/CombatPage 不直接 addItem
- 数量安全：已有数量需 Number.isSafeInteger 且 >=1 且 +1 仍安全整数才更新；quantity=MAX_SAFE_INTEGER 时合法胜利仍返回 true 但 inventory 完全不变（未用 BigInt）
- 防伪与零回归：错误地点伪造（青石村调 corrupted_rat）false 且 GameState 完全不变；未知敌人 false；魔化兔推进任务且不掉 iron_ore；嘟嘟兔仅 rabbit_path 唯一奖励不掉 iron_ore；魔化狼不新增任何奖励；无金币/经验/HP·MP/attributes/equipment/quests/world.flags/completedEvents/npcStates 修改
- 敌人数据（corrupted_rat Lv1 HP6 DEF10 攻击+2 伤害2）与战斗公式未动；未建立掉落表/概率/权重；GamePage 无需专用战利品 UI（胜利返回后背包自然显示铁矿石，无掉落弹窗/Toast/结算页）；铁矿石暂不可出售/锻造（value 仅为静态数据）
- GameState 类型结构未变、SAVE_VERSION 仍 1
- 2 个内容测试（iron_ore 精确锁定/无 healAmount·weaponDamageBonus）+ 9 个 Store 单测（首次胜利 ×1/重复堆叠 ×2 且仅一条 entry/错误地点 false/未知敌人 false/魔化兔零回归/嘟嘟兔零回归/数量边界胜利 true 但不变/无其他副作用/不自动保存）+ 9 项 E2E（战前无铁矿石/固定天然20 首次掉落 ×1 与描述/重复击败堆叠 ×2 且无两条 ×1/存档恢复仍 ×2）

TM-P0-021（青石村铁匠收购铁矿石）：
- Store 新增唯一出售入口 `sellIronOre()`（未实现 sellItem/sellMaterial/merchantSell/trade 通用系统）：Store 自校验当前地点存在铁匠（getNpc('blacksmith').locationId === 当前地点，未硬编码地点）、商品数据（getItem('iron_ore') 存在/type==='material'/value 正安全整数）、库存（iron_ore quantity>=1 且安全整数）、金币安全（非负安全整数且 +value 仍安全整数）；价格唯一来源 iron_ore.value（5 金币）
- 成功：gold += value 且铁矿石 -1（最后一块删除 entry，不留 ×0）在同一次 Store 更新中原子完成（未拼接 removeItem/addGold）；失败（无铁矿石/错误地点如废弃矿洞/金币溢出 MAX_SAFE_INTEGER/异常 quantity 0·非安全整数/无 gameState）→ false 且 GameState 完全不变
- 不出售其他物品（铁剑/治疗药水/兔子的路径/测试遗物——rabbit_path 永不进入出售逻辑）；铁剑装备（equipment.weapon=iron_sword）零影响；不自动保存
- GamePage 新增「铁匠的收购」区：仅当前地点存在铁匠时显示（正常仅青石村，其他地点整个区域隐藏）；铁矿石名称/description/收购价（5 金币）全部读注册表（未复制文案/第二价格常量）；显示「持有：N」+[出售 1 个]；无铁矿石时按钮 disabled 并显示「没有可出售的铁矿石」（UI 禁用非安全边界，Store 独立校验）；与铁匠交谈（附近人物）互相独立，greeting 未改
- GameState 类型结构未变、SAVE_VERSION 仍 1
- 9 个 Store 单测（正常出售 50→55 ×2→1/出售最后一个删除 entry/无铁矿石 false/错误地点 false/无 gameState/金币溢出 false/异常 quantity false/原子副作用边界 equipment·quests·world·hp·mp·level·attributes 全不变/不自动保存）+ 12 项 E2E（正式获取 ×2→回村铁匠收购区与持有 2/出售 50→55 铁矿石×1/存档恢复 ×1+55/经济联动 55→45 药师购药/最后一块出售 45→50 且按钮禁用+没有可出售的铁矿石）

TM-P0-022（青石村休整与战败恢复出口）：
- Store 新增唯一休整入口 `restAtVillage()`（未实现 rest/healPlayer/sleep/camp/revive 通用系统）：地点限制 currentLocationId==='qingshi_village'（本卡允许既有固定地点 ID 校验，未建 Inn/NPC/RestDefinition）
- 可恢复条件：至少一个资源未满（hp<maxHp 或 mp<maxMp，含 hp===0）；成功 hp=maxHp 且 mp=maxMp（只改这两项）；免费（不扣金币/不耗药水/不耗铁矿石）；已全满/错误地点（村外草原/废弃矿洞/兔王巢穴）/异常数值（maxHp 非正安全整数/maxMp 负或非安全整数/hp·mp 非安全整数或越界）/无 gameState → false 且 GameState 完全不变
- 战败软锁出口：HP0 可以休整恢复至 maxHp（单测明确证明）；useHealingPotion HP0 禁止规则保持不变（休整与药水是两个独立入口）；CombatPage 未修改（战斗失败仍 HP0→返回冒险）；移动规则未修改（HP0 仍可经既有连接移动回村，无自动传送/自动复活）
- GamePage 新增「村中休整」区：仅青石村显示（其他地点整个区域隐藏）；提示语「在村里稍作休息，可以恢复生命与灵力。」+[休整]；任一资源未满（含 HP0）按钮启用，全满时按钮 disabled 并显示「状态良好，无需休整」；休整后角色面板立即显示满值且按钮变 disabled；无旅店/住宿剧情
- GameState 类型结构未变、SAVE_VERSION 仍 1
- 10 个 Store 单测（正常受伤 10/22→22/MP 不满 2→6/HP0 恢复/双不满/已全满 false/错误地点 false/无 gameState/无额外副作用 gold·level·profession·attributes·inventory·equipment·quests·world 全不变/不自动保存/药水 HP0 规则零回归）+ 9 项 E2E（真实战斗受伤 HP<22/青石村休整恢复 22/22·6/6+状态良好+按钮禁用/村外草原隐藏村中休整/存档恢复保持满值）

TM-P0-022-R1（战败返回冒险并接通青石村休整——修复 Blocker）：
- 真正战败接通玩家流程：App.handleDefeat 由 setScreen('main') 改为 setScreen('game')（combatEnemyId=null + 回冒险页）；CombatPage 正常战败按钮由「返回主菜单」改为「返回冒险」（胜利按钮不变）；无 GameState/未知 enemyId 的防御性异常分支保持「返回主菜单」不退化
- 战败返回后：HP 仍 0（无自动回血/自动休整/自动读档/自动传送）、战斗地点保持（村外草原战败返回后 currentLocationId 仍 village_grassland）；GamePage 既有 HP0 规则复用：附近威胁迎战 disabled +「当前状态无法战斗」、治疗药水使用 disabled +「当前无法使用」、移动按钮仍可用
- HP0 可经既有地点连接移动回青石村 →「村中休整」[休整] enabled → 点击后 HP22/22·MP6/6 → 重新前往村外草原迎战重新可用；战败不触发 resolveCombatVictory（无铁矿石/rabbit_path/任务推进/金币）；完整战败→休整流程不自动创建存档（hasSave 保持原值）
- Store/GameState schema 零修改（restAtVillage 等既有实现未动）；SAVE_VERSION 仍 1
- 12 项 E2E（固定随机循环致死真正战败出现且按钮为返回冒险非主菜单/返回后当前位置村外草原+生命 0/22+当前状态无法战斗+迎战禁用/HP0 可移动回村/休整启用→22/22·6/6+状态良好/恢复后迎战重新启用/无存档起始下战败与休整全程不自动存档——继续游戏仍禁用）

TM-P0-022-R2（区分正常战败与异常战斗退出——修复 Blocker）：
- CombatPage Props 最小扩展：新增 onExitToMenu 回调（未建立 Router/Navigation abstraction）；正常战败（phase==='defeat'）仍调用 onDefeat → screen==='game'（返回冒险）不回退 R1
- 两个防御性异常分支按钮真正执行 onExitToMenu：无 GameState（「当前没有进行中的游戏。」）与未知 enemyId（「未知敌人（…），无法进入战斗。」）→ setCombatEnemyId(null) + setScreen('main')，按钮文字与行为一致（不再调用正常战败 onDefeat）
- App 提供最小主菜单退出回调（仅异常分支使用）；不自动 loadGame/saveGame/newGame/restAtVillage
- Store/规则层（gameStore/combat/d20/storage/GameState types）零修改；SAVE_VERSION 仍 1；无新增依赖
- R1 真正战败 E2E（225/225）零回归；未为三个边界新增测试库（保持实现最小）

TM-P0-023（生产版本隐藏开发者控制台）：
- MainMenu 开发者控制台入口改为 `{import.meta.env.DEV && (...)}` 条件渲染（import.meta.env.DEV 为唯一环境判断来源，未维护第二套 IS_PRODUCTION/NODE_ENV/hostname 判断）；开发环境（npm run dev）主菜单仍显示「开发者控制台」且可进入现有 DevStatePage（历史 E2E 依赖 dev server 全保留）；生产构建（npm run build + preview）主菜单完全不渲染该入口
- 未删除 DevStatePage 及其 QA 能力；未重构 App 导航（Screen 类型保持不变）；未增加秘密入口（无快捷键/URL 参数/localStorage 开关/密码）；正式玩法代码（GamePage/CombatPage/CharacterCreationPage/Store/规则/内容注册表）零修改
- 新增 qa/prod-smoke.mjs（生产 Smoke，真实 npm run build + npm run preview -- --port 5198 验证）：断言生产主菜单显示天梦大陆/新游戏/继续游戏、不显示开发者控制台（文本+按钮 DOM 双重断言）、不写 localStorage/不点击新游戏/不修改状态；package.json 新增 `qa:prod` 脚本（未增减任何依赖）
- 存档零修改：SAVE_VERSION=1、SAVE_KEY/SaveFile/GameState/storage validation 全未动
- 验证：单测 349/349；dev E2E 227/227 零回归（含历史「返回主菜单→开发者控制台」流程）；生产 smoke 6/6 全绿（真实生产构建）

TM-P1-001（法师职业技能「法术攻击」与灵力消耗）：
- combat.ts 新增唯一业务常量 `MAGE_SPELL_MP_COST = 2`（CombatPage 与 Store 都读取它，未维护第二常量）与两个纯函数：`getMageSpellAttackBonus(mnd, level)` = MND 属性修正 + 熟练加值（复用 getAttributeModifier/getProficiencyBonus）、`getMageSpellDamage(mnd)` = max(1, 6 + MND 修正)；法术攻击继续调用 performAttack/resolveAttack（天然20 暴击×2/天然1 大失败 0/普通命中 total>=defense 语义不变），攻击 enemy.defense，不吃 STR/weaponDamageBonus（装备铁剑只影响普通攻击）
- Store 唯一新增灵力消费入口 `spendMageSpellMp()`（未实现 spendMp/setPlayerMp/castSpell 等）：成功条件 gameState + profession==='mage' + maxMp 非负安全整数 + mp 非负安全整数且 <=maxMp + mp>=2；成功 mp-=2（只改 player.mp）；失败（灵力不足 mp1/非法职业 knight/无 gameState/非法 MP -1·越界）→ false 且 GameState 完全不变；不自动保存（MP 随手动存档自然持久化）
- CombatPage：玩家面板新增「灵力 X / Y」（所有职业显示）；仅 mage 显示 [法术攻击（2 灵力）]（消耗数字读 MAGE_SPELL_MP_COST）；其他职业只显示普通攻击；mp<2 时法术 disabled +「灵力不足」而普通攻击仍 enabled；使用顺序=先 spendMageSpellMp() 成功才掷骰（false 不掷骰/不改敌人 HP/不反击/不改最后攻击结果）；命中/未命中/暴击/大失败均消耗 2 MP；法术未击杀敌人正常反击、击杀 victory 不反击（复用 resolvePlayerStrike 与既有反击流程）；普通与法术共用 CombatPage 内部最小局部 helper（未建 ActionSystem/TurnManager/CombatEngine）；日志区分「你的法术攻击：」/「你的攻击：」（lastPlayerAction 仅页面本地，不进入 GameState）
- 战斗结束后 MP 保留（不自动补满）；青石村休整自然恢复（restAtVillage 未修改）；战败闭环（HP0→返回冒险→回村休整）语义不变；未修改 PROFESSIONS/Enemy/Location/Item/Quest/NPC 定义，未给 ProfessionInfo 加 abilities[]/skills[]/spellList；未实现其他职业技能/技能树/冷却/经验升级/元素/魔法防御/法杖/新敌人地点任务 NPC
- GameState schema 不变、SAVE_VERSION 仍 1
- 6 个 combat 单测（法术攻击加值 MND8→+1/MND14→+4/MND16→+5；法术伤害 5/6/8/9；天然20 暴击 16；天然1 大失败 0；武器不进入法术公式；MAGE_SPELL_MP_COST===2）+ 8 个 Store 单测（正常 6→4/刚好 2→0/不足 1 false/非法职业 knight false/无 gameState/非法 MP -1 与越界 false/无额外副作用/不自动保存）+ 24 项 E2E（骑士无法术攻击/法师有法术攻击（2 灵力）且启用/连续施法逐次断言 MP 6→4→2→0 且魔化兔持续 8/8+法术禁用+灵力不足+普攻仍启用/MP0 普攻天然20 胜利且离开战斗页前灵力仍 0/6/休整恢复灵力 6/6/法术天然20 暴击 10 伤胜利+你的法术攻击/战斗后 MP4/6 保存 Continue 后仍 4/6）

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
