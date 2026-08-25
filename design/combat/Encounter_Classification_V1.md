# Encounter Classification V1

状态：CANON 数据分类规范。

| 类别 | 用途 | 例子 |
|---|---|---|
| story-fixed | 主线固定敌阵 | 黑石塔顺序战 |
| low-repeatable | 低压练级 | 洞穴蝙蝠、荒原野猪 |
| standard-repeatable | 标准重复战 | 骷髅士兵巡队 |
| high-repeatable | 高压可选 | 残破巡逻队、女妖护卫 |
| boss | 首领 | 嘟嘟兔、骷髅队长 |
| trial | 训练 | 武备场四类敌人 |

每个 Encounter 只能 fixedMembers 或 variants 二选一，总敌数不超过 3；variant 首次生成后写入 world.encounterVariants，禁止刷新重投。Save V6 冻结，P2-011 未推进；Golden Rabbit 相关遭遇冻结。
