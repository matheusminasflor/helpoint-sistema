-- A CARGA DO HISTÓRICO DO CHECKLIST ANTIGO (LEVA S, parte 6). 2026-09-29.
--
-- Decisão do dono: "trazer tudo na virada — e quando subirmos para produção precisamos importar lá,
-- pois vai recomeçar do zero". O sistema antigo (Supabase `MF_INTERNO`) continua em uso até a
-- produção do Helpoint entrar; na virada, os checklists entram aqui com protocolo, datas, autores,
-- recusas, pagamentos e finalizações originais. Roteiro em `docs/deploy.md` (go-live).
--
-- COMO RODA: pelo editor SQL do Supabase (papel `postgres`), nunca pela tela — a função não é
-- executável por `authenticated` nem `anon`. Recebe:
--   p_tenant     a empresa;
--   p_pessoas    nome ou e-mail do sistema antigo → e-mail da conta no Helpoint
--                ({"Fenício": "comercial@…", "Thais": "contasareceber@…", …});
--   p_checklists a exportação do `MF_INTERNO` (a consulta está no roteiro).
--
-- CADA CHECKLIST ANTIGO VIRA UM LANÇAMENTO + O CHECKLIST, porque aqui o checklist nasce do lançamento
-- (decisão do dono). O lançamento é da vendedora do checklist, Concluído, na data do envio, com o
-- valor dos pedidos tipo Venda — é a venda que aconteceu, e passa a contar no painel daquele mês.
--
-- O QUE FICA DE FORA, E É DITO: vendedora sem conta no Helpoint (a conta precisa existir antes da
-- carga), cliente que não está no cadastro, e o protocolo que já foi carregado — rodar de novo não
-- duplica nada. As regras de trigger valem: a carga passa por elas na ordem em que tudo aconteceu.
create or replace function public.ped_carregar_historico(p_tenant uuid, p_pessoas jsonb, p_checklists jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_ck jsonb;
  v_ped jsonb;
  v_x jsonb;
  v_vendedora uuid;
  v_interacao uuid;
  v_checklist uuid;
  v_pedido uuid;
  v_carregados int := 0;
  v_pulados jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null then
    raise exception 'A carga do histórico roda pelo editor SQL, não pela tela.' using errcode = '42501';
  end if;

  for v_ck in select * from jsonb_array_elements(coalesce(p_checklists, '[]'::jsonb)) loop
    if exists (select 1 from public.ped_checklists c where c.tenant_id = p_tenant and c.protocolo = v_ck ->> 'protocolo') then
      v_pulados := v_pulados || jsonb_build_object('protocolo', v_ck ->> 'protocolo', 'motivo', 'já carregado');
      continue;
    end if;

    -- Pelo NOME da vendedora, não por quem digitou: o TI às vezes enviava pela vendedora, e o
    -- lançamento (e a venda no painel) é de quem vendeu.
    v_vendedora := null;
    select p.id into v_vendedora from public.profiles p
     where p.tenant_id = p_tenant and lower(p.email) = lower(p_pessoas ->> (v_ck ->> 'vendedor'));
    if v_vendedora is null then
      v_pulados := v_pulados || jsonb_build_object('protocolo', v_ck ->> 'protocolo',
        'motivo', 'vendedora sem conta no Helpoint: ' || coalesce(v_ck ->> 'vendedor', '?'));
      continue;
    end if;
    if not exists (select 1 from public.com_clientes c where c.tenant_id = p_tenant and c.codigo = v_ck ->> 'cliente_codigo') then
      v_pulados := v_pulados || jsonb_build_object('protocolo', v_ck ->> 'protocolo',
        'motivo', 'cliente fora do cadastro: ' || (v_ck ->> 'cliente_codigo') || ' ' || coalesce(v_ck ->> 'cliente', ''));
      continue;
    end if;

    insert into public.com_interacoes (tenant_id, vendedor_id, cliente_codigo, data, status, valor_venda, observacoes, fora_da_carteira)
    values (p_tenant, v_vendedora, v_ck ->> 'cliente_codigo',
            ((v_ck ->> 'criado_em')::timestamptz at time zone 'America/Sao_Paulo')::date, 'concluido',
            (select coalesce(sum((p ->> 'valor')::numeric), 0) from jsonb_array_elements(v_ck -> 'pedidos') p where p ->> 'tipo' = 'Venda'),
            'Checklist ' || (v_ck ->> 'protocolo') || ' — do sistema anterior de checklist',
            not exists (select 1 from public.com_carteira_membros m join public.com_clientes c
                          on c.tenant_id = m.tenant_id and c.carteira = m.carteira
                         where m.tenant_id = p_tenant and m.user_id = v_vendedora and c.codigo = v_ck ->> 'cliente_codigo'))
    returning id into v_interacao;

    insert into public.ped_checklists (tenant_id, interacao_id, protocolo, versao, vendedor_id, cliente_codigo, cliente_nome,
                                       tabela_preco, criado_por, criado_em, enviado_em, editado_em, contato, rota, observacao)
    values (p_tenant, v_interacao, v_ck ->> 'protocolo', (v_ck ->> 'versao')::int, v_vendedora, v_ck ->> 'cliente_codigo',
            coalesce(nullif(v_ck ->> 'cliente', ''), (select c.razao_social from public.com_clientes c
                                                       where c.tenant_id = p_tenant and c.codigo = v_ck ->> 'cliente_codigo')),
            v_ck ->> 'tabela_preco',
            (select p.id from public.profiles p where p.tenant_id = p_tenant and lower(p.email) = lower(v_ck ->> 'criado_por_email')),
            (v_ck ->> 'criado_em')::timestamptz, (v_ck ->> 'enviado_em')::timestamptz, (v_ck ->> 'editado_em')::timestamptz,
            v_ck ->> 'contato', nullif(v_ck ->> 'rota', ''), nullif(v_ck ->> 'observacao', ''))
    returning id into v_checklist;

    for v_ped in select * from jsonb_array_elements(v_ck -> 'pedidos') loop
      insert into public.ped_pedidos (tenant_id, checklist_id, ordem, tipo, filial, numero, valor, desconto,
                                      espelho_total, espelho_st, qtd_coloracao, qtd_tonalizante, importado_em)
      values (p_tenant, v_checklist, (v_ped ->> 'ordem')::int, v_ped ->> 'tipo', v_ped ->> 'filial', v_ped ->> 'numero',
              (v_ped ->> 'valor')::numeric, coalesce((v_ped ->> 'desconto')::numeric, 0),
              (v_ped ->> 'espelho_total')::numeric, (v_ped ->> 'espelho_st')::numeric,
              (v_ped ->> 'qtd_coloracao')::int, (v_ped ->> 'qtd_tonalizante')::int, (v_ped ->> 'importado_em')::timestamptz)
      returning id into v_pedido;

      -- Os 14 itens eram colunas; aqui são linhas, ligadas pelo rótulo da semente.
      insert into public.ped_respostas (pedido_id, item_id, tenant_id, resposta, justificativa)
      select v_pedido, i.id, p_tenant, v_ped ->> m.coluna, nullif(v_ped ->> m.justificativa, '')
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
        join public.ped_itens i on i.tenant_id = p_tenant and i.rotulo = m.rotulo
       where v_ped ->> m.coluna is not null;
    end loop;

    -- Na ordem em que aconteceram: as regras de trigger conferem a sequência.
    for v_x in select * from jsonb_array_elements(coalesce(v_ck -> 'retornos', '[]'::jsonb)) loop
      insert into public.ped_decisoes (checklist_id, versao, status, motivos, observacao, snapshot, registrado_por, registrado_em)
      values (v_checklist, (v_x ->> 'versao')::int, v_x ->> 'status',
              coalesce((select array_agg(m) from jsonb_array_elements_text(v_x -> 'motivos') m), '{}'),
              nullif(v_x ->> 'observacao', ''), jsonb_build_object('origem', 'sistema anterior de checklist'),
              (select p.id from public.profiles p where p.tenant_id = p_tenant and lower(p.email) = lower(p_pessoas ->> (v_x ->> 'atendente'))),
              (v_x ->> 'registrado_em')::timestamptz);
    end loop;
    for v_x in select * from jsonb_array_elements(coalesce(v_ck -> 'pagamentos', '[]'::jsonb)) loop
      insert into public.ped_pagamentos (checklist_id, status, data_pagamento, observacao, registrado_por, registrado_em)
      values (v_checklist, v_x ->> 'status', (v_x ->> 'data_pagamento')::date, nullif(v_x ->> 'observacao', ''),
              (select p.id from public.profiles p where p.tenant_id = p_tenant and lower(p.email) = lower(p_pessoas ->> (v_x ->> 'atendente'))),
              (v_x ->> 'registrado_em')::timestamptz);
    end loop;
    if jsonb_typeof(v_ck -> 'finalizacao') = 'object' then
      insert into public.ped_finalizacoes (checklist_id, observacao, registrado_por, registrado_em)
      values (v_checklist, nullif(v_ck -> 'finalizacao' ->> 'observacao', ''),
              (select p.id from public.profiles p where p.tenant_id = p_tenant
                  and lower(p.email) = lower(p_pessoas ->> (v_ck -> 'finalizacao' ->> 'atendente'))),
              (v_ck -> 'finalizacao' ->> 'registrado_em')::timestamptz);
    end if;

    v_carregados := v_carregados + 1;
  end loop;

  return jsonb_build_object('carregados', v_carregados, 'pulados', v_pulados);
end;
$$;

revoke all on function public.ped_carregar_historico(uuid, jsonb, jsonb) from public, anon, authenticated;
