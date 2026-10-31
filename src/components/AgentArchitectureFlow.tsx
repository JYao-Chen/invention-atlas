import {ArrowDown,ArrowLeftRight} from 'lucide-react';

export default function AgentArchitectureFlow(){
 return <figure className="help-architecture-flow" aria-label="智能体研究流程图">
  <div className="help-flow-entry"><strong>用户提出问题</strong><span>讨论需求与提纲，确认研究方案</span></div>
  <ArrowDown className="help-flow-down" size={22} aria-hidden="true"/>
  <div className="help-flow-research">
   <aside className="help-flow-skills"><h4>Skills · 研究方法</h4><p>规划与选案<br/>原文研读与证据写作<br/>事实核对与中文表达</p><span>按当前任务读取，指导研究</span></aside>
   <ArrowLeftRight className="help-flow-link" size={24} aria-hidden="true"/>
   <div className="help-flow-agent"><h4>Agent · 决定下一步</h4><ol><li>理解问题，选择行动</li><li>读取结果与原文证据</li><li>补充分析，撰写与修订</li></ol><p>依据新发现继续研究</p></div>
   <ArrowLeftRight className="help-flow-link" size={24} aria-hidden="true"/>
   <aside className="help-flow-tools"><h4>Tools · 执行任务</h4><p>专利检索与统计计算<br/>引证网络与全文定位<br/>证据读取与章节保存</p><span>返回实际结果、来源和位置</span></aside>
  </div>
  <ArrowDown className="help-flow-down" size={22} aria-hidden="true"/>
  <div className="help-flow-output"><strong>专业报告</strong><span>分析结果、原文出处与章节版本一并保留</span></div>
  <figcaption>研究中可以随时补充要求；Agent根据反馈与证据调整下一步。</figcaption>
 </figure>;
}
