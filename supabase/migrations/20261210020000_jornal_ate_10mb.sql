-- JORNAL: CAPA E ANEXOS ATÉ 10 MB (decisão do dono, 2026-10-06).
-- O bucket `jornal` não tinha limite. Agora quem recusa é o próprio armazenamento; a tela repete o
-- limite só para avisar antes de enviar (`EditorDeNoticia`).
update storage.buckets set file_size_limit = 10485760 where id = 'jornal';
