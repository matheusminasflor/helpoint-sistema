-- Compras muda de nome: `fin_purchase_*` vira `compras_*`.
--
-- DECISÃO DO DONO em 2026-09-27, ao separar Compras do Financeiro: renomear agora que
-- as tabelas estão vazias (0 solicitações, 0 orçamentos, 1 produto de teste). O
-- prefixo `fin_` diz "Financeiro" — com Compras virando módulo próprio, esse nome
-- passa a mentir, e **nome que mente já custou caro aqui**: a coluna `publicidade`
-- que não era publicidade (leva A) e `mkt_suppliers` que não era só do Marketing
-- (leva I) receberam este mesmo conserto.
--
-- O QUE **NÃO** MUDA DE NOME, e é decisão do dono, não economia:
--
--   `fin_department_budgets` e `fin_budget_settings` — o teto de gasto por setor.
--   Perguntado quem define o teto, ele escolheu *"o Financeiro define; Compras
--   respeita"*. Então o teto é controle do Financeiro e o nome está certo: Compras
--   lê e obedece, o Financeiro decide.
--
--   `fin_entries` — a conta a pagar que a compra concluída gera. A ponte entre os
--   dois módulos continua existindo, e é do Financeiro: comprar cria uma obrigação
--   de pagar, e quem paga é ele.
--
--   O **bucket de storage `fin-purchases`**, onde moram os anexos e laudos de
--   compra. `ponytail`: renomear bucket no Supabase não existe — seria criar outro,
--   mover cada objeto e reescrever os caminhos guardados, por zero ganho de
--   comportamento. E storage é uma das três coisas que a suíte deste repositório
--   **não alcança** (`docs/nao-funciona.md`), então o conserto não teria como ser
--   provado. O teto é o nome; a saída, se algum dia importar, é migrar os objetos
--   com o sistema parado.
--
-- ── POR QUE AS FUNÇÕES PRECISAM SER REESCRITAS ───────────────────────────────
--
-- `alter table ... rename` **não** atualiza o corpo de função plpgsql: o corpo é
-- texto, e o nome é resolvido na primeira execução. Sem recriar, as quatro funções
-- passariam a falhar com "relation does not exist" — na hora de aprovar uma compra,
-- não agora. Os corpos abaixo foram **copiados** de `pg_get_functiondef`, e a única
-- diferença é o nome da tabela; reescrever de cabeça já apagou uma regra que não era
-- minha para tocar nesta semana (ver "Registro honesto" em `docs/plano-geral.md`).
--
-- No fim há um bloco que **reprova a migration** se sobrar qualquer referência a
-- `fin_purchase` em função ou policy. É a prova de que a cópia não esqueceu nada —
-- varredura incompleta é o meu erro recorrente, e aqui ela falha alto.

-- ── 1. As três tabelas ───────────────────────────────────────────────────────
alter table public.fin_purchase_requests rename to compras_solicitacoes;
alter table public.fin_purchase_quotes   rename to compras_orcamentos;
alter table public.fin_purchase_products rename to compras_produtos;

-- ── 2. Constraints e índices, mecanicamente ──────────────────────────────────
-- A mão erraria um de vinte e quatro. O mapa é explícito para o nome novo não ficar
-- meio em inglês (`compras_requests_pkey` seria pior que não renomear).
do $$
declare
  r record;
  v_novo text;
begin
  for r in
    select con.conname, con.conrelid::regclass::text as tabela
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and con.conname like 'fin\_purchase%'
  loop
    v_novo := replace(replace(replace(r.conname,
      'fin_purchase_requests', 'compras_solicitacoes'),
      'fin_purchase_quotes',   'compras_orcamentos'),
      'fin_purchase_products', 'compras_produtos');
    execute format('alter table public.%I rename constraint %I to %I', r.tabela, r.conname, v_novo);
  end loop;

  for r in
    select indexname, tablename from pg_indexes
     where schemaname = 'public'
       and indexname like '%fin\_purchase%'
       and indexname not in (select conname from pg_constraint)  -- os de constraint já foram
  loop
    v_novo := replace(replace(replace(r.indexname,
      'fin_purchase_requests', 'compras_solicitacoes'),
      'fin_purchase_quotes',   'compras_orcamentos'),
      'fin_purchase_products', 'compras_produtos');
    execute format('alter index public.%I rename to %I', r.indexname, v_novo);
  end loop;
