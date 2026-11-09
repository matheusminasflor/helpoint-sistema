-- AS LEITURAS DO KOMMO E DAS REUNIÕES AVISAM DIREITO (dono, 2026-11-08): recebeu "A leitura do Kommo parou" por um erro de
-- rede de segundos às 06:20, a leitura das 09:20 já funcionou, e Configurações dizia "funcionando" com o aviso ainda lá.
-- Mesmo modelo que a Meta já usa (20270212300000, `ligacao_meta_voltou`):
--   * falha comum só avisa na 2ª leitura seguida que falhou; chave recusada (p_na_hora) avisa na hora;
--   * a conferência de hora em hora (robô parado há horas) continua avisando na hora, pelo `*_robo_caiu` de sempre;
--   * quando volta, o aviso de queda é marcado como lido e sai "voltou a funcionar", com a hora.
-- Quem dispara "Ler agora" na tela é só o dono e o admin (decisão do dono, 2026-11-08).

alter table public.mkt_kommo_robo add column falhas integer not null default 0, add column voltou_em timestamptz;
alter table public.reuniao_robo add column falhas integer not null default 0, add column voltou_em timestamptz;

-- Uma leitura falhou. Avisa quem administra, uma vez por queda: na 2ª falha seguida, ou já na 1ª quando p_na_hora.
create function public.leitura_falhou(p_robo text, p_tenant uuid, p_motivo text, p_na_hora boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_falhas integer;
  v_caiu timestamptz;
  v_titulo text := case p_robo when 'kommo' then 'A leitura do Kommo parou' else 'A leitura das reuniões parou' end;
begin
  if p_robo = 'kommo' then
    insert into public.mkt_kommo_robo (tenant_id) values (p_tenant) on conflict (tenant_id) do nothing;
    update public.mkt_kommo_robo set falhas = falhas + 1, ultimo_erro = p_motivo where tenant_id = p_tenant
    returning falhas, caiu_em into v_falhas, v_caiu;
  elsif p_robo = 'reunioes' then
    insert into public.reuniao_robo (tenant_id) values (p_tenant) on conflict (tenant_id) do nothing;
    update public.reuniao_robo set falhas = falhas + 1, ultimo_erro = p_motivo where tenant_id = p_tenant
    returning falhas, caiu_em into v_falhas, v_caiu;
  else
    raise exception 'leitura desconhecida: %', p_robo;
  end if;
  if v_caiu is not null or (v_falhas < 2 and not p_na_hora) then
    return;
  end if;

  if p_robo = 'kommo' then
    update public.mkt_kommo_robo set caiu_em = now(), voltou_em = null where tenant_id = p_tenant;
  else
    update public.reuniao_robo set caiu_em = now(), voltou_em = null where tenant_id = p_tenant;
  end if;
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select distinct p_tenant, p.id, 'ligacao_caiu'::public.notification_type, 'ligacao_meta', p_tenant, v_titulo, p_motivo
    from public.profiles p
    join public.user_roles r on r.user_id = p.id and r.role in ('owner', 'admin')
   where p.tenant_id = p_tenant and coalesce(p.is_active, true);
end;
$$;
revoke all on function public.leitura_falhou(text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.leitura_falhou(text, uuid, text, boolean) to service_role;

-- Uma leitura deu certo. Zera as falhas; se estava parada, fecha o aviso de queda e avisa que voltou.
-- p_aviso: o que deu errado em parte (as reuniões guardam a 1ª falha de um lembrete), sem derrubar a leitura.
create function public.leitura_ok(p_robo text, p_tenant uuid, p_aviso text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caiu timestamptz;
  v_parou text := case p_robo when 'kommo' then 'A leitura do Kommo parou' else 'A leitura das reuniões parou' end;
  v_voltou text := case p_robo when 'kommo' then 'A leitura do Kommo voltou a funcionar' else 'A leitura das reuniões voltou a funcionar' end;
begin
  if p_robo = 'kommo' then
    select caiu_em into v_caiu from public.mkt_kommo_robo where tenant_id = p_tenant;
    insert into public.mkt_kommo_robo (tenant_id, ok_em, caiu_em, ultimo_erro, falhas) values (p_tenant, now(), null, p_aviso, 0)
    on conflict (tenant_id) do update set ok_em = now(), caiu_em = null, ultimo_erro = p_aviso, falhas = 0,
      voltou_em = case when v_caiu is not null then now() else public.mkt_kommo_robo.voltou_em end;
  elsif p_robo = 'reunioes' then
    select caiu_em into v_caiu from public.reuniao_robo where tenant_id = p_tenant;
    insert into public.reuniao_robo (tenant_id, ok_em, caiu_em, ultimo_erro, falhas) values (p_tenant, now(), null, p_aviso, 0)
    on conflict (tenant_id) do update set ok_em = now(), caiu_em = null, ultimo_erro = p_aviso, falhas = 0,
      voltou_em = case when v_caiu is not null then now() else public.reuniao_robo.voltou_em end;
  else
    raise exception 'leitura desconhecida: %', p_robo;
  end if;
  if v_caiu is null then
    return;
  end if;

  update public.notifications set is_read = true
   where tenant_id = p_tenant and type = 'ligacao_caiu' and title = v_parou and not is_read;
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select distinct p_tenant, p.id, 'ligacao_caiu'::public.notification_type, 'ligacao_meta', p_tenant, v_voltou,
         'Parou ' || to_char(v_caiu at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
         || ' e voltou ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '.'
    from public.profiles p
    join public.user_roles r on r.user_id = p.id and r.role in ('owner', 'admin')
   where p.tenant_id = p_tenant and coalesce(p.is_active, true);
end;
$$;
revoke all on function public.leitura_ok(text, uuid, text) from public, anon, authenticated;
grant execute on function public.leitura_ok(text, uuid, text) to service_role;
