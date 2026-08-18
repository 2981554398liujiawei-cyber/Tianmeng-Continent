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

TM-P1-002（《村外异动》完成后村长信任 +1——NPC 关系第一次真实变化）：
- completeQuest('quest_village_monsters') 从 completable→completed 成功时，同一原子 Store 更新一并提交：quest.status=completed + gold+20 + rabbit_lair_unlocked=true + village_elder.relationship.trust+1（四项一起，未拆成两个 Store action）
- 懒创建 NpcState：无 village_elder state 时创建 {npcId:'village_elder', alive:true, locationId: getNpc('village_elder').locationId（读注册表，未复制 qingshi_village）, relationship:{trust:1, affection:0, respect:0, fear:0, resentment:0}}，不设置 romanceInterest；已有 state 时只 trust+1，alive/locationId/affection/respect/fear/resentment/romanceInterest（若历史存在）全部保持，不复活不移动
- 关系数值安全预检：已有 trust 为 finite 且 +1 仍 finite，否则整次 completeQuest false 且 GameState 完全不变（不把坏值修成 0，Infinity 拒绝）；gold 安全边界保持不变
- 专属结果：仅 quest_village_monsters 完成加给予者信任（其他任务/未来任务不自动加）；blacksmith/apothecary npcStates 不变；非 completable/重复完成/已 completed 旧状态 → false 不加信任（依赖任务状态机）；新游戏 npcStates 仍 {}（零回归）
- GamePage 村长对话面板额外显示「信任：N」（读 world.npcStates[activeNpc.id]?.relationship.trust ?? 0；未建立状态时 UI fallback 0，打开对话不创建状态；JSX 未写死 1）；铁匠/药师对话无关系 UI 扩张；未修改 greeting/NpcDefinition（未加 baseTrust/relationshipRewards）
- 未实现关系 Action（increaseNpcTrust/changeRelationship 等）/关系引擎（RelationshipEngine/Definition/DSL）/恋爱系统/对话树；GameState/NpcState/NpcRelationship schema 不变、SAVE_VERSION 仍 1；无新存档字段
- 11 个 Store 单测（初始 {} 零回归/正常完成懒创建全字段断言/已有关系 5→6 其余保持/保持 alive=false 与自定义 locationId/非 completable false/重复完成 false/已 completed 不追补/其他 NPC 不变/其他关系不变（romanceInterest 保持）/关系异常 Infinity false/不自动保存）+ 9 项 E2E（完成前信任：0/正式完成流程/金币 70 与兔王巢穴解锁零回归/完成后信任：1 且无好感尊敬恋爱/重复交谈仍 1/Continue 后仍 1/铁匠药师无关系 UI）

TM-P1-003（村长任务后一次性回应选择与关系分支——第一次玩家剧情选择）：
- 新增唯一事件 ID 常量 `VILLAGE_ELDER_POST_QUEST_EVENT_ID = 'village_elder_post_quest_response'`（Store 模块导出，GamePage 读取同一来源）；事件完成复用既有 world.completedEvents: string[] 记录（未新增 DialogueState/EventState/ChoiceHistory/relationshipEvents）
- Store 唯一新增入口 `respondToVillageElderAfterQuest(choice: 'reassure' | 'resolve')`（未实现 chooseDialogueOption/runDialogueChoice/increaseTrust/changeRelationship 等通用接口）：前置全部校验（gameState + quest_village_monsters.status==='completed' + village_elder 注册存在 + 当前地点===elder.locationId + npcStates.village_elder 已存在 + completedEvents 不含事件 ID）；缺 elder NpcState 不追补（P1-002 正常流程保证存在）
- 选择 A「村子平安就好。」（reassure）→ trust +1（正常主流程 1→2，respect 保持 0）；选择 B「我会继续追查这些异动。」（resolve）→ respect +1（trust 保持 1，respect 0→1）；两选择互斥——任一成功后 completedEvents 追加一次事件 ID（不重复），另一选项永远 false；非法 choice → false 不抛异常
- 关系数值安全：仅结算目标维度，trust（reassure）/respect（resolve）必须 finite 且 +1 仍 finite，否则整次 false 且 GameState 完全不变（不把坏值归零）
- 只改一个关系维度 + completedEvents；respect/affection/fear/resentment/romanceInterest（reassure 时）或 trust/affection/fear/resentment/romanceInterest（resolve 时）全保持；NpcState.npcId/alive/locationId 不变；其他 NPC state 不变；不发金币/物品/经验/HP·MP/任务/世界 Flag；不自动保存
- GamePage 村长对话「信任：N」扩展为「信任：N 尊敬：N」（仅 village_elder，铁匠/药师无关系 UI）；任务完成后且未回应时显示提示「村长看着你，神色比之前放松了一些。」+ 两个固定回应按钮；点击后关系即时更新且提示与按钮永久消失；重新交谈/Continue 后不可重选（读 completedEvents）
- 未实现 DialogueTree/DialogueNode/RelationshipEngine/ChoiceEngine/恋爱系统；GameState/NpcState/NpcRelationship schema 不变、SAVE_VERSION 仍 1
- 13 个 Store 单测（任务未完成拒绝/错误地点拒绝/缺 elder state 拒绝不补建/reassure 正常 trust1→2 respect0/resolve 正常 trust1 respect0→1/两选择互斥/非法 choice/trust Infinity false/respect Infinity false/其他关系保持/NpcState 与其他 NPC 保持/无额外副作用/不自动保存）+ 13 项 E2E（完成前 0/0 无选择/完成后 1/0+提示+两选项启用/resolve 后 1/1 按钮提示消失/重复交谈不可重选/Continue 后 1/1 不可重选/铁匠无关系 UI）

