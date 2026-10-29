import {main} from './build-all';
main(['patentsview']).catch(e=>{console.error((e as Error).message);process.exitCode=1;});
