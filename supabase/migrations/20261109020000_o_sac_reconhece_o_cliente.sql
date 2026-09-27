-- O SAC reconhece quem já é cliente da base — e a mesma pessoa pode ser cliente de
-- mais de uma empresa.
--
-- PEDIDO DO DONO em 2026-09-27: *"a ideia é que o SAC é onde nosso cliente da nossa
-- base faça um SAC, porém ele cadastrando uma conta teríamos 2 bancos de dados de
-- cadastros desnecessário; a ideia é unificar isso — se o cliente cadastrou no SAC e
-- ele já tem seus dados registrados no nosso sistema, já puxar automaticamente."*
-- E, na mesma conversa: *"a pessoa pode ser cliente de duas empresas sim."*
--
-- ── 1. A MESMA PESSOA EM DUAS EMPRESAS ───────────────────────────────────────
--
-- `customer_profiles` tinha `unique (user_id)`: um login, um perfil, ponto. Quem se
-- cadastrasse numa segunda empresa levava um erro de chave duplicada — e **ficava
-- logado na empresa antiga**, porque a sessão abria antes do insert falhar. A tela
-- dizia "Erro ao salvar cadastro" e a pessoa não entendia por quê.
--
-- Vira `unique (user_id, tenant_id)`. Nenhuma FK dependia da chave antiga (conferido
-- em `pg_constraint`: `crm_contacts` e `training_enrollments` apontam para `id`).
--
-- ── 2. O VÍNCULO COM O CLIENTE DO COMERCIAL ──────────────────────────────────
--
-- Duas colunas novas, e a segunda é a que fecha a brecha:
--
--   `com_cliente_codigo`   — qual cliente do Comercial este cadastro diz ser;
--   `vinculo_confirmado`   — se isso foi **provado**, e não só afirmado.
--
-- A chave estrangeira é **composta com `tenant_id`** (lição da leva I): sem isso o
-- cadastro de uma empresa poderia apontar para o cliente de outra, que é como a conta
-- a pagar de uma empresa nasceu com o fornecedor de outra em 2026-10.
--
-- ── 3. POR QUE O VÍNCULO NÃO BASTA ACERTAR O CNPJ ────────────────────────────
--
-- CNPJ é público. Se o sistema devolvesse razão social, telefone e endereço a quem
-- acertasse o CNPJ na tela pública de cadastro, **qualquer pessoa colheria a base de
-- clientes digitando CNPJs**, um por um, sem se cadastrar. Não é hipótese: é o que a
-- função faria se fosse escrita do jeito óbvio.
--
-- O cadastro do SAC **já confirma o e-mail** por código de uso único
-- (`send-sac-otp` / `verify-sac-otp`, e o dono decidiu em 2026-09-27 manter o acesso
-- sem senha, com código a cada entrada). Então o vínculo se apoia nisso:
--
--   e-mail confirmado == e-mail no cadastro do cliente  → liga e preenche NA HORA;
--   e-mail diferente ou cliente sem e-mail              → registra o pedido,
--                                                          NÃO preenche nada, e quem
--                                                          atende confirma uma vez.
--
-- `sac_vincular_ao_cliente` nunca devolve dado do cliente quando o vínculo não está
-- confirmado — devolve só a situação. É o que a torna segura de expor a `anon`…
-- que, de todo modo, não a alcança (regra 14, revoke no fim).
--
-- ── 4. O QUE O VÍNCULO PREENCHE, E O QUE ELE NÃO TOCA ────────────────────────
--
--   perfil ← cliente: `razao_social`, quando o perfil está sem;
--   cliente ← perfil: `telefone` e `email`, quando o cliente está sem.
--
-- **Nunca sobrescreve** (decisão da leva G, aplicada aqui: o cliente completa o que
-- falta, não apaga o que a empresa cadastrou).
--
-- **O endereço fica de fora, de propósito.** `com_clientes.endereco` é UM texto;
-- `customer_profiles` tem sete campos (CEP, rua, número, complemento, bairro, cidade,
-- UF). Juntar os sete num texto perde a estrutura; quebrar um texto em sete **inventa**
-- estrutura — e endereço mal quebrado é entrega no lugar errado. Quando alguém
-- precisar disso, é leva própria: o endereço do Comercial passa a ter os mesmos sete
-- campos, e aí a cópia é campo a campo.

