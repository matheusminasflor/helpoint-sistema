-- DISTRIBUIDOR PELO FATURADO (migration 20270212680000; parte 4.3 do projeto do Kommo).
--   1  nota de 7 dias antes de marcar "ganha" conta (caso Vita Derm)
--   2  nota de 1 dia depois também (caso Priscila)
--   3  nota de 20 dias antes não conta: a venda velha sem nota vai para "sem nota"
--   4  venda recente sem nota fica "aguardando nota"
--   5  a mesma nota em duas vendas do cliente fica com a mais antiga; a outra é "venda repetida"
--   6  CNPJ que não está no cadastro: "cliente não encontrado"
--   7  sem CNPJ, o telefone sugere o cliente quando casa com um só
--   8  telefone de dois clientes não sugere ninguém
--   9  o valor é a soma das notas, só de venda (bonificação fora)
--  10  quem não vê os Indicadores nem gere carteiras não lê nada
--  11  a gravação guarda só os dígitos do CNPJ e do telefone
begin;
\ir _helpers.psql

select plan(11);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-kommo-fat', 'Kommo faturado', false) as a,
       (now() at time zone 'America/Sao_Paulo')::date as hoje;
create temporary table u on commit drop as
select tests.create_user('dona@kommofat.test', (select a from f)) as dona,
       tests.create_user('ana@kommofat.test', (select a from f)) as ana;
grant select on f, u to authenticated;
select tests.grant_role((select dona from u), 'admin');

insert into public.com_clientes (tenant_id, codigo, razao_social, documento, telefone) values
  ((select a from f), '1103', 'Vita Derm', '35.588.859/0001-10', '(38) 99191-7000'),
  ((select a from f), '2000', 'Priscila Cosméticos', '11.222.333/0001-44', null),
  ((select a from f), '3000', 'Sem Nota Ltda', '22.333.444/0001-55', null),
  ((select a from f), '4000', 'Recente Ltda', '33.444.555/0001-66', null),
  ((select a from f), '5000', 'Dois Pedidos', '44.555.666/0001-77', null),
  ((select a from f), '6000', 'Telefone A', null, '(11) 95867-3001'),
  ((select a from f), '6001', 'Telefone B', null, '(11) 95867-3001');

with imp as (insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
             values ((select a from f), 'vendas', 'fixture-faturado.xlsx', 6) returning id)
