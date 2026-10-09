import './config';
import {randomBytes,timingSafeEqual,scryptSync} from 'node:crypto';
import {db} from './db';
export const COOKIE='patent_session';
export function authenticate(username:string,password:string){const expected=process.env.PATENT_PASSWORD;if(!expected)throw new Error('请先配置独立登录密码');const salt='mini-patent-local-login';return username===(process.env.PATENT_USERNAME||'jyao')&&timingSafeEqual(scryptSync(password,salt,32),scryptSync(expected,salt,32));}
export function login(){const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?)').run(token,Date.now()+7*86400000);return token;}
export function authorized(request:Request){const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';const session=db.prepare('SELECT expires_at FROM sessions WHERE token=?').get(token) as {expires_at:number}|undefined;return Boolean(session&&session.expires_at>Date.now());}
export function logout(request:Request){const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';db.prepare('DELETE FROM sessions WHERE token=?').run(token);}
