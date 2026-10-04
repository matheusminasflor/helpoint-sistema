-- FAMÍLIAS DE PRODUTO E O HISTÓRICO DO CLIENTE POR FAMÍLIA
-- (migration 20261202010000; decisão do dono, 2026-10-03)
--
-- O sistema SUGERE a família pelo nome; o Comercial CONFIRMA na tela. Esta suíte prova:
--   1     — a sugestão classifica os nomes reais de exemplo;
--   2     — empresa nova nasce com as famílias da semente;
--   3 e 4 — produto que nasce da importação já vem com a sugestão, a confirmar;
--   5 e 6 — quem não altera a aba "Famílias de produto" não muda família (o UPDATE é filtrado e
--           afeta zero linha — lição 12) nem cria família;
--   7     — quem só importa vendas também não muda a família (a policy de UPDATE da importação
--           se soma por OR — lição 15 — e quem barra é o gatilho de colunas);
--   8 e 9 — quem altera a aba confirma e corrige;
--   10    — o histórico soma por mês e família, com a devolução descontando;
--   11    — o recorte de datas do histórico;
--   12    — a lista de compras vem da mais recente para a mais antiga, com o total para o "ver mais";
--   13    — nenhuma função nova executa como anon (lição 14).
begin;
\ir _helpers.psql

select plan(13);

-- ═══ 1. A sugestão pelo nome ═══
select is(
  array[
    public.com_sugerir_familia('6.0 LOURO ESCURO'),
    public.com_sugerir_familia('5.0 CASTANHO CLARO'),
    public.com_sugerir_familia('CARTUCHO DE COLORAÇÃO'),
    public.com_sugerir_familia('BISNAGA TONALIZANTE CREME 50GR'),
    public.com_sugerir_familia('AGUA OXIGENADA MINAS COLOR 20 VOLUMES 900 ML'),
    public.com_sugerir_familia('AGUA OXIGENADA MINAS COLOR 6 VOLUMES 900 ML'),
    public.com_sugerir_familia('AGUA OXIGENADA MINAS COLOR 40 VOLUMES 90 ML'),
    public.com_sugerir_familia('PO DESCOLORANTE AZUL 500G'),
    public.com_sugerir_familia('PÓS-COLORAÇÃO 300ML'),
    public.com_sugerir_familia('MASCARA HIDRATANTE 1KG'),
    public.com_sugerir_familia('SHAMPOO MATIZADOR 300ML'),
    public.com_sugerir_familia('SACHE RECONSTRUTOR 12ML'),
    public.com_sugerir_familia('LEAVE-IN 200ML'),
    public.com_sugerir_familia('SACOLA PERSONALIZADA'),
    public.com_sugerir_familia('BISNAGA VAZIA 50GR'),
    public.com_sugerir_familia('XPTO 123')
  ],
  array[
    'Coloração', 'Coloração', 'Coloração', 'Tonalizante', 'OX 20 vol', 'OX 6 vol', 'OX 40 vol',
    'Descolorante', 'Pós-coloração', 'Tratamento', 'Tratamento', 'Tratamento', 'Finalizador',
    'Embalagem e brindes', 'Embalagem e brindes', 'Outros'
  ],
  'a sugestao classifica tom, tonalizante, OX por volume, descolorante, pos-coloracao, tratamento, finalizador e embalagem'
);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-familias', 'Familias de Produto', false) as a;

-- Dono (importa e passa em tudo); "comum" só tem o módulo; "importa" só importa vendas;
-- "classifica" altera a aba Famílias de produto.
create temporary table u on commit drop as
select tests.create_user('dono@familias.test', (select a from f)) as dono,
       tests.create_user('comum@familias.test', (select a from f)) as comum,
       tests.create_user('importa@familias.test', (select a from f)) as importa,
       tests.create_user('classifica@familias.test', (select a from f)) as classifica;
select tests.grant_role((select dono from u), 'owner');
select tests.grant_module((select comum from u), (select a from f), 'comercial');
select tests.grant_module((select importa from u), (select a from f), 'comercial');
select tests.grant_module((select classifica from u), (select a from f), 'comercial');

insert into public.access_profiles (tenant_id, department, name, is_default, permissions)
values ((select a from f), 'comercial', 'Só importa (familias)', false, '{"vendas": {"importar": true}}'::jsonb),
       ((select a from f), 'comercial', 'Classifica (familias)', false, '{"config_familias": {"view": true, "edit": true}}'::jsonb);
select tests.grant_profile((select importa from u), (select a from f), 'comercial', 'Só importa (familias)');
select tests.grant_profile((select classifica from u), (select a from f), 'comercial', 'Classifica (familias)');
grant select on f, u to authenticated;

-- ═══ 2. A semente ═══
select is(
  (select count(*)::int from public.com_familias where tenant_id = (select a from f)),
  13,
  'empresa nova nasce com as treze familias da semente'
);

-- ── A venda importada (o dono importa, como a tela) ──────────────────────────────────────
--   CF1 comprou: 05/03 P1 (tom) 2 un R$ 100 + P2 (OX 20) 1 un R$ 30 + P3 (máscara) 1 un R$ 80;
--                10/04 P1 3 un R$ 150; 20/04 devolveu P1 1 un R$ 50; 02/05 P3 1 un R$ 80.
select tests.authenticate_as('dono@familias.test');

insert into public.com_clientes (codigo, razao_social, ativo) values ('CF1', 'Cliente Familia', true);

