from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]
old=subprocess.check_output(['git','show','c38ac4a:public/app.js'],cwd=root,text=True)
seed=old[old.index('const seed='):old.index('let data;try{')].replace('const seed=','const demoData=')
members=(root/'public/members.js').read_text()
views=members[members.index('export function storyVideo'):].replace('export function ','function ')
shim=r'''
const clonePreview=value=>JSON.parse(JSON.stringify(value));
const roleNames={superadmin:'Superadmin',admin:'Nutricionista · Admin',usuario:'Paciente'};
const demoUsers=[{id:'root',name:'Larissa Costa',email:'gestora@example.com',role:'superadmin',active:true},{id:'admin',name:'Larissa Costa',email:'nutri@example.com',role:'admin',active:true},{id:'user',name:'Ana Beatriz Silva',email:'ana@example.com',role:'usuario',ownerId:'admin',patientId:'ana',active:true}];
demoUsers[0].username='lucasdallan';demoUsers[1].username='admin';demoUsers[2].username='paciente';
const demoPasswords={root:'admin123',admin:'demo12345',user:'demo12345'};
let demoRole=null,demoVersion=0;
async function initSession(){
 document.body.classList.add('logged-out');
 const overlay=document.createElement('section');overlay.className='login-screen';
 overlay.innerHTML=`<div class="login-intro"><a class="brand">✳ nutri.</a><div class="eyebrow">ÁREA DE MEMBROS</div><h1>Seu cuidado.<br>Um espaço só seu.</h1><p>Acesse seu acompanhamento com usuário e senha.</p><div class="login-leaf">🌿</div></div><div class="login-card"><span class="tag">DEMONSTRAÇÃO INTERATIVA</span><h2>Entre no seu espaço</h2><p>Informe seu usuário e senha para conhecer o portal.</p><form id="demo-login"><label>Usuário<input name="username" required autocomplete="username" placeholder="Seu usuário ou e-mail" value="lucasdallan" maxlength="254"></label><label>Senha<input name="password" type="password" required autocomplete="current-password" placeholder="Digite sua senha" maxlength="128"></label><label style="display:flex;align-items:center;gap:8px;font-size:11px"><input style="width:auto;margin:0" type="checkbox" id="show-password"> Mostrar senha</label><p id="demo-login-error" class="danger" role="alert"></p><button class="button" type="submit">Entrar →</button></form><details style="margin-top:22px;font-size:12px;color:#77866b"><summary style="cursor:pointer">Acessos para testar a demonstração</summary><p>Superadmin: <b>lucasdallan</b> · senha <b>admin123</b>.<br>Admin: <b>admin</b> · senha <b>demo12345</b>.<br>Paciente: <b>paciente</b> · senha <b>demo12345</b>.</p></details><p style="font-size:10px">Prévia HTML com credenciais fictícias, sem autenticação real. Não use sua senha pessoal. As alterações são descartadas ao recarregar.</p></div>`;
 document.body.append(overlay);
 overlay.querySelector('#show-password').onchange=e=>{overlay.querySelector('[name=password]').type=e.target.checked?'text':'password'};
 return new Promise(resolve=>{overlay.querySelector('form').onsubmit=e=>{e.preventDefault();const fields=new FormData(e.target);const username=String(fields.get('username')).trim().toLowerCase();const aliases={lucasdallan:'superadmin',admin:'admin',paciente:'usuario'};const role=aliases[username]||demoUsers.find(u=>u.email===username)?.role;const user=demoUsers.find(u=>u.role===role);if(!user||fields.get('password')!==(role==='superadmin'?'admin123':'demo12345')){overlay.querySelector('#demo-login-error').textContent='Usuário ou senha inválidos.';return;}demoRole=role;location.hash='dashboard';overlay.remove();document.body.classList.remove('logged-out');document.body.classList.add('authenticated');const bar=document.createElement('div');bar.className='demo-banner';bar.innerHTML='<span>Prévia HTML · login demonstrativo · sem autenticação real</span><button type="button">Sair</button>';bar.querySelector('button').onclick=()=>location.reload();document.body.prepend(bar);resolve(user)};});
}

async function api(path,options={}){
 const user=demoUsers.find(u=>u.role===demoRole),body=options.body?JSON.parse(options.body):{};
 if(path==='logout'){location.reload();return {ok:true}}
 if(path==='account'){
 if(body.currentPassword!==demoPasswords[user.id])throw Error('Senha atual incorreta.');
 const username=String(body.username||'').trim().toLowerCase(),email=String(body.email||'').trim().toLowerCase();
 if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))throw Error('Usuário inválido. Use de 3 a 32 caracteres.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('E-mail inválido.');
 if(demoUsers.some(x=>x.id!==user.id&&(x.username===username||x.email===email)))throw Error('Usuário ou e-mail já está em uso.');
 if(body.password&&(body.password.length<12||body.password.length>128))throw Error('Use de 12 a 128 caracteres na nova senha.');
 user.username=username;user.email=email;if(body.password)demoPasswords[user.id]=body.password;
 return {user:{...user}};
 }
 if(path==='password'){if(body.currentPassword!==demoPasswords[user.id])throw Error('Senha atual incorreta.');if(!body.password||body.password.length<12||body.password.length>128)throw Error('Use de 12 a 128 caracteres.');demoPasswords[user.id]=body.password;return {ok:true};}

 if(path==='state'){
 if(options.method==='PUT'){if(demoRole==='usuario')throw Error('Acesso somente de leitura.');Object.assign(demoData,body.data);demoVersion++;}
 const snapshot=clonePreview(demoData);
 if(demoRole==='usuario'){snapshot.patients=snapshot.patients.filter(p=>p.id===user.patientId);snapshot.appointments=snapshot.appointments.filter(a=>a.patient===user.patientId);snapshot.posts=snapshot.posts.filter(p=>p.status==='Publicado');}
 return {data:snapshot,version:demoVersion};
 }
 if(path==='users'){
 if(demoRole==='usuario')throw Error('Acesso restrito.');
 if(options.method==='POST'){
 if(demoRole!=='superadmin')throw Error('Somente o superadmin pode criar usuários.');
 if(demoUsers.some(u=>u.email===body.email))throw Error('E-mail já cadastrado.');
 if(body.role==='usuario'&&!demoData.patients.some(p=>p.id===body.patientId))throw Error('Selecione uma ficha de paciente.');
 demoUsers.push({id:'demo-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),name:body.name,email:body.email,role:body.role,patientId:body.role==='usuario'?body.patientId:null,ownerId:'admin',active:true});
 }
 if(options.method==='PATCH'){const target=demoUsers.find(u=>u.id===body.id);if(target)target.active=body.active;}
 return {users:demoUsers.filter(u=>demoRole==='superadmin'||u.ownerId==='admin').map(u=>({...u}))};
 }
 throw Error('Recurso disponível na versão com servidor.');
}
'''
app=(root/'public/app.js').read_text().split('\n',1)[1]
app=app.replace('crypto.randomUUID()', "(globalThis.crypto?.randomUUID?.()||('demo-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)))")
app=app.replace("if(location.port)new EventSource('./events').onmessage=()=>location.reload();",'')
app=app.replace("$('footer').lastElementChild.textContent='Área de membros · acesso individual';","$('footer').lastElementChild.textContent='Demonstração HTML · dados fictícios';")
# Helpers stay scoped so both modules can be inlined without duplicate bindings.
view_wrapper="const {renderMembers,patientPortal,storyVideo}=(()=>{\n"+members[:members.index('export const roleNames')]+views+"\nreturn {renderMembers,patientPortal,storyVideo};})();\n"
# Seed uses its own date helper before application initialization.
seed_wrapper="const demoData=(()=>{const today=new Date().toISOString().slice(0,10);\n"+seed+"\nreturn demoData;})();\n"
css=(root/'public/style.css').read_text().split('\n',1)[1]+'.demo-banner{padding:10px 20px;background:#f5dce8;color:#814a65;display:flex;align-items:center;justify-content:center;gap:20px;font-size:11px;position:sticky;top:0;z-index:30}.demo-banner button{background:white;border:1px solid #ddadc5;border-radius:5px;padding:5px 10px;color:#8b4e6d}.authenticated .sidebar{top:45px}.authenticated .main{padding-top:0}@media(max-width:800px){.demo-banner{font-size:9px;gap:8px}}'
html=(root/'public/index.html').read_text().replace('<link rel="stylesheet" href="./style.css">','<style>'+css+'</style>').replace('<script type="module" src="./app.js"></script>','<script>(async function(){\n'+seed_wrapper+shim+view_wrapper+app+'\n})().catch(function(error){document.body.classList.remove("logged-out");const alert=document.createElement("div");alert.style.cssText="position:fixed;inset:20px;z-index:999;background:white;padding:30px;color:#203e31";alert.textContent="Não foi possível abrir o portal: "+error.message+". Baixe este HTML e abra no Chrome, Edge ou Safari com JavaScript ativado.";document.body.append(alert)});</script>')
html=html.replace('<body>', '<body><noscript>Para entrar, baixe o arquivo e abra em um navegador com JavaScript ativado.</noscript>')
(root.parent/'nutri-preview.html').write_text(html)
(root.parent/'nutri-login-atualizado.html').write_text(html)
print('HTML atualizado: /workspace/nutri-preview.html')

