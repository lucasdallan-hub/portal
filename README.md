# Nutri — portal com área de membros

Portal em português para acompanhamento nutricional. Node.js 22+, sem dependências externas.

```sh
npm run dev
npm test
```

O servidor escuta em `0.0.0.0:3000` (`PORT` altera a porta). A visualização é atualizada ao editar arquivos em `public/`. Use o encaminhamento de porta da ferramenta de desenvolvimento quando disponível.

## Primeiro acesso

Abra o portal e crie o primeiro **superadmin**. Essa tela só existe enquanto não houver contas; não há senha padrão. Escolha uma senha de pelo menos 12 caracteres. Não publique uma instalação acessível a terceiros antes de concluir esse passo.

- **Superadmin:** gerencia nutricionistas e acessos de pacientes; consulta todos os registros. Cria contas admin ou paciente, bloqueia e reativa acessos. A conta superadmin inicial não pode ser bloqueada pela gestão de membros.
- **Admin (nutricionista):** gerencia apenas os próprios pacientes, consultas, conteúdos e stories; consulta e bloqueia acessos de seus pacientes. A criação de usuários é exclusiva do superadmin.
- **Usuário (paciente):** consulta somente sua ficha vinculada, plano, evolução, consultas e publicações da nutricionista responsável. Não acessa rascunhos, outras fichas ou gestão de membros.

Para cadastrar um paciente: entre como nutricionista, cadastre a ficha em **Pacientes**. Depois, entre como **superadmin** e use **Área de membros → Criar usuário**, selecionando a ficha. Cada ficha tem um único acesso de paciente. Admins novos começam com um espaço vazio. O superadmin pode criar fichas próprias; para atribuir um novo paciente a uma nutricionista, entre com a conta dessa nutricionista e cadastre-o nesse espaço.

Em **Minha conta**, todos podem alterar a própria senha ou sair. A senha inicial é definida pelo gestor e deve ser entregue por canal privado; não há envio de e-mail ou recuperação automática de senha nesta versão.

## Persistência e segurança

As contas e dados são salvos em `.data/members.json`, ignorado pelo Git. `DATA_DIR` altera o diretório; ele deve estar em disco persistente e ter backups. Senhas usam scrypt com salt individual. Sessões de oito horas usam cookie HttpOnly e SameSite=Strict. Reiniciar o servidor encerra as sessões, preservando contas e registros. Permissões e isolamento são verificados na API, inclusive bloqueio imediato de sessões de membros desativados. Escritas concorrentes retornam conflito para evitar sobrescrever outra sessão.

Em produção, use HTTPS e `COOKIE_SECURE=true`. O servidor é destinado a uma única instância: não use múltiplas réplicas escrevendo no mesmo arquivo. Configure banco de dados transacional, backups externos, recuperação de conta, auditoria, consentimento e controles de privacidade antes de usar informações reais de saúde. Esta versão continua sendo de desenvolvimento; utilize dados fictícios.

Os dados antigos do protótipo no localStorage não são importados automaticamente, para não misturar registros sem vínculo de usuário. O HTML independente antigo é apenas um protótipo sem autenticação. A área de membros precisa do servidor Node e não funciona via arquivo HTML ou GitHub Pages. O workflow Pages anterior publica somente arquivos estáticos, sem capacidade de executar a API. Hospede o servidor Node em um provedor compatível para disponibilizar login real.

O GitHub recebe código por commits e push em `main`, nunca contas, senhas ou backups. Conteúdos marcados como publicados ficam disponíveis aos pacientes vinculados; não há publicação em redes sociais. Stories duram 24 horas.

## Validação

`npm test` inicia um servidor isolado e verifica configuração inicial única, login, senha incorreta, isolamento entre admins, vinculação de pacientes, bloqueio de escrita e gestão para pacientes, filtro de rascunhos, prevenção de elevação de privilégios, conflito de gravação, origem das requisições, bloqueio de sessão, troca de senha e logout. O teste não usa o armazenamento da instalação.
