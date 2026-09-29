-- LEVA S, partes 4 e 6 — o catálogo de colorimetria do espelho, e a carga do histórico PELA TELA.
-- 2026-09-29.
--
-- 1. CATÁLOGO DE COLORIMETRIA. O leitor do espelho conta quantas unidades de coloração e de
--    tonalizante o pedido tem (manual §9.6). O sistema antigo tinha a tabela `produtos` com 82
--    itens (grupos COLORACAO e COLORFIX → Coloração; TONALIZANTES → Tonalizante — §10.7). Ela vem
--    junto na carga do histórico.
--
-- 2. A CARGA PELA TELA. O dono, depois da versão por SQL: "vamos cadastrar os usuários, e importar
--    que no sistema eu consiga atrelar a função de cada um". Então a carga deixa de ser do editor
--    SQL: a tela lê o arquivo exportado do sistema antigo, mostra cada nome (vendedoras e quem
--    decidiu no Financeiro) e o dono liga cada um a um usuário do Helpoint. Só dono/admin.
--
-- O CARIMBO NA CARGA. Os triggers carimbam quem está logado e a hora de agora (dívida 1 do manual).
-- Na carga, a pessoa logada é o dono — e a história diz outra coisa: quem recusou foi a Thais, em
-- 25/09. A função liga `ped.carga_historica` só dentro da própria transação (`set_config(..., true)`),
-- e os triggers respeitam o autor e a data que vêm do arquivo. Ninguém liga isso de fora: o
-- PostgREST não expõe `set_config`, e a flag morre no fim da transação.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Colorimetria
-- ─────────────────────────────────────────────────────────────────────────────
create table public.ped_colorimetria (
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  codigo text not null,
  descricao text,
  categoria text not null check (categoria in ('Coloração', 'Tonalizante')),
  primary key (tenant_id, codigo)
);
alter table public.ped_colorimetria enable row level security;
create policy ped_colorimetria_select on public.ped_colorimetria for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.has_comercial_access(auth.uid())) or (select public.has_fin_access(auth.uid()))
              or (select public.ped_ve_todos())));
create policy ped_colorimetria_escrita on public.ped_colorimetria for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_alterar_aba('financeiro', 'conferencia')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_alterar_aba('financeiro', 'conferencia')));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Os triggers respeitam a história durante a carga
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.ped_em_carga()
returns boolean language sql stable set search_path = public as $$
  select coalesce(current_setting('ped.carga_historica', true), '') = 'on';
$$;

create or replace function public.ped_carimbar()
returns trigger language plpgsql set search_path = public as $$
begin
  new.tenant_id := (select c.tenant_id from public.ped_checklists c where c.id = new.checklist_id);
  if not public.ped_em_carga() and auth.uid() is not null then
    new.registrado_por := auth.uid();
    new.registrado_em := now();
  end if;
  return new;
end;
$$;

create or replace function public.ped_decisoes_antes_inserir()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.ped_finalizacoes f where f.checklist_id = new.checklist_id) then
    raise exception 'Este checklist já foi finalizado.' using errcode = 'P0001';
  end if;
  case public.ped_decisao_vigente(new.checklist_id)
    when 'Recusado' then raise exception 'Este checklist já foi recusado. O Comercial precisa corrigir e reenviar.' using errcode = 'P0001';
    when 'Aprovado' then raise exception 'Este checklist já foi aprovado.' using errcode = 'P0001';
    else null;
  end case;
  if not public.ped_em_carga() then
    new.versao := (select c.versao from public.ped_checklists c where c.id = new.checklist_id);
  end if;
  new.snapshot := coalesce(new.snapshot, (
    select jsonb_agg(jsonb_build_object(
             'ordem', p.ordem, 'tipo', p.tipo, 'filial', p.filial, 'numero', p.numero,
             'valor', p.valor, 'desconto', p.desconto,
             'respostas', (select jsonb_object_agg(i.rotulo, r.resposta)
                             from public.ped_respostas r join public.ped_itens i on i.id = r.item_id
                            where r.pedido_id = p.id))
           order by p.ordem)
      from public.ped_pedidos p where p.checklist_id = new.checklist_id));
  return new;
end;
$$;

create or replace function public.ped_pagamentos_antes_inserir()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public.ped_em_carga() and coalesce(public.ped_decisao_vigente(new.checklist_id), '') <> 'Aprovado' then
    raise exception 'Só dá para registrar pagamento de checklist aprovado.' using errcode = 'P0001';
  end if;
  if public.ped_ultimo_pagamento(new.checklist_id) = 'Pago' then
    raise exception 'Este pedido já está pago; o pagamento não volta atrás.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A carga, pela tela: prévia e gravação pela mesma conta
-- ─────────────────────────────────────────────────────────────────────────────
-- p_pessoas: nome do sistema antigo → id do usuário no Helpoint ({"Julia": "<uuid>", …}).
-- p_dados:   {checklists: [...], colorimetria: [{codigo, descricao, categoria}]} — a exportação.
drop function public.ped_carregar_historico(uuid, jsonb, jsonb);

