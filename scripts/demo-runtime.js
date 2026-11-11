const clonePreview=value=>JSON.parse(JSON.stringify(value));
const demoUsers=[{id:'root',name:'Larissa Costa',email:'gestora@example.com',role:'superadmin',active:true},{id:'admin',name:'Larissa Costa',email:'nutri@example.com',role:'admin',active:true},{id:'user',name:'Ana Beatriz Silva',email:'ana@example.com',role:'usuario',ownerId:'admin',patientId:'ana',active:true}];
demoUsers[0].username='lucasdallan';demoUsers[1].username='admin';demoUsers[2].username='paciente';
const demoPasswords={root:'admin123',admin:'demo12345',user:'demo12345'};
let demoUserId=null,demoVersion=0;
const demoRole=()=>demoUsers.find(u=>u.id===demoUserId)?.role;
const demoPublicUser=({id,name,email,username,role,ownerId,patientId,active})=>({id,name,email,username,role,ownerId,patientId,active});
async function initSession(){
 document.body.classList.add('logged-out');
 const overlay=document.createElement('section');overlay.className='login-screen';
 overlay.innerHTML=`<div class="login-intro"><a class="brand">✳ nutri.</a><div class="eyebrow">ÁREA DE MEMBROS</div><h1>Seu cuidado.<br>Um espaço só seu.</h1><p>Acesse seu acompanhamento com usuário e senha.</p><div class="login-leaf">🌿</div></div><div class="login-card"><span class="tag">DEMONSTRAÇÃO INTERATIVA</span><h2>Entre no seu espaço</h2><p>Informe seu usuário e senha para conhecer o portal.</p><form id="demo-login"><label>Usuário<input name="username" required autocomplete="username" placeholder="Seu usuário ou e-mail" value="lucasdallan" maxlength="254"></label><label>Senha<input name="password" type="password" required autocomplete="current-password" placeholder="Digite sua senha" maxlength="128"></label><label style="display:flex;align-items:center;gap:8px;font-size:11px"><input style="width:auto;margin:0" type="checkbox" id="show-password"> Mostrar senha</label><p id="demo-login-error" class="danger" role="alert"></p><button class="button" type="submit">Entrar →</button></form><details style="margin-top:22px;font-size:12px;color:#77866b"><summary style="cursor:pointer">Acessos para testar a demonstração</summary><p>Superadmin: <b>lucasdallan</b> · senha <b>admin123</b>.<br>Admin: <b>admin</b> · senha <b>demo12345</b>.<br>Paciente: <b>paciente</b> · senha <b>demo12345</b>.</p></details><p style="font-size:10px">Prévia HTML com credenciais fictícias, sem autenticação real. Não use sua senha pessoal. As alterações são descartadas ao recarregar.</p></div>`;
 document.body.append(overlay);
 overlay.querySelector('#show-password').onchange=e=>{overlay.querySelector('[name=password]').type=e.target.checked?'text':'password'};
 return new Promise(resolve=>{overlay.querySelector('form').onsubmit=e=>{e.preventDefault();const fields=new FormData(e.target);const username=String(fields.get('username')).trim().toLowerCase();const user=demoUsers.find(u=>u.active&&(u.username===username||u.email===username));if(!user||fields.get('password')!==demoPasswords[user.id]){overlay.querySelector('#demo-login-error').textContent='Usuário ou senha inválidos.';return;}demoUserId=user.id;location.hash='dashboard';overlay.remove();document.body.classList.remove('logged-out');document.body.classList.add('authenticated');const bar=document.createElement('div');bar.className='demo-banner';bar.innerHTML='<span>Prévia HTML · login demonstrativo · sem autenticação real</span><button type="button">Sair</button>';bar.querySelector('button').onclick=()=>location.reload();document.body.prepend(bar);resolve(demoPublicUser(user))};});
}

