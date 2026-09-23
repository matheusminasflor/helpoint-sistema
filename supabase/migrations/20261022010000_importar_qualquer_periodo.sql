-- Frente 1 — importar qualquer período (Comercial). Ver
-- .scratch/plano-frente1-importar-qualquer-periodo.md. Idempotente: pode ser
-- reaplicada sem erro. Nunca edita as migrations do Comercial já aplicadas
-- (20261014010000 e seguintes) — tudo aqui é `create or replace`/`add column
-- if not exists` por cima delas.
--
-- O problema que isto resolve: `com_importar_vendas` recebia TODOS os itens
-- numa chamada só, como um `jsonb`. Com o histórico que o dono quer carregar
-- (2001–2026, centenas de milhares de linhas), a chamada é grande demais.
-- A importação vira três tempos — início (reserva a competência), lote
-- (grava num balde de espera, quantas vezes for preciso) e fim (só publica
-- se a espera bater exatamente com o esperado) — e `com_importar_vendas`
-- continua existindo como um invólucro fino sobre as três, para as suítes e
-- o caminho pequeno (a tela antiga, os testes) seguirem valendo.
--
-- A propriedade que carrega a leva inteira: item de importação inacabada
-- NUNCA aparece em painel nenhum. Por isso a tabela de espera
-- (`com_vendas_itens_espera`): enquanto a importação não termina, os itens
-- moram lá, fora do alcance das treze funções de leitura — que não mudam
-- nesta migration.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. com_vendas_importacoes ganha o controle de progresso da importação em
-- três tempos. `status` só existe para `tipo = 'vendas'` — clientes/metas
-- continuam nascendo e morrendo `concluida` na mesma chamada, como hoje; o
-- default cobre as duas sem precisar de código novo lá.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.com_vendas_importacoes
  add column if not exists status text not null default 'concluida'
    check (status in ('em_andamento', 'concluida')),
  add column if not exists itens_esperados int,
  add column if not exists total_impresso numeric,
  add column if not exists competencia_de date,
  add column if not exists competencia_ate date;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. com_vendas_itens_espera — o balde de espera. Mesma forma de
-- com_vendas_itens, mais `importacao_id` e mais `cliente_nome`: a tabela
-- publicada NUNCA guardou o nome do cliente (quem chama `com_importar_vendas`
-- sempre leu `item->>'cliente_nome'` direto do payload, para semear
-- `com_clientes` na primeira vez que um código aparece) — e no desenho em
-- três tempos o payload já não existe mais quando `fim` roda, então o nome
-- precisa sobreviver na espera até lá.
--
-- Nenhuma das treze funções de leitura do Comercial toca nesta tabela. É
-- essa ausência que faz a propriedade valer: se alguma delas precisasse
-- mudar para "não contar a espera", o desenho estaria errado.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.com_vendas_itens_espera (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id(),
  importacao_id uuid not null references public.com_vendas_importacoes(id) on delete cascade,
  filial text not null check (filial in ('INBRAS', 'MF')),
  emissao date not null,
  documento text not null,
  serie text not null,
  tipo_documento text,
  cfop text not null check (cfop ~ '^[0-9]{4}$'),
  classe text not null check (classe in ('venda', 'devolucao', 'bonificacao', 'industrializacao', 'outros')),
  cliente_codigo text not null,
  cliente_nome text not null,
  produto_codigo text not null,
  produto_nome text not null,
  quantidade numeric not null,
  valor_nota numeric not null,
  desconto numeric not null default 0,
  vendedor_codigo text,
  vendedor_nome text,
  created_at timestamptz not null default now()
);

create index if not exists com_vendas_itens_espera_importacao_idx
  on public.com_vendas_itens_espera (tenant_id, importacao_id);

alter table public.com_vendas_itens_espera enable row level security;

-- Só quem importa lê/escreve a espera — ninguém navega essa tabela numa
-- tela, então o eixo aqui é sempre `vendas.importar` (ou admin), nunca
-- `has_comercial_access` (que é mais largo e serve as telas de leitura).
drop policy if exists com_vendas_itens_espera_select on public.com_vendas_itens_espera;
create policy com_vendas_itens_espera_select on public.com_vendas_itens_espera for select
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))));