TM-P1-004（村长关系值驱动后续对话反应——NPC 对玩家选择产生可见反应）：
- 只读 UI 反应：gameStore.ts 零修改（respondToVillageElderAfterQuest 等 Store Action 原样），未新增 getDialogueReaction/resolveNpcDialogue 等任何 Store Action
- 前置计算（GamePage 组件内局部 elderReaction）：activeNpc.id==='village_elder' + completedEvents 含 VILLAGE_ELDER_POST_QUEST_EVENT_ID + npcStates.village_elder 存在；关系条件：respect 为 finite 且 >=1 → 尊敬反应「村长郑重地点了点头："若你还要继续追查，务必小心。"」优先；否则 trust 为 finite 且 >=2 → 信任反应「村长舒展了眉头："好，村里能安稳一些就好。"」；两者同时满足固定 respect 优先（不猜测历史 choice）
- 异常/旧状态 fallback：事件 ID 已存在但 NpcState 缺失 / trust·respect 非 finite / 两条件均不满足 → 不显示任何新增关系反应，回退原 activeNpc.greeting；不修复关系值、不补建 NpcState、不删除 completedEvent、不猜测玩家选择
- 与原 greeting 的关系：任务完成前或 P1-003 尚未回应 → 继续显示原 greeting + 一次性回应区（零回归）；P1-003 已回应且得到合法关系反应 → 后续关系反应替代原 greeting 正文位置（旧「村外的野兽越来越不安分……」不再同时显示）；点击 resolve/reassure 后当前仍打开的对话框即时切换文案（React 状态更新，无需关闭重开），回应按钮同时消失
- 关系数值继续显示 信任：N　尊敬：N（reassure→信任：2 尊敬：0；resolve→信任：1 尊敬：1），未隐藏关系反馈；铁匠/药师零关系 UI 与零反应扩张
- 未新增选择历史字段（choiceHistory/selectedChoice/dialogueBranch/lastDialogue/dialogueReaction/choiceType/relationshipBranch）、未新增事件 ID（..._reassure/..._resolve）、未新增持久状态；GameState/WorldState/NpcState/NpcRelationship/QuestState schema 不变、SAVE_VERSION 仍 1；未实现 DialogueTree/RelationshipEngine
- 无新增单测（Store 零修改，387 保持）；15 项 E2E（resolve 路径：未回应仍原 greeting→点击后立即切换尊敬反应文案+旧 greeting 消失+信任：1 尊敬：1+按钮消失→重新交谈保持→Save Continue 后仍保持；reassure 路径：点击后立即切换信任反应文案+信任：2 尊敬：0+按钮消失→重新交谈保持；铁匠无关系反应扩张；全部走正式 UI 未注入状态）
- TM-P1-004-R1（异常关系整体回退）：elderReaction 读取 trust/respect 后先整体校验——**任一维度非 finite → 直接 null**（不因另一维度合法而进入该维度文案、不修复非法值、不猜测分支）；随后才按确定性顺序 respect>=1（尊敬反应）优先、否则 trust>=2（信任反应）；正常路径零回归（trust1/respect1→尊敬文案、trust2/respect0→信任文案、trust2/respect1→尊敬优先、trust1/respect0→原 greeting）；仅 GamePage.tsx 修复，gameStore.ts 仍零修改、无新持久状态/事件 ID、GameState/NpcState schema 不变、SAVE_VERSION 仍 1

