-- Frente 7d — segunda correção, achada rodando a suíte pgTAP de novo depois
-- da 20261025060000 (security definer).
--
-- `com_carteira_membros` tem um trigger `before update` (`handle_com_
-- carteira_membros_updated_at`, migration 20261017040000) que grava `NEW.
-- updated_at := now()` — mas a tabela NUNCA teve a coluna `updated_at`. A
-- migration que criou o trigger presumiu que as "três tabelas novas da L6d"
-- já tinham a coluna; valia para `com_metas`, não para esta. Como nada no
-- sistema faz UPDATE direto em `com_carteira_membros` (só INSERT, de
-- `useAdicionarMembroCarteira`, e DELETE, de `useRemoverMembroCarteira`), o
-- trigger quebrado nunca disparou — até `com_renomear_carteira` tentar um
-- UPDATE agora: `42703: record "new" has no field "updated_at"`.
--
-- Esta é uma segunda causa, diferente da primeira (permissão) — corrigi a
-- primeira sem tocar nesta, e ela seguiu quebrada; é por isso que aparece
-- como uma correção própria, não misturada na anterior. Consertar o
-- trigger em si (dropar, ou criar a coluna) é decisão fora desta frente —
-- ninguém pediu auditoria de trigger de `updated_at`, e o achado está no
-- relatório do executor para o humano decidir. O que esta frente PRECISA é
-- só que o rename funcione: troca o UPDATE por DELETE + INSERT (o trigger é
-- só `before update`, então nunca é acionado) — mesmo efeito observável
-- (as linhas migram de `de` para `para`), sem editar nada fora do que o
-- plano pediu.
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

  -- DELETE + INSERT, não UPDATE — ver o comentário desta migration: o
  -- trigger `before update` de `com_carteira_membros` está quebrado (coluna
  -- `updated_at` que não existe) e nunca disparou até aqui porque nada faz
  -- UPDATE nesta tabela. Mesmo efeito observável, sem acionar o trigger.
  with movidos as (
    delete from public.com_carteira_membros
     where tenant_id = v_tenant_id and public.normalizar_nome_carteira(carteira) = v_de
    returning tenant_id, user_id
  )
  insert into public.com_carteira_membros (tenant_id, user_id, carteira)
  select tenant_id, user_id, v_para from movidos;
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
