# TODO.md

## 当前任务
按 docs/ui_design/ 下 5 张参考图重构全站界面,完成后部署到线上 https://pm.bitsouls.cn 并通知管理员验收。

参考图 → 页面映射:
- p7gqGZCUeE6dAGCs.png → /dashboard 全局运营总览
- GhDTkBm6mi7mHaen.png → /inbox 需求采集箱与 AI 拆解工作台
- VPQ4C0eC3FBpC4bO.png → /requirements/[id] 需求详情(待确认态)
- XA9hhmonfsFrGAye.png → /branches 晚间审查与验收中心
- n2YduMmHJzBQ445A.png → /pools 项目执行中心(看板)

## 步骤
- [x] 设计系统落地:globals.css 设计令牌、深色导航侧边栏(带徽标计数+底部用户卡)、共享组件(ui.tsx)重写、锁定浅色主题
- [x] /dashboard 按参考图重构(决策事项卡含待审批、健康度卡进度/质量/资源/风险四行、关键指标较昨日增量、Agent 动态、日报摘要、快捷操作;缺失数据集中 MOCK)
- [x] /inbox 三栏工作台重构(来源会话证据 | AI 拆解结果 | 详情信息;全区块复现,缺数据处集中 MOCK 填充,手动导入等真实功能保留)
- [x] /requirements/[id] 详情页重构(用户故事/验收标准/AI 置信/澄清问题/底部操作条;无置信度等字段处以集中 MOCK 常量填充,已注释标记待替换)
- [x] /confirm 待确认列表改为与详情页同风格卡片列表(标题跳详情+就地确认/编辑/驳回/合并全保留)
- [x] /branches 晚间审查中心重构(分支概览统计卡、变更摘要表、合并面板、业务验收;无数据区块按管理员要求用集中 MOCK 常量填充,tsc 通过)
- [x] /pools 执行中心看板重构(顶栏搜索+图标区、筛选条含项目切换/分支类型/AI 重排等、7 格统计行、五列状态看板、右侧详情抽屉四 Tab;真实数据优先、缺失字段集中 MOCK 填充并注释标记;优先级调整/锁定 API 保留,无后端按钮统一降级提示;tsc 通过)
- [x] 次级页面风格统一(requirements 列表、agents、reports、more、settings)+ login 页 + 移动端 BottomNav
- [ ] 验证:npm run typecheck && npm run build,本地起 dev 目检关键页(注:npm run lint 因 Next 16 移除 next lint 已失效,为既有问题)
- [ ] 部署:git commit + push → 云助手在服务器 git pull + docker compose up -d --build → 健康检查
- [ ] 通知管理员验收

## 已完成
- [x] 阅读 5 张参考图,确认与现有页面映射关系
- [x] 2026-08-04 P1 批次上线(需求生命周期、共享上下文、澄清回发、日报推送、审计、消耗告警、质量统计)
- [x] 2026-08-04 生产部署上线 https://pm.bitsouls.cn(阿里云 ECS 47.103.29.184,云助手通道,Docker 四容器,HTTPS)
- [x] M1-M6 全部里程碑(基础设施/需求拆解/任务池 Git 自动化/测试闭环/看板/微信打通)

## 备注
- 部署方式:服务器 /opt/bitsoul-pm,升级命令 `git pull && docker compose up -d --build`(DEPLOY.md §7),走 aliyun 云助手执行
- 设计基调:深色海军蓝侧边栏 + 浅灰内容区 + 白卡片,主色蓝 #2563EB,状态色红/橙/绿;全站锁定浅色主题以贴合参考图
- 等待管理员的三项外部资源(LLM Key、GITHUB_BOT_PAT、微信桥)仍未到位,与本次 UI 重构无关
