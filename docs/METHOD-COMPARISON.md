# 关键词方法对比

`compare_keyword_methods` 在工作台工具注册表中运行，复用当前研究范围、项目权限、结果保存和分页读取机制，不新增表或依赖，不调用大模型、嵌入接口或其他外部 API。工具属于“热点与主题”，通用筛选为 `year_start`、`year_end`、`applicant`、`ipc`，固定按公开件计算（传入 `counting=family` 也规范为 `publication`）。计算字段为 `title/abstract`；空筛选范围返回 `unavailable`。

2026-10-29 曾同时上线检索方法对比（BM25/嵌入/RRF）和自动分类方法对比（kNN/最近质心/BM25 投票）。二者属于方法评价，与平台的专利挖掘用途无关，已在同日移除；代码保留在 Git 历史中。

## 接口和参数

开放接口为 `POST /api/tools/compare_keyword_methods`，请求结构遵循 OpenAPI 的 `{datasetId, params}`。专用参数 `top_k` 1–1000，默认20；`seed` 0–4294967295，默认42（算法确定性，无抽样）。

## 关键词

英文词项和停用词复用 `algorithms.tokens`：小写、至少3个字符，保留英文连字符，无词干化。三个方法都输出单词，使 Jaccard 在同一候选粒度上可比。标题与摘要均参与。

- **TF-IDF**：直接使用现有实现，语料内词频 TF、文档频率 DF，权重 `(1+ln(TF)) × (1+ln((N+1)/(DF+1)))`，降序。
- **TextRank**：每件专利单独分词，以4词滑窗连接窗口内不同词，边权为共现次数；合并成语料的无向加权图，不跨专利连边。阻尼0.85，悬空质量均匀分配，最多100轮，L1变化小于 `1e-8` 停止。以概率归一化的 PageRank 降序排列。无词性模型，候选为全部有效英文词。
- **YAKE 单词版**：逐专利保留词形大小写，以句号、问号、感叹号或换行分句。句内对后续最多2个有效词构建有向共现关系。五特征为大小写 `C=max(全大写次数,非句首首字母大写次数)/(1+ln(TF))`、位置 `P=ln(ln(3+出现句序号中位数))`（句号从0起）、频率 `F=TF/(所有候选平均TF+总体标准差)`、关联 `R=1+(D_left+D_right)×TF/maxTF`、句分布 `S=含词句数/总句数`；`D` 为不同邻词数/共现次数。局部分数 `H=P×R/(C+(F+S)/R)`，越小越好。为汇总语料，使用 `sum_p(1/(1+H_p))/N`，未出现视为0，最终聚合分数越大越好。这里采用项目英文分词和单词特征公式，不宣称与官方多词短语提取器输出等价。

每方法返回前N词、方法内得分、含词文献数和最多3件示例专利；词典序处理同分。三个两两重合度为 `J(A,B)=|A∩B|/|A∪B|`，两集均空时 `null`。重合度只反映一致性；没有人工关键词标注，无法报告关键词准确率。方法分数尺度不同，图表只用于查看各自排名，不以绝对分数决定方法优劣。

依据：[TextRank 原论文](https://aclanthology.org/W04-3252/)、[YAKE 官方单词特征实现](https://github.com/INESCTEC/yake/blob/master/yake/data/single_word.py)。

## 结果与复现

结果遵循 `AnalysisResult`，行以 `type` 区分：

| 行类型 | 字段 |
| --- | --- |
| `comparison_run` | `method_name/parameters/data_range/seed/metrics/elapsed_ms/sample_size` |
| `keyword` | `method_name/rank/word/keyword_score/documents/patents`，patents最多3件示例 |
| `keyword_overlap` | `method_name/other_method/intersection/union_size/jaccard` |

耗时使用单调时钟 `performance.now()`，`elapsed_ms` 为该方法提取与排序的毫秒数，不含数据库加载和结果保存。`tests/method-comparison.test.ts` 覆盖 TextRank 与 YAKE 的手算结果、工具端到端执行、保存和分页读取，以及已移除工具不再注册。
