-- A CARGA DO HISTÓRICO DO CHECKLIST ANTIGO, PELA TELA (migrations 20261118030000 e 20261118040000).
-- O dono, logado, liga cada nome do sistema antigo a um usuário e importa. Três checklists no formato
-- da exportação do `MF_INTERNO`: um que entra inteiro (recusado, corrigido, aprovado, pago e
-- finalizado), um de vendedora sem usuário escolhido e um de cliente fora do cadastro.
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-ped-carga', 'Carga Checklist', false) as a;
create temporary table u on commit drop as
select tests.create_user('dono@carga.test', (select a from f)) as dono,
       tests.create_user('vendas4@carga.test', (select a from f)) as julia,
       tests.create_user('contasareceber@carga.test', (select a from f)) as thais;
select tests.grant_role((select dono from u), 'admin');
insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, origem)
values ((select a from f), '1203', 'ODIEL MOTA SOUSA', 'MG', 'cadastro');
grant select on f, u to authenticated;

create temporary table exportacao on commit drop as
select jsonb_build_object('Julia', (select julia from u), 'Thais', (select thais from u)) as pessoas,
$json${"colorimetria": [{"codigo": "10", "descricao": "COR 7.0", "categoria": "Coloração"},
                        {"codigo": "11", "descricao": "TON", "categoria": "Tonalizante"}],
 "checklists": [
  {"protocolo": "CK-2026-00007", "criado_em": "2026-09-17T13:00:00Z", "enviado_em": "2026-09-18T12:00:00Z",
   "editado_em": "2026-09-18T12:00:00Z", "versao": 2, "criado_por_email": "suporte2@carga.test",
   "cliente_codigo": "1203", "cliente": "ODIEL MOTA SOUSA", "tabela_preco": "ATACADISTA", "vendedor": "Julia",
   "contato": "Odiel", "rota": "", "observacao": "",
   "pedidos": [{"ordem": 1, "tipo": "Venda", "filial": "MF", "numero": "900", "valor": 100, "desconto": null,
     "item_codigo_cliente": "Sim", "item_tipo_venda": "Sim", "item_orcamento_venda": "Sim", "item_tabela_preco": "Sim",
     "item_natureza_operacao": "Sim", "item_serie": "Sim", "item_forma_pagamento": "Sim", "item_transportadora": "Sim",
     "item_cobranca_duplicada": "Sim", "item_reserva": "Sim", "item_st": "Não se aplica",
     "item_bonificacao": "Não se aplica", "item_cashback": "Não se aplica", "item_publicidade": "Não se aplica",
     "justificativa_bonificacao": ""}],
   "retornos": [{"versao": 1, "status": "Recusado", "motivos": ["Série"], "observacao": "", "atendente": "Thais",
                 "registrado_em": "2026-09-17T15:00:00Z"},
                {"versao": 2, "status": "Aprovado", "motivos": [], "observacao": "", "atendente": "Thais",
                 "registrado_em": "2026-09-18T14:00:00Z"}],
   "pagamentos": [{"status": "Pago", "data_pagamento": "2026-09-20", "observacao": "", "atendente": "Thais",
                   "registrado_em": "2026-09-20T10:00:00Z"}],
   "finalizacao": {"observacao": "", "atendente": "Thais", "registrado_em": "2026-09-21T10:00:00Z"}},
  {"protocolo": "CK-2026-00008", "criado_em": "2026-09-19T13:00:00Z", "enviado_em": "2026-09-19T13:00:00Z",
   "versao": 1, "cliente_codigo": "1203", "vendedor": "Fenício", "contato": "X", "pedidos": []},
  {"protocolo": "CK-2026-00009", "criado_em": "2026-09-19T13:00:00Z", "enviado_em": "2026-09-19T13:00:00Z",
   "versao": 1, "cliente_codigo": "9999", "cliente": "SEM CADASTRO", "vendedor": "Julia", "contato": "X", "pedidos": []}
 ]}$json$::jsonb as dados;
grant select on exportacao to authenticated;
create temporary table r (etapa text, j jsonb) on commit drop;
grant select, insert on r to authenticated;

-- Quem não é dono nem admin não importa.
select tests.authenticate_as('vendas4@carga.test');
select throws_ok($$ select public.ped_carregar_historico((select pessoas from exportacao), (select dados from exportacao), false) $$,
  '42501', null, 'so o dono ou um admin importa o historico');
select tests.clear_authentication();

select tests.authenticate_as('dono@carga.test');
insert into r select 'previa', public.ped_carregar_historico(pessoas, dados, false) from exportacao;
select tests.clear_authentication();

select is((select count(*)::int from public.ped_checklists where tenant_id = (select a from f)), 0, 'a previa nao grava nada');
select is(
  (select jsonb_build_object('carregaveis', j -> 'carregaveis', 'colorimetria', j -> 'colorimetria',
                             'pulados', (select jsonb_agg(p ->> 'motivo' order by p ->> 'protocolo') from jsonb_array_elements(j -> 'pulados') p))
     from r where etapa = 'previa'),
  '{"carregaveis": 1, "colorimetria": 2, "pulados": ["vendedora sem usuário escolhido: Fenício", "cliente fora do cadastro: 9999 SEM CADASTRO"]}'::jsonb,
  'a previa diz o que entra e, com o motivo, o que fica de fora');

select tests.authenticate_as('dono@carga.test');
insert into r select 'carga', public.ped_carregar_historico(pessoas, dados, true) from exportacao;
select tests.clear_authentication();

select is(
  (select protocolo || '|' || situacao || '|' || recusas || '|' || pagamento_status
     from public.ped_checklists_situacao where tenant_id = (select a from f)),
  'CK-2026-00007|Finalizado|1|Pago', 'o checklist entra com o protocolo, a recusa, o pagamento e a finalizacao originais');
select is(
  (select vendedor_id::text || '|' || status || '|' || valor_venda || '|' || data
     from public.com_interacoes where tenant_id = (select a from f)),
  (select julia::text from u) || '|concluido|100.00|2026-09-17',
  'vira um lancamento concluido da vendedora escolhida, na data do envio, com o valor dos pedidos tipo Venda');
select is((select count(*)::int from public.ped_respostas r join public.ped_pedidos p on p.id = r.pedido_id
            where p.tenant_id = (select a from f)), 14, 'os 14 itens de coluna viram 14 respostas');
-- A prova do carimbo: o dono estava logado, e a recusa continua sendo da Thais, em 17/09.
select is(
  (select registrado_por::text || '|' || registrado_em from public.ped_decisoes
    where status = 'Recusado' and tenant_id = (select a from f)),
  (select thais::text from u) || '|' || '2026-09-17 15:00:00+00'::timestamptz,
  'com o dono logado, a recusa guarda quem decidiu e quando no sistema antigo');
select is((select count(*)::int from public.ped_colorimetria where tenant_id = (select a from f)), 2,
  'o catalogo de colorimetria vem junto');

select tests.authenticate_as('dono@carga.test');
insert into r select 'de novo', public.ped_carregar_historico(pessoas, dados, true) from exportacao;
select tests.clear_authentication();
select is((select (j ->> 'carregaveis')::int || '|' || (j -> 'pulados' -> 0 ->> 'motivo') from r where etapa = 'de novo'),
  '0|já carregado', 'rodar de novo nao duplica nada');

select * from finish();
rollback;