-- ── 1 ────────────────────────────────────────────────────────────────────────
alter table public.customer_profiles drop constraint if exists customer_profiles_user_id_key;
alter table public.customer_profiles add constraint customer_profiles_user_tenant_key
  unique (user_id, tenant_id);

-- ── 2 ────────────────────────────────────────────────────────────────────────
alter table public.customer_profiles
  add column if not exists com_cliente_codigo text,
  add column if not exists vinculo_confirmado boolean not null default false,
  add column if not exists vinculo_pedido_em timestamptz;

-- Sem `on delete`: o padrão (NO ACTION) recusaria apagar um cliente do Comercial que
-- tem cadastro de SAC ligado — e isso é o certo, porque apagar o cliente deixaria o
-- chamado do SAC sem a quem pertencer. `on delete set null (com_cliente_codigo)`
-- seria a alternativa, e exige a sintaxe de lista de coluna do PostgreSQL 15+ (a
-- forma sem lista tentaria anular `tenant_id`, que é NOT NULL). Fica de fora porque
-- `com_clientes` **não tem policy de DELETE**: ninguém apaga cliente pela API, então
-- a escolha nunca é exercida, e depender de versão do Postgres por um caminho morto
-- é o "suspensório apertando o cinto" que a leva L já ensinou.
alter table public.customer_profiles drop constraint if exists customer_profiles_com_cliente_fkey;
alter table public.customer_profiles add constraint customer_profiles_com_cliente_fkey
  foreign key (tenant_id, com_cliente_codigo)
  references public.com_clientes (tenant_id, codigo);

-- Confirmado exige ter a quem: vínculo confirmado sem cliente é estado impossível.
alter table public.customer_profiles drop constraint if exists customer_profiles_vinculo_coerente;
alter table public.customer_profiles add constraint customer_profiles_vinculo_coerente
  check (not vinculo_confirmado or com_cliente_codigo is not null);

comment on column public.customer_profiles.com_cliente_codigo is
  'Qual cliente do Comercial este cadastro de SAC diz ser. Afirmado; ver vinculo_confirmado.';
comment on column public.customer_profiles.vinculo_confirmado is
  'O vinculo foi PROVADO (e-mail confirmado que ja constava no cadastro do cliente, ou confirmacao de quem atende). Sem isto, nenhum dado do cliente e revelado.';

-- ── 3 ────────────────────────────────────────────────────────────────────────
create or replace function public.sac_vincular_ao_cliente()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_perfil public.customer_profiles;
  v_documento text;
  v_cliente public.com_clientes;
