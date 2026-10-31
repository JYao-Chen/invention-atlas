---
name: Invention Atlas
description: 与科学机理研究平台对齐的浅色专利研究工作台；紧凑操作与长文阅读分层
colors:
  canvas: "#f6f7f9"
  paper: "#ffffff"
  sunk: "#f1f2f5"
  band: "#fafbfc"
  soft: "#f3f4f7"
  ink: "#14161b"
  ink-secondary: "#444a57"
  muted: "#636a79"
  placeholder: "#636a79"
  line: "#e3e5ea"
  rule: "#e3e5ea"
  line-strong: "#d0d4dc"
  action: "#5a52e5"
  action-hover: "#4b43d3"
  action-active: "#3f37b8"
  accent: "#3f37b8"
  selected: "#efeefe"
  selected-line: "#d4d0f8"
  focus-ring: "#5a52e552"
  green: "#157a3c"
  danger: "#c8321f"
  warning: "#9a5b05"
  amber: "#9a5b05"
  success-surface: "#e6f5ec"
  danger-surface: "#fdecea"
  danger-line: "#e7bcb6"
  warning-surface: "#fdf2df"
  warning-line: "#ead4af"
  highlight: "#fff5cc"
  method-surface: "#fafbfc"
  history-surface: "#fafbfc"
  overlay: "#10162259"
  chart: "#4f75b0"
  indigo: "#76618f"
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
  page-title:
    fontFamily: "ui-sans-serif, -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', 'Noto Sans CJK SC', sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.3
  panel-title:
    fontFamily: "ui-sans-serif, -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', 'Noto Sans CJK SC', sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.6
  body:
    fontFamily: "ui-sans-serif, -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', 'Noto Sans CJK SC', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "ui-sans-serif, -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', 'Noto Sans CJK SC', sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.6
  reading:
    fontFamily: "Charter, 'Iowan Old Style', 'Source Serif 4', Georgia, 'Noto Serif SC', 'Songti SC', serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.85
  identifier:
    fontFamily: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "7px"
  panel: "10px"
spacing:
  inline: "8px"
  field-gap: "12px"
  panel-pad: "16px"
  stack: "24px"
  gutter: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "5px 12px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-primary-active:
    backgroundColor: "{colors.action-active}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "32px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "7px 10px"
  navigation-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  result-tab-selected:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  result-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
---

# Design System: Invention Atlas

## Overview

**Creative North Star: "研究工作台"**

与科学机理研究平台共享冷灰背景、白色内容面、墨色文字和靛紫操作色。界面保持紧凑、清晰，使用字号、字重、间距和细线组织查询、数据、报告与设置。

操作界面使用系统无衬线字体，报告和原文切换为衬线阅读字体。专利分析保留自己的图表分类色、工具分组和来源呈现；导航、控件和阅读层次沿用统一视觉语言。

**Key Characteristics:**
- 冷灰工作区、白色内容面与浅灰侧栏。
- 靛紫主操作和选中提示，分类色用于图表与工具分组。
- 紧凑无衬线操作界面，衬线长文阅读。
- 可折叠桌面侧栏、手机底部导航与宽屏说明分栏。

## Colors

### Primary

靛紫主操作使用 action、action-hover 和 action-active；链接及强调文字使用 accent。selected 和 selected-line 提供浅色选中背景与边界，focus-ring 用于字段聚焦。

### Secondary

图表沿用 chart 和 indigo。工具类别沿用 group-search、group-data、group-topics、group-competition、group-route、group-value、group-citation、group-audit 与 group-legal；类别颜色保持原有映射。

成功、警告和失败分别使用 green、warning、danger 及对应浅色面。状态同时保留文字。

### Neutral

canvas 承载工作区，paper 承载内容，soft 承载侧栏和轻量悬停，sunk 用于凹入区，band 用于表头。ink、ink-secondary、muted 分别承载主文字、次级正文和说明。line 与 line-strong 区分常规边界和交互边界。

**The Category Color Rule.** 图表和工具分组保留分类色，主操作统一使用靛紫。

## Typography

