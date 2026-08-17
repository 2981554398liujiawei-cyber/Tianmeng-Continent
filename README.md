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

## 当前已实现范围（TM-P0-001）

- 三页面导航：主菜单（新游戏 / 继续游戏）、游戏页面（角色状态展示 / 保存）、开发者控制台
- 核心游戏类型：`Character`、`Inventory`、`Equipment`、`QuestState`、`NPCState`、`WorldState`、`GameState`
- Zustand 统一 GameStore：`newGame / loadGame / saveGame / deleteGame`、`setCurrentLocation`、`addGold / removeGold`、`addItem / removeItem`、`setFlag`
- 默认新游戏状态：骑士「石头城」、初始金币 50、基础背包（铁剑 ×1、治疗药水 ×2）、初始地点（青石村）、空任务与空世界 Flag
- 版本化存档（`{ version, savedAt, gameState }`，localStorage）：损坏/非法存档安全回退，不导致白屏
- 开发者控制台：修改金币 / 背包 / Flag / 地点、存读删档的实时状态验证
- 深色东方奇幻风格的基础 UI

## 目录结构

```
src/
├─ app/          # 应用壳与页面导航
├─ components/   # 通用组件
├─ game/
│  ├─ state/     # Zustand 游戏状态 Store
│  ├─ rules/     # 游戏规则层（后续任务卡实现）
│  ├─ content/   # 游戏内容数据（物品 / 职业 / 初始状态）
│  ├─ types/     # 核心类型定义
│  └─ utils/     # 工具（localStorage 存档等）
├─ pages/        # 主菜单 / 游戏页面 / 开发者控制台
└─ styles/       # 全局样式（Tailwind v4 主题）
```

## 后续规划（V1 目标范围）

角色创建、D20 检定、场景节点探索、回合制战斗、技能与职业、装备与物品、背包、任务系统、NPC 与关系、商店与金币、世界状态、存档读档（已完成基线）、AI 接口预留。详见任务卡 TM-P0-001 §3。
