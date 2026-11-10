import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import os from 'node:os';

const root=path.resolve(import.meta.dirname,'..');
async function demo(){
 const data=JSON.parse(await readFile(path.join(root,'scripts/demo-data.json'),'utf8'));
 for(const rows of Object.values(data))for(const item of rows){if(item.date==='__TODAY__')item.date='2026-11-10';if(item.created==='__NOW__')item.created=Date.now();}
 const runtime=await readFile(path.join(root,'scripts/demo-runtime.js'),'utf8');
 return runInNewContext(`(()=>{const demoData=${JSON.stringify(data)};${runtime};return {api,users:demoUsers,setUser(id){demoUserId=id;}};})()`,{console,Date});
}

test('HTMLs são reproduzíveis em cópia sem histórico Git e todos os scripts têm sintaxe válida',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'nutri-preview-'));try{
 for(const name of ['scripts','public'])await cp(path.join(root,name),path.join(directory,'project',name),{recursive:true});
 const output=path.join(directory,'dist');const result=spawnSync('python3',[path.join(directory,'project/scripts/build-preview.py'),'--output-dir',output],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 for(const name of ['nutri-preview.html','superadmin-direto.html','nutri-paciente.html','nutri-admin.html']){
 const html=await readFile(path.join(output,name),'utf8');assert.ok(!html.includes('@import'));assert.ok(!html.includes('<script type="module"'));
 const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert.ok(source,`Script ausente: ${name}`);const syntax=spawnSync(process.execPath,['--check','--input-type=commonjs'],{input:source,encoding:'utf8'});assert.equal(syntax.status,0,`${name}: ${syntax.stderr}`);
 }
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('demonstração respeita responsável, versões e acessos dos perfis',async()=>{
 const {api,setUser}=await demo();setUser('root');
 await api('users',{method:'POST',body:JSON.stringify({name:'Outro super',username:'super-dois',email:'super2@example.test',role:'superadmin',password:'senha-demo-test-2026'})});
 setUser('user');const patient=await api('state');assert.equal(patient.data.patients.length,1);assert.equal(patient.data.stories.length,0);assert.equal(patient.data.posts.length,1);await assert.rejects(()=>api('users'),/restrito/);await assert.rejects(()=>api('state',{method:'PUT',body:JSON.stringify(patient)}),/leitura/);
 setUser('admin');const admin=await api('state');assert.equal(admin.data.patients.length,3);await assert.rejects(()=>api('users',{method:'POST',body:JSON.stringify({})}),/superadmin/);
 setUser('root');const rootState=await api('state');rootState.data.posts.push({id:'root-post',title:'Privado de outro gestor',text:'Conteúdo',status:'Publicado'});await api('state',{method:'PUT',body:JSON.stringify(rootState)});
 setUser('admin');assert.equal((await api('state')).data.posts.some(p=>p.id==='root-post'),false);await assert.rejects(()=>api('state',{method:'PUT',body:JSON.stringify(admin)}),/alterados/);
});

test('gestão offline preserva identidade, vínculos e responsabilidade ao editar ou excluir',async()=>{
 const {api,setUser}=await demo();setUser('root');
 const second=await api('users',{method:'POST',body:JSON.stringify({name:'Segundo Super',username:'super-dois',email:'super2@example.test',role:'superadmin',password:'senha-demo-test-2026'})});assert.equal(second.user.role,'superadmin');
 const renamed=await api('users',{method:'PATCH',body:JSON.stringify({id:'user',username:' ANA-NOVA ',email:'ana-nova@example.test',password:'senha-demo-test-2026',role:'usuario',patientId:'mariana'})});assert.equal(renamed.user.username,'ana-nova');assert.equal(renamed.user.patientId,'mariana');assert.equal(renamed.user.ownerId,'admin');
 await assert.rejects(()=>api('users',{method:'PATCH',body:JSON.stringify({id:'user',role:'qualquer'})}),/Perfil inválido/);
 let state=await api('state');const invalid={...state,data:JSON.parse(JSON.stringify(state.data))};invalid.data.patients=invalid.data.patients.filter(p=>p.id!=='mariana');await assert.rejects(()=>api('state',{method:'PUT',body:JSON.stringify(invalid)}),/vínculos/);
 state.data.patients.find(p=>p.id==='mariana').ownerId='root';await api('state',{method:'PUT',body:JSON.stringify(state)});assert.equal((await api('users')).users.find(u=>u.id==='user').ownerId,'root');assert.equal((await api('state')).data.appointments.find(a=>a.patient==='mariana').ownerId,'root');
 await assert.rejects(()=>api('manage',{method:'DELETE',body:JSON.stringify({resource:'post',id:'p1',version:0})}),/alterados/);
 const fresh=await api('state');await assert.rejects(()=>api('manage',{method:'DELETE',body:JSON.stringify({resource:'post',id:'missing',version:fresh.version})}),/não encontrado/);
 setUser(second.user.id);await api('users',{method:'DELETE',body:JSON.stringify({id:'admin'})});const transferred=await api('state');assert.equal(transferred.data.posts[0].ownerId,second.user.id);assert.equal(transferred.data.patients.find(p=>p.id==='ana').ownerId,second.user.id);
});