TM-P1-005（第二个正式任务《矿洞清理》——内容纵向扩展）：
- QUESTS 注册新增 quest_mine_cleanup（固定：title「矿洞清理」/summary「废弃矿洞里的魔化鼠让进出变得危险，铁匠希望你先把这处威胁清理掉。」/giverNpcId 'blacksmith'/goldReward 15）；QuestDefinition schema 未扩展（未加 prerequisiteQuestId/objectives[]/targetEnemyId/targetLocationId/rewards[]/nextQuest）
- 解锁条件（Store 窄前置 + UI 同口径）：仅 quest_village_monsters.status==='completed' 后可 discoverQuest('quest_mine_cleanup')，否则 false 且 GameState 完全不变；GamePage 附近委托区同步过滤——第一任务未完成时青石村不显示「铁匠似乎有事相托。」/「矿洞清理」；**不依赖 P1-003 回应**（不要求事件 ID/trust/respect）
- 生命周期严格复用状态机：discover→available→accept→in_progress；废弃矿洞（abandoned_mine）正式击败 corrupted_rat 且任务 in_progress → 经 applyQuestTransition 推进为 completable（未手写状态跳转）；未接受（不存在/available/completable/completed/failed）击败魔化鼠不推进任务但铁矿石掉落照常；completable 后重复胜利不重复推进
- 同一次 resolveCombatVictory() Store 更新形成最终 GameState：任务推进 + 铁矿石 +1（未拆 resolveCombatVictory→markQuestCompletable 两步）；战利品异常（iron_ore 数量非法/溢出）不阻断任务——胜利成立、任务推进、inventory 保持原样（P0-020 安全语义）
- 提交复用 completeQuest('quest_mine_cleanup') + 现有 generic goldReward 机制：基准金币 70→85（+15）；未新增 rewardMineQuest/giveMineGold/MINING_QUEST_REWARD
- 零副作用：完成不增加 blacksmith/村长任何关系（不为铁匠创建 NpcState）、不发额外物品（铁剑/矿石/药水）、不新增 world.flags/completedEvents、不解锁新地点/敌人；矿洞 D20 调查（investigateAbandonedMine/abandoned_mine_investigation）完全独立（不要求先调查/调查成功不直接完成/调查失败不锁死）；魔化鼠数据（HP6/DEF10/攻击+2/伤害2）、废弃矿洞地点连接、铁匠 greeting/summary/role 全部零修改
- 未新增地点/敌人/NPC/物品；未建任务 DSL/QuestEngine/新 QuestStatus/经验升级/铁匠关系系统/新对话树；GameState schema 不变、SAVE_VERSION 仍 1
- 12 个 Store 单测（A 注册内容固定/B 前置未完成拒绝发现且全不变/C 第一任务完成后可发现 available/D 正常接受 in_progress/E 正式魔化鼠胜利 completable+铁矿石+1 同次更新/F available 时不推进但铁矿石+1/G completable 重复胜利不重复推进矿石继续+1/H 战利品异常任务仍推进 inventory 不变/I 提交后 completed gold 70→85/J 无额外副作用（flags/completedEvents/npcStates/hp/mp/inventory/equipment 保持、blacksmith NpcState 不创建）/K 重复完成 false 仍 85/L 不自动保存）+ 14 项 E2E（A 新游戏无入口+村外异动保持/B 第一任务完成后铁匠委托出现+金币 70/C 矿洞清理可接受（发布者铁匠）+进行中/D 废弃矿洞魔化鼠迎战/E 同次胜利铁矿石×1+可完成/F 提交后已完成金币 85/G 铁匠无关系 UI+村长关系保持 1/0/H Continue 后任务/金币/铁矿石保持）

