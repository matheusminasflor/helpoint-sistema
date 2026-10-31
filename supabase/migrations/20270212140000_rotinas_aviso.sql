-- Rotinas do dia, etapa 3 (dono, 2026-10-30; docs/proposta-rotinas.md): um aviso só, 30 minutos antes do fim do
-- expediente, para quem ainda tem rotina aberta — no "Lyra avisa" e no celular (o aviso no celular lê a mesma tabela).
-- Sem e-mail: `email_sent` nasce verdadeiro.
--
-- O fim do expediente é o do setor da pessoa (Prazos do setor; sem cadastro, o padrão do setor). Roda a cada 5 minutos;
-- quem já recebeu o aviso de rotina hoje não recebe de novo.
--
-- ponytail: avisa só quem está na rotina; a rotina que foi para o substituto nas férias não gera aviso para ele.
-- Se o substituto esquecer, a saída é somar aqui as instâncias de `ferias_substitutos`, como em rotinas_de_hoje().

-- O fim do expediente da pessoa (o mesmo que divide a tarde do fim do dia na tela).
create or replace function public.rotina_fim_do_expediente(p_user uuid)
returns time
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(s.fim_expediente, (select e.fim from public.expediente_padrao(x.modulo) e))
    from (select p.tenant_id,
                 case lower(btrim(coalesce(p.department, ''))) when 'ti' then 'tickets' when '' then 'tickets'
                      else lower(btrim(p.department)) end as modulo
            from public.profiles p where p.id = p_user) x
    left join public.sla_regras_do_setor s on s.tenant_id = x.tenant_id and s.module = x.modulo;
$$;

-- `p_agora` é para o teste escolher a hora; o agendamento chama sem argumento.
create or replace function public.rotinas_avisa_pendentes(p_agora timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_local timestamp := p_agora at time zone 'America/Sao_Paulo';
  v_dia date := v_local::date;
  v_n integer;
begin
  with pendentes as (
    select r.tenant_id, p.pessoa, r.id, r.titulo, r.periodo, r.created_at
      from public.rotinas r
      cross join lateral unnest(r.pessoas) as p(pessoa)
     where public.rotina_vale_no_dia(r, v_dia)
       and public.ausencia_de_hoje(p.pessoa) is null
       and not exists (select 1 from public.rotina_registros g
                        where g.rotina_id = r.id and g.pessoa_id = p.pessoa and g.dia = v_dia)
  ),
  na_janela as (
    select pe.* from pendentes pe
     where v_local::time >= public.rotina_fim_do_expediente(pe.pessoa) - interval '30 minutes'
       and v_local::time < public.rotina_fim_do_expediente(pe.pessoa)
       and not exists (select 1 from public.notifications n
                        where n.user_id = pe.pessoa and n.reference_type = 'rotina'
                          and (n.created_at at time zone 'America/Sao_Paulo')::date = v_dia)
  ),
  novos as (
    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
    select j.tenant_id, j.pessoa, 'reminder', 'rotina', (array_agg(j.id order by j.created_at))[1],
           case when count(*) = 1 then 'Falta 1 rotina hoje' else 'Faltam ' || count(*) || ' rotinas hoje' end,
           string_agg(j.titulo, ' · ' order by case j.periodo when 'manha' then 1 when 'tarde' then 2 else 3 end, j.titulo)
             || '. O expediente acaba em 30 minutos.'
      from na_janela j
     group by j.tenant_id, j.pessoa
    returning 1
  )
  select count(*) into v_n from novos;
  return v_n;
end;
$$;

revoke all on function public.rotina_fim_do_expediente(uuid) from public, anon, authenticated;
revoke all on function public.rotinas_avisa_pendentes(timestamptz) from public, anon, authenticated;

select cron.schedule('rotinas-aviso', '*/5 * * * *', $cron$select public.rotinas_avisa_pendentes()$cron$);
