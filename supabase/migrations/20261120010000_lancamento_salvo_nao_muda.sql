-- Lançamento salvo não muda (decisão do dono, 2026-10-02).
--
-- O dono: "precisamos ter métricas de quantas vezes precisou entrar em contato com o mesmo
-- cliente — lançou, não pode editar os indicadores e farol mais, precisa lançar de novo caso
-- tenha que entrar em contato novamente." Até aqui a vendedora reabria o lançamento da manhã e
-- trocava as marcações à tarde: o contato da manhã sumia da contagem.
--
-- A REGRA, para a vendedora:
--   * indicadores e ações marcados, cliente, data e "fora da carteira" não mudam depois de salvos;
--   * status, valor, prazo e observação só andam até "Concluído" (a tentativa que virou venda) —
--     concluído, trava tudo. Nada disso altera a contagem de contatos nem de ações;
--   * apagar lançamento sai dela (apagar um contato é a edição mais radical);
--   * o checklist trava ao ser enviado ("Em análise") e só destrava se o Financeiro recusar.
-- O gestor do Comercial e o administrador (`com_pode_gerir_carteiras`) corrigem o erro de
-- verdade, e a correção fica em `audit_logs` (quem, quando, o antes e o depois).
--
-- AS TRAVAS SÃO TRIGGERS `security invoker`, e não policy, porque a policy de UPDATE não enxerga
-- o OLD — não dá para dizer "este campo não mudou". E invoker de propósito: `current_user <>
-- 'authenticated'` deixa passar a escrita das funções `security definer` do sistema
-- (`ped_salvar_checklist` grava o valor da venda como soma dos pedidos; a carga do histórico).
-- Numa função definer o current_user viraria o dono e a trava não valeria para ninguém.

-- ─── 1. O lançamento ──────────────────────────────────────────────────────────
create or replace function public.com_interacao_salva_nao_muda()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Sistema (definer, cascata de FK) e quem corrige passam.
  if current_user <> 'authenticated' or pg_trigger_depth() > 1 or auth.uid() is null
     or public.com_pode_gerir_carteiras() then
    return new;
  end if;
  if new.cliente_codigo is distinct from old.cliente_codigo
     or new.data is distinct from old.data
     or new.fora_da_carteira is distinct from old.fora_da_carteira then
    raise exception 'Lançamento salvo não muda de cliente nem de data. Novo contato é um lançamento novo; erro, peça ao gestor.'
      using errcode = '42501';
  end if;
  if old.status = 'concluido'
     and (new.status is distinct from old.status
          or new.valor_venda is distinct from old.valor_venda
          or new.prazo is distinct from old.prazo
          or new.observacoes is distinct from old.observacoes) then
    raise exception 'Lançamento concluído não se altera. Erro, peça ao gestor.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Lição 14: função nova nasce executável por PUBLIC (e `anon` é público).
revoke all on function public.com_interacao_salva_nao_muda() from public, anon;
grant execute on function public.com_interacao_salva_nao_muda() to authenticated;

drop trigger if exists trg_com_interacao_salva_nao_muda on public.com_interacoes;
create trigger trg_com_interacao_salva_nao_muda
  before update on public.com_interacoes
  for each row execute function public.com_interacao_salva_nao_muda();

-- ─── 2. As marcações (indicadores e ações do farol) ───────────────────────────
-- Marcar só no nascimento. `com_salvar_interacao` acende `helpoint.lancamento_novo` com o id do
-- lançamento que acabou de criar, durante o insert das marcas, e apaga logo depois. O PostgREST
-- não alcança `set_config` (só o schema `public` é exposto), então a vendedora não acende sozinha.
create or replace function public.com_marca_salva_nao_muda()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' or pg_trigger_depth() > 1 or auth.uid() is null
     or public.com_pode_gerir_carteiras() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    -- A tela reenvia as marcas que já existem (`on conflict do nothing`); a trigger BEFORE roda
    -- antes do conflito, então "já estava marcado" tem de passar.
    if new.interacao_id::text = coalesce(current_setting('helpoint.lancamento_novo', true), '')
       or exists (select 1 from public.com_interacao_marcas m
                   where m.interacao_id = new.interacao_id and m.indicador_id = new.indicador_id) then
      return new;
    end if;
  end if;
  raise exception 'Indicadores e ações de um lançamento salvo não mudam. Novo contato é um lançamento novo; erro, peça ao gestor.'
    using errcode = '42501';
end;
$$;

revoke all on function public.com_marca_salva_nao_muda() from public, anon;
grant execute on function public.com_marca_salva_nao_muda() to authenticated;

