-- SAIR DO PROJETO (dono, 2026-11-02; docs/especificacao-projetos.md › Sair do projeto). "Tem um projeto que me
-- atrelaram e eu não consigo sair."
--
--   · Quem foi chamado sai, com motivo obrigatório — mas SÓ se não tiver atividade aberta (pendente ou em andamento)
--     no projeto; as concluídas não impedem.
--   · Quem criou o projeto e o dono dele não saem (passam o comando antes).
--   · Ao sair: quem criou e o dono são avisados com o motivo; o gestor do setor de quem saiu também. Quem criou (ou o
--     dono) resolve a saída: CHAMA DE VOLTA ou ESCOLHE QUEM ASSUME o lugar — que entra na equipe e, se quem saiu era a
--     referência de um setor, vira a referência (o aviso de referência é o de sempre, `projeto_setor_chamado`).
--   · A saída fica registrada (quem, quando, motivo, como foi resolvida).

create table if not exists public.project_saidas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  user_id uuid not null,
  motivo text not null check (length(btrim(motivo)) >= 5),
  saiu_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid,
  resolucao text check (resolucao in ('voltou', 'substituido')),
  substituto_id uuid,
  constraint project_saidas_project_fkey foreign key (project_id, tenant_id)
    references public.projects (id, tenant_id) on delete cascade
);
create index if not exists project_saidas_projeto on public.project_saidas (project_id) where resolvido_em is null;

alter table public.project_saidas enable row level security;
revoke all on public.project_saidas from anon;
grant select on public.project_saidas to authenticated;
-- Lê quem saiu e quem comanda o projeto (criador ou dono). Gravar, só pelas funções abaixo.
create policy project_saidas_le on public.project_saidas for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (user_id = auth.uid()
              or exists (select 1 from public.projects p
                          where p.id = project_id and (p.owner_id = auth.uid() or p.created_by = auth.uid()))));

