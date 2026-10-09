# 分析工具参考

[使用说明](USER-GUIDE.md) · [研究流程与复核](RESEARCH-WORKFLOW.md) · [返回README](../README.md)

工具读取当前数据集或助手保存的候选范围。通用筛选为 `year_start`、`year_end`、`applicant`、`ipc`；计数口径 `counting` 可选公开件或来源同族代表件。原文读取、权利要求与质量审计按公开件工作。字段缺失或筛选无结果会明确返回，不自动扩展范围。

下表中的数量参数 `top_k` 范围为1—1000。它控制后台返回结果；图表滑块只控制已返回数据的显示数量。主题数量 `k` 范围为2—12，实际还受记录数约束。

## 检索与读取

| 工具标识 | 参数与数据 | 输出 |
| --- | --- | --- |
| `search_patents` | `query`、`top_k`；标题、摘要；完成索引后可语义检索 | 相关专利及检索得分，保留实际返回范围 |
| `read_patent_details` | `patent_numbers`，最多5项 | 摘要、权利要求、说明书及来源字段 |

## 数据与态势

| 工具标识 | 参数与数据 | 输出 |
| --- | --- | --- |
| `get_dataset_summary` | 通用范围 | 数量、年份、申请人、索引与字段覆盖 |
| `analyze_patent_trend` | 公开日期；`frequency=year/month` | 时间序列，按真实公开日期计数 |
| `analyze_lifecycle` | 公开日期 | 累计公开量和Logistic拟合；不足时不给出有效阶段判断 |
| `analyze_ipc_distribution` | IPC；`top_k` | IPC分布，不将CPC混入 |
| `analyze_country_distribution` | 公开编号；`top_k` | 编号公开局分布，不推断申请人国籍 |

## 热点与主题

| 工具标识 | 参数与数据 | 输出 |
| --- | --- | --- |
| `generate_wordcloud` | 标题/摘要；`top_k`，默认50 | TF、DF和平滑TF-IDF，可选词云与数值图 |
| `analyze_burst_terms` | 公开日期、摘要；`top_k` | Kleinberg关键词突现 |
| `analyze_yearly_keywords` | 公开日期、标题；`top_k`，每年默认10 | 每年关键词及指标，可按年展示 |
| `analyze_clustering` | 同维嵌入；`k`，默认6 | 固定种子K-means、PCA投影、关键词和模型辅助主题名 |

## 竞争格局

| 工具标识 | 参数与数据 | 输出 |
| --- | --- | --- |
| `analyze_co_network` | `dimension=applicant/inventor` | 同项专利共现网络，非外部合作事实推断 |
| `analyze_competitor_evolution` | 申请人、日期、IPC；`top_k` | 主要申请人的年度布局 |
| `analyze_entity_portfolio` | 申请人；`top_k` | 申请人技术组合 |
| `analyze_concentration` | 申请人 | CR3/5/10与HHI，按当前统计口径解释 |

人工别名规则只按填写的依据归并名称，原始字段与受让人不改写。同族计数保留筛选范围内最早公开件，缺少来源同族标识的记录独立保留。

## 技术路线与价值筛查

| 工具标识 | 参数与数据 | 输出 |
| --- | --- | --- |
| `analyze_tech_roadmap` | 日期、真实引用 | 内部引证DAG的SPC主路径，不证明技术因果 |
| `analyze_patent_valuation` | 日期、可观察的引证指标；`top_k` | Pareto指标筛查；名称为历史接口标识，不输出商业估值 |
| `analyze_tech_matrix` | 摘要及可用原文，模型辅助抽取 | 原文支持的技术—效果关系和定位；无证据不补造 |

## 引证与同族

| 工具标识 | 参数与数据 | 输出 |
| --- | --- | --- |
| `analyze_citation_network` | 引用；`top_k` | 内外部边、PageRank、共引与文献耦合 |
| `analyze_family_geography` | 真实同族成员 | 已知成员的公开局分布，不把同族ID当成员列表 |

外部引用仅有编号时，不代表数据库中已有外部全文。缺少全库前向引用时不能据此评价整个行业的影响力。

## 审计与监测

| 工具标识 | 参数与数据 | 输出 |
| --- | --- | --- |
| `audit_search_strategy` | `strategies`，2—10组名称与查询；`top_k` | 各返回集的重合与独有命中，不是全球查全率 |
| `monitor_patent_changes` | `query`、`strategy_id`、`top_k` | 首次保存基线；后续比较新增、移出及字段变化 |
| `audit_dataset` | 原文与规范字段 | 缺失、来源和原文定位检查 |

监测基线按数据集、策略、查询、范围和筛选分别保存。第一次建立基线不称为新增，零变化是正常结果。它比较本地已导入记录，不自动搜寻互联网新专利。

## 法律与权利要求

| 工具标识 | 参数与数据 | 输出 |
| --- | --- | --- |
| `analyze_legal_status` | `legalStatus`与`legalAsOf`同时存在 | 来源时点状态分布，不作实时有效性确认 |
| `analyze_claim_elements` | `patent_numbers`、可选`claim_numbers`；真实权利要求 | 分段要素、逐字引文及位置，已完成段可复用 |
| `compare_claims` | 2—5个公开编号，首项为基准；可选权利要求编号 | 跨专利要素的对应、部分重合、未发现与理由，双栏证据 |

“未发现”只表示在本次材料中没有定位。权利要求对照不作FTO、新颖性、创造性或侵权意见。人工评审和程序定位检查分开保存。

## 结果与进度

每个结果保存工具标识、数据集、参数、结构化行、来源编号、限制及时间。图表是结果的展示形式，不替换原始数据。已完成结果先保存，报告解释失败不丢弃这些结果，可仅重试报告。

计数进度只用于可计量工作；模型生成报告显示真实状态和用时，不编造百分比。停止后保留已完成结果与检查点，不保证恢复尚未完成的模型请求。
