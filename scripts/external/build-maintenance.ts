import {main} from './build-all';
main(['maintenance']).catch(e=>{console.error((e as Error).message);process.exitCode=1;});
