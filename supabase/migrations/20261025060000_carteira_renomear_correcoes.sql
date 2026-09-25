-- Frente 7d — correção achada ao rodar a suíte pgTAP da própria frente
-- (comercial_carteira_renomear.test.sql) contra o test-helpoint antes do
-- commit.
--
-- `com_renomear_carteira` (migration 20261025050000) era `security
-- invoker` e o plano manda checar UMA permissão só — `metas.definir` (ou
-- admin) — antes de tocar nas três tabelas. Mas a policy de UPDATE de
-- `com_carteira_membros` (migration 20261017010000) exige `carteiras.gerir`,
-- não `metas.definir` — são permissões diferentes. Com `security invoker`,
-- um usuário com `metas.definir` e sem `carteiras.gerir` passava pela
-- checagem explícita do passo 1, renomeava `metas_carteira` e `com_metas`
-- (cujas policies aceitam `metas.definir`), e o UPDATE de `com_carteira_
-- membros` era filtrado pela RLS em SILÊNCIO — regra 12 do pgTAP, a mesma
-- razão de o passo 1 existir. Resultado: rename parcial, exatamente o
-- "metade renomeada é pior que nada" que o plano pede para nunca acontecer.
-- Provado rodando a suíte: os testes 7 e 8 (linhas de com_carteira_membros)
-- davam "not ok" com a função ainda invoker.
--
-- A correção segue o desenho do plano ao pé da letra: UMA checagem cobre a
-- operação inteira, então a função vira `security definer` (mesmo padrão de
-- `tenant_set_config`/`notify_on_meta_definida` neste repositório — checagem
-- de permissão explícita dentro, escrita nas tabelas sem depender da RLS
-- individual de cada uma). Os filtros `tenant_id = v_tenant_id` explícitos
-- em cada UPDATE/INSERT continuam sendo a barreira de isolamento entre
-- empresas — nunca a RLS da tabela, que o definer já não atravessa mais.
create or replace function public.com_renomear_carteira(p_de text, p_para text, p_lembrar boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_de text;
  v_para text;
  v_linhas_metas_carteira int;
  v_linhas_com_metas int;
  v_linhas_com_carteira_membros int;
begin
  if v_tenant_id is null then
    raise exception 'usuário sem empresa' using errcode = '42501';
  end if;
  if not (public.is_admin_or_higher(auth.uid())
          or public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir')) then
    raise exception 'sem permissão para renomear carteira — falta metas.definir' using errcode = '42501';
  end if;

  v_de := public.normalizar_nome_carteira(p_de);
  v_para := public.normalizar_nome_carteira(p_para);

  if v_de = '' or v_para = '' then
    raise exception 'nome de carteira não pode ser vazio' using errcode = '22023';
  end if;
  if v_de = v_para then
    return jsonb_build_object('de', v_de, 'para', v_para,
      'linhas_metas_carteira', 0, 'linhas_com_metas', 0, 'linhas_com_carteira_membros', 0);
  end if;

  if exists (
    select 1 from public.metas_carteira
     where tenant_id = v_tenant_id and public.normalizar_nome_carteira(carteira) = v_para
  ) or exists (
    select 1 from public.com_metas
     where tenant_id = v_tenant_id and carteira is not null and public.normalizar_nome_carteira(carteira) = v_para
  ) or exists (
    select 1 from public.com_carteira_membros
     where tenant_id = v_tenant_id and public.normalizar_nome_carteira(carteira) = v_para
  ) then
    raise exception 'já existe uma carteira "%" — renomear fundiria as duas, e isto não é uma fusão', v_para
      using errcode = '23505';
  end if;

  update public.metas_carteira
     set carteira = v_para
   where tenant_id = v_tenant_id and public.normalizar_nome_carteira(carteira) = v_de;
  get diagnostics v_linhas_metas_carteira = row_count;

  update public.com_metas
     set carteira = v_para
   where tenant_id = v_tenant_id and carteira is not null and public.normalizar_nome_carteira(carteira) = v_de;
  get diagnostics v_linhas_com_metas = row_count;

  update public.com_carteira_membros
     set carteira = v_para
   where tenant_id = v_tenant_id and public.normalizar_nome_carteira(carteira) = v_de;
  get diagnostics v_linhas_com_carteira_membros = row_count;

  if p_lembrar then
    insert into public.com_carteira_renomeacoes (tenant_id, de, para)
    values (v_tenant_id, v_de, v_para)
    on conflict (tenant_id, de) do update
      set para = excluded.para, created_at = now(), created_by = auth.uid();

    update public.com_carteira_renomeacoes
       set para = v_para
     where tenant_id = v_tenant_id and para = v_de and de <> v_para;
  end if;

  return jsonb_build_object('de', v_de, 'para', v_para,
    'linhas_metas_carteira', v_linhas_metas_carteira,
    'linhas_com_metas', v_linhas_com_metas,
    'linhas_com_carteira_membros', v_linhas_com_carteira_membros);
end;
$$;

grant execute on function public.com_renomear_carteira(text, text, boolean) to authenticated;
