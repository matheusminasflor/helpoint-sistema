# Proposta — Indicadores do Marketing

Pedido do dono, 2026-11-03: a parte de Marketing da planilha `GESTAO_MKT_E_TI_2.xlsx` (PAINEL MKT), apresentada ao
diretor toda segunda, dentro do Helpoint, no mesmo jeito dos Indicadores da TI. Desenho:
https://claude.ai/artifact/Ff9HcAWjK5BWbxjhYsJjQb

## Medido em 2026-11-03

- **No Helpoint:**
  - nenhuma conta do Instagram conectada (`mkt_social_accounts` vazia);
  - CRM desligado (0 negócios);
  - 64 chamados do Marketing.
- **Reportei:** tem as 3 contas do Instagram (@minasflor, @bymf.br, @mf.professional), a página do Facebook, a conta de
  anúncios "MF INTERNO - Marketing" e o Google Meu Negócio.
- **Kommo:** dá os leads por segmento. De 26/10 a 01/11 foram 22: 11 de salão, 8 de entrada e 3 de distribuidor.
- **A ligação com a Meta (`mkt-meta-oauth`) e com o Bling (`bling-oauth`) já existe no código**, mas sem as chaves
  (`META_APP_ID`/`META_APP_SECRET`, `BLING_CLIENT_ID`/`BLING_CLIENT_SECRET`).

## Decisões do dono (2026-11-03)

1. **Redes, tráfego e leads: ligar o Helpoint direto na Meta e no Kommo** (não pela tarefa do Claude, nem digitado).
   - **Meta:** Instagram (3 contas), página e anúncios, por um aplicativo da Minasflor. Nas contas da própria
     empresa, o aplicativo funciona em modo de desenvolvimento, sem a revisão da Meta.
   - **Kommo:** uma integração privada (chave de longa duração).
2. **Artistas: lançar no Helpoint, com o histórico.**
   - O Marketing lança cada entrega: data, artista, tipo, quantidade, produto, se foi aprovada e se foi na campanha.
   - Marca a reunião do mês.
   - A bonificação sai pela regra da planilha.
   - As linhas da aba ARTISTAS entram uma vez.
3. **Vendas (e-commerce e internas): pelo Bling, das notas fiscais faturadas.**
4. **Comunidade MF Lovers: fora por enquanto.**

## A regra da bonificação (aba PAINEL MKT, nota da seção 1)

- **Peso de cada peça:** na campanha vale 100%; aprovada fora da campanha, 50%; reprovada, 0%.
- **Fórmula:** bonificação do mês = teto do artista × (⅓ × mín(1, stories ponderados ÷ 10) + ⅓ × mín(1, reels e posts
  ponderados ÷ 6) + ⅓ × reunião do mês).
- **Exemplo:** teto de R$ 4.000, 10 stories na campanha, 3 reels na campanha e reunião presente
  → 4000 × (⅓ + ⅓ × 0,5 + ⅓) = R$ 3.333.

## Ordem

1. **Artistas:** não depende de chave.
2. **Ligações:** Meta, Kommo e Bling, cada uma quando o dono fizer o passo dele
   (`docs/marketing-ligacoes-meta-kommo-bling.md`).
3. **Visão Geral do Marketing:** leads, redes, tráfego, vendas e artistas, com meta e cor.
4. **Analítico, modo apresentação e PDF:** iguais aos da TI.
