import './config';
import {db,store} from './db';
import {IdentityStore} from './identity';
import {ApiCredentials,bearerToken} from './api-credentials';

export const COOKIE='patent_session';
export const identity=new IdentityStore(db);
export const apiCredentials=new ApiCredentials(db);
export function sessionToken(request:Request){return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';}
export const authenticate=identity.authenticate.bind(identity);
export const login=identity.createSession.bind(identity);
export function currentSession(request:Request){return request.headers.has('authorization')?apiCredentials.authenticate(bearerToken(request)):identity.session(sessionToken(request));}
export async function authorized(request:Request){return Boolean(await currentSession(request));}
export async function logout(request:Request){await store.deleteSession(sessionToken(request));}
