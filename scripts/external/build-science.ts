import {main} from './build-all';
main(['science']).catch(e=>{console.error((e as Error).message);process.exitCode=1;});
