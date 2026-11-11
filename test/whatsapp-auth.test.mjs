import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthCore } from '../scripts/auth-core.mjs';

const password='Senha-teste-api-2026';
function fixture(provider){
 let sent=false;
 const store={failAfterSend:false,state:{version:0,users:[{id:'root',name:'Root',email:'root@example.test',password:'test:'+password,role:'superadmin',active:true},{id:'admin',name:'Admin',email:'admin@example.test',password:'test:'+password,role:'admin',active:true},{id:'patient',name:'Paciente',email:'patient@example.test',password:'test:'+password,role:'usuario',patientId:'p1',ownerId:'admin',active:true}],data:{patients:[{id:'p1',ownerId:'admin',name:'Ana',height:170,weight:70,phone:'+55 11 99999-0000',whatsappConsent:true,history:[]}],appointments:[],posts:[],stories:[]}}};
 const transport=provider?{...provider,async send(payload){const result=await provider.send(payload);sent=true;return result;}}:undefined;
 const handler=createAuthCore({initialState:store.state,whatsappProvider:transport,hash:value=>'test:'+value,verify:(value,stored)=>stored==='test:'+value,commit(state){if(store.failAfterSend&&sent)throw Error('Disk failed');store.state=structuredClone(state);}});
 return {handler,store};
}
async function call(handler,path,method='GET',data,cookie){
 const req={method,headers:{host:'portal.example',origin:'https://portal.example',...(cookie?{cookie}:{})},socket:{remoteAddress:'test'},async *[Symbol.asyncIterator](){if(data!==undefined)yield Buffer.from(JSON.stringify(data));}};
 const headers=new Map();let status,body;
 const res={headersSent:false,destroyed:false,setHeader(name,value){headers.set(name.toLowerCase(),value);},writeHead(code){status=code;return this;},end(value){body=value;this.headersSent=true;return this;}};
 await handler(req,res,new URL('https://portal.example/api/'+path));return {status,body:JSON.parse(body),cookie:headers.get('set-cookie')?.split(';')[0]};
}

test('WhatsApp exige login/equipe e permanece desativado sem adaptador verificado',async()=>{
 const {handler}=fixture();assert.equal((await call(handler,'whatsapp')).status,401);
 const admin=await call(handler,'login','POST',{email:'admin@example.test',password});assert.equal((await call(handler,'whatsapp','GET',undefined,admin.cookie)).body.configured,false);
 const patient=await call(handler,'login','POST',{email:'patient@example.test',password});assert.equal((await call(handler,'whatsapp','GET',undefined,patient.cookie)).status,403);
 assert.equal((await call(handler,'whatsapp','POST',{patientId:'p1',kind:'text',text:'Olá'},admin.cookie)).status,503);
});

test('aceitação externa seguida de falha no disco preserva intenção desconhecida e bloqueia repetição',async()=>{
 let sends=0;const {handler,store}=fixture({status:()=>({provider:'fake',configured:true}),send:async()=>{sends++;return {messageId:'mock-message-1'};}});
 const admin=await call(handler,'login','POST',{email:'admin@example.test',password});store.failAfterSend=true;
 const payload={patientId:'p1',kind:'text',text:'Aviso de teste'};
 assert.equal((await call(handler,'whatsapp','POST',payload,admin.cookie)).status,500);assert.equal(sends,1);assert.equal(store.state.whatsapp.messages[0].status,'unknown');
 const status=await call(handler,'whatsapp','GET',undefined,admin.cookie);assert.equal(status.body.messages[0].status,'unknown');assert.equal(JSON.stringify(status.body).includes('Aviso de teste'),false);
 assert.equal((await call(handler,'whatsapp','POST',payload,admin.cookie)).status,409);assert.equal(sends,1);
});