insert into public.com_vendas_itens (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe,
                                     cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select (select a from f), imp.id, 'MF', (select hoje from f) + v.dia, v.nota, '1', v.cfop, v.classe, v.cli, 'P1', 'Produto', 1, v.valor
  from imp, (values
    (-37, '100', '5102', 'venda', '1103', 8000.00),   -- Vita Derm: 7 dias antes de marcar (fechou hoje-30)
    (-37, '100', '5102', 'venda', '1103', 708.04),    -- mesma nota, outro item
    (-37, '101', '5910', 'bonificacao', '1103', 500), -- bonificação não soma
    (-29, '200', '5102', 'venda', '2000', 5096.00),   -- Priscila: 1 dia depois (fechou hoje-30)
    (-50, '300', '5102', 'venda', '3000', 900.00),    -- 20 dias antes: fora da janela
    (-28, '500', '5102', 'venda', '5000', 1200.00)    -- cai na janela das duas vendas do mesmo cliente
  ) v(dia, nota, cfop, classe, cli, valor);

select public.mkt_kommo_gravar_vendas((select a from f), (select hoje from f) - 60, jsonb_build_array(
  jsonb_build_object('lead_id', 1, 'nome', 'Vita', 'funil', 'distribuidor', 'situacao', 'ganha', 'valor', 0, 'fechou', (select hoje from f) - 30, 'link', 'x', 'documento', '35.588.859/0001-10'),
  jsonb_build_object('lead_id', 2, 'nome', 'Priscila', 'funil', 'distribuidor', 'situacao', 'ganha', 'valor', 0, 'fechou', (select hoje from f) - 30, 'link', 'x', 'documento', '11222333000144'),
  jsonb_build_object('lead_id', 3, 'nome', 'Velha', 'funil', 'distribuidor', 'situacao', 'ganha', 'valor', 0, 'fechou', (select hoje from f) - 30, 'link', 'x', 'documento', '22333444000155'),
  jsonb_build_object('lead_id', 4, 'nome', 'Recente', 'funil', 'distribuidor', 'situacao', 'ganha', 'valor', 0, 'fechou', (select hoje from f) - 2, 'link', 'x', 'documento', '33444555000166'),
  jsonb_build_object('lead_id', 5, 'nome', 'Pedido 1', 'funil', 'distribuidor', 'situacao', 'ganha', 'valor', 0, 'fechou', (select hoje from f) - 30, 'link', 'x', 'documento', '44555666000177'),
  jsonb_build_object('lead_id', 6, 'nome', 'Pedido 2', 'funil', 'distribuidor', 'situacao', 'ganha', 'valor', 0, 'fechou', (select hoje from f) - 25, 'link', 'x', 'documento', '44555666000177'),
  jsonb_build_object('lead_id', 7, 'nome', 'Fantasma', 'funil', 'distribuidor', 'situacao', 'ganha', 'valor', 0, 'fechou', (select hoje from f) - 30, 'link', 'x', 'documento', '99999999000199'),
  jsonb_build_object('lead_id', 8, 'nome', 'Sem CNPJ', 'funil', 'distribuidor', 'situacao', 'ganha', 'valor', 0, 'fechou', (select hoje from f) - 30, 'link', 'x', 'telefone', '+55 38 99191-7000'),
  jsonb_build_object('lead_id', 9, 'nome', 'Telefone repetido', 'funil', 'distribuidor', 'situacao', 'ganha', 'valor', 0, 'fechou', (select hoje from f) - 30, 'link', 'x', 'telefone', '5511958673001'),
  jsonb_build_object('lead_id', 10, 'nome', 'Salão', 'funil', 'salao', 'situacao', 'ganha', 'valor', 300, 'fechou', (select hoje from f) - 30, 'link', 'x')
));

select tests.authenticate_as('dona@kommofat.test');
create temporary table fat on commit drop as
select * from public.mkt_kommo_faturado((select hoje from f) - 60, (select hoje from f));

select is((select situacao || ':' || valor from fat where lead_id = 1), 'faturado:8708.04', 'nota de 7 dias antes de marcar conta (Vita Derm), sem a bonificação');
select is((select situacao || ':' || valor from fat where lead_id = 2), 'faturado:5096.00', 'nota de 1 dia depois também conta (Priscila)');
select is((select situacao from fat where lead_id = 3), 'sem_nota', 'nota de 20 dias antes não conta; venda velha sem nota vai para "sem nota"');
select is((select situacao from fat where lead_id = 4), 'aguardando_nota', 'venda recente sem nota fica aguardando');
select is((select string_agg(lead_id || ':' || situacao, ',' order by lead_id) from fat where lead_id in (5, 6)), '5:faturado,6:venda_repetida', 'a nota fica com a venda mais antiga do cliente');
select is((select situacao from fat where lead_id = 7), 'cliente_nao_encontrado', 'CNPJ fora do cadastro');
select is((select situacao || ':' || sugerido from fat where lead_id = 8), 'sem_cnpj:Vita Derm', 'sem CNPJ, o telefone sugere o cliente único');
select is((select situacao || ':' || coalesce(sugerido, '-') from fat where lead_id = 9), 'sem_cnpj:-', 'telefone de dois clientes não sugere ninguém');
select is((select count(*)::int from fat where lead_id = 10), 0, 'só entram as vendas de Distribuidor');
select tests.clear_authentication();

select tests.authenticate_as('ana@kommofat.test');
select is((select count(*)::int from public.mkt_kommo_faturado((select hoje from f) - 60, (select hoje from f))), 0, 'sem acesso, não lê nada');
select tests.clear_authentication();

select is((select documento || '/' || coalesce(telefone, '-') from public.mkt_kommo_vendas where tenant_id = (select a from f) and lead_id = 1), '35588859000110/-', 'grava só os dígitos');

select * from finish();
rollback;
