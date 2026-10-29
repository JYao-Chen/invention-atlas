---
name: Invention Atlas
description: 布局与可折叠导航沿用 TallyBear；配色采用用户提供的科研图表配色；单一无衬线字族，发丝线加轻投影。
colors:
  canvas: "#f7f9fc"
  paper: "#ffffff"
  sunk: "#f3f6fa"
  ink: "#2c323b"
  muted: "#606975"
  line: "#dfe5ed"
  rule: "#e6ebf2"
  line-strong: "#c9d4e2"
  scroll-hover: "#aebccf"
  action: "#416397"
  action-hover: "#34517d"
  action-active: "#2c466d"
  selected: "#eaf1fa"
  selected-line: "#bfd0e7"
  selection: "#d6e2f3"
  selection-ink: "#1f3350"
  method: "#f3eff8"
  history: "#faf3e9"
  warning: "#865a24"
  danger: "#a23e50"
  green: "#327567"
  chart: "#4f75b0"
  indigo: "#76618f"
  overlay: "#1e2a3c59"
  shadow: "#1e2a3c38"
  band: "#fafbfd"
  placeholder: "#6e7682"
  success-surface: "#eaf5ef"
  danger-surface: "#fff0f2"
  danger-line: "#efb8c1"
  warning-surface: "#fbf5ec"
  warning-line: "#ecdcc4"
  highlight: "#fff0b8"
  focus-glow: "#41639722"
  group-search: "#5b88bd"
  group-data: "#4fa898"
  group-topics: "#9583be"
  group-competition: "#d9645c"
  group-route: "#6aa3cf"
  group-value: "#b98d36"
  group-citation: "#657da0"
  group-audit: "#d9874f"
  group-legal: "#c98f97"
typography:
  body: Geist, PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Microsoft YaHei, sans-serif
  heading: same family as body, weight 600, letter-spacing -0.01em
  identifier: ui-monospace, SF Mono, Menlo, Noto Sans Mono CJK SC, monospace
rounded:
  panel: 12px
  control: 8px
  bar: 2px
  bubble-tail: 4px
  dot: 50%
  pill: 999px
---

# Design System: Invention Atlas

## Overview

用户指定整体参考 TallyBear 的布局：左侧可折叠导航、手机底部导航、查询控件与结果同页。2026-10-29 起视觉改为“精确、克制”：一个无衬线字族，靠字重和字号分层级；面板用发丝线加极轻投影；颜色只用于数据类别、功能分组和状态，不作装饰。保留专利功能，不引入财务模块、小熊形象或营销插画。

全部样式在 `src/app/globals.css` 一个文件中。开头的 `:root` 是唯一的令牌来源，组件规则引用令牌，不再写散落的颜色字面量。原来的 `tally-ui.css` 与 `journal-colors.css` 已并入，合并时只删除被同一选择器后续声明覆盖的死声明，并用截图逐像素比对确认无视觉变化。

## Colors

配色见 [科研图表配色](docs/JOURNAL-PALETTE.md)。浅灰蓝背景 #f7f9fc，白色内容 #ffffff，凹陷面（表头、代码、工具目录栏）#f3f6fa，深灰正文 #2c323b，说明 #606975，边框 #dfe5ed，行内分隔 #e6ebf2，悬停边框 #c9d4e2。唯一操作色 #416397，选中底 #eaf1fa。方法说明用淡紫底 #f3eff8；历史回放和警告用浅琥珀底配 #865a24 文字。

工具分组颜色只以 6px 圆点出现在工具目录、参数标题和推荐问题上，不做底色、侧线或按钮色。导航选中态对所有页面一致（白底加发丝线，图标转为操作色），不按页面换色。图表保留 12 色分类、主题对应关系和图谱节点类型配色。来源限制与状态仍有文字说明。

## Typography

正文与标题同用本地 Geist 加中文系统黑体（苹方、冬青、思源、微软雅黑）。标题字重 600、字距 -0.01em；页面标题 22px，区块标题 18–19px，面板标题 16px，正文 14px，说明 12–13px。全局开启等宽数字。公开编号与 JSON 参数用等宽字族。不请求第三方字体服务；Geist 授权见 `public/fonts/Geist-LICENSE.txt`。已移除 LXGW WenKai（原 4.7 MB 子集）。

