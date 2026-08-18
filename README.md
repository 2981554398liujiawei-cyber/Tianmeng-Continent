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

TM-P1-013（《兔子的路径》正式查看与后续线索占位——Boss 战利品交互闭环）：
- Store 新增唯一正式 action `inspectRabbitPath(): boolean`（GamePage 不直接调用通用 setFlag 写查看状态）：成功条件 = gameState 存在 + 背包有 rabbit_path entry + quantity 安全整数且 >=1 + world.flags.rabbit_path_examined 为 undefined 或 false → true 且**只设置 world.flags.rabbit_path_examined=true**（player/inventory/equipment/quests/currentLocationId/completedEvents/npcStates 全不变；不消耗地图仍 ×1；不自动保存）
- 拒绝路径（false 且 GameState 完全不变）：无 gameState / 无 rabbit_path / quantity 0、-1、1.5、NaN、Infinity / 已查看（flag===true）重复调用 / flag 已存在但非 boolean（如 "yes"、1，不静默覆盖异常存档状态）
- 物品定义零修改（rabbit_path 名称/description/value/ItemDefinition 未动）；未建通用 inspectItem()/QuestItemDefinition/ItemInteractionDefinition/UseItemEngine/ClueEngine/MapEngine/EventBus
- GamePage「新的线索」区扩展（仅真实持有 rabbit_path 时显示，原条件保持）：未查看 → 新增 [展开地图] 按钮（**不提前显示**具体地点占位），点击调用 inspectRabbitPath()，Store 为唯一真实状态来源（无额外 UI local flag）；已查看（flags.rabbit_path_examined===true 且背包仍有地图）→ 固定文案「地图上的路线最终指向黄金兔子王所在之地。具体地点：【待补充】」+ **「展开地图」按钮消失**（非 disabled 残留）
- **【待补充】为占位**：不新增地点/连接/移动入口（无「前往【待补充】」/「进入黄金兔王区域」）；不做 D20/MND/LCK 检定、不设 DC、无随机失败（物品定义已是路线藏宝图）
- GameState/WorldState schema 零修改（flags 已是 Record<string, boolean|number|string>）；SAVE_VERSION=1；items/locations/enemies/quests/types/storage/combat/character/App.tsx 零修改；git diff 仅 gameStore.ts + gameStore.test.ts + GamePage.tsx + qa/e2e.mjs + README
- 12 个 Store 单测（A 无 gameState false/B 无 rabbit_path false 全不变/C quantity=0 false/D quantity=-1 false/E quantity=1.5 false/F 合法 ×1+flag 不存在 → true+examined=true/G 成功后仍 ×1/H 成功只改 flags.rabbit_path_examined 其余全不变/I flag=false → true 成功/J flag=true 重复 false 全不变/K flag 为字符串/数字 false 全不变/L 不自动保存）+ 11 项 E2E（A Boss 战前无展开地图且无具体地点占位/B 获得地图后展开地图 enabled 且未查看前不显示【待补充】/C 点击展开地图后显示固定文案+【待补充】+按钮消失+兔子的路径仍 ×1/D 查看前后等级/生命/灵力/金币/位置全不变/E Save/Continue 后已查看文案保持+无展开地图按钮）
- TM-P1-013-R1（补齐异常 quantity 与当前位置 QA 证据）：非法 quantity 单测不再用 addItem（其入参拦截使 0/-1/1.5 根本进不了 inventory，属假覆盖）——改为 useGameStore.setState 直接构造真实 inventory 异常运行态，it.each 覆盖 quantity=0/-1/1.5/NaN/Infinity 五项，每项断言 inspectRabbitPath()===false 且 gameState **同一引用**不变（不依赖 JSON.stringify，避免 NaN/Infinity 转换失真）、examined 未写成 true、异常值原样存在；E2E「位置不变」不再用 body.includes('兔王巢穴') 模糊文本——新增从「当前位置」区域确定性读取 location.id（rabbit_lair），断言查看前 ==='rabbit_lair'、查看后与查看前完全相等；仅 gameStore.test.ts + qa/e2e.mjs 修改（正式玩法代码零修改）

TM-P1-014（嘟嘟兔一次性 Boss 清场——Boss 生命周期闭环）：
- **清场证据复用既有唯一战利品**：`gameState.inventory.some(e => e.itemId === 'rabbit_path')`（不新增 dudu_rabbit_defeated flag/completedEvent/BossState/DefeatedEnemies；未建通用 Boss 生命周期系统）
- Store 最终防线：resolveCombatVictory 在置 ok=true 之前检查——enemyId==='dudu_rabbit' 且 location.id==='rabbit_lair' 且背包已有 rabbit_path → **false 且 GameState 完全不变**（重复/伪造胜利拒绝；旧行为「第二次胜利 true」已改）；首次胜利行为完全保留（true + rabbit_path ×1，嘟嘟兔数据/地图定义/战斗数值零修改）
- App 正式入口双守：handleEngage 对 enemyId==='dudu_rabbit' 且背包已有 rabbit_path → return（即使 UI 出错也不进 CombatPage）
- GamePage：先计算「实际可见」敌人列表（魔化狼仅《草原狼影》in_progress 可见的 P1-010 门控 + 嘟嘟兔持图清场不可见），**可见敌人为空时整个「附近威胁」section 不渲染**（兔王巢穴只配嘟嘟兔 + 清场后无空面板；不再用 map 回调 return null 留空区）；魔化兔永久正常；rabbit_lair 地点不锁（仍可进入/返回巢穴查看地图线索）
- 《兔子的路径》查看流程零回归：清场后巢穴仍显示 新的线索/兔子的路径 ×1/已查看文案【待补充】；无新 flag/event/schema；SAVE_VERSION=1；types/storage/items/enemies/locations/quests/combat/character 零修改；git diff 仅 gameStore.ts + gameStore.test.ts + GamePage.tsx + App.tsx + qa/e2e.mjs + README
- Store 单测（P0-012 describe 语义更新，仍 6 组）：A 首次 true + rabbit_path ×1/B 第二次 resolveCombatVictory false 且 GameState 同一引用不变、仍只 ×1（正式流程先真胜一次再验拒绝）/C 预先已有地图伪造胜利 false 全不变/D 错误地点 false 全不变/E 首次 Boss 无额外副作用（player/equipment/quests/world 全不变）/F 不自动保存 + 10 项 E2E（B 清场后当前地点仍 rabbit_lair+整个附近威胁 section 不存在（精确检查威胁区，非 !body.includes('嘟嘟兔')）/C 离开再返回巢穴威胁区仍不存在+兔子的路径仍 ×1+新的线索仍显示+地图查看状态保持（无展开地图）/D Save/Continue 后重进巢穴嘟嘟兔仍不出现+威胁区 section 仍不存在+查看状态保持+地图仍 ×1）

