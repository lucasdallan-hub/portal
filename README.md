# Nutri — portal com área de membros

Portal em português para acompanhamento nutricional. O servidor usa Node.js 22+ sem dependências npm externas. Python 3 é necessário para gerar a demonstração e executar os testes de geração.

```sh
npm start
```

A entrada é `server.js`. O comando serve a interface e a API de login, permissões e registros no mesmo processo. Não é necessário instalar pacotes npm. Ao executar no seu computador, abra a porta 3000 no navegador. Nesta nuvem, use o encaminhamento de portas do provedor, quando disponível.

Para configurar, copie `.env.example` para `.env` e ajuste os valores; `npm start` lê esse arquivo automaticamente e preserva as variáveis fornecidas pela hospedagem. A API `GET /health` retorna `{"status":"ok"}` quando o servidor está ativo.

```sh
npm run dev  # desenvolvimento com reinício do Node e atualização da página
npm test
```

O servidor escuta em `0.0.0.0:3000` (`PORT` altera a porta). A visualização é atualizada ao editar arquivos em `public/`. Use o encaminhamento de porta da ferramenta de desenvolvimento quando disponível.

## Primeiro acesso

Abra o portal e crie o primeiro **superadmin**. Essa tela só existe enquanto não houver contas; não há senha padrão. Escolha uma senha de pelo menos 12 caracteres. Não publique uma instalação acessível a terceiros antes de concluir esse passo.

- **Superadmin:** gerencia nutricionistas e acessos de pacientes; consulta todos os registros. Cria, edita, bloqueia e exclui contas superadmin, admin e paciente; pode alterar perfil e definir nova senha. Edita e exclui registros de todos os responsáveis. É obrigatório manter pelo menos um superadmin ativo.
- **Admin (nutricionista):** gerencia apenas os próprios pacientes, consultas, conteúdos e stories; consulta e bloqueia acessos de seus pacientes. A criação de usuários é exclusiva do superadmin.
- **Usuário (paciente):** consulta somente sua ficha vinculada, plano, evolução, consultas e publicações da nutricionista responsável. Não acessa stories, rascunhos, outras fichas ou gestão de membros. O menu contém apenas Meu acompanhamento, Consultas e Conteúdos; a própria conta continua acessível pelo avatar no cabeçalho.

Para cadastrar um paciente: entre como nutricionista, cadastre a ficha em **Pacientes**. Depois, entre como **superadmin** e use **Área de membros → Criar usuário**, selecionando a ficha. Cada ficha tem um único acesso de paciente. Admins novos começam com um espaço vazio. O superadmin também pode cadastrar ou editar fichas e selecionar a nutricionista responsável no formulário.

Em **Minha conta**, todos podem alterar a própria senha ou sair. A senha inicial é definida pelo gestor e deve ser entregue por canal privado; não há envio de e-mail ou recuperação automática de senha nesta versão.

## Persistência e segurança

As contas e dados são salvos em `.data/members.json`, ignorado pelo Git. `DATA_DIR` altera o diretório; ele deve estar em disco persistente e ter backups. Senhas usam scrypt com salt individual. Sessões de oito horas usam cookie HttpOnly e SameSite=Strict. Reiniciar o servidor encerra as sessões, preservando contas e registros. Permissões e isolamento são verificados na API, inclusive bloqueio imediato de sessões de membros desativados. Escritas concorrentes retornam conflito para evitar sobrescrever outra sessão.

Em produção, use HTTPS e `COOKIE_SECURE=true`. O servidor é destinado a uma única instância: não use múltiplas réplicas escrevendo no mesmo arquivo. Configure banco de dados transacional, backups externos, recuperação de conta, auditoria, consentimento e controles de privacidade antes de usar informações reais de saúde. Esta versão continua sendo de desenvolvimento; utilize dados fictícios.

