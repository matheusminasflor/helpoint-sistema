-- JORNAL SÓ A PARTIR DA DATA, E O CHAMADO #27 NO SETOR CERTO (dono, 2026-10-09).
--
-- 1. "Mesmo agendando o Jornal para 09/10, no dia 08/10 os usuários conseguiam ver a notícia se clicavam em
--    Jornal." Medido: a notícia do feriado foi publicada em 06/10 com exibição a partir de 09/10; a tela
--    inicial respeitava a data (`naHome`), mas a regra do banco só perguntava se estava "publicada" — e a
--    página Jornal lista tudo o que o banco devolve. Agora o banco esconde a notícia antes de `exibir_de`
--    (no dia do Brasil); quem edita ou publica o Jornal continua vendo, para conferir antes.
--    `exibir_ate` NÃO entra: passado o período, a notícia sai da tela inicial e fica no histórico da página.
-- 2. "Por conta da transferência de um chamado de TI para a Merilyn, os Indicadores de TI mostram dados dela."
--    O #27 (QR CODE) foi passado da TI para a Merilyn às 17:15 de 06/10 — 47 minutos antes de entrar
--    "transferir para outro setor leva o chamado junto" (`transferir_chamado`). Decisão do dono: mover o #27
--    para o Marketing (categoria Outros). É conserto de dado de chamado resolvido: o aviso de "transferido"
--    que a mudança de setor dispara é retirado em seguida.

-- ─── 1. Jornal ───────────────────────────────────────────────────────────────────────────────────
create or replace function public.jornal_noticia_visivel(p_noticia uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.jornal_noticias n
                  where n.id = p_noticia
                    and n.tenant_id = public.get_user_tenant_id()
                    and ((n.status = 'publicada'
                          and (n.exibir_de is null or n.exibir_de <= (now() at time zone 'America/Sao_Paulo')::date))
                         or public.pode_no_setor('marketing', 'jornal', 'edit')
                         or public.pode_no_setor('marketing', 'jornal', 'publish')));
$$;

drop policy if exists jornal_le on public.jornal_noticias;
create policy jornal_le on public.jornal_noticias for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((status = 'publicada'
               and (exibir_de is null or exibir_de <= (now() at time zone 'America/Sao_Paulo')::date))
              or public.pode_no_setor('marketing', 'jornal', 'edit')
              or public.pode_no_setor('marketing', 'jornal', 'publish')));

-- ─── 2. O #27 vai para o Marketing ───────────────────────────────────────────────────────────────
with movido as (
  update public.tickets t
     set module = 'marketing',
         category_id = c.id,
         category = c.name,
         subcategory = null
    from public.ti_categories c
   where t.ticket_number = 27 and t.module = 'tickets' and t.title ilike 'QR%CODE%'
     and c.tenant_id = t.tenant_id and c.module = 'marketing' and c.parent_id is null and c.name = 'Outros'
  returning t.id
)
select count(*) from movido;

delete from public.notifications n
 using public.tickets t
 where t.ticket_number = 27 and t.module = 'marketing' and t.title ilike 'QR%CODE%'
   and n.reference_id = t.id and n.type = 'ticket_transferred' and n.created_at >= now() - interval '1 minute';
