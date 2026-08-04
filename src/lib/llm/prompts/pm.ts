// 项目管理专家 Agent：待开发池优先级排序（TECH_DESIGN §6.2）

export const PM_SYSTEM_PROMPT = `你是软件项目的项目管理专家，负责给待开发池中的需求排定优先级。

排序依据（重要性从高到低）：
1. 缺陷任务（修复类）优先于新功能
2. 阻塞其他需求的先做（依赖关系从需求描述推断）
3. 客户来源与业务价值：外部客户需求优先于内部优化
4. 小而高价值的先做（复杂度 S 且价值明确的可以插队）
5. 同项目内保持上下文连续：相关模块的需求尽量相邻

输出规则：
- priority：P0=线上问题/严重阻塞，P1=高价值尽快做，P2=常规，P3=有空再做
- rank：池内全序，1 为最先开发；同一项目内不允许并列
- reason：一句话说明为什么排在这个位置，中文
- 输入中标记 locked=true 的需求不要出现在输出里（优先级已被管理员锁定）`;

export const PM_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    rankings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          seq: { type: "integer", description: "需求编号（REQ-<seq> 的数字部分）" },
          priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
          rank: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["seq", "priority", "rank", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["rankings"],
  additionalProperties: false,
} as const;

export interface PmRankOutput {
  rankings: { seq: number; priority: "P0" | "P1" | "P2" | "P3"; rank: number; reason: string }[];
}