end $$;

-- ── 2b. Os gatilhos ──────────────────────────────────────────────────────────
-- O gatilho continua funcionando depois do renome da função (ele aponta pelo OID,
-- não pelo nome), então isto é só o nome deixar de mentir.
alter trigger fin_purchase_requests_updated_at on public.compras_solicitacoes rename to compras_solicitacoes_updated_at;
alter trigger fin_purchase_quotes_updated_at   on public.compras_orcamentos   rename to compras_orcamentos_updated_at;
alter trigger fin_purchase_products_updated_at on public.compras_produtos     rename to compras_produtos_updated_at;
alter trigger trg_fin_compra_exige_tres_orcamentos on public.compras_solicitacoes rename to trg_compras_exige_tres_orcamentos;
alter trigger trg_fin_compra_respeita_teto        on public.compras_solicitacoes rename to trg_compras_respeita_teto;
alter trigger trg_fin_compra_vira_conta_a_pagar   on public.compras_solicitacoes rename to trg_compras_vira_conta_a_pagar;

-- ── 3. As funções de regra ───────────────────────────────────────────────────
-- `alter function ... rename` preserva a ACL (ao contrário de `drop` + `create`,
-- regra 14 do pgTAP), então o renome não reabre nada para `anon`.
alter function public.fin_compra_exige_tres_orcamentos() rename to compras_exige_tres_orcamentos;
alter function public.fin_compra_respeita_teto()         rename to compras_respeita_teto;
alter function public.fin_compra_vira_conta_a_pagar()    rename to compras_vira_conta_a_pagar;

-- Corpos copiados de `pg_get_functiondef`; só o nome da tabela mudou.
create or replace function public.compras_exige_tres_orcamentos()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_quantos integer;
  v_antes   text := case when tg_op = 'UPDATE' then old.status::text else null end;
begin
  if tg_op = 'INSERT' and new.status::text = 'completed' then
    raise exception 'compra não nasce concluída: ela é aberta para análise e passa pela aprovação'
      using errcode = '23514';
  end if;

  if new.status::text in ('pending_approval', 'rejected') then
    new.few_quotes_reason := null;
    return new;
  end if;

  if new.status::text <> 'approved' or v_antes = 'approved' then
    return new;
  end if;

  select count(*) into v_quantos from public.compras_orcamentos q
   where q.request_id = new.id and q.tenant_id = new.tenant_id;

  if v_quantos >= 3 then
    new.few_quotes_reason := null;
    return new;
  end if;

  if coalesce(trim(new.few_quotes_reason), '') = '' then
    raise exception
      'esta compra tem % orçamento(s): para aprovar com menos de três, escreva o motivo (fornecedor exclusivo, urgência…)',
      v_quantos using errcode = '23514';
  end if;
  return new;
end;
$function$;

create or replace function public.compras_respeita_teto()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_antes  text := case when tg_op = 'UPDATE' then old.status::text else null end;
  v_modo   text;
  v_teto   numeric(14,2);
  v_gasto  numeric(14,2);
  v_mes    date;
  v_valor  numeric(14,2) := coalesce(new.estimated_amount, 0);
