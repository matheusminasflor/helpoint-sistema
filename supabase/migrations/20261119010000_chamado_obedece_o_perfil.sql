-- O CHAMADO OBEDECE O PERFIL DE ACESSO. 2026-10-01.
--
-- O QUE ESTAVA ERRADO. Todo setor tinha, no perfil de acesso, uma seção "Chamados" com caixinhas —
-- Atribuir, Transferir, Fechar, Reabrir, Excluir… — e nenhuma era lida: nem a tela nem o banco
-- perguntavam por `tickets.<ação>` (zero ocorrências de `tem_permissao(…, 'tickets', …)`). Quem
-- decidia era o cargo e o "estar atribuído". Desmarcar "Fechar" não impedia ninguém de fechar.
--
-- DECISÕES DO DONO (2026-10-01):
--   1. vale na tela E no banco;
--   2. as ações, iguais em todo setor: ver os chamados do setor, assumir, mudar status, resolver e
--      fechar, reabrir, transferir, mudar prioridade e prazo, nota interna, excluir;
--   3. padrão: Gestor tudo (menos configurar perfis de acesso); Operador ver, assumir, mudar status,
--      fechar, reabrir, nota interna; Somente leitura só ver. Dono e admin podem tudo;
--   4. estar atribuído NÃO dá poder: quem decide é o perfil;
--   5. Compras fica de fora — o chamado de Compras é a solicitação, com Aprovar/Executar próprios.