from zipfile import ZipFile, ZIP_DEFLATED
with ZipFile(root.parent/'portal-nutri.zip','w',ZIP_DEFLATED) as archive:
    archive.writestr('portal-nutri.html',html)
    archive.writestr('COMO-ABRIR.txt','Extraia o ZIP. Abra portal-nutri.html diretamente no Chrome, Edge, Firefox ou Safari, fora da previa do aplicativo.\n\nAcessos ficticios:\nSuperadmin: lucasdallan / admin123\nNutricionista: admin / demo12345\nPaciente: paciente / demo12345\n\nJavaScript deve estar ativado. Demonstracao offline; nao use dados reais. Alteracoes sao descartadas ao recarregar.\n')
print('ZIP criado:',root.parent/'portal-nutri.zip')

# Direct demo entry. Real server authentication remains unchanged.
start=html.index('async function initSession(){')
end=html.index('async function api(',start)
super_html=html[:start]+"async function initSession(){demoRole='superadmin';document.body.classList.add('authenticated');return demoUsers[0];}\n"+html[end:]
super_html=super_html.replace('<body>', '<body class="authenticated">')
(root.parent/'nutri-superadmin.html').write_text(super_html)

# Keep a static panel visible when an HTML viewer does not execute scripts.
import re
shell=(root/'scripts/superadmin-shell.html').read_text()
super_html=re.sub(r'(<body[^>]*>)[\s\S]*?(<script>)',lambda m:m.group(1)+shell+m.group(2),super_html,count=1)
super_html=super_html.replace("route=location.hash.slice(1)||'dashboard';", "route=location.hash.slice(1)||'members';")
(root.parent/'nutri-superadmin.html').write_text(super_html)
(root.parent/'superadmin-direto.html').write_text(super_html)
with ZipFile(root.parent/'portal-nutri.zip','a',ZIP_DEFLATED) as archive:
    archive.writestr('superadmin.html',super_html)

# Direct patient demo, with the same editable-account UI.
start=html.index('async function initSession(){')
end=html.index('async function api(',start)
patient_html=html[:start]+"async function initSession(){demoRole='usuario';document.body.classList.add('authenticated');return demoUsers.find(u=>u.role==='usuario');}\n"+html[end:]
patient_html=patient_html.replace('<body>','<body class="authenticated">')
(root.parent/'nutri-paciente.html').write_text(patient_html)
with ZipFile(root.parent/'portal-nutri.zip','a',ZIP_DEFLATED) as archive:
    archive.writestr('paciente.html',patient_html)
