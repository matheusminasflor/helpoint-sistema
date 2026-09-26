-- O CASHBACK QUE O DIRETOR LÊ — e o zero silencioso que ele lia antes
-- (migration 20261027020000_cashback_para_a_diretoria.sql)
--
-- Pedido do dono, 2026-09-25: "o diretor e comercial precisa saber quanto foi
-- faturado, o que foi de bonificação, o que foi de CASHBACK".
--
-- O DEFEITO NÃO ERA A TELA FALTANDO, era o número que apareceria nela.
-- `com_cashback_mensal`/`com_cashback_resumo` são `stable`, não
-- `security definer`: leem com os poderes de quem chama. Das onze tabelas
-- `com_*`, dez liberavam SELECT para "Comercial **ou** Diretoria";
-- `com_faixas_cashback` liberava só para o Comercial. Sem as faixas, `exists
-- (select 1 from com_faixas_cashback …)` dá falso, todo cliente sai
-- `sem_programa`, e `com_cashback_indicadores` devolve `cashback_total = 0`.
--
-- Zero é plausível. O diretor leria "o cashback deste ano foi R$ 0,00" e
-- acreditaria. É a regra 1 das cinco pelo lado da LEITURA: a policy não levanta
-- erro, ela filtra linhas — e linha filtrada vira número menor, não exceção.
--
-- O DIRETOR PURO DESTA SUÍTE é `role = 'member'` mais o módulo `diretoria`, e
-- isso é o ponto: `has_diretoria_access` cai para `is_supervisor_or_higher`
-- quando a pessoa é owner/admin/manager, e um owner passa nas DUAS condições.
-- Testar com owner deixaria a policy antiga verde — o bloco 1 existe para
-- provar que a premissa é a certa antes de os outros valerem alguma coisa.
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('cashback-diretor', 'Cashback Diretor', false) as tenant;

-- Dois usuários na MESMA empresa, porque o caminho real é esse: quem importa é
-- o Comercial, quem lê o número no painel é o diretor. Um usuário só não
-- conseguiria montar a fixture e ainda ser diretor puro.
create temporary table u on commit drop as
select tests.create_user('comercial@cashback-diretor.test', (select tenant from f)) as comercial,
       tests.create_user('diretor@cashback-diretor.test', (select tenant from f)) as diretor;

select tests.grant_role((select comercial from u), 'owner');
select tests.grant_role((select diretor from u), 'member');
select tests.grant_module((select diretor from u), (select tenant from f), 'diretoria');

grant select on f, u to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- A FIXTURE, montada pelo Comercial. Cliente ATACADISTA que comprou 6.000,00
-- em janeiro de 2031: a faixa semeada da ATACADISTA é 5.000,00 → 2%, e a
-- seguinte é 7.500,00 → 2,5%, então o cashback é 2% de 6.000,00 = 120,00.
--
-- As faixas nascem sozinhas: `trg_com_semear_faixas_cashback` roda no INSERT de
-- `tenants`. A suíte não as insere à mão de propósito — assim ela também
-- exercita a semente que toda empresa nova recebe.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('comercial@cashback-diretor.test');

insert into public.com_clientes (codigo, razao_social, tabela_preco, ativo) values
  ('CD1', 'Cliente Cashback Diretor', 'ATACADISTA', true);

select public.com_importar_vendas('MF', 'fixture-cashback-diretor.xlsx', 1, '{}'::jsonb,
  $items$[
    {"emissao":"2031-01-20","documento":"D101","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CD1","cliente_nome":"Cliente Cashback Diretor","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":6000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

-- O que o Comercial vê, guardado para o bloco 4 comparar. Tabela temporária em
-- vez de repetir a chamada depois: dentro de uma transação o dado não muda, mas
-- a chamada roda como o papel ATUAL — repeti-la já autenticado como diretor
-- mediria o diretor duas vezes e a comparação não provaria nada.
create temporary table visto_pelo_comercial on commit drop as
select cashback_total, comprado_total from public.com_cashback_indicadores(2031);

grant select on visto_pelo_comercial to authenticated;

select tests.clear_authentication();
select tests.authenticate_as('diretor@cashback-diretor.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A PREMISSA. Sem ela os quatro blocos seguintes não provam nada: um usuário
-- que também tem acesso ao Comercial passaria na policy antiga, e a suíte ficaria
-- verde contra o defeito que ela existe para pegar.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  row(
    public.has_comercial_access((select diretor from u)),
    public.has_diretoria_access((select diretor from u))
  ),
  row(false, true),
  'o usuário do teste é diretor PURO: sem acesso ao Comercial, com acesso à Diretoria'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. A POLICY. A asserção que nasceu vermelha: contra a policy antiga o diretor
-- puro lia ZERO faixas, e nenhum erro aparecia.
--
-- Mutação (é a própria policy anterior): tirar
-- `or has_diretoria_access(auth.uid())` do `using` faz esta devolver 0.
-- ═══════════════════════════════════════════════════════════════════════════
select cmp_ok(
  (select count(*) from public.com_faixas_cashback)::int,
  '>',
  0,
  'o diretor puro lê a tabela de faixas — sem ela o cashback de todo mundo vira zero em silêncio'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. O NÚMERO. 2% de 6.000,00. Contra a policy antiga viria 0,00 aqui, que é
-- a razão de a leva existir: um zero plausível numa tela de diretor.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(cashback_total, comprado_total) from public.com_cashback_indicadores(2031)),
  row(120.00::numeric, 6000.00::numeric),
  'o diretor puro vê o cashback de verdade (2% de 6.000,00), nunca zero'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. O MESMO NÚMERO DOS DOIS LADOS. Um cashback "do diretor" diferente do
-- cashback "do comercial" seria pior que nenhum: as duas telas discordariam sem
-- nada acusar, cada uma com um número plausível. É a mesma razão de as caixas do
-- faturamento serem uma função só (`com_caixas`).
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(cashback_total, comprado_total) from public.com_cashback_indicadores(2031)),
  (select row(cashback_total, comprado_total) from visto_pelo_comercial),
  'o cashback que o diretor lê é o MESMO que o Comercial lê — uma conta só'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. LER NÃO É CONFIGURAR. A migration mexeu SÓ na policy de SELECT: quem cria
-- faixa continua precisando de `tem_permissao(..., 'cashback', 'configurar')`.
-- Sem esta asserção, "o diretor vê o cashback" viraria, na próxima leva, "o
-- diretor mexe no programa de cashback" sem ninguém decidir isso.
--
-- O erro VEM (42501) porque é WITH CHECK de INSERT — ao contrário de UPDATE e
-- DELETE barrados, que só filtram a linha e afetam zero (regra 12 do pgTAP no
-- CLAUDE.md).
--
-- O `tenant_id` vai preenchido com o da PRÓPRIA empresa de propósito: deixá-lo
-- de fora daria nulo na comparação, nulo não é verdadeiro, e a asserção passaria
-- pelo motivo errado — provando que nulo não casa com a policy em vez de provar
-- que o diretor não configura cashback.
-- ═══════════════════════════════════════════════════════════════════════════
select throws_ok(
  format(
    $$insert into public.com_faixas_cashback (tenant_id, tabela_base, valor_minimo, percentual)
      values (%L, 'ATACADISTA', 999999.00, 99.00)$$,
    (select tenant from f)
  ),
  '42501',
  null,
  'o diretor puro NÃO cria faixa de cashback — a migration abriu a leitura, não a configuração'
);

select tests.clear_authentication();

select * from finish();
rollback;