-- ─── Sair ────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.projeto_sair(p_project uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_eu uuid := auth.uid();
  v_proj record;
  v_abertas integer;
  v_nome text;
  v_saida uuid;
begin
  select id, tenant_id, name, owner_id, created_by into v_proj
    from public.projects where id = p_project and tenant_id = public.get_user_tenant_id() and not e_modelo;
  if v_proj.id is null or not exists (select 1 from public.project_members where project_id = p_project and user_id = v_eu) then
    raise exception 'Você não está neste projeto.' using errcode = '22023';
  end if;
  if v_eu in (v_proj.owner_id, v_proj.created_by) then
    raise exception 'Quem criou ou comanda o projeto não sai: passe o comando para outra pessoa antes.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escreva o motivo para sair.' using errcode = '22023';
  end if;
  select count(*) into v_abertas from public.tasks
   where project_id = p_project and user_id = v_eu and status <> 'completed' and percentual < 100;
  if v_abertas > 0 then
    raise exception 'Você tem % % neste projeto. Conclua, ou peça para passarem a outra pessoa, e então saia.',
      v_abertas, case when v_abertas = 1 then 'atividade aberta' else 'atividades abertas' end
      using errcode = '22023';
  end if;

  delete from public.project_members where project_id = p_project and user_id = v_eu;
  insert into public.project_saidas (tenant_id, project_id, user_id, motivo)
  values (v_proj.tenant_id, p_project, v_eu, btrim(p_motivo)) returning id into v_saida;

  select coalesce(full_name, email) into v_nome from public.profiles where id = v_eu;
  -- Quem comanda o projeto: o motivo e o pedido de decidir quem assume.
  -- Sem repetir: quem cria costuma ser também o dono (o teste pegou o aviso em dobro).
  perform public.notify_users(v_proj.tenant_id, array(select distinct x from unnest(array[v_proj.created_by, v_proj.owner_id]) x),
    'projeto_saida', 'project', p_project,
    coalesce(v_nome, 'Uma pessoa') || ' saiu do projeto ' || v_proj.name,
    'Motivo: ' || btrim(p_motivo) || '. Abra o projeto para chamar de volta ou escolher quem assume.', v_eu);
  -- O gestor do setor de quem saiu fica sabendo.
  perform public.notify_users(v_proj.tenant_id,
    array(select distinct g.user_id from public.user_access_profiles meu
            join public.user_access_profiles g on g.tenant_id = meu.tenant_id and g.department = meu.department
           where meu.user_id = v_eu and meu.tenant_id = v_proj.tenant_id
             and public.gestor_do_setor(g.user_id, g.department)
             and g.user_id is distinct from v_proj.created_by and g.user_id is distinct from v_proj.owner_id),
    'projeto_saida', 'project', p_project,
    coalesce(v_nome, 'Uma pessoa') || ' saiu do projeto ' || v_proj.name,
    'Motivo: ' || btrim(p_motivo) || '.', v_eu);
  return v_saida;
end;
$$;
revoke all on function public.projeto_sair(uuid, text) from public, anon;
grant execute on function public.projeto_sair(uuid, text) to authenticated;

-- ─── Resolver a saída: chamar de volta ou escolher quem assume ─────────────────────────────────────────
create or replace function public.projeto_resolver_saida(p_saida uuid, p_resolucao text, p_substituto uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_eu uuid := auth.uid();
  v_s record;
  v_proj record;
  v_quem uuid;
begin
  select * into v_s from public.project_saidas where id = p_saida and tenant_id = public.get_user_tenant_id();
  if v_s.id is null or v_s.resolvido_em is not null then
    raise exception 'Esta saída não existe ou já foi resolvida.' using errcode = '22023';
  end if;
  select id, tenant_id, name, owner_id, created_by into v_proj from public.projects where id = v_s.project_id;
  -- `is distinct from`, não `not in`: com o dono vazio, `not in` dá nulo e deixaria qualquer um passar.
  if v_eu is distinct from v_proj.owner_id and v_eu is distinct from v_proj.created_by then
    raise exception 'Só quem criou ou comanda o projeto resolve a saída.' using errcode = '42501';
  end if;
  if p_resolucao not in ('voltou', 'substituido') then
    raise exception 'Escolha chamar de volta ou quem assume.' using errcode = '22023';
  end if;
  if p_resolucao = 'substituido' and (p_substituto is null or p_substituto = v_s.user_id
     or not exists (select 1 from public.profiles where id = p_substituto and tenant_id = v_proj.tenant_id and coalesce(is_active, true))) then
    raise exception 'Escolha quem assume no lugar.' using errcode = '22023';
  end if;

  v_quem := case when p_resolucao = 'voltou' then v_s.user_id else p_substituto end;
  insert into public.project_members (tenant_id, project_id, user_id)
  values (v_proj.tenant_id, v_proj.id, v_quem) on conflict (project_id, user_id) do nothing;
  -- Quem assume herda a referência de setor que era de quem saiu (o gatilho de sempre avisa a nova referência).
  if p_resolucao = 'substituido' then
    update public.project_setores set referencia_id = p_substituto
     where project_id = v_proj.id and referencia_id = v_s.user_id;
  end if;
  update public.project_saidas
     set resolvido_em = now(), resolvido_por = v_eu, resolucao = p_resolucao, substituto_id = p_substituto
   where id = p_saida;

  perform public.notify_users(v_proj.tenant_id, array[v_quem], 'projeto_saida', 'project', v_proj.id,
    case when p_resolucao = 'voltou' then 'Você foi chamado de volta ao projeto ' || v_proj.name
         else 'Você entrou no projeto ' || v_proj.name end,
    case when p_resolucao = 'voltou' then 'Quem criou o projeto pediu que você volte.'
         else 'Você assume o lugar de quem saiu. Leia o briefing e as atividades.' end, v_eu);
end;
$$;
revoke all on function public.projeto_resolver_saida(uuid, text, uuid) from public, anon;
grant execute on function public.projeto_resolver_saida(uuid, text, uuid) to authenticated;
