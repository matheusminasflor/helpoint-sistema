-- FOTO DE PERFIL: ATÉ 5 MB, SÓ IMAGEM (decisão do dono, 2026-10-04).
-- A tela conferia (4 MB) e o bucket aceitava qualquer tamanho e qualquer arquivo. Agora quem
-- recusa é o próprio armazenamento; a tela repete o limite só para avisar antes de enviar.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
 where id = 'avatars';