drop trigger if exists trg_com_marca_salva_nao_muda on public.com_interacao_marcas;
create trigger trg_com_marca_salva_nao_muda
  before insert or delete on public.com_interacao_marcas
  for each row execute function public.com_marca_salva_nao_muda();

create or replace function public.com_salvar_interacao(p_id uuid, p_dados jsonb, p_marcas uuid[])
returns uuid
language plpgsql
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_marcas uuid[] := coalesce(p_marcas, array[]::uuid[]);
begin
  if p_id is null then
    insert into public.com_interacoes
      (cliente_codigo, data, status, valor_venda, prazo, observacoes, fora_da_carteira)
    values (
      nullif(btrim(p_dados ->> 'cliente_codigo'), ''),
      (p_dados ->> 'data')::date,
      coalesce(nullif(p_dados ->> 'status', ''), 'em_andamento'),
      nullif(p_dados ->> 'valor_venda', '')::numeric,
      nullif(p_dados ->> 'prazo', '')::date,
      nullif(btrim(p_dados ->> 'observacoes'), ''),
      coalesce((p_dados ->> 'fora_da_carteira')::boolean, false)
    )
    returning id into v_id;
    -- As marcas deste lançamento nascem com ele (ver `com_marca_salva_nao_muda`).
    perform set_config('helpoint.lancamento_novo', v_id::text, true);
  else
    delete from public.com_interacao_marcas
     where interacao_id = p_id and not (indicador_id = any (v_marcas));

    update public.com_interacoes set
      cliente_codigo   = nullif(btrim(p_dados ->> 'cliente_codigo'), ''),
      data             = (p_dados ->> 'data')::date,
      status           = coalesce(nullif(p_dados ->> 'status', ''), 'em_andamento'),
      valor_venda      = nullif(p_dados ->> 'valor_venda', '')::numeric,
      prazo            = nullif(p_dados ->> 'prazo', '')::date,
      observacoes      = nullif(btrim(p_dados ->> 'observacoes'), ''),
      fora_da_carteira = coalesce((p_dados ->> 'fora_da_carteira')::boolean, false)
    where id = p_id
    returning id into v_id;

    -- Lição 12: UPDATE barrado por policy não levanta erro, afeta zero linhas. Sem esta
    -- linha a tela diria "salvo" para o lançamento de outra pessoa, que não mudou.
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
$$;

-- ─── 3. Quem corrige: o gestor do Comercial e o administrador ─────────────────
-- Até aqui só a dona da linha atualizava. O `with check` repete a permissão (lição 15).
drop policy if exists com_interacoes_update_gestor on public.com_interacoes;
create policy com_interacoes_update_gestor on public.com_interacoes
  for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.com_pode_gerir_carteiras()))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.com_pode_gerir_carteiras()));

drop policy if exists com_interacao_marcas_insert_gestor on public.com_interacao_marcas;
create policy com_interacao_marcas_insert_gestor on public.com_interacao_marcas
  for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
              and (select public.com_pode_gerir_carteiras())
              and exists (select 1 from public.com_interacoes i
                           where i.id = com_interacao_marcas.interacao_id and i.tenant_id = com_interacao_marcas.tenant_id));

-- Apagar sai da vendedora.
drop policy if exists com_interacoes_delete on public.com_interacoes;
create policy com_interacoes_delete on public.com_interacoes
  for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.com_pode_gerir_carteiras()));

-- ─── 4. A correção fica registrada ────────────────────────────────────────────
-- Só a mexida de OUTRA pessoa na linha da vendedora: a dela mesma é o trabalho do dia.
drop trigger if exists trg_com_interacoes_auditoria on public.com_interacoes;
create trigger trg_com_interacoes_auditoria
  after update or delete on public.com_interacoes
  for each row when (auth.uid() is distinct from old.vendedor_id)
  execute function public.audit_trigger_fn();

-- A marca não tem `id`; o registro aponta para o lançamento.
create or replace function public.com_marca_auditoria()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_linha public.com_interacao_marcas := coalesce(new, old);
begin
  if auth.uid() is not null and pg_trigger_depth() = 1
     and exists (select 1 from public.com_interacoes i
                  where i.id = v_linha.interacao_id and i.vendedor_id is distinct from auth.uid()) then
    insert into public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_data, new_data)
    values (v_linha.tenant_id, auth.uid(), tg_op, 'com_interacao_marcas', v_linha.interacao_id,
            case when tg_op = 'DELETE' then to_jsonb(old) end,
            case when tg_op = 'INSERT' then to_jsonb(new) end);
  end if;
  return null;
end;
$$;
revoke all on function public.com_marca_auditoria() from public, anon;

