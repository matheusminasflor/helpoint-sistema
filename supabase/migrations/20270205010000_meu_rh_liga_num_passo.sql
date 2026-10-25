-- O Meu RH liga num passo só (etapa 4b da proposta "Helpoint no dia a dia"; dono, 2026-10-25: "pode fazer").
--
-- A decisão da 4b: o Meu RH fica "em breve" até o RH cadastrar os colaboradores, e no MESMO dia férias e atestado
-- deixam de abrir chamado (a proposta: "a tela pronta, sem o chamado"). Até aqui ligar exigia mexer no código e no
-- banco juntos. Agora é um interruptor nas Configurações do RH (`rh_ligar_meu_rh`), guardado em
-- `tenants.settings.meu_rh_ligado`, que a tela lê para mostrar o Meu RH e o banco lê para não abrir o chamado.
--
-- Sem o chamado, quem avisa o RH do pedido novo é o próprio banco: quem decide as solicitações do RH
-- (`quem_decide_no_setor`, a mesma lista das outras filas da 4b) recebe o aviso, que leva a RH › Aprovações.
-- Desligado (o padrão), nada muda: o chamado continua nascendo como hoje.

create or replace function public.meu_rh_ligado(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (t.settings ->> 'meu_rh_ligado')::boolean from public.tenants t where t.id = p_tenant), false)
$$;

create or replace function public.rh_ligar_meu_rh(p_ligado boolean)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
begin
  if v_tenant is null or not coalesce(public.is_admin_or_higher(auth.uid()) or public.pode_configurar_setor('rh'), false) then
    raise exception 'Só quem configura o RH liga o Meu RH.' using errcode = '42501';
  end if;
  update public.tenants
     set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('meu_rh_ligado', coalesce(p_ligado, false))
   where id = v_tenant;
  return coalesce(p_ligado, false);
end;
$$;

-- A versão de sempre (ver o banco em 2026-10-25), mais o ramo do Meu RH ligado no começo.
create or replace function public.create_rh_ticket_from_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _category_id uuid;
  _ticket_id uuid;
  _title text;
  _description text;
  _category_search text;
BEGIN
  IF TG_TABLE_NAME = 'rh_vacation_requests' AND NEW.status = 'aprovada' THEN
    RETURN NEW;
  END IF;

  -- Meu RH ligado: sem chamado; quem decide no RH é avisado e decide em RH › Aprovações.
  IF public.meu_rh_ligado(NEW.tenant_id) THEN
    IF TG_TABLE_NAME IN ('rh_vacation_requests', 'rh_medical_certificates') THEN
      INSERT INTO public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
      SELECT NEW.tenant_id, u, 'solicitacao', 'rh_aprovacao', NEW.id,
             CASE WHEN TG_TABLE_NAME = 'rh_medical_certificates' THEN 'Atestado novo' ELSE 'Pedido de férias novo' END,
             coalesce((SELECT p.full_name FROM public.profiles p WHERE p.id = NEW.user_id), 'Alguém')
               || CASE WHEN TG_TABLE_NAME = 'rh_medical_certificates'
                       THEN ' enviou um atestado. Confira em RH › Aprovações.'
                       ELSE ' pediu férias ou folga. Decida em RH › Aprovações.' END
        FROM (SELECT DISTINCT x AS u FROM unnest(public.quem_decide_no_setor(NEW.tenant_id, 'rh')) x) d
       WHERE u IS NOT NULL AND u <> NEW.user_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'rh_vacation_requests' THEN
    _category_search := CASE NEW.type
      WHEN 'ferias' THEN 'Solicitação de férias'
      WHEN 'abono' THEN 'Abono'
      WHEN 'banco_horas' THEN 'Banco de horas'
    END;
    _title := 'Solicitação de ' || _category_search || ' — ' ||
              to_char(NEW.start_date, 'DD/MM') || ' a ' || to_char(NEW.end_date, 'DD/MM/YYYY');
    _description := format(
      E'Tipo: %s\nPeríodo: %s a %s (%s dias)\nObservações: %s',
      _category_search,
      to_char(NEW.start_date, 'DD/MM/YYYY'),
      to_char(NEW.end_date, 'DD/MM/YYYY'),
      NEW.days_requested,
      COALESCE(NEW.notes, '—')
    );
  ELSIF TG_TABLE_NAME = 'rh_medical_certificates' THEN
    _category_search := 'Atestado médico';
    _title := 'Atestado médico — ' || NEW.days_off || ' dia(s) a partir de ' || to_char(NEW.issue_date, 'DD/MM/YYYY');
    _description := format(
      E'Data do atestado: %s\nDias de afastamento: %s\nMédico: %s\nCRM: %s\nCID: %s',
      to_char(NEW.issue_date, 'DD/MM/YYYY'),
      NEW.days_off,
      COALESCE(NEW.doctor_name, '—'),
      COALESCE(NEW.doctor_crm, '—'),
      COALESCE(NEW.cid_code, '—')
    );
  ELSE
    RETURN NEW;
  END IF;

  SELECT id INTO _category_id
  FROM public.ti_categories
  WHERE tenant_id = NEW.tenant_id
    AND module = 'rh'
    AND name = _category_search
  LIMIT 1;

  INSERT INTO public.tickets (
    tenant_id, module, title, description, category_id,
    priority, status, created_by, requester_id
  ) VALUES (
    NEW.tenant_id, 'rh', _title, _description, _category_id,
    'medium', 'open', NEW.user_id, NEW.user_id
  )
  RETURNING id INTO _ticket_id;

  NEW.ticket_id := _ticket_id;
  RETURN NEW;
END;
$function$;

revoke all on function public.meu_rh_ligado(uuid) from public, anon;
revoke all on function public.rh_ligar_meu_rh(boolean) from public, anon;
grant execute on function public.meu_rh_ligado(uuid) to authenticated;
grant execute on function public.rh_ligar_meu_rh(boolean) to authenticated;
