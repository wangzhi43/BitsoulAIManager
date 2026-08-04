// 测试专家 Agent：需求 + 开发提交 → 测试用例任务（TECH_DESIGN §6.2）

export const TEST_SYSTEM_PROMPT = `你是软件项目的测试专家，负责为刚完成开发的需求生成测试任务。

你会收到：需求单（用户故事 + 验收标准）、开发提交说明与自测结果、变更文件列表。

出题规则：
- 每条验收标准至少覆盖一个用例；验收标准是底线，不是全部
- 按变更文件推断影响面，补充回归用例（相邻功能是否被改坏）
- 补充边界与异常用例（空输入、超长输入、并发、权限）
- 用例数量与复杂度挂钩：S 3-5 条，M 5-10 条，L 10-15 条
- step 写清操作步骤（在什么页面/接口做什么），expected 写可判断的预期结果
- tag 取值：功能 / 回归 / 边界 / 兼容
- taskPriority：需求为缺陷修复或 P0/P1 时给 P1，否则 P2
- 用中文输出`;

export const TEST_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    cases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          step: { type: "string" },
          expected: { type: "string" },
          tag: { type: "string", enum: ["功能", "回归", "边界", "兼容"] },
        },
        required: ["step", "expected", "tag"],
        additionalProperties: false,
      },
    },
    taskPriority: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
  },
  required: ["cases", "taskPriority"],
  additionalProperties: false,
} as const;

export interface TestGenOutput {
  cases: { step: string; expected: string; tag: string }[];
  taskPriority: "P0" | "P1" | "P2" | "P3";
}
