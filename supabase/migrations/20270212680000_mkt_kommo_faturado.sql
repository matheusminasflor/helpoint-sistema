-- DISTRIBUIDOR PELO FATURADO DO FORTEPLUS (projeto do Kommo, parte 4.3, aprovada pelo dono em 2026-11-08,
-- https://claude.ai/artifact/TYnvDMKfnHEQLBdxLHQF95; docs/projeto-kommo-bling-expedicao.md, seção 16.1).
--
-- A venda ganha de Distribuidor no Kommo só avisa que fechou; o valor é o das notas de venda do Forteplus do cliente:
--   * a ligação é só pelo CPF/CNPJ do lead (campo "CPF/CNPJ"); o telefone só SUGERE o cliente, quando casa com um só;
--   * conta a nota de 15 dias antes até 7 dias depois de marcarem "ganha" (a nota costuma sair antes: Vita Derm faturou
--     em 28/10 e foi marcada em 04/11);
--   * cada nota conta uma vez, para a venda mais antiga do cliente; a outra é "venda repetida";
--   * sem nota, a venda fica "aguardando nota" por 7 dias e depois vai para "Para corrigir".
-- Quem vê: quem já vê os Indicadores do Marketing ou da Diretoria e, agora, o gestor comercial (com_pode_gerir_carteiras).

alter table public.mkt_kommo_vendas
  add column documento text check (documento ~ '^[0-9]{11,14}$'),
  add column telefone text check (telefone ~ '^[0-9]{8,15}$');

-- O robô grava também o CPF/CNPJ do lead e o telefone do contato, só com os dígitos.
create or replace function public.mkt_kommo_gravar_vendas(p_tenant uuid, p_desde date, p_vendas jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.mkt_kommo_vendas where tenant_id = p_tenant and fechou >= p_desde;
  insert into public.mkt_kommo_vendas (tenant_id, lead_id, nome, funil, situacao, valor, fechou, motivo, link, documento, telefone)
  select p_tenant, v.lead_id, v.nome, v.funil, v.situacao, v.valor, v.fechou, v.motivo, v.link,
         nullif(regexp_replace(coalesce(v.documento, ''), '\D', '', 'g'), ''),
         nullif(regexp_replace(coalesce(v.telefone, ''), '\D', '', 'g'), '')
    from jsonb_to_recordset(p_vendas) as v(lead_id bigint, nome text, funil text, situacao text, valor numeric, fechou date,
                                           motivo text, link text, documento text, telefone text)
   where v.fechou >= p_desde
  on conflict (tenant_id, lead_id) do update
    set nome = excluded.nome, funil = excluded.funil, situacao = excluded.situacao, valor = excluded.valor,
        fechou = excluded.fechou, motivo = excluded.motivo, link = excluded.link,
        documento = excluded.documento, telefone = excluded.telefone;
end;
$$;

-- Quem lê as vendas do Kommo: os Indicadores (Marketing ou Diretoria) e o gestor comercial.
drop policy mkt_kommo_vendas_le on public.mkt_kommo_vendas;
create policy mkt_kommo_vendas_le on public.mkt_kommo_vendas for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'reports', 'view')) or (select public.dir_pode_ver('indicadores'))
              or (select public.com_pode_gerir_carteiras())));

-- Cada venda ganha de Distribuidor que fechou entre p_de e p_ate, com a situação do faturado.
--   situacao: faturado | aguardando_nota | sem_nota | sem_cnpj | cliente_nao_encontrado | venda_repetida
create function public.mkt_kommo_faturado(p_de date, p_ate date)
returns table (lead_id bigint, situacao text, cliente text, valor numeric, notas text, sugerido text)
language sql stable security definer set search_path = public as $$
  with acesso as (
    select public.get_user_tenant_id() as tenant
     where public.pode_no_setor('marketing', 'reports', 'view') or public.dir_pode_ver('indicadores')
        or public.com_pode_gerir_carteiras()
  ),
  hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  vendas as (
    select v.* from public.mkt_kommo_vendas v join acesso a on a.tenant = v.tenant_id
     where v.funil = 'distribuidor' and v.situacao = 'ganha'
  ),
  clientes as (
    select c.tenant_id, c.codigo, coalesce(nullif(c.fantasia, ''), c.razao_social) as nome,
           regexp_replace(coalesce(c.documento, ''), '\D', '', 'g') as doc,
           right(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), 8) as tel8
      from public.com_clientes c join acesso a on a.tenant = c.tenant_id
  ),
  ligadas as (
    select v.lead_id, v.fechou, c.codigo, c.nome
      from vendas v join clientes c on c.tenant_id = v.tenant_id and v.documento is not null and c.doc = v.documento
  ),
  -- As notas de venda de cada cliente ligado, na janela da venda. Uma nota (filial, série, número) pode cair na
  -- janela de duas vendas do mesmo cliente: fica com a mais antiga.
  candidatas as (
    select l.lead_id, i.filial, i.serie, i.documento as nota, i.emissao, sum(i.valor_nota) as valor,
           row_number() over (partition by i.tenant_id, i.filial, i.serie, i.documento order by l.fechou, l.lead_id) as ordem
      from ligadas l
      join public.com_vendas_itens i
        on i.cliente_codigo = l.codigo and i.classe = 'venda'
       and i.emissao between l.fechou - 15 and l.fechou + 7
       and i.tenant_id = (select tenant from acesso)
     group by l.lead_id, l.fechou, i.tenant_id, i.filial, i.serie, i.documento, i.emissao
  ),
  por_venda as (
    select lead_id,
           sum(valor) filter (where ordem = 1) as valor,
           count(*) filter (where ordem = 1) as minhas,
           count(*) as todas,
           string_agg(to_char(emissao, 'DD/MM') || ' nf ' || nota, ', ' order by emissao, nota) filter (where ordem = 1) as notas
      from candidatas group by lead_id
  ),
  -- O telefone só sugere: quando casa com exatamente um cliente.
  sugestao as (
    select v.lead_id, min(c.nome) as nome
      from vendas v join clientes c on c.tenant_id = v.tenant_id and v.telefone is not null and length(v.telefone) >= 8
                                    and c.tel8 = right(v.telefone, 8)
     group by v.lead_id having count(distinct c.codigo) = 1
  )
  select v.lead_id,
         case
           when v.documento is null then 'sem_cnpj'
           when not exists (select 1 from ligadas l where l.lead_id = v.lead_id) then 'cliente_nao_encontrado'
           when coalesce(p.minhas, 0) > 0 then 'faturado'
           when coalesce(p.todas, 0) > 0 then 'venda_repetida'
           when v.fechou > (select d from hoje) - 7 then 'aguardando_nota'
           else 'sem_nota'
         end,
         (select min(l.nome) from ligadas l where l.lead_id = v.lead_id),
         coalesce(p.valor, 0),
         p.notas,
         case when v.documento is null or not exists (select 1 from ligadas l where l.lead_id = v.lead_id) then s.nome end
    from vendas v
    left join por_venda p on p.lead_id = v.lead_id
    left join sugestao s on s.lead_id = v.lead_id
   where v.fechou between p_de and p_ate;
$$;
revoke all on function public.mkt_kommo_faturado(date, date) from public, anon;
grant execute on function public.mkt_kommo_faturado(date, date) to authenticated;
