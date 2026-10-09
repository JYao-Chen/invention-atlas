<div align="center">

# Invention Atlas

**从专利原文到技术主题、引证关系和分析报告。**

自主部署 · 中文检索 · 交互图表 · 26 项分析工具

[使用说明](docs/USER-GUIDE.md) · [开始使用](#开始使用) · [截图](#电脑与手机截图) · [分析能力](#分析能力) · [开发与部署](#开发与部署)

</div>

Invention Atlas 是一个专利分析应用。导入数据后，可以直接选工具，也可以向助手提问。助手展示执行计划，工具逐项返回结果，报告正文流式输出。点击公开编号或图谱节点，可以回到原文。

统计、聚类和网络计算由 TypeScript 执行，模型负责规划、主题命名与辅助抽取。缺少同族成员、法律状态或引用边时，应用保留缺失，不补造数据。

![查询工作台与关键词词云](public/help/desktop-cloud.png)

## 能做什么

### 管理数据并回查原文

支持文件导入、公开语料获取和手动录入。专利可新增、编辑、搜索和删除，行首勾选支持跨页批删，也可删除整个数据集。删除需确认；对话和报告快照仍保留，但被删专利无法再从原数据集打开。

语义索引显示完成数量和百分比，可以停止后继续。每批保存向量，再次执行只补缺少的记录。修改标题或摘要会清除该条旧向量，其他记录不受影响。

### 用表单选范围，用图表看结果

年份、申请人、IPC和计数口径控制分析范围。主题数量、关键词数量、时间粒度、合作主体与检索策略都有对应表单，无需编辑JSON。

关键词可切换词云、柱状图、横向条形图和数据表，滑块实时调整显示词数。聚类支持中文主题名、散点筛选及原文查看。引证图使用真实关系边，节点可以查找和打开，图表颜色与主题图例对应。

### 保留过程和报告

助手以具名节点组织检索、复核、分析与报告。领域问题先得到候选范围，再对该范围统计；空结果不会自动改成全库分析。权利要求抽取和对照保存原文定位，分段任务复用已完成的检查点。

输入框自动增高，可展开长文。任务支持停止、刷新恢复和历史分页；报告失败可只重试解释部分。报告可导出Markdown或HTML，工具结果另可下载JSON。

### 在应用内查用法

“使用说明”提供分章目录、操作步骤和功能跳转。电脑与手机截图可以切换、打开大图；演示按钮只带入问题，点击发送后才执行。文档支持章节链接和关键词查找，返回时恢复上次章节。

## 电脑与手机截图

截图来自本地应用及已有真实分析记录。历史结果保持恢复标识，不表示正在实时生成。

| 数据管理 | 专利编辑 |
| --- | --- |
| ![数据页](public/help/desktop-data.png) | ![编辑表单](public/help/desktop-editor.png) |

| 查询工具 | 分析助手 |
| --- | --- |
| ![工具参数](public/help/desktop-tools.png) | ![助手](public/help/desktop-assistant.png) |

<details>
<summary>查看手机截图</summary>

| 数据与证据 | 对话历史 |
| --- | --- |
| <img src="public/help/mobile-data.png" width="300" alt="手机数据页" /> | <img src="public/help/mobile-history.png" width="300" alt="手机对话历史" /> |

</details>

## 开始使用

需要 Node.js **22.16 或以上**和npm。模型服务由你配置，API费用由相应提供商收取。

```sh
git clone git@github.com:JYao-Chen/invention-atlas.git
cd invention-atlas
npm ci
cp .env.example .env.local
```

在 `.env.local` 填写自己的凭证，勿提交该文件。

```dotenv
PATENT_USERNAME=admin
PATENT_PASSWORD=your-own-password
DASHSCOPE_API_KEY=your-dashscope-api-key
PATENT_MODEL=qwen3.8-flash
PATENT_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
PATENT_EMBEDDING_MODEL=text-embedding-v4
PATENT_DATA_DIR=./data
```

```sh
npm run dev
```

打开 [http://127.0.0.1:3017](http://127.0.0.1:3017)。登录后在“模型与设置”测试连接并保存，从数据页导入文件或获取公开语料，再建立语义索引。

对话模型支持OpenAI兼容接口；语义索引单独使用百炼嵌入配置，修改对话模型不会改变它。模型名必须由提供商实际支持。

也可用脚本获取原始300条样本并建立索引。

```sh
npm run data:fetch
npm run data:index
```

获取需要服务器访问Hugging Face。数据页采集入口无法直连时，可设置 `PATENT_DATASET_ROWS_URL` 指向自管 `/rows` 转发地址；命令行样本脚本直接请求官方接口。

## 跑一轮分析

> 分析当前数据集的主要申请人、技术主题和代表专利，展示引证关系，并拆解一项代表专利的权利要求，生成报告。

先展示原文，再发送问题并展开计划。查看申请人、主题和引证结果，打开权利要求证据，最后保存并导出报告。网络不可用时可以回看保存的报告，界面会标记历史运行。

[五分钟演示步骤](docs/USER-GUIDE.md#demo) · [本地应用内演示章节](http://127.0.0.1:3017/#guide/demo)（需要登录，其他部署替换为自己的地址）

## 分析能力

| 能力组 | 工具 |
| --- | --- |
| 检索与读取（2） | 语义/词法检索、专利详情 |
| 数据与态势（5） | 数据概况、公开趋势、生命周期拟合、IPC分布、记录公开局 |
| 热点与主题（4） | 关键词词频、关键词突现、年度关键词、主题聚类 |
| 竞争格局（4） | 合作网络、竞争者演化、申请人组合、集中度 |
| 技术路线（1） | 引证技术主路径 |
| 价值与机会（2） | 引证指标筛查、技术效果矩阵 |
| 引证与同族（2） | 引证/共引/耦合、同族地域 |
| 审计与监测（3） | 策略审计、数据变化监测、数据质量审计 |
| 法律与权利要求（3） | 来源时点法律状态、权利要求要素、权利要求对照 |

可用性取决于当前记录的字段。[工具参考](docs/TOOLS.md)列出逐项参数、字段和结果；[研究流程](docs/RESEARCH-WORKFLOW.md)说明范围传递、原文定位与人工评测口径。

## 数据与边界

原始样本从 [ExponentialScience/DLT-Patents](https://huggingface.co/datasets/ExponentialScience/DLT-Patents) 的6个分散位置各取100条候选，排除截断、重复和必要字段缺失记录，再等距选取300条。仓库提供获取脚本，不打包运行数据库。

这份非随机样本含跨领域记录，不能据此估算全球专利数量或行业增长。申请人与受让人分开处理，IPC与CPC不混用。采集新语料会形成独立数据集，不覆盖原样本。

- 法律状态和同族补充是公开页面获取时点快照，不保证官方实时状态或完整全球同族。
- 聚类名称由模型辅助归纳，PCA投影会损失距离信息，需核对代表原文。
- 引证主路径不证明技术因果；指标筛查不输出单项商业估值。
- 变化监测比较本地数据与基线，不持续检索互联网新申请。
- 权利要求对照和报告需人工复核，不替代法律意见。

## 文档

| 文档 | 内容 |
| --- | --- |
| [使用说明](docs/USER-GUIDE.md) | 页面操作、截图、排查与演示 |
| [工具参考](docs/TOOLS.md) | 26项工具的参数、字段和结果 |
| [数据格式与部署](docs/DEVELOPMENT.md) | 导入字段、配置、持久化和发布 |
| [研究流程](docs/RESEARCH-WORKFLOW.md) | 候选范围、权利要求对照和人工评测 |
| [功能验收](docs/ACCEPTANCE-20261009.md) | 一次真实数据的工具与问题验收 |
| [研究能力验收](docs/ACCEPTANCE-RESEARCH-20261009.md) | 研究流程与复核的验证边界 |
| [图表配色](docs/JOURNAL-PALETTE.md) | 功能角色与图表配色约定 |

## 开发与部署

```sh
npm test
npm run typecheck
npm run build
npm start
```

单体Next.js应用，使用React、TypeScript、LangGraph和SQLite，不需要Python、Redis或独立Agent服务。事件通过SSE传输，工具数据与模型正文分别保存。

```text
src/components/   页面、图表、原文、进度和使用说明
src/server/       模型、算法、导入、任务与数据库
src/lib/          类型、说明书内容和结果布局
scripts/          数据获取、索引、评测及文档生成
tests/            算法、协议、数据管理和文档测试
public/help/      电脑与手机截图
data/             私有运行数据，不提交Git
```

公网部署使用HTTPS和独立账号。持久数据与模型配置放在发布目录之外，发布只更新代码。默认监听回环地址，首版为单账号设计，不提供多租户权限隔离。

正文维护在 `src/lib/help-guide.ts`，运行 `npx tsx scripts/prepare-help.ts` 同步仓库使用说明。截图更新方法见[开发文档](docs/DEVELOPMENT.md#更新说明与截图)。

测试通过表示相应功能检查通过，不表示模型答案获得专利专业认证。真实数据核对测试缺少源缓存会明确跳过；独立人工评审与程序检查分别记录。

## 贡献与许可

欢迎提交包含复现步骤的Issue和Pull Request。修改算法请附小样本测试，说明需要哪些字段及数据不足时如何处理。请勿提交密钥、账号凭证或未授权数据。

代码采用 [MIT License](LICENSE)。界面导航和对话交互参考[TallyBear](https://github.com/JYao-Chen/tallybear)，字体授权随资源保留。数据及第三方页面遵循各自条款，代码许可证不改变它们的授权，也不授予实施相关专利的权利。
