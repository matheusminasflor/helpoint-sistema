-- CRM-4b: uma mensagem-modelo por cliente a cada sete dias. 2026-09-13.
--
-- Decisão do dono, depois de a auditoria mostrar que dois fluxos de
-- reengajamento na mesma empresa podem pegar o mesmo negócio: **o cliente não
-- recebe outra mensagem-modelo na mesma semana, venha do fluxo que vier.**
--
-- O fluxo automático é travado; o vendedor mandando à mão é **avisado e passa**
-- — quem está com o cliente na mão sabe o que a regra não sabe, e travá-lo seria
-- empurrá-lo de volta para o WhatsApp do celular, que é o que esta leva quer
-- evitar.
--
-- A regra mora aqui, e não na edge function, por dois motivos: é regra de
-- negócio (o CLAUDE.md manda), e quem pergunta são **dois** caminhos muito
-- diferentes — a tela, para avisar, e o worker, para travar. Os dois lendo a
-- mesma função é o que impede o aviso dizer uma coisa e a trava fazer outra.

-- Quanto tempo o cliente fica em paz depois de uma mensagem-modelo. Uma função
-- e não um número solto: mudar a janela é mexer num lugar só, e a tela pergunta
-- em vez de repetir o valor.
create or replace function public.crm_modelo_janela_dias()
returns integer language sql immutable as $$ select 7 $$;

/**
 * Até quando este cliente está em paz. `null` = pode receber agora.
 *
 * Conta só mensagem que saiu **por modelo** (`template_name` preenchido) e que
 * de fato saiu (`failed` não conta — cobrar não cobrou, e o cliente não viu).
 * Resposta livre dentro das 24 h não entra: ela não é cobrada nem invade.
 */
create or replace function public.crm_modelo_bloqueado_ate(p_contact uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(m.created_at) + make_interval(days => public.crm_modelo_janela_dias())
    from public.crm_messages m
   where m.contact_id = p_contact
     and m.tenant_id = public.get_user_tenant_id()
     and m.template_name is not null
     and m.status <> 'failed'
  having max(m.created_at)
           > now() - make_interval(days => public.crm_modelo_janela_dias());
$$;
revoke execute on function public.crm_modelo_bloqueado_ate(uuid) from public, anon;
grant execute on function public.crm_modelo_bloqueado_ate(uuid) to authenticated;

/**
 * A mesma pergunta, para quem não tem sessão: o worker roda com a chave de
 * serviço, onde `get_user_tenant_id()` é nulo. A empresa vem por argumento
 * porque quem chama já a resolveu — e ela entra no `where` para uma empresa não
 * enxergar a conversa da outra nem para contar.
 */
create or replace function public.crm_modelo_bloqueado_ate(p_tenant uuid, p_contact uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(m.created_at) + make_interval(days => public.crm_modelo_janela_dias())
    from public.crm_messages m
   where m.contact_id = p_contact
     and m.tenant_id = p_tenant
     and m.template_name is not null
     and m.status <> 'failed'
  having max(m.created_at)
           > now() - make_interval(days => public.crm_modelo_janela_dias());
$$;
revoke execute on function public.crm_modelo_bloqueado_ate(uuid, uuid) from public, anon, authenticated;
