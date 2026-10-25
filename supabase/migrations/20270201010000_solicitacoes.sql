-- SOLICITAÇÕES (proposta "Helpoint no dia a dia", etapa 4b; decisões do dono de 2026-10-24 e 2026-10-25).
--
-- O chamado é um PROBLEMA: alguém atende, conversa, resolve, e o prazo conta. A solicitação é um PEDIDO COM ETAPAS:
-- alguém pede, alguém aprova ou recusa, alguém entrega. Uma tabela só para os pedidos que saem do chamado:
--
--   tipo             setor       etapas (e quem age em cada uma)
--   arte             marketing   pedido →(Marketing aceita)→ aceita →(Marketing entrega o arquivo)→ entregue
--   acesso           ti          pedido →(gestor aprova)→ aprovada →(TI libera)→ liberada
--   reembolso        financeiro  pedido →(gestor aprova; nasce a conta a pagar)→ aprovada →(Financeiro paga)→ paga
--   adiantamento     financeiro  … → paga →(a pessoa presta contas)→ prestando_contas →(Financeiro confere)→ concluida
--   rh_dados, rh_beneficio, rh_documento, rh_duvida, rh_confidencial
--                    rh          pedido →(RH)→ em_andamento →(RH)→ concluida
--   em qualquer uma: recusada (com motivo), e cancelada (quem pediu, enquanto está em "pedido").
--
-- Decisões que moram aqui: "gestor do setor" = `gestores_da_pessoa` (perfil Gestor num setor da pessoa; ninguém → os
-- administradores; a regra das férias). Reembolso exige o comprovante no pedido (a tela o anexa antes de enviar, e o
-- gestor só aprova com anexo). Acesso: a pessoa pede para si, ou o gestor pede para alguém da equipe. Arte tem
-- "preciso até". A conversa confidencial com o RH só o RH com "Decidir" vê — nem o gestor.
--
-- Escrita só por `solicitacao_agir` (security definer, cada ação confere quem é): a tabela não tem policy de UPDATE.

create table if not exists public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  tipo text not null check (tipo in ('arte', 'acesso', 'reembolso', 'adiantamento',
                                     'rh_dados', 'rh_beneficio', 'rh_documento', 'rh_duvida', 'rh_confidencial')),
  setor text not null generated always as (case
    when tipo = 'arte' then 'marketing'
    when tipo = 'acesso' then 'ti'
    when tipo in ('reembolso', 'adiantamento') then 'financeiro'
    else 'rh' end) stored,
  solicitante_id uuid not null default auth.uid() references public.profiles(id),
  para_id uuid not null default auth.uid() references public.profiles(id),
  titulo text not null check (btrim(titulo) <> ''),
  detalhes text,
  dados jsonb not null default '{}'::jsonb,
  valor numeric check (valor is null or valor > 0),
  preciso_ate date,
  etapa text not null default 'pedido' check (etapa in ('pedido', 'aceita', 'aprovada', 'em_andamento', 'paga',
    'prestando_contas', 'entregue', 'liberada', 'concluida', 'recusada', 'cancelada')),
  motivo_recusa text,
  fin_entry_id uuid references public.fin_entries(id) on delete set null,
  atualizada_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (tipo not in ('reembolso', 'adiantamento') or valor is not null)
);
create index if not exists solicitacoes_do_setor on public.solicitacoes (tenant_id, setor, etapa);
create index if not exists solicitacoes_da_pessoa on public.solicitacoes (solicitante_id);
alter table public.solicitacoes enable row level security;

create table if not exists public.solicitacoes_eventos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  quem uuid references public.profiles(id),
  acao text not null,
  etapa text not null,
  texto text,
  created_at timestamptz not null default now()
);
create index if not exists solicitacoes_eventos_da on public.solicitacoes_eventos (solicitacao_id, created_at);
alter table public.solicitacoes_eventos enable row level security;

create table if not exists public.solicitacoes_anexos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  nome text not null,
  caminho text not null,
  tamanho bigint,
  momento text not null default 'pedido' check (momento in ('pedido', 'entrega', 'prestacao')),
  enviado_por uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.solicitacoes_anexos enable row level security;

-- A conta a pagar que nasce do reembolso ou do adiantamento, para o pagamento voltar à solicitação.
alter table public.fin_entries add column if not exists solicitacao_id uuid references public.solicitacoes(id) on delete set null;