TM-P1-015（战斗中使用治疗药水——战斗资源闭环）：
- CombatPage 直接复用现有 `useHealingPotion(): boolean`（未新增 useCombatPotion/consumeCombatItem/healInCombat/CombatInventoryAction；gameStore.ts 零修改，Store 仍是药水数量与 HP 的唯一 hard-state 权威）
- 治疗药水是一次完整玩家行动：点击 → Store 成功（true）才继续本次行动；false 时不掷敌人骰、不触发反击、不改敌 HP/日志/phase
- 药水按钮所有职业通用（warrior/knight/ranger/mage 均显示，非职业技能、无 profession 条件）；按钮文本「使用治疗药水（+8 生命）」的 8 读取 `getItem('healing_potion')?.healAmount` 注册表（CombatPage 未写业务常量 8）；库存数量直接读 Store（无本地副本），显示「剩余：N」
- 满血禁用 + 「生命已满」（count>0 且满血）；无药水禁用 + 「没有治疗药水」（耗尽优先显示，无论是否满血）；普通攻击/职业技能不受影响
- 喝药成功：恢复（受上限截断，实际恢复量写入日志「你使用了治疗药水：恢复 X 点生命。」——X 为实际值，20/22 时显示恢复 2 而非 8）、药水 -1、MP 完全不变（6/6）、敌 HP 完全不变（8/8）、lastPlayerAttack/lastPlayerAction 清空（不把上一轮攻击误显示成本轮）
- 喝药后敌人立即一次正常 D20 反击（applyEnemyCounter 最小局部 helper：performAttack(enemy.attackBonus, playerDefense, enemy.damage) + setLastEnemyAttack + damagePlayer + getCombatPhaseAfterEnemyAttack）：可命中/未命中/暴击/大失败、可导致 defeat（喝药无免死保护）；普通攻击/职业技能/喝药共用同一反击路径
- 攻击后清除药水日志（applyPlayerAttack 内 setLastPotionHeal(null)，日志反映最近一次行动）；战士压制猛击命中不反击逻辑未回归（先于通用反击 helper 处理）；致死攻击不反击保持；未建 TurnManager/CombatAction/ActionQueue/BattleCommand/CombatEngine/EffectResolver/ItemActionDefinition
- schema 不变、SAVE_VERSION=1；gameStore.ts/items.ts/combat.ts/types/storage/App.tsx/GamePage.tsx/content 零修改；git diff 仅 CombatPage.tsx + qa/e2e.mjs + README
- 21 项 E2E（独立最小段，P1-007-R1 随机隔离：A 满血药水禁用+生命已满+普攻可用/B 两轮 [玩家1,敌20] 受伤 22→14+魔化兔 8/8 未伤+药水可用/C 第一瓶恢复 8（14→22）+敌普通命中反击→20/22+药水 2→1+日志「恢复 8 点生命」+「魔化兔的攻击：」/D 无你的攻击/骑士重击日志（喝药非攻击）+敌 HP 不变/E 第二瓶上限截断实际恢复 2（20→22）+敌天然1 大失败+药水 1→0+日志「恢复 2 点生命」/F 没有治疗药水+按钮禁用+普攻仍可用+灵力 6/6+敌 8/8/G 后续普攻天然20 暴击正常胜利/R1 段末 Math.random 恢复真实实现）

TM-P1-016（青石村阶段收束——向村长汇报《兔子的路径》——第一段剧情收束）：
- 新增唯一剧情状态 `world.flags.rabbit_path_reported`（唯一合法值 true；不新增 schema/completedEvent/新地点/新敌人/新NPC/新物品/新任务/章节系统；SAVE_VERSION=1）
- 新增唯一 Store Action `reportRabbitPathToVillageElder(): boolean`（正式剧情推进唯一入口，禁止 GamePage 直接 setFlag）——成功需全部满足：gameState 存在 + 当前位置 qingshi_village + 背包真实持有 rabbit_path（quantity 安全整数 >=1）+ world.flags.rabbit_path_examined === true + quest_grassland_wolf.status === completed + rabbit_path_reported 为 undefined/false；成功只写 world.flags.rabbit_path_reported=true
- 非法状态全部拒绝（false 且 GameState 完全不变）：不在青石村/无地图/quantity 0/-1/1.5/NaN/Infinity（直接构造真实运行态，非 addItem 假覆盖）/未展开地图/狼任务非 completed/已汇报 true/非 boolean 旧 flag（"yes"/1 不静默覆盖）
- 地图不消耗（展示/汇报非交出，兔子的路径仍 ×1）；无任何奖励（金币/等级/HP/MP/关系全 +0）；村长 trust/respect 完全不变（P1-002/003/004 关系逻辑零改动）；不自动保存；flag=false 视为未汇报可成功改 true
- 正式顺序保持：村外异动 → 矿洞清理 → 草原狼影 → Lv.2 → 嘟嘟兔 → 兔子的路径 → 展开地图 → 汇报村长（第三任务前置阻止跳过青石村主任务链进入章节收束；未建通用 StoryPrerequisite 系统）
- GamePage：村长对话按条件显示「你带回了一张指向黄金兔子王所在之地的地图。」+ 按钮「向村长展示《兔子的路径》」（调 reportRabbitPathToVillageElder，仅 Store 返回 true 后 UI 由 Store 新状态自然切换，无 showRabbitReportComplete 本地 state）；汇报后按钮消失（不 disabled 残留）+ 固定文案「你已经把《兔子的路径》展示给村长。/地图仍指向黄金兔子王所在之地。/下一步目的地：【待补充】」；不依赖 P1-003 回应选择/关系值
- 冒险页「青石村阶段完成」panel：只看 world.flags.rabbit_path_reported === true（不重算任务链；Store action 已保证 flag 只能在正确前提下产生）；固定正文 + 下一步目的地：【待补充】；非 modal/toast/setTimeout；无新地点/下一章按钮
- 零回归：三正式任务/Lv.2/村长 P1-003 选择与关系反应/魔化狼门控/嘟嘟兔一次性清场/展开地图/战斗药水/四职业技能/商店/休整/Save-Continue 全部保持；未建 TurnManager/StoryEngine/DialogueEngine/NarrativeGraph/EventBus
- 预期修改范围：gameStore.ts + gameStore.test.ts + GamePage.tsx + qa/e2e.mjs + README（App.tsx/CombatPage.tsx/items/enemies/locations/quests/types/storage/rules/content 零修改）
- Store 单测 19 项 A-O：A 无 gameState false/B 不在青石村 false 全不变/C 无地图 false/D 非法 quantity（0/-1/1.5/NaN/Infinity）均 false 且 GameState 同一引用不变/E 未查看 false/F 狼任务非 completed false/G 全合法 true+flag true/H 成功后地图仍 ×1/I 成功只改 rabbit_path_reported（player/equipment/quests/inventory/位置/completedEvents/npcStates/其他 flags 全不变）/J flag=false 改 true/K flag=true 重复 false 全不变/L flag="yes"/1 false 全不变/M trust/respect 完全不变/N 金币/等级/HP/MP 全不变/O 不自动保存
- 28 项 E2E（直接扩展 P1-010 正式长流程存档，不再复制前三任务：A 无地图/已持图未查看时村长对话均无汇报按钮 + 确定性击败嘟嘟兔获取地图 + 展开地图后【待补充】保持/B 查看后村长对话显示带回地图文案+按钮 enabled/C 记录汇报前状态（Lv/HP/MP/金币/地图数/trust/respect/当前位置 qingshi_village）/D 汇报后固定文案+按钮消失/E 汇报后 Lv/HP/MP/金币全不变+地图仍 ×1+信任 1 尊敬 0+位置不变/F 冒险页青石村阶段完成+正文+【待补充】+无新地点按钮/G Save/Continue 后阶段完成保持+地图仍 ×1+重开村长仍显示已汇报文案且无按钮/R1 段末 Math.random 恢复真实实现）