-- ── 1. A conta única ────────────────────────────────────────────────────────────────────────────
create or replace function public.pode_no_chamado(p_modulo text, p_acao text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select public.is_admin_or_higher(auth.uid())
      or public.tem_permissao(auth.uid(), coalesce(public.setor_do_modulo(p_modulo), 'ti'), 'tickets', p_acao);
$$;

comment on function public.pode_no_chamado(text, text) is
  'A pessoa logada pode <acao> num chamado do módulo <modulo>? Dono/admin sempre; o resto pelo perfil do setor do chamado (tickets.<acao>). O espelho na tela é usePodeNoChamado.';

revoke all on function public.pode_no_chamado(text, text) from public, anon;
grant execute on function public.pode_no_chamado(text, text) to authenticated;

-- ── 2. A guarda ─────────────────────────────────────────────────────────────────────────────────
-- Só a escrita da PESSOA passa por aqui. Escrita do sistema passa direto, por três portas:
--   * `pg_trigger_depth() > 1` — trigger dentro de trigger (automação inline, tarefa fecha chamado);
--   * `current_user <> 'authenticated'` — função SECURITY DEFINER chamada pela pessoa (a fila de
--     cadastro resolve o chamado, automação manual) e o service_role das edge functions;
--   * `auth.uid() is null` — cron.
-- SECURITY INVOKER de propósito: é o `current_user` de quem escreveu que separa pessoa de sistema.
create or replace function public.chamado_guarda_o_perfil()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_fechado constant text[] := array['resolved', 'closed', 'cancelled', 'rejected'];
  v_acoes text[] := array[]::text[];
  v_assumiu boolean := false;
  v_acao text;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.module <> 'compras' and not public.pode_no_chamado(old.module, 'delete') then
      raise exception 'Seu perfil de acesso não permite excluir este chamado.' using errcode = '42501';
    end if;
    return old;
  end if;

  if new.module = 'compras' then
    return new;
  end if;

  -- Quem abriu avalia (resolvido → fechado) ou reabre (resolvido → em andamento) o que lhe
  -- entregaram. É o painel de avaliação de "Meus chamados"; não é ação de equipe.
  if old.requester_id = auth.uid() and old.status = 'resolved'
     and new.status::text in ('closed', 'in_progress')
     and new.assigned_to is not distinct from old.assigned_to
     and new.priority is not distinct from old.priority
     and new.due_date is not distinct from old.due_date then
    return new;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    v_assumiu := old.assigned_to is null and new.assigned_to = auth.uid();
    v_acoes := v_acoes || (case when v_assumiu then 'assume' else 'transfer' end);
  end if;

  if new.status is distinct from old.status then
    if new.status::text = any (v_fechado) then
      v_acoes := v_acoes || 'close'::text;
    elsif old.status::text = any (v_fechado) then
      v_acoes := v_acoes || 'reopen'::text;
    -- Assumir já põe o chamado "em andamento": é o mesmo gesto, não pede "mudar status".
    elsif not (v_assumiu and old.status = 'open' and new.status = 'in_progress') then
      v_acoes := v_acoes || 'change_status'::text;
    end if;
  end if;

  if new.priority is distinct from old.priority or new.due_date is distinct from old.due_date then
    v_acoes := v_acoes || 'change_priority'::text;
  end if;

  foreach v_acao in array v_acoes loop
    if not public.pode_no_chamado(new.module, v_acao) then
      raise exception 'Seu perfil de acesso não permite % neste chamado.',
        case v_acao
          when 'assume' then 'assumir'
          when 'transfer' then 'transferir'
          when 'close' then 'resolver ou fechar'
          when 'reopen' then 'reabrir'
          when 'change_status' then 'mudar o status'
          when 'change_priority' then 'mudar a prioridade ou o prazo'
        end
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.chamado_guarda_o_perfil() from public, anon;

drop trigger if exists chamado_guarda_o_perfil on public.tickets;
create trigger chamado_guarda_o_perfil
  before update or delete on public.tickets
  for each row execute function public.chamado_guarda_o_perfil();

-- ── 3. A nota interna ───────────────────────────────────────────────────────────────────────────
-- ponytail: a tela registra cada ação (assumir, transferir, mudar status) como comentário interno,
-- na mesma coluna da nota interna escrita à mão — o banco não distingue as duas. Então aqui passa
-- quem tem "nota interna" OU alguma ação de chamado no setor; a caixinha "nota interna" sozinha
-- governa a opção na tela. Teto: um perfil com "assumir" e sem "nota interna" ainda consegue gravar
-- nota interna por fora da tela. Saída: o registro da ação passar a ser escrito pelo banco (trigger
-- AFTER UPDATE), e esta guarda voltar a perguntar só por `internal_notes`.
create or replace function public.comentario_interno_guarda_o_perfil()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_modulo text;
begin
  if not new.is_internal or pg_trigger_depth() > 1 or auth.uid() is null
     or current_user <> 'authenticated' then
    return new;
  end if;

  select t.module into v_modulo from public.tickets t where t.id = new.ticket_id;
  if v_modulo is null or v_modulo = 'compras' then
    return new;
  end if;

  if not (public.pode_no_chamado(v_modulo, 'internal_notes')
          or public.pode_no_chamado(v_modulo, 'assume')
          or public.pode_no_chamado(v_modulo, 'transfer')
          or public.pode_no_chamado(v_modulo, 'change_status')
          or public.pode_no_chamado(v_modulo, 'close')
          or public.pode_no_chamado(v_modulo, 'reopen')) then
    raise exception 'Seu perfil de acesso não permite nota interna neste chamado.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.comentario_interno_guarda_o_perfil() from public, anon;

drop trigger if exists comentario_interno_guarda_o_perfil on public.ticket_comments;
create trigger comentario_interno_guarda_o_perfil
  before insert on public.ticket_comments
  for each row execute function public.comentario_interno_guarda_o_perfil();

-- ── 4. "Ver os chamados do setor" ───────────────────────────────────────────────────────────────
-- Quem tem o módulo E a caixinha "ver" no perfil enxerga a fila do setor; sem a caixinha, só o que
-- abriu ou atende (essas portas continuam nas policies). Feito AQUI, e não nas policies, porque esta
-- função é a única que as policies de chamado, comentário, anexo e SAC perguntam — muda tudo junto.
-- A Diretoria continua vendo todos (não tem perfil de setor). Compras não tem seção de chamado
-- (decisão 5): vale a concessão, como antes. A lista de pares é a mesma de antes — a asserção 14 de
-- `chamado_e_do_modulo_dele` compara os pares com o CHECK de `tickets.module`.
create or replace function public.modulos_de_chamado_visiveis()
returns text[]
language sql
stable security definer
set search_path to 'public'
as $function$
  with mapa(concessao, modulo_do_chamado) as (values
    ('ti',          'tickets'),
    ('marketing',   'marketing'),
    ('qualidade',   'qualidade'),
    ('rh',          'rh'),
    ('financeiro',  'financeiro'),
    ('comercial',   'comercial'),
    ('educacional', 'educacional'),
    ('compras',     'compras')
  ),
  minhas as (
    select coalesce(array_agg(uma.module), array[]::text[]) as concessoes
    from public.user_module_access uma
    where uma.user_id = auth.uid()
  )
  select case
    when 'diretoria' = any (coalesce((select concessoes from minhas), array[]::text[]))
      then (select array_agg(modulo_do_chamado) from mapa)
    else coalesce(
      (select array_agg(m.modulo_do_chamado) from mapa m
        where m.concessao = any (coalesce((select concessoes from minhas), array[]::text[]))
          and (m.concessao = 'compras'
               -- o ::text antes do parêntese é de propósito: a asserção 14 lê os pares do mapa
               -- pelo padrão aspa-nome-aspa-parêntese, e a ação entraria na conta como módulo.
               or public.tem_permissao(auth.uid(), m.concessao, 'tickets', 'view_all'::text))),
      array[]::text[])
  end;
$function$;

-- ── 5. Os perfis no formato novo ────────────────────────────────────────────────────────────────
-- O padrão de cada perfil, pelo nome (decisão 3).
create or replace function public.chamados_do_perfil_padrao(p_nome text)
returns jsonb
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_nome = 'Gestor' then
      '{"view_all":true,"assume":true,"change_status":true,"close":true,"reopen":true,
        "transfer":true,"change_priority":true,"internal_notes":true,"delete":true}'::jsonb
    when p_nome = 'Somente leitura' then
      '{"view_all":true,"assume":false,"change_status":false,"close":false,"reopen":false,
        "transfer":false,"change_priority":false,"internal_notes":false,"delete":false}'::jsonb
    else
      '{"view_all":true,"assume":true,"change_status":true,"close":true,"reopen":true,
        "transfer":false,"change_priority":false,"internal_notes":true,"delete":false}'::jsonb
  end;