-- ─── Quem vê e quem decide ─────────────────────────────────────────────────────────────────────────────────
-- Precisa da aprovação do gestor antes do setor agir.
create or replace function public.solicitacao_pede_gestor(p_tipo text)
returns boolean language sql immutable as $$ select p_tipo in ('acesso', 'reembolso', 'adiantamento') $$;

-- O setor de destino age (aceitar, entregar, liberar, pagar, conferir, concluir): "Decidir" em Solicitações do setor.
create or replace function public.solicitacao_setor_decide(p_setor text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid()) or public.pode_no_setor(p_setor, 'solicitacoes', 'decidir')
$$;
revoke all on function public.solicitacao_setor_decide(text) from public, anon;
grant execute on function public.solicitacao_setor_decide(text) to authenticated;

-- Sou gestor da pessoa (`gestores_da_pessoa` é fechada; esta é a pergunta que a policy pode fazer).
create or replace function public.sou_gestor_de(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() in (select public.gestores_da_pessoa(p_user))
$$;
revoke all on function public.sou_gestor_de(uuid) from public, anon;
grant execute on function public.sou_gestor_de(uuid) to authenticated;

-- Vê a solicitação (pela linha já lida, sem reconsultar a tabela — lição 13).
create or replace function public.solicitacao_visivel(p_tipo text, p_setor text, p_solicitante uuid, p_para uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() in (p_solicitante, p_para)
      or (p_tipo = 'rh_confidencial' and public.solicitacao_setor_decide('rh'))
      or (p_tipo <> 'rh_confidencial'
          and (public.is_admin_or_higher(auth.uid())
               or public.pode_no_setor(p_setor, 'solicitacoes', 'view')
               or (public.solicitacao_pede_gestor(p_tipo) and public.sou_gestor_de(p_para))))
$$;
revoke all on function public.solicitacao_visivel(text, text, uuid, uuid) from public, anon;
grant execute on function public.solicitacao_visivel(text, text, uuid, uuid) to authenticated;

create policy solicitacoes_le on public.solicitacoes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (solicitante_id = auth.uid() or para_id = auth.uid() or public.solicitacao_visivel(tipo, setor, solicitante_id, para_id)));
-- Pedir: em meu nome, na etapa inicial; para outra pessoa só o acesso, e só o gestor dela.
create policy solicitacoes_pede on public.solicitacoes for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
              and solicitante_id = auth.uid() and etapa = 'pedido' and motivo_recusa is null and fin_entry_id is null
              and (para_id = auth.uid()
                   or (tipo = 'acesso' and public.sou_gestor_de(para_id))));

create policy solicitacoes_eventos_le on public.solicitacoes_eventos for select to authenticated
  using (exists (select 1 from public.solicitacoes s where s.id = solicitacao_id));

create policy solicitacoes_anexos_le on public.solicitacoes_anexos for select to authenticated
  using (exists (select 1 from public.solicitacoes s where s.id = solicitacao_id));
-- Anexa quem pediu (pedido e prestação de contas) e o setor que entrega (entrega da arte).
create policy solicitacoes_anexos_anexa on public.solicitacoes_anexos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and enviado_por = auth.uid()
              and exists (select 1 from public.solicitacoes s where s.id = solicitacao_id
                            and ((momento in ('pedido', 'prestacao') and s.solicitante_id = auth.uid())
                                 or (momento = 'entrega' and public.solicitacao_setor_decide(s.setor)))));

-- ─── Avisos ────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.solicitacao_avisa(p_id uuid, p_para uuid[], p_titulo text, p_texto text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select s.tenant_id, u, 'solicitacao', 'solicitacao', s.id, p_titulo, p_texto
    from public.solicitacoes s, (select distinct x as u from unnest(p_para) x) d
   where s.id = p_id and u is not null and u <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
$$;
revoke all on function public.solicitacao_avisa(uuid, uuid[], text, text) from public, anon, authenticated;

-- Quem age no setor: os que têm "Decidir" em Solicitações daquele setor (e o módulo dele).
create or replace function public.quem_decide_no_setor(p_tenant uuid, p_setor text)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct uap.user_id), '{}')
    from public.user_access_profiles uap
    join public.access_profiles ap on ap.id = uap.profile_id
    join public.user_module_access m on m.user_id = uap.user_id and m.module = ap.department
    join public.profiles p on p.id = uap.user_id and coalesce(p.is_active, true)
   where ap.tenant_id = p_tenant and ap.department = p_setor
     and coalesce((ap.permissions -> 'solicitacoes' ->> 'decidir')::boolean, false)
