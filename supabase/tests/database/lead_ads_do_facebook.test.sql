-- CRM-4c: Lead Ads do Facebook (migrations 20261004010000 a 20261005020000).
--
-- A regra que este arquivo existe para provar é a do dono, dita duas vezes:
-- **o lead não escolhe funil**. O administrador cria o funil, liga o formulário
-- a ele, e só então o lead entra. Enquanto isso o lead não se perde — ele é
-- pago, e o Facebook não reentrega.
--
-- Prova:
--   - lead de formulário sem destino fica retido, e nenhum negócio nasce
--   - ligar o formulário solta na hora o que estava esperando
--   - a resposta mapeada vai para o campo certo do contato, com o tipo certo
--   - o que não foi mapeado vira anotação legível, em vez de sumir
--   - texto que não vira número não derruba o lead: vai para a anotação
--   - nome, e-mail e telefone mapeados **valem** — e o telefone mapeado
--     reconhece um contato que já existe, em vez de criar um segundo
--   - lead cujo conteúdo não chegou da Meta não vira contato vazio
--   - mapeamento apontando para campo inexistente é recusado ao salvar
--   - reentrega da Meta não duplica
--   - reentrega não devolve a "retido" um lead que já virou negócio
--   - nome de formulário comprido não trava todos os leads do anúncio
--   - formulário de página que não é da empresa é recusado
--   - ninguém alcança o lead de outra empresa, nem para mexer no estado dele
--   - nem o gestor cadastra uma página do Facebook à mão (é o `page_id` que diz
--     de quem é o lead, e quem o atribui é a Meta pelo OAuth) — e o OAuth,
--     que é a outra metade da mesma regra, **consegue**
--   - quem não é gestor não liga formulário; ninguém logado escreve lead cru;
--     a credencial da empresa não é legível por ninguém logado
--   - outra empresa não vê nada disto
begin;
\ir _helpers.psql

select plan(36);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-la-a', 'Lead Ads A') as a,
       tests.create_tenant('pgtap-la-b', 'Lead Ads B') as b;

create temporary table u on commit drop as
select tests.create_user('gestor@la.test',    (select a from f)) as gestor,
       tests.create_user('vendedor@la.test',  (select a from f)) as vendedor,
       tests.create_user('gestorb@la.test',   (select b from f)) as gestor_b;
select tests.grant_module((select gestor from u),   (select a from f), 'crm');
select tests.grant_module((select vendedor from u), (select a from f), 'crm');
select tests.grant_module((select gestor_b from u), (select b from f), 'crm');
select tests.grant_role((select gestor from u),   'manager');
select tests.grant_role((select gestor_b from u), 'manager');
grant select on f, u to authenticated, anon;

-- O destino existe porque alguém o criou antes: é o funil semeado do tenant.
create temporary table destino on commit drop as
select p.id as pipeline, s.id as etapa
  from public.crm_pipelines p
  join public.crm_pipeline_stages s on s.pipeline_id = p.id
 where p.tenant_id = (select a from f)
 order by p.position, s.position
 limit 1;
grant select on destino to authenticated, anon;

-- A página do Facebook é conectada pelo Marketing, e é ela que diz de quem é o
-- lead. Sem esta linha o formulário não se liga a funil nenhum — o que é a
-- regra, não um detalhe do teste.
insert into public.mkt_social_accounts (tenant_id, platform, account_name, page_id, is_active)
select a, 'facebook'::public.social_platform, 'Pagina da Empresa A', 'pagina-a', true from f
union all
select b, 'facebook'::public.social_platform, 'Pagina da Empresa B', 'pagina-b', true from f;

-- Um campo personalizado numérico, para provar a conversão de tipo: o
-- Facebook entrega tudo como texto, inclusive "12".
insert into public.crm_custom_fields (tenant_id, entity, key, label, type)
select a, 'contact', 'pontos', 'Quantos pontos de venda', 'number' from f;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O lead que chega antes de existir destino
-- ───────────────────────────────────────────────────────────────────────────
-- `INSERT ... RETURNING` só alimenta uma tabela por CTE: escrito direto,
-- o Postgres reclama de sintaxe na palavra `insert`.
create temporary table cru on commit drop as
with ins as (
  insert into public.crm_lead_ads_raw (tenant_id, leadgen_id, page_id, form_id, campos, status)
  select a, 'lead-1', 'pagina-a', 'form-a',
    jsonb_build_object(
      'full_name',     'Ana Distribuidora',
      'email',         'ana@exemplo.com.br',
      'phone_number',  '+55 31 98888-7766',
      'quantos_pontos','12',
      'faturamento',   'uns 40 mil'),
    'retido'
  from f
  returning id
) select id from ins;
grant select on cru to authenticated, anon;

