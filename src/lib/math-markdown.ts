// Keep code and existing dollar-delimited equations untouched when upgrading old reports.
export function mathMarkdown(text:string){
 return text.split(/(`{3,}[\s\S]*?`{3,}|~{3,}[\s\S]*?~{3,}|`+[^`\n]*`+|\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g).map((part,i)=>i%2?part:part
  .replace(/\\\[([\s\S]*?)\\\]/g,(_,formula)=>`\n\n$$\n${formula.trim()}\n$$\n\n`)
  .replace(/\\\((.*?)\\\)/g,(_,formula)=>`$${formula.trim()}$`)
  .replace(/\(1\s*\+\s*ln\s*TF\)\s*\*\s*\(1\s*\+\s*ln\s*\(\(N\s*\+\s*1\)\s*\/\s*\(DF\s*\+\s*1\)\)\)/g,()=>String.raw`$(1+\ln \mathrm{TF})\left(1+\ln\frac{N+1}{\mathrm{DF}+1}\right)$`)
 ).join('');
}