## Layout

桌面为236px左侧导航和弹性工作区；731–1050px导航为205px。视口不小于1680px时，查询工作台改为左右两栏：左侧工具目录与参数（600–680px，随页面吸顶），右侧结果；更窄时上下排列。侧栏可折叠为84px图标栏，按钮保留可读的aria-label及title，折叠状态保存在本应用独立的localStorage键中。数据、查询、历史、报告、设置五个入口不变，既有助手增加直接入口。

730px及以下隐藏侧栏，改为72px横向底部导航，并预留安全区和内容高度。固定五个入口为数据、查询、助手、对话、更多；助手位于中央。更多打开与TallyBear相同用途的底部功能面板，提供全部页面、当前账号和退出登录；原生dialog负责焦点管理和Escape关闭。手机不再把全部页面挤入底栏，导航不会清空任务或历史。

助手继续占满工作区，不回到右侧小框。输入框自动增高、可展开，手机回车换行；底部导航不覆盖输入区。原文阅读保持独立覆盖层。

## Elevation & Depth

两级层次：面板用 `--shadow-panel`（1px 发丝环加 1–2px 轻投影），浮层（管理菜单、编辑对话框、词云详情、回到底部）用 `--shadow-pop`。不用大面积柔光投影。原文窗保留覆盖层投影，遮罩色 #1e2a3c59。减少动画偏好继续生效。

## Shapes

两档圆角：面板、卡片、对话框 12px；按钮、输入框、导航项、引文块 8px。状态点和分组点为圆形，回到底部按钮为胶囊形。线描图标复用 lucide-react。图表和专利原文不添加卡通装饰。

## Browser surfaces

滚动条为细灰蓝滑块（悬停加深），Firefox 用 `scrollbar-color`；选中文字为浅蓝底深蓝字；焦点环 2px 操作色；输入框聚焦时边框转操作色并加 3px 淡色光晕；`accent-color` 统一为操作色。

## Components

- 主次按钮、侧栏选中态、表单和设置面板按 TallyBear 实际样式适配。
- 推荐问题使用白色卡片、发丝线和分组圆点，不加彩色顶线或侧线。
- 顶栏“管理”是带下拉箭头的按钮，展开时箭头翻转，菜单为浮层列表。
- 结果面板标题下用一条分隔线，标签页选中为白底加边框；数据概况三项以竖向细线分隔，不用彩色色块；覆盖率条统一用图表蓝。
- 对话历史是一整张列表面板，行间用细线分隔。
- 引文和权利要求对照用凹陷底加圆角，不用彩色左侧线；比对关系以标题文字颜色表示。
- 图表、图谱、数据表和下载继续位于同一结果工具条。
- 进度保持紧凑状态行，详情按需展开，不恢复横向大进度条。
- 数据概况为独立指标、实际年份与两列覆盖率；异构工具结果继续分表，真实缺失保留“—”。
- 表格和原文中的长内容局部滚动，不靠截断丢弃数据。
- 表格只用浅灰隔行，不再按5行轮换彩色底。
- 工具返回的警告在结果摘要下以琥珀色列表显示；计算方法可展开查看；结果可下载 CSV（不同结构的行分块，带 BOM）与 JSON。
- 手机端工具目录改为按分组的下拉选择。

## Do's and Don'ts

- 保留真实数据、28项工具、模型配置、停止任务、历史恢复及报告导出。
- 保留 Geist 字体许可与 MIT 代码来源说明，不修改 TallyBear 的源码或配置。
- 不再加入装饰性颜色轮换、彩色侧线、渐变文字或第二种标题字体。
- 不恢复顶部五入口导航；布局沿用 TallyBear，配色以科研图表配色为准。
- 不带入小熊、财务组件、主题切换或与专利任务无关的功能。
- 不以颜色代替来源、状态与数据限制，不伪造实时结果。