drop policy if exists com_vendas_itens_espera_insert on public.com_vendas_itens_espera;
create policy com_vendas_itens_espera_insert on public.com_vendas_itens_espera for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))));

drop policy if exists com_vendas_itens_espera_delete on public.com_vendas_itens_espera;
create policy com_vendas_itens_espera_delete on public.com_vendas_itens_espera for delete
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))));

-- `fim` precisa de UPDATE para fechar a importação (status, itens_gravados,
-- competencia_de/ate, outros_*); `com_descartar_importacao` e a limpeza
-- automática do início precisam de DELETE. Nenhuma das duas existia — o
-- com_importar_vendas de hoje só faz INSERT, nunca revisita a própria linha.
-- O `using` de UPDATE e o `using` de DELETE travam em `status =
-- 'em_andamento'`: uma importação já concluída não se edita nem se apaga
-- por aqui (a história de uma importação concluída é definitiva).
drop policy if exists com_vendas_importacoes_update on public.com_vendas_importacoes;
create policy com_vendas_importacoes_update on public.com_vendas_importacoes for update
  using (tenant_id = (select public.get_user_tenant_id())
     and status = 'em_andamento'
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))))
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))));

drop policy if exists com_vendas_importacoes_delete on public.com_vendas_importacoes;
create policy com_vendas_importacoes_delete on public.com_vendas_importacoes for delete
  using (tenant_id = (select public.get_user_tenant_id())
     and status = 'em_andamento'
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. com_importar_vendas_inicio — reserva a(s) competência(s) e abre a
-- importação. Recebe o resumo por competência PRONTO (o navegador calcula,
-- como já calculava a prévia antes desta leva) porque os itens de verdade
-- ainda não chegaram — chegam depois, em lotes.
--
-- A ordem importa: a limpeza de importações "em_andamento" abandonadas da
-- mesma filial vem ANTES de tudo, para nunca competir com a checagem de
-- permissão nem com o `substituir` da importação nova. `substituir` apaga
-- dado publicado (com_vendas_itens/com_vendas_competencias); a limpeza de
-- abandonada apaga só reserva e espera de uma importação que nunca publicou
-- nada — são duas coisas diferentes, mesmo que as duas usem DELETE.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_importar_vendas_inicio(
  p_filial text,
  p_file_name text,
  p_linhas_lidas int,
  p_descartes jsonb,
  p_competencias jsonb,
  p_itens_esperados int,
  p_substituir boolean default false,
  p_total_impresso numeric default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_descartes_total int;
  v_competencias date[];
  v_importacao_id uuid;
  v_conflito record;
begin
  if p_filial not in ('INBRAS', 'MF') then
    raise exception 'Filial inválida: %', p_filial;
  end if;
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  -- Substituir apaga dado publicado: confirma a permissão granular ANTES de
  -- qualquer DELETE, e nomeia o motivo — a mesma correção da auditoria da
  -- L6a (20261014020000), preservada aqui.
  if p_substituir and not (
       public.is_admin_or_higher(auth.uid())
       or public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'substituir')
     ) then
    raise exception 'Você não tem permissão para substituir uma competência já importada.';
  end if;

  select coalesce(sum((value)::int), 0) into v_descartes_total from jsonb_each_text(p_descartes);

  -- A conferência do arquivo (§4.3): linhas lidas = itens esperados +
  -- descartes. Continua sendo o primeiro portão, só que agora sobre o
  -- TOTAL do arquivo — antes de qualquer lote chegar.
  if p_linhas_lidas <> p_itens_esperados + v_descartes_total then
    raise exception 'Conferência falhou: o arquivo tem % linhas, mas % itens + % descartes somam % — faltam %.',
      p_linhas_lidas, p_itens_esperados, v_descartes_total, p_itens_esperados + v_descartes_total,
      p_linhas_lidas - (p_itens_esperados + v_descartes_total);
  end if;

  if p_itens_esperados <= 0 then
    raise exception 'Nenhum item para importar.';
  end if;

  select array_agg((r->>'competencia')::date) into v_competencias
  from jsonb_array_elements(p_competencias) as r;

  -- Retomada = recomeçar (§4 do plano): qualquer importação "em_andamento"
  -- abandonada desta filial é apagada por inteiro antes de abrir a nova —
  -- nunca só marcada, porque a reserva de competência
  -- (com_vendas_competencias) referencia esta linha com `on delete cascade`.
  -- Marcar sem apagar deixaria o mês da importação abandonada travado pelo
  -- índice único para sempre, sem nenhuma linha de venda para explicar por
  -- quê — o oposto do que "recomeçar é barato" promete.
  delete from public.com_vendas_importacoes
  where tenant_id = v_tenant_id and filial = p_filial and tipo = 'vendas' and status = 'em_andamento';

  if p_substituir then
    delete from public.com_vendas_itens
      where tenant_id = v_tenant_id and filial = p_filial and competencia = any(v_competencias);
    delete from public.com_vendas_competencias
      where tenant_id = v_tenant_id and filial = p_filial and competencia = any(v_competencias);

    -- Nada de "substituí" com resto: se a RLS filtrou o DELETE em silêncio
    -- (regra 12 do pgTAP), a competência continua ocupada.
    if exists (select 1 from public.com_vendas_itens
               where tenant_id = v_tenant_id and filial = p_filial
                 and competencia = any(v_competencias)) then
      raise exception 'Não consegui limpar a competência para substituir — verifique sua permissão.';
    end if;
  end if;

  insert into public.com_vendas_importacoes (
    tenant_id, tipo, filial, file_name, linhas_lidas, itens_gravados, descartes,
    outros_linhas, outros_valor, cfops_outros, substituiu,
    status, itens_esperados, total_impresso
  ) values (
    v_tenant_id, 'vendas', p_filial, p_file_name, p_linhas_lidas, 0, p_descartes,
    0, 0, '{}', p_substituir,
    'em_andamento', p_itens_esperados, p_total_impresso
  ) returning id into v_importacao_id;

  -- A reserva de competência: cada mês de cada filial, uma vez só (§4.2 do
  -- plano original). Em unique_violation, nomeia a competência, quando e
  -- por quem — a importação nova falha inteira, nada fica meio-aberto.
  begin
    insert into public.com_vendas_competencias (tenant_id, filial, competencia, importacao_id, linhas, total_venda)
    select v_tenant_id, p_filial, (r->>'competencia')::date, v_importacao_id,
           (r->>'linhas')::int, (r->>'total_venda')::numeric
    from jsonb_array_elements(p_competencias) as r;
  exception when unique_violation then
    select c.competencia, c.created_at, imp.file_name
      into v_conflito
    from public.com_vendas_competencias c
    join public.com_vendas_importacoes imp on imp.id = c.importacao_id
    where c.tenant_id = v_tenant_id and c.filial = p_filial and c.competencia = any(v_competencias)
      and c.importacao_id <> v_importacao_id
    order by c.created_at desc
    limit 1;
    raise exception 'A competência % da filial % já foi importada em % (arquivo "%") — marque "substituir" para refazer.',
      to_char(v_conflito.competencia, 'MM/YYYY'), p_filial, v_conflito.created_at, v_conflito.file_name;
  end;

  return v_importacao_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. com_importar_vendas_lote — grava um lote na espera. A classe gravada é
-- sempre a do CFOP (com_classe_do_cfop), nunca a que o navegador mandou em
-- `item->>'classe'` — a mesma defesa contra payload mentiroso da auditoria
-- da L6a (achado 3), preservada aqui porque a espera é o novo lugar onde a
-- classe nasce.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_importar_vendas_lote(p_importacao_id uuid, p_itens jsonb)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_status text;
  v_filial text;
  v_itens_count int := coalesce(jsonb_array_length(p_itens), 0);
  v_gravadas int;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  select status, filial into v_status, v_filial
  from public.com_vendas_importacoes
  where id = p_importacao_id and tenant_id = v_tenant_id;

  if v_status is null then
    raise exception 'Importação % não encontrada.', p_importacao_id;
  end if;
  -- Recusa lote fora de "em_andamento" e diz por quê (§2.2 do plano) — nunca
  -- um lote perdido gravando em silêncio numa importação já fechada.
  if v_status <> 'em_andamento' then
    raise exception 'Esta importação não está em andamento (status: %) — não é possível gravar mais itens.', v_status;
  end if;
  if v_itens_count = 0 then
    raise exception 'Lote vazio — nada para gravar.';
  end if;

  -- Inserção prova que gravou: conta pelo RETURNING, não assume (regra 2
  -- das cinco, do lado do banco).
  with inseridos as (
    insert into public.com_vendas_itens_espera (
      tenant_id, importacao_id, filial, emissao, documento, serie, tipo_documento,
      cfop, classe, cliente_codigo, cliente_nome, produto_codigo, produto_nome,
      quantidade, valor_nota, desconto, vendedor_codigo, vendedor_nome
    )
    select
      v_tenant_id, p_importacao_id, v_filial,
      (item->>'emissao')::date, item->>'documento', item->>'serie', item->>'tipo_documento',
      item->>'cfop', public.com_classe_do_cfop(item->>'cfop'),
      item->>'cliente_codigo', item->>'cliente_nome', item->>'produto_codigo', item->>'produto_nome',
      (item->>'quantidade')::numeric, (item->>'valor_nota')::numeric,
      coalesce((item->>'desconto')::numeric, 0),
      item->>'vendedor_codigo', item->>'vendedor_nome'
    from jsonb_array_elements(p_itens) as item
    returning 1
  )
  select count(*) into v_gravadas from inseridos;

  if v_gravadas <> v_itens_count then
    raise exception 'Gravei % itens no lote mas recebi %.', v_gravadas, v_itens_count;
  end if;

  return v_gravadas;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. com_importar_vendas_fim — só publica se a espera bater com o esperado.
-- É aqui que mora a propriedade da leva inteira: espera incompleta LEVANTA
-- e não publica nada; a espera continua lá (para inspeção) e com_vendas_itens
-- não ganha nenhuma linha nova desta importação.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_importar_vendas_fim(p_importacao_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_imp public.com_vendas_importacoes%rowtype;
  v_na_espera int;
  v_soma_espera numeric;
  v_gravadas int;
  v_outros_linhas int;
  v_outros_valor numeric;
  v_cfops_outros text[];
  v_competencia_de date;
  v_competencia_ate date;
  v_competencias_resumo jsonb;
  v_resultado jsonb;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  select * into v_imp from public.com_vendas_importacoes
  where id = p_importacao_id and tenant_id = v_tenant_id;

  if not found then
    raise exception 'Importação % não encontrada.', p_importacao_id;
  end if;
  if v_imp.status <> 'em_andamento' then
    raise exception 'Esta importação não está em andamento (status: %) — não há o que concluir.', v_imp.status;
  end if;

  select count(*), coalesce(sum(valor_nota), 0)
    into v_na_espera, v_soma_espera
  from public.com_vendas_itens_espera
  where importacao_id = p_importacao_id;

  -- A propriedade que carrega a leva inteira (§3 do plano): se o navegador
  -- fechou no meio de uma carga de 300 mil linhas, o que já subiu não pode
  -- entrar no faturamento — senão o mês aparece mais leve e ninguém
  -- percebe, a mesma família do erro dos 129 clientes.
  if v_na_espera <> v_imp.itens_esperados then
    raise exception 'A importação tem % item(ns) na espera, mas eram esperados % — nada foi publicado.',
      v_na_espera, v_imp.itens_esperados;
  end if;

  -- A conferência externa (opcional): o relatório do Forteplus imprime o
  -- próprio total, na linha "Totais:" — bate ao centavo nos arquivos reais
  -- do dono (scripts/conferir-vendas-reais.ts). Nula = recorte parcial, sem
  -- essa linha, sem conferência possível.
  if v_imp.total_impresso is not null and abs(v_soma_espera - v_imp.total_impresso) > 0.01 then
    raise exception 'A soma dos itens (%) não bate com o total impresso pelo relatório (%) — nada foi publicado.',
      v_soma_espera, v_imp.total_impresso;
  end if;

  -- Cliente novo (não estava no CSV) entra com origem 'venda' — antes de
  -- mover a espera, porque só ela carrega o nome (com_vendas_itens nunca
  -- guardou cliente_nome; ver o comentário na criação da tabela de espera).
  insert into public.com_clientes (tenant_id, codigo, razao_social, tabela_preco, origem)
  select distinct on (cliente_codigo) tenant_id, cliente_codigo, cliente_nome, null, 'venda'
  from public.com_vendas_itens_espera
  where importacao_id = p_importacao_id
  order by cliente_codigo
  on conflict (tenant_id, codigo) do nothing;

  with movidos as (
    insert into public.com_vendas_itens (
      tenant_id, importacao_id, filial, emissao, documento, serie, tipo_documento,
      cfop, classe, cliente_codigo, produto_codigo, produto_nome,
      quantidade, valor_nota, desconto, vendedor_codigo, vendedor_nome
    )
    select
      tenant_id, importacao_id, filial, emissao, documento, serie, tipo_documento,
      cfop, classe, cliente_codigo, produto_codigo, produto_nome,
      quantidade, valor_nota, desconto, vendedor_codigo, vendedor_nome
    from public.com_vendas_itens_espera
    where importacao_id = p_importacao_id
    returning 1
  )
  select count(*) into v_gravadas from movidos;

  if v_gravadas <> v_imp.itens_esperados then
    raise exception 'Movi % itens da espera mas eram esperados %.', v_gravadas, v_imp.itens_esperados;
  end if;

  -- A reserva de competência (com_vendas_competencias) nasceu do resumo que
  -- o navegador mandou em `inicio`, ANTES de qualquer item chegar. Confere
  -- aqui que o que foi de fato publicado tem, competência por competência,
  -- a MESMA contagem de linhas da reserva — um resumo errado (bug, não
  -- ataque: o mesmo array é lido para as duas coisas no navegador)
  -- destravaria o mês reservado sem os dados baterem, e ninguém veria erro
  -- nenhum na tela.
  if exists (
    select 1
    from (
      select competencia, count(*) as linhas
      from public.com_vendas_itens
      where importacao_id = p_importacao_id
      group by competencia
    ) reais
    full join (
      select competencia, linhas
      from public.com_vendas_competencias
      where importacao_id = p_importacao_id
    ) reservadas using (competencia)
    where reais.linhas is distinct from reservadas.linhas
  ) then
    raise exception 'As competências publicadas não batem com o resumo reservado no início da importação — nada foi publicado.';
  end if;

  delete from public.com_vendas_itens_espera where importacao_id = p_importacao_id;

  -- Nome do produto: a grafia mais frequente na base inteira (não só neste
  -- lote), recalculada a cada importação (§4.4 do plano original) —
  -- preservado tal como em com_importar_vendas.
  insert into public.com_produtos (tenant_id, codigo, nome)
  select v_tenant_id, produto_codigo, mode() within group (order by produto_nome)
  from public.com_vendas_itens
  where tenant_id = v_tenant_id
    and produto_codigo in (
      select distinct produto_codigo from public.com_vendas_itens where importacao_id = p_importacao_id
    )
  group by produto_codigo
  on conflict (tenant_id, codigo) do update set nome = excluded.nome, updated_at = now();

  select count(*), coalesce(sum(valor_nota), 0), coalesce(array_agg(distinct cfop), '{}')
    into v_outros_linhas, v_outros_valor, v_cfops_outros
  from public.com_vendas_itens
  where importacao_id = p_importacao_id and classe = 'outros';

  select min(competencia), max(competencia) into v_competencia_de, v_competencia_ate
  from public.com_vendas_itens where importacao_id = p_importacao_id;

  select jsonb_agg(jsonb_build_object('competencia', competencia, 'linhas', linhas, 'total_venda', total_venda) order by competencia)
    into v_competencias_resumo
  from public.com_vendas_competencias where importacao_id = p_importacao_id;

  update public.com_vendas_importacoes set
    status = 'concluida',
    itens_gravados = v_gravadas,
    outros_linhas = v_outros_linhas,
    outros_valor = v_outros_valor,
    cfops_outros = v_cfops_outros,
    competencia_de = v_competencia_de,
    competencia_ate = v_competencia_ate
  where id = p_importacao_id;

  v_resultado := jsonb_build_object(
    'gravadas', v_gravadas,
    'descartes', v_imp.descartes,
    'competencias', coalesce(v_competencias_resumo, '[]'::jsonb),
    'outros_linhas', v_outros_linhas,
    'outros_valor', v_outros_valor,
    'cfops_outros', to_jsonb(v_cfops_outros),
    'substituiu', v_imp.substituiu
  );
  return v_resultado;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. com_importar_vendas — o caminho de hoje, agora um invólucro fino sobre
-- as três. As suítes existentes e qualquer chamador pequeno continuam
-- funcionando sem mudar uma linha: o resumo de competências que antes era
-- calculado aqui dentro passa a ser calculado aqui e entregue a `inicio`, e
-- o `p_itens` inteiro vira um lote só, entregue a `lote`.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_importar_vendas(
  p_filial text,
  p_file_name text,
  p_linhas_lidas int,
  p_descartes jsonb,
  p_itens jsonb,
  p_substituir boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_itens_esperados int := coalesce(jsonb_array_length(p_itens), 0);
  v_competencias_resumo jsonb;
  v_importacao_id uuid;
  v_gravadas int;
begin
  -- O mesmo resumo por competência que `com_importar_vendas_inicio` passou
  -- a exigir como parâmetro — aqui calculado do jeito que a função original
  -- sempre calculou, a partir do próprio `p_itens`, com a classe do CFOP
  -- (com_classe_do_cfop), nunca a que o payload mentir em `item->>'classe'`.
  select jsonb_agg(jsonb_build_object('competencia', comp, 'linhas', linhas, 'total_venda', total_venda) order by comp)
    into v_competencias_resumo
  from (
    select date_trunc('month', (item->>'emissao')::date)::date as comp,
           count(*) as linhas,
           coalesce(sum((item->>'valor_nota')::numeric) filter (where public.com_classe_do_cfop(item->>'cfop') = 'venda'), 0) as total_venda
    from jsonb_array_elements(p_itens) as item
    group by 1
  ) agregado;

  v_importacao_id := public.com_importar_vendas_inicio(
    p_filial, p_file_name, p_linhas_lidas, p_descartes,
    coalesce(v_competencias_resumo, '[]'::jsonb), v_itens_esperados, p_substituir
  );

  v_gravadas := public.com_importar_vendas_lote(v_importacao_id, p_itens);
  if v_gravadas <> v_itens_esperados then
    raise exception 'Gravei % itens no lote mas o arquivo tinha %.', v_gravadas, v_itens_esperados;
  end if;

  return public.com_importar_vendas_fim(v_importacao_id);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. com_descartar_importacao — cancelamento explícito de uma importação
-- "em_andamento" (§2.3/§4 do plano: o botão de fechar o diálogo no meio da
-- importação avisa que vai descartar, e chama esta função).
--
-- Apaga a LINHA (não só marca `status`): a reserva de competência e a
-- espera referenciam esta importação com `on delete cascade`. Descartar tem
-- que devolver o mês para reimportação — senão "recomeçar é barato" seria
-- falso, e o mês ficaria travado pelo índice único sem nenhuma venda para
-- explicar por quê.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_descartar_importacao(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_status text;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  select status into v_status from public.com_vendas_importacoes
  where id = p_id and tenant_id = v_tenant_id;

  if v_status is null then
    raise exception 'Importação não encontrada.';
  end if;
  if v_status <> 'em_andamento' then
    raise exception 'Esta importação já foi concluída — não é possível descartar.';
  end if;

  delete from public.com_vendas_importacoes where id = p_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. com_periodo_importado — "o sistema tem vendas de X a Y" (§5 do plano,
-- pedido do dono). A verdade sobre o que está PUBLICADO em com_vendas_itens
-- — nunca sobre a última importação, e nunca sobre a espera (que não é
-- lida por nenhuma consulta de painel).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_periodo_importado(p_filial text default null)
returns table (competencia_de date, competencia_ate date, competencias bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select min(competencia), max(competencia), count(distinct competencia)
  from public.com_vendas_itens
  where tenant_id = (select public.get_user_tenant_id())
    and (p_filial is null or filial = p_filial);
$$;
