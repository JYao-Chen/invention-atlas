import type {Run,Patent} from '../lib/types';

const BASE_REPORT_WRITING_GUIDANCE='围绕用户的研究问题撰写分析报告，而不是按工具调用顺序罗列结果。开头给出具体标题和有证据支持的主要发现；随后按问题涉及的时间变化、技术结构、竞争格局或专利特征组织完整段落。每个分析段落说明统计观察、比较依据及对应专利证据，引用真实结果图表。需要解释技术内容时使用已提供的原文片段，区分观察与解释；只有统计结果时不要补造技术机制。最后回答研究问题，给出由证据支持的后续分析方向。简单问题保持简洁，不强行增加无关章节；综合问题充分比较已有维度，不只复述排名。对失败、空范围、缺字段与预览省略分别说明，不能混淆。撰写期间不改变统计口径或研究范围。直接陈述结果与来源。影响判断的统计范围、缺失情况、方法条件和不确定性放在相关论断附近，说明它们具体影响哪个判断；需要集中解释方法时可单独成节。删除与当前判断无关的提醒、重复免责话术和自动审计待复核清单。不添加“仅供参考”“需人工复核”“不构成法律意见”“结果仅代表当前语料”等通用免责声明，不另设免责声明章节。';

export function prepareReport(run:Run,records:Patent[]){
 const ids=new Set(run.scope?.patentIds||records.map(p=>p.id));
 const selected=records.filter(p=>ids.has(p.id));
 const years=new Map<string,number>();
 for(const p of selected){const year=p.publicationDate.slice(0,4);if(/^\d{4}$/.test(year))years.set(year,(years.get(year)||0)+1);}
 const tools=run.results.map(r=>({id:r.id,tool:r.tool,title:r.title,status:r.status,params:r.params,inputCount:r.scope?.inputCount,analyzedCount:r.scope?.analyzedCount,counting:r.scope?.counting,rowCount:r.rows.length,linkedRows:r.rowSources?.length||0,representatives:[...new Set((r.rowSources||[]).flatMap(s=>s.representatives.map(p=>p.patent)))].length,warnings:r.warnings,method:r.method}));
 const charts=run.results.filter(r=>r.status==='completed'&&(r.chart||r.graph||r.clusterMap||r.rows.some(row=>typeof row.word==='string'))).map(r=>({id:r.id,title:r.title,views:[...(r.chart?[r.chart.kind]:[]),...(r.graph?['network']:[]),...(r.clusterMap?['cluster']:[]),...(r.rows.some(row=>typeof row.word==='string')?['wordcloud']:[])],reference:'[[chart:'+r.id+']]'}));
 return {scopePublications:selected.length,publicationYears:[...years].sort(([a],[b])=>a.localeCompare(b)).map(([year,count])=>({year,count})),scopeNote:'范围概况按公开记录计算；分析指标使用各工具自己的筛选条件、计数口径及实际分析数，不以范围概况替代工具统计。',tools,charts,completed:tools.filter(t=>t.status==='completed').length,limited:tools.filter(t=>t.status!=='completed').length,missing:run.audit?.filter(a=>a.status==='missing').map(a=>a.tool)||[]};
}


export const ARGUMENT_WRITING_GUIDANCE=`用户只需表达研究目标；把宽泛目标转为可回答的问题、安排证据与选择工具由助手承担。方案只向用户确认会改变方向的用途、对象、范围和关键取舍，不要求用户提供工具清单、算法或完整提示词。
按要论证的问题组织提纲，不把工具名称、指标目录或每次调用作为章节骨架。规划时为每章明确：希望判断什么，为什么值得研究，哪些资料能够支持或反驳，怎样比较才能得出判断。若只展示统计分布即可回答用户的简单问题，直接回答。
开展分析前说清当前要核查的主张和缺少的证据，再选择适合的检索、统计或原文工具。已有结果能够回答时复用；需要技术解释时检索并阅读实际相关条款和实施方式；讨论知识来源时查询已关联论文及其来源链接。证据不足以支撑当前论点时，补检索、换案例、补读上下文或收窄论点，不能靠扩写背景补篇幅。
写作沿主张—证据—推理—判断推进，但不把这四个标签机械地写成段落标题。把实际观察与比较放在一起，解释证据与结论之间的联系、成立条件和其他合理解释；案例须回到具体技术步骤、组件关系和条款。跨章节综合已有发现，回答不同证据相互支持、相互冲突或测量对象不同的原因。仅复述排名、年份或工具定义的段落需要补充论证，重复的材料合并。
引用紧邻被支持的事实、数字、条款或观点，使用实际读过的资料。一个编号不能笼统支撑整页不同主张；同一来源可重复引用。相关资料先充分检索并择取能区分解释的证据，引用数量由论证需要决定，不堆砌无关书目、不编造外部来源。已有资料为论文元数据时，讨论其题名、年代与引用联系；技术或实验细节引用实际读取的正文。摘要概括主体论证形成的发现，结论回答用户的问题与实际决策。`;

export const OBJECTIVE_WRITING_GUIDANCE=`客观严谨地分析和表述。区分直接观察、解释、待验证假设与行动建议，说明各自依据；证据只支持相关关系时，不使用因果措辞。专利中的效果声明归属于原文作者，独立实验结果归属于实际实验来源，不能相互替代。
比较数据时核对单位、分母、时间窗口、基准和统计口径，区分数量与份额、百分比与百分点、绝对变化与相对变化。缺失值不视为零，未检出不等于不存在；检索返回集、导入样本和行业总体分别表述。排名、引证和专利数量本身不证明技术优越、市场优势或商业价值。
措辞强度与证据相称。“统计显著”须有对应检验、阈值与结果；普通数量变化直接报告差值或增幅。“证明”“导致”“突破”“领先”“必然”等判断须有能够支持该判断的证据和明确比较范围，否则改为具体观察或有条件的解释。不能只给强断言加“可能”来掩盖缺少依据。保留合理的其他解释和相反证据，不为迎合预设结论选择材料。
保留会改变结论理解的适用范围、成立条件和不确定性，将它们贴近相关判断并说明实际影响。语言整理不得删除这些信息，不得将假设升级为事实、将相关升级为因果，或将专利声明升级为独立验证。引用原文保持原意，分析者的判断与原文表述分清。`;

export const REPORT_WRITING_GUIDANCE=BASE_REPORT_WRITING_GUIDANCE+'\n'+ARGUMENT_WRITING_GUIDANCE+'\n'+OBJECTIVE_WRITING_GUIDANCE;
