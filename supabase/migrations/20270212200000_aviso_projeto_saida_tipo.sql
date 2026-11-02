-- O aviso de "saiu do projeto" (dono, 2026-11-02; docs/especificacao-projetos.md › Sair do projeto). Arquivo só com
-- o valor novo: o Postgres não deixa usar um valor de enum na mesma transação que o criou.
alter type public.notification_type add value if not exists 'projeto_saida';