$$;
revoke all on function public.quem_decide_no_setor(uuid, text) from public, anon, authenticated;

create or replace function public.rotulo_da_solicitacao(p_tipo text)
returns text language sql immutable as $$
  select case p_tipo when 'arte' then 'Pedido de arte' when 'acesso' then 'Pedido de acesso'
    when 'reembolso' then 'Reembolso' when 'adiantamento' then 'Adiantamento'
    when 'rh_dados' then 'Atualizar meus dados' when 'rh_beneficio' then 'Benefício'
    when 'rh_documento' then 'Pedido de documento' when 'rh_duvida' then 'Dúvida de folha'
    else 'Conversa com o RH' end
$$;

-- Nasceu: o primeiro evento e o aviso a quem age primeiro (o gestor, ou o setor).
create or replace function public.solicitacao_nasceu()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  insert into public.solicitacoes_eventos (tenant_id, solicitacao_id, quem, acao, etapa, texto)
  values (new.tenant_id, new.id, new.solicitante_id, 'pedir', 'pedido', null);
  select coalesce(full_name, email) into v_nome from public.profiles where id = new.para_id;
  if public.solicitacao_pede_gestor(new.tipo) then
    perform public.solicitacao_avisa(new.id, array(select public.gestores_da_pessoa(new.para_id)),
      public.rotulo_da_solicitacao(new.tipo) || ' para você aprovar', v_nome || ': ' || new.titulo);
  else
    perform public.solicitacao_avisa(new.id, public.quem_decide_no_setor(new.tenant_id, new.setor),
      public.rotulo_da_solicitacao(new.tipo) || ' novo', v_nome || ': ' || new.titulo);
  end if;
  return null;
end;
$$;
revoke all on function public.solicitacao_nasceu() from public, anon, authenticated;
drop trigger if exists trg_solicitacao_nasceu on public.solicitacoes;
create trigger trg_solicitacao_nasceu after insert on public.solicitacoes
  for each row execute function public.solicitacao_nasceu();

