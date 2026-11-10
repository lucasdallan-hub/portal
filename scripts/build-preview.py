"""Build the fictional, offline portal demo without Git or network access."""
import argparse
import json
import re
from html import escape
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-dir', type=Path, default=root.parent)
args = parser.parse_args()
output = args.output_dir.resolve()
output.mkdir(parents=True, exist_ok=True)

members = (root / 'public/members.js').read_text()
app = (root / 'public/app.js').read_text()
imports = re.search(r"import\s*\{([^}]+)\}\s*from\s*['\"]\./members\.js['\"];?", app)
if not imports:
    raise ValueError('The application must import its member helpers explicitly.')
helpers = [name.strip() for name in imports[1].split(',') if name.strip() not in ('api', 'initSession')]
app = app[:imports.start()] + app[imports.end():]
app = app.replace('crypto.randomUUID()', "(globalThis.crypto?.randomUUID?.()||('demo-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)))")
# Live reload belongs to the development server, never to a standalone document.
app = re.sub(r"if\(location\.port\)new EventSource\('./events'\)\.onmessage=\(\)=>location\.reload\(\);", '', app)
app = app.replace("'Área de membros · acesso individual'", "'Demonstração HTML · dados fictícios'")
wrapper = 'const {' + ','.join(helpers) + '}=(()=>{\n'
wrapper += re.sub(r'\bexport\s+', '', members)
wrapper += '\nreturn {' + ','.join(helpers) + '};})();\n'

fixture = json.loads((root / 'scripts/demo-data.json').read_text())
seed = 'const demoData=(()=>{const now=Date.now(),today=new Date().toLocaleDateString("sv-SE");const value='
seed += json.dumps(fixture, ensure_ascii=False)
seed += ';for(const rows of Object.values(value))for(const row of rows){if(row.date==="__TODAY__")row.date=today;if(row.created==="__NOW__")row.created=now;}return value;})();\n'
runtime = (root / 'scripts/demo-runtime.js').read_text()
css = re.sub(r'@import\s+[^;]+;', '', (root / 'public/style.css').read_text())
css += '.demo-banner{padding:10px 20px;background:#f5dce8;color:#814a65;display:flex;align-items:center;justify-content:center;gap:20px;font-size:11px;position:sticky;top:0;z-index:30}.demo-banner button{background:white;border:1px solid #ddadc5;border-radius:5px;padding:5px 10px;color:#8b4e6d}.demo-banner~.sidebar{top:45px}@media(max-width:800px){.demo-banner{font-size:9px;gap:8px}}'
error_handler = '''})().catch(function(error){const alert=document.createElement("div");alert.style.cssText="position:fixed;inset:20px;z-index:999;background:white;padding:30px;color:#603d4d";alert.textContent="Não foi possível abrir o portal: "+error.message+". Abra o HTML no navegador com JavaScript ativado.";document.body.append(alert)});'''
script = '<script>(async function(){\n' + wrapper + seed + runtime + '\n' + app + '\n' + error_handler + '</script>'
base = (root / 'public/index.html').read_text()
html = base.replace('<link rel="stylesheet" href="./style.css">', '<style>' + css + '</style>')
html = html.replace('<script type="module" src="./app.js"></script>', script)
html = html.replace('<body>', '<body><noscript>Abra este arquivo em um navegador com JavaScript ativado para usar os botões.</noscript>')


def direct_entry(role):
    """Direct demo entry only. No real-server authentication is bypassed."""
    entry = "async function initSession(){const user=demoUsers.find(u=>u.role===" + json.dumps(role) + ");demoUserId=user.id;document.body.classList.add('authenticated');return demoPublicUser(user);}\n"
    # Replace the demo implementation, not the real API helper inside wrapper.
    direct_runtime = re.sub(r'async function initSession\(\)\{[\s\S]*?(?=async function api\()', lambda _: entry, runtime, count=1)
    direct = html.replace(runtime, direct_runtime).replace('<body>', '<body class="authenticated">')
    if role == 'superadmin':
        shell = (root / 'scripts/superadmin-shell.html').read_text()
        direct = re.sub(r'(<body[^>]*>)[\s\S]*?(<script>)', lambda m: m[1] + shell + m[2], direct, count=1)
        direct = direct.replace("route=location.hash.slice(1)||'dashboard';", "route=location.hash.slice(1)||'members';")
    else:
        # Render a basic, current patient panel even in a script-disabled viewer.
        patient = fixture['patients'][0]
        nav = '<nav id="nav">' + ''.join(f'<a href="#{key}">{label}</a>' for key, label in [('dashboard', 'Meu acompanhamento'), ('agenda', 'Consultas'), ('content', 'Conteúdos')]) + '</nav>'
        direct = direct.replace('<nav id="nav"></nav>', nav)
        panel = f'<main id="app"><div class="page-heading"><div><div class="eyebrow">ESPAÇO DO PACIENTE · DEMONSTRAÇÃO</div><h1>Olá, Ana 🌿</h1></div></div><div class="card post"><h2>Meu plano e orientações</h2><p>{escape(patient["notes"])}</p></div><p class="note">Os botões funcionam ao abrir o HTML no navegador com JavaScript ativado.</p></main>'
        direct = direct.replace('<main id="app"></main>', panel)
    return direct


super_html = direct_entry('superadmin')
patient_html = direct_entry('usuario')
admin_html = direct_entry('admin')
files = {'nutri-preview.html': html, 'nutri-login-atualizado.html': html, 'nutri-superadmin.html': super_html, 'superadmin-direto.html': super_html, 'nutri-paciente.html': patient_html, 'nutri-admin.html': admin_html}
for name, contents in files.items():
    (output / name).write_text(contents)
with ZipFile(output / 'portal-nutri.zip', 'w', ZIP_DEFLATED) as archive:
    for name, contents in [('portal-nutri.html', html), ('superadmin.html', super_html), ('paciente.html', patient_html), ('admin.html', admin_html)]:
        archive.writestr(name, contents)
    archive.writestr('COMO-ABRIR.txt', 'Extraia o ZIP e abra portal-nutri.html no navegador com JavaScript ativado.\n\nAcessos fictícios:\nSuperadmin: lucasdallan / admin123\nNutricionista: admin / demo12345\nPaciente: paciente / demo12345\n\nDemonstração offline. Não use dados ou senhas reais. Alterações são descartadas ao recarregar. O portal real exige o servidor Node.js.\n')
print(f'HTMLs e ZIP de demonstração gerados em {output}')
