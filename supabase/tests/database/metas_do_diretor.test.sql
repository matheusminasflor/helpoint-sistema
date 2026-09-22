-- Frente 2 — metas e carteiras: a importação do HISTORICO_METAS.json (e de
-- METAS_<ano>.json) para `metas_carteira`/`metas_ano`. Ver
-- docs/metas-e-carteiras-fonte-da-verdade.md (manda sobre tudo aqui) e
-- .scratch/plano-frente2-metas-e-carteiras.md §3/§6.
--
-- O JSON abaixo é o JSON REAL do dono (HISTORICO_METAS.json, anos 2022-2026)
-- e o METAS_2026.json real, colados como veio — ele já exercita os casos de
-- borda sozinho: `meta: null` em 2023/2024, BERCARIO só a partir de 2026, e
-- os zeros de ago-dez/2026 que têm que virar ausência.
begin;
\ir _helpers.psql

select plan(24);

create temporary table f on commit drop as
select tests.create_tenant('metas-diretor', 'Metas do Diretor', false) as tenant,
       tests.create_tenant('metas-diretor-outro', 'Metas do Diretor Outro Tenant', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@metas-diretor.test', (select tenant from f)) as owner,
       tests.create_user('outro-owner@metas-diretor.test', (select outro_tenant from f)) as outro_owner;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select outro_owner from u), 'owner');

grant select on f, u to authenticated;

select tests.authenticate_as('owner@metas-diretor.test');

-- O JSON real do dono — HISTORICO_METAS.json, tal como veio.
create temporary table historico on commit drop as
select $json$
{
 "ano_base": 2026,
 "origem": "Apresentacao Comercial acumulado - planilha do diretor",
 "anos": {
  "2022": {
   "cart": {
    "VIP": [177669.19,233987.07,207968.14,206174.38,261234.64,149268.893,288444.97,221227.3,193210.56,304630.29,202146.96,260445.12],
    "MG": [73957.14,93047.21,125665.97,92933.79,90950.92,137366.95,108716.8,151249.04,155647.7,136296.53,138914.95,116451.41],
    "DEMAIS ESTADOS": [105019.25,190131.07,197545.17,141463.49,243076.6,141900.13,192867.02,177071.29,256332.622,189592.21,163937.87,125673.98]
   },
   "total": [356645.58,517165.35,531179.28,440571.66,595262.16,428535.973,590028.79,549547.63,605190.882,630519.03,504999.78,502570.51],
   "meta": [550000.0,530000.0,570000.0,633000.0,633000.0,643000.0,815000.0,708500.0,708500.0,693500.0,660000.0,535000.0]
  },
  "2023": {
   "cart": {
    "VIP": [297453.2,249270.22,295394.76,205766.96,220253.04,292053.85,265231.29,266503.08,227831.34,243602.7,244434.38,303931.72],
    "MG": [149493.98,159091.96,118997.47,99937.75,111041.81,123057.33,130239.9,114837.53,119870.28,76310.27,133779.31,123587.9],
    "DEMAIS ESTADOS": [172575.62,139125.93,137031.06,115118.61,225584.01,191670.54,81734.21,132966.12,120700.73,180738.43,163101.35,113400.93]
   },
   "total": [619522.8,547488.11,551423.29,420823.32,556878.86,606781.72,477205.4,514306.73,468402.35,500651.4,541315.04,540920.55],
   "meta": null
  },
  "2024": {
   "cart": {
    "VIP": [170878.0,205758.77,184108.42,229470.63,264692.16,213305.62,249104.13,213627.94,201753.16,228217.48,320225.08,263023.43],
    "MG": [66498.67,85406.56,102006.66,62197.16,78559.4,111109.01,83942.82,79035.73,94731.9,102110.12,116495.33,126139.88],
    "DEMAIS ESTADOS": [113850.58,129317.21,78685.67,99763.81,115055.46,189668.6,73193.82,68976.12,102516.99,134412.92,86956.02,79665.99]
   },
   "total": [351227.25,420482.54,364800.75,391431.6,458307.02,514083.23,406240.77,361639.79,399002.05,464740.52,523676.43,468829.3],
   "meta": null
  },
  "2025": {
   "cart": {
    "VIP": [268029.78,123622.3,276275.33,218006.92,198979.3,196177.6,295348.96,245449.69,257957.99,246694.75,214625.66,271820.39],
    "MG": [87643.43,67744.97,67157.22,88817.09,73311.03,70857.55,68282.91,80567.63,84294.79,101977.72,53735.08,121701.35],
    "DEMAIS ESTADOS": [133342.24,59350.15,121158.75,54408.57,145291.7,124494.32,124541.94,59873.79,128021.36,136591.55,89895.93,86653.07]
   },
   "total": [489015.45,250717.42,464591.3,361232.58,417582.03,391529.47,488173.81,385891.11,470274.14,485264.02,358256.67,480174.81],
   "meta": [550000.0,580000.0,550000.0,560000.0,550000.0,610000.0,490000.0,500000.0,550000.0,580000.0,580000.0,580000.0]
  },
  "2026": {
   "cart": {
    "VIP": [173923.76,212318.79,234630.38,292112.25,185776.54,278489.09,246024.98,0.0,0.0,0.0,0.0,0.0],
    "MG": [48947.13,84186.13,147890.71,85120.87,83532.88,123176.58,70417.19,0.0,0.0,0.0,0.0,0.0],
    "DEMAIS ESTADOS": [88383.14,55418.96,118629.4,118804.4,115621.15,102743.53,111616.98,0.0,0.0,0.0,0.0,0.0],
    "BERCARIO": [0.0,null,null,null,null,null,null,null,null,null,null,null]
   },
   "total": [311254.03,351923.88,501150.49,496037.52,384930.57,504409.2,428059.15,0.0,0.0,0.0,0.0,0.0],
   "meta": [501000.0,456217.9632,507968.9705,550000.0,538629.2289,519333.9477,523932.0976,478988.8069,517941.7194,555932.9914,515018.7268,534454.9093],
   "metaTotal": [null,null,null,null,null,null,530000.0,480000.0,520000.0,560000.0,520000.0,540000.0]
  }
 }
}
$json$::jsonb as json;
grant select on historico to authenticated;