create function public.ped_carregar_historico(p_pessoas jsonb, p_dados jsonb, p_confirmar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_pessoas jsonb := '{}'::jsonb;
  v_ck jsonb;
  v_ped jsonb;
  v_x jsonb;
  v_vendedora uuid;
  v_interacao uuid;
  v_checklist uuid;
  v_pedido uuid;
  v_carregaveis int := 0;
  v_pulados jsonb := '[]'::jsonb;
  v_cores int := 0;
begin
  if v_tenant is null or not public.is_admin_or_higher(auth.uid()) then
    raise exception 'Só o dono ou um administrador importa o histórico do checklist.' using errcode = '42501';
  end if;

  -- Só vale quem é desta empresa: um id de fora vira "sem usuário".
  select coalesce(jsonb_object_agg(e.key, p.id), '{}'::jsonb) into v_pessoas
    from jsonb_each_text(coalesce(p_pessoas, '{}'::jsonb)) e
    join public.profiles p on p.id::text = e.value and p.tenant_id = v_tenant;

  if p_confirmar then
    perform set_config('ped.carga_historica', 'on', true);
    insert into public.ped_colorimetria (tenant_id, codigo, descricao, categoria)
    select v_tenant, c ->> 'codigo', c ->> 'descricao', c ->> 'categoria'
      from jsonb_array_elements(coalesce(p_dados -> 'colorimetria', '[]'::jsonb)) c
     where c ->> 'categoria' in ('Coloração', 'Tonalizante')
    on conflict (tenant_id, codigo) do update set descricao = excluded.descricao, categoria = excluded.categoria;
  end if;
  select count(*) into v_cores from jsonb_array_elements(coalesce(p_dados -> 'colorimetria', '[]'::jsonb)) c
   where c ->> 'categoria' in ('Coloração', 'Tonalizante');

  for v_ck in select * from jsonb_array_elements(coalesce(p_dados -> 'checklists', '[]'::jsonb)) loop
    if exists (select 1 from public.ped_checklists c where c.tenant_id = v_tenant and c.protocolo = v_ck ->> 'protocolo') then
      v_pulados := v_pulados || jsonb_build_object('protocolo', v_ck ->> 'protocolo', 'motivo', 'já carregado');
      continue;
    end if;
    -- Pelo NOME da vendedora, não por quem digitou: às vezes o TI enviava pela vendedora, e o
    -- lançamento (e a venda no painel) é de quem vendeu.
    v_vendedora := (v_pessoas ->> (v_ck ->> 'vendedor'))::uuid;
    if v_vendedora is null then
      v_pulados := v_pulados || jsonb_build_object('protocolo', v_ck ->> 'protocolo',
        'motivo', 'vendedora sem usuário escolhido: ' || coalesce(v_ck ->> 'vendedor', '?'));
      continue;
    end if;
    if not exists (select 1 from public.com_clientes c where c.tenant_id = v_tenant and c.codigo = v_ck ->> 'cliente_codigo') then
      v_pulados := v_pulados || jsonb_build_object('protocolo', v_ck ->> 'protocolo',
        'motivo', 'cliente fora do cadastro: ' || (v_ck ->> 'cliente_codigo') || ' ' || coalesce(v_ck ->> 'cliente', ''));
      continue;
    end if;

    v_carregaveis := v_carregaveis + 1;
    if not p_confirmar then continue; end if;

    insert into public.com_interacoes (tenant_id, vendedor_id, cliente_codigo, data, status, valor_venda, observacoes, fora_da_carteira)
    values (v_tenant, v_vendedora, v_ck ->> 'cliente_codigo',
            ((v_ck ->> 'criado_em')::timestamptz at time zone 'America/Sao_Paulo')::date, 'concluido',
            (select coalesce(sum((p ->> 'valor')::numeric), 0) from jsonb_array_elements(v_ck -> 'pedidos') p where p ->> 'tipo' = 'Venda'),
            'Checklist ' || (v_ck ->> 'protocolo') || ' — do sistema anterior de checklist',
            not exists (select 1 from public.com_carteira_membros m join public.com_clientes c
                          on c.tenant_id = m.tenant_id and c.carteira = m.carteira
                         where m.tenant_id = v_tenant and m.user_id = v_vendedora and c.codigo = v_ck ->> 'cliente_codigo'))
    returning id into v_interacao;

    insert into public.ped_checklists (tenant_id, interacao_id, protocolo, versao, vendedor_id, cliente_codigo, cliente_nome,
                                       tabela_preco, criado_por, criado_em, enviado_em, editado_em, contato, rota, observacao)
    values (v_tenant, v_interacao, v_ck ->> 'protocolo', (v_ck ->> 'versao')::int, v_vendedora, v_ck ->> 'cliente_codigo',
            coalesce(nullif(v_ck ->> 'cliente', ''), (select c.razao_social from public.com_clientes c
                                                       where c.tenant_id = v_tenant and c.codigo = v_ck ->> 'cliente_codigo')),
            v_ck ->> 'tabela_preco',
            (select p.id from public.profiles p where p.tenant_id = v_tenant and lower(p.email) = lower(v_ck ->> 'criado_por_email')),
            (v_ck ->> 'criado_em')::timestamptz, (v_ck ->> 'enviado_em')::timestamptz, (v_ck ->> 'editado_em')::timestamptz,
            v_ck ->> 'contato', nullif(v_ck ->> 'rota', ''), nullif(v_ck ->> 'observacao', ''))
    returning id into v_checklist;

    for v_ped in select * from jsonb_array_elements(v_ck -> 'pedidos') loop
      insert into public.ped_pedidos (tenant_id, checklist_id, ordem, tipo, filial, numero, valor, desconto,
                                      espelho_total, espelho_st, qtd_coloracao, qtd_tonalizante, importado_em)
      values (v_tenant, v_checklist, (v_ped ->> 'ordem')::int, v_ped ->> 'tipo', v_ped ->> 'filial', v_ped ->> 'numero',
              (v_ped ->> 'valor')::numeric, coalesce((v_ped ->> 'desconto')::numeric, 0),
              (v_ped ->> 'espelho_total')::numeric, (v_ped ->> 'espelho_st')::numeric,
              (v_ped ->> 'qtd_coloracao')::int, (v_ped ->> 'qtd_tonalizante')::int, (v_ped ->> 'importado_em')::timestamptz)
      returning id into v_pedido;

      -- Os 14 itens eram colunas; aqui são linhas, ligadas pelo rótulo da semente.
      insert into public.ped_respostas (pedido_id, item_id, tenant_id, resposta, justificativa)
      select v_pedido, i.id, v_tenant, v_ped ->> m.coluna, nullif(v_ped ->> m.justificativa, '')
        from (values
          ('item_codigo_cliente', 'Código do cliente', null),
          ('item_tipo_venda', 'Tipo de venda', null),
          ('item_orcamento_venda', 'Orçamento convertido em Venda', null),
          ('item_tabela_preco', 'Tabela de preço', null),
          ('item_natureza_operacao', 'Natureza da operação', null),
          ('item_serie', 'Série', null),
          ('item_forma_pagamento', 'Forma e condição de pagamento', null),
          ('item_transportadora', 'Transportadora', null),
          ('item_cobranca_duplicada', 'Cliente Condição', null),
          ('item_reserva', 'Reserva ativada', null),
          ('item_st', 'Atualizar ST', null),
          ('item_bonificacao', 'Justificar bonificação', 'justificativa_bonificacao'),
          ('item_cashback', 'Justificar cashback', 'justificativa_cashback'),
          ('item_publicidade', 'Justificar publicidade', 'justificativa_publicidade')
        ) as m(coluna, rotulo, justificativa)
        join public.ped_itens i on i.tenant_id = v_tenant and i.rotulo = m.rotulo
       where v_ped ->> m.coluna is not null;
    end loop;

    -- Na ordem em que aconteceram: as regras de trigger conferem a sequência.
    for v_x in select * from jsonb_array_elements(coalesce(v_ck -> 'retornos', '[]'::jsonb)) loop
      insert into public.ped_decisoes (checklist_id, versao, status, motivos, observacao, snapshot, registrado_por, registrado_em)
      values (v_checklist, (v_x ->> 'versao')::int, v_x ->> 'status',
              coalesce((select array_agg(m) from jsonb_array_elements_text(v_x -> 'motivos') m), '{}'),
              nullif(v_x ->> 'observacao', ''), jsonb_build_object('origem', 'sistema anterior de checklist'),
              (v_pessoas ->> (v_x ->> 'atendente'))::uuid, (v_x ->> 'registrado_em')::timestamptz);
    end loop;
    for v_x in select * from jsonb_array_elements(coalesce(v_ck -> 'pagamentos', '[]'::jsonb)) loop
      insert into public.ped_pagamentos (checklist_id, status, data_pagamento, observacao, registrado_por, registrado_em)
      values (v_checklist, v_x ->> 'status', (v_x ->> 'data_pagamento')::date, nullif(v_x ->> 'observacao', ''),
              (v_pessoas ->> (v_x ->> 'atendente'))::uuid, (v_x ->> 'registrado_em')::timestamptz);
    end loop;
    if jsonb_typeof(v_ck -> 'finalizacao') = 'object' then
      insert into public.ped_finalizacoes (checklist_id, observacao, registrado_por, registrado_em)
      values (v_checklist, nullif(v_ck -> 'finalizacao' ->> 'observacao', ''),
              (v_pessoas ->> (v_ck -> 'finalizacao' ->> 'atendente'))::uuid,
              (v_ck -> 'finalizacao' ->> 'registrado_em')::timestamptz);
    end if;
  end loop;

  if p_confirmar then
    perform set_config('ped.carga_historica', 'off', true);
  end if;

  return jsonb_build_object('confirmado', p_confirmar, 'carregaveis', v_carregaveis, 'pulados', v_pulados,
                            'colorimetria', v_cores);
end;
$$;

-- `drop` + `create` reabre a função para anon (lição 14).
revoke all on function public.ped_carregar_historico(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.ped_carregar_historico(jsonb, jsonb, boolean) to authenticated;
revoke all on function public.ped_em_carga() from public, anon;
grant execute on function public.ped_em_carga() to authenticated;
