-- COMERCIAL: A NOTA LANÇADA CONFERIDA CONTRA O FORTEPLUS, E A DATA DA NOTA NUNCA NO FUTURO (dono, 2026-10-15).
-- "Se o vendedor preencher o número da nota errado, o valor errado... vai prevalecer o quê?" Decisões do dono:
--   1. o Forteplus continua prevalecendo sempre (o corte de `com_faturado_importado_ate` já tira da conta todo
--      lançamento até a última nota importada, certo ou errado). O que muda: o que a vendedora digitou e não bateu
--      fica no INDICADOR dela, com o valor certo do Forteplus ao lado, "para saber o que errou e se atentar";
--   2. a data da nota não pode ser depois de hoje nem antes do contato. Com data no futuro o lançamento ficaria
--      depois de qualquer corte e contaria como venda até alguém perceber.

-- ─── 1. A trava da data ──────────────────────────────────────────────────────────────────────────
-- Só quando a data da nota muda: lançamento antigo não é revalidado.
create or replace function public.com_nota_em_confere()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.nota_em is not null and (tg_op = 'INSERT' or new.nota_em is distinct from old.nota_em) then
    if new.nota_em > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'A data da nota não pode ser depois de hoje.' using errcode = '23514';
    end if;
    if new.nota_em < new.data then
      raise exception 'A data da nota não pode ser antes do contato.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.com_nota_em_confere() from public, anon;

drop trigger if exists com_nota_em_confere on public.com_interacoes;
create trigger com_nota_em_confere before insert or update of nota_em, data on public.com_interacoes
  for each row execute function public.com_nota_em_confere();

-- ─── 2. As notas que não bateram ─────────────────────────────────────────────────────────────────
-- Só o lançamento com nota até o corte: depois dele o Forteplus ainda não tem a nota para conferir. A nota casa pelo
-- número (sem zeros à esquerda) e, entre as de mesmo número (as duas filiais), prefere a do mesmo grupo de cliente e a
-- data mais perto. O valor confere com a venda da nota ou com o total dela (com bonificação), tolerância de R$ 1.
-- `security invoker`: a vendedora vê os dela pela policy de `com_interacoes`; o gestor, a equipe.
create or replace function public.com_notas_que_nao_bateram(p_de date, p_ate date)
returns table(interacao_id uuid, vendedor_id uuid, cliente_codigo text, cliente_nome text, nota_fiscal text,
              nota_em date, valor_lancado numeric, forteplus_cliente text, forteplus_emissao date,
              forteplus_valor numeric, problema text)
language sql stable security invoker set search_path to 'public' as $$
  with corte as (select public.com_faturado_importado_ate() as d),
  lanc as (
    select i.*, ltrim(regexp_replace(i.nota_fiscal, '\D', '', 'g'), '0') as num,
           public.com_chave_do_grupo(c.grupo, c.codigo) as chave, coalesce(c.razao_social, i.cliente_codigo) as nome
      from public.com_interacoes i
      left join public.com_clientes c on c.tenant_id = i.tenant_id and c.codigo = i.cliente_codigo
     where i.tenant_id = public.get_user_tenant_id()
       and i.valor_venda > 0 and i.nota_em between p_de and p_ate
       and i.nota_em <= (select d from corte)
  ),
  notas as (
    select ltrim(regexp_replace(vi.documento, '\D', '', 'g'), '0') as num, vi.filial, vi.cliente_codigo,
           public.com_chave_do_grupo(c.grupo, vi.cliente_codigo) as chave,
           min(vi.emissao) as emissao,
           coalesce(sum(vi.valor_nota) filter (where vi.classe = 'venda'), 0) as venda,
           sum(vi.valor_nota) as total
      from public.com_vendas_itens vi
      left join public.com_clientes c on c.tenant_id = vi.tenant_id and c.codigo = vi.cliente_codigo
     where vi.tenant_id = public.get_user_tenant_id()
       and vi.emissao between p_de - 62 and p_ate + 62
     group by 1, 2, 3, 4
  )
  select l.id, l.vendedor_id, l.cliente_codigo, l.nome, l.nota_fiscal, l.nota_em, l.valor_venda,
         n.cliente_codigo, n.emissao, n.venda,
         case when n.num is null then 'nota_nao_encontrada'
              when n.chave is distinct from l.chave then 'cliente_diferente'
              when abs(n.venda - l.valor_venda) > 1 and abs(n.total - l.valor_venda) > 1 then 'valor_diferente'
              when n.emissao <> l.nota_em then 'data_diferente' end
    from lanc l
    left join lateral (
      select * from notas n where n.num = l.num
       order by (n.chave = l.chave) desc, abs(n.emissao - l.nota_em) limit 1
    ) n on true
   where n.num is null or n.chave is distinct from l.chave
      or (abs(n.venda - l.valor_venda) > 1 and abs(n.total - l.valor_venda) > 1) or n.emissao <> l.nota_em
   order by l.nota_em, l.nota_fiscal;
$$;
revoke all on function public.com_notas_que_nao_bateram(date, date) from public, anon;
grant execute on function public.com_notas_que_nao_bateram(date, date) to authenticated;
