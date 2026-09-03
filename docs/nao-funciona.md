# O que existe no código e não funciona

Leitura obrigatória antes de "consertar" ou "completar" qualquer coisa. Estes
itens estão no repositório, mas não são alcançáveis ou não fazem o que o nome
diz. Arquivo existir não é prova de funcionalidade. As referências `§` apontam
para `docs/inventario-sistema.md`.

## Existe, mas não é alcançável ou não faz nada

| Onde | Estado real |
|---|---|
| `BlockEditor`, `BlockItem`, `SortableBlockItem`, `POPPreview` | Editor de blocos completo e **nunca importado**; POPs são sempre markdown (§2.6) |
| `DashboardCustomizer` | Grava preferências que **não afetam** a tela renderizada (§2.6) |
| `CreateReportDialog`, `ReportDetailSheet`, `useInsightReports` | CRUD de relatórios agendados **sem tela que os monte** (§2.6) |
| `OffboardingAccessPanel` | Depende de `revoke_ticket_id`, campo que **nada no frontend grava** (§2.6) |
| `useMKTQuotations` (8 funções), `useMKTAICreative` (5), `useMKTMetrics` | Camadas de dados **sem nenhuma UI** (§5.6) |
| `MetaConnectButton` | Único caminho para conectar conta social e **não é renderizado em lugar nenhum** (§5.6) |
| Botão "Marcar publicado" do calendário social | **Não publica nada** — só troca o status local (§5.5) |
| `mkt-meta-refresh-token` | O front chama (`useMKTSocialAccounts.ts:175`), a edge function **não existe** |
| Formato de importação "Forteplus" do Financeiro | Rótulo decorativo, sem regra de parsing própria (§6.6) |
| Aba "Padrões (IA)" do dashboard de Qualidade | Card estático "em preparação" (§4.9) |
| Aba "Equipe" de `QualidadeSettings` | Desativada por `disabled` (§4.9) |
| `sac_form_fields` | Configurável na tela, **sem consumidor** no formulário público (§4.9) |
| `heatmap`, `funnel`, `productByCategory`, `topCategories`, `slowest` (Qualidade) | Calculados e **nunca renderizados** (§4.9) |
| `src/pages/sac/Login.tsx` | Arquivo morto, substituído pelo OTP (§4.9) |
| `sac-check-customer`, `sac-public-submit` | Edge functions **órfãs** (§4.9) |
| `ui/sidebar.tsx`, `ui/chart.tsx` | Scaffold shadcn não importado por ninguém (§7.4) |
| `mkt_ugc_content` e os tipos `MKTUGC` | Tabela **excluída do banco**, tipos ainda no código (§5.4) |
| Conciliação bancária no Financeiro | **Não existe** (§6.6) |
| `/ti/dashboard` | Rota citada em atalhos da home que **não existe** (§2.1) |

## Funciona, mas com regra errada — corrigir, não replicar

- `tenant_id` sem trigger em 5 tabelas de Marketing (§5.6).
- `percentage` de SLA é código de urgência disfarçado de percentual (§2.3).
- "Ativos em uso" tem duas definições concorrentes; janela de vencimento tem
  três implementações (§2.3).
- Denominador de `slaCompliance` por técnico usa todos os resolvidos, não só
  os que têm SLA (§2.3).
- `useFinEntries()` traz a tabela inteira sem paginação para calcular
  indicadores no cliente (§6.6).
- `useResetSACCustomerPassword` chama `resetPasswordForEmail`, incompatível
  com o login OTP do cliente (§4.9).

## Dívidas de base

- Cobertura de teste: 1 teste no front (`expect(true)`), pgTAP nascendo em
  `supabase/tests/database/`.
- `npm run lint`: 550 problemas (510 erros, 40 avisos), 463 `no-explicit-any`. Não pode piorar.
- Chunk principal de 3,4 MB sem code splitting.
- Backend de Marketing sem tela: tabelas e hooks existem, UI não (§5.6).
