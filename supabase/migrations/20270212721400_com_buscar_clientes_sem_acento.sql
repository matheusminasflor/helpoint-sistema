-- Busca de cliente que ignora acento e maiúscula, e não quebra com vírgula ou parêntese (revisão do Comercial,
-- 2026-11-12, https://claude.ai/artifact/DogLjeM9MuJUzFt2H7ALFV seção 2). Antes, "salao" não achava "SALÃO", e na
-- janela de lançamento um nome com vírgula ("SALÃO X, LTDA") quebrava o filtro do PostgREST.
-- Procura na razão social, no nome fantasia e no código. Reusa `normalizar_nome_carteira` (NFD, sem extensão), a
-- mesma conta de `casaBusca` na tela. `strpos` em vez de LIKE: o termo não vira curinga.
-- security invoker: o RLS de com_clientes continua valendo para quem busca.
create function public.com_buscar_clientes(p_termo text)
returns setof public.com_clientes
language sql stable security invoker set search_path = public as $$
  select c.* from public.com_clientes c
   where length(btrim(coalesce(p_termo, ''))) >= 2
     and (strpos(public.normalizar_nome_carteira(c.razao_social), public.normalizar_nome_carteira(p_termo)) > 0
          or strpos(public.normalizar_nome_carteira(coalesce(c.fantasia, '')), public.normalizar_nome_carteira(p_termo)) > 0
          or strpos(upper(coalesce(c.codigo, '')), upper(btrim(p_termo))) > 0);
$$;
revoke all on function public.com_buscar_clientes(text) from public, anon;
grant execute on function public.com_buscar_clientes(text) to authenticated;