drop trigger if exists trg_com_marca_auditoria on public.com_interacao_marcas;
create trigger trg_com_marca_auditoria
  after insert or delete on public.com_interacao_marcas
  for each row execute function public.com_marca_auditoria();

-- ─── 5. O checklist trava ao ser enviado ──────────────────────────────────────
-- "Em análise" = enviado e sem decisão na versão vigente. Só a recusa devolve à vendedora.
create or replace function public.ped_salvar_checklist(p_interacao uuid, p_dados jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_interacao public.com_interacoes%rowtype;
  v_cliente public.com_clientes%rowtype;
  v_checklist public.ped_checklists%rowtype;
  v_pedidos jsonb := coalesce(p_dados -> 'pedidos', '[]'::jsonb);
  v_ped jsonb;
  v_pedido_id uuid;
  v_ordens int[];
  v_falha text;
begin
  select * into v_interacao from public.com_interacoes i where i.id = p_interacao and i.tenant_id = v_tenant;
  if v_interacao.id is null then
    raise exception 'Lançamento não encontrado.' using errcode = 'P0002';
  end if;
  if not (v_interacao.vendedor_id = auth.uid() or public.is_admin_or_higher(auth.uid())) then
    raise exception 'Só quem fez o lançamento envia o checklist dele.' using errcode = '42501';
  end if;
  if v_interacao.cliente_codigo is null then
    raise exception 'O checklist precisa de cliente no lançamento.' using errcode = '22023';
  end if;
  select * into v_cliente from public.com_clientes c
   where c.tenant_id = v_tenant and c.codigo = v_interacao.cliente_codigo;

  select array_agg((p ->> 'ordem')::int order by (p ->> 'ordem')::int) into v_ordens
    from jsonb_array_elements(v_pedidos) p;
  if coalesce(cardinality(v_ordens), 0) not between 1 and 10
     or v_ordens <> (select array_agg(g order by g) from generate_series(1, cardinality(v_ordens)) g) then
    raise exception 'O checklist tem de 1 a 10 pedidos, numerados em sequência.' using errcode = '22023';
  end if;

  select * into v_checklist from public.ped_checklists c where c.interacao_id = p_interacao for update;
  if v_checklist.id is null then
    insert into public.ped_checklists (tenant_id, interacao_id, vendedor_id, cliente_codigo, cliente_nome, tabela_preco,
                                       criado_por, contato, rota, observacao)
    values (v_tenant, p_interacao, v_interacao.vendedor_id, v_cliente.codigo, v_cliente.razao_social, v_cliente.tabela_preco,
            auth.uid(), p_dados ->> 'contato', nullif(btrim(p_dados ->> 'rota'), ''),
            nullif(btrim(p_dados ->> 'observacao'), ''))
    returning * into v_checklist;
  else
    if exists (select 1 from public.ped_finalizacoes f where f.checklist_id = v_checklist.id) then
      raise exception 'Checklist finalizado não pode ser alterado.' using errcode = 'P0001';
    end if;
    if public.ped_decisao_vigente(v_checklist.id) = 'Aprovado' then
      raise exception 'Checklist já aprovado não pode ser alterado.' using errcode = 'P0001';
    end if;
    -- Enviado e ainda sem decisão: está com o Financeiro (decisão do dono, 2026-10-02).
    if public.ped_decisao_vigente(v_checklist.id) is null and not public.is_admin_or_higher(auth.uid()) then
      raise exception 'Checklist em análise no Financeiro: só pode ser alterado se for devolvido.' using errcode = 'P0001';
    end if;
    -- Editar sobe a versão: a decisão anterior deixa de ser vigente e o checklist volta a
    -- "Em análise" sozinho (manual §3.4).
    update public.ped_checklists c
       set versao = c.versao + 1, editado_em = now(), enviado_em = now(),
           cliente_nome = v_cliente.razao_social, tabela_preco = v_cliente.tabela_preco,
           contato = p_dados ->> 'contato', rota = nullif(btrim(p_dados ->> 'rota'), ''),
           observacao = nullif(btrim(p_dados ->> 'observacao'), '')
     where c.id = v_checklist.id;
  end if;

  -- Os pedidos, pela ordem: atualiza o que existe, cria o que falta, tira o que sobrou (dívida 7).
  delete from public.ped_pedidos p where p.checklist_id = v_checklist.id and p.ordem <> all (v_ordens);
  for v_ped in select * from jsonb_array_elements(v_pedidos) loop
    insert into public.ped_pedidos as p (tenant_id, checklist_id, ordem, tipo, filial, numero, valor, desconto,
                                        espelho_total, espelho_st, qtd_coloracao, qtd_tonalizante, importado_em)
    values (v_tenant, v_checklist.id, (v_ped ->> 'ordem')::int, v_ped ->> 'tipo', v_ped ->> 'filial',
            btrim(v_ped ->> 'numero'), (v_ped ->> 'valor')::numeric, coalesce((v_ped ->> 'desconto')::numeric, 0),
            (v_ped -> 'espelho' ->> 'total')::numeric, (v_ped -> 'espelho' ->> 'st')::numeric,
            (v_ped -> 'espelho' ->> 'coloracao')::int, (v_ped -> 'espelho' ->> 'tonalizante')::int,
            case when v_ped ? 'espelho' and jsonb_typeof(v_ped -> 'espelho') = 'object' then now() end)
    on conflict (checklist_id, ordem) do update
       set tipo = excluded.tipo, filial = excluded.filial, numero = excluded.numero, valor = excluded.valor,
           desconto = excluded.desconto, espelho_total = excluded.espelho_total, espelho_st = excluded.espelho_st,
           qtd_coloracao = excluded.qtd_coloracao, qtd_tonalizante = excluded.qtd_tonalizante,
           importado_em = case when excluded.importado_em is null then null else coalesce(p.importado_em, excluded.importado_em) end
    returning p.id into v_pedido_id;

    delete from public.ped_respostas r where r.pedido_id = v_pedido_id;
    insert into public.ped_respostas (pedido_id, item_id, tenant_id, resposta, justificativa)
    select v_pedido_id, (r ->> 'item_id')::uuid, v_tenant, r ->> 'resposta', nullif(btrim(r ->> 'justificativa'), '')
      from jsonb_array_elements(coalesce(v_ped -> 'respostas', '[]'::jsonb)) r
      join public.ped_itens i on i.id = (r ->> 'item_id')::uuid and i.tenant_id = v_tenant;
  end loop;

  -- As validações que o sistema antigo só fazia na tela (dívida 5). A primeira falha é a mensagem.
  select f into v_falha from (
    select format('Pedido %s: falta responder "%s".', p.ordem, i.rotulo) as f, p.ordem, i.ordem as io, 1 as tipo
      from public.ped_pedidos p cross join public.ped_itens i
     where p.checklist_id = v_checklist.id and i.tenant_id = v_tenant and i.ativo
       and not exists (select 1 from public.ped_respostas r where r.pedido_id = p.id and r.item_id = i.id)
    union all
    select format('Pedido %s: "%s" está como Não — corrija no Forteplus antes de enviar.', p.ordem, i.rotulo), p.ordem, i.ordem, 2
      from public.ped_pedidos p join public.ped_respostas r on r.pedido_id = p.id join public.ped_itens i on i.id = r.item_id
     where p.checklist_id = v_checklist.id and r.resposta = 'Não'
    union all
    select format('Pedido %s: "%s" pede justificativa.', p.ordem, i.rotulo), p.ordem, i.ordem, 3
      from public.ped_pedidos p join public.ped_respostas r on r.pedido_id = p.id join public.ped_itens i on i.id = r.item_id
     where p.checklist_id = v_checklist.id and i.pede_justificativa and r.resposta = 'Sim' and r.justificativa is null
    union all
    select case when p.espelho_st > 0
                then format('Pedido %s: o espelho tem ST de R$ %s, e "%s" está como Não se aplica.', p.ordem, p.espelho_st, i.rotulo)
                else format('Pedido %s: o espelho não tem ST, e "%s" está como Sim.', p.ordem, i.rotulo) end,
           p.ordem, i.ordem, 4
      from public.ped_pedidos p join public.ped_respostas r on r.pedido_id = p.id join public.ped_itens i on i.id = r.item_id
     where p.checklist_id = v_checklist.id and i.regra = 'st' and p.importado_em is not null
       and ((coalesce(p.espelho_st, 0) > 0 and r.resposta = 'Não se aplica')
            or (coalesce(p.espelho_st, 0) = 0 and r.resposta = 'Sim'))
  ) x order by x.ordem, x.tipo, x.io limit 1;
  if v_falha is not null then
    raise exception '%', v_falha using errcode = '23514';
  end if;

  -- O valor da venda do lançamento é a soma dos pedidos tipo Venda (decisão do dono): uma digitação só.
  update public.com_interacoes i
     set valor_venda = (select coalesce(sum(p.valor), 0) from public.ped_pedidos p
                         where p.checklist_id = v_checklist.id and p.tipo = 'Venda'),
         updated_at = now()
   where i.id = p_interacao;

  return v_checklist.id;
end;
$function$;
