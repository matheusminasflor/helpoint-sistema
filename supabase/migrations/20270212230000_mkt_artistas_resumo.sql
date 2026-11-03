-- As entregas dos artistas somadas por artista, mês, tipo e peso (dono, 2026-11-03; Indicadores do Marketing). A Visão
-- Geral pede o período (stories, reels e feed da semana) e o Analítico pede o histórico mês a mês; somar no banco
-- devolve poucas linhas (artista × mês × tipo × peso) em vez de todas as entregas, e não esbarra no limite de 1000
-- linhas do PostgREST num período longo. A bonificação sai na tela (`src/lib/bonificacao-dos-artistas.ts`).
-- `security invoker`: valem as policies de `mkt_artistas_entregas` (quem não vê os Artistas recebe nada).
create or replace function public.mkt_artistas_resumo(p_de date, p_ate date)
returns table (artista_id uuid, mes date, tipo text, aprovado boolean, na_campanha boolean, quantidade integer)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select e.artista_id, date_trunc('month', e.data)::date, e.tipo, e.aprovado, e.na_campanha, sum(e.quantidade)::integer
    from public.mkt_artistas_entregas e
   where e.data between p_de and p_ate
   group by 1, 2, 3, 4, 5;
$$;
revoke all on function public.mkt_artistas_resumo(date, date) from public, anon;
grant execute on function public.mkt_artistas_resumo(date, date) to authenticated;
