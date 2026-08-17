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