TM-P1-006（骑士职业技能「骑士重击」——职业差异继续落地）：
- combat.ts 新增唯一业务常量 `KNIGHT_POWER_STRIKE_MP_COST = 2`（CombatPage 与 Store 都读取它，JSX/E2E 未维护第二常量）与纯函数 `getKnightPowerStrikeDamage(str, weaponDamageBonus?) = getPlayerAttackDamage(str, weaponDamageBonus) + 2`（复用封板公式，未复制普通攻击伤害算法）；weaponDamageBonus 非法（-1/NaN/小数）沿用 RangeError，最终结果非有限正整数抛 RangeError
- 骑士重击命中公式完全等同普通攻击：getPlayerAttackBonus(str, level)（未新增 getKnightAttackBonus/额外命中）；攻击 enemy.defense；复用 performAttack/resolveAttack/AttackResult（未新增 resolveKnightAttack/rollKnightAttack/PowerStrikeResult）；天然20 暴击×2（STR14+铁剑 10→20 伤）/天然1 大失败 0；**吃 weaponDamageBonus**（与法师法术攻击不吃武器不同：STR14 无武器普攻 6/重击 8，铁剑+2 普攻 8/重击 10）
- Store 唯一新增灵力消费入口 `spendKnightPowerStrikeMp()`（未新增 spendMp/consumeCombatResource/useSkill/castAbility 通用接口）：成功条件 gameState + profession==='knight' + maxMp 非负安全整数 + mp 非负安全整数且 <=maxMp + mp>=2；成功 mp-=2（6→4/2→0，只改 player.mp）；不足（mp1）/非法职业（mage/warrior/ranger）/无 gameState/非法 MP（-1/越界）→ false 且 GameState 完全不变；不自动保存
- CombatPage：仅 knight 显示 [骑士重击（2 灵力）]（消耗读 KNIGHT_POWER_STRIKE_MP_COST）；mage 只显示法术攻击（不显示骑士重击）、warrior/ranger 不显示（Store 单测锁定非法职业）；mp<2 时骑士重击 disabled +「灵力不足」而普通攻击仍 enabled（phase active 时）；使用顺序先 spendKnightPowerStrikeMp() 成功才掷骰（false 不掷骰/不改敌人 HP/不反击/不改最后攻击结果）；命中/未命中/天然20/天然1 均耗 2 MP；未击杀正常反击、击杀 victory 不反击（复用 resolvePlayerStrike）；普通/法术/重击共用 applyPlayerAttack 最小局部 helper（未新增 SkillExecutor/CombatAction/AbilitySystem/TurnManager）；lastPlayerAction 扩展 'knight_power_strike'（仅页面本地）；日志「你的骑士重击：」
- 战斗后 MP 保留（不自动恢复）；青石村休整复用 restAtVillage 恢复；MP 随现有 Character 手动存档自然持久化（无新增存档字段）；未修改 ProfessionInfo（无 skills[]/abilities[]/combatActions[]）、未改职业名称/描述；未实现战士/游侠技能/技能树/体力怒气能量/冷却/技能点/盾牌/嘲讽/Buff；GameState schema 不变、SAVE_VERSION 仍 1
- 7 个 combat 单测（无武器 STR14→8/铁剑+2→10/固定比普攻高 2（多 STR）/天然20 10→20 伤/天然1 0/武器参数安全 RangeError/KNIGHT_POWER_STRIKE_MP_COST===2）+ 11 个 Store 单测（knight 6→4/2→0/1 不足 false/mage·warrior·ranger false 全不变/无 gameState false/mp=-1 false/mp>maxMp false/成功只改 mp 其余全不变/不自动保存）+ 26 项 E2E（A 默认骑士显示骑士重击（2 灵力）启用且无法术攻击/B 连续三次重击逐次 6→4→2→0 且魔化兔持续 8/8+**玩家 HP 三次锁定不变（readHps）**+禁用+灵力不足+普攻仍启用/C MP0 普攻天然20 胜利离开前仍 0/6/D 休整恢复 6/6/E 重击天然20 你的骑士重击+暴击造成 16 点伤害+战斗胜利+**致死后玩家 HP 未下降且无「魔化兔的攻击：」（敌人未行动）**/F 战斗后 4/6 保存 Continue 仍 4/6/G 法师只有法术攻击无骑士重击）
- TM-P1-006-R1（补齐骑士战斗防回归证据）：B 段每回合天然1后用 readHps 明确断言玩家 HP 不变（三次 X→X→X→X，敌人三次天然1 均未造成伤害，不只靠 Math.random=0 推断）；E 段天然20 致死后断言玩家 HP===beforeStrikePlayerHp 且 body 不含「魔化兔的攻击：」（锁定 enemyShouldCounter=false 敌人不行动）；仅 qa/e2e.mjs 修改（正式玩法代码零修改），MP 逐次 6→4→2→0、魔化兔 8/8、重击 disabled、灵力不足、普攻 enabled 等原断言全保留

