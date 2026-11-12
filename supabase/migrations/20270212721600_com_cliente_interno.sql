-- CLIENTE INTERNO FORA DA BONIFICAÇÃO (revisão do Comercial aprovada pelo dono, https://claude.ai/artifact/DogLjeM9MuJUzFt2H7ALFV,
-- seção 3). O vendedor e a própria empresa recebem material pelo Forteplus e entravam na Bonificação como "cliente que
-- recebe sem comprar": FENICIO ROCHA (R$ 19.710 bonificados em 2026) e MINASFLOR MARKETING (R$ 28.140). Não são
-- clientes: saem da lista por cliente e do farol. O total da empresa (Faturamento) continua contando a remessa, porque
-- o material saiu de verdade.
--
-- ponytail: a marca nasce aqui pelo nome, e não há tela para marcar outro cliente como interno. Teto: um vendedor novo
-- ou uma conta nova da empresa voltam a aparecer até alguém marcar `interno` no cadastro. Saída: a caixa "Cliente
-- interno" no cadastro de clientes de Configurações.

alter table public.com_clientes add column if not exists interno boolean not null default false;
comment on column public.com_clientes.interno is
  'Equipe ou a própria empresa (recebe material, não é cliente): fora da Bonificação por cliente e do farol.';

update public.com_clientes
   set interno = true
 where razao_social ~* '^(minasflor|lojas minasflor)\M'
    or upper(razao_social) = 'FENICIO ROCHA';

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

-- `create or replace` (o que pg_get_functiondef devolve) preserva a ACL: nada reabre para anon.
select pg_temp.troca('public.com_bonificacao_por_cliente(date, date, text, text)'::regprocedure,
  $$where i.emissao between p_de and p_ate$$,
  $$where i.emissao between p_de and p_ate
      and not coalesce(c.interno, false)$$);
select pg_temp.troca('public.com_bonificacao_farol_clientes(date, date, text)'::regprocedure,
  $$where i.emissao between p_de and p_ate$$,
  $$where i.emissao between p_de and p_ate
      and not coalesce(c.interno, false)$$);
