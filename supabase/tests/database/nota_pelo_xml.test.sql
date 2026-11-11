-- A NOTA ENTRA PELO XML (migration 20270212721100; dono, 2026-11-11).
--   1     a vendedora não sobe a nota
--   2     XML sem o PDF é recusado
--   3     nota não autorizada é recusada
--   4     nota de pedido que não está no checklist é recusada
--   5-8   a venda confere: nº, emissão, faturado = produtos − desconto, pedido achado pelo "Pedido:" do XML
--   9     a vendedora é avisada da nota emitida
--  10     publicidade com CFOP de venda fica divergente, com a mensagem de cancelar
--  11     e trava a finalização
--  12     o Financeiro também é avisado da divergência
--  13     o CNPJ de outro cliente fica divergente
--  14     o valor diferente do pedido só avisa
--  15     a mesma nota não entra em dois pedidos
--  16     publicidade corrigida (6910) confere e o checklist finaliza
--  17     a importação que acha a nota errada avisa uma vez só
--  18-21  Saídas: a vendedora não marca; a Expedição marca, a vendedora é avisada e a lista mostra
begin;
\ir _helpers.psql

select plan(21);

create temporary table f on commit drop as select tests.create_tenant('pgtap-nota-xml', 'Nota XML', false) as a;
create temporary table u on commit drop as
select tests.create_user('vendedora@notaxml.test', (select a from f)) as vendedora,
       tests.create_user('financeiro@notaxml.test', (select a from f)) as financeiro,
       tests.create_user('outrofin@notaxml.test', (select a from f)) as outrofin,
       tests.create_user('expedicao@notaxml.test', (select a from f)) as expedicao;
select tests.grant_module((select vendedora from u), (select a from f), 'comercial');
select tests.grant_module((select financeiro from u), (select a from f), 'financeiro');
select tests.grant_module((select outrofin from u), (select a from f), 'financeiro');
select tests.grant_module((select expedicao from u), (select a from f), 'expedicao');
select tests.grant_profile((select financeiro from u), (select a from f), 'financeiro', 'Operador');
select tests.grant_profile((select outrofin from u), (select a from f), 'financeiro', 'Operador');
select tests.grant_profile((select expedicao from u), (select a from f), 'expedicao', 'Operador');
-- Empresa nascida depois da migration: o que quem configura marcaria.
update public.access_profiles
   set permissions = permissions || '{"conferencia": {"view": true, "decidir": true, "pagamento": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'financeiro' and name = 'Operador';
update public.access_profiles
   set permissions = coalesce(permissions, '{}'::jsonb) || '{"saidas": {"view": true, "edit": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'expedicao' and name = 'Operador';
grant select on f, u to authenticated;

insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, origem, documento)
values ((select a from f), '1615', 'AMIL COSMETICOS LTDA', 'GO', 'cadastro', '55012464000100');

create temporary table ck on commit drop as
with l as (
  insert into public.com_interacoes (tenant_id, vendedor_id, cliente_codigo, data, status)
  select a, (select vendedora from u), '1615', '2026-10-30', 'concluido' from f returning id
), c as (
  insert into public.ped_checklists (tenant_id, interacao_id, protocolo, vendedor_id, cliente_codigo, cliente_nome, contato)
  select (select a from f), l.id, 'CK-XML', (select vendedora from u), '1615', 'AMIL COSMETICOS LTDA', 'Contato' from l returning id
) select id from c;
alter table public.ped_decisoes disable trigger user;
alter table public.ped_pagamentos disable trigger user;
insert into public.ped_decisoes (tenant_id, checklist_id, versao, status) select c.tenant_id, c.id, c.versao, 'Aprovado' from public.ped_checklists c where c.id = (select id from ck);
insert into public.ped_pagamentos (tenant_id, checklist_id, status, data_pagamento) select (select a from f), (select id from ck), 'Pago', '2026-10-30';
alter table public.ped_decisoes enable trigger user;
alter table public.ped_pagamentos enable trigger user;
insert into public.ped_pedidos (tenant_id, checklist_id, ordem, tipo, serie, filial, numero, valor)
values ((select a from f), (select id from ck), 1, 'Venda', '1', 'INBRAS', '11536', 11668.34),
       ((select a from f), (select id from ck), 2, 'Publicidade', '1', 'INBRAS', '11623', 1040.50),
       ((select a from f), (select id from ck), 3, 'Bonificação', '75', 'MF', '11545', 749.96);

