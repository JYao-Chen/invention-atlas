'use client';
import {useState} from 'react';
import {ArrowRight,CornerUpLeft} from 'lucide-react';
export default function AgentArchitectureFlow(){
 const [path,setPath]=useState<'deep'|'chat'>('deep');
 return <figure className="architecture-map" aria-label="智能体研究流程图">
  <div className="architecture-path-choice" role="group" aria-label="研究路径"><button type="button" aria-pressed={path==='deep'} onClick={()=>setPath('deep')}>深度报告<span>持续研究与写作</span></button><button type="button" aria-pressed={path==='chat'} onClick={()=>setPath('chat')}>对话分析<span>职责节点协作</span></button></div>
  {path==='deep'?<div className="architecture-path" aria-label="深度报告流程"><p className="architecture-map-entry">研究目标 <ArrowRight size={15} aria-hidden="true"/> 讨论并确认方案</p>
   <div className="architecture-decision"><span>Agent</span><h4>当前问题，还需要什么证据？</h4><p>结合已有发现、用户反馈与章节进展，选择下一步。</p></div>
   <ol className="architecture-action-lanes"><li><strong>检索与阅读</strong><p>寻找能区分解释的资料，定位原文与完整数据。</p><code>run_analysis / read_patent</code></li><li><strong>比较与判断</strong><p>解释差异，核查条件，记录发现和证据缺口。</p><code>read_result / record_research</code></li><li><strong>写作与修订</strong><p>把有依据的判断写入章节，随新发现继续修改。</p><code>write_chapter / read_chapter</code></li></ol>
   <p className="architecture-loop-note"><CornerUpLeft size={17} aria-hidden="true"/>工具结果与章节发现回到 Agent；按论证需要继续研究。</p><div className="architecture-map-exit"><strong>完成报告</strong><span>综合结论、来源与章节版本一并保存。</span></div>
  </div>:<div className="architecture-path" aria-label="对话分析流程"><p className="architecture-map-entry">用户问题 <ArrowRight size={15} aria-hidden="true"/> Planner 制定研究计划</p>
   <ol className="architecture-chat-steps"><li><strong>确定研究范围</strong><span>Search 检索，ResearchReview 审查候选；需要时返回补检索。</span></li><li><strong>执行分析与分工</strong><span>Analysis 综合分析，Claim、Comparison、Citation 按计划执行并汇合。</span></li><li><strong>组织与检查回答</strong><span>ExecutionAudit 检查执行，Report 组织正文，Audit 核对编号与数值。</span></li></ol>
   <p className="architecture-loop-note"><CornerUpLeft size={17} aria-hidden="true"/>需要校正时，经 ReviseReport 返回报告节点，完成一次自动修订。</p><div className="architecture-map-exit"><strong>保存回答</strong><span>研究范围、实际结果和正文共同保留。</span></div>
  </div>}
  <figcaption className="architecture-role-key"><div><strong>Agent</strong><span>判断与组织行动</span></div><div><strong>Tools</strong><span>执行任务，返回实际结果</span></div><div><strong>Skills</strong><span>提供研究方法与读取约定</span></div></figcaption>
 </figure>;
}
