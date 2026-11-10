import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const password='Senha-ficticia-servidor-2026';

async function freePort(){
 const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
 const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));return port;
}

async function launch(directory,port){
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:directory},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
 const exit=once(child,'exit');
 try{
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Servidor não iniciou em 10 segundos: '+stderr)),10000);
   const ready=()=>{clearTimeout(timeout);resolve();};
   child.stdout.once('data',ready);child.once('error',error=>{clearTimeout(timeout);reject(error);});
   child.once('exit',(code,signal)=>{clearTimeout(timeout);reject(Error(`Servidor encerrou antes de iniciar (${code??signal}): ${stderr}`));});
  });
 }catch(error){if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exit;}throw error;}
 const base=`http://127.0.0.1:${port}`;
 async function request(endpoint,method='GET',body,cookie){
  const response=await fetch(base+endpoint,{method,headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return{status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
 }
 async function stop(){
  if(child.exitCode!==null||child.signalCode!==null)return;
  child.kill('SIGTERM');let timer;
  try{const [code,signal]=await Promise.race([exit,new Promise((_,reject)=>{timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Servidor não encerrou graciosamente.'));},10000);})]);assert.equal(code,0,`Saída inesperada (${signal}): ${stderr}`);}
  finally{clearTimeout(timer);}
 }
 return{base,request,stop};
}

test('server.js serve o portal, mantém os dados após reiniciar e protege a API',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'nutri-runtime-'));const port=await freePort();let server;
 try{
  server=await launch(directory,port);
  const health=await server.request('/health');assert.equal(health.status,200);assert.deepEqual(health.body,{status:'ok'});
  const page=await fetch(server.base+'/');assert.equal(page.status,200);assert.match(page.headers.get('content-type'),/^text\/html/);assert.match(await page.text(),/Nutri/);
  for(const [asset,type]of [['/style.css','text/css'],['/app.js','text/javascript'],['/members.js','text/javascript']]){
   const response=await fetch(server.base+asset);assert.equal(response.status,200);assert.ok(response.headers.get('content-type')?.startsWith(type));assert.ok((await response.text()).length>0);
  }
  assert.equal((await server.request('/api/state')).status,401);assert.equal((await server.request('/api/session')).body.needsSetup,true);
  assert.ok([403,404].includes((await fetch(server.base+'/..%2f.data%2fmembers.json')).status));
  const setup=await server.request('/api/setup','POST',{name:'Superadmin teste',email:'runtime@example.test',password});assert.equal(setup.status,200);assert.match(setup.headers.get('set-cookie'),/HttpOnly/);
  const state=(await server.request('/api/state','GET',undefined,setup.cookie)).body;
  state.data.posts.push({id:'persisted-post',title:'Registro persistente',text:'Persistiu após reiniciar.',status:'Publicado'});
  assert.equal((await server.request('/api/state','PUT',state,setup.cookie)).status,200);
  assert.ok((await readFile(path.join(directory,'members.json'),'utf8')).includes('persisted-post'));
  await server.stop();server=await launch(directory,port);
  assert.equal((await server.request('/api/session')).body.needsSetup,false);
  assert.equal((await server.request('/api/state','GET',undefined,setup.cookie)).status,401,'Sessões não devem sobreviver ao reinício.');
  const login=await server.request('/api/login','POST',{email:'runtime@example.test',password});assert.equal(login.status,200);
  assert.equal((await server.request('/api/state','GET',undefined,login.cookie)).body.data.posts[0].id,'persisted-post');
 }finally{if(server)await server.stop();await rm(directory,{recursive:true,force:true});}
});

test('server.js rejeita PORT inválida com erro legível e saída não zero',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'nutri-invalid-port-'));
 try{for(const port of ['not-a-port','65536','-1']){
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:port,HOST:'127.0.0.1',DATA_DIR:directory},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});let timer;
  try{const [code]=await Promise.race([once(child,'exit'),new Promise((_,reject)=>{timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('PORT inválida deixou o processo em execução.'));},10000);})]);assert.equal(code,1);assert.match(stderr,/PORT|porta/i);}
  finally{clearTimeout(timer);}
 }}finally{await rm(directory,{recursive:true,force:true});}
});

test('porta ocupada encerra o processo com erro legível sem manter o watcher aberto',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'nutri-port-conflict-'));const blocker=createServer();
 await new Promise(resolve=>blocker.listen(0,'127.0.0.1',resolve));const port=blocker.address().port;
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:directory},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});let timer;
 try{
  const [code]=await Promise.race([once(child,'exit'),new Promise((_,reject)=>{timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Falha ao iniciar deixou o watcher/processo aberto.'));},10000);})]);
  assert.equal(code,1);assert.match(stderr,/porta.*uso/i);
 }finally{clearTimeout(timer);await new Promise(resolve=>blocker.close(resolve));await rm(directory,{recursive:true,force:true});}
});