TM-P1-017（第四正式主线目标《追寻黄金兔子王》——第二段主线入口）：
- quests.ts 新增 `quest_golden_rabbit_search`：title 追寻黄金兔子王 / summary《兔子的路径》指向黄金兔子王所在之地。具体目的地：【待补充】/ giverNpcId village_elder / **无 goldReward**（本卡不允许完成任务，不预埋奖励）；QuestDefinition 接口零扩展（无 objectives/chapter/mainQuest/prerequisites/destination/nextQuest）
- discoverQuest 窄特判：questId==='quest_golden_rabbit_search' 必须 world.flags.rabbit_path_reported === true，否则 false 且 GameState 完全不变；非严格 true（undefined/false/"true"/"yes"/1/0）均不解锁、不修复异常 flag
- 正式顺序保持：三任务完成 → Lv.2 → 击败嘟嘟兔 → 查看地图 → 向村长汇报 → rabbit_path_reported=true → 第四任务；不允许从新游戏直接 discover
- GamePage localQuests UI 窄前置（与 Store discoverQuest 一致）：quest_golden_rabbit_search → world.flags.rabbit_path_reported===true，汇报前附近委托完全看不到第四任务
- 复用现有任务生命周期 discoverQuest/acceptQuest（禁止 startMainQuest/activateStoryQuest/beginChapter）；本卡结束状态 quest_golden_rabbit_search status=in_progress；**无完成路径**（不添加 markQuestCompletable/completeQuest 正式剧情触发）
- 无即时奖励（发现/接受时 gold/level/HP/MP/trust/respect/inventory/flags/completedEvents 全 +0，仅 quests 数组既有生命周期变化）；不消耗《兔子的路径》（仍 ×1，reported/examined 保持）；不依赖 P1-003 关系选择
- 无新移动按钮（即使已接受：不出现前往黄金兔子王/离开青石村/进入下一章/前往【待补充】）；青石村阶段完成 panel 保留（上一阶段完成与下一阶段开始可同时存在）
- schema 不变、SAVE_VERSION=1；App.tsx/CombatPage.tsx/items/enemies/locations/NPCs/types/storage/rules 零修改；git diff 仅 quests.ts + content.test.ts + gameStore.ts + gameStore.test.ts + GamePage.tsx + qa/e2e.mjs + README
- Store 单测 12 项 A-J：A 汇报前 discover false 且 quests 完全不变/B reported=false false/C 非严格 flag（"true"/1/0/"yes"）均 false 全状态不变（异常 flag 原样保留）/D reported=true discover true 且 QuestState{available,stage 0,flags {}}/E 重复 discover false 无第二条/F accept true → in_progress/G 重复 accept false/H 发现+接受无副作用（player/inventory/equipment/world/其他 quests 除新 QuestState 外全不变）/I 地图仍 ×1 且 reported/examined 保持/J 不自动保存 + content 测试：QUESTS toHaveLength(4) + 第四任务注册表定义锁定（title/giver/无 goldReward/summary 含《兔子的路径》+黄金兔子王+具体目的地：【待补充】）
- 21 项 E2E（直接继续 P1-016 Save/Continue 后正式状态，不重打前三任务/狼/嘟嘟兔：A Continue 后青石村阶段完成保留+地图 ×1+附近委托出现第四任务入口（村长似乎有事相托）+未发现状态不显示任务卡/B 查看委托后可接受+任务描述含《兔子的路径》与【待补充】/C 接受后进行中+附近委托入口消失/D 金币数值保持+阶段完成保留+【待补充】+地图 ×1+Lv.2/E 无可前往黄金兔子王/前往【待补充】/下一章按钮+可前往区仅村外草原/废弃矿洞/F Save/Continue 后进行中保持+地图 ×1+阶段完成+【待补充】）

TM-P1-018（《追寻黄金兔子王》第一步——向村中两人打听地图线索）：
- 新增窄 Store Action `consultGoldenRabbitSearchNpc(npcId: 'blacksmith' | 'apothecary'): boolean`（第四任务专属；未扩成 consultNpc/askNpcAboutQuest/DialogueAction/InvestigationEngine）
- 成功前置全满足：gameState 存在 + 当前位置 qingshi_village + quest_golden_rabbit_search 存在且 status in_progress + npcId 为 blacksmith/apothecary；否则 false 且 GameState 完全不变
- 使用 QuestState.flags 记录（不新增 world flag、无 schema 扩展）：asked_blacksmith=true / asked_apothecary=true；false 视为未询问可改 true；重复询问（true）拒绝且同一引用不变；非 boolean 异常旧 flag（"yes"/1）拒绝且不静默覆盖——**R1 完整校验**：写任何调查 flag 前同时验证两个相关 flag（各自只允许 undefined/false/true），任一个为非 boolean 已存在值整次拒绝且完全不变（交叉场景：asked_blacksmith="yes" 咨询 apothecary 也拒绝，反之亦然）
- 不改 stage（保持 0，不建 stage 状态机）；不推进 completable/completed（具体目的地未确定）；两人问完 status 仍 in_progress
- 铁匠对话（in_progress 且未询问）：「你把《兔子的路径》拿给铁匠辨认。」+ 按钮「向铁匠打听地图」→ 成功隐藏按钮 + 固定回复「铁匠看了看地图，摇了摇头：“这上面的路线，我认不出来。”」（不增加任何地点/道路/城市/势力 lore）
- 药师对话：「你请药师看看《兔子的路径》上的标记。」+ 「向药师打听地图」→ 成功隐藏按钮 + 「药师仔细辨认了一会儿：“我也没见过这处标记。”」；剧情块在 greeting 之后（npcs.ts 零修改，原 greeting 保留）
- 任务日志调查进度：第四任务 in_progress 时显示「地图线索调查：X / 2」（严格从 QuestState flags 读取，0/2→1/2→2/2）；2/2 额外显示「你已经向铁匠和药师打听过，但仍无法确认地图指向的具体地点。/下一步目的地：【待补充】」（本卡结尾，不虚构下一地区）
- 无任何奖励（金币/等级/HP/MP/关系/物品/world.flags/completedEvents 全 +0）；不建立/修改 npcState（铁匠/药师关系零变化）；不依赖职业/属性/D20/随机判定；兔子的路径仍 ×1；无新移动入口（可前往按钮保持 村外草原/废弃矿洞）
- schema 不变、SAVE_VERSION=1；quests.ts/npcs.ts/locations.ts/items.ts/enemies.ts/App.tsx/CombatPage.tsx/types/storage/rules/content 零修改；git diff 仅 gameStore.ts + gameStore.test.ts + GamePage.tsx + qa/e2e.mjs + README
- Store 单测 22 项 A-R+R1-a/b：A 无 gameState false/B 第四任务不存在 false 全不变/C available false/D completed/completable false/E 不在青石村 false/F 非法 npcId（运行时强转 innkeeper）false 全不变/G 首次问铁匠 true+asked_blacksmith true/H 首次问药师 true+asked_apothecary true/I 铁匠重复 false 同一引用不变/J 药师重复 false 同一引用不变/K flag=false 可改 true/L+M 非 boolean 异常 flag（"yes"/1）拒绝且原样保留/N 问完一人 status 仍 in_progress+stage 仍 0/O 两人问完两 flag true+status 仍 in_progress+stage 仍 0/P rabbit_path 仍 ×1/Q player/inventory/equipment/world/其他 quests 全不变+不建 npcState（blacksmith/apothecary 均 undefined）+reported 保持/R 不自动保存 + R1-a asked_blacksmith="yes" 咨询 apothecary false 同一引用不变两 flag 原样/R1-b asked_apothecary=1 咨询 blacksmith false 同一引用不变两 flag 原样
- 27 项 E2E（直接继续 P1-017 第四任务 in_progress 档：A Continue 后进行中+地图线索调查 0/2/B 铁匠打听入口 enabled→点击→固定回复+按钮消失+1/2/C 仍进行中+无提交任务按钮/D 药师打听入口→点击→固定回复+按钮消失/E 2/2+调查结果固定文案+【待补充】+仍进行中/F 调查前后 Lv/HP/MP/金币/地图数精确相等+村长信任 1 尊敬 0 不变/G 可前往按钮精确等于 [废弃矿洞, 村外草原]/H Save/Continue 后 2/2 保持+重开铁匠/药师显示已询问回复且无打听按钮）