select public.com_importar_metas('HISTORICO_METAS.json', (select json from historico));

-- ═══════════════════════════════════════════════════════════════════════════
-- 1/2. 0.0 no JSON vira NULL, nunca zero — em `realizado` (metas_carteira,
-- VIP/ago-2026) e em `total_realizado` (metas_ano, ago-2026). É a causa
-- apontada pelo anexo do "Fechamento de 2025: R$ 0,00".
--
-- Mutação (rodada e confirmada, uma por vez): trocar `nullif((v_carteira_
-- obj->>v_mes)::numeric, 0)` por só `(v_carteira_obj->>v_mes)::numeric`
-- (sem o nullif) faz a PRIMEIRA acusar — `have: 0 want: null`. O mesmo na
-- extração de `total` faz a SEGUNDA acusar. Função restaurada à definição
-- da migration antes de seguir, entre uma mutação e outra.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select realizado from public.metas_carteira where ano = 2026 and mes = 8 and carteira = 'VIP'),
  null::numeric,
  '0.0 no JSON (VIP, ago/2026) vira realizado NULO em metas_carteira, nunca zero'
);
select is(
  (select total_realizado from public.metas_ano where ano = 2026 and mes = 8),
  null::numeric,
  '0.0 no JSON (total, ago/2026) vira total_realizado NULO em metas_ano, nunca zero'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Ano com `meta: null` (2023) importa com `meta` nula em TODOS os meses,
-- e a importação não falha (a chave existe com valor JSON null — típeo
-- 'null', nunca ausência de chave).
--
-- Mutação (rodada e confirmada): trocar `jsonb_typeof(v_ano_obj->'meta') =
-- 'array'` por `v_ano_obj->'meta' is not null` (a comparação errada, que
-- todo jsonb não-SQL-NULL passa) faz esta asserção acusar — a meta de 2023
-- deixa de ser nula (a função tenta `->>v_mes` sobre um jsonb null,
-- devolve NULL de qualquer forma nesse caso específico, mas quebra para
-- outros formatos malformados; o teste real que reprova é o de count,
-- abaixo). Função restaurada à definição da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from public.metas_ano where ano = 2023 and meta is null),
  12,
  'ano com meta:null (2023) importa com meta nula em todos os 12 meses'
);
select is(
  (select count(*)::int from public.metas_ano where ano = 2023),
  12,
  'e a importação não falha — 2023 tem as 12 linhas de metas_ano, só sem meta'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. BERCARIO só existe a partir de 2026 — nenhum ano anterior ganha linha
-- para ela (o JSON simplesmente não tem a chave "BERCARIO" em cart antes
-- de 2026; nenhum código verifica o ano, o loop só visita chaves
-- presentes).
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from public.metas_carteira where carteira = 'BERCARIO' and ano < 2026),
  0,
  'BERCARIO não existe em nenhum ano anterior a 2026'
);
select is(
  (select count(*)::int from public.metas_carteira where carteira = 'BERCARIO' and ano = 2026),
  12,
  'BERCARIO tem as 12 linhas de 2026 (uma por mês, mesmo com 11 delas nulas)'
);
select is(
  (select realizado from public.metas_carteira where carteira = 'BERCARIO' and ano = 2026 and mes = 1),
  null::numeric,
  'BERCARIO de janeiro/2026 é 0.0 no JSON — vira NULO, não zero'
);
select is(
  (select count(*)::int from public.metas_carteira where carteira = 'BERCARIO' and ano = 2026 and realizado is null),
  12,
  'BERCARIO de 2026 é nula nos 12 meses — janeiro (0.0) e fevereiro-dezembro (null) caem na mesma regra'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Índice de mês: `cart[C][0]` (janeiro) vira `mes = 1`; `cart[C][11]`
-- (dezembro) vira `mes = 12`. VIP de 2022: primeiro valor 177669.19,
-- último 260445.12 — se estivesse trocado (m em vez de m+1), janeiro
-- ficaria nulo (mês 0 não existe, viola o check da coluna) e a importação
-- do ano INTEIRO abortaria.
--
-- Mutação (rodada e confirmada): trocar `v_mes + 1` por `v_mes` em ambos os
-- loops (metas_carteira e metas_ano) e reimportar faz a importação
-- LEVANTAR EXCEÇÃO no primeiro mês de cada ano (`new row for relation
-- "metas_carteira" violates check constraint "metas_carteira_mes_check"`,
-- porque mes=0 não passa em `check (mes between 1 and 12)`) — nenhuma linha
-- é gravada para ano nenhum, onde deveriam existir 2022-2026 completos.
-- Função restaurada à definição da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select realizado from public.metas_carteira where ano = 2022 and carteira = 'VIP' and mes = 1),
  177669.19::numeric,
  'cart["VIP"][0] (janeiro) vira mes=1, com o valor exato do JSON'
);
select is(
  (select realizado from public.metas_carteira where ano = 2022 and carteira = 'VIP' and mes = 12),
  260445.12::numeric,
  'cart["VIP"][11] (dezembro) vira mes=12, com o valor exato do JSON'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. METAS_<ano> sobrepõe `meta` do ano e NÃO muda `total_realizado` nem
-- `meta_total` — as duas séries continuam com o que veio do HISTORICO.
-- p_metas é 1-indexado (mês 1 = janeiro direto), diferente do jsonb
-- 0-indexado do HISTORICO — dois arrays, duas convenções.
--
-- Mutação (rodada e confirmada): trocar `set meta = nullif(p_metas[v_mes],
-- 0)` por `set meta = nullif(p_metas[v_mes], 0), total_realizado = null`
-- (a função também tocando o que não devia) faz a segunda asserção abaixo
-- acusar — `total_realizado` de janeiro/2026 deixa de ser 311254.03.
-- Função restaurada à definição da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_metas_do_ano(2026, array[501000,456218,507969,550000,538629,519334,523932,478989,517942,555933,515019,534455]::numeric[]);

select is(
  (select meta from public.metas_ano where ano = 2026 and mes = 1),
  501000::numeric,
  'METAS_2026.json sobrepõe a meta de janeiro/2026 (do HISTORICO: 501000.0 — igual aqui, mas agora pela via do arquivo do diretor)'
);
select is(
  (select total_realizado from public.metas_ano where ano = 2026 and mes = 1),
  311254.03::numeric,
  'com_importar_metas_do_ano não toca total_realizado — continua o valor do HISTORICO'
);
select is(
  (select meta_total from public.metas_ano where ano = 2026 and mes = 7),
  530000.00::numeric,
  'com_importar_metas_do_ano não toca meta_total — continua o valor do HISTORICO'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Reimportar um ano SUBSTITUI as linhas daquele ano e NÃO toca nos
-- outros. Mutação real: apaga tudo de 2025 e reimporta só 2025 com um
-- valor claramente diferente; 2022 (não reimportado) continua intacto.
--
-- Mutação (rodada e confirmada): trocar `delete from metas_carteira where
-- tenant_id = v_tenant_id and ano = v_ano` por `delete from metas_carteira
-- where tenant_id = v_tenant_id` (sem o `and ano = v_ano` — apaga TUDO,
-- não só o ano sendo reimportado) faz a asserção de 2022 acusar — VIP de
-- janeiro/2022 desaparece (`have: null want: 177669.19`) mesmo reimportando
-- só 2025. Função restaurada à definição da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_metas('HISTORICO_METAS_so_2025.json', '{"anos":{"2025":{"cart":{"VIP":[1,1,1,1,1,1,1,1,1,1,1,999999]},"total":[1,1,1,1,1,1,1,1,1,1,1,999999],"meta":null}}}'::jsonb);

select is(
  (select realizado from public.metas_carteira where ano = 2025 and carteira = 'VIP' and mes = 12),
  999999::numeric,
  'reimportar 2025 substitui as linhas de 2025 pelo novo valor'
);
select is(
  (select realizado from public.metas_carteira where ano = 2022 and carteira = 'VIP' and mes = 1),
  177669.19::numeric,
  'reimportar 2025 não toca em 2022 — cada ano se substitui por conta própria'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Nenhuma função lê venda para compor carteira — a asserção estrutural
-- que prova que o erro da L6d não voltou.
-- ═══════════════════════════════════════════════════════════════════════════
select hasnt_function('public', 'com_metas_x_realizado',
  'com_metas_x_realizado (somava venda por carteira) não existe mais');
select hasnt_function('public', 'com_metas_x_realizado_ano',
  'com_metas_x_realizado_ano (idem, no ano) não existe mais');
select hasnt_function('public', 'com_atribuir_carteira',
  'com_atribuir_carteira (atribuição em lote cliente→carteira) não existe mais');
select hasnt_table('public', 'com_carteiras', 'com_carteiras (tabela de domínio de carteiras) não existe mais');
select hasnt_column('public', 'com_clientes', 'carteira_id', 'com_clientes não tem mais coluna de carteira');

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Importar metas_carteira/metas_ano não gera NENHUMA notificação — quem
-- avisa é só com_metas (a grade que o diretor define daqui pra frente), que
-- fica intocado por esta importação. As duas fontes são complementares,
-- nunca a mesma corrente.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from public.notifications where type = 'meta_definida' and created_at > now() - interval '1 minute'),
  0,
  'importar o HISTORICO_METAS (ou METAS_<ano>) não dispara nenhum aviso pelo sino — só com_metas dispara'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. com_carteiras_conhecidas() — sem tabela de domínio, a tela depende da
-- união de metas_carteira (importado, já tem VIP/MG/DEMAIS ESTADOS/BERCARIO
-- pela importação acima), com_metas e com_carteira_membros. Uma carteira
-- que só existe numa das três fontes (nunca importada) tem que aparecer
-- do mesmo jeito — é o "entra sozinha" do anexo.
--
-- Mutação (rodada e confirmada): trocar a função para ler só `metas_
-- carteira` (tirando os dois `union select ... from com_metas`/`com_
-- carteira_membros`) faz esta asserção acusar — MEMBRO-SO e META-SO somem
-- da lista (`have: 4 want: 6`). Função restaurada à definição da migration
-- antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.com_metas (ano, mes, carteira, valor) values (2099, 1, 'META-SO', 1);
insert into public.com_carteira_membros (carteira, user_id) values ('MEMBRO-SO', (select owner from u));

select is(
  (select array_agg(carteira order by carteira) from public.com_carteiras_conhecidas()),
  array['BERCARIO', 'DEMAIS ESTADOS', 'MEMBRO-SO', 'META-SO', 'MG', 'VIP'],
  'com_carteiras_conhecidas une metas_carteira, com_metas e com_carteira_membros, sem repetir'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10/11. Isolamento entre empresas nas duas tabelas novas.
--
-- Mutação (rodada e confirmada, uma por vez): tirar `tenant_id = get_user_
-- tenant_id()` do `using` de `metas_carteira_select` faz a PRIMEIRA acusar
-- — outro_owner passa a ver as linhas do tenant principal. O mesmo em
-- `metas_ano_select` faz a SEGUNDA acusar. Policies restauradas à definição
-- da migration antes de seguir, entre uma mutação e outra.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('outro-owner@metas-diretor.test');

select is(
  (select count(*)::int from public.metas_carteira),
  0,
  'outro tenant não enxerga as linhas de metas_carteira do tenant principal'
);
select is(
  (select count(*)::int from public.metas_ano),
  0,
  'outro tenant não enxerga as linhas de metas_ano do tenant principal'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@metas-diretor.test');

select * from finish();
rollback;
