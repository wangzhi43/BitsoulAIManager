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

export const DEMO_STATS = {
  kpis: {
    pendingConfirm: 4, inProgress: 10, pendingAccept: 3, acceptedToday: 3,
    spark: { created: [2, 4, 3, 6, 5, 7, 4], accepted: [1, 2, 2, 4, 3, 5, 3] },
  },
  trend14d: {
    labels: Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.now() - (13 - i) * 86400_000);
      return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }),
    created: [1, 3, 2, 4, 3, 5, 4, 2, 4, 3, 6, 5, 7, 4],
    accepted: [0, 1, 2, 2, 3, 3, 2, 1, 2, 2, 4, 3, 5, 3],
  },
  statusDist: [
    { name: "待确认", value: 4 },
    { name: "待开发", value: 5 },
    { name: "开发中", value: 3 },
    { name: "测试中", value: 2 },
    { name: "待验收", value: 3 },
  ],
  projects: [
    { id: "demo-p1", name: "BitSoulClaw", active: true, pendingConfirm: 3, developing: 4, testing: 1, pendingAccept: 2, conflicts: 1 },
    { id: "demo-p2", name: "bitsoulofficial", active: true, pendingConfirm: 1, developing: 2, testing: 0, pendingAccept: 0, conflicts: 0 },
    { id: "demo-p3", name: "minsheng-worklog-mp", active: true, pendingConfirm: 0, developing: 2, testing: 1, pendingAccept: 1, conflicts: 0 },
  ],
  agentRank: [
    { label: "test-agent-1", value: 31, hint: "测试" },
    { label: "dev-agent-1", value: 23, hint: "开发" },
    { label: "dev-agent-2", value: 17, hint: "开发" },
    { label: "claw-both-1", value: 13, hint: "全能" },
  ],
  llm7d: {
    byDay: [
      { label: "29", value: 142000 }, { label: "30", value: 188000 }, { label: "31", value: 96000 },
      { label: "01", value: 231000 }, { label: "02", value: 175000 }, { label: "03", value: 264000 }, { label: "04", value: 189000 },
    ],
    byRole: [
      { name: "产品专家", value: 550400 },
      { name: "测试专家", value: 488100 },
      { name: "项管专家", value: 246000 },
    ],
  },
  recentEvents: [
    { seq: 95, title: "客户列表分页加载", note: "测试全部通过（8/8），自动审核通过", actor: "system", at: hoursAgo(0.4) },
    { seq: 96, title: "修复图片上传后预览旋转", note: "开发提交：按 EXIF 方向归一化", actor: "agent:dev-agent-1", at: hoursAgo(1.1) },
    { seq: 101, title: "支持导出周报为 Word", note: "自动拆解", actor: "expert:PRODUCT", at: hoursAgo(2) },
    { seq: 97, title: "语音输入", note: "合并冲突，需人工处理：audio/recorder.ts", actor: "system", at: hoursAgo(3.5) },
    { seq: 94, title: "导出按钮权限修复", note: "验收通过", actor: "admin", at: hoursAgo(5) },
    { seq: 99, title: "官网首页客户案例轮播", note: "确认进入待开发池", actor: "admin", at: hoursAgo(6) },
  ],
  botLastSeen: hoursAgo(0.01).toISOString(),
  agentActive: 4,
  quality: { avgLeadHours: 26.4, avgDevHours: 9.8, reworkRate: 12, samples: 17 },
  usageAlert: null,
};

export const DEMO_REQ_LIST = [
  { id: "demo-r1", seq: 101, title: "支持导出周报为 Word 文档", project: "BitSoulClaw", status: "PENDING_CONFIRM", priority: null, complexity: "M", customer: "民生理财", updatedAt: hoursAgo(2) },
  { id: "demo-r2", seq: 102, title: "登录页增加微信扫码登录", project: "bitsoulofficial", status: "PENDING_CONFIRM", priority: null, complexity: "L", customer: "比灵科技", updatedAt: hoursAgo(2) },
  { id: "demo-d1", seq: 96, title: "修复图片上传后预览旋转 90 度的问题", project: "BitSoulClaw", status: "DEVELOPING", priority: "P0", complexity: "S", customer: "民生理财", updatedAt: hoursAgo(1) },
  { id: "demo-d2", seq: 99, title: "官网首页新增客户案例轮播", project: "bitsoulofficial", status: "READY", priority: "P1", complexity: "M", customer: null, updatedAt: hoursAgo(6) },
  { id: "demo-t1", seq: 95, title: "客户列表分页加载", project: "bitsoulofficial", status: "PENDING_ACCEPT", priority: "P1", complexity: "M", customer: "比灵科技", updatedAt: hoursAgo(0.5) },
  { id: "demo-x1", seq: 94, title: "导出按钮权限修复", project: "BitSoulClaw", status: "ACCEPTED", priority: "P1", complexity: "S", customer: "民生理财", updatedAt: hoursAgo(5) },
  { id: "demo-x2", seq: 93, title: "官网 SEO 元信息完善", project: "bitsoulofficial", status: "ACCEPTED", priority: "P2", complexity: "S", customer: null, updatedAt: daysAgo(1) },
];

export const DEMO_REQ_DETAIL = {
  id: "demo-t1",
  seq: 95,
  title: "客户列表分页加载",
  status: "PENDING_ACCEPT",
  priority: "P1",
  complexity: "M",
  project: "bitsoulofficial",
  userStory: "作为运营人员，我想让客户列表分页加载，以便在客户量大时页面不卡顿。",
  acceptance: ["每页 20 条，滚动到底自动加载", "加载中有骨架屏提示", "总数展示在列表头部"],
  clarifications: [],
  featureBranch: "feature/REQ-95",
  dailyBranch: "daily/20260804",
  customer: "比灵科技 · 李经理（微信）",
  submitNote: "按 20 条/页分页，滚动到底自动加载下一页",
  agent: "dev-agent-1",
  report: { conclusion: "PASS", passRate: 1, cases: 8 },
  events: [
    { at: hoursAgo(26), actor: "expert:PRODUCT", note: "自动拆解", to: "PENDING_CONFIRM" },
    { at: hoursAgo(24), actor: "admin", note: "确认进入待开发池", to: "READY" },
    { at: hoursAgo(20), actor: "agent:dev-agent-1", note: "认领开发", to: "DEVELOPING" },
    { at: hoursAgo(6), actor: "system", note: "已合并到当日分支；变更：4 个文件", to: "PENDING_TEST" },
    { at: hoursAgo(3), actor: "agent:test-agent-1", note: "认领测试", to: "TESTING" },
    { at: hoursAgo(0.5), actor: "system", note: "测试全部通过（8/8），自动审核通过", to: "PENDING_ACCEPT" },
  ],
};

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