select is(
  public.crm_lead_ads_aplicar((select id from cru)),
  null,
  'sem formulario ligado a um funil, o lead nao vira negocio'
);
select is(
  (select status from public.crm_lead_ads_raw where id = (select id from cru)),
  'retido',
  'e ele fica retido, inteiro, em vez de sumir'
);
select is(
  (select count(*)::int from public.crm_deals where tenant_id = (select a from f)),
  0,
  'nenhum funil e inventado para ele'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Ligar o formulário solta o que estava esperando
-- ───────────────────────────────────────────────────────────────────────────
insert into public.crm_lead_ads_forms
  (tenant_id, page_id, form_id, form_name, pipeline_id, stage_id, mapeamento)
select a, 'pagina-a', 'form-a', 'Distribuidores 2026',
  (select pipeline from destino), (select etapa from destino),
  '{"quantos_pontos": "custom:pontos"}'::jsonb
from f;

select is(
  (select status from public.crm_lead_ads_raw where id = (select id from cru)),
  'aplicado',
  'ligar o formulario aplica na hora o lead que estava retido'
);

create temporary table nasceu on commit drop as
select d.id as deal, d.title, d.contact_id, c.email, c.phone, c.custom
  from public.crm_lead_ads_raw r
  join public.crm_deals d on d.id = r.deal_id
  join public.crm_contacts c on c.id = d.contact_id
 where r.id = (select id from cru);
grant select on nasceu to authenticated, anon;

select is(
  (select title from nasceu),
  'Distribuidores 2026 — Ana Distribuidora',
  'o negocio nasce com o nome do formulario e o de quem preencheu'
);
select is(
  (select custom->>'pontos' from nasceu),
  '12',
  'a resposta mapeada entra no campo personalizado'
);
select is(
  (select jsonb_typeof(custom->'pontos') from nasceu),
  'number',
  'e entra como numero, nao como o texto que o Facebook mandou'
);
select is(
  (select count(*)::int from public.crm_deal_activities
    where deal_id = (select deal from nasceu) and kind = 'note'
      and content like '%faturamento: uns 40 mil%'),
  1,
  'o que nao foi mapeado vira anotacao legivel, em vez de se perder'
);

-- Reentrega: a Meta repete a mesma notificação, e isso é normal.
--
-- O teste tem de percorrer o caminho que **a Meta** dispara, e não chamar a
-- função duas vezes: era assim antes, e ficava verde com o defeito presente.
-- Quem chega primeiro numa reentrega é a gravação do webhook — e ela, quando era
-- um `upsert` comum, reescrevia o `status` e devolvia a `retido` um lead já
-- aplicado. O guard da função deixava de valer e nascia um **segundo negócio**,
-- com o primeiro virando órfão no funil. O `on conflict do nothing` abaixo é o
-- que a edge function faz hoje.
insert into public.crm_lead_ads_raw (tenant_id, leadgen_id, page_id, form_id, campos, status)
select a, 'lead-1', 'pagina-a', 'form-a', '{"full_name": "Ana Distribuidora"}'::jsonb, 'retido'
from f
on conflict (tenant_id, leadgen_id) do nothing;

select is(
  (select status from public.crm_lead_ads_raw where id = (select id from cru)),
  'aplicado',
  'a reentrega da Meta nao devolve a retido um lead que ja entrou'
);
select is(
  public.crm_lead_ads_aplicar((select id from cru)),
  (select deal from nasceu),
  'reentregar o mesmo lead devolve o negocio que ja existe'
);
select is(
  (select count(*)::int from public.crm_deals where tenant_id = (select a from f)),
  1,
  'e nao cria um segundo negocio'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Nome, e-mail e telefone mapeados valem
-- ───────────────────────────────────────────────────────────────────────────
-- O formulário do Facebook só nomeia `full_name`, `email` e `phone_number`
-- sozinho. Quem escreve "Qual seu melhor e-mail?" como pergunta própria precisa
-- poder dizer para onde aquilo vai — e o sistema precisa **cumprir**.
insert into public.crm_lead_ads_forms
  (tenant_id, page_id, form_id, form_name, pipeline_id, stage_id, mapeamento)
select a, 'pagina-a', 'form-b', 'Salões 2026',
  (select pipeline from destino), (select etapa from destino),
  '{"melhor_email": "email", "seu_whats": "phone", "nome_da_loja": "company"}'::jsonb
from f;

create temporary table cru2 on commit drop as
with ins as (
  insert into public.crm_lead_ads_raw (tenant_id, leadgen_id, page_id, form_id, campos, status)
  select a, 'lead-2', 'pagina-a', 'form-b',
    jsonb_build_object(
      'full_name',    'Bruno do Salão',
      'melhor_email', 'bruno@salao.com.br',
      'seu_whats',    '(31) 97777-1122',
      'nome_da_loja', 'Salão do Bruno'),
    'retido'
  from f
  returning id
) select id from ins;
grant select on cru2 to authenticated, anon;

select isnt(public.crm_lead_ads_aplicar((select id from cru2)), null, 'o segundo lead entra');

create temporary table nasceu2 on commit drop as
select c.email, c.phone, c.company
  from public.crm_lead_ads_raw r
  join public.crm_deals d on d.id = r.deal_id
  join public.crm_contacts c on c.id = d.contact_id
 where r.id = (select id from cru2);
grant select on nasceu2 to authenticated, anon;

select is((select email from nasceu2), 'bruno@salao.com.br',
  'a pergunta mapeada como e-mail vira o e-mail do contato');
select is((select phone from nasceu2), '(31) 97777-1122',
  'a pergunta mapeada como telefone vira o telefone do contato');
select is((select company from nasceu2), 'Salão do Bruno',
  'e a mapeada como empresa vira a empresa');

-- E o telefone mapeado tem de entrar na conta de "quem ja existe": senao o
-- mesmo cliente volta como contato novo a cada anuncio.
create temporary table cru3 on commit drop as
with ins as (
  insert into public.crm_lead_ads_raw (tenant_id, leadgen_id, page_id, form_id, campos, status)
  select a, 'lead-3', 'pagina-a', 'form-b',
    jsonb_build_object('full_name', 'Bruno', 'seu_whats', '5531977771122'),
    'retido'
  from f
  returning id
) select id from ins;
grant select on cru3 to authenticated, anon;

select isnt(public.crm_lead_ads_aplicar((select id from cru3)), null, 'o terceiro lead entra');
select is(
  (select count(*)::int from public.crm_contacts
    where tenant_id = (select a from f) and phone is not null
      and public.crm_telefone_chave(phone) = public.crm_telefone_chave('31977771122')),
  1,
  'o mesmo telefone, escrito de outro jeito, nao vira um segundo contato'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Texto que não vira número não derruba o lead
-- ───────────────────────────────────────────────────────────────────────────
create temporary table cru4 on commit drop as
with ins as (
  insert into public.crm_lead_ads_raw (tenant_id, leadgen_id, page_id, form_id, campos, status)
  select a, 'lead-4', 'pagina-a', 'form-a',
    jsonb_build_object('full_name', 'Carla Torta', 'quantos_pontos', 'uns 12'),
    'retido'
  from f
  returning id
) select id from ins;
grant select on cru4 to authenticated, anon;

select isnt(public.crm_lead_ads_aplicar((select id from cru4)), null,
  'resposta que nao vira numero nao impede o lead de entrar');
select is(
  (select count(*)::int from public.crm_deal_activities a
     join public.crm_lead_ads_raw r on r.deal_id = a.deal_id
    where r.id = (select id from cru4) and a.content like '%quantos_pontos: uns 12%'),
  1,
  'ela vai para a anotacao, legivel, em vez de se perder'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Lead cujo conteúdo não chegou não vira contato vazio
-- ───────────────────────────────────────────────────────────────────────────
-- Acontece quando a Graph API recusa a leitura: o webhook guarda a linha com o
-- erro e **sem** as respostas. Aplicá-la criaria um contato "Lead do anúncio"
-- sem e-mail nem telefone — e o botão "Tentar de novo" da tela criaria mais um
-- a cada clique.
create temporary table vazio on commit drop as
with ins as (
  insert into public.crm_lead_ads_raw (tenant_id, leadgen_id, page_id, form_id, campos, status, erro)
  select a, 'lead-5', 'pagina-a', 'form-a', '{}'::jsonb, 'erro', 'meta: (#190) token vencido'
  from f returning id
) select id from ins;
grant select on vazio to authenticated, anon;

select is(public.crm_lead_ads_aplicar((select id from vazio)), null,
  'lead sem conteudo nenhum nao vira negocio');
select is(
  (select count(*)::int from public.crm_contacts
    where tenant_id = (select a from f) and name = 'Lead do anúncio'),
  0,
  'e nao deixa um contato vazio para tras'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Mapeamento errado é recusado enquanto o administrador ainda está na tela
-- ───────────────────────────────────────────────────────────────────────────
select throws_ok(
  $$ insert into public.crm_lead_ads_forms
       (tenant_id, page_id, form_id, pipeline_id, stage_id, mapeamento)
     select a, 'pagina-a', 'form-x', (select pipeline from destino), (select etapa from destino),
            '{"quantos": "custom:nao_existe"}'::jsonb from f $$,
  '23514',
  null,
  'mapear para um campo personalizado que nao existe e recusado ao salvar'
);
select throws_ok(
  $$ insert into public.crm_lead_ads_forms
       (tenant_id, page_id, form_id, pipeline_id, stage_id, mapeamento)
     select a, 'pagina-a', 'form-y', (select pipeline from destino), (select etapa from destino),
            '{"quantos": "inventado"}'::jsonb from f $$,
  '23514',
  null,
  'destino que o sistema nao sabe cumprir tambem e recusado'
);

-- `page_id` e `form_id` são texto livre, e o id de uma página é público. Sem
-- esta pergunta, um gestor de qualquer empresa cadastrava a página de outra.
select throws_ok(
  $$ insert into public.crm_lead_ads_forms
       (tenant_id, page_id, form_id, pipeline_id, stage_id)
     select b, 'pagina-a', 'form-de-outro',
            (select p.id from public.crm_pipelines p where p.tenant_id = (select b from f) limit 1),
            (select s.id from public.crm_pipeline_stages s
               join public.crm_pipelines p on p.id = s.pipeline_id
              where p.tenant_id = (select b from f) limit 1)
     from f $$,
  '23514',
  null,
  'nao se liga formulario de pagina que nao e desta empresa'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Nome comprido não trava o anúncio inteiro
-- ───────────────────────────────────────────────────────────────────────────
-- `crm_deals.title` e `crm_contacts.name` param em 160 caracteres, e o título é
-- `nome do formulário || ' — ' || nome da pessoa`, ambos vindos da Meta. Sem
-- corte, um formulário com nome comprido mandava **todos** os leads daquele
-- anúncio para `erro`, com uma mensagem sobre `crm_deals_title_check` — e sem
-- saída pela tela, porque o nome do formulário se muda no Facebook.
insert into public.crm_lead_ads_forms
  (tenant_id, page_id, form_id, form_name, pipeline_id, stage_id)
select a, 'pagina-a', 'form-comprido', repeat('Distribuidores da região metropolitana ', 4),
  (select pipeline from destino), (select etapa from destino)
from f;

create temporary table cru5 on commit drop as
with ins as (
  insert into public.crm_lead_ads_raw (tenant_id, leadgen_id, page_id, form_id, campos, status)
  select a, 'lead-6', 'pagina-a', 'form-comprido',
    jsonb_build_object('full_name', repeat('Maria Aparecida ', 15), 'email', 'maria@exemplo.com'),
    'retido'
  from f returning id
) select id from ins;
grant select on cru5 to authenticated, anon;

select isnt(public.crm_lead_ads_aplicar((select id from cru5)), null,
  'formulario com nome comprido nao impede o lead de entrar');
select ok(
  (select length(d.title) from public.crm_lead_ads_raw r
     join public.crm_deals d on d.id = r.deal_id
    where r.id = (select id from cru5)) <= 160,
  'o titulo do negocio cabe no que a tabela aceita'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Quem pode o quê
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@la.test');

select is(
  (select count(*)::int from public.crm_lead_ads_raw),
  6,
  'quem tem o Comercial ve os leads de anuncio da propria empresa'
);
-- Quem grava lead cru é a edge function que falou com a Meta: uma linha escrita
-- pela tela seria um lead que a Meta nunca mandou.
select throws_ok(
  $$ insert into public.crm_lead_ads_raw (tenant_id, leadgen_id, campos)
     select a, 'inventado', '{}'::jsonb from f $$,
  '42501',
  null,
  'ninguem logado escreve lead cru'
);
-- Dizer para onde o lead vai é decisão de quem administra, como criar funil.
select throws_ok(
  $$ insert into public.crm_lead_ads_forms
       (tenant_id, page_id, form_id, pipeline_id, stage_id)
     select a, 'pagina-a', 'form-z', (select pipeline from destino), (select etapa from destino) from f $$,
  '42501',
  null,
  'vendedor comum nao liga formulario a funil'
);
-- Fechada como as irmãs: o segredo do aplicativo é o que prova que a chamada
-- veio da Meta. Quem o tem escreve lead no CRM de um cliente.
select throws_ok(
  $$ select count(*) from public.tenant_lead_ads_connections $$,
  '42501', null,
  'nem quem tem o Comercial le a credencial do Lead Ads'
);
-- O cofre do Marketing guarda a credencial da página, que é com o que se lê o
-- conteúdo de um lead. A RLS sem policy já negava; o privilégio, não.
select throws_ok(
  $$ select count(*) from public.mkt_social_account_secrets $$,
  '42501', null,
  'nem quem tem o Comercial le a credencial da pagina'
);

select tests.clear_authentication();
select tests.authenticate_as('gestor@la.test');

-- É o `page_id` que diz de quem é um lead de anúncio. Enquanto ele pôde ser
-- digitado, um gestor de qualquer empresa reivindicava a página de outra e
-- ficava com os leads dela — bastava chegar primeiro. Quem tem o direito de
-- dizer "esta página é desta empresa" é a Meta, pelo OAuth.
select throws_ok(
  $$ insert into public.mkt_social_accounts (tenant_id, platform, account_name, page_id)
     select a, 'facebook'::public.social_platform, 'Pagina que nao e minha', 'pagina-da-vitima' from f $$,
  '42501',
  null,
  'nem o gestor cadastra uma pagina do Facebook a mao'
);

select tests.clear_authentication();

-- A outra metade da mesma regra, e a que ninguém lembra de provar: o OAuth
-- **tem** de conseguir. A saída do trigger é `auth.uid()` nula, que é como a
-- edge function chega — e sem esta asserção, alguém tirando essa saída por achar
-- que é frouxidão deixaria a suíte inteira verde enquanto conectar uma página do
-- Facebook volta a ser impossível. Foi o defeito que esta leva veio consertar.
select lives_ok(
  $$ insert into public.mkt_social_accounts (tenant_id, platform, account_name, page_id)
     select a, 'facebook'::public.social_platform, 'Pagina conectada pelo OAuth', 'pagina-nova' from f $$,
  'a pagina conectada pela chave de servico entra'
);

select tests.clear_authentication();
select tests.authenticate_as('gestorb@la.test');

select is(
  (select count(*)::int from public.crm_lead_ads_raw) +
  (select count(*)::int from public.crm_lead_ads_forms) +
  (select count(*)::int from public.crm_deals),
  0,
  'a outra empresa nao ve lead, formulario nem negocio desta'
);

-- `crm_lead_ads_aplicar` é `security definer` e executável por quem está logado.
-- Sem conferir o tenant, qualquer pessoa com o id de um lead alheio tirava
-- aquele lead da fila da outra empresa e plantava uma mensagem de erro na tela
-- dela. A recusa sai pela **mesma porta** do "não encontrado": distinguir as
-- duas deixaria descobrir, um id por vez, o que existe na casa do vizinho.
select throws_ok(
  $$ select public.crm_lead_ads_aplicar((select id from vazio)) $$,
  'P0002',
  'lead nao encontrado',
  'ninguem alcanca o lead de outra empresa, nem para mexer no estado dele'
);
select tests.clear_authentication();
-- Conferido já fora da sessão do intruso: a linha é de outra empresa, e sob o
-- RLS dele ela nem aparece — a asserção diria "nulo" por ser invisível, não por
-- estar intacta.
select is(
  (select status from public.crm_lead_ads_raw where id = (select id from vazio)),
  'erro',
  'e o lead da outra empresa continua como estava'
);

select * from finish();
rollback;
