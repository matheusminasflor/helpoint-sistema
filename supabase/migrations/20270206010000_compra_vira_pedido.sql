-- A COMPRA VIRA PEDIDO DE VERDADE (rodada 2, decisão 2 do dono, 2026-10-25). Até aqui toda compra nascia com um
-- chamado por baixo (`compras_solicitacoes.ticket_id` NOT NULL): a situação era copiada para o chamado, a compra
-- aparecia em "Meus chamados", pedia estrelas, entrava na Performance de quem compra e no resumo do Início. O chamado
-- dava seis coisas à compra: o número, a conversa, quem compra (`assigned_to`), o tipo (`category_id`), os avisos e o
-- e-mail. Agora a compra é um PEDIDO (`solicitacoes`, tipo 'compra', setor 'compras') e cada uma dessas coisas mora
-- nela:
--
--   número ............ `solicitacoes.numero` (as 9 compras de antes guardam o número do chamado: #89 continua #89)
--   conversa .......... `solicitacoes_eventos` — "escrever" vale em TODO pedido (decisão do dono): `pedido_escrever`
--   quem compra ....... `compras_solicitacoes.comprador_id`
--   tipo de compra .... `compras_solicitacoes.category_id`
--   avisos ............ `notify_compra`, o mesmo contrato de `notify_ticket`, com reference_type 'solicitacao'
--   e-mail ............ `pedido_emails_pendentes` — e-mail em TODO pedido, como o chamado (decisão do dono)
--
-- As etapas do pedido seguem a compra (`compra_anda_no_pedido`): pedido → aprovada → paga → concluida, ou recusada.
-- É a compra que manda; o pedido só mostra — `solicitacao_agir` não mexe em pedido de compra.
--
-- As 9 compras de antes (decisão do dono: "copiar e apagar"): a conversa e os registros do chamado viram o histórico
-- do pedido, os avisos antigos passam a abrir o pedido, e os 9 chamados são apagados — nada de chamado de compra fica
-- em fila, Performance ou indicador.

create or replace function pg_temp.troca(p_funcao regprocedure, p_de text, p_para text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
begin
  if position(p_de in v_def) = 0 then
    raise exception 'trecho não encontrado em %: %', p_funcao, left(p_de, 80);
  end if;
  execute replace(v_def, p_de, p_para);
end;
$$;

-- Mesma coisa por expressão regular (o registro no chamado muda de recuo de uma função para outra).
create or replace function pg_temp.troca_re(p_funcao regprocedure, p_de text, p_para text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
begin
  if v_def !~ p_de then
    raise exception 'padrão não encontrado em %: %', p_funcao, left(p_de, 80);
  end if;
  execute regexp_replace(v_def, p_de, p_para, 'g');
end;
$$;

-- ─── 1. O pedido aceita a compra ────────────────────────────────────────────────────────────────────────────
alter table public.solicitacoes drop constraint if exists solicitacoes_tipo_check;
alter table public.solicitacoes add constraint solicitacoes_tipo_check check (tipo in ('arte', 'acesso', 'reembolso',
  'adiantamento', 'rh_dados', 'rh_beneficio', 'rh_documento', 'rh_duvida', 'rh_confidencial', 'compra'));

-- `setor` é coluna gerada; trocar a expressão é refazer a coluna (sem `set expression`, que só existe no 17). A
-- policy de leitura, a de anexar e o índice dependem dela e voltam iguais.
drop policy if exists solicitacoes_le on public.solicitacoes;
drop policy if exists solicitacoes_anexos_anexa on public.solicitacoes_anexos;
drop index if exists public.solicitacoes_do_setor;
alter table public.solicitacoes drop column setor;
alter table public.solicitacoes add column setor text not null generated always as (case
    when tipo = 'arte' then 'marketing'
    when tipo = 'acesso' then 'ti'
    when tipo in ('reembolso', 'adiantamento') then 'financeiro'
    when tipo = 'compra' then 'compras'
    else 'rh' end) stored;
create index if not exists solicitacoes_do_setor on public.solicitacoes (tenant_id, setor, etapa);

-- Vê o pedido de compra quem vê as compras (Compras, Financeiro que paga, Diretoria) e o responsável de Caixinha — o
-- detalhe da compra continua guardado pela policy de `compras_solicitacoes`.
create or replace function public.solicitacao_visivel(p_tipo text, p_setor text, p_solicitante uuid, p_para uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() in (p_solicitante, p_para)
      or (p_tipo = 'rh_confidencial' and public.solicitacao_setor_decide('rh'))
      or (p_tipo = 'compra' and (public.compras_ve_as_solicitacoes() or public.e_responsavel_de_caixinha()))
      or (p_tipo <> 'rh_confidencial'
          and (public.is_admin_or_higher(auth.uid())
               or public.pode_no_setor(p_setor, 'solicitacoes', 'view')
               or (public.solicitacao_pede_gestor(p_tipo) and public.sou_gestor_de(p_para))))
$$;

create policy solicitacoes_le on public.solicitacoes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (solicitante_id = auth.uid() or para_id = auth.uid() or public.solicitacao_visivel(tipo, setor, solicitante_id, para_id)));
-- Anexa quem pediu (pedido e prestação de contas) e o setor que entrega (entrega da arte).
create policy solicitacoes_anexos_anexa on public.solicitacoes_anexos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and enviado_por = auth.uid()
              and exists (select 1 from public.solicitacoes s where s.id = solicitacao_id
                            and ((momento in ('pedido', 'prestacao') and s.solicitante_id = auth.uid())
                                 or (momento = 'entrega' and public.solicitacao_setor_decide(s.setor)))));

create or replace function public.rotulo_da_solicitacao(p_tipo text)
returns text language sql immutable as $$
  select case p_tipo when 'arte' then 'Pedido de arte' when 'acesso' then 'Pedido de acesso'
    when 'reembolso' then 'Reembolso' when 'adiantamento' then 'Adiantamento'
    when 'rh_dados' then 'Atualizar meus dados' when 'rh_beneficio' then 'Benefício'
    when 'rh_documento' then 'Pedido de documento' when 'rh_duvida' then 'Dúvida de folha'
    when 'compra' then 'Compra'
    else 'Conversa com o RH' end
$$;

-- O pedido de compra nasce só por `compras_abrir_pedido`, e anda só pela compra. A policy de INSERT deixaria alguém
-- criar um pedido 'compra' sem compra; `solicitacao_agir` (cancelar, recusar…) mudaria a etapa por fora dela.
create or replace function public.pedido_de_compra_so_pela_compra()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.tipo = 'compra' and coalesce(current_setting('helpoint.abrindo_compra', true), '') <> 'sim' then
      raise exception 'Compra se pede em "Novo › Pedido › Compra".' using errcode = '42501';
    end if;
  elsif 'compra' not in (new.tipo, old.tipo) then
    return new;
  elsif new.tipo is distinct from old.tipo
     or (new.etapa is distinct from old.etapa and pg_trigger_depth() < 2) then
    -- A etapa do pedido de compra vem de `compra_anda_no_pedido` (um gatilho dentro de outro).
    raise exception 'A compra anda pelo quadro de Compras, não por aqui.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.pedido_de_compra_so_pela_compra() from public, anon, authenticated;
drop trigger if exists trg_pedido_de_compra_so_pela_compra on public.solicitacoes;
create trigger trg_pedido_de_compra_so_pela_compra before insert or update on public.solicitacoes
  for each row execute function public.pedido_de_compra_so_pela_compra();

-- O aviso de compra nova é o de `notify_on_purchase_requested` (a quem aprova): o genérico do setor não repete.
select pg_temp.troca('public.solicitacao_nasceu()'::regprocedure,
$$  select coalesce(full_name, email) into v_nome from public.profiles where id = new.para_id;
$$,
$$  if new.tipo = 'compra' then return null; end if;
  select coalesce(full_name, email) into v_nome from public.profiles where id = new.para_id;
$$);

-- E-mail em todo pedido (decisão do dono): o aviso nasce esperando o e-mail, como o do chamado.
create or replace function public.solicitacao_avisa(p_id uuid, p_para uuid[], p_titulo text, p_texto text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
  select s.tenant_id, u, 'solicitacao', 'solicitacao', s.id, p_titulo, p_texto, false
    from public.solicitacoes s, (select distinct x as u from unnest(p_para) x) d
   where s.id = p_id and u is not null and u <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
$$;
revoke all on function public.solicitacao_avisa(uuid, uuid[], text, text) from public, anon, authenticated;

-- ─── 2. A compra guarda o que era do chamado ────────────────────────────────────────────────────────────────
alter table public.compras_solicitacoes
  add column if not exists solicitacao_id uuid unique references public.solicitacoes(id),
  add column if not exists comprador_id uuid references public.profiles(id),
  add column if not exists category_id uuid references public.ti_categories(id) on delete set null;

comment on column public.compras_solicitacoes.solicitacao_id is 'O pedido (número, conversa, avisos) desta compra.';
comment on column public.compras_solicitacoes.comprador_id is 'Quem compra: posto na aprovação (Compras ou o responsável da Caixinha).';
comment on column public.compras_solicitacoes.category_id is 'O tipo de compra (categoria de Compras; marca a Caixinha).';

-- Toda compra tem o seu pedido: a que nasce sem (insert direto, que a policy de INSERT deixa) ganha um com o nome do
-- produto. `compras_abrir_pedido` cria o dele antes, com o título e o "para quê". O nome do gatilho o põe antes dos
-- `trg_compras_*` (ordem alfabética), que já encontram o pedido.
create or replace function public.compra_nasce_com_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_quem uuid := coalesce(new.created_by, auth.uid());
begin
  if new.solicitacao_id is not null then return new; end if;
  perform set_config('helpoint.abrindo_compra', 'sim', true);
  insert into public.solicitacoes (tenant_id, tipo, solicitante_id, para_id, titulo)
  values (new.tenant_id, 'compra', v_quem, v_quem, 'Compra: ' || coalesce(nullif(btrim(new.product_name), ''), 'sem nome'))
  returning id into new.solicitacao_id;
  perform set_config('helpoint.abrindo_compra', '', true);
  return new;
end;
$$;
revoke all on function public.compra_nasce_com_pedido() from public, anon, authenticated;
drop trigger if exists trg_compra_nasce_com_pedido on public.compras_solicitacoes;
create trigger trg_compra_nasce_com_pedido before insert on public.compras_solicitacoes
  for each row execute function public.compra_nasce_com_pedido();

-- Apagar a compra (só administrador) apaga o pedido dela.
create or replace function public.compra_apagada_apaga_o_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.solicitacoes where id = old.solicitacao_id;
  return null;
end;
$$;
revoke all on function public.compra_apagada_apaga_o_pedido() from public, anon, authenticated;
drop trigger if exists trg_compra_apagada_apaga_o_pedido on public.compras_solicitacoes;
create trigger trg_compra_apagada_apaga_o_pedido after delete on public.compras_solicitacoes
  for each row execute function public.compra_apagada_apaga_o_pedido();

-- O aviso da compra: o contrato de `notify_ticket` (o que funde avisos iguais em 2 minutos e o e-mail opcional),
-- apontando para o pedido. Sem o filtro de quem vê o chamado: quem a compra avisa (quem pediu, quem aprova, quem
-- compra, o Financeiro) vê o pedido de compra.
create or replace function public.notify_compra(p_compra uuid, p_type public.notification_type, p_users uuid[],
  p_title text, p_message text, p_com_email boolean default false, p_exclude uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pedido uuid;
  v_tenant uuid;
  v_u uuid;
begin
  select solicitacao_id, tenant_id into v_pedido, v_tenant from public.compras_solicitacoes where id = p_compra;
  if v_pedido is null then return; end if;
  for v_u in
    select distinct u from unnest(coalesce(p_users, '{}'::uuid[])) as u
     where u is not null and u is distinct from auth.uid() and u is distinct from p_exclude
  loop
    update public.notifications n
       set title = p_title, message = p_message, is_read = false,
           email_sent = case when p_com_email then false else n.email_sent end
     where n.user_id = v_u and n.reference_type = 'solicitacao' and n.reference_id = v_pedido
       and n.type = p_type and n.created_at > now() - interval '2 minutes';
    if not found then
      insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
      values (v_tenant, v_u, p_type, 'solicitacao', v_pedido, p_title, p_message, not p_com_email);
    end if;
  end loop;
end;
$$;
revoke all on function public.notify_compra(uuid, public.notification_type, uuid[], text, text, boolean, uuid) from public, anon, authenticated;

-- O registro no histórico do pedido (era o comentário interno no chamado).
create or replace function public.compra_registra(p_compra uuid, p_quem uuid, p_texto text, p_interno boolean default true)
returns void language sql security definer set search_path = public as $$
  insert into public.solicitacoes_eventos (tenant_id, solicitacao_id, quem, acao, etapa, texto)
  select c.tenant_id, s.id, p_quem, 'registro', s.etapa, nullif(btrim(p_texto), '')
    from public.compras_solicitacoes c join public.solicitacoes s on s.id = c.solicitacao_id
   where c.id = p_compra;
$$;
revoke all on function public.compra_registra(uuid, uuid, text, boolean) from public, anon, authenticated;

-- ─── 3. As etapas do pedido seguem a compra ─────────────────────────────────────────────────────────────────
create or replace function public.etapa_do_pedido_de_compra(p_status text, p_pago boolean)
returns text language sql immutable as $$
  select case
    when p_status = 'rejected' then 'recusada'
    when p_status = 'completed' then 'concluida'
    when p_status = 'approved' and p_pago then 'paga'
    when p_status = 'approved' then 'aprovada'
    else 'pedido' end
$$;
revoke all on function public.etapa_do_pedido_de_compra(text, boolean) from public, anon;
grant execute on function public.etapa_do_pedido_de_compra(text, boolean) to authenticated;

create or replace function public.rotulo_da_forma(p_forma text)
returns text language sql immutable as $$
  select case p_forma when 'cartao' then 'cartão' when 'boleto' then 'boleto' when 'pix' then 'Pix'
    when 'caixinha' then 'Caixinha' else coalesce(p_forma, '—') end
$$;
revoke all on function public.rotulo_da_forma(text) from public, anon;
grant execute on function public.rotulo_da_forma(text) to authenticated;

-- Cada decisão vira uma linha do histórico, com o texto que a pessoa escreveu (era o comentário que a tela gravava
-- no chamado).
create or replace function public.compra_anda_no_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_etapa text := public.etapa_do_pedido_de_compra(new.status, new.pagamento_em is not null);
  v_acao text;
  v_texto text;
begin
  if new.solicitacao_id is null then return null; end if;
  if new.status is distinct from old.status then
    v_acao := case new.status when 'approved' then 'aprovar' when 'rejected' then 'recusar'
      when 'adjustment_requested' then 'ajustar' when 'completed' then 'comprar' when 'pending_approval' then 'reenviar' end;
    v_texto := case new.status when 'approved' then new.approval_notes when 'rejected' then new.rejection_reason
      when 'adjustment_requested' then new.adjustment_reason
      when 'completed' then concat_ws(E'\n', nullif(btrim(new.purchase_report), ''),
                                      'Sem nota fiscal (recibo anexado): ' || nullif(btrim(new.sem_nota_motivo), ''))
      when 'pending_approval' then new.adjustment_response end;
  elsif new.pago_junto_com is not null and old.pago_junto_com is distinct from new.pago_junto_com then
    v_acao := 'pagar';
    v_texto := 'Paga junto com a compra #' || (select s.numero from public.compras_solicitacoes j
                 join public.solicitacoes s on s.id = j.solicitacao_id where j.id = new.pago_junto_com) || ' (uma conta só).';
  elsif new.pagamento_em is not null and old.pagamento_em is null and new.pago_junto_com is null then
    -- A paga junto já ganhou a linha acima; o pagamento dela vem logo depois e não repete.
    v_acao := 'pagar';
    v_texto := case when new.forma_pagamento = 'boleto'
      then 'Boleto enviado ao Financeiro, vence em ' || coalesce(to_char(new.payment_due_date, 'DD/MM/YYYY'), '—') || '.' end;
  elsif new.forma_pagamento is distinct from old.forma_pagamento then
    v_acao := 'trocar_forma';
    v_texto := 'De ' || public.rotulo_da_forma(old.forma_pagamento) || ' para ' || public.rotulo_da_forma(new.forma_pagamento)
               || coalesce('. Motivo: ' || nullif(btrim(new.troca_motivo), ''), '') || '.';
  end if;
  if v_acao is not null then
    insert into public.solicitacoes_eventos (tenant_id, solicitacao_id, quem, acao, etapa, texto)
    values (new.tenant_id, new.solicitacao_id, auth.uid(), v_acao, v_etapa, nullif(btrim(coalesce(v_texto, '')), ''));
  end if;
  -- O motivo da recusa vai junto: a página do pedido o mostra como em todo pedido recusado.
  update public.solicitacoes
     set etapa = v_etapa, atualizada_em = now(),
         motivo_recusa = case when v_etapa = 'recusada' then nullif(btrim(new.rejection_reason), '') end
   where id = new.solicitacao_id and etapa is distinct from v_etapa;
  return null;
end;
$$;
revoke all on function public.compra_anda_no_pedido() from public, anon, authenticated;
drop trigger if exists trg_compra_anda_no_pedido on public.compras_solicitacoes;
create trigger trg_compra_anda_no_pedido after update of status, pagamento_em, pago_junto_com, forma_pagamento
  on public.compras_solicitacoes for each row execute function public.compra_anda_no_pedido();

-- ─── 4. Abrir a compra: o pedido no lugar do chamado ────────────────────────────────────────────────────────
-- Devolve o id do PEDIDO (a tela abre `/solicitacoes/:id`). `p_chamado` continua o nome do parâmetro para a tela no ar
-- seguir funcionando até subir a nova; dele saem o título, o "para quê", o tipo de compra e quem compra (se veio).
create or replace function public.compras_abrir_pedido(p_chamado jsonb, p_pedido jsonb, p_orcamentos jsonb)
returns uuid language plpgsql set search_path to 'public' as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_eu uuid := auth.uid();
  v_solicitacao uuid;
  v_pedido uuid;
  v_atribuido uuid := nullif(p_chamado ->> 'assigned_to', '')::uuid;
  v_qtd numeric := coalesce(nullif(p_pedido ->> 'quantidade', '')::numeric, 1);
  v_estimado numeric;
begin
  if v_tenant is null or v_eu is null then
    raise exception 'Entre no sistema para pedir uma compra.' using errcode = '42501';
  end if;
  if coalesce(trim(p_pedido ->> 'product_name'), '') = '' then
    raise exception 'Informe o produto da compra.' using errcode = '23514';
  end if;
  if v_qtd <= 0 then
    raise exception 'A quantidade precisa ser maior que zero.' using errcode = '23514';
  end if;

  -- O menor total é a estimativa — já no insert, porque o aviso a quem aprova a mostra.
  select min(coalesce(round(nullif(o ->> 'valor_unitario', '')::numeric * v_qtd + coalesce(nullif(o ->> 'frete', '')::numeric, 0), 2),
                      nullif(o ->> 'amount', '')::numeric))
    into v_estimado
    from jsonb_array_elements(coalesce(p_orcamentos, '[]'::jsonb)) o
   where coalesce(trim(o ->> 'supplier'), '') <> ''
     and coalesce(nullif(o ->> 'valor_unitario', '')::numeric, nullif(o ->> 'amount', '')::numeric, 0) > 0;

  perform set_config('helpoint.abrindo_compra', 'sim', true);
  insert into public.solicitacoes (tenant_id, tipo, solicitante_id, para_id, titulo, detalhes)
  values (v_tenant, 'compra', v_eu, v_eu,
          coalesce(nullif(trim(p_chamado ->> 'title'), ''), 'Compra: ' || trim(p_pedido ->> 'product_name')),
          nullif(trim(coalesce(p_chamado ->> 'description', '')), ''))
  returning id into v_solicitacao;
  perform set_config('helpoint.abrindo_compra', '', true);

  insert into public.compras_solicitacoes (
    tenant_id, solicitacao_id, category_id, comprador_id, product_id, product_name, product_link, department, quantidade,
    motivo_recomendacao, estimated_amount, created_by, caixinha_id
  ) values (
    v_tenant, v_solicitacao, nullif(p_chamado ->> 'category_id', '')::uuid, v_atribuido,
    nullif(p_pedido ->> 'product_id', '')::uuid,
    trim(p_pedido ->> 'product_name'),
    nullif(trim(p_pedido ->> 'product_link'), ''),
    nullif(p_pedido ->> 'department', ''),
    v_qtd,
    nullif(trim(coalesce(p_pedido ->> 'motivo_recomendacao', '')), ''),
    v_estimado, v_eu, nullif(p_pedido ->> 'caixinha_id', '')::uuid
  )
  returning id into v_pedido;

  -- O total de cada um sai de `compras_orcamento_total`; sem unitário (chamada antiga), vale o `amount`.
  insert into public.compras_orcamentos (
    tenant_id, request_id, supplier, supplier_id, amount, valor_unitario, frete, prazo_entrega_dias,
    link, notes, file_path, position
  )
  select v_tenant, v_pedido,
         trim(o ->> 'supplier'),
         nullif(o ->> 'supplier_id', '')::uuid,
         coalesce(nullif(o ->> 'amount', '')::numeric, nullif(o ->> 'valor_unitario', '')::numeric * v_qtd),
         nullif(o ->> 'valor_unitario', '')::numeric,
         coalesce(nullif(o ->> 'frete', '')::numeric, 0),
         nullif(o ->> 'prazo_entrega_dias', '')::integer,
         nullif(trim(o ->> 'link'), ''),
         nullif(trim(o ->> 'notes'), ''),
         nullif(o ->> 'file_path', ''),
         n::int
    from jsonb_array_elements(coalesce(p_orcamentos, '[]'::jsonb)) with ordinality as x(o, n)
   where coalesce(trim(o ->> 'supplier'), '') <> ''
     and coalesce(nullif(o ->> 'valor_unitario', '')::numeric, nullif(o ->> 'amount', '')::numeric, 0) > 0;

  -- O recomendado é o orçamento marcado por quem pediu (opcional).
  update public.compras_solicitacoes s
     set orcamento_recomendado_id = (
           select q.id from public.compras_orcamentos q
             join jsonb_array_elements(coalesce(p_orcamentos, '[]'::jsonb)) with ordinality as x(o, n) on q.position = x.n
            where q.request_id = v_pedido and coalesce((x.o ->> 'recomendado')::boolean, false)
            limit 1)
   where s.id = v_pedido;

  return v_solicitacao;
end;
$$;
revoke all on function public.compras_abrir_pedido(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.compras_abrir_pedido(jsonb, jsonb, jsonb) to authenticated;

-- O tipo de compra (e, com ele, a Caixinha) vem da própria compra; e a compra de Caixinha já nasce com o responsável
-- como quem compra (era `compras_caixinha_vai_ao_responsavel`, que punha o atendente no chamado).
create or replace function public.compras_marca_caixinha()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(c.caixinha or p.caixinha or g.caixinha, false) into new.caixinha
    from public.ti_categories c
    left join public.ti_categories p on p.id = c.parent_id
    left join public.ti_categories g on g.id = p.parent_id
   where c.id = new.category_id;
  new.caixinha := coalesce(new.caixinha, false);
  if not new.caixinha then
    new.caixinha_id := null;
  else
    new.caixinha_id := coalesce(new.caixinha_id, public.caixinha_padrao(new.tenant_id));
    if not exists (select 1 from public.caixinhas where id = new.caixinha_id and tenant_id = new.tenant_id) then
      raise exception 'Caixinha de outra empresa.' using errcode = '42501';
    end if;
    new.comprador_id := coalesce(new.comprador_id, public.responsavel_da_caixinha(new.caixinha_id));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_compras_caixinha_vai_ao_responsavel on public.compras_solicitacoes;
drop function if exists public.compras_caixinha_vai_ao_responsavel();

-- Aprovada: quem compra é posto na própria compra, ANTES de gravar — o aviso da decisão (depois) já o encontra.
create or replace function public.compras_vai_para_quem_compra()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_quem uuid;
begin
  if new.status::text <> 'approved' or old.status::text = 'approved' then
    return new;
  end if;
  select case when new.caixinha then public.responsavel_da_caixinha(new.caixinha_id) else c.comprador_id end into v_quem
    from public.compras_config c where c.tenant_id = new.tenant_id;
  if v_quem is not null then
    new.comprador_id := v_quem;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_compras_atribui_a_quem_compra on public.compras_solicitacoes;
create trigger trg_compras_atribui_a_quem_compra before update of status on public.compras_solicitacoes
  for each row execute function public.compras_vai_para_quem_compra();

-- ─── 5. Os avisos e os registros: do chamado para o pedido ──────────────────────────────────────────────────
select pg_temp.troca('public.notify_on_purchase_requested()'::regprocedure,
  'public.notify_ticket(new.ticket_id,', 'public.notify_compra(new.id,');

select pg_temp.troca('public.compras_registra_decisao()'::regprocedure,
$$  select case when t.assigned_to is not null then array[t.assigned_to]
              else public.notification_team(new.tenant_id, 'compras') end
    into v_compras from public.tickets t where t.id = new.ticket_id;
$$,
$$  v_compras := case when new.comprador_id is not null then array[new.comprador_id]
                    else public.notification_team(new.tenant_id, 'compras') end;
$$);
select pg_temp.troca('public.compras_registra_decisao()'::regprocedure,
  'public.notify_ticket(new.ticket_id,', 'public.notify_compra(new.id,');
select pg_temp.troca('public.compras_registra_decisao()'::regprocedure,
  'Registre a compra feita no chamado.', 'Registre a compra feita no pedido.');
select pg_temp.troca('public.compras_registra_decisao()'::regprocedure,
  'O chamado foi resolvido.', 'Pedido encerrado.');

select pg_temp.troca('public.compras_aplica_reajuste(uuid)'::regprocedure,
  'public.notify_ticket(s.ticket_id,', 'public.notify_compra(s.id,');
select pg_temp.troca_re('public.compras_aplica_reajuste(uuid)'::regprocedure,
  'insert into public\.ticket_comments \(tenant_id, ticket_id, author_id, content, is_internal\)\s+values \(s\.tenant_id, s\.ticket_id,',
  'perform public.compra_registra(s.id,');

select pg_temp.troca('public.compras_decidir_reajuste(uuid, boolean, text)'::regprocedure,
  'public.notify_ticket(s.ticket_id,', 'public.notify_compra(s.id,');
select pg_temp.troca_re('public.compras_decidir_reajuste(uuid, boolean, text)'::regprocedure,
  'insert into public\.ticket_comments \(tenant_id, ticket_id, author_id, content, is_internal\)\s+values \(s\.tenant_id, s\.ticket_id,',
  'perform public.compra_registra(s.id,');

select pg_temp.troca('public.compras_reajustar(uuid, numeric, numeric, text, numeric)'::regprocedure,
  'public.notify_ticket(s.ticket_id,', 'public.notify_compra(s.id,');
select pg_temp.troca_re('public.compras_reajustar(uuid, numeric, numeric, text, numeric)'::regprocedure,
  'insert into public\.ticket_comments \(tenant_id, ticket_id, author_id, content, is_internal\)\s+values \(s\.tenant_id, s\.ticket_id,',
  'perform public.compra_registra(s.id,');

select pg_temp.troca('public.compras_boleto_pago_avisa()'::regprocedure,
  '''ticket'', s.ticket_id,', '''solicitacao'', s.solicitacao_id,');
select pg_temp.troca('public.compras_lembra_a_nota()'::regprocedure,
  '''ticket'', p.ticket_id,', '''solicitacao'', p.solicitacao_id,');

select pg_temp.troca('public.compras_troca_a_forma()'::regprocedure,
$$      raise exception 'Esta compra entrou no pagamento do chamado #%: troque a forma lá, e esta segue junto.',
        (select t.ticket_number from public.compras_solicitacoes j join public.tickets t on t.id = j.ticket_id
          where j.id = old.pago_junto_com) using errcode = '23514';$$,
$$      raise exception 'Esta compra entrou no pagamento da compra #%: troque a forma lá, e esta segue junto.',
        (select x.numero from public.compras_solicitacoes j join public.solicitacoes x on x.id = j.solicitacao_id
          where j.id = old.pago_junto_com) using errcode = '23514';$$);
select pg_temp.troca('public.compras_troca_a_forma()'::regprocedure,
  '''ticket'', new.ticket_id,', '''solicitacao'', new.solicitacao_id,');

select pg_temp.troca('public.compras_vira_conta_a_pagar()'::regprocedure,
  '''ticket'', new.ticket_id,', '''solicitacao'', new.solicitacao_id,');
select pg_temp.troca('public.compras_vira_conta_a_pagar()'::regprocedure,
  $$'Separada do pagamento do chamado #' || (select ticket_number from public.tickets where id = new.ticket_id)$$,
  $$'Separada do pagamento da compra #' || (select numero from public.solicitacoes where id = new.solicitacao_id)$$);
select pg_temp.troca('public.compras_vira_conta_a_pagar()'::regprocedure,
  $$' (#' || t.ticket_number || ')', ' + ' order by t.ticket_number)$$, $$' (#' || t.numero || ')', ' + ' order by t.numero)$$);
select pg_temp.troca('public.compras_vira_conta_a_pagar()'::regprocedure,
  'join public.tickets t on t.id = j.ticket_id', 'join public.solicitacoes t on t.id = j.solicitacao_id');
select pg_temp.troca('public.compras_vira_conta_a_pagar()'::regprocedure,
  'public.notify_ticket(new.ticket_id,', 'public.notify_compra(new.id,');
select pg_temp.troca('public.compras_vira_conta_a_pagar()'::regprocedure,
  'a nota está no chamado da compra.', 'a nota está na compra.');

select pg_temp.troca('public.rel_ciclo_da_compra(date, date)'::regprocedure,
  'select c.id, t.ticket_number, c.product_name', 'select c.id, t.numero::int, c.product_name');
select pg_temp.troca('public.rel_ciclo_da_compra(date, date)'::regprocedure,
  'left join public.tickets t on t.id = c.ticket_id', 'left join public.solicitacoes t on t.id = c.solicitacao_id');
select pg_temp.troca('public.rel_economia_na_cotacao(date, date)'::regprocedure,
  'select c.id, t.ticket_number, c.product_name', 'select c.id, t.numero::int, c.product_name');
select pg_temp.troca('public.rel_economia_na_cotacao(date, date)'::regprocedure,
  'left join public.tickets t on t.id = c.ticket_id', 'left join public.solicitacoes t on t.id = c.solicitacao_id');
select pg_temp.troca('public.rel_economia_na_cotacao(date, date)'::regprocedure,
  'group by c.id, t.ticket_number,', 'group by c.id, t.numero,');

-- O chamado de compra não existe mais: sai o ramo dele de quem pode comentar no chamado, e os gatilhos que o
-- seguravam aberto e sem prazo.
select pg_temp.troca('public.pode_comentar_no_chamado(uuid)'::regprocedure,
$$
      or exists (select 1 from public.compras_solicitacoes s
                  where s.ticket_id = t.id and s.caixinha and public.pode_decidir_compra(true, s.caixinha_id))$$, '');
drop trigger if exists trg_compras_chamado_segue_a_compra on public.compras_solicitacoes;
drop function if exists public.compras_chamado_segue_a_compra();
drop trigger if exists trg_compras_so_fecha_registrando on public.tickets;
drop function if exists public.compras_so_fecha_registrando();
drop trigger if exists zz_compras_sem_prazo on public.tickets;
drop function if exists public.compras_sem_prazo();

-- ─── 6. Escrever no pedido (todo pedido, decisão do dono) ───────────────────────────────────────────────────
-- Recebe o aviso quem está na conversa: quem pediu, para quem é, todo mundo que já agiu ou escreveu, e quem age
-- agora (na compra: quem aprova enquanto espera aprovação, depois quem compra).
create or replace function public.pedido_escrever(p_id uuid, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.solicitacoes%rowtype;
  c public.compras_solicitacoes%rowtype;
  v_eu uuid := auth.uid();
  v_para uuid[];
  v_nome text;
begin
  if btrim(coalesce(p_texto, '')) = '' then
    raise exception 'Escreva a mensagem.' using errcode = '23514';
  end if;
  select * into s from public.solicitacoes where id = p_id and tenant_id = public.get_user_tenant_id();
  if not found or not (v_eu in (s.solicitante_id, s.para_id)
                       or coalesce(public.solicitacao_visivel(s.tipo, s.setor, s.solicitante_id, s.para_id), false)) then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  -- Na compra, "Somente leitura" de Compras vê e não escreve (dono, 2026-10-15) — a regra que era do chamado
  -- (`pode_comentar_no_chamado`): escreve quem pediu, quem compra, quem compra ou aprova em Compras, e quem decide a
  -- Caixinha dela.
  if s.tipo = 'compra' then
    select * into c from public.compras_solicitacoes where solicitacao_id = s.id;
    if not (v_eu in (s.solicitante_id, s.para_id) or v_eu is not distinct from c.comprador_id
            or public.is_admin_or_higher(v_eu)
            or coalesce(public.pode_no_setor('compras', 'solicitacoes', 'execute'), false)
            or coalesce(public.pode_no_setor('compras', 'solicitacoes', 'approve'), false)
            or (c.caixinha and coalesce(public.pode_decidir_compra(true, c.caixinha_id), false))) then
      raise exception 'Quem só vê as compras não escreve no pedido.' using errcode = '42501';
    end if;
  end if;
  insert into public.solicitacoes_eventos (tenant_id, solicitacao_id, quem, acao, etapa, texto)
  values (s.tenant_id, s.id, v_eu, 'escrever', s.etapa, btrim(p_texto));

  v_para := array[s.solicitante_id, s.para_id]
    || array(select distinct e.quem from public.solicitacoes_eventos e where e.solicitacao_id = s.id and e.quem is not null);
  if s.tipo = 'compra' then
    v_para := v_para || case
      when c.status = 'pending_approval' then public.aprovadores_da_compra(c.tenant_id, c.caixinha, c.caixinha_id)
      when c.comprador_id is not null then array[c.comprador_id]
      else public.notification_team(c.tenant_id, 'compras') end;
  elsif s.etapa = 'pedido' and public.solicitacao_pede_gestor(s.tipo) then
    v_para := v_para || array(select public.gestores_da_pessoa(s.para_id));
  elsif s.etapa not in ('recusada', 'cancelada') then
    v_para := v_para || public.quem_decide_no_setor(s.tenant_id, s.setor);
  end if;

  select coalesce(full_name, email) into v_nome from public.profiles where id = v_eu;
  perform public.solicitacao_avisa(s.id, v_para, 'Mensagem no pedido #' || s.numero || ' — ' || left(s.titulo, 80),
    coalesce(v_nome, 'Alguém') || ': ' || left(btrim(p_texto), 200));
end;
$$;
revoke all on function public.pedido_escrever(uuid, text) from public, anon;
grant execute on function public.pedido_escrever(uuid, text) to authenticated;

-- ─── 7. O e-mail do pedido ─────────────────────────────────────────────────────────────────────────────────
-- O mesmo do chamado (`chamado_emails_pendentes`): agrupa por pessoa e pedido, espera um minuto para juntar o que
-- chega junto, respeita "Receber e-mail…" do perfil e larga o que passou de 24 horas. Marca com `chamado_emails_enviados`.
create or replace function public.pedido_emails_pendentes(p_limit integer default 50, p_idade interval default '00:01:00'::interval)
returns table (user_id uuid, email text, nome text, solicitacao_id uuid, numero bigint, titulo text, rotulo text,
               ids uuid[], titulos text[], mensagens text[])
language plpgsql security definer set search_path = public as $$
begin
  update public.notifications n set email_sent = true
   where n.email_sent = false and n.reference_type = 'solicitacao'
     and (n.created_at < now() - interval '24 hours'
          or exists (select 1 from public.profiles p where p.id = n.user_id
                      and (not p.receber_email_chamados or p.email is null or not coalesce(p.is_active, true))));
  return query
  select n.user_id, p.email, p.full_name, s.id, s.numero, s.titulo, public.rotulo_da_solicitacao(s.tipo),
         array_agg(n.id order by n.created_at), array_agg(n.title order by n.created_at),
         array_agg(coalesce(n.message, '') order by n.created_at)
    from public.notifications n
    join public.profiles p on p.id = n.user_id
    join public.solicitacoes s on s.id = n.reference_id
   where n.email_sent = false and n.reference_type = 'solicitacao'
   group by n.user_id, p.email, p.full_name, s.id, s.numero, s.titulo, s.tipo
  having min(n.created_at) <= now() - p_idade
   order by min(n.created_at)
   limit p_limit;
end;
$$;
revoke all on function public.pedido_emails_pendentes(integer, interval) from public, anon, authenticated;
grant execute on function public.pedido_emails_pendentes(integer, interval) to service_role;

-- ─── 8. As 9 compras de antes: o chamado vira pedido, e some ────────────────────────────────────────────────
-- A compra se solta do chamado antes de ele ser apagado (a chave dela era `on delete cascade`: apagar o chamado
-- apagaria a compra). O CI roda num banco sem compras; foi a produção que acusou o NOT NULL (2026-10-25).
alter table public.compras_solicitacoes alter column ticket_id drop not null;
do $$
declare
  r record;
  v_pedido uuid;
  v_etapa text;
begin
  perform set_config('helpoint.abrindo_compra', 'sim', true);
  for r in
    select c.id as compra, c.tenant_id, c.created_by, c.created_at, c.updated_at, c.status, c.pagamento_em, c.rejection_reason,
           t.id as ticket, t.ticket_number, t.title, t.description, t.assigned_to, t.category_id
      from public.compras_solicitacoes c join public.tickets t on t.id = c.ticket_id
     where c.solicitacao_id is null
     order by c.created_at
  loop
    v_etapa := public.etapa_do_pedido_de_compra(r.status, r.pagamento_em is not null);
    -- O número do chamado vira o do pedido (o time conhece a compra por ele); já usado por outro pedido, ganha um novo.
    if exists (select 1 from public.solicitacoes where numero = r.ticket_number) then
      insert into public.solicitacoes (tenant_id, tipo, solicitante_id, para_id, titulo, detalhes, etapa, motivo_recusa, created_at, atualizada_em)
      values (r.tenant_id, 'compra', r.created_by, r.created_by, r.title, nullif(btrim(coalesce(r.description, '')), ''),
              v_etapa, case when v_etapa = 'recusada' then r.rejection_reason end, r.created_at, r.updated_at)
      returning id into v_pedido;
    else
      insert into public.solicitacoes (numero, tenant_id, tipo, solicitante_id, para_id, titulo, detalhes, etapa, motivo_recusa, created_at, atualizada_em)
      overriding system value
      values (r.ticket_number, r.tenant_id, 'compra', r.created_by, r.created_by, r.title,
              nullif(btrim(coalesce(r.description, '')), ''), v_etapa, case when v_etapa = 'recusada' then r.rejection_reason end,
              r.created_at, r.updated_at)
      returning id into v_pedido;
    end if;
    -- O "pediu" que `solicitacao_nasceu` grava leva a data da compra, não a de hoje.
    update public.solicitacoes_eventos set created_at = r.created_at where solicitacao_id = v_pedido and acao = 'pedir';

    -- A conversa e os registros do chamado, com a data e o autor de cada um.
    insert into public.solicitacoes_eventos (tenant_id, solicitacao_id, quem, acao, etapa, texto, created_at)
    select r.tenant_id, v_pedido, m.author_id, case when m.is_internal then 'registro' else 'escrever' end, v_etapa,
           m.content, m.created_at
      from public.ticket_comments m where m.ticket_id = r.ticket and btrim(coalesce(m.content, '')) <> '';

    -- Os avisos antigos passam a abrir o pedido.
    update public.notifications set reference_type = 'solicitacao', reference_id = v_pedido
     where reference_type = 'ticket' and reference_id = r.ticket;

    update public.compras_solicitacoes
       set solicitacao_id = v_pedido, comprador_id = r.assigned_to, category_id = r.category_id, ticket_id = null
     where id = r.compra;
  end loop;
  perform set_config('helpoint.abrindo_compra', '', true);

  -- Daqui em diante os pedidos novos continuam depois do maior número.
  perform setval(pg_get_serial_sequence('public.solicitacoes', 'numero'),
                 coalesce((select max(numero) from public.solicitacoes), 0) + 1, false);

  -- O chamado apagado leva junto o que é dele (conversa, anexos, estrelas): o que importava já foi copiado.
  delete from public.tickets t
   where t.module = 'compras'
     and not exists (select 1 from public.compras_solicitacoes c where c.ticket_id = t.id);
end;
$$;

alter table public.compras_solicitacoes drop column ticket_id;
alter table public.compras_solicitacoes alter column solicitacao_id set not null;
