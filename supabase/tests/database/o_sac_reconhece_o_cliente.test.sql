-- O SAC RECONHECE QUEM JÁ É CLIENTE (migration 20261109020000)
--
-- Pedido do dono em 2026-09-27: um cadastro só, não dois. E a decisão dele de que a
-- mesma pessoa pode ser cliente de duas empresas.
--
-- A ASSERÇÃO QUE JUSTIFICA A SUÍTE É A 5: **acertar o CNPJ não revela nada.** CNPJ é
-- público — se bastasse acertá-lo, qualquer pessoa colheria razão social, telefone e
-- endereço da base digitando CNPJs na tela pública de cadastro, um por um, sem se
-- cadastrar. Testar só o caminho felizesconderia exatamente o defeito que a função
-- existe para não ter.
--
-- Regra 11 do pgTAP: os inserts de `customer_profiles` levam `returning id`, como o
-- PostgREST faz — é o que faz a policy de SELECT ser avaliada já no insert.
begin;
\ir _helpers.psql

select plan(11);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-sacrec', 'SAC Reconhece', false) as a,
       tests.create_tenant('pgtap-sacout', 'SAC Outra', false)     as b;

-- O cliente do Comercial: tem documento e e-mail.
insert into public.com_clientes (tenant_id, codigo, razao_social, documento, email, ativo, origem)
values ((select a from f), 'C-1', 'CLIENTE CONHECIDO LTDA', '08319138000160', 'contato@conhecido.test', true, 'cadastro');

-- E um sem e-mail nenhum, para o caso de não haver com o que comparar.
insert into public.com_clientes (tenant_id, codigo, razao_social, documento, ativo, origem)
values ((select a from f), 'C-2', 'CLIENTE SEM EMAIL LTDA', '11222333000181', true, 'cadastro');

-- ── 1. A mesma pessoa em duas empresas ───────────────────────────────────────
-- Era `unique (user_id)`: quem se cadastrava na segunda empresa levava erro de chave
-- duplicada e ficava logado na primeira.
create temporary table c on commit drop as
select tests.create_customer('pessoa@duas.test', (select a from f)) as pessoa;

select lives_ok(
  $$ insert into public.customer_profiles (user_id, tenant_id, full_name, email)
     select pessoa, (select b from f), 'Pessoa Nas Duas', 'pessoa@duas.test' from c
     returning id $$,
  'a mesma pessoa pode ser cliente de duas empresas'
);

select is(
  (select count(*)::int from public.customer_profiles cp
     join c on c.pessoa = cp.user_id),
  2,
  'e fica com um cadastro em cada'
);

-- ── 2. Vínculo confirmado sem cliente é estado impossível ────────────────────
select throws_ok(
  $$ update public.customer_profiles set vinculo_confirmado = true
      where email = 'pessoa@duas.test' $$,
  '23514',
  null,
  'nao da para confirmar vinculo sem apontar para um cliente'
);

-- ── 3. E-mail que JÁ constava no cliente: liga e preenche ────────────────────
create temporary table c2 on commit drop as
select tests.create_customer('contato@conhecido.test', (select a from f)) as dono_do_email;

update public.customer_profiles
   set cnpj = '08319138000160'
 where user_id = (select dono_do_email from c2);

select tests.authenticate_as('contato@conhecido.test');

select is(
  (public.sac_vincular_ao_cliente() ->> 'situacao'),
  'ligado',
  'e-mail que ja constava no cadastro do cliente liga na hora'
);

select tests.clear_authentication();

select is(
  (select razao_social from public.customer_profiles where user_id = (select dono_do_email from c2)),
  'CLIENTE CONHECIDO LTDA',
  'e a razao social do cliente entra no cadastro do SAC'
);

-- ── 4. A ASSERÇÃO QUE IMPORTA: acertar o CNPJ não revela nada ────────────────
create temporary table c3 on commit drop as
select tests.create_customer('curioso@qualquer.test', (select a from f)) as curioso;

update public.customer_profiles
   set cnpj = '08319138000160'   -- o CNPJ do cliente, que é público
 where user_id = (select curioso from c3);

select tests.authenticate_as('curioso@qualquer.test');

select is(
  (public.sac_vincular_ao_cliente() ->> 'situacao'),
  'pendente',
  'acertar o CNPJ com e-mail de fora NAO liga: fica pendente'
);

select ok(
  (public.sac_vincular_ao_cliente() -> 'razao_social') is null,
  'e a resposta NAO traz a razao social do cliente — nada e revelado'
);

select tests.clear_authentication();

select ok(
  (select not vinculo_confirmado and com_cliente_codigo = 'C-1'
     from public.customer_profiles where user_id = (select curioso from c3)),
  'o pedido fica registrado, sem confirmacao, para quem atende decidir'
);

select ok(
  (select razao_social is null
     from public.customer_profiles where user_id = (select curioso from c3)),
  'e o cadastro dele continua sem nada do cliente'
);

-- ── 5. Cliente sem e-mail nunca liga sozinho ─────────────────────────────────
-- Sem e-mail no cadastro do cliente não há com o que comparar, e "não há com o que
-- comparar" não pode virar "então libera".
create temporary table c4 on commit drop as
select tests.create_customer('alguem@semmail.test', (select a from f)) as alguem;

update public.customer_profiles
   set cnpj = '11222333000181'
 where user_id = (select alguem from c4);

select tests.authenticate_as('alguem@semmail.test');
select is(
  (public.sac_vincular_ao_cliente() ->> 'situacao'),
  'pendente',
  'cliente sem e-mail cadastrado nao liga sozinho'
);
select tests.clear_authentication();

-- ── 6. Documento que não existe na base ──────────────────────────────────────
create temporary table c5 on commit drop as
select tests.create_customer('novo@ninguem.test', (select a from f)) as novo;

update public.customer_profiles
   set cnpj = '49932013000198'
 where user_id = (select novo from c5);

select tests.authenticate_as('novo@ninguem.test');
select is(
  (public.sac_vincular_ao_cliente() ->> 'situacao'),
  'sem_cliente',
  'documento que nao esta na base diz sem_cliente, sem erro'
);
select tests.clear_authentication();

select * from finish();
rollback;
