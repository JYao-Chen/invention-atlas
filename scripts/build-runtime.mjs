import {build} from 'esbuild';
import {cp,mkdir} from 'node:fs/promises';
const root='.next/standalone';
await mkdir(root+'/scripts',{recursive:true});
for(const entry of ['agent-worker','migrate-postgres','import-sqlite-postgres','verify-postgres-import','initialize-admin'])await build({entryPoints:['scripts/'+entry+'.ts'],outfile:root+'/scripts/'+entry+'.mjs',bundle:true,platform:'node',format:'esm',packages:'external',target:'node22',logLevel:'warning'});
await cp('migrations',root+'/migrations',{recursive:true});
await import('./build-patent-mcp.mjs');
await cp('integrations/patent-mcp',root+'/integrations/patent-mcp',{recursive:true});
// Next traces only the exports used by Web routes; workers also need the native ESM exports.
for(const name of ['zod','pg','sharp','@langchain/core','@langchain/langgraph','@langchain/langgraph-checkpoint'])await cp('node_modules/'+name,root+'/node_modules/'+name,{recursive:true});
console.log('Runtime worker, migration and initialization scripts built.');