async function api(path,options={}){
 const user=demoUsers.find(u=>u.id===demoUserId),body=options.body?JSON.parse(options.body):{};
 if(!user||!user.active)throw Error('Acesso encerrado. Reabra a demonstração.');
 if(path==='logout'){location.reload();return {ok:true}}
 if(path==='whatsapp'){if(user.role==='usuario')throw Error('Acesso restrito.');if(options.method==='POST')throw Error('Demonstração: nenhum envio real é feito pelo HTML.');return {provider:'dallanspace',configured:false,templateConfigured:false,webhookConfigured:false,messages:[]};}
 if(path==='account'){
 if(body.currentPassword!==demoPasswords[user.id])throw Error('Senha atual incorreta.');
 const username=String(body.username||'').trim().toLowerCase(),email=String(body.email||'').trim().toLowerCase();
 if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))throw Error('Usuário inválido. Use de 3 a 32 caracteres.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('E-mail inválido.');
 if(demoUsers.some(x=>x.id!==user.id&&(x.username===username||x.email===email)))throw Error('Usuário ou e-mail já está em uso.');
 if(body.password&&(body.password.length<12||body.password.length>128))throw Error('Use de 12 a 128 caracteres na nova senha.');
 user.username=username;user.email=email;if(body.password)demoPasswords[user.id]=body.password;
 return {user:demoPublicUser(user)};
 }
 if(path==='password'){if(body.currentPassword!==demoPasswords[user.id])throw Error('Senha atual incorreta.');if(!body.password||body.password.length<12||body.password.length>128)throw Error('Use de 12 a 128 caracteres.');demoPasswords[user.id]=body.password;return {ok:true};}

 function stateView(){
 const snapshot=clonePreview(demoData);if(user.role==='superadmin')return snapshot;
 snapshot.patients=snapshot.patients.filter(p=>user.role==='admin'?p.ownerId===user.id:p.id===user.patientId&&p.ownerId===user.ownerId);
 const ids=new Set(snapshot.patients.map(p=>p.id));snapshot.appointments=snapshot.appointments.filter(a=>ids.has(a.patient));
 snapshot.posts=snapshot.posts.filter(p=>p.ownerId===(user.role==='admin'?user.id:user.ownerId)&&(user.role==='admin'||p.status==='Publicado'));
 snapshot.stories=user.role==='usuario'?[]:snapshot.stories.filter(s=>s.ownerId===user.id&&Date.now()-s.created<86400000);return snapshot;
 }
 if(path==='state'){
 if(options.method==='PUT'){
 if(user.role==='usuario')throw Error('Acesso somente de leitura.');if(body.version!==demoVersion)throw Error('Dados alterados. Recarregue o formulário.');
 const before=stateView();for(const key of ['patients','appointments','posts','stories']){
 if(!Array.isArray(body.data?.[key]))throw Error('Dados inválidos.');
 for(const item of body.data[key]){const current=demoData[key].find(x=>x.id===item.id);if(current&&!before[key].some(x=>x.id===item.id))throw Error('Registro de outro responsável.');item.ownerId=user.role==='superadmin'?(item.ownerId||current?.ownerId||user.id):user.id;}
 }
 for(const account of demoUsers.filter(x=>x.role==='usuario'))if(before.patients.some(p=>p.id===account.patientId)&&!body.data.patients.some(p=>p.id===account.patientId))throw Error('Exclua a ficha pelo botão de exclusão para remover seus vínculos.');
 for(const appointment of body.data.appointments){const patient=body.data.patients.find(p=>p.id===appointment.patient);if(!patient)throw Error('Paciente da consulta não encontrado.');appointment.ownerId=patient.ownerId;}
 for(const key of ['patients','appointments','posts','stories'])demoData[key]=user.role==='superadmin'?clonePreview(body.data[key]):[...demoData[key].filter(x=>!before[key].some(y=>y.id===x.id)),...clonePreview(body.data[key])];
 for(const member of demoUsers.filter(u=>u.role==='usuario')){const p=demoData.patients.find(p=>p.id===member.patientId);if(p)member.ownerId=p.ownerId;}
 demoVersion++;
 }
 return {data:stateView(),version:demoVersion};
 }
 if(path==='manage'){
 if(demoRole()!=='superadmin')throw Error('Acesso restrito ao superadmin.');const key={patient:'patients',appointment:'appointments',post:'posts',story:'stories'}[body.resource];if(!Object.hasOwn({patient:1,appointment:1,post:1,story:1},body.resource))throw Error('Registro inválido.');if(body.version!==demoVersion)throw Error('Dados alterados. Recarregue o formulário.');if(!demoData[key].some(x=>x.id===body.id))throw Error('Registro não encontrado.');
 if(key==='patients'){demoData.appointments=demoData.appointments.filter(a=>a.patient!==body.id);for(let i=demoUsers.length-1;i>=0;i--)if(demoUsers[i].patientId===body.id)demoUsers.splice(i,1);}
 demoData[key]=demoData[key].filter(x=>x.id!==body.id);demoVersion++;return {ok:true,data:clonePreview(demoData),version:demoVersion};
 }
 if(path==='users'){let changedUser;
 if(demoRole()==='usuario')throw Error('Acesso restrito.');
 if(options.method==='POST'){
 if(demoRole()!=='superadmin')throw Error('Somente o superadmin pode criar usuários.');
 if(!['superadmin','admin','usuario'].includes(body.role))throw Error('Perfil inválido.');
 if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw Error('Use de 12 a 128 caracteres na senha.');
 body.email=String(body.email||'').trim().toLowerCase();body.username=String(body.username||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))throw Error('E-mail inválido.');
 if(body.username&&!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(body.username))throw Error('Usuário inválido.');
 if(demoUsers.some(u=>u.email===body.email||(body.username&&u.username===body.username)))throw Error('E-mail já cadastrado.');
 if(body.role==='usuario'&&!demoData.patients.some(p=>p.id===body.patientId))throw Error('Selecione uma ficha de paciente.');
 const linked=body.role==='usuario'?demoData.patients.find(p=>p.id===body.patientId):null;if(linked&&demoUsers.some(u=>u.patientId===linked.id))throw Error('Esta ficha já possui acesso.');
 const member={id:'demo-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),name:body.name,email:body.email,role:body.role,username:body.username||undefined,patientId:linked?.id||null,ownerId:linked?.ownerId||user.id,active:true};demoUsers.push(member);demoPasswords[member.id]=body.password;changedUser=member;
 }
 if(options.method==='PATCH'||options.method==='DELETE'){
 const target=demoUsers.find(u=>u.id===body.id);if(!target)throw Error('Usuário não encontrado.');
 if(demoRole()!=='superadmin'&&(target.ownerId!==user.id||target.role!=='usuario'||options.method==='DELETE'||Object.keys(body).some(k=>!['id','active'].includes(k))))throw Error('Acesso restrito ao superadmin.');
 if(target.role==='superadmin'&&target.active&&(options.method==='DELETE'||body.active===false||(body.role&&body.role!=='superadmin'))&&!demoUsers.some(u=>u.id!==target.id&&u.role==='superadmin'&&u.active))throw Error('Mantenha pelo menos um superadmin ativo.');
 if(options.method==='DELETE'){const replacement=user.id!==target.id?user:demoUsers.find(u=>u.role==='superadmin'&&u.id!==target.id&&u.active);if(!replacement)throw Error('Não é possível excluir o último superadmin.');for(const records of Object.values(demoData))for(const r of records)if(r.ownerId===target.id)r.ownerId=replacement.id;for(const m of demoUsers)if(m.ownerId===target.id)m.ownerId=replacement.id;demoVersion++;demoUsers.splice(demoUsers.indexOf(target),1);}
 else{
 const next={...target};
 if(body.name!==undefined){if(typeof body.name!=='string'||!body.name.trim()||body.name.length>100)throw Error('Nome inválido.');next.name=body.name.trim();}
 if(body.username!==undefined){next.username=String(body.username).trim().toLowerCase();if(next.username&&!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(next.username))throw Error('Usuário inválido.');}
 if(body.email!==undefined){next.email=String(body.email).trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email))throw Error('E-mail inválido.');}
 if(demoUsers.some(u=>u.id!==target.id&&(u.email===next.email||(next.username&&u.username===next.username))))throw Error('Usuário ou e-mail já cadastrado.');
 if(body.role!==undefined){if(!['superadmin','admin','usuario'].includes(body.role))throw Error('Perfil inválido.');next.role=body.role;}
 if(body.active!==undefined){if(typeof body.active!=='boolean')throw Error('Status inválido.');next.active=body.active;}
 if(next.role==='usuario'){
 const patient=demoData.patients.find(p=>p.id===(body.patientId??target.patientId));if(!patient)throw Error('Selecione a ficha do paciente.');
 if(demoUsers.some(u=>u.id!==target.id&&u.patientId===patient.id))throw Error('Esta ficha já possui acesso.');
 if(target.role!=='usuario'&&['patients','posts','stories'].some(key=>demoData[key].some(x=>x.ownerId===target.id)))throw Error('Transfira os registros deste gestor antes de mudar o perfil.');
 next.patientId=patient.id;next.ownerId=patient.ownerId;
 }else{next.patientId=null;}
 if(body.password&&(typeof body.password!=='string'||body.password.length<12||body.password.length>128))throw Error('Use de 12 a 128 caracteres na senha.');
 Object.assign(target,next);if(body.password)demoPasswords[target.id]=body.password;changedUser=target;
 }

 }
 return {users:demoUsers.filter(u=>demoRole()==='superadmin'||u.ownerId===user.id).map(demoPublicUser),...(changedUser?{user:demoPublicUser(changedUser)}:{})};
 }
 throw Error('Recurso disponível na versão com servidor.');
}
