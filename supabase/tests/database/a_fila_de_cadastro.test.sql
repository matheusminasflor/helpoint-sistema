-- A FILA DE CADASTRO DE CLIENTE NOVO (migration 20261114030000, LEVA O parte 3)
--
-- O caminho inteiro, como acontece: a vendedora pede → o gestor aprova → o chamado nasce → quem
-- cadastrou no Forteplus aplica → o cliente existe, na carteira de quem pediu.
--
--   2 e 3 — a vendedora não se aprova: nem pela função, nem escrevendo `decidido_por` direto na
--           tabela (a policy diz quais LINHAS ela edita; o GRANT de coluna diz quais CAMPOS);
--   5     — sem destino configurado, aprovar é recusado. Destino é configuração, nunca um
--           chamado jogado num lugar adivinhado;
--   6     — aprovar cria EXATAMENTE UM chamado, na mesma transação. Em Compras chamado e pedido
--           nascem em duas chamadas do navegador; aqui não há como sobrar chamado órfão;
--   7 e 8 — aplica quem está com o chamado, sem precisar do módulo Comercial — e o cliente nasce
--           na carteira da vendedora que pediu, com o chamado fechado.
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-fila', 'Fila de Cadastro', false) as a;

create temporary table u on commit drop as
select tests.create_user('ana@fila.test',   (select a from f)) as ana,
       tests.create_user('chefe@fila.test', (select a from f)) as chefe,
       tests.create_user('ti@fila.test',    (select a from f)) as tec;

select tests.grant_module((select ana from u),   (select a from f), 'comercial');
select tests.grant_module((select chefe from u), (select a from f), 'comercial');
select tests.grant_role((select chefe from u), 'admin');

insert into public.com_carteira_membros (tenant_id, user_id, carteira)
values ((select a from f), (select ana from u), 'NORTE');

-- Um cliente que já existe, para o aviso de duplicado.
insert into public.com_clientes (tenant_id, codigo, razao_social, documento, ativo, origem)
values ((select a from f), 'C001', 'CLIENTE ANTIGO', '11222333000181', true, 'cadastro');

-- A categoria para onde o chamado vai — ainda NÃO configurada como destino.
create temporary table cat on commit drop as
with nova as (
  insert into public.ti_categories (tenant_id, module, name)
  select a, 'tickets', 'Forteplus' from f
  returning id
)
select id from nova;

create temporary table sol (id uuid) on commit drop;
grant select on f, u, cat to authenticated;
grant insert, select on sol to authenticated;

-- ── A vendedora pede ──────────────────────────────────────────────────────────
select tests.authenticate_as('ana@fila.test');

-- 1. Pede, como a tela pede (com `returning`, lição 11).
select lives_ok($$
  with nova as (
    insert into public.com_solicitacoes_cadastro (razao_social, documento, uf, cidade, prioridade)
    values ('NOVO CLIENTE LTDA', '33555888000188', 'MG', 'Belo Horizonte', 'alta')
    returning id
  )
  insert into sol select id from nova
$$, 'a vendedora pede o cadastro de um cliente novo');

-- 2. Não se aprova pela função.
select throws_ok($$
  select public.com_decidir_solicitacao_cadastro((select id from sol), 'aprovado', null)
$$, '42501', null,
  'a vendedora nao aprova o proprio pedido');

-- 3. Nem escrevendo a decisão direto na tabela.
select throws_ok($$
  update public.com_solicitacoes_cadastro set decidido_por = auth.uid() where id = (select id from sol)
$$, '42501', null,
  'a vendedora nao escreve decidido_por na tabela: o GRANT de coluna nao deixa');

-- 4. O CNPJ que já é de alguém é reconhecido, mesmo fora da carteira dela.
select is(
  (select codigo from public.com_documento_ja_cadastrado('11.222.333/0001-81')),
  'C001',
  'o CNPJ ja cadastrado e reconhecido e aponta o cliente'
);
select tests.clear_authentication();

-- ── O gestor decide ───────────────────────────────────────────────────────────
select tests.authenticate_as('chefe@fila.test');

-- 5. Sem destino configurado, não aprova.
select throws_ok($$
  select public.com_decidir_solicitacao_cadastro((select id from sol), 'aprovado', null)
$$, '22023', null,
  'sem destino configurado para o chamado, aprovar e recusado');
select tests.clear_authentication();

update public.tenants
   set settings = coalesce(settings, '{}'::jsonb)
       || jsonb_build_object('comercial', jsonb_build_object('cadastroCategoriaId', (select id from cat)))
 where id = (select a from f);

select tests.authenticate_as('chefe@fila.test');
select public.com_decidir_solicitacao_cadastro((select id from sol), 'aprovado', 'ok, pode cadastrar');

-- 6. Exatamente um chamado, e ele está ligado ao pedido.
select ok(
  (select count(*) = 1 from public.tickets
    where tenant_id = (select a from f) and title = 'Cadastro de cliente: NOVO CLIENTE LTDA')
  and (select ticket_id is not null and status = 'aprovado' from public.com_solicitacoes_cadastro where id = (select id from sol)),
  'aprovar abre exatamente um chamado, ligado ao pedido, na mesma transacao'
);
select tests.clear_authentication();

-- ── Quem cadastra no Forteplus aplica ─────────────────────────────────────────
-- 7. Sem estar com o chamado, não aplica.
select tests.authenticate_as('ti@fila.test');
select throws_ok($$
  select public.com_aplicar_solicitacao_cadastro((select id from sol), 'C900')
$$, '42501', null,
  'quem nao esta com o chamado nao aplica o cadastro');
select tests.clear_authentication();

update public.tickets set assigned_to = (select tec from u)
 where id = (select ticket_id from public.com_solicitacoes_cadastro where id = (select id from sol));

-- 8. Com o chamado atribuído a ele, aplica — sem ter o módulo Comercial.
select tests.authenticate_as('ti@fila.test');
select lives_ok($$
  select public.com_aplicar_solicitacao_cadastro((select id from sol), 'C900')
$$, 'quem esta com o chamado aplica, informando o codigo do Forteplus, sem precisar do Comercial');
select tests.clear_authentication();

-- 9. O cliente nasceu na carteira de quem pediu; o pedido está aplicado; o chamado, resolvido.
select ok(
  (select carteira = 'NORTE' and documento = '33555888000188'
     from public.com_clientes where tenant_id = (select a from f) and codigo = 'C900')
  and (select status = 'aplicado' and cliente_codigo = 'C900' from public.com_solicitacoes_cadastro where id = (select id from sol))
  and (select t.status = 'resolved' from public.tickets t
        join public.com_solicitacoes_cadastro s on s.ticket_id = t.id where s.id = (select id from sol)),
  'o cliente nasce na carteira da vendedora que pediu, e o chamado fecha junto'
);

select * from finish();
rollback;
