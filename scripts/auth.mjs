import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { createAuthCore } from './auth-core.mjs';

const hash=(password,salt=randomBytes(16).toString('hex'))=>`${salt}:${scryptSync(password,salt,64).toString('hex')}`;
function verify(password,stored){const [salt,key]=stored.split(':');return timingSafeEqual(Buffer.from(key,'hex'),scryptSync(password,salt,64))}

/** Node adapter: retains the existing JSON file format and ephemeral sessions. */
export function createAuth(directory){
 mkdirSync(directory,{recursive:true,mode:0o700});
 const file=path.join(directory,'members.json');
 const initialState=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{users:[],data:{patients:[],appointments:[],posts:[],stories:[]},version:0};
 return createAuthCore({
  initialState,hash,verify,
  cookieSecure:process.env.COOKIE_SECURE==='true',
  commit(db){writeFileSync(file+'.tmp',JSON.stringify(db),{mode:0o600});renameSync(file+'.tmp',file);},
 });
}
