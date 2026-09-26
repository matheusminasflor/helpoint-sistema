-- O cliente do Comercial não tinha telefone, e-mail, endereço nem documento
--
-- Leva G (2026-09-26). Quatro decisões do dono, todas na recomendação:
--   1. o cadastro guarda o que o Forteplus NÃO manda, e a importação nunca apaga;
--   2. "quem atende" sai de quem vendeu — nenhum campo novo;
--   3. o documento é digitado quando alguém precisar, e é ele que liga ao SAC;
--   4. quem tem o Comercial cadastra e edita.
--
-- ══ A CONTRADIÇÃO QUE TRAVAVA ESTA LEVA NÃO EXISTIA ═════════════════════════
--
-- O registro dizia que o pedido "cliente vinculado a carteira" contradizia o que
-- o dono falou depois ("quem tem carteira somos nós, atendentes"). Medido: o
-- banco concorda com ele. `com_carteira_membros` liga **carteira a pessoa**
-- (`user_id`, `carteira`), e não a cliente — e tem **zero linhas**, ninguém foi
-- posto em carteira ainda. Não havia contradição: o pedido antigo é que estava
-- mal escrito. E "de quem é este cliente" se descobre sem campo nenhum, porque
-- toda venda guarda `vendedor_codigo` (23 vendedores distintos no histórico).
--
-- ══ O QUE O CADASTRO TINHA ══════════════════════════════════════════════════
--
-- Exatamente as cinco colunas que o CSV do Forteplus manda
-- (`CODIGO;ATIVO;RAZAOSOCIAL;FANTASIA;TABELA`) mais duas que nasceram aqui
-- (`em_condicao`, `tabela_base`). 450 clientes, nenhum com documento, telefone
-- ou endereço — não havia onde guardar.
--
-- ══ POR QUE ISTO NÃO SERÁ APAGADO NA PRÓXIMA CARGA ══════════════════════════
--
-- `com_importar_clientes` faz upsert por `(tenant_id, codigo)` e o
-- `do update set` lista **só** `razao_social`, `fantasia`, `tabela_preco`,
-- `ativo`, `origem` e `updated_at`. Coluna que não está nessa lista sobrevive à
-- importação — é assim que `em_condicao` e `tabela_base` já sobrevivem. Cada
-- lado manda no que é dele: o ERP nos cinco campos dele, nós nos nossos.
--
-- ══ `documento`, E NÃO `cnpj` ═══════════════════════════════════════════════
--
-- O dono disse CNPJ, e a coluna se chama `documento` de propósito: salão que
-- compra como pessoa física existe no processo comercial dele, e uma coluna
-- chamada `cnpj` guardando CPF é mentira que a próxima pessoa acredita. O SAC
-- chama a mesma coisa de `customer_document`, então os dois lados ficam com o
-- mesmo nome — e é por eles que o vínculo se faz.
--
-- **Só dígitos**, 11 ou 14. O SAC grava assim (o único cliente do portal tem
-- `document = 08319138000160`), e comparar texto pontuado com texto sem
-- pontuação é o casamento que erra calado: `08.319.138/0001-60` nunca bate com
-- `08319138000160`, e ninguém descobre porque o resultado é "nenhum chamado".

begin;

alter table public.com_clientes
  add column if not exists documento text,
  add column if not exists telefone  text,
  add column if not exists email     text,
  add column if not exists endereco  text;

comment on column public.com_clientes.documento is
  'CNPJ (14) ou CPF (11), SÓ DÍGITOS. É por ele que os chamados do SAC aparecem '
  'na ficha (`sac_tickets.customer_document`). Digitado por nós: o CSV do '
  'Forteplus não traz documento.';
comment on column public.com_clientes.endereco is
  'ponytail: texto livre, e não CEP/rua/número separados como em '
  '`customer_profiles`. Teto conhecido: não serve para calcular frete nem para '
  'imprimir etiqueta. Saída, se um dia precisar: colunas separadas, e este campo '
  'vira a primeira linha delas.';

-- Só dígitos, e no tamanho de documento brasileiro. Sem isto, a ficha compara
-- com o SAC e não acha, sem erro nenhum.
alter table public.com_clientes
  drop constraint if exists com_clientes_documento_so_digitos;
alter table public.com_clientes
  add constraint com_clientes_documento_so_digitos
  check (documento is null or documento ~ '^[0-9]{11}$' or documento ~ '^[0-9]{14}$');

-- Dois clientes com o mesmo documento é o mesmo cliente cadastrado duas vezes —
-- e faria o chamado do SAC aparecer em duas fichas. Parcial: os 450 estão sem
-- documento hoje, e nulo não colide com nulo.
drop index if exists public.com_clientes_documento_unico;
create unique index com_clientes_documento_unico
  on public.com_clientes (tenant_id, documento)
  where documento is not null;

