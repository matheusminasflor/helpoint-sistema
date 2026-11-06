-- RH 100% por Solicitações, sem chamados (dono, 2026-11-06; proposta https://claude.ai/artifact/XTVkmBFNy7KMKVNMjGjz81).
-- Os assuntos novos, o prazo por expediente, férias e atestado nascendo como pedido, e o desligamento abrindo a TI.
alter table public.solicitacoes drop constraint solicitacoes_tipo_check;
alter table public.solicitacoes add constraint solicitacoes_tipo_check check (tipo = any (array[
  'arte', 'acesso', 'reembolso', 'adiantamento', 'compra', 'rh_dados', 'rh_beneficio', 'rh_documento', 'rh_duvida',
  'rh_confidencial', 'rh_ferias', 'rh_atestado', 'rh_ponto', 'rh_admissao', 'rh_desligamento', 'rh_outro']));

alter table public.solicitacoes
  add column sla_due_at timestamptz,
  add column encerrada_em timestamptz;
alter table public.rh_vacation_requests add column solicitacao_id uuid references public.solicitacoes (id) on delete set null;
alter table public.rh_medical_certificates add column solicitacao_id uuid references public.solicitacoes (id) on delete set null;

create or replace function public.rotulo_da_solicitacao(p_tipo text)
returns text language sql immutable as $$
  select case p_tipo when 'arte' then 'Pedido de arte' when 'acesso' then 'Pedido de acesso'
    when 'reembolso' then 'Reembolso' when 'adiantamento' then 'Adiantamento'
    when 'rh_dados' then 'Atualizar meus dados' when 'rh_beneficio' then 'Benefício'
    when 'rh_documento' then 'Pedido de documento' when 'rh_duvida' then 'Dúvida de folha'
    when 'rh_ferias' then 'Férias' when 'rh_atestado' then 'Atestado' when 'rh_ponto' then 'Ponto e banco de horas'
    when 'rh_admissao' then 'Admissão' when 'rh_desligamento' then 'Desligamento' when 'rh_outro' then 'Pedido ao RH'
    when 'compra' then 'Compra'
    else 'Conversa com o RH' end
$$;

-- ponytail: o prazo de cada assunto mora aqui, em minutos de expediente (600 = um dia de 10 horas). Se o RH precisar mudar
-- sozinho, a saída é uma tabela e uma tela em Configurações.
create or replace function public.prazo_do_assunto_do_rh(p_tipo text)
returns integer language sql immutable as $$
  select case p_tipo when 'rh_atestado' then 600 when 'rh_ponto' then 600 when 'rh_desligamento' then 600
    when 'rh_ferias' then 1800 when 'rh_beneficio' then 1800 when 'rh_admissao' then 3000 else 1200 end
$$;

create or replace function public.solicitacao_guarda_o_prazo()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if new.tipo like 'rh\_%' and new.sla_due_at is null then
      new.sla_due_at := public.prazo_do_chamado(new.tenant_id, 'rh', coalesce(new.created_at, now()),
                                                public.prazo_do_assunto_do_rh(new.tipo), null);
    end if;
  elsif new.etapa in ('entregue', 'liberada', 'concluida', 'recusada', 'cancelada') and old.etapa is distinct from new.etapa then
    new.encerrada_em := now();
  end if;
  return new;
end;
$$;
create trigger trg_solicitacao_guarda_o_prazo before insert or update of etapa on public.solicitacoes
  for each row execute function public.solicitacao_guarda_o_prazo();

-- O tempo de expediente de cada pedido, com a mesma conta dos chamados.
create or replace function public.solicitacoes_tempo_util(p_ids uuid[])
returns table (solicitacao_id uuid, restantes integer, total integer, usados integer, volta_em timestamptz)
language sql stable security definer set search_path to 'public' as $$
  with a as (
    select s.id, s.tenant_id, s.sla_due_at, s.created_at, coalesce(s.encerrada_em, now()) as fim, now() as agora
      from public.solicitacoes s
     where s.id = any (p_ids[1:1000]) and s.tenant_id = public.get_user_tenant_id() and s.sla_due_at is not null
  )
  select a.id,
         case when a.agora <= a.sla_due_at
              then public.minutos_uteis_do_chamado(a.tenant_id, 'rh', a.agora, a.sla_due_at, null)
              else -public.minutos_uteis_do_chamado(a.tenant_id, 'rh', a.sla_due_at, a.agora, null) end,
         public.minutos_uteis_do_chamado(a.tenant_id, 'rh', a.created_at, a.sla_due_at, null),
         public.minutos_uteis_do_chamado(a.tenant_id, 'rh', a.created_at, a.fim, null),
         case when p.proxima > a.agora + interval '1 minute' then p.proxima end
    from a
    cross join lateral (select public.prazo_do_chamado(a.tenant_id, 'rh', a.agora, 0, null) as proxima) p;
$$;

-- Férias e atestado nascem como pedido; RH › Aprovações segue sendo onde se decide.
do $$
declare
  v_def text := pg_get_functiondef('public.create_rh_ticket_from_request()'::regprocedure);
  v_ini int := position('    IF TG_TABLE_NAME IN (''rh_vacation_requests'', ''rh_medical_certificates'') THEN' in v_def);
  v_fim int := position(E'    RETURN NEW;\n  END IF;\n\n  IF TG_TABLE_NAME = ''rh_vacation_requests'' THEN' in v_def);
begin
  if v_ini = 0 or v_fim = 0 then
    raise exception 'trecho não encontrado em create_rh_ticket_from_request';
  end if;
  execute left(v_def, v_ini - 1) || $x$    IF TG_TABLE_NAME = 'rh_vacation_requests' THEN
      INSERT INTO public.solicitacoes (tenant_id, tipo, solicitante_id, para_id, titulo, detalhes, dados)
      VALUES (NEW.tenant_id, 'rh_ferias', NEW.user_id, NEW.user_id,
              'Férias · ' || to_char(NEW.start_date, 'DD/MM') || ' a ' || to_char(NEW.end_date, 'DD/MM/YYYY'),
              NEW.notes, jsonb_build_object('ferias_id', NEW.id))
      RETURNING id INTO NEW.solicitacao_id;
    ELSIF TG_TABLE_NAME = 'rh_medical_certificates' THEN
      INSERT INTO public.solicitacoes (tenant_id, tipo, solicitante_id, para_id, titulo, dados)
      VALUES (NEW.tenant_id, 'rh_atestado', NEW.user_id, NEW.user_id,
              'Atestado · ' || NEW.days_off || ' dia(s) a partir de ' || to_char(NEW.issue_date, 'DD/MM/YYYY'),
              jsonb_build_object('atestado_id', NEW.id))
      RETURNING id INTO NEW.solicitacao_id;
    END IF;
$x$ || substr(v_def, v_fim);
end;
$$;

create or replace function public.rh_chamado_segue_a_decisao()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_solucao text;
  v_etapa text;
  v_motivo text;
begin
  if new.status is not distinct from old.status then return null; end if;

  if new.solicitacao_id is not null then
    v_etapa := case new.status when 'aprovada' then 'concluida' when 'validado' then 'concluida'
      when 'recusada' then 'recusada' when 'rejeitado' then 'recusada' when 'cancelada' then 'cancelada' end;
    if v_etapa is not null then
      v_motivo := to_jsonb(new) ->> case when tg_table_name = 'rh_vacation_requests' then 'decision_notes' else 'validation_notes' end;
      update public.solicitacoes
         set etapa = v_etapa, atualizada_em = now(),
             motivo_recusa = case when v_etapa = 'recusada' then coalesce(nullif(btrim(v_motivo), ''), 'Recusado pelo RH.') end
       where id = new.solicitacao_id and etapa in ('pedido', 'em_andamento');
      if found then
        insert into public.solicitacoes_eventos (tenant_id, solicitacao_id, quem, acao, etapa, texto)
        values (new.tenant_id, new.solicitacao_id, auth.uid(), case v_etapa when 'concluida' then 'concluir' when 'recusada' then 'recusar' else 'cancelar' end,
                v_etapa, nullif(btrim(coalesce(v_motivo, '')), ''));
        perform public.solicitacao_avisa(new.solicitacao_id, array[new.user_id],
          case when tg_table_name = 'rh_vacation_requests' then 'Férias' else 'Atestado' end || ': '
            || case v_etapa when 'concluida' then 'aprovado' when 'recusada' then 'recusado' else 'cancelado' end,
          coalesce(nullif(btrim(v_motivo), ''), 'Veja o pedido.'));
      end if;
    end if;
    return null;
  end if;

  if new.ticket_id is null then return null; end if;
  if tg_table_name = 'rh_vacation_requests' then
    v_solucao := case new.status
      when 'aprovada' then 'Aprovada pelo RH.'
      when 'recusada' then 'Recusada pelo RH: ' || coalesce(new.decision_notes, '')
      when 'cancelada' then 'Cancelada por quem pediu.'
    end;
  else
    v_solucao := case new.status
      when 'validado' then 'Atestado validado pelo RH.'
      when 'rejeitado' then 'Atestado rejeitado pelo RH: ' || coalesce(new.validation_notes, '')
    end;
  end if;
  if v_solucao is null then return null; end if;
  perform set_config('helpoint.status_pela_resposta', new.ticket_id::text, true);
  update public.tickets t
     set status = 'resolved', resolved_at = now(), resolution_notes = v_solucao
   where t.id = new.ticket_id and t.status <> 'resolved';
  perform set_config('helpoint.status_pela_resposta', '', true);
  return null;
end;
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.solicitacao_agir(uuid, text, text, jsonb)'::regprocedure);
  v_de1 text := $x$  v_setor := public.solicitacao_setor_decide(s.setor);
$x$;
  v_de2 text := $x$  -- Quem pediu fica sabendo de toda decisão; e quem age a seguir, da vez dele.
$x$;
begin
  if position(v_de1 in v_def) = 0 or position(v_de2 in v_def) = 0 then
    raise exception 'trecho não encontrado em solicitacao_agir';
  end if;
  v_def := replace(v_def, v_de1, v_de1 || $x$  -- Férias e atestado se decidem em RH › Aprovações, que grava o período e a validação.
  if s.tipo in ('rh_ferias', 'rh_atestado') and p_acao in ('concluir', 'recusar') then
    raise exception 'Decida este pedido em RH › Aprovações.' using errcode = '23514';
  end if;
$x$);
  execute replace(v_def, v_de2, $x$  if p_acao = 'cancelar' and s.tipo = 'rh_ferias' then
    update public.rh_vacation_requests set status = 'cancelada' where id = (s.dados ->> 'ferias_id')::uuid and status = 'pendente';
  end if;

$x$ || v_de2);
end;
$$;

-- Desligamento abre a TI ao nascer, como o chamado fazia; admissão e desligamento são de quem responde pela pessoa.
do $$
declare
  v_def text := pg_get_functiondef('public.solicitacao_nasceu()'::regprocedure);
  v_de text := $x$  if new.tipo = 'compra' then return null; end if;
$x$;
begin
  if position(v_de in v_def) = 0 then
    raise exception 'trecho não encontrado em solicitacao_nasceu';
  end if;
  execute replace(v_def, v_de, v_de || $x$  if new.tipo in ('rh_admissao', 'rh_desligamento') then
    if nullif(new.dados ->> 'colaborador_id', '') is null then
      raise exception 'Escolha o colaborador.' using errcode = '23514';
    end if;
    if not (public.solicitacao_setor_decide('rh') or public.sou_gestor_de((new.dados ->> 'colaborador_id')::uuid)) then
      raise exception 'Só o gestor da pessoa ou o RH faz este pedido.' using errcode = '42501';
    end if;
  end if;
  if new.tipo = 'rh_desligamento' then
    perform public.abrir_desligamento_na_ti(new.tenant_id, (new.dados ->> 'colaborador_id')::uuid, new.solicitante_id,
                                            format('pedido ao RH #%s', new.numero));
  end if;
$x$);
end;
$$;

-- Chamado novo não entra no RH, nem por transferência. Os antigos ficam como histórico.
create or replace function public.rh_nao_recebe_chamado()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.module = 'rh' and (tg_op = 'INSERT' or old.module is distinct from 'rh')
     and auth.uid() is not null and public.meu_rh_ligado(new.tenant_id) then
    raise exception 'O RH atende por Solicitações: faça o pedido em Novo › RH.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger trg_rh_nao_recebe_chamado before insert or update of module on public.tickets
  for each row execute function public.rh_nao_recebe_chamado();

revoke all on function public.prazo_do_assunto_do_rh(text) from public, anon;
revoke all on function public.solicitacao_guarda_o_prazo() from public, anon;
revoke all on function public.solicitacoes_tempo_util(uuid[]) from public, anon;
revoke all on function public.rh_nao_recebe_chamado() from public, anon;
grant execute on function public.solicitacoes_tempo_util(uuid[]) to authenticated;

-- As categorias de chamado saem das Configurações do RH.
create or replace function public.abas_de_configuracao(p_setor text)
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select case p_setor
    when 'ti'          then array['chamados', 'cadastros', 'checklists', 'alertas']
    when 'qualidade'   then array['chamados', 'sac_link', 'sac_produtos', 'sac_categorias', 'sac_campos']
    when 'rh'          then array['empresas', 'departamentos', 'folha', 'feriados', 'holerites']
    when 'marketing'   then array['chamados', 'beneficio']
    when 'financeiro'  then array['chamados', 'importacoes', 'conferencia']
    when 'compras'     then array['chamados', 'teto', 'comprador']
    when 'comercial'   then array['chamados', 'equipe', 'indicadores', 'cashback', 'familias', 'diretrizes']
    when 'educacional' then array['chamados']
    when 'expedicao'   then array['chamados']
    when 'producao'    then array['chamados']
    else array[]::text[]
  end;
$$;
