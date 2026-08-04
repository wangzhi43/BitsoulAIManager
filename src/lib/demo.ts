import { cookies } from "next/headers";

// 前端展示模式：开启后各页面渲染示例数据，用于验收前端视觉效果；
// 关闭后只显示真实数据。开关走 httpOnly cookie，见 /api/admin/demo。

export const DEMO_COOKIE = "bsam_demo";

export async function isDemoMode(): Promise<boolean> {
  const store = await cookies();
  return store.get(DEMO_COOKIE)?.value === "1";
}

const now = () => new Date();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000);

export const DEMO = {
  dashboard: {
    projects: [
      { id: "demo-p1", name: "BitSoulClaw", active: true },
      { id: "demo-p2", name: "bitsoulofficial", active: true },
      { id: "demo-p3", name: "minsheng-worklog-mp", active: true },
    ],
    counts: {
      "demo-p1": { pendingConfirm: 3, inProgress: 5, pendingAccept: 2, acceptedToday: 1 },
      "demo-p2": { pendingConfirm: 1, inProgress: 2, pendingAccept: 0, acceptedToday: 2 },
      "demo-p3": { pendingConfirm: 0, inProgress: 3, pendingAccept: 1, acceptedToday: 0 },
    } as Record<string, { pendingConfirm: number; inProgress: number; pendingAccept: number; acceptedToday: number }>,
    botLastSeen: hoursAgo(0.01).toISOString(),
    agentActive: 4,
    llmTokens7d: 1_284_500,
  },

  confirmItems: [
    {
      id: "demo-r1",
      seq: 101,
      title: "支持导出周报为 Word 文档",
      userStory: "作为项目负责人，我想把每周的进度报告一键导出为 Word 文档，以便直接转发给客户存档。",
      acceptance: ["报告页有「导出 Word」按钮", "导出文件包含本周完成/进行中/风险三部分", "文件名格式为 项目名-周报-日期.docx"],
      complexity: "M",
      projectId: "demo-p1",
      projectName: "BitSoulClaw",
      clarifications: [{ question: "导出的周报需要包含图表截图吗，还是纯文字即可？", answer: null }],
      source: { channel: "WECHAT", sender: "王总", customer: "民生理财" },
    },
    {
      id: "demo-r2",
      seq: 102,
      title: "登录页增加微信扫码登录",
      userStory: "作为客户，我想用微信扫码直接登录官网后台，以便不用记密码。",
      acceptance: ["登录页展示带参二维码", "扫码关注后自动登录并绑定账号", "二维码 5 分钟过期自动刷新"],
      complexity: "L",
      projectId: "demo-p2",
      projectName: "bitsoulofficial",
      clarifications: [],
      source: { channel: "WECHAT", sender: "李经理", customer: "比灵科技" },
    },
    {
      id: "demo-r3",
      seq: 103,
      title: "任务列表支持按截止日排序",
      userStory: "作为经办人员，我想按截止日期排序任务列表，以便优先处理快到期的事项。",
      acceptance: ["列表头部可切换排序方式", "默认按截止日升序", "已逾期任务标红置顶"],
      complexity: "S",
      projectId: null,
      projectName: null,
      clarifications: [{ question: "「逾期」以当天 24 点还是工作日 18 点为界？", answer: null }],
      source: { channel: "MANUAL", sender: "管理员", customer: null },
    },
  ],

  devPool: [
    { id: "demo-d1", seq: 96, title: "修复图片上传后预览旋转 90 度的问题", project: "BitSoulClaw", rank: 1, priority: "P0", locked: true, reason: "线上缺陷，客户已两次反馈，阻塞验收", status: "DEVELOPING", agent: "dev-agent-1", conflict: false, complexity: "S" },
    { id: "demo-d2", seq: 99, title: "官网首页新增客户案例轮播", project: "bitsoulofficial", rank: 2, priority: "P1", locked: false, reason: "市场部本周活动需要，价值高且工作量适中", status: "READY", agent: null, conflict: false, complexity: "M" },
    { id: "demo-d3", seq: 97, title: "小程序进展提交支持语音输入", project: "minsheng-worklog-mp", rank: 3, priority: "P1", locked: false, reason: "高频使用场景，显著降低录入成本", status: "DEVELOPING", agent: "dev-agent-2", conflict: true, complexity: "L" },
    { id: "demo-d4", seq: 100, title: "设置页增加深色模式开关", project: "BitSoulClaw", rank: 4, priority: "P2", locked: false, reason: "常规体验优化，不阻塞其他需求", status: "READY", agent: null, conflict: false, complexity: "S" },
  ],
  testPool: [
    { id: "demo-t1", seq: 95, title: "客户列表分页加载", project: "bitsoulofficial", priority: "P1", status: "CLAIMED", agent: "test-agent-1", caseCount: 8 },
    { id: "demo-t2", seq: 98, title: "工作日志按周汇总视图", project: "minsheng-worklog-mp", priority: "P2", status: "POOL", agent: null, caseCount: 6 },
  ],
  poolSummary: { pendingAccept: 3, reviewing: 1 },

  branches: [
    {
      id: "demo-b1", project: "BitSoulClaw", name: `daily/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
      mergedToMain: false, mergedAt: null as Date | null,
      requirements: [
        { id: "demo-br1", seq: 95, title: "客户列表分页加载", status: "PENDING_ACCEPT", conflict: false, submitNote: "按 20 条/页分页，滚动到底自动加载下一页", agent: "dev-agent-1", reports: [{ conclusion: "PASS", passRate: 1 }] },
        { id: "demo-br2", seq: 96, title: "修复图片上传后预览旋转 90 度的问题", status: "TESTING", conflict: false, submitNote: "按 EXIF 方向元数据在预览前做归一化", agent: "dev-agent-1", reports: [] },
        { id: "demo-br3", seq: 97, title: "小程序进展提交支持语音输入", status: "DEVELOPING", conflict: true, submitNote: "接入录音组件与转写接口", agent: "dev-agent-2", reports: [] },
      ],
    },
    {
      id: "demo-b2", project: "bitsoulofficial", name: `daily/${daysAgo(1).toISOString().slice(0, 10).replace(/-/g, "")}`,
      mergedToMain: true, mergedAt: hoursAgo(14),
      requirements: [
        { id: "demo-br4", seq: 93, title: "官网 SEO 元信息完善", status: "ACCEPTED", conflict: false, submitNote: "补齐 og 标签与 sitemap", agent: "dev-agent-3", reports: [{ conclusion: "PASS", passRate: 1 }] },
      ],
    },
  ],

  agents: [
    { id: "demo-a1", username: "dev-agent-1", role: "DEVELOPER", enabled: true, lastSeenAt: hoursAgo(0.2), devCount: 23, testCount: 0, current: ["开发中：REQ-96 修复图片上传后预览旋转 90 度的问题"] },
    { id: "demo-a2", username: "dev-agent-2", role: "DEVELOPER", enabled: true, lastSeenAt: hoursAgo(1.5), devCount: 17, testCount: 0, current: ["开发中：REQ-97 小程序进展提交支持语音输入"] },
    { id: "demo-a3", username: "test-agent-1", role: "TESTER", enabled: true, lastSeenAt: hoursAgo(0.5), devCount: 0, testCount: 31, current: ["测试中：REQ-95 客户列表分页加载"] },
    { id: "demo-a4", username: "claw-both-1", role: "BOTH", enabled: false, lastSeenAt: daysAgo(3), devCount: 5, testCount: 8, current: [] },
  ],
  usage7d: [
    { role: "PRODUCT", input: 462_300, output: 88_100 },
    { role: "PM", input: 210_400, output: 35_600 },
    { role: "TEST", input: 388_900, output: 99_200 },
  ],

  reports: [
    {
      id: "demo-rep1", project: "BitSoulClaw", date: now(),
      content: {
        done: ["REQ-95 客户列表分页加载（测试通过，待验收）", "REQ-94 导出按钮权限修复（已验收）"],
        inProgress: ["REQ-96 图片预览旋转修复（开发中，dev-agent-1）", "REQ-97 语音输入（合并冲突待处理）"],
        blocked: ["REQ-97 与主干 audio 模块冲突，需管理员介入"],
        forecast: "明日预计完成 REQ-96 并进入测试；REQ-97 视冲突解决进度。",
        risks: ["语音转写依赖的第三方配额本月剩余 12%"],
      },
    },
    {
      id: "demo-rep2", project: "minsheng-worklog-mp", date: daysAgo(1),
      content: {
        done: ["REQ-90 周汇总视图（已验收）"],
        inProgress: ["REQ-98 按截止日排序"],
        blocked: [],
        forecast: "本周可完成排序与逾期标红两项。",
        risks: [],
      },
    },
  ],

  inbox: {
    pendingConvs: [{ convId: "wxid_demo_88", convName: "王总（民生理财）", count: 3, lastTs: hoursAgo(0.3) }],
    sources: [
      { id: "demo-s1", channel: "WECHAT", who: "民生理财 · 王总", createdAt: hoursAgo(2), requirements: [{ seq: 101, title: "支持导出周报为 Word 文档", status: "PENDING_CONFIRM" }] },
      { id: "demo-s2", channel: "MANUAL", who: "管理员", createdAt: daysAgo(1), requirements: [{ seq: 103, title: "任务列表支持按截止日排序", status: "PENDING_CONFIRM" }, { seq: 99, title: "官网首页新增客户案例轮播", status: "READY" }] },
    ],
  },
};