-- ── Quem edita (decisão 4) ──────────────────────────────────────────────────
-- Era `is_admin_or_higher or tem_permissao(comercial/vendas/importar)`: o
-- vendedor não conseguia corrigir o telefone do cliente que ele atende. Passa a
-- ser quem tem o Comercial — `has_comercial_access` já inclui gestor para cima.
--
-- O ramo do `importar` FICA: `com_importar_clientes` não é `security definer`,
-- então ela grava com os poderes de quem chamou, e quem importa precisa
-- satisfazer esta policy. Tirá-lo quebraria a importação para quem tem a
-- permissão de importar sem ter o módulo.
--
-- DELETE continua não existindo, de propósito: cliente com venda no histórico
-- não se apaga — `ativo = false` é o caminho, e é o que o Forteplus manda.
alter policy "com_clientes_insert" on public.com_clientes
  with check (
    tenant_id = get_user_tenant_id()
    and (
      has_comercial_access(auth.uid())
      or tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar')
    )
  );

alter policy "com_clientes_update" on public.com_clientes
  using (
    tenant_id = get_user_tenant_id()
    and (
      has_comercial_access(auth.uid())
      or tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar')
    )
  )
  with check (
    tenant_id = get_user_tenant_id()
    and (
      has_comercial_access(auth.uid())
      or tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar')
    )
  );

-- ── Quem atende este cliente (decisão 2) ────────────────────────────────────
-- Derivado de quem vendeu, e não de um campo que alguém teria de manter. Quando
-- dois vendedores atenderam o mesmo cliente, os dois aparecem, com quanto cada
-- um vendeu e quando foi a última — é a informação que responde "a quem cobrar
-- o retorno deste cliente".
--
-- `classe in ('venda','devolucao')` e `valor_curva` para a conta ser a MESMA que
-- todo o resto do Comercial faz: bonificação e publicidade não são venda de
-- ninguém, e somá-las aqui daria a um vendedor crédito que ele não teve.
create or replace function public.com_quem_atende_cliente(
  p_codigo text, p_de date, p_ate date, p_filial text default null
)
returns table (
  vendedor_codigo text,
  vendedor_nome text,
  valor numeric,
  notas bigint,
  ultima_venda date
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    i.vendedor_codigo,
    coalesce(max(i.vendedor_nome), i.vendedor_codigo) as vendedor_nome,
    sum(i.valor_curva) as valor,
    count(distinct i.documento) as notas,
    max(i.emissao) as ultima_venda
  from public.com_vendas_itens i
  where i.cliente_codigo = p_codigo
    and i.classe in ('venda', 'devolucao')
    and i.emissao between p_de and p_ate
    and (p_filial is null or i.filial = p_filial)
    and i.vendedor_codigo is not null
  group by i.vendedor_codigo
  order by sum(i.valor_curva) desc;
$$;

comment on function public.com_quem_atende_cliente(text, date, date, text) is
  'Quem vendeu para este cliente no período, com valor, notas e a última venda. '
  'É a resposta a "de quem é este cliente" SEM campo novo: carteira é do '
  'atendente (decisão do dono), e a venda é que diz quem atendeu.';

-- Regra 14: função nova nasce com execute para PUBLIC.
revoke all on function public.com_quem_atende_cliente(text, date, date, text) from public, anon;
grant execute on function public.com_quem_atende_cliente(text, date, date, text) to authenticated;

-- ── As tabelas de preço que existem, para o seletor do formulário ────────────
-- Gêmea de `com_tabelas_base()`, e existe pelo mesmo achado da auditoria da
-- L6c: `select('tabela_preco')` traria `com_clientes` inteira para o navegador
-- só para tirar o `distinct` em JS, e o PostgREST corta em 1000 **em silêncio**
-- — numa empresa com mais de mil clientes as tabelas sumiriam do seletor sem
-- aviso. A conta mora no banco.
--
-- E é `tabela_preco`, não `tabela_base`: são vocabulários diferentes. Hoje há
-- dez valores em `tabela_preco` ("ATACADISTA CONDICAO", "VIP MAIS CONDICAO"…)
-- contra sete em `tabela_base` — o sufixo CONDICAO é justamente o que
-- `em_condicao` separa. Oferecer a lista base num campo que grava `tabela_preco`
-- apagaria a condição de quem a tem, calado.
create or replace function public.com_tabelas_preco()
returns table (tabela_preco text)
language sql
stable
set search_path = public
as $$
  select distinct c.tabela_preco
  from public.com_clientes c
  where c.tenant_id = (select public.get_user_tenant_id())
    and c.tabela_preco is not null
  order by c.tabela_preco;
$$;

revoke all on function public.com_tabelas_preco() from public, anon;
grant execute on function public.com_tabelas_preco() to authenticated;

commit;