-- ─── Agir ──────────────────────────────────────────────────────────────────────────────────────────────────
-- p_acao: aprovar · recusar · aceitar · entregar · liberar · andamento · concluir · prestar_contas · cancelar.
-- O pagamento (aprovada → paga) não passa por aqui: é a conta a pagar sendo paga no Financeiro (trigger abaixo).
create or replace function public.solicitacao_agir(p_id uuid, p_acao text, p_texto text default null, p_dados jsonb default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.solicitacoes%rowtype;
  v_nova text;
  v_eu uuid := auth.uid();
  v_gestor boolean;
  v_setor boolean;
  v_conta uuid;
  v_nome text;
begin
  select * into s from public.solicitacoes where id = p_id and tenant_id = public.get_user_tenant_id() for update;
  if not found then raise exception 'Solicitação não encontrada.' using errcode = 'P0002'; end if;
  v_gestor := public.is_admin_or_higher(v_eu) or v_eu in (select public.gestores_da_pessoa(s.para_id));
  v_setor := public.solicitacao_setor_decide(s.setor);
  select coalesce(full_name, email) into v_nome from public.profiles where id = s.para_id;

  if p_acao = 'cancelar' then
    if v_eu <> s.solicitante_id or s.etapa <> 'pedido' then
      raise exception 'Só quem pediu cancela, e só antes de alguém decidir.' using errcode = '42501';
    end if;
    v_nova := 'cancelada';

  elsif p_acao = 'recusar' then
    if btrim(coalesce(p_texto, '')) = '' then raise exception 'Escreva o motivo da recusa.' using errcode = '23514'; end if;
    if s.etapa = 'pedido' and public.solicitacao_pede_gestor(s.tipo) then
      if not v_gestor then raise exception 'Quem recusa é o gestor de %.', v_nome using errcode = '42501'; end if;
    elsif s.etapa in ('pedido', 'aceita', 'aprovada', 'em_andamento') then
      if not v_setor then raise exception 'Recusar pede "Decidir" em Solicitações do setor.' using errcode = '42501'; end if;
    else
      raise exception 'Esta solicitação não se recusa mais.' using errcode = '23514';
    end if;
    v_nova := 'recusada';

  elsif p_acao = 'aprovar' then
    if s.etapa <> 'pedido' or not public.solicitacao_pede_gestor(s.tipo) then
      raise exception 'Esta solicitação não espera aprovação.' using errcode = '23514';
    end if;
    if not v_gestor then raise exception 'Quem aprova é o gestor de %.', v_nome using errcode = '42501'; end if;
    if s.tipo = 'reembolso' and not exists (select 1 from public.solicitacoes_anexos a where a.solicitacao_id = s.id and a.momento = 'pedido') then
      raise exception 'O reembolso precisa do comprovante anexado antes de aprovar.' using errcode = '23514';
    end if;
    v_nova := 'aprovada';
    -- Reembolso e adiantamento: nasce a conta a pagar, que o Financeiro paga em Contas a pagar.
    if s.tipo in ('reembolso', 'adiantamento') then
      insert into public.fin_entries (tenant_id, kind, description, category, counterparty, amount, due_date, status,
                                      competence, source, notes, created_by, solicitacao_id)
      values (s.tenant_id, 'payable', public.rotulo_da_solicitacao(s.tipo) || ' #' || s.numero || ' — ' || s.titulo,
              s.tipo, v_nome, s.valor, (now() at time zone 'America/Sao_Paulo')::date, 'pending',
              date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date, 'solicitacao', s.detalhes, v_eu, s.id)
      returning id into v_conta;
      update public.solicitacoes set fin_entry_id = v_conta where id = s.id;
    end if;

  elsif p_acao = 'aceitar' then
    if s.tipo <> 'arte' or s.etapa <> 'pedido' then raise exception 'Só o pedido de arte se aceita.' using errcode = '23514'; end if;
    if not v_setor then raise exception 'Aceitar pede "Decidir" em Solicitações do Marketing.' using errcode = '42501'; end if;
    v_nova := 'aceita';
    -- Ao aceitar, o Marketing pode propor outra data.
    if p_dados ? 'preciso_ate' then
      update public.solicitacoes set preciso_ate = (p_dados ->> 'preciso_ate')::date where id = s.id;
    end if;

  elsif p_acao = 'entregar' then
    if s.tipo <> 'arte' or s.etapa <> 'aceita' then raise exception 'Só a arte aceita se entrega.' using errcode = '23514'; end if;
    if not v_setor then raise exception 'Entregar pede "Decidir" em Solicitações do Marketing.' using errcode = '42501'; end if;
    if not exists (select 1 from public.solicitacoes_anexos a where a.solicitacao_id = s.id and a.momento = 'entrega') then
      raise exception 'Anexe o arquivo da arte antes de entregar.' using errcode = '23514';
    end if;
    v_nova := 'entregue';

  elsif p_acao = 'liberar' then
    if s.tipo <> 'acesso' or s.etapa <> 'aprovada' then raise exception 'Só o acesso aprovado se libera.' using errcode = '23514'; end if;
    if not v_setor then raise exception 'Liberar pede "Decidir" em Solicitações da TI.' using errcode = '42501'; end if;
    v_nova := 'liberada';
    -- O acesso fica registrado na pessoa e entra sozinho no chamado de desligamento.
    insert into public.employee_access_grants (tenant_id, employee_id, employee_name, access_type, name, details, granted_at, granted_by)
    values (s.tenant_id, s.para_id, v_nome,
            case when s.dados ->> 'tipo_acesso' in ('sistema', 'email', 'pasta', 'equipamento', 'outro') then s.dados ->> 'tipo_acesso' else 'outro' end,
            s.titulo,
            jsonb_build_object('note', s.detalhes, 'solicitacao', s.numero), now(), v_eu);

  elsif p_acao in ('andamento', 'concluir') then
    if s.setor = 'rh' then
      if not v_setor then raise exception 'Pede "Decidir" em Solicitações do RH.' using errcode = '42501'; end if;
      if p_acao = 'andamento' and s.etapa <> 'pedido' then raise exception 'Já está em andamento.' using errcode = '23514'; end if;
      if p_acao = 'concluir' and s.etapa not in ('pedido', 'em_andamento') then raise exception 'Não se conclui nesta etapa.' using errcode = '23514'; end if;
      v_nova := case p_acao when 'andamento' then 'em_andamento' else 'concluida' end;
    elsif s.tipo = 'adiantamento' and p_acao = 'concluir' then
      if s.etapa <> 'prestando_contas' then raise exception 'O adiantamento se conclui depois da prestação de contas.' using errcode = '23514'; end if;
      if not v_setor then raise exception 'Conferir pede "Decidir" em Solicitações do Financeiro.' using errcode = '42501'; end if;
      v_nova := 'concluida';
    else
      raise exception 'Ação que não vale para este pedido.' using errcode = '23514';
    end if;

  elsif p_acao = 'prestar_contas' then
    if s.tipo <> 'adiantamento' or s.etapa <> 'paga' then raise exception 'Presta contas o adiantamento já pago.' using errcode = '23514'; end if;
    if v_eu <> s.solicitante_id then raise exception 'Quem presta contas é quem pediu.' using errcode = '42501'; end if;
    if p_dados is null or not (p_dados ? 'gasto') then raise exception 'Diga quanto foi gasto.' using errcode = '23514'; end if;
    if not exists (select 1 from public.solicitacoes_anexos a where a.solicitacao_id = s.id and a.momento = 'prestacao') then
      raise exception 'Anexe os comprovantes do que foi gasto.' using errcode = '23514';
    end if;
    update public.solicitacoes set dados = dados || jsonb_build_object('gasto', (p_dados ->> 'gasto')::numeric,
      'sobra', greatest(valor - (p_dados ->> 'gasto')::numeric, 0)) where id = s.id;
    v_nova := 'prestando_contas';

  else
    raise exception 'Ação desconhecida: %', p_acao using errcode = '22023';
  end if;

  update public.solicitacoes
     set etapa = v_nova, atualizada_em = now(),
         motivo_recusa = case when v_nova = 'recusada' then btrim(p_texto) else motivo_recusa end
   where id = s.id;
  insert into public.solicitacoes_eventos (tenant_id, solicitacao_id, quem, acao, etapa, texto)
  values (s.tenant_id, s.id, v_eu, p_acao, v_nova, nullif(btrim(coalesce(p_texto, '')), ''));

  -- Quem pediu fica sabendo de toda decisão; e quem age a seguir, da vez dele.
  perform public.solicitacao_avisa(s.id, array[s.solicitante_id, s.para_id],
    public.rotulo_da_solicitacao(s.tipo) || ': ' || case v_nova
      when 'aprovada' then 'aprovado' when 'recusada' then 'recusado' when 'aceita' then 'aceito pelo Marketing'
      when 'entregue' then 'entregue' when 'liberada' then 'acesso liberado' when 'em_andamento' then 'em andamento'
      when 'concluida' then 'concluído' when 'prestando_contas' then 'prestação de contas enviada' else v_nova end,
    s.titulo || case when v_nova = 'recusada' then ' — ' || btrim(p_texto) else '' end);
  if v_nova = 'aprovada' or v_nova = 'prestando_contas' then
    perform public.solicitacao_avisa(s.id, public.quem_decide_no_setor(s.tenant_id, s.setor),
      public.rotulo_da_solicitacao(s.tipo) || case when v_nova = 'aprovada' then ' aprovado: é a vez do setor' else ': conferir a prestação de contas' end,
      v_nome || ': ' || s.titulo);
  end if;
  return v_nova;
end;
$$;
revoke all on function public.solicitacao_agir(uuid, text, text, jsonb) from public, anon;
grant execute on function public.solicitacao_agir(uuid, text, text, jsonb) to authenticated;

-- Pagar a conta no Financeiro paga a solicitação (o adiantamento passa a esperar a prestação de contas).
create or replace function public.solicitacao_paga_pela_conta()
returns trigger language plpgsql security definer set search_path = public as $$
declare s public.solicitacoes%rowtype;
begin
  if new.solicitacao_id is null or new.status <> 'paid' or old.status = 'paid' then return null; end if;
  select * into s from public.solicitacoes where id = new.solicitacao_id;
  if not found or s.etapa <> 'aprovada' then return null; end if;
  update public.solicitacoes set etapa = 'paga', atualizada_em = now() where id = s.id;
  insert into public.solicitacoes_eventos (tenant_id, solicitacao_id, quem, acao, etapa, texto)
  values (s.tenant_id, s.id, auth.uid(), 'pagar', 'paga', null);
  perform public.solicitacao_avisa(s.id, array[s.solicitante_id, s.para_id],
    public.rotulo_da_solicitacao(s.tipo) || ': pago',
    s.titulo || case when s.tipo = 'adiantamento' then ' — depois, anexe os comprovantes e preste contas' else '' end);
  return null;
end;
$$;
revoke all on function public.solicitacao_paga_pela_conta() from public, anon, authenticated;
drop trigger if exists trg_solicitacao_paga_pela_conta on public.fin_entries;
create trigger trg_solicitacao_paga_pela_conta after update of status on public.fin_entries
  for each row execute function public.solicitacao_paga_pela_conta();

-- ─── Os arquivos ───────────────────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('solicitacoes', 'solicitacoes', false) on conflict (id) do nothing;
-- Caminho: <tenant>/<solicitacao>/<arquivo>. Lê e grava quem vê a solicitação (a gravação na tabela confere o resto).
create policy solicitacoes_arquivos_le on storage.objects for select to authenticated
  using (bucket_id = 'solicitacoes'
         and exists (select 1 from public.solicitacoes s where s.id::text = (storage.foldername(name))[2]));
create policy solicitacoes_arquivos_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'solicitacoes'
              and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
              and exists (select 1 from public.solicitacoes s where s.id::text = (storage.foldername(name))[2]));

