-- LEVA P, parte 4 — prazo de atendimento por setor.
--
-- Decisão do dono (2026-09-28): "Prazo próprio por setor". Medido antes: `sla_policies` era
-- UMA tabela por empresa (uma linha por prioridade, UNIQUE (tenant_id, priority)), e a aba
-- "Prazos (SLA)" aparecia em RH, TI, Comercial e Educacional editando a MESMA linha — mudar
-- o prazo no Comercial mudava o do RH sem aviso.
--
-- O desenho: a linha sem setor (`module` nulo) é o PADRÃO DA EMPRESA, e continua existindo
-- como sempre; o setor que quiser outro prazo ganha a própria linha para aquela prioridade.
-- `calculate_sla_due_at` procura a do setor e cai no padrão. Nada muda para ninguém até
-- alguém definir um prazo de setor.
--
-- Quem edita continua sendo quem editava: `is_diretor` (policy existente, sem mudança).

alter table public.sla_policies add column module text;

alter table public.sla_policies
  add constraint sla_policies_module_check
  check (module is null or module in ('tickets', 'marketing', 'qualidade', 'rh', 'financeiro',
                                      'comercial', 'educacional', 'compras'));

-- Uma linha por (empresa, setor, prioridade); o padrão é o "setor vazio". O índice único com
-- `coalesce` é o que impede dois padrões para a mesma prioridade — um UNIQUE comum trataria
-- dois nulos como diferentes.
alter table public.sla_policies drop constraint sla_policies_tenant_id_priority_key;
create unique index sla_policies_empresa_setor_prioridade
  on public.sla_policies (tenant_id, coalesce(module, ''), priority);

create or replace function public.calculate_sla_due_at()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _resolution_time integer;
  _standard_sla timestamptz;
begin
  -- If sla_due_at was manually set, don't override
  if new.sla_due_at is not null then
    return new;
  end if;

  -- O prazo do setor, se houver um ativo; senão o padrão da empresa (module nulo).
  select resolution_time into _resolution_time
    from public.sla_policies
   where tenant_id = new.tenant_id
     and priority = new.priority
     and is_active = true
     and (module = new.module or module is null)
   order by module nulls last
   limit 1;

  if _resolution_time is not null then
    _standard_sla := coalesce(new.created_at, now()) + (_resolution_time || ' minutes')::interval;

    -- If custom due_date exists and is later than standard SLA, use due_date
    if new.due_date is not null and new.due_date > _standard_sla then
      new.sla_due_at := new.due_date;
    else
      new.sla_due_at := _standard_sla;
    end if;
  end if;

  return new;
end;
$function$;
