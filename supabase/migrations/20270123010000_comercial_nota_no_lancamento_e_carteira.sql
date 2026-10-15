-- COMERCIAL: VALOR SÓ COM A NOTA FISCAL, CARTEIRA COM DIRECIONAIS, HISTÓRICO DE 2024 EM DIANTE (dono, 2026-10-15).
-- Pedido: "o campo valor da venda só pode ser preenchido quando o pedido for faturado e ter o campo Nº da nota fiscal";
-- "data do próximo prazo não contar nos indicadores até pôr a nota fiscal"; a Carteira com "A FATURAR" e "Faturado"
-- e os direcionais (quem não teve contato, quem teve, quem não comprou no mês, quem comprou menos que no mês passado);
-- "remover tudo referente a 2020 até 2023". Decisões (múltipla escolha):
--   1. NOTA E VALOR ANDAM JUNTOS (`nota_fiscal`, `nota_em`, `valor_venda`): o lançamento nasce no contato, sem valor; a
--      vendedora volta e completa quando faturar — mesmo concluído, uma vez (é a única coisa que se completa depois);
--   2. LANÇAMENTO SEM NOTA NÃO CONTA nos indicadores (nem como prévia); com nota, conta na DATA DA NOTA;
--   3. o checklist do pedido deixa de escrever o valor do pedido como venda: o pedido é "A faturar";
--   4. os valores de antes, sem nota, não somem: vão para `valor_informado` (só consulta) e saem das contas;
--   5. Carteira: Faturado = lançamentos com nota no mês; A faturar = pedidos fechados sem nota; comprado no mês (o
--      faturado do Forteplus até a última nota importada, e depois os lançamentos com nota) e o do mês passado;
--   6. o relatório "Informado × Faturado" sai (a função dele também);
--   7. vendas de set–dez/2023 apagadas (não havia 2020–2022): o histórico começa em jan/2024.

-- ─── 1. Nota e valor ─────────────────────────────────────────────────────────────────────────────
alter table public.com_interacoes
  add column if not exists nota_fiscal text,
  add column if not exists nota_em date,
  add column if not exists valor_informado numeric(14,2);

-- O valor de antes, sem nota, vira só informação. Sem o guarda: é a migração, não o usuário.
alter table public.com_interacoes disable trigger trg_com_interacao_salva_nao_muda;
update public.com_interacoes
   set valor_informado = valor_venda, valor_venda = null
 where valor_venda is not null and nota_fiscal is null;
alter table public.com_interacoes enable trigger trg_com_interacao_salva_nao_muda;

alter table public.com_interacoes drop constraint if exists com_interacoes_valor_com_nota;
alter table public.com_interacoes add constraint com_interacoes_valor_com_nota check (
  (valor_venda is null and nota_fiscal is null and nota_em is null)
  or (valor_venda > 0 and nullif(btrim(nota_fiscal), '') is not null and nota_em is not null));

-- Lançamento salvo não muda (20261120010000), com UMA exceção: completar a nota e o valor que ainda faltam.
create or replace function public.com_interacao_salva_nao_muda()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user <> 'authenticated' or pg_trigger_depth() > 1 or auth.uid() is null
     or public.com_pode_corrigir_lancamento() then
    return new;
  end if;
  if new.cliente_codigo is distinct from old.cliente_codigo
     or new.data is distinct from old.data
     or new.fora_da_carteira is distinct from old.fora_da_carteira then
    raise exception 'Lançamento salvo não muda de cliente nem de data. Novo contato é um lançamento novo; erro, peça ao gestor.'
      using errcode = '42501';
  end if;
  -- A nota posta não muda (erro, peça ao gestor).
  if old.nota_fiscal is not null
     and (new.nota_fiscal is distinct from old.nota_fiscal or new.nota_em is distinct from old.nota_em
          or new.valor_venda is distinct from old.valor_venda) then
    raise exception 'A nota fiscal já foi posta neste lançamento. Erro, peça ao gestor.' using errcode = '42501';
  end if;
  if old.status = 'concluido'
     and (new.status is distinct from old.status
          or (old.nota_fiscal is not null and new.valor_venda is distinct from old.valor_venda)
          or new.prazo is distinct from old.prazo
          or new.observacoes is distinct from old.observacoes) then
    raise exception 'Lançamento concluído não se altera — só se completa a nota fiscal. Erro, peça ao gestor.' using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- Salvar o lançamento (20261120010000) com a nota: valor zero ou vazio é "sem valor"; a data da nota vem junto.
