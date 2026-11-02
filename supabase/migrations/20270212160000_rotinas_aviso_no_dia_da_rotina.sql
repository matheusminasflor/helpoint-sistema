-- Rotinas, etapa 3 (20270212140000): o "um aviso só por dia" comparava o dia da rotina (`p_agora`) com o dia em que a
-- notificação foi gravada (`now()`). No agendamento os dois são o mesmo instante; chamada com outra hora (o teste, num
-- domingo à noite, pedindo o próximo dia útil) avisava duas vezes. Agora o aviso nasce com a hora pedida, e a conta
-- fecha nos dois casos. `create or replace` preserva a ACL (só o agendamento chama).
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
    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, created_at)
    select j.tenant_id, j.pessoa, 'reminder', 'rotina', (array_agg(j.id order by j.created_at))[1],
           case when count(*) = 1 then 'Falta 1 rotina hoje' else 'Faltam ' || count(*) || ' rotinas hoje' end,
           string_agg(j.titulo, ' · ' order by case j.periodo when 'manha' then 1 when 'tarde' then 2 else 3 end, j.titulo)
             || '. O expediente acaba em 30 minutos.',
           p_agora
      from na_janela j
     group by j.tenant_id, j.pessoa
    returning 1
  )
  select count(*) into v_n from novos;
  return v_n;
end;
$$;
