import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createAuthCore } from '../scripts/auth-core.mjs';

const empty=()=>({users:[],data:{patients:[],appointments:[],posts:[],stories:[]},version:0});
const password='Senha-ficticia-core-2026';
function durable(){
 const store={state:empty(),sessions:[],attempts:[],fail:false};
 function restore(){
  return createAuthCore({
   initialState:store.state,initialSessions:store.sessions,initialAttempts:store.attempts,
   persistSessions:true,cookieSecure:true,
   // Force async adapters to expose races a synchronous Node-only test cannot.
   async hash(value){await Promise.resolve();return 'test-hash:'+value;},
   async verify(value,stored){await Promise.resolve();return stored==='test-hash:'+value;},
   commit(state,metadata){if(store.fail)throw Error('storage unavailable');store.state=structuredClone(state);store.sessions=structuredClone(metadata.sessions);store.attempts=structuredClone(metadata.attempts);},
  });
 }
 return {store,restore};
}
async function call(handler,pathname,method='GET',data,cookie){
 const req={method,headers:{host:'portal.example',origin:'https://portal.example',...(cookie?{cookie}:{})},socket:{remoteAddress:'test-client'},async *[Symbol.asyncIterator](){if(data!==undefined)yield Buffer.from(JSON.stringify(data));}};
 const headers=new Map();let status,body;
 const res={destroyed:false,headersSent:false,setHeader(name,value){headers.set(name.toLowerCase(),value);},writeHead(code,values={}){status=code;for(const[name,value]of Object.entries(values))headers.set(name.toLowerCase(),value);return this;},end(value){body=value;this.headersSent=true;return this;}};
 await handler(req,res,new URL('https://portal.example/api/'+pathname));
 return {status,body:JSON.parse(body),cookie:headers.get('set-cookie')?.split(';')[0],headers};
}

test('core persists sessions and attempts across runtime re-creation',async()=>{
 const {restore,store}=durable();let handler=restore();
 const setup=await call(handler,'setup','POST',{name:'Gestora',email:'root@example.test',password});assert.equal(setup.status,200);assert.match(setup.headers.get('set-cookie'),/; Secure/);assert.equal(store.sessions.length,1);
 handler=restore();const session=await call(handler,'session','GET',undefined,setup.cookie);assert.equal(session.body.user.id,setup.body.user.id);
 for(let i=0;i<10;i++){handler=restore();assert.equal((await call(handler,'login','POST',{email:'root@example.test',password:'errada'})).status,401);}
 handler=restore();assert.equal((await call(handler,'login','POST',{email:'root@example.test',password})).status,429);
 assert.equal((await call(handler,'logout','POST',{},setup.cookie)).status,200);
 handler=restore();assert.equal((await call(handler,'session','GET',undefined,setup.cookie)).body.user,null);
});

test('async adapters are serialized for setup and optimistic state writes',async()=>{
 const {restore,store}=durable();const handler=restore();
 const setups=await Promise.all([call(handler,'setup','POST',{name:'Gestora A',email:'a@example.test',password}),call(handler,'setup','POST',{name:'Gestora B',email:'b@example.test',password})]);
 assert.deepEqual(setups.map(x=>x.status),[200,409]);assert.equal(store.state.users.length,1);
 const cookie=setups[0].cookie;const current=(await call(handler,'state','GET',undefined,cookie)).body;
 const writes=await Promise.all(['first','second'].map(id=>call(handler,'state','PUT',{...current,data:{...current.data,posts:[{id,title:id,text:'Teste',status:'Publicado'}]}},cookie)));
 assert.deepEqual(writes.map(x=>x.status),[200,409]);assert.equal(store.state.data.posts.length,1);assert.equal(store.state.data.posts[0].id,'first');
});

test('failed durable commits do not leave accounts or authentication partially changed',async()=>{
 const {restore,store}=durable();const handler=restore();store.fail=true;
 assert.equal((await call(handler,'setup','POST',{name:'Gestora',email:'root@example.test',password})).status,500);assert.equal(store.state.users.length,0);
 store.fail=false;const setup=await call(handler,'setup','POST',{name:'Gestora',email:'root@example.test',password});assert.equal(setup.status,200);
 const sessionCount=store.sessions.length;store.fail=true;
 const login=await call(handler,'login','POST',{email:'root@example.test',password});assert.equal(login.status,500);assert.equal(login.cookie,undefined);assert.equal(store.sessions.length,sessionCount);
 assert.equal((await call(handler,'account','PATCH',{username:'changed',currentPassword:password},setup.cookie)).status,500);
 store.fail=false;const session=await call(handler,'session','GET',undefined,setup.cookie);assert.equal(session.status,200);assert.equal(session.body.user.username,undefined);
 assert.equal((await call(handler,'account','PATCH',{username:'confirmed',currentPassword:password},setup.cookie)).status,200);
 assert.equal((await call(restore(),'login','POST',{username:'confirmed',password})).status,200);
});
