import Link from "next/link";
import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { getRuntimeNumber } from "@/lib/runtime-config";
import { PageShell, PageHeader, KpiRow, KpiTile, Panel, Table, EmptyRow, Chip, DemoNote, ago, fmtDateTime } from "@/components/ui";
import { StatusChip, CHANNEL_LABEL } from "@/components/status";
import { ImportPanel, ImportButton } from "./ui";

export const dynamic = "force-dynamic";

// 采集箱：微信消息聚合状态（待聚合会话 / 最近线索）+ 手动导入（PRD 入口 B）。真实模式无 MOCK。

interface ConvRow {
  convId: string;
  convName: string | null;
  count: number;
  lastTs: string;
  paused: boolean;
  preview: string[];
}
interface SourceRow {
  id: string;
  channel: string;
  who: string;
  createdAt: string;
  msgCount: number;
  attachmentCount: number;
  requirements: { id: string; seq: number; title: string; status: string }[];
}

export default async function InboxPage() {
  const demo = await isDemoMode();
  let convs: ConvRow[];
  let sources: SourceRow[];
  let windowMin: number;
  let botLastSeen: string | null;

  if (demo) {
    windowMin = 30;
    botLastSeen = new Date(Date.now() - 60_000).toISOString();
    convs = DEMO.inbox.pendingConvs.map((c) => ({ convId: c.convId, convName: c.convName, count: c.count, lastTs: c.lastTs.toISOString(), paused: false, preview: ["每周的进度报告能不能导成 Word？", "文件名带上项目和日期就行。"] }));
    sources = DEMO.inbox.sources.map((s) => ({ id: s.id, channel: s.channel, who: s.who, createdAt: s.createdAt.toISOString(), msgCount: 3, attachmentCount: s.channel === "WECHAT" ? 1 : 0, requirements: s.requirements.map((r) => ({ id: `demo-${r.seq}`, seq: r.seq, title: r.title, status: r.status })) }));
  } else {
    const [pending, bindings, recent, seen] = await Promise.all([
      prisma.inboxMessage.findMany({ where: { threadedAt: null }, orderBy: { ts: "asc" }, select: { convId: true, convName: true, ts: true, text: true, msgType: true } }),
      prisma.wechatBinding.findMany({ select: { convId: true, convName: true, paused: true } }),
      prisma.requirementSource.findMany({
        include: { requirements: { select: { id: true, seq: true, title: true, status: true }, orderBy: { seq: "asc" } }, _count: { select: { attachments: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.systemConfig.findUnique({ where: { key: "wechatBotLastSeen" } }),
    ]);
    windowMin = await getRuntimeNumber("aggWindowMinutes");
    botLastSeen = seen?.value ?? null;
    const byConv = new Map<string, ConvRow>();
    for (const m of pending) {
      const b = bindings.find((x) => x.convId === m.convId);
      const row = byConv.get(m.convId) ?? { convId: m.convId, convName: m.convName ?? b?.convName ?? null, count: 0, lastTs: m.ts.toISOString(), paused: b?.paused ?? false, preview: [] };
      row.count += 1;
      row.lastTs = m.ts.toISOString();
      const text = m.text ?? (m.msgType === "image" ? "［图片］" : "［文件］");
      row.preview = [...row.preview, text].slice(-3);
      byConv.set(m.convId, row);
    }
    convs = [...byConv.values()].sort((a, b) => b.lastTs.localeCompare(a.lastTs));
    sources = recent.map((s) => ({
      id: s.id,
      channel: s.channel,
      who: [s.customerName, s.senderName].filter(Boolean).join(" · ") || "未知来源",
      createdAt: s.createdAt.toISOString(),
      msgCount: Array.isArray(s.rawMessages) ? (s.rawMessages as unknown[]).length : 0,
      attachmentCount: s._count.attachments,
      requirements: s.requirements,
    }));
  }

  const pendingMsgs = convs.reduce((a, c) => a + c.count, 0);
  const botAlert = !botLastSeen || Date.now() - new Date(botLastSeen).getTime() > 5 * 60_000;

  return (
    <PageShell>
      <PageHeader title="采集箱" subtitle="微信消息聚合 · 手动导入" actions={<ImportButton />} />
      {demo && <DemoNote />}
      <KpiRow cols={4}>
        <KpiTile label="待聚合会话" value={convs.length} sub={`静默 ${windowMin} 分钟后合并为线索`} />
        <KpiTile label="待聚合消息" value={pendingMsgs} sub="尚未送拆解" />
        <KpiTile label="最近线索" value={sources.length} sub="最近 30 条" />
        <KpiTile label="微信 Bot 心跳" value={botLastSeen ? ago(botLastSeen) : "未接入"} sub={botLastSeen ? (botAlert ? "超过 5 分钟，采集可能中断" : "正常") : "用手动导入兜底"} tone={botLastSeen && botAlert ? "alert" : "default"} />
      </KpiRow>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
        <div className="order-2 flex flex-col gap-4 xl:order-1">
          <Panel title="待聚合会话" pad={false}>
            <Table head={["会话", "消息", "最近消息", "最后活动", "状态"]}>
              {convs.map((c) => (
                <tr key={c.convId}>
                  <td>
                    <span className="block font-medium text-ink">{c.convName ?? c.convId}</span>
                    <span className="block max-w-[180px] truncate font-mono text-[11px] text-ink-3">{c.convId}</span>
                  </td>
                  <td className="num">{c.count}</td>
                  <td className="max-w-[320px] text-[12px] text-ink-2">
                    {c.preview.map((p, i) => (
                      <span key={i} className="block truncate">
                        {p}
                      </span>
                    ))}
                  </td>
                  <td className="whitespace-nowrap text-[12px] text-ink-3">{ago(c.lastTs)}</td>
                  <td>{c.paused ? <Chip tone="slate">已暂停</Chip> : <Chip tone="amber">等待静默 {windowMin} 分钟</Chip>}</td>
                </tr>
              ))}
              {convs.length === 0 && <EmptyRow colSpan={5}>没有待聚合的消息。客户给机器人发消息后会先出现在这里。</EmptyRow>}
            </Table>
          </Panel>

          <Panel title="最近线索" pad={false} extra={<span className="text-[12px] text-ink-3">每条线索 = 一次拆解</span>}>
            <Table head={["时间", "渠道", "来源", "消息 / 附件", "产出需求单"]}>
              {sources.map((s) => {
                const fresh = Date.now() - new Date(s.createdAt).getTime() < 10 * 60_000;
                return (
                  <tr key={s.id}>
                    <td className="num whitespace-nowrap text-[12px] text-ink-3">{fmtDateTime(s.createdAt)}</td>
                    <td>
                      <Chip tone={s.channel === "WECHAT" ? "green" : "outline"}>{CHANNEL_LABEL[s.channel] ?? s.channel}</Chip>
                    </td>
                    <td className="text-[12px] text-ink-2">{s.who}</td>
                    <td className="num text-[12px] text-ink-2">
                      {s.msgCount} / {s.attachmentCount}
                    </td>
                    <td>
                      {s.requirements.length === 0 ? (
                        fresh ? (
                          <Chip tone="blue">拆解中</Chip>
                        ) : (
                          <Chip tone="slate">未产出</Chip>
                        )
                      ) : (
                        <span className="flex flex-col gap-1">
                          {s.requirements.map((r) => (
                            <span key={r.id} className="flex items-center gap-2 text-[12px]">
                              <Link href={r.status === "PENDING_CONFIRM" ? `/confirm?id=${r.id}` : `/requirements/${r.id}`} className="text-accent hover:underline">
                                REQ-{r.seq}
                              </Link>
                              <span className="max-w-[260px] truncate text-ink">{r.title}</span>
                              <StatusChip status={r.status} />
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sources.length === 0 && <EmptyRow colSpan={5}>还没有线索。用右侧手动导入试一下。</EmptyRow>}
            </Table>
          </Panel>
        </div>

        <div className="order-1 flex flex-col gap-4 xl:order-2">
          <ImportPanel demo={demo} />
          <Panel title="接入说明">
            <ul className="flex flex-col gap-2 text-[12px] leading-relaxed text-ink-2">
              <li className="flex gap-2">
                <span className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full bg-accent" />
                微信单聊机器人自动采集：客户给机器人发消息，会话在「设置 → 微信采集」启用后进入采集箱。
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full bg-accent" />
                同一会话静默 {windowMin} 分钟后合并为一条线索，产品专家拆解为需求单进入待确认。
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full bg-accent" />
                手动导入用于微信不可用或非微信来源（口头、邮件）；Web 表单入口在「设置 → 系统参数」开放。
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
