'use client';
import {useId,useState} from 'react';
function Box({x,y,w=260,title,lines=[],accent=false}:{x:number;y:number;w?:number;title:string;lines?:string[];accent?:boolean}){
 const height=lines.length>1?94:72;
 return <g className={accent?'architecture-svg-node is-agent':'architecture-svg-node'}><rect x={x} y={y} width={w} height={height} rx={6}/><text x={x+16} y={y+27} className="architecture-svg-title">{title}</text>{lines.map((line,i)=><text key={line} x={x+16} y={y+50+i*21} className="architecture-svg-detail">{line}</text>)}</g>;
}
const mobile={
 deep:[['用户与方案','用户给出目标。Agent 用 propose_outline 保存方案，confirm_outline 等待确认；反馈返回同一研究任务。'],['研究 Agent 决策','同一个 Deep Agent 结合任务状态、已读 Skill 和工具返回，决定下一次调用。'],['调用工具并接收结果','run_analysis 返回结果编号；read_result 取明细，read_patent 取原文与证据编号。返回内容进入下一轮模型上下文。'],['更新研究与章节','record_research 保存发现、缺口和下一步；write_chapter 保存正文、来源与版本。它们可与检索、分析、阅读交替发生。'],['恢复状态并继续','每轮调用前注入用户反馈、预算、未完成章节和近期研究记录；暂停后从 checkpoint 恢复消息与执行状态。'],['全文核对与交付','read_report 读取全文和章节版本；修订后重新核对，finish_report 校验交付条件并保存报告。']],
 chat:[['Planner → Search','规划节点交出工具步骤与范围；检索节点执行查询，保存候选编号与检索来源。'],['Search ↔ ResearchReview','范围审查根据问题与候选摘要决定剔除或补检索，最多补检索两轮，再交出确定范围。'],['Analysis → 三条分支','综合分析后，Claim、Comparison、Citation 并行执行各自计划中的工具；无对应步骤的分支直接返回。'],['三条分支 → ExecutionAudit','等待三个分支汇合，核对计划与实际执行结果，把结果目录交给报告节点。'],['Report → Audit → 完成','模型根据结果组织正文，程序核对公开编号和数值。需要校正时经 ReviseReport 返回 Report，最多一次自动修订。']]
};
export default function AgentArchitectureFlow(){
 const [path,setPath]=useState<'deep'|'chat'>('deep'),id=useId(),arrow=id+'-arrow';
 const edge=(d:string,label?:string,x=0,y=0,dashed=false)=><g><path d={d} markerEnd={`url(#${arrow})`} className={dashed?'architecture-svg-edge is-guidance':'architecture-svg-edge'}/>{label&&<text x={x} y={y} className="architecture-svg-label">{label}</text>}</g>;
 return <figure className="architecture-map" aria-label="两条 Agent 执行路径与消息交接">
  <div className="architecture-path-choice" role="group" aria-label="研究路径"><button type="button" aria-pressed={path==='deep'} onClick={()=>setPath('deep')}>深度报告<span>一个 Deep Agent 的连续工具调用</span></button><button type="button" aria-pressed={path==='chat'} onClick={()=>setPath('chat')}>对话分析<span>LangGraph 节点的状态交接</span></button></div>
  <p className="architecture-flow-intro">{path==='deep'?'模型在每次工具返回后继续判断；分析、阅读、写作和修订可以交替发生。':'箭头表示职责节点之间的控制流；计划、范围和结果通过同一次运行的状态交接。'}</p>
  <svg className="architecture-flow-svg" viewBox={path==='deep'?'0 0 1040 650':'0 0 1040 890'} role="img" aria-labelledby={id+'-title '+id+'-desc'}>
   <title id={id+'-title'}>{path==='deep'?'深度研究 Agent 与技能、工具和持久状态的交互':'LangGraph 对话分析节点与条件路由'}</title><desc id={id+'-desc'}>{mobile[path].map(([title,body])=>title+'：'+body).join('。')}</desc>
   <defs><marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>
   {path==='deep'?<>
    <Box x={350} y={20} w={350} title="用户目标与方案确认" lines={['propose_outline → confirm_outline']}/>
    {edge('M525 92 V170','确认方案；后续反馈进入同一任务',550,137)}
    <Box x={350} y={170} w={350} title="研究 Agent · Deep Agents" lines={['选择下一步、组织参数、解释返回结果','一次模型调用 → 工具返回 → 再次判断']} accent/>
    <Box x={20} y={170} w={260} title="Skills · 研究方法" lines={['read_file 读取 SKILL.md','规划、研读、论证、核对、中文表达']}/>
    {edge('M280 213 H350','方法指导',284,197,true)}
    {edge('M525 264 V345','工具名、参数与当前研究问题',548,308)}
    <Box x={350} y={345} w={350} title="Tools · 执行实际操作" lines={['分析 / 读结果 / 读原文 / 写章节','返回结果编号、证据位置、章节版本']}/>
    {edge('M700 391 H930 V218 H700','工具返回进入下一轮上下文',715,342)}
    <Box x={20} y={345} w={260} title="任务状态与研究记忆" lines={['研究记录、证据目录、章节及版本','checkpoint 保存消息与执行状态']}/>
    {edge('M350 391 H280','保存',293,376)}
    {edge('M150 345 V300 H375 V264','每轮注入反馈、预算、章节发现与待解问题',30,287,true)}
    {edge('M525 439 V525','read_report 全文核对；必要时返回修订',550,485)}
    <Box x={350} y={525} w={350} title="finish_report · 保存到报告库" lines={['核对章节版本、目标字数与缺口处理']}/>
   </>:<>
    <Box x={40} y={55} title="Planner · 规划" lines={['生成工具步骤与研究范围']}/><Box x={370} y={55} title="Search · 检索" lines={['候选编号、检索来源']}/><Box x={700} y={55} title="ResearchReview · 范围审查" lines={['保留、剔除或补检索']}/>
    {edge('M300 91 H370','计划',318,78)}{edge('M630 91 H700','候选',648,78)}{edge('M830 55 V18 H500 V55','补检索：最多两轮',558,12)}
    {edge('M830 127 V172 H500 V210','确定范围',612,160)}
    <Box x={370} y={210} title="Analysis · 综合分析" lines={['保存统计、主题、主体等结果']}/>
    {edge('M500 282 V320 H170 V355')}{edge('M500 282 V355','按计划分派；三条分支并行',530,306)}{edge('M500 320 H830 V355')}
    <Box x={40} y={355} title="Claim · 权利要求" lines={['analyze_claim_elements']}/><Box x={370} y={355} title="Comparison · 条款比较" lines={['compare_claims']}/><Box x={700} y={355} title="Citation · 引证网络" lines={['analyze_citation_network']}/>
    <path d="M170 427 V470 H500 M830 427 V470 H500" className="architecture-svg-edge"/>{edge('M500 427 V505','等待三个分支汇合',530,491)}
    <Box x={370} y={505} title="ExecutionAudit · 执行检查" lines={['核对计划、完成情况与结果']}/>{edge('M500 577 V620','结果目录',518,605)}
    <Box x={370} y={620} title="Report · 组织回答" lines={['模型读取结果、范围与原文']}/><Box x={700} y={620} title="Audit · 内容检查" lines={['程序核对编号与数值']}/>{edge('M630 656 H700','正文',648,643)}
    {edge('M830 692 V735 H500 V692','需要校正 → ReviseReport → 最多一次自动修订',370,760)}
    {edge('M960 656 H1015 V826 H960','通过',970,728)}<Box x={700} y={790} title="完成回答" lines={['保留范围、结果与报告正文']}/>
   </>}
  </svg>
  <ol className="architecture-mobile-flow">{mobile[path].map(([title,body])=><li key={title}><strong>{title}</strong><p>{body}</p></li>)}</ol>
  <figcaption className="architecture-flow-caption">{path==='deep'?'实线：控制与工具返回。虚线：方法指导与状态注入。所有工具调用由同一个研究 Agent 发起。':'Claim、Comparison、Citation 按计划执行；没有对应步骤时直接返回。模型参与规划、范围审查和报告组织，其余节点承担工具执行或程序检查。'}</figcaption>
 </figure>;
}