TM-P1-019（村内调查复命——向村长汇报两人均无法辨认地图）：
- 新增窄 Store Action `reportGoldenRabbitVillageInvestigation(): boolean`（第四任务专属；未扩成 reportQuestProgress/advanceMainStory/completeInvestigation/StoryAction）
- 成功前置全满足：gameState 存在 + 当前位置 qingshi_village + quest_golden_rabbit_search 存在且 in_progress + asked_blacksmith===true + asked_apothecary===true + village_inquiry_reported 为 undefined/false；否则 false 且 GameState 完全不变
- 三个相关 flag 完整校验（R1 原则）：asked_blacksmith/asked_apothecary/village_inquiry_reported 各自只允许 undefined/boolean；任一非 boolean 已存在值（"yes"/1/0.5）整次拒绝且完全不变（不静默覆盖）；village_inquiry_reported=false 视为尚未汇报可 false→true；已 true 重复复命拒绝且同一引用不变
- 0/2、1/2（含只有一人询问）均不可复命
- 成功后只写 quest.flags.village_inquiry_reported=true：两个 asked flag 保持 true；status 仍 in_progress、stage 仍 0；不 markQuestCompletable/completeQuest/stage+1（具体目的地未确定）
- 村长对话复命入口（第四任务 in_progress + 调查 2/2 + 未复命）：「你已经问过铁匠和药师，但两人都无法辨认地图上的标记。」+ 按钮「向村长汇报调查结果」；与 P1-016「向村长展示《兔子的路径》」旧入口严格分开（P1-016 已复命不重复出现）
- 点击只调用 Store action（GamePage 不直接改 QuestState.flags）；成功隐藏按钮（不留 disabled）+ 固定文案「你已经把调查结果告诉了村长。/村里目前没人能够确认地图上的标记。/下一步目的地：【待补充】」（不虚构下一城市/森林/古道/王国/商队/公会/地图专家/神殿/坐标）
- 任务日志：复命后保留「地图线索调查：2 / 2」+ 原 2/2 调查结果「你已经向铁匠和药师打听过，但仍无法确认地图指向的具体地点。」+ 额外「村内调查已汇报。」+「下一步目的地：【待补充】」（不覆盖历史进度）
- 无任何奖励（金币/等级/HP/MP/物品/world.flags/completedEvents 全 +0）；村长 trust/respect 精确保持；铁匠/药师 npcStates 仍 undefined（不建立关系）；兔子的路径仍 ×1；无新移动入口（可前往按钮保持 村外草原/废弃矿洞）
- schema 不变、SAVE_VERSION=1；quests.ts/npcs.ts/locations.ts/items.ts/enemies.ts/App.tsx/CombatPage.tsx/types/storage/rules/content 零修改；git diff 仅 gameStore.ts + gameStore.test.ts + GamePage.tsx + qa/e2e.mjs + README
- Store 单测 23 项 A-T+O：A 无 gameState false/B 第四任务不存在 false 全不变/C status available false/D completable/completed false/E 不在青石村 false/F 0/2（两人均未询问）false/G 只有 asked_blacksmith=true（1/2）false/H 只有 asked_apothecary=true（1/2）false/I 两人都 true → report true + village_inquiry_reported=true/J reported=false 可改 true/K reported=true 重复 false 同一引用不变/L+M+N 非 boolean 异常 flag（"yes"/1，三个 flag 各 2 组）拒绝且原样保留/O 交叉异常（asked_blacksmith=true + asked_apothecary="yes" + reported=false）整体拒绝/P 成功后两 asked 保持 true + reported=true/Q status 仍 in_progress + stage 仍 0/R rabbit_path 仍 ×1/S player/inventory/equipment/world/其他 quests/npcStates 全不变（village_elder 关系保持）+reported 保持/T 不自动保存
- 26 项 E2E（直接继续 P1-018 已保存 2/2 档：A Continue 后进行中+地图线索调查 2/2/B 村长复命入口文案+按钮 enabled+P1-016 旧入口不重复出现/C 复命前记录 Lv/HP/MP/金币/地图数/位置/trust/respect/D 点击复命→固定文案（告诉村长+无人确认+【待补充】）+按钮消失/E 任务日志 2/2+村内调查已汇报+【待补充】+原 2/2 结果保留+第四任务状态标签进行中+无提交任务按钮/F 复命前后 Lv/HP/MP/金币/地图数精确相等+位置仍 qingshi_village+村长 trust 1 respect 0 保持/G 可前往按钮精确等于 [废弃矿洞, 村外草原]/H Save/Continue 后进行中+2/2+村内调查已汇报+【待补充】+重开村长已复命文案无按钮）

TM-P1-020（返回兔王巢穴复查《兔子的路径》）：
- 新增窄 Store Action `recheckGoldenRabbitMapAtLair(): boolean`（第四任务专属；未扩成 investigateLocation/inspectQuestLocation/ClueSystem/ExplorationAction/StoryEngine）
- 成功前置全满足：gameState 存在 + 当前位置 rabbit_lair + quest_golden_rabbit_search 存在且 in_progress + asked_blacksmith===true + asked_apothecary===true + village_inquiry_reported===true + rabbit_lair_rechecked 为 undefined/false + 背包合法持有 rabbit_path（quantity 安全整数 >=1）+ world.flags.rabbit_path_examined===true；否则 false 且 GameState 完全不变
- 四个相关 flag 完整校验（R1 原则）：asked_blacksmith/asked_apothecary/village_inquiry_reported/rabbit_lair_rechecked 各自只允许 undefined/boolean；任一非 boolean 已存在值（"yes"/1/0.5）整次拒绝且完全不变（不静默覆盖）；前三项必须严格 true；rabbit_lair_rechecked=false 可 false→true；已 true 重复复查拒绝且同一引用不变
- 地图 quantity 安全边界：0/-1/1.5/NaN/Infinity/缺失一律拒绝（单测直接构造真实异常 inventory，非 addItem 假覆盖）
- 成功后只写 quest.flags.rabbit_lair_rechecked=true：前三 flag 保持 true；status 仍 in_progress、stage 仍 0；不 markQuestCompletable/completeQuest/stage+1（真实下一地点仍未知）
- 玩家自行移动（不新增快捷传送）：青石村 → 村外草原 → 兔王巢穴（现有 travelToLocation）
- 巢穴复查剧情块（rabbit_lair + 第四任务 in_progress + 已复命 + 未复查）：「你带着《兔子的路径》返回兔王巢穴，准备重新比对地图上的标记。」+ 按钮「重新比对地图」；点击只调用 Store action（GamePage 不直接改 QuestState.flags）；成功隐藏按钮（不留 disabled）+ 固定结果「你重新比对了地图与巢穴周边，但仍没有找到足以确认下一处地点的线索。/下一步目的地：【待补充】」（不声称路线从巢穴开始/发现道路/足迹/方向/知道黄金兔子王去向）
- 任务日志：已复命未复查时显示「当前目标：返回兔王巢穴重新比对地图。」（行动目标，非新 lore）；复查后目标消失 + 额外「巢穴复查完成。」；保留 2/2 + 调查结果 + 村内调查已汇报 +【待补充】
- Boss 清场保持（P1-014 封板）：持有 rabbit_path 后兔王巢穴无嘟嘟兔/无迎战按钮/整个「附近威胁」section 不渲染（本卡不重新生成 Boss）
- 无任何奖励（金币/等级/HP/MP/物品/world.flags/completedEvents 全 +0）；trust/respect/npcStates/world.flags 全不变；兔子的路径复查不消耗仍 ×1；无新移动入口/新地点/新路线/新坐标
- schema 不变、SAVE_VERSION=1；quests.ts/npcs.ts/locations.ts/items.ts/enemies.ts/App.tsx/CombatPage.tsx/types/storage/rules/content 零修改；git diff 仅 gameStore.ts + gameStore.test.ts + GamePage.tsx + qa/e2e.mjs + README
- Store 单测 27 项 A-S：A 无 gameState false/B 不在 rabbit_lair false/C 第四任务不存在 false 全不变/D available/completable/completed false/E asked_blacksmith !== true false/F asked_apothecary !== true false/G village_inquiry_reported !== true false/H 无 rabbit_path false/I quantity 0/-1/1.5/NaN/Infinity false 同一引用不变/J rabbit_path_examined !== true false/K 全前置合法 true+rechecked=true/L rechecked=false 可改 true/M rechecked=true 重复 false 同一引用不变/N 四 flag 任一非 boolean（"yes"/1/0.5）拒绝且原样保留/O 成功后前三 flag 保持 true/P status 仍 in_progress+stage 仍 0/Q rabbit_path 仍 ×1（复查不消耗地图）/R player/inventory/equipment/world/其他 quests/npcStates 全不变+examined 保持/S 不自动保存
- 31 项 E2E（直接继续 P1-019 已保存复命完成档：A Continue 后进行中+村内调查已汇报+当前目标：返回兔王巢穴重新比对地图/B 青石村可前往按钮精确等于 [废弃矿洞, 村外草原]→村外草原→兔王巢穴+currentLocationId===rabbit_lair/C Boss 清场回归（无附近威胁 section+无嘟嘟兔+无迎战按钮+地图 ×1）/D 巢穴复查剧情块文案+重新比对地图按钮 enabled/E 点击复查→固定结果+【待补充】+按钮消失/F 任务状态进行中+2/2+村内调查已汇报+巢穴复查完成+【待补充】+当前目标消失+无可完成/提交/G 复查前后 Lv/HP/MP/金币/地图数精确相等/H Save/Continue 后巢穴复查完成+【待补充】+进行中+地图 ×1+重进巢穴无按钮/无嘟嘟兔/无威胁 section/地图仍 ×1/复查完成保留）