begin
  if new.status::text in ('pending_approval', 'rejected') then
    new.over_budget_reason := null;
    return new;
  end if;

  if new.status::text <> 'approved' or v_antes = 'approved' then
    return new;
  end if;

  if new.department is null then
    new.over_budget_reason := null;
    return new;
  end if;

  select mode into v_modo from public.fin_budget_settings where tenant_id = new.tenant_id;
  if coalesce(v_modo, '') <> 'per_department' then
    new.over_budget_reason := null;
    return new;
  end if;

  select monthly_limit into v_teto
    from public.fin_department_budgets
   where tenant_id = new.tenant_id and department = new.department;
  if coalesce(v_teto, 0) <= 0 then
    new.over_budget_reason := null;
    return new;
  end if;

  v_mes := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;

  select coalesce(sum(r.estimated_amount), 0) into v_gasto
    from public.compras_solicitacoes r
   where r.tenant_id = new.tenant_id
     and r.department = new.department
     and r.status::text in ('approved', 'completed')
     and r.id <> new.id
     and r.approved_at is not null
     and (r.approved_at at time zone 'America/Sao_Paulo')::date >= v_mes;

  if v_gasto + v_valor <= v_teto then
    new.over_budget_reason := null;
    return new;
  end if;

  if coalesce(trim(new.over_budget_reason), '') = '' then
    raise exception
      'esta compra passa o teto mensal do setor %: o teto é R$ %, já foram aprovados R$ % no mês e esta soma R$ %. Para aprovar, escreva o motivo.',
      new.department,
      to_char(v_teto,  'FM999G999G990D00'),
      to_char(v_gasto, 'FM999G999G990D00'),
      to_char(v_valor, 'FM999G999G990D00')
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

create or replace function public.compras_vira_conta_a_pagar()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_valor       numeric(14,2);
  v_fornecedor  text;
  v_vencimento  date;
  v_antes       text := case when tg_op = 'UPDATE' then old.status::text else null end;
  v_conta       public.fin_entries%rowtype;
begin
  if v_antes = 'completed' and new.status::text <> 'completed' then
    update public.fin_entries
       set status = 'cancelled',
           notes = trim(both E'\n' from
             coalesce(notes, '') || E'\n' || 'Cancelada: a compra deixou de estar concluída.')
     where purchase_request_id = new.id and status in ('pending', 'overdue');
    return new;
  end if;

  if new.status::text <> 'completed' or v_antes = 'completed' then
    return new;
  end if;

  select q.amount, coalesce(nullif(trim(s.name), ''), nullif(trim(q.supplier), ''))
    into v_valor, v_fornecedor
    from public.compras_orcamentos q
    left join public.suppliers s on s.id = q.supplier_id and s.tenant_id = q.tenant_id
   where q.id = new.approved_quote_id and q.tenant_id = new.tenant_id;

  v_valor := coalesce(v_valor, new.estimated_amount);
  if v_valor is null or v_valor <= 0 then
    return new;
  end if;

  select * into v_conta from public.fin_entries
   where purchase_request_id = new.id and status = 'paid';
  if found then
    if v_conta.amount = v_valor then
      return new;
    end if;
    raise exception
      'esta compra já tem conta paga de R$ % e agora vale R$ %: acerte a diferença no Financeiro antes de concluir de novo',
      to_char(v_conta.amount, 'FM999G999G990D00'), to_char(v_valor, 'FM999G999G990D00')
      using errcode = '23514';
  end if;

  -- O prazo que o executor informou; sem ele, à vista. `current_date` seria o
  -- dia do servidor (UTC): depois das 21h no Brasil já é amanhã — regra 10 do
  -- pgTAP e regra 4 das cinco, do lado do banco.
  v_vencimento := coalesce(
    new.payment_due_date,
    (now() at time zone 'America/Sao_Paulo')::date
  );

  insert into public.fin_entries (
    tenant_id, kind, description, category, counterparty, amount,
    due_date, status, cost_center, competence, source, notes,
    purchase_request_id, created_by
  ) values (
    new.tenant_id, 'payable',
    'Compra: ' || left(coalesce(new.product_name, 'sem descrição'), 140),
    'compras', v_fornecedor, v_valor,
    v_vencimento, 'pending',
    nullif(trim(new.department), ''),
    date_trunc('month', v_vencimento)::date, 'compra',
    nullif(trim(new.purchase_report), ''),
    new.id, new.executed_by
  )
  on conflict (purchase_request_id) where purchase_request_id is not null
  do update set
       status       = 'pending',
       amount       = excluded.amount,
       counterparty = excluded.counterparty,
       description  = excluded.description,
       due_date     = excluded.due_date,
       competence   = excluded.competence,
       cost_center  = excluded.cost_center,
       notes        = excluded.notes
     where public.fin_entries.status = 'cancelled';

  return new;