TM-P1-007（游侠职业技能「迅捷突袭」——职业差异继续落地，机制与法师/骑士不同）：
- combat.ts 新增纯函数 `getRangerSwiftStrikeAttackBonus(agi, level)` = AGI 属性修正 + 熟练加值 + 2（复用 getAttributeModifier/getProficiencyBonus，未复制 D20 公式；Lv1 AGI8→+3/AGI10→+4/AGI14→+6/AGI16→+7）与 `getRangerSwiftStrikeDamage(agi, weaponDamageBonus?)` = getPlayerAttackDamage(agi, weaponDamageBonus) + 2（刻意把 AGI 作为攻击属性传给封板物理伤害公式，普通攻击用 STR；未新增通用「任意属性攻击」系统）；weaponDamageBonus 非法（-1/NaN/1.5/Infinity）沿用 RangeError，结果非有限抛 RangeError
- **不消费 MP**：未新增 RANGER_SWIFT_STRIKE_MP_COST/spendRangerMp 等，也不调用现有 mage/knight MP Action；点击前后 player.mp 完全不变
- **每场战斗一次**：CombatPage 局部 `rangerSwiftStrikeUsed` useState(false)（等价 boolean，不抽象次数系统；未新增 abilityCharges/combatCharges/usesPerCombat/SkillUsageState/CooldownState）；不进入 GameState/WorldState/Character/localStorage/completedEvents/flags；新 CombatPage 实例天然 false（下一场/战败后再战自动重置，无 reset Store Action）
- 攻击复用现有体系：performAttack(getRangerSwiftStrikeAttackBonus(agi, level), enemy.defense, getRangerSwiftStrikeDamage(agi, weaponDamageBonus)) → resolveAttack/AttackResult（未新增 RangerAttackResult/SwiftStrikeResult/resolveRangerAttack/rollRangerAttack）；天然20 暴击×2（AGI10 base6→12 伤，足以击败魔化兔 HP8）/天然1 大失败 0；铁剑 weaponDamageBonus 正常参与
- 使用次数消费时机：点击迅捷突袭且满足 profession==='ranger' + phase==='active' + rangerSwiftStrikeUsed===false → **先**将本场使用状态置 true 再执行攻击（命中/未命中/天然20/天然1 都消耗本场次数，不只有命中才消耗）；使用后按钮保持可见但 disabled +「本场战斗已使用」，即使天然1 敌人存活也不得再次使用，普通攻击继续 available
- CombatPage 隔离：仅 ranger 显示「迅捷突袭」（无灵力消耗文案）；knight 只显示骑士重击（2 灵力）、mage 只显示法术攻击（2 灵力），均不显示迅捷突袭；warrior 只有普通攻击；游侠 MP0 也不影响迅捷突袭使用资格、不显示「灵力不足」；lastPlayerAction 扩展 'ranger_swift_strike'（仅页面本地）；日志「你的迅捷突袭：」；继续共用 applyPlayerAttack/resolvePlayerStrike（未复制敌人扣血/victory/反击/defeat 判定）；未击杀正常反击、击杀不反击
- **gameStore.ts 零修改**（未新增任何 ranger Store Action——与法师/骑士的机制区别）；ProfessionInfo 零修改（无 skills[]/abilities[]/combatActions[]，游侠描述「行走于荒野的猎手，眼明手快，熟悉草木。」未动）；GameState schema 不变、SAVE_VERSION 仍 1
- 7 个 combat 单测（A AGI 加值 Lv1 四个值/B 无武器伤害 6/8/C 铁剑+2 8/D 证明使用 AGI（函数只接受 agi、接口无 STR 参数）/E 天然20 12 伤/F 天然1 0/G weapon -1/NaN/1.5/Infinity RangeError）+ 22 项 E2E（A 游侠显示迅捷突袭启用且无法术攻击/骑士重击/B 天然1 后你的迅捷突袭+大失败+魔化兔 8/8+玩家 HP 不变+MP 仍 6/6+迅捷突袭禁用+本场战斗已使用+普攻仍启用/C 迅捷突袭保持禁用（disabled 状态锁定）/D 普攻天然20 胜利且 MP 仍未变/E 第二场迅捷突袭重新启用且无残留（局部 boolean 随新 CombatPage 重置）/F 天然20 暴击造成 12 点伤害+战斗胜利+致死后玩家 HP 未下降+无魔化兔的攻击+MP 仍 6/6/R1 段末 Math.random 已恢复真实实现（确定性断言）；另在 P1-001-B 法师段与 P1-006-A 骑士段补充「不显示迅捷突袭」隔离断言）
- TM-P1-007-R1（迅捷突袭 E2E 随机数隔离）：P1-007 段首只保存一次真实 Math.random 到 window.__p1007OriginalRandom（不再用已 mock 的函数覆盖 original）；B 天然1 用 () => 0.0、D/F 天然20 直接切换 () => 0.99（均不覆盖已保存的真实函数）；段末恢复 `Math.random = window.__p1007OriginalRandom` 后确定性断言 `Math.random === 段首保存的真实函数引用` 再 delete（不靠「之后某次骰点不是1」概率验证）；仅 qa/e2e.mjs 修改（正式玩法代码零修改），天然1/普攻天然20/第二场重置/迅捷突袭天然20 12伤无反击等原验收断言全保留

