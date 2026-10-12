import {isDeepStrictEqual} from 'node:util';

/** Compare the same normalized, JSON-persisted representation used by baselines. */
export function monitorDifferences(previous:Record<string,unknown>,current:Record<string,unknown>){
 const before=JSON.parse(JSON.stringify(previous)) as Record<string,unknown>;
 const after=JSON.parse(JSON.stringify(current)) as Record<string,unknown>;
 return [...new Set([...Object.keys(before),...Object.keys(after)])].sort()
  .filter(field=>!isDeepStrictEqual(before[field],after[field]))
  .map(field=>({field,before:before[field]??null,after:after[field]??null}));
}