系统无衬线字体用于导航、表单、表格、标题和状态；等宽字体用于公开编号及参数。报告正文、研究报告和原文使用 Charter / Georgia / Noto Serif SC 衬线字族。

- 页面标题采用 page-title（22px，600），保持紧凑标题区。
- 操作正文采用 body（13px，行高1.6）；说明和控件标签采用 label。
- 面板标题采用 panel-title，避免所有内容使用同一标题等级。
- 长文采用 reading（15.5px，行高1.85），章节标题保留无衬线字族。
- 说明页正文保留现有14px与1.85行高，适应图文和分栏阅读。

## Layout

桌面采用左侧栏与可滚动工作区。侧栏展开宽232px，折叠为64px；品牌与折叠键同一行，导航与底部账号区保持稳定位置。侧栏使用 soft。桌面工作区左右留白32px，常规内容上方24px；内容使用现有宽度约束，数据表在自身容器内横向滚动。

主导航包含数据与证据、查询工作台、报告库、模型与设置、使用说明和分析助手；对话历史归入助手入口状态。手机在730px及以下隐藏侧栏，底部保留数据、查询、助手、报告和更多；更多打开底部功能菜单，保留账号与仓库入口。

手机内容留白16px，普通按钮与字段触控高度40px，底部导航项至少48px，菜单项至少44px；顶部紧凑操作保留36px。底部导航与菜单考虑安全区。

说明页按容器宽度分栏：达到860px时正文两列，完整宽度的说明跨列；窄容器回到单列。保留现有目录、图示和宽屏说明结构。

## Elevation & Depth

以背景、白色面与细边界表达层次。常规面板采用轻微 panel 投影；结果、报告和说明阅读面以细边界为主。弹出菜单、编辑对话框和覆盖层采用 pop 投影；透明遮罩使用 overlay。状态过渡以140ms为主，减少动画偏好下移除控件过渡和按压位移。

## Shapes

普通控件使用 control 圆角，主要面板使用 panel 圆角。表格容器裁切到面板边界，数据行仍使用细线分隔。图表的点、线和类别标记沿用原有形状。

## Components

### Buttons

主按钮使用靛紫底和白字，悬停加深，按下使用 action-active。次按钮使用白底、墨色文字与细边界。桌面基础高度32px，左右内边距12px；图标保持紧凑并与文字对齐。键盘聚焦使用清晰轮廓，禁用状态降低透明度。

### Inputs / Fields

白底细边界，桌面基础高度36px，内边距7px 10px。悬停增强边界，聚焦使用靛紫边界和柔和外环。查询、年份与筛选延续现有表单布局。

### Navigation

桌面侧栏以分组标签、图标与文字显示入口；折叠后保留图标、标题提示和可访问名称。桌面选中入口使用白底、细边和微影，图标使用靛紫，文字保持墨色。工具目录、手机底部导航与更多菜单的选中项使用浅靛紫底和强调文字。

### Chips

结果切换采用小型边框按钮，选中使用 selected 和 selected-line。状态与类别标记保留文字含义及现有颜色映射。

### Cards / Containers

结果、设置、查询工具和报告容器使用白色面、细边界和面板圆角，间距保持16–24px。记录列表和表格依靠行分隔组织内容。外部数据统计使用一个白底整面板，指标之间使用分列线。

### Reading

报告、研究报告和原文保留段落、来源、引用和章节层次，正文使用 reading。阅读区内的操作、生成过程和预算说明保持无衬线字体。

## Do's and Don'ts

### Do:
- **Do** 将靛紫用于主操作、链接与选中提示。
- **Do** 保留图表分类色与工具分组映射。
- **Do** 区分13px操作正文和15.5px衬线长文。
- **Do** 保留折叠侧栏、手机底部导航和宽屏说明分栏。
- **Do** 使用文字说明运行状态、来源和数据限制。

### Don't:
- **Don't** 用大面积强调色替代冷灰背景和白色内容面。
- **Don't** 把类别色改为全站主操作色。
- **Don't** 将表格、来源或长文排成重复的装饰卡片。
- **Don't** 在窄屏保留桌面多列造成正文拥挤。