Os dados antigos do protótipo no localStorage não são importados automaticamente, para não misturar registros sem vínculo de usuário. O HTML independente antigo é apenas um protótipo sem autenticação. A área de membros precisa do servidor Node e não funciona via arquivo HTML ou GitHub Pages. O workflow Pages gera e publica apenas a demonstração fictícia, que funciona sem API e tem seus próprios acessos públicos de teste. Hospede o servidor Node em um provedor compatível para disponibilizar login real com dados persistentes. A execução do workflow depende de GitHub Pages configurado para GitHub Actions no repositório.

O GitHub recebe código por commits e push em `main`, nunca contas, senhas ou backups. Conteúdos marcados como publicados ficam disponíveis aos pacientes vinculados; não há publicação em redes sociais. Stories duram 24 horas.

## Validação

`npm test` usa dados e servidores temporários e verifica configuração inicial única, login, senha incorreta, isolamento entre admins, vinculação de pacientes, bloqueio de escrita e gestão para pacientes, filtro de rascunhos, prevenção de elevação de privilégios, conflito de gravação, origem das requisições, bloqueio de sessão, troca de senha e logout. Os testes não usam o armazenamento da instalação. As regressões cobrem também JSON/datas/horários/históricos inválidos, transferência de responsáveis, revogação de sessões, falha de gravação sem alteração parcial em memória e geração dos HTMLs em uma cópia sem histórico Git.

## HTML de demonstração

Execute `npm run build:demo` (ou `python3 scripts/build-preview.py`) para gerar os HTMLs de login, superadmin, nutricionista e paciente, além de `../portal-nutri.zip`, com CSS e JavaScript embutidos. Use `python3 scripts/build-preview.py --output-dir pasta` para escolher a saída. Os dados fictícios ficam em `scripts/demo-data.json`; o gerador não depende de Git, de commits antigos ou da rede. A prévia permite entrar com o superadmin fictício `lucasdallan` com a senha pública de demonstração `admin123`, além dos usuários `admin` e `paciente` com a senha de teste `demo12345`. Também aceita os e-mails demonstrativos exibidos nas contas. Esses acessos existem apenas no HTML e não são senhas da instalação real. O arquivo não autentica usuários em um servidor e descarta alterações ao recarregar. No portal real, o campo **Usuário ou e-mail** aceita as credenciais individuais cadastradas.

## Stories de vídeo

Em **Stories → Criar story**, selecione **Vídeo** e envie um arquivo MP4, WebM ou Ogg de até 5 MB. Há prévia com controles antes de salvar; título é obrigatório e legenda é opcional. A reprodução depende dos codecs disponíveis no navegador (por exemplo, MP4/H.264). Os stories ficam restritos à área de gestão e saem da visualização após 24 horas; pacientes não recebem stories. No HTML independente, o vídeo é mantido apenas na memória e desaparece ao recarregar.

Nesta versão de desenvolvimento, vídeos são incorporados em base64 no armazenamento JSON do servidor, sujeitos ao limite de 32 MB por gravação do estado completo. Para volume maior e uso profissional, adotar armazenamento de mídia dedicado e endpoints de upload. A API valida tipo, tamanho e assinatura básica do contêiner; não realiza transcodificação.

## Fotos e captura pela câmera

Em **Stories → Criar story → Foto**, selecione uma imagem da galeria ou toque em **Tirar foto**. Em **Vídeo**, use **Gravar vídeo**. São entradas de captura nativas (`capture="environment"`): celulares compatíveis abrem a câmera do sistema; no computador ou em navegadores sem suporte, aparece o seletor de arquivos. Não há gravação automática nem acesso à câmera ao abrir a página. A captura física depende do aparelho e não foi testada neste ambiente.

Fotos JPEG, PNG e WebP de até 5 MB têm prévia antes de salvar. A legenda é opcional. A API verifica tipo, tamanho e assinatura básica da imagem; SVG não é aceito. Fotos seguem o mesmo armazenamento, limite de requisição e expiração de 24 horas dos vídeos. O HTML de demonstração descarta as mídias ao recarregar.

## Editor visual de stories