TM-P1-021（首条正式支线《采药受阻》——药师发布，暂停主线堆叠补游玩量）：
- quests.ts 新增 quest_apothecary_herb_route：title 采药受阻 / summary「村外魔化野兽让采药变得不安全。药师希望你去村外草原查看采药区域的情况。」/ giverNpcId apothecary / goldReward 10；QuestDefinition 零扩展
- 发现前置（窄特判，不建 prerequisite 系统）：Store discoverQuest 仅当 quest_village_monsters.status===completed 才允许发现；GamePage localQuests 同步相同门槛
- 复用现有任务生命周期 discoverQuest/acceptQuest/completeQuest（undiscovered→available→in_progress→completable→completed）
- 新增窄 Store Action `inspectApothecaryHerbRoute(): boolean`（支线专属）：village_grassland + 支线 in_progress + grassland_checked undefined/false 时成功，原子写 flags.grassland_checked=true 且 status→completable（stage 保持 0）；true 重复拒绝同一引用不变；非 boolean 异常 flag（"yes"/1/0.5）拒绝不修复；无金币/HP/MP/物品/关系副作用、不自动保存
- 草原剧情块（in_progress 或已查看时显示）：未调查「药师常来这一带采药。附近魔化野兽的活动让这里变得不再安全。」+ 按钮「查看采药区域」；成功「你检查了附近的采药区域，确认魔化野兽的活动确实影响了这里。/可以回青石村向药师复命了。」按钮消失（无草药/采集物/危险值/随机结果）
- 任务日志：接受后「当前目标：前往村外草原查看采药区域。」；调查后「采药区域已查看。/当前目标：返回青石村向药师复命。」
- 提交复用现有 completeQuest（completable→completed + goldReward 10 走 generic 金币奖励，无专属奖励 action）；除 gold +10 外等级/HP/MP/物品/装备/关系/world.flags/npcStates/completedEvents 全不变；不赠送治疗药水
- 黄金兔子主线零修改：继续 in_progress/stage 0/asked 两 true/village_inquiry_reported true/rabbit_lair_rechecked true/巢穴复查完成/【待补充】
- schema 不变、SAVE_VERSION=1；locations.ts/npcs.ts/items.ts/enemies.ts/App.tsx/CombatPage.tsx/types/storage/rules/content 定义零修改；git diff 仅 quests.ts + content.test.ts + gameStore.ts + gameStore.test.ts + GamePage.tsx + qa/e2e.mjs + README
- content 测试：QUESTS toHaveLength(5) + 支线注册表定义锁定（title/giver/goldReward 10/summary 关键文案）+ 无新增敌人/NPC
- Store 单测 18 项 A-O：A 第一主线未完成 discover false/B completed discover true+available/C 重复 discover false/D accept in_progress/E 不在草原 inspect false/F 支线不存在 false/G available/completable/completed false/H 首次 inspect true+checked true+completable+stage 0/I checked=false 可执行/J checked=true 重复 false 同一引用不变/K 非 boolean flag（"yes"/1/0.5）false 同一引用原值保留/L inspect 无金币/HP/MP/物品副作用/M completeQuest 后 completed+gold 精确 +10/N 除 gold 与该 QuestState 外其他状态不变/O inspect 不自动保存
- 30 项 E2E（直接继续 P1-020 已保存档：A Continue 后兔王巢穴→村外草原→青石村+黄金主线进行中+巢穴复查完成+【待补充】/B 附近委托出现药师入口+采药受阻可接受+描述来自注册表/C 接受后进行中+当前目标：前往村外草原查看采药区域+记录金币/D 草原剧情块文案+查看采药区域按钮 enabled/E 点击→固定结果+可以回青石村向药师复命+采药区域已查看+当前目标：返回青石村向药师复命+可完成+按钮精确消失/F 返回青石村提交→已完成+金币严格 +10/G Lv.2 不变+maxHP/maxMP 不变+兔子的路径 ×1+黄金主线 in_progress+巢穴复查完成/H Save/Continue 后采药受阻已完成+黄金主线保持+草原无采药调查按钮）

TM-P1-022（第二条支线《矿洞余患》——铁匠发布，复用废弃矿洞/魔化鼠/战斗系统）：
- quests.ts 新增 quest_blacksmith_mine_remnant：title 矿洞余患 / summary「矿洞清理后，铁匠仍担心里面还有魔化鼠活动，希望你再去废弃矿洞确认一次。」/ giverNpcId blacksmith / goldReward 10；QuestDefinition 零扩展
- 发现门槛（窄特判，未建 prerequisite 系统）：Store discoverQuest 仅 quest_mine_cleanup.status===completed 才允许发现；GamePage localQuests 同步相同门槛
- 完全复用现有生命周期 discoverQuest/acceptQuest/completeQuest（undiscovered→available→in_progress→completable→completed），未新增任务进度 action
- 战斗推进（resolveCombatVictory 窄分支）：abandoned_mine + corrupted_rat 胜利 + 支线 in_progress → 同一次胜利支线 status→completable（stage 保持 0）；与《矿洞清理》in_progress 推进互不排斥（同一胜利可同时推进两任务，未写 if/else 互斥）；iron_ore +1 原有掉落保持（战利品非支线额外奖励）
- 无额外支线 flag（不建 remnant_rat_killed/mine_checked/second_rat_defeated——Quest status 已足够表达）
- 任务日志：in_progress「当前目标：前往废弃矿洞处理残余的魔化鼠。」；completable「矿洞余患已确认。/当前目标：返回青石村向铁匠复命。」（无新矿洞 lore）
- 提交复用 generic completeQuest（completable→completed + goldReward 10 走 generic 金币奖励，未新增 completeMineRemnantQuest/rewardMineRemnant）；除 iron_ore+1（战斗战利品）、支线 QuestState、提交 gold+10 外无其他状态变化（无等级/XP/HP/MP/装备/药水/关系/属性/新物品）
- 黄金兔子主线完全冻结：继续 in_progress/stage 0/asked 两 true/village_inquiry_reported true/rabbit_lair_rechecked true/巢穴复查完成/【待补充】；《采药受阻》保持 completed
- schema 不变、SAVE_VERSION=1；locations.ts/npcs.ts/items.ts/enemies.ts/App.tsx/CombatPage.tsx/types/storage/rules/content 定义零修改；git diff 仅 quests.ts + content.test.ts + gameStore.ts + gameStore.test.ts + GamePage.tsx + qa/e2e.mjs + README
- content 测试：QUESTS toHaveLength(6) + 支线注册表定义锁定（title/giver/goldReward 10/summary 关键文案）+ 无新增敌人/NPC
- Store 单测 14 项 A-M：A 矿洞清理未 completed discover false/B completed discover true+available/C accept in_progress/D 非 corrupted_rat 胜利不推进（corrupted_rabbit 无副作用 GameState 完全不变）/E corrupted_rat 但不在废弃矿洞不推进/F 支线 available 时 rat 胜利不推进/G in_progress+合法 rat 胜利→completable+stage 0/H 同次胜利仍 iron_ore +1/I 已 completable 再打 rat 保持 completable 不回退/J generic completeQuest→completed+gold 精确 +10/K 除 iron_ore+1/支线 QuestState/提交 gold+10 外无其他状态变化（打 rat 后 player/equipment/world 全等；提交后仅 gold 与支线 QuestState 变）/L 黄金兔子第四主线完全不变（本卡流程不创建/不推进）+采药受阻不创建/M 不自动保存
- 24 项 E2E（直接继续 P1-021 已保存档：A Continue 后采药受阻已完成+黄金主线进行中+巢穴复查完成+【待补充】/B 附近委托出现铁匠入口+矿洞余患可接受（发布者铁匠）+接受后进行中+当前目标：前往废弃矿洞处理残余的魔化鼠+记录金币/铁矿石/C 前往废弃矿洞魔化鼠仍存在可迎战/D 确定性击败（Math.random 隔离 0.99）→矿洞余患可完成+矿洞余患已确认+当前目标：返回青石村向铁匠复命+铁矿石 = 战前 + 1/E 返回青石村提交→已完成+金币精确 +10/F 主线零回归（黄金主线进行中+巢穴复查完成+【待补充】+采药受阻已完成）/G Save/Continue 后矿洞余患已完成+采药受阻已完成+黄金主线进行中+巢穴复查完成+支线不重新出现为可接受）