create or replace function public.com_salvar_interacao(p_id uuid, p_dados jsonb, p_marcas uuid[])
returns uuid language plpgsql set search_path to 'public' as $function$
declare
  v_id uuid;
  v_marcas uuid[] := coalesce(p_marcas, array[]::uuid[]);
  v_valor numeric := nullif(nullif(p_dados ->> 'valor_venda', '')::numeric, 0);
  v_nota text := nullif(btrim(p_dados ->> 'nota_fiscal'), '');
  v_nota_em date := nullif(p_dados ->> 'nota_em', '')::date;
begin
  if (v_valor is null) <> (v_nota is null) then
    raise exception 'O valor da venda vai junto com o Nº da nota fiscal: preencha os dois quando o pedido for faturado.'
      using errcode = '23514';
  end if;
  if v_nota is not null then
    v_nota_em := coalesce(v_nota_em, (now() at time zone 'America/Sao_Paulo')::date);
  else
    v_nota_em := null;
  end if;

  if p_id is null then
    insert into public.com_interacoes
      (cliente_codigo, data, status, valor_venda, nota_fiscal, nota_em, prazo, observacoes, fora_da_carteira)
    values (
      nullif(btrim(p_dados ->> 'cliente_codigo'), ''),
      (p_dados ->> 'data')::date,
      coalesce(nullif(p_dados ->> 'status', ''), 'em_andamento'),
      v_valor, v_nota, v_nota_em,
      nullif(p_dados ->> 'prazo', '')::date,
      nullif(btrim(p_dados ->> 'observacoes'), ''),
      coalesce((p_dados ->> 'fora_da_carteira')::boolean, false)
    )
    returning id into v_id;
    perform set_config('helpoint.lancamento_novo', v_id::text, true);
  else
    delete from public.com_interacao_marcas
     where interacao_id = p_id and not (indicador_id = any (v_marcas));

    update public.com_interacoes set
      cliente_codigo   = nullif(btrim(p_dados ->> 'cliente_codigo'), ''),
      data             = (p_dados ->> 'data')::date,
      status           = coalesce(nullif(p_dados ->> 'status', ''), 'em_andamento'),
      valor_venda      = v_valor,
      nota_fiscal      = v_nota,
      nota_em          = v_nota_em,
      prazo            = nullif(p_dados ->> 'prazo', '')::date,
      observacoes      = nullif(btrim(p_dados ->> 'observacoes'), ''),
      fora_da_carteira = coalesce((p_dados ->> 'fora_da_carteira')::boolean, false)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Lançamento não encontrado, ou é de outra pessoa.' using errcode = '42501';
    end if;
  end if;

  insert into public.com_interacao_marcas (interacao_id, indicador_id)
  select v_id, m from unnest(v_marcas) as m
  on conflict do nothing;
  perform set_config('helpoint.lancamento_novo', '', true);

  return v_id;
end;
$function$;