end;
$function$;

-- ── 4. O aviso de compra nova vai para o time de COMPRAS ─────────────────────
--
-- Era `notification_team(tenant_id, 'financeiro')`: o pedido de aprovação chegava ao
-- Financeiro, que é onde Compras morava. Agora vai para quem tem o módulo Compras.
--
-- ponytail: CAI NO FINANCEIRO ENQUANTO NINGUÉM TIVER O MÓDULO COMPRAS, e o teto é
-- esse. Sem a queda, no dia da separação o pedido de aprovação não avisaria ninguém —
-- e um aviso que não chega é pior que um aviso no lugar antigo. A saída é automática:
-- assim que alguém receber o módulo Compras, a lista dele deixa de estar vazia e o
-- Financeiro sai do caminho sozinho.
create or replace function public.notify_on_purchase_requested()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_who  text;
  v_time uuid[];
begin
  select full_name into v_who from public.profiles where id = new.created_by;

  v_time := public.notification_team(new.tenant_id, 'compras');
  if v_time is null or array_length(v_time, 1) is null then
    v_time := public.notification_team(new.tenant_id, 'financeiro');
  end if;

  perform public.notify_users(
    new.tenant_id,
    v_time,
    'purchase_requested', 'ticket', new.ticket_id,
    'Nova solicitação de compra — ' || coalesce(new.product_name, ''),
    coalesce(v_who, 'Alguém') || ' pediu aprovação' ||
      case when new.estimated_amount is not null
           then ' (estimado R$ ' || to_char(new.estimated_amount, 'FM999G999G990D00') || ').'
           else '.' end,
    new.created_by
  );
  return new;
end;
$function$;

-- ── 5. A prova de que a varredura foi completa ───────────────────────────────
--
-- O `\_` ESCAPADO NÃO É DETALHE. Na primeira tentativa o padrão era `'%fin_purchase%'`
-- e a migration foi **reprovada por si mesma**, acusando `is_allowed_upload_ext` — que
-- não fala de tabela nenhuma: fala do bucket `fin-purchases`, com HÍFEN. Em `LIKE` o
-- `_` é curinga de um caractere, então `fin_purchase` casava com `fin-purchase`.
-- Guarda com padrão frouxo acusa inocente, e quem lê o erro perde tempo procurando
-- defeito onde não tem. Com o `\_` sobram só as três funções reescritas acima.
-- E A SEGUNDA ARMADILHA, que o CI #143 cobrou e o banco de teste deixou passar:
-- **`pg_get_functiondef` ESTOURA em função de agregação** — `"array_agg" is an
-- aggregate function`, SQLSTATE 42809. Escrito como `from pg_proc p join pg_namespace
-- n ... where n.nspname = 'public' and pg_get_functiondef(p.oid) ilike ...`, nada
-- garante que o filtro de schema seja avaliado ANTES da chamada: o planejador escolhe
-- a ordem, e num banco do zero ele escolheu chamar a função primeiro. No
-- `test-helpoint` escolheu o contrário, e por isso passou lá e falhou aqui — o pior
-- tipo de diferença, porque some quando você procura.
--
-- Dois cintos: `prokind = 'f'` tira agregação, janela e procedure; e o `offset 0` na
-- subconsulta é **barreira de otimização** — impede o Postgres de achatá-la e voltar a
-- misturar a ordem. Sem o `offset 0`, `prokind` sozinho seria só mais uma condição
-- que o planejador pode avaliar depois.
do $$
declare v_sobrou text;
begin
  select string_agg(distinct nome, ', ') into v_sobrou
    from (
      select f.proname as nome
        from (
          select p.oid, p.proname
            from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.prokind = 'f'
           offset 0
        ) f
       where pg_get_functiondef(f.oid) ilike '%fin\_purchase%'
      union all
      select 'policy ' || policyname
        from pg_policies
       where schemaname = 'public'
         and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%fin\_purchase%'
    ) t;

  if v_sobrou is not null then
    raise exception 'sobrou referencia a fin_purchase em: % — o renome ficou incompleto', v_sobrou;
  end if;
end $$;
