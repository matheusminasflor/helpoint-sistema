-- CRM-4c, correções da auditoria. 2026-09-14.
--
-- Cinco achados, três deles no caminho que o cliente percorre sem fazer nada de
-- errado. O que é de banco está aqui; o que é de edge function está no mesmo
-- commit.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Nome comprido travava **todos** os leads de um anúncio
-- ───────────────────────────────────────────────────────────────────────────
-- `crm_deals.title` e `crm_contacts.name` aceitam 160 caracteres. O título era
-- montado com `form_name || ' — ' || nome`, ambos vindos da Meta e sem corte:
-- um formulário chamado "Formulário de captação de distribuidores da região
-- metropolitana de Belo Horizonte — campanha de verão 2026" estoura sozinho, e
-- todo lead daquele anúncio vira `erro` com uma mensagem do Postgres sobre
-- `crm_deals_title_check` — que ninguém de negócio decifra, e da qual não há
-- saída pela tela.
--
-- A casa já tinha a resposta escrita: `crm-lead-intake` (CRM-3a, o formulário
-- do site) corta com `slice(0, 160)` antes de gravar. Aqui é `left()`.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 2. A função não conferia quem a chamava
-- ───────────────────────────────────────────────────────────────────────────
-- `crm_lead_ads_aplicar` é `security definer` e executável por `authenticated`,
-- e o comentário dizia que ela "confere o tenant pelo próprio lead". Não
-- conferia: qualquer pessoa logada, com o id de um lead de outra empresa,
-- tirava aquele lead de `retido` e plantava uma mensagem de erro na tela deles.
-- O negócio não chegava a nascer (o `inject_tenant_id` de `crm_contacts`
-- barrava), mas escrita entre empresas atravessando o portão é justamente o que
-- a ADR-005 diz que não se presume.
--
-- A recusa sai pela **mesma porta** do "não encontrado": distinguir as duas
-- deixaria descobrir, um id por vez, o que existe na casa do vizinho.
create or replace function public.crm_lead_ads_aplicar(p_raw uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw     public.crm_lead_ads_raw;
  v_cfg     public.crm_lead_ads_forms;
  v_contato uuid;
  v_negocio uuid;
  v_nome    text;
  v_email   text;
  v_fone    text;
  v_wa      text;
  v_custom  jsonb := '{}'::jsonb;
  v_sobra   text := '';
  v_empresa text;
  k         text;
  v         jsonb;
  v_destino text;
  v_slug    text;
  v_tipo    text;
  v_txt     text;
  v_val     jsonb;
  v_titulo  text;
  v_erro    text;
begin
  select * into v_raw from public.crm_lead_ads_raw where id = p_raw;
  if not found then
    raise exception 'lead nao encontrado' using errcode = 'P0002';
  end if;

  -- Quem chega logado só alcança lead da própria empresa. A chave de serviço
  -- (o webhook) não tem `auth.uid()`, e continua passando: é ela que grava.
  if auth.uid() is not null
     and v_raw.tenant_id is distinct from public.get_user_tenant_id() then
    raise exception 'lead nao encontrado' using errcode = 'P0002';
  end if;

  if v_raw.status = 'aplicado' then
    return v_raw.deal_id;
  end if;

  select * into v_cfg from public.crm_lead_ads_forms
   where tenant_id = v_raw.tenant_id and form_id = v_raw.form_id and is_active;
  if not found then
    return null;
  end if;

  if v_raw.campos is null or v_raw.campos = '{}'::jsonb then
    update public.crm_lead_ads_raw
       set status = 'erro',
           erro = coalesce(nullif(v_raw.erro, ''),
             'o conteúdo deste lead não chegou da Meta — reconecte o Facebook em Marketing e peça o reenvio')
     where id = p_raw;
    return null;
  end if;

  begin
    v_nome  := coalesce(v_raw.campos->>'full_name',
                        trim(coalesce(v_raw.campos->>'first_name', '') || ' ' ||
                             coalesce(v_raw.campos->>'last_name', '')));
    v_email := v_raw.campos->>'email';
    v_fone  := coalesce(v_raw.campos->>'phone_number', v_raw.campos->>'phone');

    for k, v in select * from jsonb_each(v_raw.campos) loop
      if k in ('full_name', 'first_name', 'last_name', 'email', 'phone_number', 'phone') then
        continue;
      end if;
      v_destino := v_cfg.mapeamento->>k;
      v_txt := v #>> '{}';

      if v_destino like 'custom:%' then
        v_slug := substr(v_destino, 8);
        select f.type into v_tipo from public.crm_custom_fields f
         where f.tenant_id = v_raw.tenant_id and f.entity = 'contact' and f.key = v_slug;

        v_val := null;
        begin
          v_val := case v_tipo
            when 'number'  then to_jsonb(replace(trim(v_txt), ',', '.')::numeric)
            when 'boolean' then to_jsonb(lower(trim(v_txt)) in ('sim', 'true', '1', 'yes'))
            when 'date'    then to_jsonb(trim(v_txt)::date::text)
            else to_jsonb(v_txt)
          end;
        exception when others then
          v_val := null;  -- texto que não vira número/data: vai para a anotação
        end;

        if v_val is null then
          v_sobra := v_sobra || k || ': ' || coalesce(v_txt, '') || chr(10);
        else
          v_custom := v_custom || jsonb_build_object(v_slug, v_val);
        end if;

      elsif v_destino = 'company' then
        v_empresa := v_txt;
      elsif v_destino = 'name' then
        v_nome := v_txt;
      elsif v_destino = 'email' then
        v_email := v_txt;
      elsif v_destino = 'phone' then
        v_fone := v_txt;
      else
        v_sobra := v_sobra || k || ': ' || coalesce(v_txt, '') || chr(10);
      end if;
    end loop;

    v_wa := nullif(regexp_replace(coalesce(v_fone, ''), '\D', '', 'g'), '');
    if coalesce(trim(v_nome), '') = '' then
      v_nome := coalesce(v_email, v_fone, 'Lead do anúncio');
    end if;
    -- O corte é aqui, e não na tela: o texto vem da Meta e ninguém desta casa o
    -- digitou. Nome cortado é feio; lead pago que não entra é prejuízo.
    v_nome := left(trim(v_nome), 160);

    select id into v_contato from public.crm_contacts
     where tenant_id = v_raw.tenant_id
       and ((v_email is not null and lower(email) = lower(v_email))
            or (v_wa is not null and public.crm_telefone_chave(phone) = public.crm_telefone_chave(v_wa)))
     order by created_at limit 1;

    if not found then
      insert into public.crm_contacts
        (tenant_id, name, email, phone, company, segment_id, owner_id, source, custom)
      values (v_raw.tenant_id, v_nome, v_email, v_fone, v_empresa,
              v_cfg.segment_id, v_cfg.owner_id, 'facebook', v_custom)
      returning id into v_contato;
    elsif v_custom <> '{}'::jsonb then
      update public.crm_contacts
         set custom = coalesce(custom, '{}'::jsonb) || v_custom
       where id = v_contato;
    end if;

    v_titulo := left(coalesce(v_cfg.form_name, 'Anúncio') || ' — ' || v_nome, 160);

    insert into public.crm_deals (tenant_id, contact_id, stage_id, title, source, owner_id)
    values (v_raw.tenant_id, v_contato, v_cfg.stage_id, v_titulo, 'facebook', v_cfg.owner_id)
    returning id into v_negocio;

    if v_sobra <> '' then
      insert into public.crm_deal_activities (tenant_id, deal_id, kind, content)
      values (v_raw.tenant_id, v_negocio, 'note',
              'Respostas do formulário do anúncio:' || chr(10) || v_sobra);
    end if;

  exception when others then
    v_erro := left(sqlerrm, 400);
    update public.crm_lead_ads_raw set status = 'erro', erro = v_erro where id = p_raw;
    return null;
  end;

  update public.crm_lead_ads_raw
     set status = 'aplicado', deal_id = v_negocio, erro = null
   where id = p_raw;

  return v_negocio;
end;
$$;
revoke execute on function public.crm_lead_ads_aplicar(uuid) from public, anon;
grant execute on function public.crm_lead_ads_aplicar(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Corrigir o mapeamento tem de bastar para o lead entrar
-- ───────────────────────────────────────────────────────────────────────────
-- A migration `20261004020000` prometeu isso e não entregou: o trigger só
-- ouvia `pipeline_id`, `stage_id` e `is_active`. Funcionava por acidente, porque
-- a tela manda o registro inteiro em todo PATCH — e `UPDATE OF` dispara pela
-- coluna **mencionada**, não pela que mudou de valor. Qualquer edição parcial,
-- ou um `update` por SQL, quebrava a promessa em silêncio.
drop trigger if exists trg_crm_lead_ads_soltar_retidos on public.crm_lead_ads_forms;
create trigger trg_crm_lead_ads_soltar_retidos
  after insert or update of pipeline_id, stage_id, segment_id, owner_id, mapeamento, is_active
  on public.crm_lead_ads_forms
  for each row when (new.is_active)
  execute function public.crm_lead_ads_soltar_retidos();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. O formulário era único no mundo — e isso virava sequestro
-- ───────────────────────────────────────────────────────────────────────────
-- `crm_lead_ads_forms_form_idx` era `unique (form_id)`, sem `tenant_id`. Como
-- `form_id` é texto livre e o id de um formulário é visível para quem inspeciona
-- um anúncio, um gestor de qualquer empresa podia cadastrar o formulário de
-- outra: a dona nunca mais conseguiria ligar o dela ("já está ligado"), sem
-- sequer ver a linha que a bloqueia, e todos os leads pagos dela ficariam
-- retidos. Era também oráculo — dizia se outro cliente do Helpoint já tinha
-- ligado aquele formulário.
--
-- O índice existia para impedir que o lead caísse na casa errada, e para isso
-- ele nunca foi necessário: `crm_lead_ads_aplicar` busca a configuração por
-- `(tenant_id, form_id)`, e o `tenant_id` vem da **página** que mandou o lead.
-- A unicidade certa é por empresa, e ela já existe (`crm_lead_ads_forms_unico`).
drop index if exists public.crm_lead_ads_forms_form_idx;

-- No lugar, a pergunta que faltava: **esta página é desta empresa?** Sem isto,
-- `page_id` e `form_id` continuavam texto livre.
create or replace function public.crm_lead_ads_pagina_e_da_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.mkt_social_accounts a
     where a.tenant_id = new.tenant_id
       and a.page_id = new.page_id
       and a.platform = 'facebook'
  ) then
    raise exception 'esta página do Facebook não está conectada nesta empresa — conecte-a em Marketing antes de ligar o formulário'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger trg_crm_lead_ads_pagina_e_da_empresa
  before insert or update of page_id on public.crm_lead_ads_forms
  for each row execute function public.crm_lead_ads_pagina_e_da_empresa();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Reconectar a página criava uma segunda linha — e o lead sumia
-- ───────────────────────────────────────────────────────────────────────────
-- `mkt-meta-oauth` grava com `insert` puro e não havia índice único: cada
-- reconexão do Facebook deixava mais uma conta ativa com o mesmo `page_id`.
-- Com duas, o `maybeSingle()` do webhook vira erro do PostgREST, a função
-- devolve 500, a Meta reentrega, 500 de novo — e o lead pago **não chega a ser
-- gravado**. É o oposto do que esta leva prometeu, e o gatilho é o primeiro
-- passo da instalação: reconectar a página para ganhar a permissão de ler leads.
--
-- Antes do índice, as sobras. Elas não se apagam — apagar conta de Marketing é
-- perder histórico de publicação. O que se tira é a **chave**: a linha mais
-- antiga fica, sem `page_id`, e para de disputar.
with ranqueadas as (
  select id, row_number() over (
           partition by platform, page_id order by created_at desc, id desc) as pos
    from public.mkt_social_accounts
   where page_id is not null
)
update public.mkt_social_accounts a
   set page_id = null
  from ranqueadas r
 where a.id = r.id and r.pos > 1;

-- `(platform, page_id)` e não `page_id` sozinho: a conta do Instagram guarda o
-- id da **página** do Facebook a que pertence, então as duas convivem.
-- Não é parcial de propósito — `NULL` já não conflita no Postgres, e um índice
-- parcial não serve de alvo para o `ON CONFLICT` do upsert.
create unique index if not exists mkt_social_accounts_plataforma_pagina_unico
  on public.mkt_social_accounts (platform, page_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. TRUNCATE ignora RLS
-- ───────────────────────────────────────────────────────────────────────────
-- O `revoke insert, update, delete` da leva deixou o TRUNCATE de pé, e ele passa
-- por cima de toda policy. Hoje não há caminho (o PostgREST não o expõe), mas o
-- privilégio não tinha por que existir. As outras tabelas do repositório estão
-- na mesma situação — é varredura própria, não desta leva.
revoke truncate on public.crm_lead_ads_raw, public.crm_lead_ads_forms from authenticated;
