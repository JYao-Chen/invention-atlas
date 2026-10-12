import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const inputs=[];
for(const [entry,outfile] of [['scripts/patent-mcp.mjs','server.mjs'],['scripts/patent-mcp-http.mjs','http-server.mjs']]){
 const result=await build({entryPoints:[entry],outfile:'integrations/patent-mcp/'+outfile,bundle:true,metafile:true,legalComments:'eof',platform:'node',target:'node22',format:'esm',banner:{js:"import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);"}});inputs.push(...Object.keys(result.metafile.inputs));
}
const packages=[...new Set(inputs.flatMap(path=>path.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//)?.[1]||[]))];
const licenses=await Promise.all(packages.map(async path=>path+'\n'+await readFile(path+'/LICENSE','utf8')));
await writeFile('integrations/patent-mcp/THIRD-PARTY-LICENSES.txt',licenses.join('\n\n'));