TM-P1-023（第一个区域到第二个区域的正式跨越：离开青石村前往天龙城；《兔子的路径》为长期线索，主城非黄金兔子王所在地）：
- locations.ts 新增 tianlong_city：name 天龙城 / description「天龙王朝的皇城。高大的城墙、宽阔的街道与成片建筑构成这座繁华城市。」/ connections=[]（单向不可返回，无返回 connection）/ enemyIds=[]（本卡无假内容）；P1-024 再开始城内内容
- 新增唯一窄 Store Action `departQingshiVillageToTianlongCity(): boolean`（禁止泛化 teleport/RegionManager/ChapterEngine）：成功必须 gameState 存在 + qingshi_village + 黄金主线存在且 in_progress/stage 0 + 四剧情 flag（asked_blacksmith/asked_apothecary/village_inquiry_reported/rabbit_lair_rechecked）均严格 ===true（任一非 boolean 如 "yes"/1/0.5 整次拒绝且完全不变，不修复）+ rabbit_path 合法持有（存在且 quantity 安全整数>=1；0/-1/1.5/NaN/Infinity 拒绝）+ rabbit_path_examined===true + rabbit_path_reported===true + 两条支线（采药受阻/矿洞余患）不存在/completed/failed 不阻止、available/in_progress/completable 阻止（不自动改 failed）
- 成功只改 world.currentLocationId='tianlong_city'（无 qingshi_departed flag）；player/inventory/equipment/quests/flags/npcStates/completedEvents 全不变；不自动保存
- 黄金兔子任务长期保留：in_progress/stage 0/四 flag 均 true/《兔子的路径》×1/具体目的地【待补充】（未把天龙城写成黄金兔子目标，summary 未改）
- UI（GamePage）：青石村 + 收束满足时显示「新的旅程」section——正文「青石村的事情暂时告一段落。你已经可以前往天龙城继续旅程。」+ 按钮「准备前往天龙城」（enabled）；已接触未完成支线时显示「你还有已经接触但尚未结束的村内委托，处理完再离开。」（不显示按钮、不自动完成/失败）；点击后 UI 本地 state showTianlongDepartureConfirm 显示二次确认「离开青石村后将无法返回。/尚未发现的村内委托将被留在这里。」+「前往天龙城/暂不离开」（不写 GameState）；「前往天龙城」只调用 Store action，返回 true 后自然进入新地点（GamePage 不直接写 currentLocationId/flags/quests）
- 天龙城落地：沿用已有地点 UI（当前位置/天龙城/tianlong_city/注册表 description）；connections=[] → 可前往区无按钮；无「返回青石村」；无附近人物/威胁/委托 section（空集合沿用不渲染）
- 顺带修复 P1-021 遗留小问题：采药受阻任务卡「当前目标：返回青石村向药师复命。」增加 status===completable 限制（completed 后不再显示）
- schema 不变、SAVE_VERSION=1；quests.ts/npcs.ts/items.ts/enemies.ts/App.tsx/CombatPage.tsx/types/storage/rules 零修改；git diff 仅 locations.ts + content.test.ts + gameStore.ts + gameStore.test.ts + GamePage.tsx + qa/e2e.mjs + README
- content 测试：LOCATIONS toHaveLength(5) + tianlong_city 注册表锁定（id/name/description/connections=[]/enemyIds=[]/无 requiredFlag）+ NPC/ENEMY/ITEM/QUEST 数量不变（QUEST 仍 6）
- Store 单测 34 项 A-W（含 it.each 子项）：A 无 gameState false/B 不在青石村 false/C 黄金任务不存在 false/D available/completable/completed false/E stage 非 0 false/F 四 flag 任一非 true false/G 四 flag 任一非 boolean（"yes"/1/0.5）false 且同一引用不变不修复/H 无 rabbit_path false/I quantity 0/-1/1.5/NaN/Infinity false 且同一引用不变/J examined 非 true false/K reported 非 true false/L 两支线均不存在可离开/M 支线 completed 可离开/N 支线 failed 可离开/O/P/Q 两支线 available/in_progress/completable 各状态 false 且完全不变（不自动改 failed）/R 全合法 true+tianlong_city/S 成功只改 currentLocationId（player/inventory/equipment/quests/npcStates/completedEvents/flags 全等）/T golden quest 完全不变（长期保留）/U rabbit_path 仍 ×1/V 成功后再次调用 false 且 GameState 同一引用/W 不自动保存
- 27 项 E2E（直接继续 P1-022 已保存完成档：A Continue 后两支线已完成+黄金主线进行中+巢穴复查完成+兔子的路径 ×1+当前位置 qingshi_village/B 新的旅程入口+入口正文+准备前往天龙城按钮 enabled（+记录 Lv/HP/MP/gold/地图数）/C 二次确认文案（无法返回+委托留在此地）+前往天龙城/暂不离开按钮+暂不离开后仍在青石村+重新打开/E 真正确认→当前位置 tianlong_city+地点天龙城+描述来自注册表/F 可前往按钮精确空 []+无返回青石村按钮/G 离村前后 Lv/HP/MP/gold/地图数精确全不变/H 追寻黄金兔子王进行中+巢穴复查完成+具体目的地【待补充】+两支线仍已完成/I Save/Continue 后当前位置 tianlong_city+地点天龙城+无返回青石村+黄金主线进行中+兔子的路径 ×1）
- R1（UI 与 Store 前置对齐）：GamePage goldenDepartureReady 补齐 rabbit_path 三项前置——hasValidRabbitPath（存在且 quantity 安全整数 >=1）+ rabbit_path_examined===true + rabbit_path_reported===true；异常地图状态（缺失/quantity 0/-1/1.5/NaN/Infinity/examined false/reported false）一律不显示「新的旅程」「准备前往天龙城」及二次确认，避免 UI 允许但 Store 拒绝的死入口；Store departQingshiVillageToTianlongCity 零修改；E2E 新增 UI 级注入验证（存档备份→改存档→reload→检查）：rabbit_path 缺失→无入口 / quantity=0→存档被 loadGame 拒绝无法进入游戏页（UI 无离村入口的更强保证） / examined=false→无入口 / reported=false→无入口 / 恢复合法档→入口仍在且 enabled（缺失/examined/reported 走正常合法存档流程进游戏页验证；quantity 完整异常边界继续由 Store 单测承担，因为 0/-1/1.5/NaN/Infinity 的存档被 isGameState 拒绝）

