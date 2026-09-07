-- SAC: o cliente para de poder se mudar de empresa.
--
-- O QUE ESTAVA ABERTO
-- ───────────────────
-- Policy "Customers can update their own profile" em `customer_profiles`:
--     USING (user_id = auth.uid())   e   WITH CHECK nulo.
-- Quando o WITH CHECK é nulo o Postgres reaproveita o USING para checar a
-- linha nova — e `user_id = auth.uid()` continua verdadeiro depois de o
-- cliente trocar o próprio `tenant_id`. O grant de UPDATE cobre todas as
-- colunas, e nenhum trigger vigiava.
--
-- Como `get_customer_tenant_id()` lê exatamente essa coluna, o cliente que a
-- trocasse passaria a ler produtos, lotes, categorias e POPs "customer" de
-- OUTRA empresa, e a abrir SAC nela. Os IDs de tenant são públicos via
-- `get_sac_tenant_branding(slug)`. Para produto vendido a várias empresas
-- (ADR-005), isso é o item número um.
--
-- POR QUE TRIGGER, E NÃO POLICY
-- ─────────────────────────────
-- Policy libera a LINHA; não sabe distinguir coluna. O cliente precisa poder
-- editar telefone, endereço e completar o onboarding — então a linha tem de
-- continuar dele. O que não pode mudar é o punhado de colunas que define
-- QUEM ele é e A QUEM pertence. Isso é trabalho de trigger, e é o mesmo
-- desenho já usado em `sac_tickets_guard_cliente` e
-- `rh_payslips_guard_colaborador`.

create or replace function public.customer_profiles_guard_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
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

  return new;
end;
$$;

drop trigger if exists customer_profiles_guard_cliente on public.customer_profiles;

create trigger customer_profiles_guard_cliente
  before update on public.customer_profiles
  for each row
  execute function public.customer_profiles_guard_cliente();

-- E a policy ganha o WITH CHECK que faltava, para o próprio RLS dizer a mesma
-- coisa que o trigger sobre a linha: continua tendo de ser dele.
drop policy if exists "Customers can update their own profile" on public.customer_profiles;
create policy "Customers can update their own profile"
  on public.customer_profiles
  for update
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());
