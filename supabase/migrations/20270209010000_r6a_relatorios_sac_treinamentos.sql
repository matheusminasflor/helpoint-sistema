-- Rodada 2, R6a — o que não mexe em número de venda (decisões do dono de 2026-10-26, docs/proposta-helpoint-rodada-2.md
-- › Andamento). Tudo lê o que já é gravado; nenhuma tabela nova.
--   1. Relatório de reembolsos e adiantamentos (Financeiro).
--   2. Relatório de consumo do estoque de suprimentos (Compras).
--   3. O prazo do SAC = o prazo dos chamados da Qualidade (decisão e): ninguém preenchia `sac_tickets.sla_due_at`.
--   4. "Meus treinamentos": o colaborador lê as próprias inscrições (as policies do Educacional só abrem para quem
--      tem a seção; uma função lê só as da pessoa, sem abrir as tabelas).

-- ── 1. Reembolsos e adiantamentos ──────────────────────────────────────────────────────────────────────────────
-- Cada pedido de reembolso ou adiantamento feito no período (dia do pedido, no fuso do Brasil): quem pediu, quanto,
-- em que etapa está, quando a conta foi paga e, no adiantamento, quanto foi gasto e a sobra a devolver.
create or replace function public.rel_reembolsos_e_adiantamentos(p_de date, p_ate date)
returns table (id uuid, numero int, tipo text, pessoa text, titulo text, valor numeric, gasto numeric, sobra numeric,
               etapa text, pedido_em date, pago_em date)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.rel_pode('financeiro', 'reports') then
    raise exception 'O relatório de reembolsos pede "Indicadores" do Financeiro ou os indicadores da Diretoria.' using errcode = '42501';
  end if;
  return query
  select s.id, s.numero::int, s.tipo, coalesce(p.full_name, p.email, '(sem nome)'), s.titulo, s.valor,
         case when jsonb_typeof(s.dados -> 'gasto') = 'number' then (s.dados ->> 'gasto')::numeric end,
         case when jsonb_typeof(s.dados -> 'sobra') = 'number' then (s.dados ->> 'sobra')::numeric end,
         s.etapa, (s.created_at at time zone 'America/Sao_Paulo')::date, f.settled_at
    from public.solicitacoes s
    left join public.profiles p on p.id = s.solicitante_id
    left join public.fin_entries f on f.id = s.fin_entry_id
   where s.tenant_id = public.get_user_tenant_id()
     and s.tipo in ('reembolso', 'adiantamento')
     and (s.created_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
   order by s.created_at;
end;
$$;
revoke all on function public.rel_reembolsos_e_adiantamentos(date, date) from public, anon;
grant execute on function public.rel_reembolsos_e_adiantamentos(date, date) to authenticated;

-- ── 2. Consumo do estoque de suprimentos ───────────────────────────────────────────────────────────────────────
-- As saídas do período por produto e por quem retirou. Entrada (compra, Caixinha, ajuste) não é consumo.
create or replace function public.rel_consumo_do_estoque(p_de date, p_ate date)
returns table (produto_id uuid, produto text, unidade text, pessoa text, quantidade numeric, retiradas int, ultima date)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not (public.rel_pode('compras', 'reports') or public.pode_no_estoque('view')) then
    raise exception 'O consumo do estoque pede o Estoque ou os Indicadores de Compras.' using errcode = '42501';
  end if;
  return query
  select pr.id, pr.name, pr.unidade, coalesce(p.full_name, p.email, '(sem nome)'), sum(m.quantidade), count(*)::int,
         max((m.quando at time zone 'America/Sao_Paulo')::date)
    from public.estoque_movimentos m
    join public.compras_produtos pr on pr.id = m.produto_id
    left join public.profiles p on p.id = m.retirado_por
   where m.tenant_id = public.get_user_tenant_id() and m.tipo = 'saida'
     and (m.quando at time zone 'America/Sao_Paulo')::date between p_de and p_ate
   group by 1, 2, 3, 4
   order by 2, 5 desc;
end;
$$;
revoke all on function public.rel_consumo_do_estoque(date, date) from public, anon;
grant execute on function public.rel_consumo_do_estoque(date, date) to authenticated;

-- ── 3. O prazo do SAC ──────────────────────────────────────────────────────────────────────────────────────────
-- O mesmo prazo dos chamados da Qualidade (`sla_policies` do módulo, por prioridade, no expediente, sem fim de semana
-- e sem feriado — `prazo_padrao_do_chamado`). Recalcula quando a prioridade muda. Sem política para a prioridade,
-- fica sem prazo (nulo), como o chamado.
create or replace function public.sac_prazo_da_qualidade()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.priority is distinct from old.priority then
    new.sla_due_at := public.prazo_padrao_do_chamado(new.tenant_id, 'qualidade', coalesce(new.priority, 'medium'),
                                                     coalesce(new.created_at, now()), new.assigned_to, null);
  end if;
  return new;
end;
$$;
revoke all on function public.sac_prazo_da_qualidade() from public, anon, authenticated;
create trigger sac_prazo_da_qualidade before insert or update of priority on public.sac_tickets
  for each row execute function public.sac_prazo_da_qualidade();

-- ── 4. Meus treinamentos ───────────────────────────────────────────────────────────────────────────────────────
-- As turmas em que a pessoa está inscrita, com o treinamento, a data, onde é e a situação. Só as dela.
create or replace function public.meus_treinamentos()
returns table (inscricao_id uuid, treinamento text, horas numeric, inicio timestamptz, fim timestamptz, modalidade text,
               local text, situacao text, concluido_em timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, t.title, t.hours, s.starts_at, s.ends_at, s.modality, s.location, e.status, e.completed_at
    from public.training_enrollments e
    join public.training_sessions s on s.id = e.session_id
    join public.trainings t on t.id = s.training_id
   where e.profile_id = auth.uid() and e.tenant_id = public.get_user_tenant_id()
   order by s.starts_at desc
$$;
revoke all on function public.meus_treinamentos() from public, anon;
grant execute on function public.meus_treinamentos() to authenticated;