A criação usa uma prévia vertical 9:16, com texto sobre foto/vídeo ou fundos em degradê. Escolha fundo, cor do texto (botão Aa), alinhamento, tamanho, posição vertical e uma figurinha de emoji. O botão **Publicar story** salva a composição na área de gestão do portal. A publicação preserva texto, fundo, posição e figurinha; não gera um arquivo de vídeo editado e não publica no Instagram. A câmera continua usando a captura nativa do celular. Alterações na prévia HTML são apenas demonstrativas e não persistem ao recarregar.

## Editar minha conta

Todos os perfis encontram **Minha conta → Editar conta**. É possível definir ou alterar o usuário de acesso (3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado), atualizar o e-mail e, opcionalmente, trocar a senha. A senha atual é obrigatória para confirmar. Nova senha exige pelo menos 12 caracteres e confirmação no formulário; deixe os campos novos vazios para manter a senha. Usuário e e-mail precisam ser únicos. O login aceita usuário ou e-mail, sem diferenciar maiúsculas e minúsculas. Contas antigas continuam entrando pelo e-mail até definir um usuário.

A API sempre altera a conta autenticada, sem permitir mudar perfil ou editar outra conta por esse formulário. Alterar os dados encerra as outras sessões e preserva a atual. Na demonstração HTML, a edição é apenas temporária e se perde ao recarregar; a instalação com servidor persiste os dados e mantém as senhas protegidas por scrypt.

A área do paciente busca os conteúdos publicados pela nutricionista responsável a cada 30 segundos enquanto a página estiver visível, e também ao voltar à aba. Stories e rascunhos não são enviados à API do paciente. Na demonstração HTML, os conteúdos são fictícios e não recebem publicações do servidor.

## Gestão global pelo superadmin

Em **Área de membros**, o superadmin pode criar qualquer perfil, editar nome, usuário, e-mail, perfil e senha de outros membros, bloquear, reativar ou excluir contas. Excluir uma nutricionista preserva seus registros e transfere a responsabilidade ao superadmin que executou a ação. A API impede excluir, bloquear ou rebaixar o último superadmin ativo. Para rebaixar um gestor a paciente, transfira suas fichas e conteúdos antes.

As fichas de pacientes, consultas e conteúdos têm opção de exclusão dentro dos formulários de edição, exclusiva do superadmin, com confirmação. Excluir uma ficha remove também suas consultas e a conta de paciente vinculada, encerrando as sessões dessa conta. O histórico de evolução permite editar e excluir registros. Stories podem ser editados no mesmo editor visual, preservando a mídia existente ou substituindo-a. A exclusão de dados usa controle de versão para evitar apagar sobre mudanças de outra sessão. A demonstração HTML simula esses controles com dados fictícios; o servidor verifica as permissões de fato.

## Teste no navegador

Com Playwright e Chromium instalados, execute `npm run test:browser`. Se forem fornecidos pelo ambiente fora do projeto, defina `PLAYWRIGHT_MODULE_PATH` para o módulo Playwright e `BROWSER_PATH` para o executável do Chromium. O script usa diretório temporário e testa o servidor real: três perfis, contas, pacientes, consultas, conteúdos, stories de texto/foto/vídeo, reprodução, conflito de gravação e nova tentativa, confirmação de exclusão e tela móvel. Não acessa as contas ou dados da instalação principal.

Erros de formulário são exibidos dentro da janela. Em caso de falha de gravação ou conflito, o formulário obsoleto é fechado e os dados são recarregados; reabra para revisar antes de tentar novamente. A API valida os dados antes de salvar, e uma falha de escrita não mantém mudanças não persistidas na memória. Ao transferir um paciente para outra nutricionista, consultas e vínculos acompanham a transferência, e o paciente precisa entrar novamente.

## Executar o servidor Node

`server.js` é a entrada principal. `scripts/server.mjs` exporta `createPortalServer` e `startServer`, e mantém a execução direta anterior por compatibilidade. O servidor encerra conexões de atualização e o watcher ao receber SIGINT/SIGTERM. Porta inválida ou ocupada produz uma mensagem legível e saída com erro.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP; normalmente fornecida pela hospedagem. |
| `HOST` | `0.0.0.0` | Interface em que o servidor escuta. |
| `DATA_DIR` | `.data` na raiz do projeto | Diretório persistente de contas e registros. |
| `NODE_ENV` | não definido | Use `production` na hospedagem; desativa o watcher de arquivos. |
| `COOKIE_SECURE` | `false` | Use `true` quando o acesso público for por HTTPS. |

