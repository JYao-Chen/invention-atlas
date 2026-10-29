---
name: Invention Atlas
description: 布局、控件与可折叠导航沿用 TallyBear；配色采用用户提供的科研图表配色。
colors:
  canvas: "#f7f9fc"
  paper: "#ffffff"
  ink: "#2c323b"
  muted: "#606975"
  line: "#dfe5ed"
  action: "#416397"
  selected: "#eaf1fa"
  method: "#f3eff8"
  warning: "#865a24"
typography:
  body: Geist, PingFang SC, Microsoft YaHei, sans-serif
  heading: LXGW WenKai, PingFang SC, sans-serif
  identifier: ui-monospace, monospace
rounded:
  panel: 18px
  control: 10px
  field: 9px
---

# Design System: Invention Atlas

## Overview

用户指定整体参考 TallyBear。界面复用其实际导航、配色、控件与字体模式，不再沿用之前的蓝白顶部导航设计。保留专利功能，不引入财务模块、小熊形象或营销插画。TallyBear 源码只读，适配代码在本项目维护。

相关实现为 `AtlasNavigation.tsx`、`globals.css`、`tally-ui.css` 和最后加载的 `journal-colors.css`。新增样式使用 Atlas 的组件作用域，不导入 TallyBear 的全局 aside/header 选择器，避免影响原文窗和助手。

## Colors

TallyBear 的暖白配色已由用户提供的科研图表配色取代，见 [科研图表配色](docs/JOURNAL-PALETTE.md)，实现位于 `journal-colors.css`。浅灰蓝背景 #f7f9fc、白色内容 #ffffff、深灰正文 #2c323b、说明 #606975、浅灰边框 #dfe5ed；主按钮与选中强调 #416397，选中底 #eaf1fa；计划和方法采用淡紫底 #f3eff8；警告文字 #865a24 配浅琥珀底。颜色用于功能组和数据类别，不作装饰。

图表保留12色分类、主题对应关系和图谱节点类型配色，不把全部数据改成单一主题色。来源限制与状态仍有文字说明。

## Typography

正文使用本地 Geist 和中文系统字体；品牌和标题使用本地 LXGW WenKai。字体及授权文件与 TallyBear 使用同一版本，分别保留 Geist-LICENSE.txt 和 WenKai-OFL.txt。不请求第三方字体服务。公开编号与 JSON 参数保留等宽字体，数字保留等宽数字特性。

## Layout

桌面为236px左侧导航和弹性工作区；731–1050px导航为205px。侧栏可折叠为84px图标栏，按钮保留可读的aria-label及title，折叠状态保存在本应用独立的localStorage键中。数据、查询、历史、报告、设置五个入口不变，既有助手增加直接入口。

730px及以下隐藏侧栏，改为72px横向底部导航，并预留安全区和内容高度。固定五个入口为数据、查询、助手、对话、更多；助手位于中央。更多打开与TallyBear相同用途的底部功能面板，提供全部页面、当前账号和退出登录；原生dialog负责焦点管理和Escape关闭。手机不再把全部页面挤入底栏，导航不会清空任务或历史。

助手继续占满工作区，不回到右侧小框。输入框自动增高、可展开，手机回车换行；底部导航不覆盖输入区。原文阅读保持独立覆盖层。

## Elevation & Depth

沿用 TallyBear 的近白面板与极轻投影 `0 3px 20px #453d3806`。设置、结果、工具目录及登录容器采用相同语言。原文窗保留覆盖层投影。减少动画偏好继续生效。

## Shapes

面板18px圆角，手机16px，按钮10px，输入框9px，导航选项12px，登录表单24px。线描图标复用现有lucide-react，不增加另一套图标库。图表和专利原文不添加卡通装饰。

## Components

- 主次按钮、侧栏选中态、表单和设置面板按 TallyBear 实际样式适配。
- 推荐问题使用近白圆角面板，不再添加彩色细侧线。
- 图表、图谱、数据表和下载继续位于同一结果工具条。
- 进度保持紧凑状态行，详情按需展开，不恢复横向大进度条。
- 数据概况为独立指标、实际年份与两列覆盖率；异构工具结果继续分表，真实缺失保留“—”。
- 表格和原文中的长内容局部滚动，不靠截断丢弃数据。
- 表格只用浅灰隔行，不再按5行轮换彩色底。
- 工具返回的警告在结果摘要下以琥珀色列表显示；计算方法可展开查看；结果可下载 CSV（不同结构的行分块，带 BOM）与 JSON。
- 手机端工具目录改为按分组的下拉选择，桌面端工具目录随页面滚动保持可见。

## Do's and Don'ts

- 保留真实数据、28项工具、模型配置、停止任务、历史恢复及报告导出。
- 保留字体许可与MIT代码来源说明，不修改TallyBear的源码或配置。
- 不恢复顶部五入口导航；布局沿用 TallyBear，配色以科研图表配色为准。
- 不带入小熊、财务组件、主题切换或与专利任务无关的功能。
- 不以颜色代替来源、状态与数据限制，不伪造实时结果。
