import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';

const password='Senha-ficticia-de-teste-2026';
async function fixture(t){
 const directory=await mkdtemp(path.join(os.tmpdir(),'nutri-regressions-'));
 const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const child=spawn(process.execPath,['scripts/server.mjs'],{cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,PORT:String(port),DATA_DIR:directory},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}await rm(directory,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Servidor não iniciou')),10000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(Error('Servidor encerrou: '+code));});});
 const base=`http://127.0.0.1:${port}`;
 async function request(endpoint,method='GET',body,cookie){const response=await fetch(base+'/api/'+endpoint,{method,headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
 const root=await request('setup','POST',{name:'Superadmin',email:'root@example.test',password});assert.equal(root.status,200);
 return{directory,base,port,request,root};
}

test('dados inválidos são rejeitados sem quebrar o portal ou alterar o estado',async t=>{
 const {request,root,port}=await fixture(t);
 assert.equal((await request('login','POST',null)).status,400);
 assert.equal((await request('login','POST',[])).status,400);
 const initial=(await request('state','GET',undefined,root.cookie)).body;
 const state=structuredClone(initial);state.data.patients.push({id:'patient-a',ownerId:root.body.user.id,name:'Paciente A',height:170,weight:70,history:[]});state.data.appointments.push({id:'consult-a',patient:'patient-a',date:'2026-10-28',time:'09:00',type:'Retorno',status:'Confirmada'});
 assert.equal((await request('state','PUT',state,root.cookie)).status,200);
 const valid=(await request('state','GET',undefined,root.cookie)).body;
 for(const mutate of [
  x=>x.data.patients[0].history.push(null),
  x=>x.data.patients[0].history.push({id:'record-a',date:'2026-02-30',weight:70}),
  x=>x.data.patients[0].history.push({id:'record-a',date:'2026-02-01',weight:'abc'}),
  x=>x.data.patients[0].history.push({id:'<script>',date:'2026-02-01',weight:70}),
  x=>x.data.patients[0].notes={value:'nota inválida'},
  x=>x.data.appointments[0].date='2026-02-30',
  x=>x.data.appointments[0].time='29:90',
  x=>x.data.appointments[0].status='inexistente',
 ]){
  const invalid=structuredClone(valid);mutate(invalid);assert.equal((await request('state','PUT',invalid,root.cookie)).status,400);assert.deepEqual((await request('state','GET',undefined,root.cookie)).body,valid);
 }
 assert.equal((await request('manage','DELETE',{resource:'__proto__',id:'patient-a',version:valid.version},root.cookie)).status,400);
 const malformedStatus=await new Promise((resolve,reject)=>{const req=httpRequest({host:'127.0.0.1',port,path:'//'},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
 assert.equal(malformedStatus,400);assert.equal((await request('session')).status,200);
});

test('transferência de paciente sincroniza consultas e encerra sessões com vínculo antigo',async t=>{
 const {request,root}=await fixture(t);
 const a=await request('users','POST',{name:'Admin A',email:'a@example.test',password,role:'admin'},root.cookie);
 const b=await request('users','POST',{name:'Admin B',email:'b@example.test',password,role:'admin'},root.cookie);
 const state=(await request('state','GET',undefined,root.cookie)).body;state.data.patients.push({id:'patient-a',ownerId:a.body.user.id,name:'Paciente A',height:170,weight:70,history:[]});state.data.appointments.push({id:'consult-a',patient:'patient-a',ownerId:a.body.user.id,date:'2026-10-28',time:'09:00'});
 assert.equal((await request('state','PUT',state,root.cookie)).status,200);
 const member=await request('users','POST',{name:'Paciente A',email:'patient@example.test',password,role:'usuario',patientId:'patient-a'},root.cookie);assert.equal(member.status,201);
 const patient=await request('login','POST',{email:'patient@example.test',password});
 const transfer=(await request('state','GET',undefined,root.cookie)).body;transfer.data.patients[0].ownerId=b.body.user.id;
 const changed=await request('state','PUT',transfer,root.cookie);assert.equal(changed.status,200);assert.equal(changed.body.data.appointments[0].ownerId,b.body.user.id);
 assert.equal((await request('state','GET',undefined,patient.cookie)).status,401);
 const freshPatient=await request('login','POST',{email:'patient@example.test',password});assert.equal(freshPatient.body.user.ownerId,b.body.user.id);assert.equal((await request('state','GET',undefined,freshPatient.cookie)).body.data.appointments.length,1);
 const adminA=await request('login','POST',{email:'a@example.test',password});const adminB=await request('login','POST',{email:'b@example.test',password});
 assert.equal((await request('state','GET',undefined,adminA.cookie)).body.data.appointments.length,0);assert.equal((await request('state','GET',undefined,adminB.cookie)).body.data.appointments.length,1);
});

test('falhas de persistência não deixam senhas, usuários ou estado modificados em memória',async t=>{
 const {request,root,directory}=await fixture(t);
 const admin=await request('users','POST',{name:'Admin A',email:'a@example.test',password,role:'admin'},root.cookie);
 const adminLogin=await request('login','POST',{email:'a@example.test',password});
 const state=(await request('state','GET',undefined,root.cookie)).body;
 await mkdir(path.join(directory,'members.json.tmp'));
 assert.equal((await request('account','PATCH',{username:'modificado',currentPassword:password,password:password+'-nova'},root.cookie)).status,500);
 assert.equal((await request('session','GET',undefined,root.cookie)).body.user.username,undefined);
 assert.equal((await request('login','POST',{email:'root@example.test',password})).status,200);
 const pending=structuredClone(state);pending.data.posts.push({id:'post-a',title:'Não deve persistir',text:'Teste',status:'Publicado'});
 assert.equal((await request('state','PUT',pending,root.cookie)).status,500);assert.deepEqual((await request('state','GET',undefined,root.cookie)).body,state);
 assert.equal((await request('users','DELETE',{id:admin.body.user.id},root.cookie)).status,500);
 assert.equal((await request('state','GET',undefined,adminLogin.cookie)).status,200);assert.equal((await request('users','GET',undefined,root.cookie)).body.users.length,2);
 await rm(path.join(directory,'members.json.tmp'),{recursive:true});
 assert.equal((await request('account','PATCH',{username:'confirmado',currentPassword:password},root.cookie)).status,200);
 assert.equal((await request('login','POST',{username:'confirmado',password})).status,200);
});