Para colocar online, conecte o repositório a uma hospedagem que execute Node.js 22 ou superior, use `npm start` como comando de início e `/health` como health check. Aponte `DATA_DIR` para um volume persistente e configure HTTPS. Não use armazenamento efêmero para contas e pacientes. O `Procfile` fornecido declara o processo web para plataformas compatíveis. Não execute várias réplicas: o armazenamento atual usa um arquivo JSON em disco.

No primeiro acesso real, crie seu superadmin. Os acessos `lucasdallan/admin123` dos HTMLs são somente da demonstração e não são criados no servidor. As contas reais são salvas no volume e exigem senha individual de pelo menos 12 caracteres.

## Publicar em uma plataforma

O repositório inclui configurações para as duas opções abaixo. A publicação precisa ser iniciada na sua conta da plataforma conectada ao GitHub; estes arquivos não criam serviços por conta própria.

**Render:** em New → Blueprint, conecte este repositório e revise `render.yaml`. A configuração usa Node 22, `npm start`, HTTPS fornecido pela plataforma e um disco persistente em `/var/data`, com `DATA_DIR=/var/data/portal`. O disco exige plano pago (o arquivo sugere Starter); confirme o plano e o preço no painel antes de criar o serviço. Depois do primeiro deploy, abra o endereço fornecido pelo Render e crie seu superadmin. Alterações posteriores em `main` podem ser implantadas pelo serviço conectado.

**Railway:** crie um projeto a partir deste repositório. O arquivo `railway.toml` define o início e a verificação de saúde. Anexe um volume persistente em `/data` e configure `DATA_DIR=/data/portal`, `NODE_ENV=production`, `COOKIE_SECURE=true`, `HOST=0.0.0.0`. Deixe a plataforma fornecer `PORT`, mantenha uma réplica e gere um domínio público com HTTPS nas configurações do serviço. Revise os custos do serviço e volume no painel. Abra o domínio e crie seu superadmin no primeiro acesso.

O GitHub Pages continua servindo somente a demonstração estática; o endereço da plataforma Node será o portal real. Mantenha o volume e seus backups ao recriar ou trocar a hospedagem.

## Hospedagem escolhida: Cloudflare Workers

O portal real está preparado para **Cloudflare Workers com Static Assets e um Durable Object SQLite**, conforme `wrangler.jsonc`. Não publique a API como um site estático do Cloudflare Pages. A interface e a API ficam no mesmo domínio do Worker, e as regras de usuários/pacientes são compartilhadas com o servidor Node.

Contas, registros, mídia e sessões são persistidos no SQLite do Durable Object `Portal`. O banco é criado pela migração `v1` no primeiro deploy, sem disco local ou IDs manuais de D1/R2. Alterações e autenticação são serializadas e salvas atomicamente. O navegador usa cookie HttpOnly/Secure no HTTPS da Cloudflare. A versão Workers usa PBKDF2-SHA-256 com salt individual; o servidor Node mantém scrypt e seus arquivos atuais.

### Rodar localmente no runtime da Cloudflare

```sh
npm ci
npm run cloudflare:dev
```

O Wrangler inicia a aplicação na porta 8787. O estado local fica em `.wrangler/`, ignorado pelo Git. `COOKIE_SECURE=false` vale apenas para o comando de desenvolvimento local; o deploy mantém `true`. A configuração de Worker não usa `.env`, `DATA_DIR` ou disco de Render/Railway.

### Publicar conectando o GitHub