-- ─── 2. O pedido é "A faturar", não venda ────────────────────────────────────────────────────────
-- Trocas pontuais nas funções em uso (o resto delas fica igual): recusa se o trecho não estiver lá.
create or replace function pg_temp.troca(p_funcao regprocedure, p_de text, p_para text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
begin
  if position(p_de in v_def) = 0 then
    raise exception 'trecho não encontrado em %: %', p_funcao, left(p_de, 80);
  end if;
  execute replace(v_def, p_de, p_para);
end;
$$;

select pg_temp.troca('public.ped_salvar_checklist(uuid, jsonb)'::regprocedure,
$$     set valor_venda = (select coalesce(sum(p.valor), 0) from public.ped_pedidos p
                         where p.checklist_id = v_checklist.id and p.tipo = 'Venda'),
         updated_at = now()$$,
$$     set updated_at = now()$$);

select pg_temp.troca('public.ped_carregar_historico(jsonb, jsonb, boolean)'::regprocedure,
$$(tenant_id, vendedor_id, cliente_codigo, data, status, valor_venda, observacoes, fora_da_carteira)$$,
$$(tenant_id, vendedor_id, cliente_codigo, data, status, valor_informado, observacoes, fora_da_carteira)$$);

-- ─── 3. Nos indicadores, só o lançamento com nota, na data da nota ───────────────────────────────
select pg_temp.troca('public.com_venda_atribuida(date, date)'::regprocedure,
$$       and i.data between p_de and p_ate
       and (c.d is null or i.data > c.d)
       and i.status = 'concluido' and i.valor_venda > 0$$,
$$       and i.nota_em between p_de and p_ate
       and (c.d is null or i.nota_em > c.d)
       and i.valor_venda > 0$$);

select pg_temp.troca('public.com_carteira_mes_a_mes(text, integer)'::regprocedure,
$$                          and i.status = 'concluido' and i.valor_venda > 0
                          and (v_corte is null or i.data > v_corte)
                          and extract(year from i.data)::int = p_ano
                          and extract(month from i.data)::int = m.mes$$,
$$                          and i.valor_venda > 0
                          and (v_corte is null or i.nota_em > v_corte)
                          and extract(year from i.nota_em)::int = p_ano
                          and extract(month from i.nota_em)::int = m.mes$$);

select pg_temp.troca('public.com_situacao_120_dias(date)'::regprocedure,
$$    select i.cliente_codigo, max(i.data) as ultima
      from public.com_interacoes i, ref
     where i.status = 'concluido' and i.valor_venda > 0
       and i.cliente_codigo is not null and i.data <= ref.dia$$,
$$    select i.cliente_codigo, max(i.nota_em) as ultima
      from public.com_interacoes i, ref
     where i.valor_venda > 0
       and i.cliente_codigo is not null and i.nota_em <= ref.dia$$);

-- ─── 4. A Carteira com os direcionais ────────────────────────────────────────────────────────────
drop function if exists public.com_acompanhamento_da_carteira(text, date);
create function public.com_acompanhamento_da_carteira(p_carteira text, p_competencia date)
returns table(grupo_chave text, grupo_nome text, codigos text[], tabelas text, uf_cidade text, situacao text,
              ultima_compra date, dias_sem_comprar integer, faturado_12m numeric, meses_com_compra integer,
              media_meses_compra numeric, recompra boolean, venda_mes numeric, contatos_mes integer, ultimo_contato date,
              status_ultimo_contato text, proximo_prazo date, observacao text,
              venda_mes_passado numeric, faturado_mes numeric, a_faturar numeric, media_3m numeric)
language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_carteira text := public.normalizar_nome_carteira(p_carteira);
  v_de date := date_trunc('month', p_competencia)::date;
  v_ate date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  v_de_passado date := (date_trunc('month', p_competencia) - interval '1 month')::date;
  -- "Hoje" do Brasil, ou o fim do mês se ele já passou — como no painel (lição 10).
  v_ref date := least((now() at time zone 'America/Sao_Paulo')::date, (v_ate - 1));
  -- Faturado manda (20261202030000): o Forteplus até a última nota importada; depois, o lançamento com nota.
  v_corte date := public.com_faturado_importado_ate();
begin
  if v_tenant is null or not public.com_pode_ver_carteira(p_carteira) then
    raise exception 'Você não tem acesso a esta carteira.' using errcode = '42501';
  end if;

  return query
  with clientes as (
    select c.codigo, c.razao_social, c.tabela_preco, c.cidade, c.estado,
           public.com_chave_do_grupo(c.grupo, c.codigo) as chave,
           coalesce(nullif(btrim(c.grupo), ''), c.razao_social) as nome
      from public.com_clientes c
     where c.tenant_id = v_tenant and c.carteira = v_carteira
  ),
  -- Histórico do Forteplus: vendas (não bonificação) dos 12 meses ANTERIORES à competência.
  historico as (
    select cl.chave,
           sum(vi.valor_nota) as faturado,
           count(distinct vi.competencia)::int as meses
      from clientes cl
      join public.com_vendas_itens vi
        on vi.tenant_id = v_tenant and vi.cliente_codigo = cl.codigo
     where vi.classe = 'venda' and vi.valor_nota > 0
       and vi.competencia >= (v_de - interval '12 months')::date and vi.competencia < v_de
     group by cl.chave
  ),
  -- Última compra consolidada (§10): o faturado e o lançamento com nota, a mais recente.
  ultima as (
    select cl.chave,
           greatest(
             (select max(vi.emissao) from public.com_vendas_itens vi
               where vi.tenant_id = v_tenant and vi.cliente_codigo = cl.codigo
                 and vi.classe = 'venda' and vi.valor_nota > 0 and vi.emissao <= v_ref),
             (select max(i.nota_em) from public.com_interacoes i
               where i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo
                 and i.valor_venda > 0 and i.nota_em <= v_ref)
           ) as data
      from clientes cl
  ),
  ultima_grupo as (
    select u.chave, max(u.data) as data from ultima u group by u.chave
  ),
  -- Comprado no mês e no mês passado: o Forteplus até o corte, o lançamento com nota depois dele.
  comprado as (
    select cl.chave,
           coalesce((select sum(vi.valor_curva) from public.com_vendas_itens vi
                      where vi.tenant_id = v_tenant and vi.cliente_codigo = cl.codigo
                        and vi.classe in ('venda', 'devolucao') and v_corte is not null
                        and vi.emissao >= v_de and vi.emissao < v_ate and vi.emissao <= v_corte), 0)
         + coalesce((select sum(i.valor_venda) from public.com_interacoes i
                      where i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo and i.valor_venda > 0
                        and i.nota_em >= v_de and i.nota_em < v_ate and (v_corte is null or i.nota_em > v_corte)), 0) as mes,
           coalesce((select sum(vi.valor_curva) from public.com_vendas_itens vi
                      where vi.tenant_id = v_tenant and vi.cliente_codigo = cl.codigo
                        and vi.classe in ('venda', 'devolucao') and v_corte is not null
                        and vi.emissao >= v_de_passado and vi.emissao < v_de and vi.emissao <= v_corte), 0)
         + coalesce((select sum(i.valor_venda) from public.com_interacoes i
                      where i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo and i.valor_venda > 0
                        and i.nota_em >= v_de_passado and i.nota_em < v_de and (v_corte is null or i.nota_em > v_corte)), 0) as passado,
           -- Média dos 3 meses completos antes da competência, ÷ 3 com o mês sem compra (dono, 2026-10-15).
           (coalesce((select sum(vi.valor_curva) from public.com_vendas_itens vi
                       where vi.tenant_id = v_tenant and vi.cliente_codigo = cl.codigo
                         and vi.classe in ('venda', 'devolucao') and v_corte is not null
                         and vi.emissao >= (v_de - interval '3 months')::date and vi.emissao < v_de and vi.emissao <= v_corte), 0)
          + coalesce((select sum(i.valor_venda) from public.com_interacoes i
                       where i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo and i.valor_venda > 0
                         and i.nota_em >= (v_de - interval '3 months')::date and i.nota_em < v_de
                         and (v_corte is null or i.nota_em > v_corte)), 0)) as tres,
           -- Faturado do mês pelo lançamento: as notas postas pelas vendedoras.
           coalesce((select sum(i.valor_venda) from public.com_interacoes i
                      where i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo and i.valor_venda > 0
                        and i.nota_em >= v_de and i.nota_em < v_ate), 0) as faturado,
           -- A faturar: o pedido fechado no lançamento do mês que ainda não tem nota.
           coalesce((select sum(p.valor) from public.com_interacoes i
                      join public.ped_checklists ck on ck.interacao_id = i.id
                      join public.ped_pedidos p on p.checklist_id = ck.id and p.tipo = 'Venda'
                      where i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo and i.nota_fiscal is null
                        and i.data >= v_de and i.data < v_ate), 0) as a_faturar
      from clientes cl
  ),
  comprado_grupo as (
    select c.chave, sum(c.mes) as mes, sum(c.passado) as passado, sum(c.faturado) as faturado, sum(c.a_faturar) as a_faturar,
           sum(c.tres) as tres
      from comprado c group by c.chave
  ),
  -- O mês, dos lançamentos de QUALQUER vendedora para os clientes desta carteira.
  mes as (
    select cl.chave, i.*
      from clientes cl
      join public.com_interacoes i on i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo
     where i.data >= v_de and i.data < v_ate
  ),
  mes_grupo as (
    select m.chave, count(*)::int as contatos from mes m group by m.chave
  ),
  -- O último contato do mês, com o status, o prazo e a observação dele (§8.2, colunas Q–U).
  ultimo as (
    select distinct on (m.chave) m.chave, m.data, m.status, m.prazo, m.observacoes
      from mes m
     order by m.chave, m.data desc, m.created_at desc
  )
  select g.chave,
         min(g.nome),
         array_agg(g.codigo order by g.codigo),
         string_agg(distinct g.tabela_preco, ', '),
         string_agg(distinct nullif(concat_ws(' - ', g.estado, g.cidade), ''), '; '),
         case
           when ug.data is null then 'nunca_comprou'
           when v_ref - ug.data <= 120 then 'ativo'
           else 'inativo'
         end,
         ug.data,
         (v_ref - ug.data)::int,
         coalesce(h.faturado, 0),
         coalesce(h.meses, 0),
         case when coalesce(h.meses, 0) > 0 then round(h.faturado / h.meses, 2) end,
         coalesce(h.meses, 0) >= 2,
         coalesce(cg.mes, 0),
         coalesce(mg.contatos, 0),
         ul.data,
         ul.status,
         ul.prazo,
         ul.observacoes,
         coalesce(cg.passado, 0),
         coalesce(cg.faturado, 0),
         coalesce(cg.a_faturar, 0),
         round(coalesce(cg.tres, 0) / 3, 2)
    from clientes g
    left join historico h on h.chave = g.chave
    left join ultima_grupo ug on ug.chave = g.chave
    left join comprado_grupo cg on cg.chave = g.chave
    left join mes_grupo mg on mg.chave = g.chave
    left join ultimo ul on ul.chave = g.chave
   group by g.chave, ug.data, h.faturado, h.meses, cg.mes, cg.passado, cg.faturado, cg.a_faturar, cg.tres, mg.contatos,
            ul.data, ul.status, ul.prazo, ul.observacoes
   order by coalesce(h.faturado, 0) desc, min(g.nome);
end;
$function$;
revoke all on function public.com_acompanhamento_da_carteira(text, date) from public, anon;
grant execute on function public.com_acompanhamento_da_carteira(text, date) to authenticated;

-- ─── 5. Sai o "Informado × Faturado" ─────────────────────────────────────────────────────────────
drop function if exists public.com_lancado_x_faturado(date, date);
update public.access_profiles set permissions = permissions - 'informado_faturado'
 where department = 'comercial' and permissions ? 'informado_faturado';

-- ─── 6. O histórico começa em 2024 ───────────────────────────────────────────────────────────────
delete from public.com_vendas_itens where emissao < date '2024-01-01';
delete from public.com_vendas_competencias where competencia < date '2024-01-01';
