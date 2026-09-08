// 本地验证数据（仅非生产环境）：各状态需求样例、Agent、分支、报告、用量、日报。
// 幂等：以「[样例] 」标题前缀 / dev-seed- 线索前缀 / 固定账号名为标记，重跑先清理再重建。
// 用法：npm run seed:dev（需先 npm run seed 建管理员）

import { PrismaClient, type Priority, type ReqStatus, type TaskStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { encryptSecret } from "../src/lib/crypto";
import type { BranchSummary } from "../src/lib/branch-summary";

const prisma = new PrismaClient();
const MARK = "[样例] ";
const THREAD_PREFIX = "dev-seed-";
const AGENTS = ["dev-agent-1", "dev-agent-2", "test-agent-1"];

const h = (n: number) => new Date(Date.now() - n * 3600_000);
const d = (n: number) => new Date(Date.now() - n * 86400_000);
const dayStart = (n: number) => {
  const x = d(n);
  x.setHours(0, 0, 0, 0);
  return x;
};
const dailyName = (n: number) => {
  const x = d(n);
  return `daily/${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}`;
};

async function cleanup() {
  // 标题带标记的样例单 + 挂在样例线索下的派生单（如冒烟测试拆分出的新单）一并清理
  const old = await prisma.requirement.findMany({ where: { OR: [{ title: { startsWith: MARK } }, { source: { threadId: { startsWith: THREAD_PREFIX } } }] }, select: { id: true } });
  if (old.length) await prisma.requirement.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
  await prisma.requirementSource.deleteMany({ where: { threadId: { startsWith: THREAD_PREFIX } } });
  await prisma.inboxMessage.deleteMany({ where: { msgId: { startsWith: THREAD_PREFIX } } });
  // 只清理本脚本生成的分支摘要（基线 commit 固定为 a1b2c3d），不碰真实分支
  await prisma.dailyBranch.deleteMany({ where: { requirements: { none: {} }, reviewSummary: { path: ["baseCommit"], equals: "a1b2c3d" } } }).catch(() => {});
  await prisma.wechatBinding.deleteMany({ where: { convId: { startsWith: "wxid_seed_" } } });
  await prisma.llmUsageLog.deleteMany({ where: { providerName: "deepseek-dev" } });
  await prisma.dailyReport.deleteMany({ where: { content: { path: ["seed"], equals: true } } });
  await prisma.auditLog.deleteMany({ where: { detail: { startsWith: MARK } } });
  await prisma.buildRun.deleteMany({ where: { requestedBy: "admin:seed" } });
}

interface ReqSpec {
  title: string;
  story: string;
  acceptance: string[];
  complexity: "S" | "M" | "L";
  status: ReqStatus;
  project: number; // 项目索引
  priority?: Priority;
  reason?: string;
  locked?: boolean;
  rank?: number;
  channel?: "WECHAT" | "MANUAL" | "WEB_FORM";
  customer?: string;
  sender?: string;
  clarifications?: { question: string; answer: string | null }[];
  dev?: { status: TaskStatus; agent?: string; heartbeatMin?: number; note?: string; commits?: string[] };
  test?: { status: TaskStatus; agent?: string; report?: { conclusion: "PASS" | "FAIL"; passRate: number } };
  ageDays: number;
  defectOf?: number; // 缺陷指向的 spec 索引
}

const SPECS: ReqSpec[] = [
  { title: "支持导出周报为 Word 文档", story: "作为项目负责人，我想把每周的进度报告一键导出为 Word 文档，以便直接转发给客户存档。", acceptance: ["报告页有「导出 Word」按钮", "导出文件包含本周完成/进行中/风险三部分", "文件名格式为 项目名-周报-日期.docx"], complexity: "M", status: "PENDING_CONFIRM", project: 0, channel: "WECHAT", customer: "民生理财", sender: "王总", clarifications: [{ question: "导出的周报需要包含图表截图吗，还是纯文字即可？", answer: null }], ageDays: 0.1 },
  { title: "登录页增加微信扫码登录", story: "作为客户，我想用微信扫码直接登录官网后台，以便不用记密码。", acceptance: ["登录页展示带参二维码", "扫码关注后自动登录并绑定账号", "二维码 5 分钟过期自动刷新"], complexity: "L", status: "PENDING_CONFIRM", project: 1, channel: "WECHAT", customer: "比灵科技", sender: "李经理", ageDays: 0.2 },
  { title: "任务列表支持按截止日排序", story: "作为经办人员，我想按截止日期排序任务列表，以便优先处理快到期的事项。", acceptance: ["列表头部可切换排序方式", "默认按截止日升序", "已逾期任务标红置顶"], complexity: "S", status: "PENDING_CONFIRM", project: -1, channel: "MANUAL", clarifications: [{ question: "「逾期」以当天 24 点还是工作日 18 点为界？", answer: null }, { question: "是否需要记住用户上次选择的排序方式？", answer: "需要，按账号记住" }], ageDays: 1 },
  { title: "官网增加客户案例页", story: "作为访客，我想看到官网的客户案例，以便了解产品在真实场景的效果。", acceptance: ["导航新增「客户案例」", "案例卡片含客户名、行业、一句话成果", "移动端两列自适应"], complexity: "M", status: "PENDING_CONFIRM", project: 1, channel: "WEB_FORM", customer: "市场部", sender: "小陈", ageDays: 0.5 },
  { title: "官网首页新增客户案例轮播", story: "作为市场人员，我想在首页展示客户案例轮播，以便本周活动引流。", acceptance: ["首页首屏下方轮播 3-5 个案例", "自动播放 5 秒切换", "点击进入案例详情"], complexity: "M", status: "READY", project: 1, priority: "P1", reason: "市场部本周活动需要，价值高且工作量适中", rank: 1, channel: "MANUAL", dev: { status: "POOL" }, ageDays: 2 },
  { title: "设置页增加深色模式开关", story: "作为用户，我想切换深色模式，以便夜间使用不刺眼。", acceptance: ["设置页有开关", "切换即时生效并持久化", "所有页面配色适配"], complexity: "S", status: "READY", project: 0, priority: "P2", reason: "常规体验优化，不阻塞其他需求", rank: 2, channel: "WECHAT", customer: "民生理财", sender: "王总", dev: { status: "POOL" }, ageDays: 3 },
  { title: "工作日志支持附件上传", story: "作为员工，我想在日志里上传截图，以便说明工作成果。", acceptance: ["支持图片与 PDF", "单个文件 ≤ 10MB", "列表展示缩略图"], complexity: "M", status: "READY", project: 2, priority: "P2", reason: "高频诉求但有替代方案", rank: 3, locked: true, channel: "WECHAT", customer: "民生理财", sender: "张主管", dev: { status: "POOL" }, ageDays: 4 },
  { title: "修复图片上传后预览旋转 90 度的问题", story: "作为用户，我希望上传的手机照片预览方向正确，以便不用手动旋转。", acceptance: ["按 EXIF 方向归一化", "iOS/Android 拍摄的图片均正确", "旧图片不受影响"], complexity: "S", status: "DEVELOPING", project: 0, priority: "P0", reason: "线上缺陷，客户已两次反馈，阻塞验收", rank: 1, locked: true, channel: "WECHAT", customer: "民生理财", sender: "王总", dev: { status: "CLAIMED", agent: "dev-agent-1", heartbeatMin: 2 }, ageDays: 1.5 },
  { title: "小程序进展提交支持语音输入", story: "作为经办人员，我想用语音录入进展，以便在外出时快速填写。", acceptance: ["录音按钮长按录音", "转写文本可编辑", "60 秒上限"], complexity: "L", status: "DEVELOPING", project: 2, priority: "P1", reason: "高频使用场景，显著降低录入成本", rank: 2, channel: "WECHAT", customer: "民生理财", sender: "张主管", dev: { status: "CONFLICT", agent: "dev-agent-2", heartbeatMin: 300, note: "接入录音组件与转写接口", commits: ["4f2e1a9c0b7d", "9a8b7c6d5e4f"] }, ageDays: 3 },
  { title: "工作日志按周汇总视图", story: "作为主管，我想按周查看团队日志汇总，以便周会复盘。", acceptance: ["周视图按人分组", "可导出 CSV", "支持切换周"], complexity: "M", status: "PENDING_TEST", project: 2, priority: "P2", reason: "管理侧高价值", rank: 3, channel: "MANUAL", dev: { status: "MERGED", agent: "dev-agent-2", note: "新增 /weekly 页面与导出接口", commits: ["c1d2e3f4a5b6"] }, test: { status: "POOL" }, ageDays: 2 },
  { title: "客户列表分页加载", story: "作为运营人员，我想让客户列表分页加载，以便在客户量大时页面不卡顿。", acceptance: ["每页 20 条，滚动到底自动加载", "加载中有骨架屏提示", "总数展示在列表头部"], complexity: "M", status: "TESTING", project: 1, priority: "P1", reason: "客户高频反馈，工作量适中", rank: 1, channel: "WECHAT", customer: "比灵科技", sender: "李经理", dev: { status: "MERGED", agent: "dev-agent-1", note: "按 20 条/页分页，滚动到底自动加载下一页", commits: ["e7f3a9b1c2d3", "0a1b2c3d4e5f"] }, test: { status: "CLAIMED", agent: "test-agent-1" }, ageDays: 2 },
  { title: "消息中心未读计数修复", story: "作为用户，我希望未读数在多端同步，以便不漏看消息。", acceptance: ["读后 3 秒内其它端归零", "离线消息计入", "刷新后一致"], complexity: "S", status: "REVIEWING", project: 0, priority: "P1", reason: "缺陷修复", rank: 2, channel: "WECHAT", customer: "民生理财", sender: "王总", dev: { status: "MERGED", agent: "dev-agent-2", note: "改用服务端已读游标", commits: ["7e8f9a0b1c2d"] }, test: { status: "DONE", agent: "test-agent-1", report: { conclusion: "PASS", passRate: 0.75 } }, ageDays: 2.5 },
  { title: "导出按钮权限修复", story: "作为管理员，我希望只有有权限的角色看到导出按钮，以便控制数据外泄。", acceptance: ["无权限角色不显示按钮", "直接调接口返回 403", "审计记录导出操作"], complexity: "S", status: "PENDING_ACCEPT", project: 0, priority: "P1", reason: "安全相关", rank: 3, channel: "MANUAL", dev: { status: "MERGED", agent: "dev-agent-1", note: "按角色隐藏并在接口层校验", commits: ["3b2a7c1d9e8f"] }, test: { status: "DONE", agent: "test-agent-1", report: { conclusion: "PASS", passRate: 1 } }, ageDays: 3 },
  { title: "官网 SEO 元信息完善", story: "作为运营，我想补齐各页面的 SEO 元信息，以便搜索引擎收录。", acceptance: ["每页有 title/description", "og 标签完整", "sitemap 自动生成"], complexity: "S", status: "PENDING_ACCEPT", project: 1, priority: "P2", reason: "常规优化", rank: 4, channel: "MANUAL", dev: { status: "MERGED", agent: "dev-agent-1", note: "补齐 og 标签与 sitemap", commits: ["a9b8c7d6e5f4"] }, test: { status: "DONE", agent: "test-agent-1", report: { conclusion: "PASS", passRate: 1 } }, ageDays: 3 },
  { title: "登录失败限流", story: "作为管理员，我希望登录接口有限流，以便防止暴力破解。", acceptance: ["同账号 1 分钟 5 次", "超限返回 429", "日志记录"], complexity: "S", status: "ACCEPTED", project: 0, priority: "P1", channel: "MANUAL", dev: { status: "MERGED", agent: "dev-agent-2", note: "内存计数限流", commits: ["1a2b3c4d5e6f"] }, test: { status: "DONE", agent: "test-agent-1", report: { conclusion: "PASS", passRate: 1 } }, ageDays: 6 },
  { title: "日志列表按人筛选", story: "作为主管，我想按人筛选日志，以便快速查看某人的工作。", acceptance: ["筛选器含全部成员", "筛选结果可分页", "URL 可分享"], complexity: "S", status: "ACCEPTED", project: 2, priority: "P2", channel: "WECHAT", customer: "民生理财", sender: "张主管", dev: { status: "MERGED", agent: "dev-agent-1", note: "增加 ?user= 参数", commits: ["b2c3d4e5f6a7"] }, test: { status: "DONE", agent: "test-agent-1", report: { conclusion: "PASS", passRate: 1 } }, ageDays: 9 },
  { title: "官网联系表单接入企业微信通知", story: "作为销售，我想在有人提交联系表单时收到通知，以便及时跟进。", acceptance: ["提交后 1 分钟内通知", "含姓名电话与留言", "失败重试 3 次"], complexity: "M", status: "ACCEPTED", project: 1, priority: "P1", channel: "MANUAL", dev: { status: "MERGED", agent: "dev-agent-2", note: "webhook 推送", commits: ["c3d4e5f6a7b8"] }, test: { status: "DONE", agent: "test-agent-1", report: { conclusion: "PASS", passRate: 1 } }, ageDays: 12 },
  { title: "重复需求：客户列表导出", story: "与 REQ 客户列表分页重复。", acceptance: ["无"], complexity: "S", status: "CLOSED", project: 1, channel: "MANUAL", ageDays: 5 },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("seed-dev refuses to run in production");
    process.exit(1);
  }
  await cleanup();

  // 项目
  const names = ["BitSoulClaw", "bitsoulofficial", "minsheng-worklog-mp"];
  const repos = ["git@github.com:wangzhi43/BitSoulClaw.git", "git@github.com:wangzhi43/bitsoulofficial.git", "git@github.com:wangzhi43/minsheng-worklog-mp.git"];
  const descs = ["Electron 桌面 AI 客户端（OpenClaw 网关）", "BitSoul 官网（Python 后端 + 前端）", "民生工作日志微信小程序"];
  const projects = [];
  for (let i = 0; i < names.length; i++) {
    projects.push(await prisma.project.upsert({ where: { name: names[i] }, update: { active: true }, create: { name: names[i], repoUrl: repos[i], description: descs[i], active: true } }));
  }

  // Agent
  const pw = await bcrypt.hash("agent12345", 10);
  const agentMap = new Map<string, string>();
  for (const u of AGENTS) {
    const a = await prisma.agentAccount.upsert({
      where: { username: u },
      update: { enabled: true, lastSeenAt: u === "dev-agent-2" ? h(5) : h(0.05), gitTokenEnc: u === "dev-agent-1" ? encryptSecret("github_pat_seed_placeholder_token_000000") : null },
      create: { username: u, passwordHash: pw, role: u.startsWith("test") ? "TESTER" : "DEVELOPER", projectIds: projects.map((p) => p.id), lastSeenAt: h(0.05), gitTokenEnc: u === "dev-agent-1" ? encryptSecret("github_pat_seed_placeholder_token_000000") : null },
    });
    agentMap.set(u, a.id);
  }

  // LLM 供应商 + 角色模型（仅当没有时）
  if ((await prisma.llmProvider.count()) === 0) {
    const p = await prisma.llmProvider.create({ data: { name: "deepseek-dev", kind: "OPENAI_COMPAT", baseUrl: "https://api.deepseek.com", apiKeyEnc: encryptSecret("sk-dev-placeholder-key"), models: ["deepseek-v4-flash", "deepseek-v4-pro"] } });
    for (const role of ["PRODUCT", "PM", "TEST"] as const) {
      await prisma.agentRoleModelConfig.upsert({ where: { role }, update: {}, create: { role, providerId: p.id, model: role === "PM" ? "deepseek-v4-flash" : "deepseek-v4-pro" } });
    }
  }

  // 微信绑定 + 心跳 + 待聚合消息
  await prisma.wechatBinding.create({ data: { convId: "wxid_seed_wang", convName: "王总（民生理财）", projectId: projects[0].id, customerName: "民生理财", paused: false, pushDailyReport: true } });
  await prisma.wechatBinding.create({ data: { convId: "wxid_seed_new", convName: "新客户咨询", paused: true } });
  await prisma.systemConfig.upsert({ where: { key: "wechatBotLastSeen" }, update: { value: new Date().toISOString() }, create: { key: "wechatBotLastSeen", value: new Date().toISOString() } });
  await prisma.inboxMessage.createMany({
    data: [
      { msgId: `${THREAD_PREFIX}m1`, convId: "wxid_seed_wang", convName: "王总（民生理财）", senderName: "王总", msgType: "text", text: "周报能不能加个按部门统计的视图？", ts: h(0.2) },
      { msgId: `${THREAD_PREFIX}m2`, convId: "wxid_seed_wang", convName: "王总（民生理财）", senderName: "王总", msgType: "text", text: "最好能看到每个部门的使用时长。", ts: h(0.15) },
    ],
  });

  // 每日分支（今天 + 昨天，昨天已合并）
  const branches = new Map<string, { today: string; yesterday: string }>();
  for (const p of projects) {
    const y = await prisma.dailyBranch.upsert({ where: { projectId_name: { projectId: p.id, name: dailyName(1) } }, update: { mergedToMain: true, mergedAt: h(14) }, create: { projectId: p.id, name: dailyName(1), date: dayStart(1), mergedToMain: true, mergedAt: h(14) } });
    const t = await prisma.dailyBranch.upsert({ where: { projectId_name: { projectId: p.id, name: dailyName(0) } }, update: {}, create: { projectId: p.id, name: dailyName(0), date: dayStart(0), createdAt: h(8) } });
    branches.set(p.id, { today: t.id, yesterday: y.id });
  }

  // 需求
  const created: { id: string; seq: number; spec: ReqSpec; projectId: string | null }[] = [];
  for (const spec of SPECS) {
    const projectId = spec.project >= 0 ? projects[spec.project].id : null;
    const channel = spec.channel ?? "MANUAL";
    const rawText = spec.story.replace(/^作为.*?，我(想|希望)/, "我们希望");
    const source = await prisma.requirementSource.create({
      data: {
        channel,
        wechatConvId: channel === "WECHAT" ? "wxid_seed_wang" : null,
        senderName: spec.sender ?? (channel === "MANUAL" ? "管理员" : null),
        customerName: spec.customer ?? null,
        threadId: `${THREAD_PREFIX}${Math.random().toString(36).slice(2, 10)}`,
        rawMessages: [
          { msgId: "s1", type: "text", text: rawText, ts: d(spec.ageDays + 0.05).toISOString(), sender: spec.sender },
          ...(channel === "WECHAT" ? [{ msgId: "s2", type: "text", text: "麻烦尽快安排，谢谢。", ts: d(spec.ageDays + 0.04).toISOString(), sender: spec.sender }] : []),
        ],
        createdAt: d(spec.ageDays + 0.05),
      },
    });
    const inFlow = ["DEVELOPING", "PENDING_TEST", "TESTING", "REVIEWING", "PENDING_ACCEPT", "ACCEPTED"].includes(spec.status);
    const useYesterday = spec.status === "ACCEPTED" && spec.ageDays > 4;
    const r = await prisma.requirement.create({
      data: {
        title: MARK + spec.title,
        userStory: spec.story,
        acceptance: spec.acceptance,
        complexity: spec.complexity,
        status: spec.status,
        projectId,
        sourceId: source.id,
        priority: spec.priority ?? null,
        priorityReason: spec.reason ?? null,
        priorityLocked: spec.locked ?? false,
        poolRank: spec.rank ?? null,
        clarifications: spec.clarifications ?? undefined,
        moduleGuess: spec.project === 1 ? "官网前端" : spec.project === 2 ? "小程序" : spec.project === 0 ? "桌面端" : null,
        featureBranch: null,
        dailyBranchId: inFlow && projectId ? (useYesterday ? branches.get(projectId)!.yesterday : branches.get(projectId)!.today) : null,
        createdAt: d(spec.ageDays),
        updatedAt: h(Math.random() * 6),
      },
    });
    if (inFlow) await prisma.requirement.update({ where: { id: r.id }, data: { featureBranch: `feature/REQ-${r.seq}` } });
    created.push({ id: r.id, seq: r.seq, spec, projectId });

    // 流转记录
    const ev: { from: string | null; to: string; actor: string; note: string; at: Date }[] = [{ from: null, to: "PENDING_CONFIRM", actor: "expert:PRODUCT", note: "自动拆解", at: d(spec.ageDays) }];
    const steps: Record<string, number> = { READY: 1, DEVELOPING: 2, PENDING_TEST: 3, TESTING: 4, REVIEWING: 5, PENDING_ACCEPT: 5, ACCEPTED: 6, CLOSED: 1 };
    const n = steps[spec.status] ?? 0;
    const base = d(spec.ageDays);
    const at = (k: number) => new Date(base.getTime() + k * 3600_000 * Math.max(1, spec.ageDays * 3));
    if (spec.status === "CLOSED") ev.push({ from: "PENDING_CONFIRM", to: "CLOSED", actor: "admin:seed", note: "驳回：与其它需求重复", at: at(1) });
    if (n >= 1 && spec.status !== "CLOSED") ev.push({ from: "PENDING_CONFIRM", to: "READY", actor: "admin:seed", note: "确认进入待开发池", at: at(1) });
    if (n >= 1 && spec.priority && spec.status !== "CLOSED") ev.push({ from: "READY", to: "READY", actor: "expert:PM", note: `优先级 ${spec.priority}：${spec.reason ?? "自动排序"}`, at: at(1.2) });
    if (n >= 2) ev.push({ from: "READY", to: "DEVELOPING", actor: `agent:${spec.dev?.agent ?? "dev-agent-1"}`, note: "认领开发", at: at(2) });
    if (spec.dev?.status === "CONFLICT") ev.push({ from: "DEVELOPING", to: "DEVELOPING", actor: "system", note: "合并冲突，需人工处理：audio/recorder.ts, package.json", at: at(3) });
    if (n >= 3) ev.push({ from: "DEVELOPING", to: "PENDING_TEST", actor: "system", note: "已合并到当日分支；变更：4 个文件", at: at(3) });
    if (n >= 3) ev.push({ from: "PENDING_TEST", to: "PENDING_TEST", actor: "expert:TEST", note: "生成测试任务：6 条用例", at: at(3.1) });
    if (n >= 4) ev.push({ from: "PENDING_TEST", to: "TESTING", actor: "agent:test-agent-1", note: "认领测试", at: at(4) });
    if (spec.status === "REVIEWING") ev.push({ from: "TESTING", to: "REVIEWING", actor: "system", note: "部分通过（6/8），待管理员裁决", at: at(5) });
    if (n >= 5 && spec.status !== "REVIEWING") ev.push({ from: "TESTING", to: "PENDING_ACCEPT", actor: "system", note: "测试全部通过（6/6），自动审核通过", at: at(5) });
    if (n >= 6) ev.push({ from: "PENDING_ACCEPT", to: "ACCEPTED", actor: "admin:seed", note: "验收通过", at: at(6) });
    await prisma.reqEvent.createMany({ data: ev.map((e) => ({ requirementId: r.id, fromStatus: e.from, toStatus: e.to, actor: e.actor, note: e.note, createdAt: e.at })) });

    // 任务
    if (spec.dev) {
      await prisma.devTask.create({
        data: {
          requirementId: r.id,
          status: spec.dev.status,
          claimedById: spec.dev.agent ? agentMap.get(spec.dev.agent) : null,
          claimedAt: spec.dev.agent ? at(2) : null,
          lastHeartbeat: spec.dev.heartbeatMin != null ? new Date(Date.now() - spec.dev.heartbeatMin * 60_000) : spec.dev.agent ? at(3) : null,
          submittedAt: spec.dev.note ? at(3) : null,
          submitNote: spec.dev.note ?? null,
          selfTest: spec.dev.note ? spec.acceptance.map((a, i) => `${i + 1}. ${a}：通过`).join("\n") : null,
          commits: spec.dev.commits ?? undefined,
        },
      });
    }
    if (spec.test) {
      const cases = spec.acceptance.flatMap((a, i) => [
        { step: `验证：${a}`, expected: "符合验收标准", tag: "功能" },
        ...(i === 0 ? [{ step: `边界：${a}（空数据 / 极限值）`, expected: "无报错，提示合理", tag: "边界" }] : []),
      ]);
      const t = await prisma.testTask.create({
        data: { requirementId: r.id, cases, tags: ["功能", "边界"], priority: spec.priority ?? "P2", status: spec.test.status, claimedById: spec.test.agent ? agentMap.get(spec.test.agent) : null, claimedAt: spec.test.agent ? at(4) : null, lastHeartbeat: spec.test.status === "CLAIMED" ? new Date(Date.now() - 60_000) : null },
      });
      if (spec.test.report) {
        const failIdx = spec.test.report.passRate < 1 ? [1] : [];
        await prisma.testReport.create({
          data: {
            testTaskId: t.id,
            results: cases.map((_, i) => ({ caseIdx: i, pass: !failIdx.includes(i), note: failIdx.includes(i) ? "离线消息未计入未读数" : undefined })),
            passRate: spec.test.report.passRate,
            conclusion: spec.test.report.conclusion,
            defects: failIdx.length ? [{ desc: "离线消息未计入未读数", caseIdx: 1 }] : [],
            repoFilePath: `docs/test-reports/REQ-${r.seq}-${t.id.slice(-6)}.md`,
            createdAt: at(5),
          },
        });
      }
    }
  }

  // 分支摘要（真实形状）
  for (const p of projects) {
    const b = branches.get(p.id)!;
    const reqs = created.filter((c) => c.projectId === p.id && ["PENDING_TEST", "TESTING", "REVIEWING", "PENDING_ACCEPT", "DEVELOPING"].includes(c.spec.status));
    const per = reqs.map((c, i) => ({ seq: c.seq, featureBranch: `feature/REQ-${c.seq}`, mergeSha: c.spec.dev?.status === "MERGED" ? `m${(c.seq * 7919).toString(16).slice(0, 6)}` : null, files: c.spec.dev?.status === "MERGED" ? 3 + i : 0, insertions: c.spec.dev?.status === "MERGED" ? 120 + i * 37 : 0, deletions: c.spec.dev?.status === "MERGED" ? 14 + i * 5 : 0, changedFiles: c.spec.dev?.status === "MERGED" ? ["src/app/page.tsx", "src/lib/api.ts", "docs/dev-log.md"] : [] }));
    const merged = per.filter((x) => x.mergeSha);
    const commits = [
      ...reqs.filter((c) => c.spec.dev?.status === "MERGED").flatMap((c) => (c.spec.dev?.commits ?? []).map((sha, k) => ({ sha: sha.slice(0, 7), message: `${k === 0 ? "feat" : "fix"}: ${c.spec.title.slice(0, 24)} (REQ-${c.seq})`, author: c.spec.dev?.agent ?? "dev-agent-1", date: h(2 + k).toISOString(), reqSeq: c.seq }))),
      { sha: "3b2a7c1", message: "docs: update dev-log.md", author: "bitsoul-pm-bot", date: h(1.5).toISOString(), reqSeq: null },
    ];
    const summary: BranchSummary = { refreshedAt: h(0.3).toISOString(), baseCommit: "a1b2c3d", headCommit: commits[0]?.sha ?? "a1b2c3d", totals: { commits: commits.length, files: merged.reduce((a, x) => a + x.files, 0), insertions: merged.reduce((a, x) => a + x.insertions, 0), deletions: merged.reduce((a, x) => a + x.deletions, 0) }, commits, perRequirement: per };
    await prisma.dailyBranch.update({ where: { id: b.today }, data: { reviewSummary: summary as unknown as object } });
  }

  // LLM 用量（7 天）与日报（3 天）
  const usage = [];
  for (let day = 6; day >= 0; day--) {
    for (const role of ["PRODUCT", "PM", "TEST"]) {
      usage.push({ providerName: "deepseek-dev", model: "deepseek-v4-pro", expertRole: role, projectId: projects[day % 3].id, inputTokens: 12000 + Math.round(Math.random() * 20000), outputTokens: 2000 + Math.round(Math.random() * 4000), createdAt: d(day) });
    }
  }
  await prisma.llmUsageLog.createMany({ data: usage });
  for (let day = 0; day < 3; day++) {
    for (const p of projects.slice(0, 2)) {
      const done = created.filter((c) => c.projectId === p.id && c.spec.status === "ACCEPTED").map((c) => `REQ-${c.seq} ${c.spec.title}（已验收）`);
      const prog = created.filter((c) => c.projectId === p.id && ["DEVELOPING", "TESTING"].includes(c.spec.status)).map((c) => `REQ-${c.seq} ${c.spec.title}`);
      const blocked = created.filter((c) => c.projectId === p.id && c.spec.dev?.status === "CONFLICT").map((c) => `REQ-${c.seq} 合并冲突待处理`);
      await prisma.dailyReport.upsert({
        where: { projectId_date: { projectId: p.id, date: dayStart(day) } },
        update: {},
        create: { projectId: p.id, date: dayStart(day), pushed: day > 0, createdAt: new Date(dayStart(day).getTime() + 21 * 3600_000), content: { seed: true, done: done.slice(0, 2 + day), inProgress: prog, blocked, forecast: "明日预计完成开发中的需求并进入测试。", risks: blocked.length ? ["语音模块与主干冲突需人工介入"] : [] } },
      });
    }
  }
  // 体验包样例（ADR-003）：一次成功（无产物文件，仅记录）与一次失败
  const p0 = projects[0];
  await prisma.project.update({ where: { id: p0.id }, data: { buildCommand: p0.buildCommand ?? "npm ci && npm run build && cp -r dist $BUILD_OUT/" } });
  await prisma.buildRun.createMany({
    data: [
      { projectId: p0.id, branch: dailyName(0), command: "npm ci && npm run build && cp -r dist $BUILD_OUT/", status: "FAILED", requirementIds: [], requestedBy: "admin:seed", log: "$ npm ci\nnpm ERR! code E404\nnpm ERR! 404 Not Found - GET https://registry.npmjs.org/xxx\n[样例] 构建失败示例", startedAt: h(5), finishedAt: h(4.9), createdAt: h(5.1) },
      { projectId: p0.id, branch: dailyName(1), command: "npm ci && npm run build && cp -r dist $BUILD_OUT/", status: "SUCCESS", requirementIds: created.filter((c) => c.projectId === p0.id && c.spec.status === "ACCEPTED").map((c) => c.id), requestedBy: "admin:seed", log: "$ npm ci\nadded 412 packages\n$ npm run build\n✓ built in 41s\n产物 BitSoulClaw-daily-a1b2c3d.tar.gz（18.4 MB）", artifactName: "BitSoulClaw-daily-a1b2c3d.tar.gz", artifactSize: 18_400_000, startedAt: h(30), finishedAt: h(29.5), createdAt: h(30.1) },
    ],
  });
  await prisma.auditLog.createMany({
    data: [
      { actor: "admin:seed", action: "confirm-requirement", target: `REQ-${created[4].seq}`, detail: `${MARK}确认入池`, createdAt: h(30) },
      { actor: "admin:seed", action: "merge-daily-to-main", target: dailyName(1), detail: `${MARK}晚间合并`, createdAt: h(14) },
      { actor: "system", action: "usage-rollup", detail: `${MARK}昨日用量汇总`, createdAt: h(10) },
    ],
  });

  console.log(`seed-dev done: ${created.length} requirements, ${AGENTS.length} agents (password agent12345), 3 projects active`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