-- Uma NF-e no formato que o Forteplus exporta, só com o que o banco lê.
create function tests.nfe(p_numero text, p_cfop text, p_dest text, p_prod numeric, p_desc numeric, p_pedido text,
                          p_status text default '100', p_chave text default null)
returns text language sql as $$
  select '<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe1">'
      || '<ide><natOp>Venda de producao</natOp><serie>1</serie><nNF>' || p_numero || '</nNF><dhEmi>2026-10-30T16:10:18-03:00</dhEmi></ide>'
      || '<emit><CNPJ>07025603000197</CNPJ></emit><dest><CNPJ>' || p_dest || '</CNPJ></dest>'
      || '<det nItem="1"><prod><CFOP>' || p_cfop || '</CFOP><vProd>' || p_prod || '</vProd></prod></det>'
      || '<total><ICMSTot><vST>12.00</vST><vProd>' || p_prod || '</vProd><vDesc>' || p_desc || '</vDesc><vNF>' || (p_prod - p_desc + 12) || '</vNF></ICMSTot></total>'
      || '<transp><transporta><xNome>TG TRANSPORTES</xNome></transporta></transp>'
      || '<infAdic><infCpl>Informacoes ao contribuinte: Pedido: ' || p_pedido || ' Vendedor: Fenicio Rocha</infCpl></infAdic>'
      || '</infNFe></NFe><protNFe versao="4.00"><infProt><chNFe>' || coalesce(p_chave, '3126' || lpad(p_numero, 40, '0'))
      || '</chNFe><cStat>' || p_status || '</cStat></infProt></protNFe></nfeProc>';
$$;
grant execute on all functions in schema tests to authenticated;

-- Os arquivos que a tela sobe antes de chamar o banco.
insert into storage.objects (bucket_id, name)
select 'notas-fiscais', (select a from f)::text || '/' || (select id from ck)::text || '/' || n
  from (values ('a.xml'), ('a.pdf'), ('b.xml'), ('b.pdf'), ('c.xml'), ('c.pdf')) x(n);
create temporary table cam on commit drop as
select (select a from f)::text || '/' || (select id from ck)::text || '/' as p;
grant select on cam, ck to authenticated;

select tests.authenticate_as('vendedora@notaxml.test');
select throws_ok($$ select public.ped_registrar_xml((select id from ck), tests.nfe('23485', '6107', '55012464000100', 11668.34, 0, '11536'),
  (select p from cam) || 'a.xml', (select p from cam) || 'a.pdf') $$, '42501', null, 'a vendedora nao sobe a nota');
select tests.clear_authentication();

select tests.authenticate_as('financeiro@notaxml.test');
select throws_ok($$ select public.ped_registrar_xml((select id from ck), tests.nfe('23485', '6107', '55012464000100', 11668.34, 0, '11536'),
  (select p from cam) || 'a.xml', (select p from cam) || 'falta.pdf') $$, '23514', 'Suba o XML e o PDF (DANFE) da nota juntos.', 'XML sem o PDF e recusado');
select throws_ok($$ select public.ped_registrar_xml((select id from ck), tests.nfe('23485', '6107', '55012464000100', 11668.34, 0, '11536', '110'),
  (select p from cam) || 'a.xml', (select p from cam) || 'a.pdf') $$, '23514', null, 'nota nao autorizada e recusada');
select throws_ok($$ select public.ped_registrar_xml((select id from ck), tests.nfe('23485', '6107', '55012464000100', 11668.34, 0, '99999'),
  (select p from cam) || 'a.xml', (select p from cam) || 'a.pdf') $$, '23514',
  'A nota 23485 é do pedido 99999 no Forteplus, que não está neste checklist.', 'nota de outro pedido e recusada');

select is((public.ped_registrar_xml((select id from ck), tests.nfe('023485', '6107', '55012464000100', 11700.34, 32, '11536'),
  (select p from cam) || 'a.xml', (select p from cam) || 'a.pdf')) ->> 'situacao', 'conferida', 'a venda com CFOP de venda confere');
select is((select nota_fiscal from public.ped_pedidos where numero = '11536'), '23485', 'o numero da nota sem zeros');
select is((select nota_em from public.ped_pedidos where numero = '11536'), '2026-10-30'::date, 'a emissao vem do XML');
select is((select nota_valor from public.ped_pedidos where numero = '11536'), 11668.34::numeric, 'faturado = produtos menos desconto, sem ST');
select is((select count(*)::int from public.notifications where user_id = (select vendedora from u) and reference_type = 'ped_nota' and title like 'Nota emitida%'), 1,
  'a vendedora e avisada da nota emitida');

