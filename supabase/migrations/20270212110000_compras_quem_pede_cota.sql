-- QUEM PEDE A COMPRA TRAZ OS TRÊS ORÇAMENTOS (dono, 2026-10-29): "Hoje está confuso: a pessoa consegue pôr 1 orçamento
-- apenas e, quando chega no setor de compras, ele coloca os demais. O ideal é o setor que está pedindo passar os
-- orçamentos, no mínimo 3, e uma breve descrição para, caso necessário, escrever o motivo. Após enviar, cai no setor
-- de compras e aguarda a aprovação da diretoria ou de quem pode aprovar; aprovado, Compras segue para comprar."
--
-- Decisões do dono (2026-10-29, todas as recomendadas):
--   * no mínimo 3 orçamentos; com 1 ou 2, quem pede escreve o porquê (`few_quotes_reason`), e quem aprova o vê;
--   * a Caixinha segue sem exigir os três (como já era na aprovação);
--   * quem pede pode recomendar um orçamento, com o motivo (já existia no banco; a tela passa a mandar);
--   * Compras NÃO inclui orçamento depois: faltou, quem aprova devolve "Em ajuste" e quem pediu corrige.
-- Quem aprova não muda: a caixinha "Aprovar / reprovar compra" (hoje, na Minasflor, ninguém a tem — só o dono e o
-- admin decidem).

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

-- ─── 1. Abrir o pedido: três orçamentos, ou o porquê ─────────────────────────────────────────────
select pg_temp.troca('public.compras_abrir_pedido(jsonb, jsonb, jsonb)'::regprocedure,
  '  v_estimado numeric;', '  v_estimado numeric;
  v_n int;');
select pg_temp.troca('public.compras_abrir_pedido(jsonb, jsonb, jsonb)'::regprocedure,
  'unidade, motivo_recomendacao, estimated_amount, created_by, caixinha_id', 'unidade, motivo_recomendacao, estimated_amount, created_by, caixinha_id, few_quotes_reason');
select pg_temp.troca('public.compras_abrir_pedido(jsonb, jsonb, jsonb)'::regprocedure,
  $$v_estimado, v_eu, nullif(p_pedido ->> 'caixinha_id', '')::uuid$$,
  $$v_estimado, v_eu, nullif(p_pedido ->> 'caixinha_id', '')::uuid,
    nullif(trim(coalesce(p_pedido ->> 'few_quotes_reason', '')), '')$$);
-- Depois de gravar (a compra já sabe se é da Caixinha): conta os orçamentos de verdade.
select pg_temp.troca('public.compras_abrir_pedido(jsonb, jsonb, jsonb)'::regprocedure,
  '  -- O recomendado é o orçamento marcado por quem pediu (opcional).',
  '  if not coalesce((select s.caixinha from public.compras_solicitacoes s where s.id = v_pedido), false) then
    select count(*) into v_n from public.compras_orcamentos q where q.request_id = v_pedido;
    if v_n = 0 then
      raise exception ''Informe os orçamentos da compra: no mínimo três (fornecedor e valor de cada um).'' using errcode = ''23514'';
    end if;
    if v_n < 3 and (select s.few_quotes_reason from public.compras_solicitacoes s where s.id = v_pedido) is null then
      raise exception ''Com % orçamento(s), escreva por que não há três (fornecedor único, urgência…).'', v_n using errcode = ''23514'';
    end if;
  end if;

  -- O recomendado é o orçamento marcado por quem pediu (opcional).');

-- ─── 2. A justificativa é de quem pediu: não se apaga ao voltar para análise nem ao recusar ──────
-- (Antes quem aprova a escrevia, e ela se apagava quando a compra voltava para análise.) Reenviada depois de um
-- ajuste com menos de três, o porquê continua obrigatório.
create or replace function public.compras_exige_tres_orcamentos()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_quantos integer;
  v_antes   text := case when tg_op = 'UPDATE' then old.status::text else null end;
begin
  if tg_op = 'INSERT' and new.status::text = 'completed' then
    raise exception 'compra não nasce concluída: ela é aberta para análise e passa pela aprovação'
      using errcode = '23514';
  end if;
  if new.status::text = 'pending_approval' and v_antes = 'adjustment_requested' and not new.caixinha then
    select count(*) into v_quantos from public.compras_orcamentos q where q.request_id = new.id and q.tenant_id = new.tenant_id;
    if v_quantos < 3 and coalesce(trim(new.few_quotes_reason), '') = '' then
      raise exception 'com % orçamento(s), escreva por que não há três antes de reenviar', v_quantos using errcode = '23514';
    end if;
    return new;
  end if;
  if new.status::text <> 'approved' or v_antes = 'approved' or new.caixinha then
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
$$;

-- ─── 3. Compras não cota mais: os orçamentos são de quem pede ────────────────────────────────────
drop policy if exists compras_orcamentos_quem_compra_cota on public.compras_orcamentos;
