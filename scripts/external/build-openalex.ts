import {main} from './build-all';
main(['openalex']).catch(e=>{console.error((e as Error).message);process.exitCode=1;});