TM-P1-024（天龙城第一段：武馆、骑士队长马科与商人王财——第二地区正式可玩剧情；P1-025 才正式建黑石塔入口）：
- locations.ts 新增 tianlong_martial_hall：name 武馆 / description「天龙城中的武馆，来往的武者与守卫在这里操练，兵器碰撞声不时从场中传来。」/ connections=['tianlong_city'] / enemyIds=[]；tianlong_city.connections []→['tianlong_martial_hall']（双向合法连接；本卡不增加其他城市子区域、不建黑石塔）
- npcs.ts 新增 knight_captain_make（马科/骑士队长/武馆/summary 含武馆/greeting「刚到天龙城？这里比村镇复杂得多，出城办事之前最好先弄清楚自己面对的是什么。」）+ merchant_wangcai（王财/商人/天龙城/summary 含头疼/greeting「唉……最近实在诸事不顺。」）；本卡不建立 relationship/npcState，所有职业可正常交流，不建转职/职业导师/技能学习系统
- quests.ts 新增 quest_wangcai_trouble：title 商人王财的麻烦 / summary「骑士队长马科请你找到商人王财，了解他最近在黑石塔附近遇到的麻烦。」/ giverNpcId knight_captain_make / 无 goldReward；QuestDefinition 零扩展；本卡不允许完成任务
- 任务入口直接复用 localQuests（giver 位于武馆自然显示「马科似乎有事相托」→ 查看委托 → 发布者：马科 可接受）；复用 discoverQuest/acceptQuest；未新增 offerWangcaiQuest/acceptCityMainQuest/MainQuestSystem/ChapterEngine；未往发现逻辑塞新 prerequisite 特判
- 接受后任务日志：「当前目标：返回天龙城，找到商人王财了解情况。」（此时无黑石塔移动按钮/可完成/奖励）
- 新增唯一窄 Store Action `askWangcaiAboutTrouble(): boolean`：tianlong_city + quest_wangcai_trouble in_progress + wangcai_briefed undefined/false 时成功，原子写 quest.flags.wangcai_briefed=true（status 保持 in_progress、stage 保持 0）；wangcai_briefed 只允许 undefined/false/true——非 boolean（"yes"/1/0.5）整次拒绝且完全不变（不修复）；已 true 重复调用 false 且 GameState 同一引用；无金币/HP/MP/物品/装备/关系/flags/completedEvents 副作用、不自动保存
- 王财对话剧情（GamePage）：activeNpc=merchant_wangcai + 任务 in_progress + briefed!==true → 「马科让你来了解王财最近遇到的麻烦。」+ 按钮「询问黑石塔附近的遭遇」（只调用 Store action）；成功后固定文案「王财告诉你，几天前他在黑石塔附近遭到魔物袭击，混乱中遗失了妻子的夔峒项链。/他希望你能前去调查，并设法找回项链。」按钮消失；任务日志「已向王财了解情况。/当前目标：调查黑石塔附近的情况。/黑石塔：【待开放】」（待开放=实现状态，非 lore）
- 不开放黑石塔：未新增 black_stone_tower/城外道路/骷髅/僵尸/项链物品/Boss；夔峒项链只在剧情文本提及（未建 ItemDefinition）；王财说明后天龙城真实移动按钮仍只 [武馆]、武馆只 [天龙城]
- 黄金兔子长期线冻结：in_progress/stage 0/四 flag 均 true/rabbit_path ×1/巢穴复查完成/具体目的地【待补充】；马科/王财不识别《兔子的路径》
- schema 不变、SAVE_VERSION=1；items.ts/enemies.ts/professions.ts/App.tsx/CombatPage.tsx/types/storage/rules 零修改；git diff 仅 locations.ts + npcs.ts + quests.ts + content.test.ts + gameStore.ts + gameStore.test.ts + GamePage.tsx + qa/e2e.mjs + README
- content 测试：LOCATIONS toHaveLength(6) + 武馆注册表锁定（id/name=武馆/connections=[tianlong_city]/enemyIds=[]）+ tianlong_city.connections=[tianlong_martial_hall] + NPCS toHaveLength(5)（马科在武馆/王财在天龙城）+ QUESTS toHaveLength(7) + quest_wangcai_trouble 锁定（title/giver/无 goldReward/summary 含商人王财+黑石塔）+ 马科/王财定义锁定 + ENEMY/ITEM 数量不变
- Store 单测 15 项 A-O：A 无 gameState false/B 不在 tianlong_city false（直接改位置，两地点不相邻）/C quest 不存在 false/D/E/F available/completable/completed false/G in_progress+未 brief→true+briefed=true/H briefed=false 可成功 true/I 已 true→false 同一引用不变/J 非 boolean（"yes"/1/0.5）→false 同一引用不变原值保留/K 成功后 status 仍 in_progress+stage 仍 0/L 成功只改变该 QuestState flag（其他 quests 全不变）/M player/inventory/equipment/world/其他 quests/npcStates 全不变（未创建马科/王财 npcState）/N 黄金兔子主线完全不变（本流程不创建/不推进）/O 不自动保存
- 35 项 E2E（直接继续 P1-023 已保存天龙城档：A Continue 后当前位置 tianlong_city+黄金主线进行中+兔子的路径 ×1+可前往按钮精确 [武馆]/B 前往武馆→当前位置 tianlong_martial_hall+地点武馆+武馆可前往精确 [天龙城]+附近人物马科（骑士队长）/C 附近委托出现马科入口+查看委托→发布者：马科 可接受+接受后进行中+当前目标：返回天龙城找到商人王财（+记录 Lv/HP/MP/gold/地图数）/D 返回天龙城→附近人物王财（商人）+对话剧情入口文案+询问黑石塔附近的遭遇按钮 enabled/E 询问→王财说明固定文案（夔峒项链）+希望调查找回项链+按钮消失+任务日志已向王财了解情况+当前目标：调查黑石塔附近的情况+黑石塔：【待开放】/F 无可完成/提交任务/已完成（仍进行中）/G 天龙城移动按钮仍精确 [武馆]+无黑石塔/前往黑石塔/城外/H 接任务前后 Lv/HP/MP/gold/地图数精确全不变+黄金主线仍进行中+巢穴复查完成+具体目的地【待补充】/I Save/Continue 后当前位置 tianlong_city+商人王财的麻烦进行中+已向王财了解情况+黑石塔：【待开放】+黄金主线进行中+再开王财显示已说明剧情无询问按钮）
- R1（黄金主线零变化锁定）：Store 测试 N 重写——seedWangcaiInProgress 真实构造带四历史 flag（asked_blacksmith/asked_apothecary/village_inquiry_reported/rabbit_lair_rechecked 均 true、status in_progress、stage 0）的 quest_golden_rabbit_search QuestState + quest_wangcai_trouble（in_progress、flags={}）；askWangcaiAboutTrouble() 前深快照、后整个 QuestState 深比较精确相等（JSON 全等 + status/stage/四 flag 逐字段断言）；证明调用王财 action 对已有黄金兔子主线零影响；正式玩法代码（gameStore.ts/GamePage.tsx/e2e.mjs 等）零修改

