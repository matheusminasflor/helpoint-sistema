-- Correções da auditoria da Frente 7d (2026-09-25). Duas duras e uma mentira.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1 (quebra o CI) — `unaccent` não é criada por migration nenhuma
--
-- `normalizar_nome_carteira` chamava `extensions.unaccent`. A extensão existe
-- no test-helpoint porque alguém a habilitou pelo painel, FORA do repositório
-- — `grep -ri unaccent supabase/` só achava a própria chamada. Num banco do
-- zero (que é o que o CI monta) a migration falharia na criação da função,
-- antes de qualquer teste rodar.
--
-- E o conserto certo não é `create extension`: é PARAR de depender dela.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 2 (mentira no comentário, e divergência real) — as duas normalizações
--    NÃO casavam
--
-- O comentário da 20261025050000 afirmava: "`unaccent` reproduz o mesmo strip
-- de diacríticos que o `normalize('NFD').replace(...)` do JavaScript faz —
-- conferido caso a caso, não por suposição". Não foi conferido, e não
-- reproduz. Medido pela auditoria, com os mesmos 16 casos dos dois lados:
--
--   entrada        unaccent (SQL)   NFD (TS)      divergem?
--   Øresund        ORESUND          ØRESUND       SIM
--   Łódź           LODZ             ŁODZ          SIM
--   Ação–Nova      ACAO-NOVA        ACAO–NOVA     SIM (en dash virou hífen)
--   "VIP" + NBSP   "VIP " (4)       "VIP" (3)     SIM (JS trim leva NBSP)
--
-- Os dois testes tinham dois casos cada, ambos na faixa onde as funções
-- coincidem — não pegariam nenhuma dessas linhas.
--
-- Agora o SQL faz EXATAMENTE o que o JavaScript faz: `normalize(NFD)`
-- (nativo do Postgres desde a 13, sem extensão), tira as marcas combinantes
-- U+0300–U+036F, tira espaço das pontas INCLUINDO NBSP e tabulação — que é
-- o que `String.prototype.trim` considera espaço — e sobe para maiúscula.
-- Øresund e Łódź agora sobrevivem inteiros dos dois lados, porque Ø e Ł não
-- se decompõem: o certo é não mexer neles, não inventar uma letra diferente.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.normalizar_nome_carteira(p_nome text)
returns text
language sql
immutable
as $$
  select upper(
    btrim(
      regexp_replace(normalize(coalesce(p_nome, ''), NFD), '[̀-ͯ]', '', 'g'),
      E' \t\n\r \u000b\u000c'
    )
  );
$$;

comment on function public.normalizar_nome_carteira(text) is
  'A MESMA conta que normalizarNomeCarteira faz em src/lib/carteira-nome.ts: '
  'NFD, tira marcas combinantes, tira espaco das pontas (NBSP incluso) e sobe '
  'para maiuscula. Sem extensao: normalize() e nativo. Se uma das duas mudar, '
  'a outra muda junto — divergencia aqui so aparece quando alguem reimporta.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 (dura) — o ciclo A→B→A deixava a carteira VIVA redirecionada para um