TM-P1-008（战士职业技能「压制猛击」——四职业首个能力闭环，机制与法师/骑士/游侠都不同）：
- combat.ts 新增唯一业务常量 `WARRIOR_SUPPRESS_STRIKE_MP_COST = 2`（CombatPage 与 Store 都读取它，无第二处业务 2）；**未新增任何战士伤害/命中函数**——攻击公式完全等同普通攻击：getPlayerAttackBonus(str, level) + getPlayerAttackDamage(str, weaponDamageBonus)（无 +伤害/无 +命中/无 AGI/MND 替代；STR14 无武器 6、铁剑+2 8）；复用 performAttack/AttackResult/resolveAttack/resolvePlayerStrike（未新增 WarriorAttackResult/SuppressStrikeResult/resolveWarriorAttack/CombatEffect）；天然20 暴击×2（致死走原 victory 不反击）、天然1 大失败 0 且 MP 仍消费
- **核心机制（CombatPage 最小局部流程，resolvePlayerStrike 零修改）**：applyPlayerAttack 在 `strike.enemyShouldCounter === true && action === 'warrior_suppress_strike' && attack.hit === true` 时直接结束本次行动（不执行敌人 performAttack）——命中且敌人未死 → 压制本次反击，phase 仍 active，玩家可继续行动；未命中（miss/天然1）→ 敌人正常反击（玩家 HP 下降）；天然20 击杀 → 原 victory 不反击；普通攻击/其他职业技能反击规则完全不变（压制只属于压制猛击行动，不全局屏蔽）
- Store 唯一新增入口 `spendWarriorSuppressStrikeMp()`（禁止 spendMp/useAbility/useCombatSkill/consumeResource 通用接口）：成功条件 gameState + profession==='warrior' + maxMp 非负安全整数 + mp 非负安全整数且 <=maxMp + mp>=2；成功 mp-=2（6→4/2→0，只改 player.mp）；不足 mp1 / 非法职业 knight·mage·ranger / 无 gameState / 非法 MP（-1/越界）→ false 且 GameState 完全不变；不自动保存
- CombatPage：仅 warrior 显示「压制猛击（2 灵力）」；knight 只显示骑士重击、mage 只显示法术攻击、ranger 只显示迅捷突袭，均不显示压制猛击；mp<2 时压制猛击 disabled +「灵力不足」而普通攻击仍 enabled（phase active 时）；行动顺序先 spendWarriorSuppressStrikeMp() true 才掷骰（false 不掷骰/不改敌人 HP/不触发敌人行动/不改最近攻击记录）；命中/未命中/天然20/天然1 均消费 2 MP；**无本场次数限制**（只要 MP 足够可再次使用——与游侠迅捷突袭的区别，无 warriorSuppressUsed/cooldown/charges）；lastPlayerAction 扩展 'warrior_suppress_strike'（仅页面本地）；日志「你的压制猛击：」；继续共用 applyPlayerAttack（未新增 CounterPolicy/CombatEffectResolver/AttackOption/ActionDefinition）
- 无持续控制：压制只作用于当前这一击之后原本会发生的立即反击，不产生眩晕/沉默/压制状态/下一回合不能行动/enemy debuff/statusEffects；战斗后 MP 保留（不自动恢复）；青石村休整复用 restAtVillage 恢复（HP 满+MP 2→6/6）；Save+Continue 保留剩余 MP（4/6）；GameState schema 不变、SAVE_VERSION 仍 1
- 1 个 combat 单测（WARRIOR_SUPPRESS_STRIKE_MP_COST===2 + 复用 getPlayerAttackDamage 14→6/铁剑 8）+ 11 个 Store 单测（warrior 6→4/2→0/1 不足 false/knight·mage·ranger false 全不变/无 gameState false/mp=-1 false/mp>maxMp false/成功只改 mp 其余全不变/不自动保存）+ 26 项 E2E（A 战士显示压制猛击（2 灵力）启用且无法术攻击/骑士重击/迅捷突袭/B D20 7+4=11 命中 6 伤：MP 6→4+魔化兔 8→2+玩家 HP 不变+无魔化兔的攻击+phase active+压制猛击仍启用（无次数限制）/C 天然1+敌天然20：MP 4→2+魔化兔仍 2/8+大失败+出现魔化兔的攻击+玩家 HP 明确下降（未命中不压制）/D 普攻天然20 胜利且 MP 仍 2/6/E 休整后 HP 满+MP 6/6/F 压制猛击天然20 暴击胜利+战斗后 4/6+保存 Continue 仍 4/6/R1 段末 Math.random 已恢复真实实现；另在 P1-001-B 法师、P1-006-A 骑士、P1-007-A 游侠段补充「不显示压制猛击」隔离断言）

