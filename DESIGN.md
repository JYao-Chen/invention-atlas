---
name: Invention Atlas
description: 灰白与石墨的专利查询界面，以表格、查询控件和可回查证据承载分析。
colors:
  canvas: "#f4f5f3"
  paper: "#fff"
  ink: "#272c29"
  muted: "#626963"
  line: "#d9ddd8"
  soft: "#eef0ed"
  action: "#303632"
  action-hover: "#171c19"
  accent: "#3d6859"
  selected: "#e8ede8"
  green: "#36745a"
  danger: "#a23e3d"
  warning: "#775c26"
  chart: "#737e74"
  chart-line: "#556c59"
  graph-node: "#667b69"
  graph-external: "#acb5a9"
  graph-edge: "#c4cdc1"
typography:
  body:
    fontFamily: '"Noto Sans CJK SC", "Microsoft YaHei", "Segoe UI", sans-serif'
    fontSize: "14px"
    lineHeight: 1.65
  headline:
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0"
  section:
    fontSize: "19px"
    fontWeight: 600
    letterSpacing: "0"
  title:
    fontSize: "15px"
    fontWeight: 600
  label:
    fontSize: "13px"
    fontWeight: 400
  table:
    fontSize: "13px"
  table-header:
    fontSize: "12px"
    fontWeight: 500
  identifier:
    fontFamily: 'ui-monospace, "Noto Sans Mono CJK SC", monospace'
    fontSize: "12px"
    lineHeight: 1.5
rounded:
  control: "3px"
spacing:
  control-y: "7px"
  control-x: "13px"
  field-y: "9px"
  field-x: "11px"
  panel-y: "22px"
  panel-x: "24px"
  content-y: "28px"
  content-x: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "7px 13px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "7px 13px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
  navigation-active:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.ink}"
    padding: "8px 14px"
  result-tab-selected:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "5px 11px"
  result-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "22px 24px"
---

# Design System: Invention Atlas

## Overview

**Creative North Star: "查询工作台"**

灰白底色与石墨文字构成安静、直接的专利工作界面。查询表单、工具目录、数据表与结果放在同一工作平面；低饱和绿色用于证据链接、选择与数据呈现。用户已明确选择此方向，替换旧深蓝侧栏和蓝色按钮。

界面首先呈现记录或可填写的查询控件。助手默认收起，按需成为任务窗；内容的层次依靠文字大小、间距和细线建立。登录、历史、报告、设置和原文阅读沿用同一色彩与控件语言。

**Key Characteristics:**

- 灰白背景、石墨主操作与绿色证据链接。
- 顶部五入口导航，平面表格与小圆角控件。
- 查询范围使用普通表单，完整 JSON 参数折叠呈现。
- 助手按需展开，窄屏成为独立任务窗。

## Colors

颜色以低饱和灰绿为底，操作与证据各有明确角色。规范值以 frontmatter 为准，来源为 `src/app/globals.css` 与 `src/components/ResultView.tsx`。

### Primary

石墨操作色用于“运行分析”“发送”“保存配置”等主按钮；悬停变为更深的石墨色。绿色证据色用于公开编号、来源链接、焦点轮廓与选中图谱节点。

### Secondary

灰绿色柱图、深灰绿折线与图谱节点构成数据色系；外部节点更浅，普通关系边使用淡灰绿。完成、警告与失败分别使用 green、warning、danger，并同时保留文字状态。

### Neutral

canvas 是应用底色，paper 是表格、表单与结果面板底色。ink 承载正文，muted 承载来源、说明和日期；line 划分平面内容，soft 与 selected 表达悬停和选中。

**The Evidence Color Rule.** 证据链接与图谱选择使用绿色；主操作保持石墨色。

## Typography

**Body Font:** Noto Sans CJK SC，依次回退到 Microsoft YaHei、Segoe UI、sans-serif。当前实现使用系统字体栈，没有导入网络展示字体。

**Label/Mono Font:** 公开编号使用 ui-monospace、Noto Sans Mono CJK SC、monospace；JSON 参数使用 ui-monospace、monospace。

### Hierarchy

- **Headline:** 页面标题使用 headline；手机缩小到 17px。
- **Section:** 普通章节使用 section；查询工具标题为 17px，结果标题为 16px。
- **Body:** 正文使用 body；报告与原文正文行高为 1.85，原文段落最大宽度为 78ch。
- **Label:** 表单标签与表格正文为 13px；辅助信息与表头为 12px。
- **Identifier:** 公开编号使用 identifier；表格数字使用等宽数字特性。

## Layout

桌面为全高纵向应用框架：64px 顶部导航、最小 74px 数据上下文栏，下方内容独立滚动。内容常规内边距为 28px 32px 40px，主要内容最大宽度 1360px。导航含数据与证据、查询工作台、对话历史、报告库、模型与设置五个入口。

