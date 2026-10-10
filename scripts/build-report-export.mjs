import {build} from 'esbuild';
import {resolve} from 'node:path';

await build({entryPoints:['src/export/report-client.tsx'],outfile:'public/report-export/runtime.js',bundle:true,minify:true,format:'iife',platform:'browser',target:['es2022'],define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl'},plugins:[{name:'local-fonts',setup(build){build.onResolve({filter:/^\/fonts\//},args=>({path:resolve('public'+args.path)}));}}]});
