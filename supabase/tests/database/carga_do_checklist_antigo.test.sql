-- A CARGA DO HISTÓRICO DO CHECKLIST ANTIGO (migration 20261118030000) — o que roda na virada.
-- Três checklists no formato da exportação do `MF_INTERNO`: um que entra inteiro (recusado,
-- corrigido, aprovado, pago e finalizado), um de vendedora sem conta e um de cliente fora do cadastro.
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-ped-carga', 'Carga Checklist', false) as a;
create temporary table u on commit drop as
select tests.create_user('vendas4@carga.test', (select a from f)) as julia,
       tests.create_user('contasareceber@carga.test', (select a from f)) as thais;
insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, origem)
values ((select a from f), '1203', 'ODIEL MOTA SOUSA', 'MG', 'cadastro');

create temporary table exportacao on commit drop as
select '{"Julia": "vendas4@carga.test", "Thais": "contasareceber@carga.test"}'::jsonb as pessoas,
$json$[
  {"protocolo": "CK-2026-00007", "criado_em": "2026-09-17T13:00:00Z", "enviado_em": "2026-09-18T12:00:00Z",
   "editado_em": "2026-09-18T12:00:00Z", "versao": 2, "criado_por_email": "suporte2@carga.test",
   "cliente_codigo": "1203", "cliente": "ODIEL MOTA SOUSA", "tabela_preco": "ATACADISTA", "vendedor": "Julia",
   "contato": "Odiel", "rota": null, "observacao": null,
   "pedidos": [{"ordem": 1, "tipo": "Venda", "filial": "MF", "numero": "900", "valor": 100, "desconto": 0,
     "item_codigo_cliente": "Sim", "item_tipo_venda": "Sim", "item_orcamento_venda": "Sim", "item_tabela_preco": "Sim",
     "item_natureza_operacao": "Sim", "item_serie": "Sim", "item_forma_pagamento": "Sim", "item_transportadora": "Sim",
     "item_cobranca_duplicada": "Sim", "item_reserva": "Sim", "item_st": "Não se aplica",
     "item_bonificacao": "Não se aplica", "item_cashback": "Não se aplica", "item_publicidade": "Não se aplica"}],
   "retornos": [{"versao": 1, "status": "Recusado", "motivos": ["Série"], "observacao": null, "atendente": "Thais",
                 "registrado_em": "2026-09-17T15:00:00Z"},
                {"versao": 2, "status": "Aprovado", "motivos": [], "observacao": null, "atendente": "Thais",
                 "registrado_em": "2026-09-18T14:00:00Z"}],
   "pagamentos": [{"status": "Pago", "data_pagamento": "2026-09-20", "observacao": null, "atendente": "Thais",
                   "registrado_em": "2026-09-20T10:00:00Z"}],
   "finalizacao": {"observacao": null, "atendente": "Thais", "registrado_em": "2026-09-21T10:00:00Z"}},
  {"protocolo": "CK-2026-00008", "criado_em": "2026-09-19T13:00:00Z", "enviado_em": "2026-09-19T13:00:00Z",
   "versao": 1, "cliente_codigo": "1203", "vendedor": "Fulana", "contato": "X", "pedidos": []},
  {"protocolo": "CK-2026-00009", "criado_em": "2026-09-19T13:00:00Z", "enviado_em": "2026-09-19T13:00:00Z",
   "versao": 1, "cliente_codigo": "9999", "cliente": "SEM CADASTRO", "vendedor": "Julia", "contato": "X", "pedidos": []}
]$json$::jsonb as checklists;

create temporary table r on commit drop as
select public.ped_carregar_historico((select a from f), pessoas, checklists) as j from exportacao;

select is(
  (select jsonb_build_object('carregados', j -> 'carregados',
                             'pulados', (select jsonb_agg(p ->> 'motivo' order by p ->> 'protocolo') from jsonb_array_elements(j -> 'pulados') p))
     from r),
  '{"carregados": 1, "pulados": ["vendedora sem conta no Helpoint: Fulana", "cliente fora do cadastro: 9999 SEM CADASTRO"]}'::jsonb,
  'carrega o que da e diz, com o motivo, o que ficou de fora');

select is(
  (select protocolo || '|' || situacao || '|' || recusas || '|' || pagamento_status
     from public.ped_checklists_situacao where tenant_id = (select a from f)),
  'CK-2026-00007|Finalizado|1|Pago', 'o checklist entra com o protocolo, a recusa, o pagamento e a finalizacao originais');

select is(
  (select vendedor_id::text || '|' || status || '|' || valor_venda || '|' || data
     from public.com_interacoes where tenant_id = (select a from f)),
  (select julia::text from u) || '|concluido|100.00|2026-09-17',
  'vira um lancamento concluido da vendedora, na data do envio, com o valor dos pedidos tipo Venda');

select is((select count(*)::int from public.ped_respostas r join public.ped_pedidos p on p.id = r.pedido_id
            where p.tenant_id = (select a from f)), 14, 'os 14 itens de coluna viram 14 respostas');

select is(
  (select registrado_por::text || '|' || registrado_em from public.ped_decisoes
    where status = 'Recusado' and tenant_id = (select a from f)),
  (select thais::text from u) || '|' || '2026-09-17 15:00:00+00'::timestamptz,
  'a recusa guarda quem decidiu e quando, do sistema antigo');

create temporary table r2 on commit drop as
select public.ped_carregar_historico((select a from f), pessoas, checklists) as j from exportacao;
select is((select (j ->> 'carregados')::int || '|' || (j -> 'pulados' -> 0 ->> 'motivo') from r2),
  '0|já carregado', 'rodar de novo nao duplica nada');

select ok(not has_function_privilege('authenticated', 'public.ped_carregar_historico(uuid, jsonb, jsonb)', 'execute'),
  'a carga nao e alcancavel pela tela');

select * from finish();
rollback;