--    nome morto
--
-- Medido pela auditoria: renomear VIP→ESPECIAL e depois ESPECIAL→VIP deixava
-- a memória com {VIP→ESPECIAL, ESPECIAL→VIP} e a carteira viva chamada VIP.
-- Importar o arquivo do dono, cuja chave é VIP, gravava em ESPECIAL — ou
-- seja, a memória mandava o dado para o nome que acabara de deixar de
-- existir.
--
-- A causa: ao renomear X→N, a função só evitava o auto-loop (`de <> para`) e
-- nunca apagava a linha cujo `de` é o próprio N. Mas N passou a ser carteira
-- VIVA — e o que é vivo não pode ser origem de redirecionamento.
--
-- A regra em uma frase: **o nome de destino sai da memória como origem.**
-- ═══════════════════════════════════════════════════════════════════════════
-- O retorno continua `jsonb`, como a versão da 20261025050000 — a tela
-- consome esse formato (`useRenomearCarteira`). Trocar o tipo aqui obrigaria
-- a mexer no front por nada.
create or replace function public.com_renomear_carteira(
  p_de text, p_para text, p_lembrar boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := (select public.get_user_tenant_id());
  v_de   text := public.normalizar_nome_carteira(p_de);
  v_para text := public.normalizar_nome_carteira(p_para);
  v_mc int; v_cm int; v_mb int;
begin
  if not ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))) then
    raise exception 'Sem permissão para renomear carteira (metas.definir).'
      using errcode = '42501';
  end if;

  if v_de = '' or v_para = '' then
    raise exception 'Nome de carteira vazio.' using errcode = '22023';
  end if;

  if v_de = v_para then
    return jsonb_build_object('metas_carteira', 0, 'com_metas', 0, 'membros', 0);
  end if;

  -- A trava que o dono aceitou no lugar do botão de desfazer: renomear para
  -- um nome que já existe seria FUNDIR duas carteiras, somando valores na
  -- mesma chave. Fusão é outra operação, com outra conversa.
  if exists (
    select 1 from public.metas_carteira
     where tenant_id = v_tenant and carteira = v_para
  ) then
    raise exception 'Já existe a carteira %. Renomear para ela seria fundir as duas, e isso não se faz por engano.', v_para
      using errcode = '23505';
  end if;

  update public.metas_carteira set carteira = v_para
   where tenant_id = v_tenant and carteira = v_de;
  get diagnostics v_mc = row_count;

  update public.com_metas set carteira = v_para
   where tenant_id = v_tenant and carteira = v_de;
  get diagnostics v_cm = row_count;

  -- UPDATE de novo: o DELETE+INSERT existia para desviar do trigger morto
  -- `handle_com_carteira_membros_updated_at`, derrubado em 20261025080000.
  -- Contorno de defeito que já não existe vira armadilha para quem lê depois
  -- (e trocava id e created_at de cada linha a cada renomeação).
  update public.com_carteira_membros set carteira = v_para
   where tenant_id = v_tenant and carteira = v_de;
  get diagnostics v_mb = row_count;

  if p_lembrar then
    -- A cadeia: quem apontava para o nome antigo passa a apontar para o novo.
    update public.com_carteira_renomeacoes set para = v_para
     where tenant_id = v_tenant and para = v_de and de <> v_para;

    insert into public.com_carteira_renomeacoes (tenant_id, de, para)
    values (v_tenant, v_de, v_para)
    on conflict (tenant_id, de) do update set para = excluded.para;

    -- O CONSERTO DO CICLO: o destino virou carteira viva, então não pode
    -- continuar sendo origem de redirecionamento. Sem esta linha, A→B→A
    -- mandava o arquivo de A para B, que já não existe.
    delete from public.com_carteira_renomeacoes
     where tenant_id = v_tenant and de = v_para;
  end if;

  return jsonb_build_object(
    'metas_carteira', coalesce(v_mc, 0),
    'com_metas', coalesce(v_cm, 0),
    'membros', coalesce(v_mb, 0)
  );
end;
$$;

grant execute on function public.com_renomear_carteira(text, text, boolean) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 — a memória não tinha como esquecer
--
-- A tabela tinha policy de SELECT/INSERT/UPDATE e NENHUMA de DELETE: uma
-- linha errada só saía à mão no banco. O achado 3 produz exatamente esse
-- tipo de linha, e a função acima precisa apagar — com `security definer`
-- ela consegue, mas a tela nunca conseguiria oferecer "esquecer esta troca".
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists com_carteira_renomeacoes_delete on public.com_carteira_renomeacoes;
create policy com_carteira_renomeacoes_delete on public.com_carteira_renomeacoes
  for delete to authenticated
  using (
    tenant_id = (select public.get_user_tenant_id())
    and ((select public.is_admin_or_higher(auth.uid()))
      or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir')))
  );
