# Nutri — portal da nutricionista

Demonstração funcional, responsiva e em português para acompanhamento nutricional.

## Iniciar

Requer Node.js 22 ou superior. Sem dependências npm externas.

```sh
npm run dev
```

O servidor escuta na porta 3000 (configure `PORT` para outra porta). Abra o servidor usando o encaminhamento de portas da sua ferramenta de desenvolvimento. Ao editar os arquivos de `public/`, a página aberta recarrega automaticamente por Server-Sent Events. O ambiente de onboarding não disponibiliza ferramenta de preview público; uma URL pública depende do recurso de portas/hosting do provedor.

## Funcionalidades

- Painel com indicadores derivados dos registros e gráfico mensal real.
- Cadastro, pesquisa e edição de pacientes.
- Ficha com objetivo, peso, altura, IMC de referência e plano alimentar em texto.
- Histórico de evolução com peso, cintura e orientações.
- Agenda com agendamento e atualização de status.
- Criação e edição de conteúdos publicados ou rascunhos no portal local.
- Stories de texto e emoji com visualização e expiração após 24 horas.
- Persistência local no navegador e exportação de backup JSON.

## Limites desta versão

Use apenas dados fictícios. Não há backend de pacientes, autenticação, isolamento por usuário ou sincronização entre dispositivos. O botão Publicado salva no portal local; não publica em redes sociais. Antes do uso profissional com dados de saúde, implementar autenticação, controle de acesso, armazenamento seguro, consentimento, backups e requisitos de privacidade aplicáveis. IMC é uma referência numérica e não um diagnóstico.

Dados de pacientes ficam no navegador e nunca devem ser incluídos em commits. Fontes Google são opcionais; a interface funciona com fontes locais alternativas.

## GitHub e publicação

A sincronização de código é feita com commits e `git push origin HEAD:main`. Revise mudanças antes de enviar. Não há envio automático de arquivos a cada edição. O workflow GitHub Pages publica `public/` após push em `main`, quando Pages estiver configurado para GitHub Actions nas configurações do repositório. Em Pages, o recurso de recarregar ao editar não é executado; ele pertence ao servidor de desenvolvimento.