begin
  select * into v_perfil
    from public.customer_profiles
   where user_id = auth.uid()
   limit 1;

  if v_perfil.id is null then
    return jsonb_build_object('situacao', 'sem_cadastro');
  end if;

  -- O documento que a pessoa informou, só dígitos. `cnpj` primeiro porque é o campo
  -- que a tela de cadastro preenche; `document` é o mesmo dado em cadastro antigo.
  v_documento := regexp_replace(coalesce(nullif(v_perfil.cnpj, ''), nullif(v_perfil.document, ''), ''), '\D', '', 'g');
  if v_documento = '' then
    return jsonb_build_object('situacao', 'sem_documento');
  end if;

  select * into v_cliente
    from public.com_clientes
   where tenant_id = v_perfil.tenant_id
     and documento = v_documento
   limit 1;

  if v_cliente.id is null then
    return jsonb_build_object('situacao', 'sem_cliente');
  end if;

  -- O e-mail confirmado bate com o que a empresa já tinha? Então quem cadastrou
  -- provou ter acesso a um endereço que só aquele cliente usa.
  if v_cliente.email is not null and lower(trim(v_cliente.email)) = lower(trim(v_perfil.email)) then
    update public.customer_profiles
       set com_cliente_codigo = v_cliente.codigo,
           vinculo_confirmado = true,
           vinculo_pedido_em  = coalesce(vinculo_pedido_em, now()),
           razao_social       = coalesce(razao_social, v_cliente.razao_social),
           phone              = coalesce(phone, v_cliente.telefone)
     where id = v_perfil.id;

    update public.com_clientes
       set telefone = coalesce(telefone, v_perfil.phone),
           email    = coalesce(email, v_perfil.email)
     where id = v_cliente.id;

    return jsonb_build_object('situacao', 'ligado', 'razao_social', v_cliente.razao_social);
  end if;

  -- Não provou. Registra o pedido e NÃO devolve nada do cliente.
  update public.customer_profiles
     set com_cliente_codigo = v_cliente.codigo,
         vinculo_confirmado = false,
         vinculo_pedido_em  = coalesce(vinculo_pedido_em, now())
   where id = v_perfil.id;

  return jsonb_build_object('situacao', 'pendente');
end;
$$;

comment on function public.sac_vincular_ao_cliente() is
  'Liga o cadastro de SAC de quem chama ao cliente do Comercial de mesmo documento. So preenche e so revela quando o e-mail confirmado ja constava no cadastro do cliente; senao registra o pedido para quem atende confirmar. 2026-09-27.';

-- A confirmação por quem atende, para o caso do e-mail novo.
create or replace function public.sac_confirmar_vinculo(p_perfil_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_perfil public.customer_profiles;
  v_cliente public.com_clientes;
begin
  if not public.posso_no_sac(auth.uid()) then
    raise exception 'so quem cuida do SAC confirma vinculo de cliente'
      using errcode = '42501';
  end if;

  select * into v_perfil
    from public.customer_profiles
   where id = p_perfil_id
     and tenant_id = public.get_user_tenant_id();

  if v_perfil.id is null then
    raise exception 'cadastro de cliente nao encontrado nesta empresa' using errcode = 'P0002';
  end if;
  if v_perfil.com_cliente_codigo is null then
    raise exception 'este cadastro nao aponta para nenhum cliente do Comercial' using errcode = '23514';
  end if;

  select * into v_cliente
    from public.com_clientes
   where tenant_id = v_perfil.tenant_id
     and codigo = v_perfil.com_cliente_codigo;

  update public.customer_profiles
     set vinculo_confirmado = true,
         razao_social = coalesce(razao_social, v_cliente.razao_social),
         phone        = coalesce(phone, v_cliente.telefone)
   where id = v_perfil.id;

  update public.com_clientes
     set telefone = coalesce(telefone, v_perfil.phone),
         email    = coalesce(email, v_perfil.email)
   where id = v_cliente.id;

  return jsonb_build_object('situacao', 'ligado', 'cliente', v_cliente.razao_social);
end;
$$;

comment on function public.sac_confirmar_vinculo(uuid) is
  'Quem cuida do SAC confirma que o cadastro e daquele cliente do Comercial. Usado quando o e-mail do cadastro nao constava no cliente. 2026-09-27.';

-- ── Regra 14 do pgTAP: as duas NASCEM agora, então herdam `execute` para PUBLIC
-- (e `anon` é público). `security definer` alcançável por `anon` é porta aberta.
revoke all on function public.sac_vincular_ao_cliente() from public, anon;
revoke all on function public.sac_confirmar_vinculo(uuid) from public, anon;
grant execute on function public.sac_vincular_ao_cliente() to authenticated;
grant execute on function public.sac_confirmar_vinculo(uuid) to authenticated;
