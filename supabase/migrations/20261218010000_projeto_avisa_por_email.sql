-- PROJETO AVISA POR E-MAIL (dono, 2026-10-08): "quando um projeto [é] criado, as pessoas mencionadas
-- recebem e-mail e a Lyra avisa sobre o projeto, para que possam verificar e dar andamento".
--
-- Decisão (múltipla escolha): e-mail para a PESSOA ESCOLHIDA de cada setor (a referência) quando o projeto
-- nasce ou quando ela é trocada, e para quem RECEBE UMA ATIVIDADE. O gestor do setor continua só com o
-- aviso na tela ("Lyra avisa"). O "Lyra avisa" já lia estes avisos (LyraAvisa.tsx); faltava o e-mail.
--
-- Mesma fila do chamado (20261121020000): `notifications.email_sent = false` = há e-mail a mandar; o robô
-- `chamado-avisos-email` (cron de 1 min) passa a ler também `projeto_emails_pendentes`. Respeita a mesma
-- chave do perfil (`receber_email_chamados`). ponytail: uma chave só para os dois e-mails; se alguém
-- quiser desligar só o de projeto, a saída é uma segunda coluna no perfil.

-- ─── 1. Aviso que pede e-mail ────────────────────────────────────────────────────────────────────
-- O `notify_users` grava com `email_sent = true` (padrão: sem e-mail). Este grava com `false`, para uma
-- pessoa só, e nunca para quem fez a ação (escolher a si mesmo como referência não avisa ninguém).
create or replace function public.avisar_projeto_com_email(
  p_tenant uuid, p_user uuid, p_type public.notification_type, p_project uuid, p_title text, p_message text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
  select p_tenant, p_user, p_type, 'project', p_project, p_title, p_message, false
   where p_user is not null and p_user is distinct from auth.uid();
$$;
revoke all on function public.avisar_projeto_com_email(uuid, uuid, public.notification_type, uuid, text, text)
  from public, anon, authenticated;

-- ─── 2. Setor chamado: a referência recebe e-mail; os gestores, só o aviso ───────────────────────
create or replace function public.projeto_setor_chamado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_proj record;
begin
  select name, e_modelo into v_proj from public.projects where id = new.project_id;
  if v_proj.e_modelo then return null; end if;
  if new.referencia_id is not null then
    insert into public.project_members (tenant_id, project_id, user_id)
    values (new.tenant_id, new.project_id, new.referencia_id) on conflict (project_id, user_id) do nothing;
  end if;
  -- Trocar a referência avisa só a nova (é assim que a referência chega no projeto criado de um modelo:
  -- a cópia marca os setores sem ninguém e a tela grava a pessoa logo depois).
  if tg_op = 'UPDATE' then
    perform public.avisar_projeto_com_email(new.tenant_id, new.referencia_id, 'projeto_setor_chamado',
      new.project_id, 'Você é a referência do setor no projeto ' || v_proj.name,
      'Leia o briefing e planeje as atividades do setor.');
    return null;
  end if;
  perform public.avisar_projeto_com_email(new.tenant_id, new.referencia_id, 'projeto_setor_chamado',
    new.project_id, 'Seu setor foi chamado para o projeto ' || v_proj.name,
    'Leia o briefing e planeje as atividades do setor.');
  perform public.notify_users(new.tenant_id,
    array(select uap.user_id from public.user_access_profiles uap
           where uap.tenant_id = new.tenant_id and uap.department = new.setor
             and public.gestor_do_setor(uap.user_id, new.setor)
             and uap.user_id is distinct from new.referencia_id),
    'projeto_setor_chamado', 'project', new.project_id,
    'Seu setor foi chamado para o projeto ' || v_proj.name,
    'Leia o briefing e planeje as atividades do setor.',
    auth.uid());
  return null;
end;
$$;

-- ─── 3. Atividade para você: aviso com e-mail ────────────────────────────────────────────────────
create or replace function public.atividade_atribuida()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_proj record;
begin
  if new.project_id is null or new.user_id is null then return null; end if;
  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then return null; end if;
  select id, name, e_modelo, tenant_id into v_proj from public.projects where id = new.project_id;
  if v_proj.e_modelo then return null; end if;
  insert into public.project_members (tenant_id, project_id, user_id)
  values (new.tenant_id, new.project_id, new.user_id) on conflict (project_id, user_id) do nothing;
  perform public.avisar_projeto_com_email(new.tenant_id, new.user_id, 'projeto_atividade', new.project_id,
    'Projeto ' || v_proj.name || ': atividade para você',
    '"' || new.title || '"' || coalesce(' · termina em ' || to_char(new.termino, 'DD/MM'), ''));
  return null;
end;
$$;

-- ─── 4. A fila de e-mail do projeto ──────────────────────────────────────────────────────────────
-- O espelho de `chamado_emails_pendentes`: agrupa por pessoa + projeto (marcada referência em dois
-- setores do mesmo projeto = um e-mail), sai quando o aviso mais antigo do grupo tem `p_idade`.
-- Quem desligou o e-mail no perfil, está inativo ou sem e-mail tem a fila esvaziada; 24h desiste.
-- Marcar como enviado usa a `chamado_emails_enviados`, que é por id e não olha o tipo.
create or replace function public.projeto_emails_pendentes(p_limit int default 50, p_idade interval default '1 minute')
returns table (user_id uuid, email text, nome text, project_id uuid, project_name text,
               ids uuid[], titulos text[], mensagens text[])
language plpgsql security definer set search_path = public as $$
begin
  update public.notifications n set email_sent = true
   where n.email_sent = false and n.reference_type = 'project'
     and (n.created_at < now() - interval '24 hours'
          or exists (select 1 from public.profiles p where p.id = n.user_id
                      and (not p.receber_email_chamados or p.email is null or not coalesce(p.is_active, true))));

  return query
  select n.user_id, p.email, p.full_name, pr.id, pr.name,
         array_agg(n.id order by n.created_at), array_agg(n.title order by n.created_at),
         array_agg(coalesce(n.message, '') order by n.created_at)
    from public.notifications n
    join public.profiles p on p.id = n.user_id
    join public.projects pr on pr.id = n.reference_id
   where n.email_sent = false and n.reference_type = 'project'
   group by n.user_id, p.email, p.full_name, pr.id, pr.name
  having min(n.created_at) <= now() - p_idade
   order by min(n.created_at)
   limit p_limit;
end;
$$;
revoke all on function public.projeto_emails_pendentes(int, interval) from public, anon, authenticated;
grant execute on function public.projeto_emails_pendentes(int, interval) to service_role;
