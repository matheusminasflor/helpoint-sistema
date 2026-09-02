
## Contexto

Hoje o convite pede duas coisas que parecem redundantes:

1. **Nível de acesso** (owner / admin / manager / member / viewer) — papel global, aplicado a todo o tenant.
2. **Perfil de acesso** por departamento — permissões finas (ver, criar, editar, excluir, aprovar etc.) dentro de TI, MKT, RH ou Qualidade.

Faz sentido seu incômodo: para 95% dos usuários, o que realmente importa é "o que ele pode fazer dentro do departamento dele". Os níveis globais só existem de verdade para três coisas: **dono da empresa**, **administrador do sistema** (gerencia faturamento, usuários, integrações) e **todo o resto**.

## Proposta

Reduzir o "nível de acesso" a uma escolha binária e simples, e mover toda a configuração fina para o perfil de acesso do departamento.

### Novo fluxo de convite

```text
1. E-mail
2. Departamento  (TI / MKT / RH / Qualidade / Outro)
3. Perfil de acesso do departamento  ← define tudo que ele faz
       └─ [opcional] Personalizar permissões só deste usuário
4. ⬜ Este usuário também administra a empresa
       (faturamento, convites, configurações globais)
```

- Sem o checkbox → vira `member` por baixo dos panos. As permissões funcionais vêm 100% do perfil do departamento.
- Com o checkbox → vira `admin`. Continua tendo o perfil do departamento, mas ganha acesso às telas globais (Usuários, Plano, Integrações, Auditoria).
- `owner` permanece existindo no banco, mas só para o dono do tenant — nunca aparece como opção no convite.
- `manager` e `viewer` deixam de ser oferecidos no convite (o equivalente vira "perfil Gestor" ou "perfil Somente leitura" dentro do departamento).

### O que muda na prática

| Hoje | Depois |
|---|---|
| 5 níveis globais + perfil por depto | 1 toggle "é admin?" + perfil por depto |
| "Gestor de MKT" = role `manager` + perfil MKT | "Gestor de MKT" = perfil MKT chamado "Gestor" |
| "Só leitura no RH" = role `viewer` + perfil RH | Perfil RH "Somente leitura" |
| Confusão sobre quem manda em quê | Perfil decide tudo dentro do depto |

### O que NÃO muda

- Banco continua com `user_roles` e o enum `app_role` (owner/admin/member). Mexer nisso quebraria RLS, auditoria e edge functions em vários pontos. Só escondemos da UI.
- Perfis de acesso por departamento continuam exatamente como estão (criados nesta sessão).
- `owner` do tenant continua intocável.

### Onde aplicar a mudança

1. **`InviteUserDialog`** — remover o seletor de "Nível de acesso" com 5 cards; trocar por um checkbox "Também administra a empresa". O bloco de "Perfil de acesso" vira obrigatório quando o depto for TI/MKT/RH/Qualidade.
2. **`UserModulesEditor`** (edição do usuário existente) — mesma simplificação: toggle de admin + perfis por depto. Remover a seção de troca de role com 5 opções.
3. **Tabela de usuários em `SystemSettings`** — coluna "Nível" passa a mostrar só **Admin** / **Usuário** / **Dono**, com o perfil do depto logo abaixo.
4. **Seeds de perfis padrão** — para cada departamento criar automaticamente três templates ao primeiro acesso: **Gestor**, **Operador**, **Somente leitura**. Assim o admin nunca começa com a lista vazia e os antigos "manager/viewer" têm equivalente direto.
5. **Migração de dados** — usuários atuais com role `manager` ou `viewer` são rebaixados para `member` e recebem automaticamente o perfil "Gestor" ou "Somente leitura" do departamento deles. Quem é `admin` continua `admin`.

### Riscos e mitigação

- **Permissões legadas hardcoded em telas** que checam `role === 'manager'` precisam passar a checar o perfil do depto. Vou varrer e listar antes de mudar para não quebrar nada silenciosamente.
- **Edge functions** que dependem de role (ex.: `invite-signup` só deixa quem é admin convidar) continuam funcionando porque o banco mantém o enum.
- **Reversibilidade**: como o banco não muda, dá para reexpor o seletor antigo a qualquer momento.

## Pergunta antes de implementar

Quer que eu trate o checkbox como **"Administra a empresa"** (= role `admin`, único nível extra acima do comum) ou prefere **dois toggles** — "Administra a empresa" e "Pode gerenciar o departamento dele" (esse segundo viraria automaticamente um perfil "Gestor" no depto)?

Minha recomendação: **só o toggle de admin**. Gestão de departamento já é responsabilidade do perfil de acesso — adicionar um segundo toggle traz de volta a confusão que estamos eliminando.
