-- Foto de produto do SAC sai do balde privado e ganha balde público. 2026-09-18.
--
-- O catálogo de produtos do SAC aparece no **formulário público de reclamação**
-- (`src/pages/sac/PublicForm.tsx`), que qualquer pessoa abre sem entrar no
-- sistema. A foto estava em `sac-attachments`, que é **privado** — e a única
-- forma de mostrá-la a um visitante anônimo era gravar no banco um link
-- assinado com **cinco anos** de validade.
--
-- Link assinado morre. É exatamente o que acabou de acontecer com o logotipo da
-- empresa: o endereço continuou gravado depois de o projeto que o assinou
-- deixar de existir, e a tela passou a mostrar imagem quebrada em vez de cair
-- no reserva — porque o campo não está vazio, está errado.
--
-- Foto de produto num formulário público é conteúdo público. O lugar dela é um
-- balde público, com endereço permanente e sem token. Escrever continua sendo
-- de quem administra o SAC; `sac-attachments` segue privado para o que ele
-- guarda de verdade — anexo de reclamação, que é do cliente.

insert into storage.buckets (id, name, public)
values ('sac-products', 'sac-products', true)
on conflict (id) do nothing;

update storage.buckets set public = true where id = 'sac-products' and public is distinct from true;

-- Ler é de qualquer um, inclusive de quem nunca entrou: é disso que o
-- formulário público precisa.
drop policy if exists "sac_products_public_read" on storage.objects;
create policy "sac_products_public_read" on storage.objects
  for select to public using (bucket_id = 'sac-products');

-- Escrever é de quem administra, e dentro da pasta da própria empresa — o mesmo
-- molde de `tenant-branding`.
drop policy if exists "sac_products_admin_insert" on storage.objects;
create policy "sac_products_admin_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'sac-products'
    and public.is_admin_or_higher(auth.uid())
    and (storage.foldername(name))[1] = (public.get_user_tenant_id())::text);

drop policy if exists "sac_products_admin_update" on storage.objects;
create policy "sac_products_admin_update" on storage.objects
  for update to authenticated using (
    bucket_id = 'sac-products'
    and public.is_admin_or_higher(auth.uid())
    and (storage.foldername(name))[1] = (public.get_user_tenant_id())::text);

drop policy if exists "sac_products_admin_delete" on storage.objects;
create policy "sac_products_admin_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'sac-products'
    and public.is_admin_or_higher(auth.uid())
    and (storage.foldername(name))[1] = (public.get_user_tenant_id())::text);

-- As fotos que já estavam gravadas apontam para o projeto Supabase antigo, que
-- foi apagado — o endereço não resolve mais. Limpar é melhor do que deixar: com
-- o campo vazio a tela mostra o quadro reserva; com endereço morto, ela mostra
-- o ícone de imagem quebrada.
update public.sac_products
   set image_url = null
 where image_url is not null
   and image_url not like '%/storage/v1/object/public/sac-products/%';

-- O mesmo, para o logotipo e o desenho da marca das empresas: os endereços
-- gravados apontam para `csbhhvgnbpleinxlpkcd`, o projeto do tempo do Lovable,
-- que foi apagado. É o que a tela de login mostra desde a ADR-010 — e mostrava
-- quebrado. Com o campo vazio ela cai no quadro reserva, com o nome da empresa.
update public.tenants
   set logo_url = null
 where logo_url like '%csbhhvgnbpleinxlpkcd%';

update public.tenants
   set settings = jsonb_set(settings, '{branding}',
         (settings -> 'branding') - 'logoUrl' - 'iconUrl' - 'loginBannerUrl')
 where settings -> 'branding' is not null
   and settings::text like '%csbhhvgnbpleinxlpkcd%';