查询工具框内部为 240px 工具目录与弹性参数区，参数区最大宽度 950px，查询字段最大宽度 720px。范围表单默认两列；检索词占满整行。结果面板纵向间隔 28px。表格允许局部横向滚动，普通表格最小宽度 640px，结果长文本列保留固定阅读宽度，不压缩成不可读的窄列。

助手默认隐藏，展开时桌面宽 380px。1700px 及以上内容左右内边距增至 48px，助手增至 420px。1200px 及以下内容内边距为 24px，助手为 340px，工具目录为 205px，范围字段变为一列，覆盖率变两列。

900px 及以下隐藏账号文字；助手展开后占满工作区并隐藏主内容。此宽度的覆盖率恢复三列，范围字段恢复两列。600px 及以下导航分为品牌行与五入口行，总高 101px；内容内边距为 21px 16px 32px，顶部新对话按钮隐藏，助手入口保留。工具目录在参数上方，最大高 185px；范围字段与覆盖率均为一列。列表标题与搜索换行，历史及报告操作换行；一般按钮最小高 40px，局部导航和工具按钮沿用各自紧凑高度。图谱高从 380px 变为 310px。原文窗从最大 900px / 95vw 变为手机全宽。

## Elevation & Depth

主界面平面呈现，不给工具框、结果面板、表格或登录表单添加投影。白色内容与灰白底色通过细边框分离。原文阅读窗是唯一具有侧向投影的覆盖层：`-10px 0 28px #25322a1a`；遮罩为 `#27312b66`。

助手展开使用 180ms ease-out 的裁切揭示，控件背景与边框使用 140ms 过渡。系统请求减少动画时禁用动画和过渡。

**The Flat Workspace Rule.** 常驻内容使用底色与细线划分，投影只属于原文覆盖层。

## Shapes

输入框、普通按钮与图表提示框采用小圆角（3px）；工具、结果、表格及设置面板为直角边框。状态点为圆形（6px），柱图仅顶部两角圆润（3px）。图标为简洁线描，与文字同行，不成为装饰性视觉中心。

## Components

### Buttons

主按钮为石墨底白字，次按钮为白底细灰边，通常最小高 36px。悬停改变背景与边框，按下有更深状态；禁用时透明度为 0.5。综合分析按钮虽然保留调用端 primary 类，在查询介绍区域实际呈现白底次操作。

### Inputs / Fields

白底、灰绿细边与小圆角，内边距为 field。标签与控件间隔 6px；辅助说明位于字段下方。焦点使用 2px 绿色轮廓、3px 外偏移。完整参数默认折叠，展开后以 12px 等宽字体呈现 JSON。

### Navigation

白色顶部导航采用紧凑文字按钮。默认为 muted，悬停为 soft，当前入口为 selected 并使用 500 字重。手机保持全部五个入口，不切换到全局侧栏。

### Result Tabs

图表、图谱、数据表和下载处于同一工具条。选中标签为淡灰绿底与较深灰绿边；工具条允许换行。结果标题旁显示状态点，右侧保留文字状态。

### Cards / Containers

结果面板为白底、细边、直角、panel 内边距。数据来源说明通过上下分隔线融入文档平面；历史和报告是横向记录列表，不是卡片画廊。登录表单与设置区也使用白色直角边框。

### Tables and Evidence

表头为淡灰绿底，正文行用淡细线划分，悬停浅灰绿。专利编号与证据按钮为绿色文字；点击打开原文窗。长文本在单元格内部滚动，整表在容器内部横向滚动。方法与来源置于可展开的浅灰绿说明区。

### Charts and Graph

柱图为 chart，折线为 chart-line，坐标文字保持紧凑（10–11px）。图谱普通节点为 graph-node，外部节点为 graph-external；选择和查找高亮使用 accent。节点支持键盘，图谱上方保留查找、缩放、复位与导出控件，图下注明预览范围。

### Assistant and Original Text

助手通过顶部入口、新对话或综合分析展开；作用域、计划、进度、回答与输入区依次呈现。原文窗为独立白色阅读面，保留返回工作台与公开文献入口，公开编号、字段、摘要、权利要求及可展开全文按阅读顺序排列。

## Do's and Don'ts

### Do:

- Do 使用顶部五入口导航、灰白内容平面和石墨主操作。
- Do 使用绿色链接让公开编号与来源可回查。
- Do 保留普通查询表单、折叠完整参数和局部可滚动表格。
- Do 在窄屏把已展开助手切换为独立任务窗。
- Do 用文字同时表达完成、数据不足、失败与历史运行状态。

### Don't:

- Don't 恢复旧深蓝侧栏、蓝色主按钮或营销主视觉。
- Don't 给常驻内容添加投影、渐变或装饰性图片。
- Don't 将工具目录扩展为全局导航。
- Don't 把助手固定为默认常驻栏。
- Don't 用颜色取代来源说明、数据限制或状态文字。
