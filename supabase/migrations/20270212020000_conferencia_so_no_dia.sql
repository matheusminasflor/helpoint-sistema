-- A CONFERÊNCIA DE EQUIPAMENTOS ABRE SÓ NO DIA ESCOLHIDO (defeito relatado pelo dono, 2026-10-27).
--
-- "Selecionei dia 1 e sai em nome Matheus Baeta, porém sexta criou um chamado da conferência e eu deletei e agora
-- hoje criou de novo, sendo que nem é dia 1 ainda." Causa: a rotina diária abria a conferência do mês em QUALQUER
-- dia a partir do escolhido (`dia >= dia_do_mes`) enquanto o mês não tivesse uma — com "dia 1", o mês inteiro. A
-- configuração foi salva em 21/10, então outubro abriu no meio do mês; e apagar o chamado apaga a checagem junto,
-- então na manhã seguinte o mês estava "sem conferência" de novo e ela voltava (#223, 27/10 às 8h).
-- Agora: abre só NO dia escolhido (1 a 28, sempre existe no mês). Apagada, não volta até o mês seguinte.
-- ponytail: se o relógio falhar justo no dia, aquele mês fica sem conferência automática (o cron roda todo dia há
-- semanas sem falha); a saída seria guardar "já tentou neste mês".

-- O dia entra como parâmetro para o teste poder dizer "hoje é dia X"; o relógio chama a versão sem parâmetro.
create or replace function public.ti_abrir_conferencia_do_mes(p_hoje date)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_mes date := date_trunc('month', p_hoje)::date;
  v_rotulo text := to_char(v_mes, 'MM/YYYY');
  t record;
  v_solicitante uuid;
  v_categoria uuid;
  v_chamado uuid;
  v_checagem uuid;
  n int := 0;
begin
  for t in
    select distinct a.tenant_id, c.dia_do_mes, c.solicitante_id
      from public.assets a
      left join public.ti_conferencia_config c on c.tenant_id = a.tenant_id
     where a.assigned_to is not null
       and coalesce(c.ativo, true)
       and extract(day from p_hoje) = coalesce(c.dia_do_mes, 1)
       and not exists (select 1 from public.ti_checagens k
                        where k.tenant_id = a.tenant_id and k.tipo = 'conferencia' and k.referencia = v_mes)
  loop
    -- O solicitante escolhido na configuração, se ainda está ativo; senão, o primeiro dono, como antes.
    select p.id into v_solicitante from public.profiles p
     where p.id = t.solicitante_id and p.tenant_id = t.tenant_id and coalesce(p.is_active, true);
    v_solicitante := coalesce(v_solicitante, (public.donos_da_empresa(t.tenant_id))[1]);
    if v_solicitante is null then
      continue;
    end if;
    select id into v_categoria from public.ti_categories
     where tenant_id = t.tenant_id and module = 'tickets' and parent_id is null and is_active and name = 'Hardware'
     limit 1;
    insert into public.tickets (tenant_id, module, title, description, category_id, priority, status, requester_id, created_by)
    values (t.tenant_id, 'tickets', 'Conferência de equipamentos — ' || v_rotulo,
            E'Conferência mensal (automática, configurada em TI › Configurações › Inventário e cadastros). Confira com cada pessoa se o equipamento no nome dela está com ela — '
            || E'patrimônio e número de série batendo — e marque no painel "Conferência de equipamentos".\n'
            || E'Divergência (trocado, sumido, levado para casa) pede o motivo e avisa o gestor da pessoa, o RH e a diretoria.',
            v_categoria, 'medium', 'open', v_solicitante, v_solicitante)
    returning id into v_chamado;
    insert into public.ti_checagens (tenant_id, tipo, ticket_id, referencia)
    values (t.tenant_id, 'conferencia', v_chamado, v_mes) returning id into v_checagem;
    insert into public.ti_checagem_itens (tenant_id, checagem_id, asset_id, pessoa_id, pessoa_nome, descricao, patrimonio, serie)
    select a.tenant_id, v_checagem, a.id, a.assigned_to, coalesce(p.full_name, p.email),
           a.name || coalesce(' — ' || nullif(btrim(concat_ws(' ', a.manufacturer, a.model)), ''), ''),
           a.asset_tag, a.serial_number
      from public.assets a left join public.profiles p on p.id = a.assigned_to
     where a.tenant_id = t.tenant_id and a.assigned_to is not null;
    n := n + 1;
  end loop;
  return n;
end;
$$;
-- Função nova (outra assinatura): nasce aberta ao público — fecha, como a sem parâmetro (só o relógio abre).
revoke all on function public.ti_abrir_conferencia_do_mes(date) from public, anon, authenticated;

create or replace function public.ti_abrir_conferencia_do_mes()
returns integer language sql security definer set search_path to 'public' as $$
  select public.ti_abrir_conferencia_do_mes((now() at time zone 'America/Sao_Paulo')::date);
$$;