TM-P1-010（第三个正式任务《草原狼影》——复用既有 corrupted_wolf，青石村内容扩展）：
- quests.ts 新增 `quest_grassland_wolf`（标题「草原狼影」/ 发布者 village_elder / goldReward 25 / summary 提及魔化狼）；QuestDefinition 未扩展
- 唯一解锁条件：仅 `quest_mine_cleanup.status === 'completed'` 才允许 discoverQuest('quest_grassland_wolf')（Store discoverQuest 窄前置 + GamePage localQuests 双守；未建通用 prerequisite 系统）；不依赖村长 trust/respect/VILLAGE_ELDER_POST_QUEST_EVENT_ID/reassure/resolve（玩家是否完成 P1-003 回应不影响第三任务）
- locations.ts：village_grassland.enemyIds 追加 'corrupted_wolf'（保持 ['corrupted_rabbit', 'corrupted_wolf'] 顺序，不替换魔化兔）；corrupted_wolf 数据零修改（Lv.2 / HP12 / DEF12 / attack+3 / damage3）
- **魔化狼受任务状态控制**（undiscovered/available→隐藏；in_progress→显示；completable/completed/failed→隐藏）：GamePage 附近威胁按 quest_grassland_wolf.status!=='in_progress' 过滤；App handleEngage('corrupted_wolf') 再窄校验 status==='in_progress' 否则拒绝进入 CombatPage（不只靠 UI 隐藏；未建通用 EncounterCondition/EnemySpawnRule 系统）；魔化兔继续一直按原规则存在
- resolveCombatVictory：仅 enemyId==='corrupted_wolf' && location==='village_grassland' 时经 applyQuestTransition 推进 quest_grassland_wolf → completable（复用状态机，不手写 quest status）；**无战利品**（不奖励铁矿石/药水/装备/rabbit_path/金币/新物品，金币只在回村提交时获得）；available/completable 状态胜利均不推进（状态机天然守住）
- completeQuest('quest_grassland_wolf')：generic goldReward +25（新游戏 50→村外异动 70→矿洞清理 85→草原狼影 110）；**无关系副作用**（completeQuest 的村长 trust+1 奖励继续只属于 quest_village_monsters，第三任务完成前后村长关系完全一致）；无 world.flags/completedEvents/新地点解锁副作用
- 12 个 Store 单测（A 注册身份固定/B 前置未完成拒绝发现且全不变/C 矿洞完成后可发现 available/D 正常接受 in_progress/E 草原 in_progress 狼胜利 completable/F 狼胜利无战利品/事件/关系/地点副作用/G available 状态胜利不推进/H completable 重复胜利不重复推进/I completable+85 → completed+110/J 重复提交 false 仍 110/K 村长关系前后完全一致（信任1/尊敬0）/L 不自动保存）+ 18 项 E2E（A 新游戏无草原狼影+草原只有魔化兔无魔化狼/B 完成村外异动后仍无草原狼影/C 完成矿洞清理后金币 85+草原狼影可接受（发布者村长）/D 接受后进行中+草原魔化兔仍存在且魔化狼出现/E engageEnemy('魔化狼') 精准定位（多敌人卡片）：战斗页魔化狼 Lv.2 HP 12/12 防御 12+天然20 暴击 12 伤一次击杀胜利/F 胜利后可完成+附近威胁区魔化狼消失且魔化兔仍存在（任务生命周期控制，非永久刷怪）/G 提交后已完成+金币 110+村长关系信任1/尊敬0 不变/H Save+Continue 保持已完成+110+草原不显示魔化狼/R1 段末 Math.random 已恢复真实实现）

