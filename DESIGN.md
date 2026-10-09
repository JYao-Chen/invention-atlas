---
name: Invention Atlas
description: 沿用 TallyBear 的暖白纸面、柔和操作色、圆角面板与可折叠导航。
colors:
  canvas: "#faf7f2"
  paper: "#fffdfa"
  ink: "#453d38"
  muted: "#776c64"
  line: "#e9e1d8"
  action: "#365f58"
  selected: "#eaf0eb"
  method: "#f4eef6"
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

相关实现为 `AtlasNavigation.tsx`、`globals.css` 和 `tally-ui.css`。新增样式使用 Atlas 的组件作用域，不导入 TallyBear 的全局 aside/header 选择器，避免影响原文窗和助手。

## Colors

暖白背景 #faf7f2、近白内容 #fffdfa、褐灰正文 #453d38、说明 #776c64、米色边框 #e9e1d8，沿用 TallyBear 的基础色。主按钮 #365f58，次按钮及选中态 #eaf0eb；主按钮悬停 #665078。计划和方法采用柔和淡紫底。

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

## Do's and Don'ts

- 保留真实数据、24项工具、模型配置、停止任务、历史恢复及报告导出。
- 保留字体许可与MIT代码来源说明，不修改TallyBear的源码或配置。
- 不恢复顶部五入口导航与蓝白主题；本轮用户指定的TallyBear参考优先。
- 不带入小熊、财务组件、主题切换或与专利任务无关的功能。
- 不以颜色代替来源、状态与数据限制，不伪造实时结果。