-- O pedido 2 é Publicidade e a nota saiu com CFOP de venda (o caso da WA, nota 23502).
select is((public.ped_registrar_xml((select id from ck), tests.nfe('23484', '6102', '55012464000100', 1040.50, 0, '11623'),
  (select p from cam) || 'b.xml', (select p from cam) || 'b.pdf')) ->> 'mensagem',
  'Pedido 2 (Publicidade): a nota 23484 saiu com CFOP 6102, que é de venda. Cancele no Forteplus em até 24 h e emita com natureza de remessa (5910 dentro do estado, 6910 fora).',
  'publicidade com CFOP de venda fica divergente');
select public.ped_informar_nota((select id from public.ped_pedidos where numero = '11545'), '558', null, null);
select throws_ok($$ with x as (insert into public.ped_finalizacoes (checklist_id) values ((select id from ck)) returning checklist_id) select 1 $$,
  'P0001', null, 'a nota divergente trava a finalizacao');
select tests.clear_authentication();
select is((select count(*)::int from public.notifications where user_id = (select outrofin from u) and reference_type = 'ped_nota_divergente'), 1,
  'o resto do Financeiro e avisado da divergencia');

select tests.authenticate_as('financeiro@notaxml.test');
select is((public.ped_registrar_xml((select id from ck), tests.nfe('23484', '6910', '11111111000111', 1040.50, 0, '11623', '100', 'chave-b2'),
  (select p from cam) || 'b.xml', (select p from cam) || 'b.pdf')) ->> 'situacao', 'divergente', 'nota de outro CNPJ fica divergente');
select like((public.ped_registrar_xml((select id from ck), tests.nfe('23484', '6910', '55012464000100', 1000.00, 0, '11623', '100', 'chave-b3'),
  (select p from cam) || 'b.xml', (select p from cam) || 'b.pdf')) ->> 'aviso', 'O total dos produtos da nota (R$ 1000,00)%', 'valor diferente do pedido so avisa');
select throws_ok($$ select public.ped_registrar_xml((select id from ck), tests.nfe('23485', '6910', '55012464000100', 1040.50, 0, '11623', '100', (select nota_chave from public.ped_pedidos where numero = '11536')),
  (select p from cam) || 'c.xml', (select p from cam) || 'c.pdf') $$, '23505', null, 'a mesma nota nao entra em dois pedidos');
select public.ped_registrar_xml((select id from ck), tests.nfe('23490', '6910', '55012464000100', 1040.50, 0, '11623', '100', 'chave-b4'),
  (select p from cam) || 'c.xml', (select p from cam) || 'c.pdf');
with x as (insert into public.ped_finalizacoes (checklist_id) values ((select id from ck)) returning checklist_id)
select is((select count(*)::int from x), 1, 'publicidade corrigida para 6910 confere e o checklist finaliza');
select tests.clear_authentication();

-- A importação semanal traz a bonificação 558 com CFOP de venda: avisa uma vez, na próxima importação não repete.
with imp as (insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
             values ((select a from f), 'vendas', 'pgtap-xml.xlsx', 1) returning id)
insert into public.com_vendas_itens (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe,
                                     cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select (select a from f), imp.id, 'MF', '2026-10-30', '558', '75', '5401', 'venda', '1615', 'P1', 'Produto', 1, 749.96 from imp;
select public.ped_avisar_divergencias((select a from f));
select public.ped_avisar_divergencias((select a from f));
select is((select count(*)::int from public.notifications where user_id = (select financeiro from u) and title like 'Importação achou nota errada%'), 1,
  'a importacao que acha a nota errada avisa o Financeiro uma vez');

select tests.authenticate_as('vendedora@notaxml.test');
select throws_ok($$ select public.ped_marcar_saida((select id from ck), 'aguardando_coleta') $$, '42501', null, 'a vendedora nao marca a saida');
select tests.clear_authentication();
select tests.authenticate_as('expedicao@notaxml.test');
select is((select string_agg(coalesce(situacao, '-') || ':' || jsonb_array_length(notas), ',') from public.ped_saidas()), '-:2',
  'a Expedicao ve o checklist com as duas notas emitidas');
select public.ped_marcar_saida((select id from ck), 'com_transportadora', 'TG Transportes', 'BR123');
select is((select situacao || '|' || transportadora from public.ped_saidas()), 'com_transportadora|TG Transportes', 'a saida fica registrada');
select tests.clear_authentication();
select is((select count(*)::int from public.notifications where user_id = (select vendedora from u) and reference_type = 'ped_saida'), 1,
  'a vendedora e avisada da entrega a transportadora');

select * from finish();
rollback;
