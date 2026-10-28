# Nutri — portal com área de membros

Portal em português para acompanhamento nutricional. Node.js 22+, sem dependências externas.

```sh
npm run dev
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

Os dados antigos do protótipo no localStorage não são importados automaticamente, para não misturar registros sem vínculo de usuário. O HTML independente antigo é apenas um protótipo sem autenticação. A área de membros precisa do servidor Node e não funciona via arquivo HTML ou GitHub Pages. O workflow Pages anterior publica somente arquivos estáticos, sem capacidade de executar a API. Hospede o servidor Node em um provedor compatível para disponibilizar login real.

O GitHub recebe código por commits e push em `main`, nunca contas, senhas ou backups. Conteúdos marcados como publicados ficam disponíveis aos pacientes vinculados; não há publicação em redes sociais. Stories duram 24 horas.

## Validação

`npm test` inicia um servidor isolado e verifica configuração inicial única, login, senha incorreta, isolamento entre admins, vinculação de pacientes, bloqueio de escrita e gestão para pacientes, filtro de rascunhos, prevenção de elevação de privilégios, conflito de gravação, origem das requisições, bloqueio de sessão, troca de senha e logout. O teste não usa o armazenamento da instalação.

## HTML de demonstração

Execute `python3 scripts/build-preview.py` para gerar `../nutri-preview.html` com CSS e JavaScript embutidos. A prévia permite entrar com o superadmin fictício `lucasdallan` com a senha pública de demonstração `admin123`, além dos usuários `admin` e `paciente` com a senha de teste `demo12345`. Também aceita os e-mails demonstrativos exibidos nas contas. Esses acessos existem apenas no HTML e não são senhas da instalação real. O arquivo não autentica usuários em um servidor e descarta alterações ao recarregar. No portal real, o campo **Usuário (e-mail)** aceita o e-mail cadastrado e a senha individual.

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
