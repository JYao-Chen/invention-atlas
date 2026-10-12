import type {Patent} from '../lib/types';

export type SearchField='all'|'title'|'abstract'|'claims'|'description'|'applicant'|'inventor'|'ipc'|'cpc'|'publication';
export type SearchExpression={kind:'term';field:SearchField;value:string}|{kind:'not';child:SearchExpression}|{kind:'and';left:SearchExpression;right:SearchExpression}|{kind:'or';left:SearchExpression;right:SearchExpression};
const fields=new Set(['all','title','abstract','claims','description','applicant','inventor','ipc','cpc','publication']);
type Token={value:string;quoted:boolean};
function tokenize(query:string){
 const tokens:Token[]=[];let index=0;
 while(index<query.length){
  if(/\s/.test(query[index])){index++;continue;}
  const character=query[index];
  if('():'.includes(character)){tokens.push({value:character,quoted:false});index++;continue;}
  if(character==='"'){
   const end=query.indexOf('"',index+1);if(end<0)throw new Error('检索短语缺少结束引号');
   const value=query.slice(index+1,end).trim();if(!value)throw new Error('检索短语不能为空');
   tokens.push({value,quoted:true});index=end+1;continue;
  }
  const start=index;while(index<query.length&&!/[\s():"]/.test(query[index]))index++;
  tokens.push({value:query.slice(start,index),quoted:false});
 }
 return tokens;
}
export function isBooleanQuery(query:string){return /\b(?:AND|OR|NOT)\b|[()"]|\b\w+:/.test(query);}
export function parseBooleanQuery(query:string):SearchExpression{
 if(query.length>2000)throw new Error('检索式不能超过2000字符');
 const tokens=tokenize(query);let index=0;
 const operator=(value:string)=>tokens[index]&&!tokens[index].quoted&&tokens[index].value.toUpperCase()===value;
 const primary=(field:SearchField,depth:number):SearchExpression=>{
  if(depth>30)throw new Error('检索括号嵌套过多');
  if(operator('NOT')){index++;return {kind:'not',child:primary(field,depth+1)};}
  if(operator('(')){index++;const expression=or(field,depth+1);if(!operator(')'))throw new Error('检索式缺少右括号');index++;return expression;}
  const token=tokens[index++];if(!token||!token.quoted&&['AND','OR',')',':'].includes(token.value.toUpperCase()))throw new Error('检索运算符附近缺少检索词');
  if(tokens[index]?.value===':'&&!token.quoted){
   index++;const name=token.value.toLowerCase();if(!fields.has(name))throw new Error('不支持的检索字段：'+token.value);
   return primary(name as SearchField,depth+1);
  }
  if(token.value.includes('*')&&!/^.+\*$/.test(token.value)||token.value.slice(0,-1).includes('*'))throw new Error('通配符仅支持词尾的单个星号');
  if(token.quoted&&token.value.includes('*'))throw new Error('引号短语不支持通配符');
  return {kind:'term',field,value:token.value.toLowerCase()};
 };
 const and=(field:SearchField,depth:number):SearchExpression=>{
  let expression=primary(field,depth);
  while(index<tokens.length&&!operator('OR')&&!operator(')')){if(operator('AND'))index++;expression={kind:'and',left:expression,right:primary(field,depth)};}
  return expression;
 };
 const or=(field:SearchField,depth:number):SearchExpression=>{
  let expression=and(field,depth);while(operator('OR')){index++;expression={kind:'or',left:expression,right:and(field,depth)};}return expression;
 };
 if(!tokens.length)throw new Error('检索式不能为空');
 const expression=or('all',0);if(index!==tokens.length)throw new Error('检索式存在多余右括号或符号');return expression;
}
function textFields(patent:Patent,field:SearchField){
 const values:Record<SearchField,string[]>={all:[],title:[patent.title],abstract:[patent.abstract],claims:patent.claims.map(c=>c.text),description:[patent.description],applicant:patent.applicants,inventor:patent.inventors,ipc:patent.ipc,cpc:patent.cpc,publication:[patent.publicationDate]};
 return field==='all'?Object.entries(values).filter(([name])=>name!=='all').flatMap(([,value])=>value):values[field];
}
export function matchesBoolean(patent:Patent,expression:SearchExpression):boolean{
 if(expression.kind==='not')return !matchesBoolean(patent,expression.child);
 if(expression.kind==='and')return matchesBoolean(patent,expression.left)&&matchesBoolean(patent,expression.right);
 if(expression.kind==='or')return matchesBoolean(patent,expression.left)||matchesBoolean(patent,expression.right);
 const term=expression.value;return textFields(patent,expression.field).some(source=>{
  const value=source.toLowerCase();if(!term.endsWith('*'))return value.includes(term);
  const prefix=term.slice(0,-1);return value.split(/[\s,.;:()\[\]{}]+/).some(word=>word.startsWith(prefix));
 });
}
export function requiresFullText(expression:SearchExpression):boolean{
 if(expression.kind==='term')return expression.field==='all'||expression.field==='description';
 if(expression.kind==='not')return requiresFullText(expression.child);
 return requiresFullText(expression.left)||requiresFullText(expression.right);
}
