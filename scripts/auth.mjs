import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
const publicUser=({id,name,email,role,ownerId,patientId,active})=>({id,name,email,role,ownerId,patientId,active});
const hash=(password,salt=randomBytes(16).toString('hex'))=>`${salt}:${scryptSync(password,salt,64).toString('hex')}`;
function verify(password,stored){const [salt,key]=stored.split(':');return timingSafeEqual(Buffer.from(key,'hex'),scryptSync(password,salt,64))}
const empty=()=>({patients:[],appointments:[],posts:[],stories:[]});
export function createAuth(directory){
 mkdirSync(directory,{recursive:true,mode:0o700});const file=path.join(directory,'members.json');
 let db=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{users:[],data:empty(),version:0};
 const sessions=new Map(),attempts=new Map();
 const persist=()=>{writeFileSync(file+'.tmp',JSON.stringify(db),{mode:0o600});renameSync(file+'.tmp',file)};
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value))};
 const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
 const own=(user,p)=>user.role==='superadmin'||p.ownerId===user.id;
 function view(user){if(user.role==='superadmin')return structuredClone(db.data);const patients=db.data.patients.filter(p=>user.role==='admin'?own(user,p):p.id===user.patientId&&p.ownerId===user.ownerId);const ids=new Set(patients.map(p=>p.id));return {patients,appointments:db.data.appointments.filter(a=>ids.has(a.patient)),posts:db.data.posts.filter(p=>p.ownerId===(user.role==='admin'?user.id:user.ownerId)&&(user.role==='admin'||p.status==='Publicado')),stories:db.data.stories.filter(s=>s.ownerId===(user.role==='admin'?user.id:user.ownerId)&&Date.now()-s.created<86400000)}}
 async function body(req){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>32*1024*1024)fail(413,'Requisição muito grande.');parts.push(part)}try{return JSON.parse(Buffer.concat(parts).toString()||'{}')}catch{fail(400,'JSON inválido.')}}
 const validPassword=p=>typeof p==='string'&&p.length>=12&&p.length<=128;
 const emailOK=e=>typeof e==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)&&e.length<=254;
 function validateUser(b){if(typeof b.name!=='string'||!b.name.trim()||b.name.length>100||!emailOK(b.email))fail(400,'Informe nome e e-mail válidos.');if(!validPassword(b.password))fail(400,'A senha deve conter de 12 a 128 caracteres.');}
 function session(req){const token=/\bnutri_session=([^;]+)/.exec(req.headers.cookie||'')?.[1];const s=sessions.get(token);if(!s||s.expires<Date.now()){sessions.delete(token);return null}const user=db.users.find(u=>u.id===s.id&&u.active);return user?{user,token}:null}
 function signIn(req,res,u){const token=randomBytes(32).toString('hex');sessions.set(token,{id:u.id,expires:Date.now()+8*3600000});res.setHeader('Set-Cookie',`nutri_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);return json(res,200,{user:publicUser(u)})}
 return async(req,res,url)=>{
 try{
 if(req.method!=='GET'&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)fail(403,'Origem da requisição não permitida.');
 const b=req.method==='GET'?{}:await body(req);
 if(url.pathname==='/api/session'&&req.method==='GET'){const s=session(req);return json(res,200,{user:s?publicUser(s.user):null,needsSetup:db.users.length===0})}
 if(url.pathname==='/api/setup'&&req.method==='POST'){if(db.users.length)fail(409,'A configuração inicial já foi realizada.');validateUser(b);const u={id:randomUUID(),name:b.name.trim(),email:b.email.toLowerCase().trim(),password:hash(b.password),role:'superadmin',active:true};db.users.push(u);persist();return signIn(req,res,u)}
 if(url.pathname==='/api/login'&&req.method==='POST'){const key=req.socket.remoteAddress;let a=attempts.get(key);if(a&&a.until<Date.now()){attempts.delete(key);a=null}if(a?.count>=10)fail(429,'Muitas tentativas. Aguarde 15 minutos.');if(typeof b.password!=='string'||b.password.length>128)fail(401,'E-mail ou senha inválidos.');const u=db.users.find(u=>u.email===String(b.email).trim().toLowerCase()&&u.active);if(!u||!verify(b.password,u.password)){attempts.set(key,{count:(a?.count||0)+1,until:a?.until||Date.now()+900000});fail(401,'E-mail ou senha inválidos.')}attempts.delete(key);return signIn(req,res,u)}
 const s=session(req);if(!s)fail(401,'Entre na sua conta para continuar.');const u=s.user;
 if(url.pathname==='/api/logout'&&req.method==='POST'){sessions.delete(s.token);res.setHeader('Set-Cookie','nutri_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true})}
 if(url.pathname==='/api/password'&&req.method==='POST'){if(!verify(String(b.currentPassword),u.password))fail(400,'Senha atual incorreta.');if(!validPassword(b.password))fail(400,'Use de 12 a 128 caracteres.');u.password=hash(b.password);for(const [token,v]of sessions)if(v.id===u.id&&token!==s.token)sessions.delete(token);persist();return json(res,200,{ok:true})}
 if(url.pathname==='/api/state'&&req.method==='GET')return json(res,200,{data:view(u),version:db.version});
 if(url.pathname==='/api/state'&&req.method==='PUT'){
 if(u.role==='usuario')fail(403,'Pacientes possuem acesso de leitura.');if(b.version!==db.version)fail(409,'Os dados foram atualizados em outra sessão. Recarregue a página.');
 const next=b.data;if(!next||!Object.keys(empty()).every(k=>Array.isArray(next[k])&&next[k].length<=5000))fail(400,'Estrutura de dados inválida.');
 const original=view(u);for(const k of Object.keys(empty())){const ids=new Set();for(const row of next[k]){if(!row||typeof row.id!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(row.id)||ids.has(row.id))fail(400,'Identificador inválido ou duplicado.');ids.add(row.id);const existing=db.data[k].find(r=>r.id===row.id);if(existing&&!original[k].some(r=>r.id===row.id))fail(403,'Registro de outra nutricionista.');row.ownerId=u.role==='superadmin'?(existing?.ownerId||row.ownerId||u.id):u.id;if(!db.users.some(x=>x.id===row.ownerId&&x.role!=='usuario'))fail(400,'Responsável inválido.');}}
 for(const p of next.patients){if(typeof p.name!=='string'||!p.name.trim()||!Array.isArray(p.history)||!(Number(p.height)>=40&&Number(p.height)<=250)||!(Number(p.weight)>=2&&Number(p.weight)<=500))fail(400,'Ficha de paciente inválida.');}
 for(const a of next.appointments)if(!next.patients.some(p=>p.id===a.patient)||!/^\d{4}-\d{2}-\d{2}$/.test(a.date)||!/^\d{2}:\d{2}$/.test(a.time))fail(400,'Consulta inválida.');
 for(const p of next.posts)if(typeof p.title!=='string'||typeof p.text!=='string'||!['Publicado','Rascunho'].includes(p.status))fail(400,'Conteúdo inválido.');
 for(const st of next.stories){
 if(typeof st.title!=='string'||typeof st.text!=='string'||!Number.isFinite(st.created))fail(400,'Story inválido.');
 if(st.video){
 if(typeof st.video!=='string'||st.video.length>7*1024*1024)fail(400,'Vídeo muito grande. Limite: 5 MB.');
 const match=/^data:video\/(mp4|webm|ogg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(st.video);if(!match)fail(400,'Formato de vídeo inválido.');
 const bytes=Buffer.from(match[2],'base64');if(bytes.length>5*1024*1024||bytes.toString('base64')!==match[2])fail(400,'Vídeo inválido ou maior que 5 MB.');
 const valid=match[1]==='mp4'?bytes.subarray(4,8).toString()==='ftyp':match[1]==='webm'?bytes.subarray(0,4).toString('hex')==='1a45dfa3':bytes.subarray(0,4).toString()==='OggS';if(!valid)fail(400,'O arquivo não corresponde ao formato informado.');
 }
 }
 // Patient login links must remain valid; deleting linked records is prohibited.
 for(const member of db.users.filter(x=>x.role==='usuario')){const p=db.data.patients.find(p=>p.id===member.patientId);if(p&&original.patients.some(x=>x.id===p.id)&&!next.patients.some(x=>x.id===p.id&&x.ownerId===member.ownerId))fail(409,'Existe um acesso de paciente vinculado a esta ficha.');}
 for(const k of Object.keys(empty())){db.data[k]=u.role==='superadmin'?next[k]:[...db.data[k].filter(r=>!original[k].some(x=>x.id===r.id)),...next[k]]}db.version++;persist();return json(res,200,{data:view(u),version:db.version})}
 if(url.pathname==='/api/users'){
 if(u.role==='usuario')fail(403,'Acesso restrito à gestão.');
 if(req.method==='GET')return json(res,200,{users:db.users.filter(x=>u.role==='superadmin'||x.ownerId===u.id).map(publicUser)});
 if(req.method==='POST'){if(u.role!=='superadmin')fail(403,'Somente o superadmin pode criar usuários.');validateUser(b);if(!['admin','usuario'].includes(b.role))fail(403,'Você não pode criar esse perfil.');if(db.users.some(x=>x.email===b.email.toLowerCase().trim()))fail(409,'E-mail já cadastrado.');let ownerId=u.id,patientId=null;if(b.role==='usuario'){const p=db.data.patients.find(p=>p.id===b.patientId&&own(u,p));if(!p)fail(400,'Selecione uma ficha de paciente válida.');if(db.users.some(x=>x.patientId===p.id))fail(409,'Este paciente já possui acesso.');ownerId=p.ownerId;patientId=p.id;}
 const member={id:randomUUID(),name:b.name.trim(),email:b.email.trim().toLowerCase(),role:b.role,ownerId,patientId,password:hash(b.password),active:true};db.users.push(member);persist();return json(res,201,{user:publicUser(member)})}
 if(req.method==='PATCH'){const target=db.users.find(x=>x.id===b.id);if(!target||target.id===u.id||target.role==='superadmin'||(u.role==='admin'&&(target.ownerId!==u.id||target.role!=='usuario')))fail(403,'Não é possível alterar este membro.');if(typeof b.active!=='boolean')fail(400,'Status inválido.');target.active=b.active;for(const[token,v]of sessions)if(v.id===target.id)sessions.delete(token);persist();return json(res,200,{user:publicUser(target)})}}
 fail(404,'Operação não encontrada.');
 }catch(e){json(res,e.status||500,{error:e.status?e.message:'Não foi possível concluir a operação.'})}
 };
}
