export type ResearchBrief={intent:string;audience:string;scope:string;questions:string[];approach:string[];changes:string};
export type ResearchPlanVersion={at:string;title:string;outline:ResearchOutlineItem[];brief:ResearchBrief|null;request:string};
export type ResearchOutlineItem={id:string;title:string;question:string;targetWords:number};
export type ResearchInput={datasetId:string;goal:string;mode:'confirm_outline'|'automatic';targetWords:number;maxModelCalls:number};
export type ResearchChapter={id:string;body:string;findings:string;evidence_ids:string[];revision:number;updated_at:string};
export type ResearchEvidence={id:string;payload:{kind:'patent'|'result'|'paper';title:string;url?:string;patent?:string;field?:string;offset?:number;quote?:string;question?:string;resultId?:string}};
export type DeepResearchTask={id:string;input:ResearchInput;title:string;status:'queued'|'running'|'awaiting_outline'|'paused'|'completed'|'failed';outline:ResearchOutlineItem[];outline_confirmed:boolean;brief?:ResearchBrief|null;planning_history?:ResearchPlanVersion[];skills?:{id:string;title:string;description:string}[];feedback:{text:string;at:string}[];error:string;report_id:string|null;updated_at:string;chapters?:ResearchChapter[];evidence?:ResearchEvidence[]};