TM-P1-025（黑石塔一层：解锁路线、骷髅士兵与骷髅队长踪迹——第二地区第一段地牢玩法；P1-026 才做骷髅队长战斗）：
- locations.ts 新增 black_stone_tower_floor1：name 黑石塔一层 / description「黑石砌成的幽暗通道通向几处大厅，脚步声与骨骼摩擦声在塔内回荡。」/ requiredFlag black_stone_tower_unlocked / connections=['tianlong_city'] / enemyIds=['skeleton_soldier']；tianlong_city.connections 增加 black_stone_tower_floor1（未解锁时移动按钮可见但 disabled——复用现有 requiredFlag，checkTravel 零修改）；未建 black_stone_tower_entrance/城外道路/黑石塔外围
- enemies.ts 新增 skeleton_soldier：Lv.3 骷髅士兵（tags ['undead']、maxHp 14、defense 12、attackBonus 3、damage 3）——Lv.2 玩家进入第二地区第一类普通敌人；无技能/状态异常/抗性/亡灵系统/元素弱点/特殊 AI/掉落表，继续现有普通战斗规则；本卡不创建 skeleton_captain EnemyDefinition
- 新增唯一解锁 Action `unlockBlackStoneTowerInvestigation(): boolean`：tianlong_city + quest_wangcai_trouble in_progress/stage 0 + wangcai_briefed 严格 true + world.flags.black_stone_tower_unlocked undefined/false → 成功原子写 world.flags.black_stone_tower_unlocked=true（Quest 不塞路线状态；player/inventory/equipment/quests/npcStates/completedEvents 全不变；不自动保存）；wangcai_briefed/unlock flag 非 boolean（"yes"/1/0.5）整次拒绝且完全不变（不修复）；已 true 重复调用 false 且 GameState 同一引用
- 天龙城出发 UI（GamePage）：briefed 且未解锁时显示「黑石塔调查」卡片（正文「王财提供的情况已经足够，你可以动身前往黑石塔调查。」）+「动身调查黑石塔」按钮只调用 Store action（不直接写 world flag）；解锁后按钮消失、黑石塔一层移动按钮 enabled
- 解锁后任务日志：已向王财了解情况。/黑石塔路线已确认。/当前目标：前往黑石塔一层调查。（不再显示黑石塔：【待开放】）
- 骷髅士兵正式可见/战斗双硬守：GamePage visibleEnemies 窄条件（当前位置 black_stone_tower_floor1 + 第五主线 in_progress/stage 0 + wangcai_briefed===true + black_stone_tower_unlocked===true + floor1_soldier_defeated 非 true）与 App.handleEngage('skeleton_soldier') 同样完整重查（任何一项不满足拒绝进入 CombatPage，不依赖 UI）
- resolveCombatVictory('skeleton_soldier') 窄分支：黑石塔一层 + 第五主线 in_progress/stage 0 + briefed===true + unlocked===true + defeated undefined/false → 成功只写 quest.flags.floor1_soldier_defeated=true（status 保持 in_progress/stage 0；无金币/物品/装备/经验/关系奖励；不自动保存）；quest 不存在/非 in_progress/stage!=0/briefed 非 true/unlocked 非 true/defeated 已 true 或非 boolean → false 且 GameState 完全不变
- 清场剧情（GamePage）：黑石塔一层 + defeated → 「大厅深处的骷髅士兵已经被击败。/更深处传来沉重的骨骼碰撞声，一名身材高大的骷髅队长守在前方。/骷髅队长：【待开放】」（无按钮；骷髅队长本卡不进入战斗）
- 胜利后任务日志：已向王财了解情况。/黑石塔路线已确认。/黑石塔一层：已击败骷髅士兵。/当前目标：继续深入，处理骷髅队长。/骷髅队长：【待开放】
- 黄金兔子长期线冻结：in_progress/stage 0/四 flag 均 true/rabbit_path ×1/巢穴复查完成/具体目的地【待补充】
- schema 不变、SAVE_VERSION=1；npcs.ts/quests.ts/items.ts/professions.ts/CombatPage.tsx/types/storage/rules 零修改；git diff 仅 locations.ts + enemies.ts + content.test.ts + gameStore.ts + gameStore.test.ts + GamePage.tsx + App.tsx + qa/e2e.mjs + README
- content 测试：LOCATIONS toHaveLength(7) + 黑石塔一层注册表锁定（id/name/requiredFlag=black_stone_tower_unlocked/connections=[tianlong_city]/enemyIds=[skeleton_soldier]）+ tianlong_city.connections 精确 [tianlong_martial_hall, black_stone_tower_floor1] + 无 black_stone_tower_entrance/黑石塔外围 + ENEMIES toHaveLength(5) + 骷髅士兵完整锁定（level 3/tags undead/maxHp 14/defense 12/attackBonus 3/damage 3）+ 无 skeleton_captain + ITEMS/NPCS/QUESTS 数量不变
- Store 单测 30 项 A-AD（解锁 16 项 + 胜利 14 项）：A 无 gameState false/B 不在 tianlong_city false/C quest 不存在 false/D available/completable/completed false（it.each）/E stage!=0 false/F briefed undefined/false false/G briefed 非 boolean（"yes"/1/0.5）false 同一引用不变/H unlock undefined success true/I unlock false success true/J unlock true repeat false 同一引用/K unlock 非 boolean false 原值保留/L 成功只写 black_stone_tower_unlocked=true（player/inventory/equipment/quests/其他 world.flags 全不变）/M Wangcai QuestState 整体不变（解锁不塞 Quest）/N 解锁前 travelToLocation(floor1) false/O 解锁后 travelToLocation(floor1) true/P 不自动保存/Q wrong location resolveCombatVictory false/R quest 不存在 false/S available/completable/completed false/T stage!=0 false/U briefed 非 true（undefined/false/"yes"/1）false/V unlocked 非 true false/W 首次合法胜利 true+defeated=true/X explicit false 可成功/Y 已 true repeat false 同一引用/Z defeated 非 boolean（"yes"/1/0.5）false 同一引用不变/AA 成功后 status/stage 保持 in_progress/0/AB 无金币/物品/装备奖励（无骨头/骷髅碎片/黑石物品）/AC 黄金兔子 QuestState 整体深比较不变/AD 不自动保存
- 35 项 E2E（直接继续 P1-024 Save/Continue 后的天龙城档：A Continue 后第五主线进行中+briefed+可前往 [武馆 enabled, 黑石塔一层 disabled]+无返回青石村/B 黑石塔调查入口+正文+动身调查黑石塔点击→按钮消失+黑石塔一层 enabled+黑石塔路线已确认+当前目标：前往黑石塔一层调查+不再显示黑石塔：【待开放】/C 进入黑石塔一层→当前位置 black_stone_tower_floor1+地点黑石塔一层+一层可前往精确 [天龙城]/D 附近威胁骷髅士兵 Lv.3+迎战（Math.random 隔离 0.99 确定性击败）+战斗胜利返回冒险/E 大厅中的骷髅士兵已经被击败+骷髅队长踪迹剧情+骷髅队长：【待开放】+无附近威胁/迎战/F 商人王财的麻烦进行中+黑石塔一层：已击败骷髅士兵+当前目标：继续深入，处理骷髅队长+无可完成/提交任务/G 战斗前后 Lv/maxMP/gold/地图数精确不变/H 往返后再次进入仍无骷髅士兵+骷髅队长待开放剧情仍在/I Save/Continue 后当前位置 black_stone_tower_floor1+任务进行中+黑石塔路线已确认+黑石塔一层：已击败骷髅士兵+无骷髅士兵+骷髅队长：【待开放】+黄金主线进行中+兔子的路径 ×1；另更新 P1-023-F/P1-024-A/G 旧断言（P1-025 起天龙城可前往精确 [武馆, 黑石塔一层]；P1-024-G 原「无黑石塔」断言到期删除、保留无城外）+ 位置 id 提取正则 /^[a-z_]+$/→/^[a-z0-9_]+$/（black_stone_tower_floor1 含数字 1））

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