1. Na sua conta Cloudflare, entre em **Workers & Pages** e crie um **Worker** importando este repositório do GitHub.
2. Use o nome `nutri-portal`, igual ao campo `name` do `wrangler.jsonc` (ou altere ambos em conjunto antes do primeiro deploy).
3. Configure a instalação/build com `npm ci --include=dev` e o comando de deploy com `npm run cloudflare:deploy`. O diretório raiz é a raiz do repositório. Use Node.js 22 ou superior no build (`.nvmrc` fixa a versão 22).
4. Revise o plano e as cotas de Workers/Durable Objects no painel e autorize a publicação. O arquivo `wrangler.jsonc` registra os assets, o binding `PORTAL` e a migração SQLite.
5. Abra o endereço `workers.dev` fornecido pelo painel ou adicione seu domínio próprio. No primeiro acesso real, crie sua conta superadmin. Os acessos dos HTMLs fictícios não são criados na hospedagem real.

Para publicar pelo seu computador, a alternativa é executar `npx wrangler login` na sua conta e depois `npm run cloudflare:deploy`. Não coloque tokens em código, commits ou chat. `npm run cloudflare:check` empacota e valida sem publicar.

O arquivo `.data/members.json` do Node não é importado automaticamente no banco da Cloudflare. Se houver contas ou registros reais numa instalação Node, planeje uma migração e backup antes de trocar o endereço de produção. Os namespaces e o nome da classe Durable Object devem ser mantidos para reutilizar os dados nos próximos deploys.

### Limites e validação da versão Workers

A mídia continua incorporada no estado, com limite de 5 MB por foto/vídeo. Na Cloudflare, o limite é de **16 MB por gravação do estado completo**, para limitar o consumo de memória do Worker. O armazenamento SQLite divide o snapshot em partes, preservando caracteres Unicode. Para uma base maior, será necessário migrar mídia para armazenamento dedicado e usar operações de banco por registro. Revise limites, backups e requisitos de privacidade antes do uso profissional com dados de saúde.

`npm run test:cloudflare` executa o smoke de API contra `BASE_URL` local. Use um diretório de estado Wrangler temporário e vazio: o script cria contas fictícias. A fase `CHECK_PHASE=persistence` confirma os registros após reiniciar o Wrangler no mesmo diretório, usando um `CHECK_STATE_FILE` temporário. Para incluir o teste de navegador, configure `PLAYWRIGHT_MODULE_PATH` e `BROWSER_PATH`. O script rejeita destinos externos por padrão para não testar uma conta de produção por engano.

Render/Railway e `npm start` permanecem como alternativas de execução Node; a publicação escolhida na Cloudflare usa os comandos `cloudflare:*` acima.

## WhatsApp — integração em preparação

O provedor informado é `https://api.dallanspace.com.br/api`. A aba **WhatsApp** e os botões na ficha e na consulta estão preparados, com revisão manual da mensagem, telefone e autorização do paciente. Administradores só podem acessar seus próprios pacientes; pacientes não têm acesso à gestão de mensagens.

**O envio Dallanspace ainda não está conectado:** é necessário confirmar na documentação o endpoint, a autenticação, a identificação da instância/número e os eventos de entrega. Não foram inventados endpoints nem feitas tentativas de envio. O servidor devolve `configured: false`, e a interface bloqueia o envio enquanto o adaptador não estiver disponível. Não coloque tokens ou senhas no código, no Git ou no chat.

A orquestração compartilhada (`scripts/whatsapp-service.mjs`) permite conectar um adaptador verificado posteriormente tanto no Node quanto na Cloudflare. Ela exige autorização registrada na ficha, limita solicitações, evita repetir a mesma solicitação durante 60 segundos e registra a intenção antes do envio. Um retorno aceito pelo provedor é exibido como **Aceita**, sem prometer entrega. Timeout ou resposta ambígua fica como **Resultado não confirmado**, sem repetição automática. O histórico guarda metadados da solicitação, sem copiar o texto da mensagem. A conexão com webhook e os status Entregue/Lida dependem da documentação do provedor.

A autorização de WhatsApp é salva na ficha com data e responsável. Telefones brasileiros com DDD de 10/11 dígitos recebem o prefixo 55; para outros países, informe o número internacional com `+`. O HTML independente permanece demonstrativo e não envia mensagens.
