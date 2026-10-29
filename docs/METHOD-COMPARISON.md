# 无训练方法对比

三个分析工具在工作台工具注册表中运行，复用当前研究范围、项目权限、结果保存和分页读取机制，不新增表或依赖。工具计算不调用大模型、嵌入接口或其他外部 API。最近质心仅计算开发集向量的类均值，不训练模型。

`compare_keyword_methods` 属于“热点与主题”；`compare_retrieval_methods` 和 `compare_classification_methods` 属于“检索与读取”，便于从已有检索工作流进入，不新增分组。通用筛选仍为 `year_start`、`year_end`、`applicant`、`ipc`。三工具固定按公开件计算（传入 `counting=family` 也会规范为 `publication`），不做同族代表件替换。

注册表列出计算涉及的字段：关键词 `title/abstract`，检索 `title/abstract/embedding/ipc/citations`，分类 `title/abstract/embedding/ipc`。这些是所用字段清单；方法对比允许字段不足时运行可用的方法，缺失情况写入 `warnings`。新数值及数组参数由后端 `parameterDescriptions` 与 OpenAPI 暴露，前端专用表单由审核方实现。空筛选范围仍返回 `unavailable`。

## 接口和参数

通过既有工具执行入口传入 `{tool, params}`（内部调用 `executeTool(tool, params, dataset, patents)`）。开放接口为 `POST /api/tools/<工具名>`，请求结构遵循现有 OpenAPI 的 `{datasetId, params}`；数据集仍受当前项目权限约束。

| 工具 | 专用参数、范围和默认值 |
| --- | --- |
| `compare_keyword_methods` | `top_k` 1–1000，默认20；`seed` 0–4294967295，默认42（算法确定性，无抽样） |
| `compare_retrieval_methods` | `query_count` 1–1000，默认50；`seed` 默认42；`bm25_k1` 0.01–10，默认1.2；`bm25_b` 0–1，默认0.75；`rrf_constant` 1–1000，默认60 |
| `compare_classification_methods` | `min_class_size` 3–10000，默认10；`development_ratio` 0.5–0.9，默认0.7；`cv_folds` 2–10，默认3；`k_candidates` 1–20个整数，每项1–100，默认 `[1,3,5,7]`；`seed`、`bm25_k1`、`bm25_b` 同上 |

`k_candidates:[5]` 固定近邻数为5，仍执行开发集交叉验证记录；多个候选按开发集宏F1选择，同分选较小值。候选k大于当前参考集时取实际可用近邻，不补造记录。已有参数 `k` 继续仅指K-means主题数；分类使用 `k_candidates`，避免改变既有工具行为。

## 关键词

英文词项和停用词复用 `algorithms.tokens`：小写、至少3个字符，保留英文连字符，无词干化。三个方法都输出单词，使 Jaccard 在同一候选粒度上可比。标题与摘要均参与。

- **TF-IDF**：直接使用现有实现，语料内词频 TF、文档频率 DF，权重 `(1+ln(TF)) × (1+ln((N+1)/(DF+1)))`，降序。
- **TextRank**：每件专利单独分词，以4词滑窗连接窗口内不同词，边权为共现次数；合并成语料的无向加权图，不跨专利连边。阻尼0.85，悬空质量均匀分配，最多100轮，L1变化小于 `1e-8` 停止。以概率归一化的 PageRank 降序排列。无词性模型，候选为全部有效英文词。
- **YAKE 单词版**：逐专利保留词形大小写，以句号、问号、感叹号或换行分句。句内对后续最多2个有效词构建有向共现关系。五特征为大小写 `C=max(全大写次数,非句首首字母大写次数)/(1+ln(TF))`、位置 `P=ln(ln(3+出现句序号中位数))`（句号从0起）、频率 `F=TF/(所有候选平均TF+总体标准差)`、关联 `R=1+(D_left+D_right)×TF/maxTF`、句分布 `S=含词句数/总句数`；`D` 为不同邻词数/共现次数。局部分数 `H=P×R/(C+(F+S)/R)`，越小越好。为汇总语料，使用 `sum_p(1/(1+H_p))/N`，未出现视为0，最终聚合分数越大越好。这里采用项目英文分词和单词特征公式，不宣称与官方多词短语提取器输出等价。

