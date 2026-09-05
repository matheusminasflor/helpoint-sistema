# Fluxo do time de agentes

Quatro agentes em `.claude/agents/`, cada um com o seu modelo. Existem para
separar quatro coisas que se atrapalham quando moram na mesma cabeça: **decidir**,
**aplicar**, **desconfiar** e **apresentar**.

| Agente | Modelo | Faz | Não faz |
|---|---|---|---|
| `planejador` | Fable 5.1 | Lê o sistema, grelha a fronteira, escreve o plano executável | Não edita código |
| `executor` | Sonnet 5 | Aplica plano escrito | Não decide |
| `auditor` | Fable 5.1 | Revisa o diff nos dois eixos, roda as provas, devolve achados | Não corrige |
| `aprovador` | Sonnet 5 | Monta o dossiê para o humano | Não faz merge, push nem deploy |

## O ciclo

```
   humano
     │  pedido
     ▼
 planejador ──── perguntas da fronteira ────► humano
     │                                          │
     │  ◄──────────── decisões ─────────────────┘
     │  plano (arquivo por arquivo + comando de aceitação)
     ▼
  executor
     │  diff + relatório (feito / encontrei mas não toquei / precisa de decisão)
     ▼
  auditor
     │  achados + provas rodadas
     ├──── reprovou ──► volta ao planejador (plano novo; o executor não conserta sozinho)
     ▼
 aprovador
     │  dossiê
     ▼
   humano ──► merge, push, deploy
```

## Por que a volta é para o planejador, e não para o executor

Quando o auditor reprova, a tentação é mandar o executor consertar. Não é o
desenho.

O executor tem um recorte do sistema, de propósito. Um achado de auditoria
quase sempre significa que o **plano** estava incompleto — e um plano
incompleto consertado por quem tem recorte vira palpite. O caminho é: achado
→ planejador → plano novo → executor.

A exceção é achado puramente mecânico e nomeado pelo auditor com precisão
("na linha 41, `percentage` devia ser `percentual`"). Aí o executor aplica
direto, porque não sobrou escolha nenhuma para fazer.

## O que nunca se delega

Está no `CLAUDE.md` e vale contra os quatro agentes:

- **schema** — tabela, coluna, tipo, constraint;
- **RLS** — quem enxerga o quê;
- **cálculo que vira regra de negócio** — o número que aparece na tela de
  alguém e vira decisão de gestão;
- **o portão de revisão final** — merge, push, deploy.

O planejador **prepara** essas decisões: opções, custos, o que quebra em cada
caminho, recomendação. Quem escolhe é o humano. Um plano que já desenhou a
policy de RLS não é plano, é fato consumado.

## Quando NÃO usar o time

O ciclo inteiro custa quatro rodadas. Ele existe para trabalho que ramifica —
tabela nova, mudança de contrato, módulo novo, escolha entre abordagens.

Para correção óbvia, bug com causa já localizada, ajuste de texto ou decisão
já grelhada na conversa, o ciclo é desperdício: faça direto e mande revisar.
O `CLAUDE.md` diz o mesmo sobre a skill `grilling`, e pela mesma razão.

## O que cada um lê antes de começar

Os quatro leem o `CLAUDE.md`. Além dele:

| Agente | Leitura obrigatória |
|---|---|
| `planejador` | `docs/nao-funciona.md` (o que já é adiamento conhecido), `docs/decisoes.md` (ADR fechado não se reabre), o banco real |
| `executor` | O plano inteiro, antes de tocar em arquivo |
| `auditor` | O plano, o diff, e `docs/nao-funciona.md` — para não aplaudir a remoção de algo que está esperando uma tela planejada |
| `aprovador` | O relatório do executor e os achados do auditor. Nada mais: ele não produz conhecimento novo |

## As skills, e de quem são

As skills de **decisão** são do planejador e do auditor, porque produzem
julgamento sobre o projeto inteiro:

- `grilling`, `diagnosing-bugs`, `codebase-design`, `domain-modeling` —
  planejador;
- `code-review`, `ponytail-review` — auditor, e os dois, sempre. Eixos
  diferentes: padrão e excesso.

As skills de **execução** são do executor: `implement`, `tdd`,
`resolving-merge-conflicts`.

`lean-ctx` e `ponytail` são de todos, o tempo todo. O primeiro é política
mecânica (as ferramentas `ctx_*` no lugar de Grep/Glob/Read nativos); o
segundo é a escada — pare no primeiro degrau que segura.

## Onde as provas moram

O plano diz qual prova, o executor a escreve, o auditor a roda.

| Tipo de regra | Onde se prova | Exemplo no repositório |
|---|---|---|
| Vive no banco (RLS, trigger, RPC) | pgTAP, `supabase/tests/database/` | `rls_tickets_isolamento_por_tenant.test.sql` |
| Pura (cálculo, formatação) | Vitest | `src/types/helpdesk.test.ts` |
| Caminho do usuário | Navegação real no `test-helpoint` | — (é do humano) |

E a pergunta que o auditor faz em todo teste novo: **o que este teste teria
feito se o defeito estivesse lá?** Comando verde prova que o comando passou,
não que a causa foi embora.
