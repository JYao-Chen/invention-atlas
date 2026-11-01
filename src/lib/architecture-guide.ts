import {TOOL_DEFS} from './tool-definitions';

const table=(headers:string[],rows:string[][])=>[headers,headers.map(()=>'---'),...rows].map(row=>'| '+row.join(' | ')+' |').join('\n');
export const agentNodeRows=[
 ['Planner · 规划','问题、当前数据、上一轮范围','生成工具步骤与参数，选择全库、检索候选集或延续上轮范围；把计划和范围交给 Search。'],
 ['Search · 检索','计划中的检索词与范围','执行 search_patents，合并候选公开编号并保留每次检索来源；交给 ResearchReview。'],
 ['ResearchReview · 范围审查','用户问题、候选标题摘要、已执行检索、工具计划','判断候选是否覆盖问题，记录剔除编号及理由；需要补检索时生成新查询返回 Search，最多补检索两轮；随后交给 Analysis。'],
 ['Analysis · 综合分析','审查后的范围与计划','执行趋势、关键词、主题、主体等工具，保存真实结果；完成后同时进入 Claim、Comparison、Citation 三条职责分支。'],
 ['Claim · 权利要求分析','计划、公开编号、已有筛查结果','执行 analyze_claim_elements；计划未指定编号且已有指标筛查代表件时，采用该代表件。'],
 ['Comparison · 权利要求比较','计划中的基准与对照专利','执行 compare_claims，整理实际条款之间的要素对应。'],
 ['Citation · 引证分析','计划中的引证分析步骤','执行 analyze_citation_network，返回引证、共引或耦合结果。'],
 ['ExecutionAudit · 执行检查','计划与各分支实际结果','等待三条分支汇合，核对工具执行情况并保存结果；交给 Report。'],
 ['Report · 报告组织','问题、范围、结果、原文及已有检查意见','调用模型组织分析正文和图表引用，向前端输出回答；交给 Audit。'],
 ['Audit · 内容检查','报告正文、工具结果、数据集信息','核对公开编号与数值；通过后结束，需要校正时交给 ReviseReport。'],
 ['ReviseReport · 修订路由','Audit 发现的问题','登记修订次数并返回 Report，完成一次自动修订后结束本轮。'],
] as const;
export const agentNodeTable=table(['节点','接收什么','执行与交接'],agentNodeRows.map(row=>[...row]));
const toolDetails:Record<string,[string,string]>={
 analyze_patent_reading:['指定专利与阅读问题','逐段整理技术问题、解决手段、技术效果及原文依据'],
 search_patent_passages:['查询词、公开编号或范围','相关原文片段、字段、文档版本与位置'],
 search_patents:['查询词、分类、年份、申请人、返回数量','命中记录、公开编号与检索方法'],
 read_patent_details:['公开编号','元数据、摘要、权利要求、说明书及来源'],
 get_dataset_summary:['数据集或筛选范围','记录总数、年份、字段覆盖与基础分布'],
 analyze_patent_trend:['公开日期、时间粒度、筛选条件','各时间段公开量与趋势数据'],
 analyze_lifecycle:['时间范围与公开日期','累计公开曲线、阶段统计与拟合结果'],
 analyze_ipc_distribution:['IPC、筛选范围、计数口径','分类数量、份额与专利关联'],
 analyze_country_distribution:['公开编号与范围','公开局分布及对应记录'],
 generate_wordcloud:['标题摘要、关键词数量','词项、词频或权重与对应记录'],
 analyze_burst_terms:['年度文本、词项数量','突现词、起止区间与强度'],
 analyze_yearly_keywords:['年份、标题摘要、每年词数','逐年关键词、权重与变化'],
 analyze_clustering:['语义向量、主题数量、范围','主题成员、关键词、代表专利和可视化坐标'],
 analyze_co_network:['申请人、筛选范围','共同申请网络、边权与主体连接'],
 analyze_competitor_evolution:['申请人、年份、IPC','主体年度变化与技术布局'],
 analyze_entity_portfolio:['申请人、分类和计数口径','主体专利组合、技术覆盖与比较'],
 analyze_concentration:['申请人及计数口径','主体份额、集中度与排名'],
 analyze_tech_roadmap:['公开日期与引证关系','引证主路径、节点及关联专利'],
 analyze_patent_valuation:['公开日期及引证等字段','引证相关指标、排序与候选代表件'],
 analyze_tech_matrix:['选定专利与技术维度','逐段提取技术与效果要素，形成案例矩阵'],
 analyze_citation_network:['引证关系与网络类型','引证网络、共引或文献耦合及节点指标'],
 analyze_family_geography:['同族成员及地域字段','同族地域覆盖、分布与记录关联'],
 audit_search_strategy:['多组检索式、同一研究范围','各策略命中量、重叠、差异与对应记录'],
 monitor_patent_changes:['监测策略与已保存基线','当前快照和基线的新增、变化与监测记录'],
 analyze_legal_status:['状态、来源时点及范围','按资料来源时点组织的法律状态分布'],
 analyze_claim_elements:['选定专利、权利要求编号','条款要素、技术特征与原文依据'],
 compare_claims:['基准专利、对照专利与条款','逐项特征对应、差异与条款依据'],
 audit_dataset:['数据集或指定范围','重复、字段、日期与记录一致性检查结果'],
 compare_keyword_methods:['同一文本范围、词项数量','TF-IDF、TextRank、YAKE 关键词与交集比较'],
};
export const analyticalToolRows=TOOL_DEFS.map(([id,title,group])=>({id,title:title.replace('（非估值）',''),group,input:toolDetails[id][0],output:toolDetails[id][1]}));
export const analyticalToolTable=table(['工具名称与标识','主要输入','作用与产出'],analyticalToolRows.map(t=>[`${t.title} \`${t.id}\``,t.input,t.output]));
export const researchToolRows=[
 ['research_state','进入任务、续写或收到反馈时','读取目标、数据集、用户补充要求、提纲、章节发现、证据目录及分析工具约定。'],
 ['propose_outline','理解需求或调整研究方向后','保存标题、章节及目标字数，同时保存研究意图、读者、范围、方法、待确认问题和本轮改动。'],
 ['confirm_outline','方案准备好时','确认模式暂停等待用户；用户提出修改后返回规划；确认后继续研究，全自动模式直接继续。'],
 ['run_analysis','需要统计、检索或结构化全文分析时','说明当前研究问题，再按工具标识与参数调用分析工具，保存完整结果并返回结果编号和20行预览；深度研究目录提供除数据变化监测外的28项分析工具。'],
 ['read_result','需要完整明细或核查某项结论时','按结果编号分页读取；按公开编号、词项、年份或分区定位实际行，返回方法与原始行关联。'],
 ['read_evidence','已有证据可回答当前问题时','按证据编号恢复已读片段、字段、位置和引用标记，供后续比较与写作复用。'],
 ['read_patent','需要阅读具体原文时','指定公开编号、阅读问题、摘要／权利要求／说明书字段；可按词句定位或偏移分页，保存逐字片段及证据编号。'],
 ['read_patent_papers','需要研究专利与科学论文的联系时','读取指定专利已登记的论文元数据、引用关系和来源链接，登记论文来源。'],
 ['record_research','形成实质发现、识别缺口或改变方向时','保存研究问题、发现、证据编号、剩余缺口、下一步和涉及章节；后续模型调用读取近期记录，用户可回溯判断怎样更新。'],
 ['read_chapter','续写、交叉比较或修订时','恢复指定章节的正文、发现、证据和版本。'],
 ['write_chapter','一章分析成形或修订完成时','保存完整章节正文、具体发现和证据编号；保留历史版本，供后续章节读取。'],
 ['finish_report','章节完成且达到目标字数时','检查章节与字数，按提纲组装报告并保存到报告库，结束研究任务。'],
] as const;
export const researchToolTable=table(['研究工具','调用时机','作用与交付对象'],researchToolRows.map(([id,when,effect])=>[`\`${id}\``,when,effect]));
export const skillRows=[
 ['research-planning','研究规划','默认确认模式的方案讨论阶段','先读 research_state，理解用途、对象和问题；用 propose_outline 交付可讨论方案，再调用 confirm_outline 等待用户。','研究意图、范围、方法、待确认问题和章节提纲'],
 ['research-iteration','持续研究与论证','主体研究、写作中出现疑问或跨章冲突时','读取阶段记录，围绕未解问题补检索、分析、阅读和写作；发现变化后用 record_research 更新判断，再修订相关章节。','可回溯的研究发现、缺口处理和章节修订'],
 ['patent-landscape','专利全景分析','确认方案后的研究与比较','选择统计口径与工具；用 read_result 查完整明细，交叉比较年份、主体、主题与网络，按真实成员选择案例。','分布比较、主题与主体关系、代表案例'],
 ['patent-close-reading','专利原文研读','代表案例、技术特征或条款研究','先查证据目录并复用 read_evidence；带具体问题读取字段，按 find 或 nextOffset 补充上下文，保留逐字片段和位置。','条款要素、实施方式、可定位的原文证据'],
 ['evidence-writing','证据驱动写作','章节论证与摘要组织','围绕每章研究问题组织结果、比较和原文；用来源和图表标记引用，通过 write_chapter 保存正文与新增发现。','章节正文、引用和后续章节可用的发现'],
 ['report-revision','事实核对与修订','跨章检查、用户纠正或交付前','read_chapter 取回正文，read_result／read_patent 回查数字、成员和引文，修订完整章节并核对摘要。','修订版本、一致的数字与交叉引用'],
 ['chinese-style','中文表达整理','事实与结构确定后的文字整理','定向处理翻案腔、空泛套话和重复句式，保留事实、来源、段落结构及作者语气。','整理后的专业中文正文'],
] as const;
export const skillTable=table(['Skill 与名称','何时读取','怎样使用工具与方法','形成什么'],skillRows.map(([id,title,when,method,result])=>[`${title} \`${id}\``,when,method,result]));
export const frameworkToolRows=[
 ['`write_todos`','维护研究步骤的待办状态','记录工作进度；方案与正式章节由 propose_outline、write_chapter 保存。'],
 ['`ls`','查看虚拟目录中的文件','查看可读的技能目录与任务文件。'],
 ['`glob`','按路径模式查找文件','找到相关 SKILL.md 或任务文件。'],
 ['`grep`','按内容查找文件中的词句','定位技能约定或已写入任务文件的相关内容。'],
 ['`read_file`','按路径读取文件内容','读取 /skills/ 下的方法文件及其他任务文件；专利资料使用 read_patent，完整分析行使用 read_result。'],
 ['`write_file`','写入执行线程内的虚拟任务文件','整理研究工作材料；技能目录保持只读，正式报告章节通过 write_chapter 保存。'],
 ['`edit_file`','修改执行线程内的虚拟任务文件','更新工作材料；报告正文通过章节版本机制修订。'],
] as const;
export const frameworkToolTable=table(['框架工具','实际作用','与研究工具的关系'],frameworkToolRows.map(row=>[...row]));