每方法返回前N词、方法内得分、含词文献数和最多3件示例专利；词典序处理同分。三个两两重合度为 `J(A,B)=|A∩B|/|A∪B|`，两集均空时 `null`。重合度只反映一致性；没有人工关键词标注，无法报告关键词准确率。方法分数尺度不同，图表只用于查看各自排名，不以绝对分数决定方法优劣。

依据：[TextRank 原论文](https://aclanthology.org/W04-3252/)、[YAKE 官方单词特征实现](https://github.com/INESCTEC/yake/blob/master/yake/data/single_word.py)。

## 检索及伪标注

授权件识别：来源状态恰为 `Granted/grant/授权/已授权`，或公开编号以B/C类文献种类码结尾。`active/有效` 本身不作授权依据。按公开编号排序后，用32位LCG（`state=1664525×state+1013904223 mod 2^32`）执行 Fisher–Yates 抽样；默认取50件，不足时取全部。查询文本是查询专利标题+摘要，三个方法均排除查询专利自身。

BM25的词频来自标题+摘要，查询词去重；`idf(t)=ln(1+(N-df(t)+0.5)/(df(t)+0.5))`，`score(q,d)=Σ idf(t)×tf(t,d)×(k1+1)/(tf(t,d)+k1×(1-b+b×|d|/avgdl))`。索引在整个当前语料构建一次，排除自身只作用于候选，不修改语料统计。零分不返回。向量方法只用库中已存嵌入，查询向量直接来自查询专利自身，按余弦 `a·b/(||a|| ||b||)` 降序排序。融合使用两路完整排名：`RRF(d)=Σ 1/(rrf_constant+rank(d))`，排名从1起，未出现的候选无该路贡献，融合按得分降序。所有排序同分均按公开编号。

分别建立两套**二元**伪相关池，不混合为分级相关：

1. `basis=citation` 强相关：当前语料内查询引用的，或引用查询的专利。编号按已有 `citationKey` 大写、去标点及公开种类码规则匹配；同基础编号的公开版本均可能匹配，排除本件。
2. `basis=ipc` 弱相关：任意一个有效IPC主组与查询相同，排除本件。例 `G06F 16/35 → G06F16/00`；不将CPC当IPC。此处可用任意IPC，与分类仅用第一个IPC的标签规则不同。

对于k=5、10：`P@k=前k项相关数/k`（返回不足k也除以k），`Recall@k=前k项相关数/语料内相关池总数`；`DCG@k=Σ rel_i/log2(i+1)`，`nDCG@k=DCG/IDCG`，`rel_i∈{0,1}`。三项指标都仅对当前口径至少有1个伪相关对象的查询取算术平均；`evaluated_queries` 明示分母，全部无正例时三个指标均为 `null`。无正例查询仍计入执行查询数 `sample_size` 和耗时。不能将null解释为0效果。

每次输出引用字段非空覆盖率 `citation_coverage`，以及有语料内入/出向互引的覆盖率 `internal_citation_coverage`。必须保留警告：“伪标注，非人工评判；引用覆盖率不足时查全率被低估”。缺失与零引用无法区分，引用覆盖不完整、同组IPC未必语义相关，且分母仅限已导入语料，因此指标不能作为人工或全球检索质量结论。无引用时保留BM25/IPC结果，强相关指标为null。

非有限、空或零嵌入被排除；语料存在多种有效嵌入维度时跳过全部向量方法并警告，不猜测哪个模型可比较。缺嵌入查询不进入向量/RRF；BM25仍覆盖全部抽样查询，向量候选限可用向量件，RRF保留BM25完整候选。各方法 `query_ids` 和 `sample_size` 明示实际查询范围，范围不同时不能直接把指标差异归因于算法。同维向量也可能来自不同模型，现有Patent没有嵌入模型版本字段，需数据提供者核对。

## 自动分类与留出纪律

标签是**第一个IPC**规范化后的主组；不回退到第二个IPC。丢弃首个IPC无效的记录及未达阈值的类别。按类别字典序、类内公开编号排序，固定种子打乱，每类开发件数为 `max(2,min(n-1,floor(n×development_ratio)))`，其余留出；默认目标7:3，取整与小类约束会改变实际比例。没有合格类别返回 `unavailable`。

代码分为 `stratifiedSplit → selectClassification(development, …) → evaluateClassification(selected, holdout)`。选参函数只接收开发数据，所有方法选参完成后才检查留出嵌入可用性并进入留出预测；留出嵌入缺失或维度异常不会改变开发集选出的参数。交叉验证折数取请求折数与开发集最小类件数的较小值，同类打乱后轮流分折，每个候选按各折宏F1的均值比较；每折每个查询只生成一次近邻排名，各候选复用其前k项。每折只从该折训练部分计算IDF、邻居及质心。所有最终方法只以完整开发集作为参考，留出集既不贡献IDF、质心、邻居，也不贡献k选择；每方法在一次工具运行中只进行一次留出预测评分，不按留出效果调整参数。

- **kNN**：已存嵌入的余弦最近邻，前k件等权投票；同票比较近邻余弦得分之和，再按标签字典序。
- **最近质心**：先单位化每个开发向量，再按标签取均值；查询与类均值做余弦，降序选类。无k可调，仍记录开发集CV结果；附最近一件开发集嵌入邻居作为解释，邻居本身不等同于质心决策依据。
- **BM25投票**：只从开发集建立文本索引，查询标题+摘要，前k个正分近邻等权投票；同票比较BM25分数之和，再按标签字典序。没有正分邻居时弃答，预测为null，不回退多数类，按错误评分。

指标：`accuracy=正确件数/留出件数`；每类 `F1=2TP/(2TP+FP+FN)`，分母为0时该类F1取0，`macro_f1` 是全部合格标签F1均值；`top3_accuracy=真实标签进入最多3个返回标签的件数/留出件数`。投票只有实际被近邻支持的标签，不补造Top-3；质心按全部类余弦取前3。留出没有可评估样本时指标为null。

BM25使用全部合格开发/留出样本；嵌入方法在同一固定划分内排除不可用向量，仍要求全部合格类各有至少2件可用开发样本，且开发集有效向量维度一致，否则跳过该方法。留出集只在选参完成后检查向量是否有效且维度匹配开发集，不参与选参。范围及排除编号写入 `data_range`，不足样本和不可比覆盖在warnings中说明。每条预测附 `neighbors:[{patent,score}]`，仅来自开发集，`score_kind` 区分余弦与BM25。

这是一轮固定随机留出评价。同族或重复文本可能跨集合，不能推断跨时间、跨同族或新数据集的泛化能力；本任务不为提高指标改变划分或调参范围。方法与参数候选应在查看留出结果之前确定，反复运行后挑选最好留出结果会破坏留出纪律。

## 结果、耗时及复现

结果遵循 `AnalysisResult`：`rows/chart/summary/method/warnings/evidence`，保留scope和逐行来源，所有新增顶层行字段均在 `fieldDefinitions` 中解释。混合类型行以 `type` 区分：

| 行类型 | 字段 |
| --- | --- |
| `comparison_run` | 统一 `method_name/parameters/data_range/seed/metrics/elapsed_ms/sample_size`；检索再含 `basis/k/precision/recall/ndcg/evaluated_queries/query_ids/citation_coverage/internal_citation_coverage/mean_query_ms/setup_ms`；分类再含 `accuracy/macro_f1/top3_accuracy/development_size/holdout_size/cv_scores/cv_fold_ids/selection_ms/abstentions` |
| `keyword` | `method_name/rank/word/keyword_score/documents/patents`，patents最多3件示例 |
| `keyword_overlap` | `method_name/other_method/intersection/union_size/jaccard` |
| `retrieval_query` | `method_name/query_patent/hits/patents/strong_relevant/weak_relevant/elapsed_ms`，hits和patents仅展示前10，评价池保留完整编号 |
| `classification_prediction` | `method_name/patent/actual_label/predicted_label/top_labels/neighbors/score_kind/patents` |

`data_range` 保存精确编号。分类额外保存实际开发/留出编号、嵌入缺失排除编号；`cv_fold_ids` 只含开发集编号，可独立复核隔离。统一运行记录随原有结果机制保存，无新增数据库表或迁移。结果读取继续使用既有 `/api/results/<id>` 分页接口。

耗时使用单调时钟 `performance.now()`，毫秒：关键词 `elapsed_ms` 为提取与排序；检索 `setup_ms` 为一次BM25索引构建、`mean_query_ms` 为查询平均耗时（RRF包含两路与融合），`elapsed_ms` 为查询耗时合计；同一方法在不同k/口径的耗时重复展示，不能累加。分类 `selection_ms` 单列全部开发集CV耗时，`elapsed_ms` 为选参后开发集统计构建及一次留出预测评分。以上均不含数据库加载、结果保存与传输；检索不计伪相关池构建。单次小夹具计时不能作为生产吞吐结论，硬件/运行负载会改变耗时。

本地验证（只连接独立测试库）：

```sh
npm ci
npm run typecheck
PG_TEST_DATABASE_URL=postgresql://atlas_dev@127.0.0.1:55417/atlas_test npm test
```

`tests/method-comparison.test.ts` 包含算法确定性、手算指标、分层重现、留出污染无法改变已选参数、缺嵌入/缺引用/混合维度降级、三个工具端到端及原有保存/读取机制。夹具有3类、每类12件，三个独立主题的正交向量与标题词明确分离，故分类准确率/宏F1/Top-3均为1仅说明链路正确，不证明真实专利分类效果。

### 夹具示例输出

2026-10-29本地运行上述36件夹具，`seed=42`，关键词 `top_k=3`，检索 `query_count=4`，分类使用默认参数：

| 工具/口径 | 方法 | 示例结果 |
| --- | --- | --- |
| 关键词 | TF-IDF | battery、camera、electrode，各8.548167 |
| 关键词 | TextRank | battery、camera、electrode，各0.111111 |
| 关键词 | YAKE聚合 | battery、camera、electrode，各0.265918 |
| 关键词重合 | 三组两两比较 | Jaccard均为1 |
| 检索/互引@5 | BM25、向量、RRF | P=0.2、Recall=0.5、nDCG=0.243915 |
| 检索/IPC@5 | BM25、向量、RRF | P=1、Recall=0.454545、nDCG=1 |
| 分类/12件留出 | kNN、最近质心、BM25投票 | accuracy=macro_f1=top3_accuracy=1；开发集24件；kNN和BM25选中k=1 |

引用非空覆盖率33/36=91.67%，语料内互引覆盖率100%；查询为 `US1005B1/US1010B1/US1004B1/US2005B1`。一次本地运行的平均查询耗时：BM25 0.0460ms，向量0.0183ms，RRF 0.0934ms；分类留出阶段耗时分别0.222/0.131/0.098ms。这些是小夹具单次观测，不用于速度优劣结论。

一条分类解释行（节选）：

```json
{"type":"classification_prediction","method_name":"knn","patent":"US3002B1","actual_label":"G02B6/00","predicted_label":"G02B6/00","top_labels":["G02B6/00"],"neighbors":[{"patent":"US3001B1","score":1}],"score_kind":"cosine"}
```
