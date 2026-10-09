export const pageIds=['data','analysis','history','reports','settings','help'] as const;
export type NavigationState={page:typeof pageIds[number];assistant:boolean;reportId?:string};
export function restoredNavigation(saved:string|null,hash:string):NavigationState{
 if(hash.startsWith('#guide/'))return {page:'help',assistant:false};
 if(saved){try{const value=JSON.parse(saved);if(value&&pageIds.includes(value.page))return {page:value.page,assistant:value.assistant===true,reportId:typeof value.reportId==='string'?value.reportId:undefined};}catch{}}
 return {page:'data',assistant:false};
}