-- ─── Permissões: "Solicitações" em Marketing, TI, Financeiro e RH, ligada para quem já atende ──────────────
-- Nenhuma opção nova tira acesso: "Ver" para quem vê os chamados do setor, "Decidir" para quem muda o status deles.
create or replace function public.perfis_ganham_solicitacoes(p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.access_profiles
     set permissions = permissions || jsonb_build_object('solicitacoes', coalesce(permissions -> 'solicitacoes', '{}'::jsonb)
       || jsonb_build_object('view', coalesce((permissions -> 'tickets' ->> 'view_all')::boolean, false),
                             'decidir', coalesce((permissions -> 'tickets' ->> 'change_status')::boolean, false)))
   where tenant_id = p_tenant and department in ('marketing', 'ti', 'financeiro', 'rh')
     and not (permissions ? 'solicitacoes');
end;
$$;
revoke all on function public.perfis_ganham_solicitacoes(uuid) from public, anon, authenticated;
select public.perfis_ganham_solicitacoes(t.id) from public.tenants t;

create or replace function public.seed_default_categories_novos_modulos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare d text;
begin
  perform public.seed_categorias_comercial_educacional(new.id);
  perform public.seed_categorias_expedicao_producao(new.id);
  foreach d in array array['ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'comercial', 'educacional',
                           'expedicao', 'producao'] loop
    perform public.seed_default_access_profiles(new.id, d);
  end loop;
  perform public.completar_perfis_do_financeiro(new.id);
  perform public.seed_perfis_de_compras(new.id);
  perform public.perfis_ganham_acoes_de_chamado(new.id);
  perform public.perfis_ganham_secoes_da_etapa_0b(new.id);
  perform public.perfis_ganham_solicitacoes(new.id);
  insert into public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  values (new.id, 'diretoria', 'Diretor', 'Vê todas as telas da Diretoria', true,
          '{"resumo": {"view": true}, "indicadores": {"view": true, "definir_metas": true}, "metas": {"view": true},
            "clientes": {"view": true}, "produtos": {"view": true}, "diretrizes": {"view": true}}'::jsonb)
  on conflict (tenant_id, department, name) do nothing;
  return new;
end;
$$;

-- Lição 14: nada novo alcançável por quem não entrou.
revoke all on function public.solicitacao_pede_gestor(text) from public, anon;
grant execute on function public.solicitacao_pede_gestor(text) to authenticated;
revoke all on function public.rotulo_da_solicitacao(text) from public, anon;
grant execute on function public.rotulo_da_solicitacao(text) to authenticated;