TM-P1-011（第一次里程碑升级 Lv.2——完成《草原狼影》时同一次原子更新成长）：
- character.ts 新增唯一业务常量 `LEVEL_2_MAX_HP_GAIN = 2`、`LEVEL_2_MAX_MP_GAIN = 1`（未建等级表/LevelDefinition/ProgressionTable/ExperienceSystem/LevelUpEngine/gainExperience/levelUp）
- completeQuest('quest_grassland_wolf') 成功时**同一次 Zustand update** 产生：quest → completed + gold +25 + level 1→2 + maxHp +2 + maxMp +1（默认骑士 22/22→22/24、6/6→6/7、85→110）；**当前 HP/MP 不恢复**（受伤不治疗：10/22→10/24；HP0 不复活：0/22→0/24；升级≠休整）
- 安全预检在 changed=true 之前（仅本任务）：player.level===1 且 hp/maxHp/mp/maxMp 均非负安全整数、hp<=maxHp、mp<=maxMp、maxHp+2/maxMp+1 仍安全整数；任一失败 → completeQuest false 且 GameState 完全不变（金币不加、任务保持 completable）；非 Lv.1（如 level=2）拒绝（当前版本无其他升级来源，不猜测 Lv2+/Lv0 处理）
- 只属于《草原狼影》：前两任务（村外异动/矿洞清理）不触发升级，原奖励全部保持；不改变 STR/CON/AGI/MND/LCK；不解锁第二职业技能（四职业仍只有当前封板能力）；D20 规则零修改（getProficiencyBonus 自然处理，Lv1/Lv2 均熟练+2，预期）
- 休整联动：升级后青石村 restAtVillage()（零修改）自然得到 HP 24/24、MP 7/7；Save/Continue 不新增存档字段（Character 已持久化 level/hp/maxHp/mp/maxMp），休整前保存再 Continue 保持 Lv.2、22/24、6/7；SAVE_VERSION 仍 1
- 无其他奖励：不产生物品/装备/属性点/技能点/关系值/flag/completedEvent/地点解锁；GameState/Character schema 零修改；GamePage/CombatPage/storage/types/content 零修改
- 1 个 rules 单测（常量 2/1）+ 8 个 Store 单测（B 正常完成 Lv1→Lv2+22/24+6/7+110 原子更新/C 受伤不治疗 10/24+2/7/D HP0 不复活 0/24/E 非 Lv1 拒绝且任务/金币/等级/HP/MP 全不变/F hp>maxHp 与 maxHp=MAX_SAFE_INTEGER 溢出均拒绝全不变/G 无副作用 attributes/profession/inventory/equipment/flags/completedEvents/npcStates 全不变/H 重复提交 false 仍 Lv2/110 上限不再增长/I 不自动保存）+ 8 项 E2E（J 提交瞬间升级 Lv.2+生命 22/24+灵力 6/7（狼天然20 一次击杀未受伤）/L Continue 保持 Lv.2+22/24+6/7/M 休整后 24/24+7/7；K 关系不变沿用 P1-010-G 断言）

TM-P1-012（Lv.2 里程碑升级提示——成长体验闭环，纯 UI 反馈）：
- GamePage 新增本地状态 `showLevelUpNotice` useState(false) + 最小提交 handler `handleCompleteQuest(questId)`：completeQuest 返回 true 且 questId==='quest_grassland_wolf' 时 setShowLevelUpNotice(true)（提示来自「本次第三任务提交成功」这一 UI 事件，**不按 player.level===2 自动判断**——Continue 一个 Lv.2 存档不会错误重复弹提示；未建 RewardNotificationSystem/ToastManager/EventBus/LevelUpEvent）
- 提示 panel（角色信息区之后的高亮金边 panel，不覆盖整页）：标题「等级提升！」+ 正文「你已达到 Lv.2。最大生命 +2，最大灵力 +1。」+ [知道了] 按钮；+2/+1 **读取 LEVEL_2_MAX_HP_GAIN/LEVEL_2_MAX_MP_GAIN 封板常量**（GamePage 未维护第二份业务常量）；点击「知道了」→ setShowLevelUpNotice(false) 提示立即消失且不改任何 GameState；**不自动计时消失**（无 setTimeout，E2E 确定性）
- 提示不持久化：不写入 GameState/world.flags/completedEvents/QuestState.flags/localStorage/NpcState；不新增 Store action；完成任务后未点击提示就返回主菜单 → Continue 后新 GamePage 也不显示（local state 生命周期 + Save/Continue 主流程锁定）
- 触发条件唯一：仅《草原狼影》completeQuest===true 显示；《村外异动》/《矿洞清理》完成、第三任务 false/重复提交/非法状态失败/读取已 Lv.2 存档均不显示
- **gameStore.ts 零修改**（P1-011 安全预检与升级原子性原样保持）；rules 全部零修改（character/combat/d20/quest/exploration 未动，LEVEL_2_MAX_HP_GAIN=2/LEVEL_2_MAX_MP_GAIN=1 不变）；schema 零修改（Character/GameState/WorldState/QuestState/NpcState/SaveFile/SAVE_VERSION=1 全不变）；git diff 仅 GamePage.tsx + qa/e2e.mjs + README
- 11 项 E2E（A 第三任务提交前不显示升级提示/B 提交成功立即显示等级提升！+你已达到 Lv.2。+最大生命 +2，最大灵力 +1。+知道了（与原有已完成/110/Lv.2/22/24/6/7 同帧确认）/C 点击知道了后提示消失且角色仍 Lv.2/22/24/6/7/110/D Continue 不重复显示升级提示与知道了/E 《村外异动》《矿洞清理》完成均不显示升级提示）
- TM-P1-012-R1（补齐关闭升级提示后的角色状态断言）：C 段点击「知道了」后除「提示消失」外，用正则逐项明确断言 Lv.2、生命 22/24、灵力 6/7、金币 110（不再用 `body.includes('Lv.2') && body.includes('110')` 弱断言）——锁定「关闭提示本身无 GameState 副作用」；仅 qa/e2e.mjs 修改（正式玩法代码零修改），提交前无提示/提交成功显示/Continue 不重复/前两任务不提示等原断言全保留

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