select public.com_importar_vendas('MF', 'fixture-familias.xlsx', 6, '{}'::jsonb,
  $items$[
    {"emissao":"2031-03-05","documento":"F01","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF1","cliente_nome":"Cliente Familia","produto_codigo":"FP1","produto_nome":"6.0 LOURO ESCURO","quantidade":2,"valor_nota":100.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-05","documento":"F01","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF1","cliente_nome":"Cliente Familia","produto_codigo":"FP2","produto_nome":"AGUA OXIGENADA MINAS COLOR 20 VOLUMES 900 ML","quantidade":1,"valor_nota":30.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-05","documento":"F01","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF1","cliente_nome":"Cliente Familia","produto_codigo":"FP3","produto_nome":"MASCARA HIDRATANTE 1KG","quantidade":1,"valor_nota":80.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-04-10","documento":"F02","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF1","cliente_nome":"Cliente Familia","produto_codigo":"FP1","produto_nome":"6.0 LOURO ESCURO","quantidade":3,"valor_nota":150.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-04-20","documento":"F03","serie":"1","tipo_documento":"NFe","cfop":"1202","classe":"devolucao","cliente_codigo":"CF1","cliente_nome":"Cliente Familia","produto_codigo":"FP1","produto_nome":"6.0 LOURO ESCURO","quantidade":1,"valor_nota":50.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-05-02","documento":"F04","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF1","cliente_nome":"Cliente Familia","produto_codigo":"FP3","produto_nome":"MASCARA HIDRATANTE 1KG","quantidade":1,"valor_nota":80.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

select tests.clear_authentication();

-- ═══ 3 e 4. O produto nasce com a sugestão, a confirmar ═══
select is(
  (select array_agg(fa.nome order by p.codigo)
     from public.com_produtos p join public.com_familias fa on fa.id = p.familia_id
    where p.tenant_id = (select a from f)),
  array['Coloração', 'OX 20 vol', 'Tratamento'],
  'a importacao cria o produto ja com a familia sugerida pelo nome'
);
select is(
  (select count(*)::int from public.com_produtos where tenant_id = (select a from f) and familia_confirmada),
  0,
  'a sugestao nasce a confirmar'
);

-- ═══ 5 e 6. Quem só tem o módulo não muda família ═══
select tests.authenticate_as('comum@familias.test');
update public.com_produtos set familia_confirmada = true where codigo = 'FP1';
select throws_ok(
  format($$ insert into public.com_familias (tenant_id, nome) values (%L, 'Kits') returning id $$, (select a from f)),
  '42501', null,
  'quem nao altera a aba nao cria familia'
);
select tests.clear_authentication();
select is(
  (select familia_confirmada from public.com_produtos where tenant_id = (select a from f) and codigo = 'FP1'),
  false,
  'o UPDATE de quem so tem o modulo e filtrado pela policy: zero linha, nada muda'
);

-- ═══ 7. Quem só importa também não ═══
select tests.authenticate_as('importa@familias.test');
select throws_ok(
  $$ update public.com_produtos set familia_confirmada = true where codigo = 'FP1' returning id $$,
  '42501', null,
  'quem so importa vendas passa pela policy da importacao, e o gatilho de colunas barra a familia'
);
select tests.clear_authentication();

-- ═══ 8 e 9. Quem altera a aba confirma e corrige ═══
select tests.authenticate_as('classifica@familias.test');
select lives_ok(
  $$ update public.com_produtos set familia_confirmada = true where codigo in ('FP1', 'FP2') returning id $$,
  'quem altera a aba confirma a sugestao'
);
select lives_ok(
  format($$ update public.com_produtos set familia_id = %L, familia_confirmada = true where codigo = 'FP3' returning id $$,
         (select id from public.com_familias where tenant_id = (select a from f) and nome = 'Finalizador')),
  'e corrige a familia'
);
select tests.clear_authentication();

-- Agora: FP1 Coloração, FP2 OX 20 vol, FP3 Finalizador — todos confirmados.
select tests.authenticate_as('dono@familias.test');

-- ═══ 10. O histórico por mês e família ═══
-- Abril de Coloração: 3 un R$ 150 menos a devolução de 1 un R$ 50 = 2 un R$ 100.
select is(
  -- Os casts fixam a escala do texto: a comparação é de número, não de como ele foi escrito.
  (select array_agg(format('%s|%s|%s|%s', competencia, familia, quantidade::int, valor::numeric(14, 2))
                    order by competencia, ordem)
     from public.com_historico_do_cliente('CF1')),
  array[
    '2031-03-01|Coloração|2|100.00',
    '2031-03-01|OX 20 vol|1|30.00',
    '2031-03-01|Finalizador|1|80.00',
    '2031-04-01|Coloração|2|100.00',
    '2031-05-01|Finalizador|1|80.00'
  ],
  'o historico soma por mes e familia, com a devolucao descontando, e segue a familia corrigida'
);

-- ═══ 11. O recorte ═══
select is(
  (select array_agg(format('%s|%s', competencia, familia) order by competencia, ordem)
     from public.com_historico_do_cliente('CF1', '2031-04-01', '2031-04-30')),
  array['2031-04-01|Coloração'],
  'com periodo, so os meses dele'
);

-- ═══ 12. As compras, a mais recente primeiro ═══
select is(
  (select array_agg(format('%s|%s|%s', emissao, documento, total)) from public.com_compras_do_cliente('CF1', null, null, null, 2)),
  array['2031-05-02|F04|6', '2031-04-20|F03|6'],
  'a lista de compras vem da mais recente, corta no limite e diz quantas existem'
);

select tests.clear_authentication();

-- ═══ 13. Nada novo executa como anon (lição 14) ═══
select is(
  (select count(*)::int
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('com_sugerir_familia', 'com_semear_familias', 'com_historico_do_cliente',
                        'com_compras_do_cliente', 'abas_de_configuracao')
      and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'nenhuma funcao nova das familias executa como anon'
);

select * from finish();
rollback;
