-- CAIXINHA: SÓ O RESPONSÁVEL LANÇA (dono, 2026-10-20): "o Freitas deve conseguir ver a Caixinha da INBRAS apenas como
-- leitura, e tirar o relatório das duas". Até aqui (20270129010000) a seção Caixinha do Financeiro lançava e apagava em
-- QUALQUER Caixinha. Agora, em cada Caixinha:
--   * ver: a seção Caixinha do Financeiro (as duas) ou o responsável (a dele);
--   * lançar: só o responsável dela;
--   * apagar: o responsável dela que também tem "Excluir" na seção Caixinha (o Rondinelly, sem o Financeiro, continua
--     sem apagar — quem confere é o Financeiro).
-- Dono e administrador seguem passando em tudo.
create or replace function public.pode_na_caixinha(p_acao text, p_caixinha uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or case p_acao
           when 'view' then coalesce(public.tem_permissao(auth.uid(), 'financeiro', 'caixinha', 'view'), false)
                            or auth.uid() = public.responsavel_da_caixinha(p_caixinha)
           when 'create' then auth.uid() = public.responsavel_da_caixinha(p_caixinha)
           when 'delete' then auth.uid() = public.responsavel_da_caixinha(p_caixinha)
                              and coalesce(public.tem_permissao(auth.uid(), 'financeiro', 'caixinha', 'delete'), false)
           else false
         end;
$$;
