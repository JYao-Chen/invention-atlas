import {cp, mkdir} from 'node:fs/promises';

// Copy directory contents to fixed destinations; repeated packaging must not nest public/static.
await mkdir('.next/standalone/public', {recursive:true});
await mkdir('.next/standalone/.next/static', {recursive:true});
await cp('public', '.next/standalone/public', {recursive:true});
await cp('.next/static', '.next/standalone/.next/static', {recursive:true});
