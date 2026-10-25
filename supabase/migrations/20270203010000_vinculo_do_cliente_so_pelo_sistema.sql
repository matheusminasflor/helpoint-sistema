-- O vínculo do cadastro de cliente com o cliente do Comercial só muda pelo sistema.
--
-- Achado de 2026-10-25, antes do Portal do Distribuidor (etapa 6), que se apoia nesse vínculo para mostrar ao
-- distribuidor as próprias notas, o estoque e a tabela de preço: as policies "Customers can insert/update their
-- own profile" só exigem `user_id = auth.uid()`, e `customer_profiles_guard_cliente` congelava identidade, empresa
-- e bloqueio — mas NÃO `com_cliente_codigo` nem `vinculo_confirmado`. Um cliente logado conseguia, pela API,
-- gravar `vinculo_confirmado = true` apontando para qualquer cliente da empresa (a FK composta só exige que o
-- código exista no tenant), e o vínculo "provado" passaria a valer sem prova nenhuma.
--
-- 1. UPDATE: as três colunas do vínculo entram nas congeladas para quem não é staff. A única escrita legítima de
--    cliente é `sac_vincular_ao_cliente`, que agora se identifica pela marca de transação
--    `helpoint.vinculo_pelo_sistema` (o PostgREST não deixa o cliente escrever GUC além de `request.*`).
--    `auth.uid()` nulo é o sistema (service_role, o runner do pgTAP) e continua passando nessas colunas.
-- 2. INSERT: o cadastro nasce sem vínculo e desbloqueado quando quem insere é o próprio cliente; o vínculo vem
--    depois, por `sac_vincular_ao_cliente` ou pela confirmação de quem atende (`sac_confirmar_vinculo`).

create or replace function public.customer_profiles_guard_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_staff boolean;
begin
  -- Staff do tenant (a policy "Staff can update customers of their tenant" já
  -- exige manager ou acima) passa direto: é ele quem bloqueia, corrige e-mail
  -- e move cadastro.
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.tenant_id = old.tenant_id
  ) into v_is_staff;

  if v_is_staff then
    return new;
  end if;

  -- Para o cliente, estas colunas são congeladas. Comparação explícita, coluna
  -- a coluna, em vez de "tudo menos as permitidas": aqui a lista de PROIBIDAS
  -- é a curta, e uma coluna nova de cadastro (endereço, WhatsApp...) deve
  -- nascer editável sem mexer neste trigger.
  if new.id          is distinct from old.id
  or new.user_id     is distinct from old.user_id
  or new.tenant_id   is distinct from old.tenant_id
  or new.email       is distinct from old.email
  or new.is_blocked  is distinct from old.is_blocked
  or new.blocked_at  is distinct from old.blocked_at
  or new.blocked_by  is distinct from old.blocked_by
  or new.created_at  is distinct from old.created_at
  then
    raise exception 'cliente nao pode alterar identidade, empresa ou bloqueio do proprio cadastro'
      using errcode = '42501';
  end if;

  -- O vínculo com o cliente do Comercial: só por `sac_vincular_ao_cliente` (a marca) ou pelo sistema.
  if auth.uid() is not null
     and coalesce(current_setting('helpoint.vinculo_pelo_sistema', true), '') <> '1'
     and (new.com_cliente_codigo is distinct from old.com_cliente_codigo
       or new.vinculo_confirmado is distinct from old.vinculo_confirmado
       or new.vinculo_pedido_em  is distinct from old.vinculo_pedido_em)
  then
    raise exception 'o vinculo com o cliente do Comercial so muda pelo sistema'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.customer_profiles_nasce_sem_vinculo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Staff da empresa cadastrando cliente pode já nascer ligado; o próprio cliente, não.
  if auth.uid() is not null and not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.tenant_id = new.tenant_id
  ) then
    new.com_cliente_codigo := null;
    new.vinculo_confirmado := false;
    new.vinculo_pedido_em  := null;
    new.is_blocked := false;
    new.blocked_at := null;
    new.blocked_by := null;
  end if;
  return new;
end;
$$;

revoke all on function public.customer_profiles_nasce_sem_vinculo() from public, anon;

drop trigger if exists customer_profiles_nasce_sem_vinculo on public.customer_profiles;
create trigger customer_profiles_nasce_sem_vinculo
  before insert on public.customer_profiles
  for each row execute function public.customer_profiles_nasce_sem_vinculo();

-- `create or replace` preserva a ACL (regra 14). Igual à de 20261109020000, mais a marca antes das escritas.
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

  -- A marca que `customer_profiles_guard_cliente` reconhece: só vale até o fim desta transação.
  perform set_config('helpoint.vinculo_pelo_sistema', '1', true);

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

    perform set_config('helpoint.vinculo_pelo_sistema', '', true);
    return jsonb_build_object('situacao', 'ligado', 'razao_social', v_cliente.razao_social);
  end if;

  -- Não provou. Registra o pedido e NÃO devolve nada do cliente.
  update public.customer_profiles
     set com_cliente_codigo = v_cliente.codigo,
         vinculo_confirmado = false,
         vinculo_pedido_em  = coalesce(vinculo_pedido_em, now())
   where id = v_perfil.id;

  perform set_config('helpoint.vinculo_pelo_sistema', '', true);
  return jsonb_build_object('situacao', 'pendente');
end;
$$;
