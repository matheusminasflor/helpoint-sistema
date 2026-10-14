-- MURAL DE ATUALIZAÇÕES DO SISTEMA (dono, 2026-10-14): "criar no Jornal um mural de atualizações no sistema,
-- onde toda vez que ajustamos algo é criada a notícia do que foi feito, para até os leigos entenderem". Tipo
-- novo, numa aba própria do Jornal e fora da capa (a tela separa; `src/lib/jornal.ts`).
alter table public.jornal_noticias drop constraint if exists jornal_noticias_tipo_check;
alter table public.jornal_noticias add constraint jornal_noticias_tipo_check
  check (tipo in ('aviso', 'novo_colaborador', 'aniversario', 'feriado', 'festa_evento', 'outros', 'atualizacao_sistema'));