$$;

revoke all on function public.chamados_do_perfil_padrao(text) from public, anon;
grant execute on function public.chamados_do_perfil_padrao(text) to authenticated;

-- Perfil gravado com as chaves antigas (view/edit/assign/create…) vira o padrão do nome. Pega duas
-- coisas de uma vez: os perfis que já existem (o UPDATE abaixo) e a semente de empresa nova
-- (`seed_default_access_profiles`, que segue escrevendo o formato antigo — reescrevê-la seria
-- copiar 200 linhas para trocar um bloco). A tela grava só as chaves novas, então não entra aqui.
create or replace function public.perfil_chamados_no_formato_novo()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.permissions ? 'tickets'
     and (new.permissions -> 'tickets') ?| array['view', 'edit', 'assign', 'create', 'view_own',
                                                'edit_own', 'edit_any', 'change_due_date'] then
    new.permissions := jsonb_set(new.permissions, '{tickets}', public.chamados_do_perfil_padrao(new.name));
    if new.name = 'Gestor' then
      new.permissions := jsonb_set(new.permissions, '{profiles}',
        '{"view":false,"create":false,"edit":false,"delete":false,"assign_users":false}'::jsonb);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.perfil_chamados_no_formato_novo() from public, anon;

drop trigger if exists perfil_chamados_no_formato_novo on public.access_profiles;
create trigger perfil_chamados_no_formato_novo
  before insert or update of permissions on public.access_profiles
  for each row execute function public.perfil_chamados_no_formato_novo();

update public.access_profiles set permissions = permissions where permissions ? 'tickets';
