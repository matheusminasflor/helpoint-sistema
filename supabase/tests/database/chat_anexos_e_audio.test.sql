-- CHAT: ANEXOS E O DVR DE 300 MB (migration 20270119010000; dono, 2026-10-15).
--   1  mensagem só com anexo (sem texto) entra, com RETURNING como a tela
--   2  mensagem sem texto e sem anexo continua recusada
--   3  o anexo de uma mensagem não se troca
--   4  apagar a mensagem marca o anexo para sair do Storage
--   5  passou de 300 MB: o anexo mais antigo é marcado ("apagado para liberar espaço")...
--   6  ... e o mais novo fica
--   7  o texto da mensagem cujo anexo saiu continua
--   8  as funções novas não abrem para anon
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-chat-anexo', 'Chat Anexo') as tenant;
create temporary table u on commit drop as
select tests.create_user('ana@chatanexo.test', (select tenant from f)) as ana;
grant select on f, u to authenticated;

create temporary table s on commit drop as select gen_random_uuid() as canal, gen_random_uuid() as foto, gen_random_uuid() as audio;
grant select on s to authenticated;

select tests.authenticate_as('ana@chatanexo.test');
insert into public.chat_channels (id, tenant_id, nome, privado, created_by)
select canal, (select tenant from f), 'geral', false, auth.uid() from s returning id;

create temporary table r1 on commit drop as
with x as (
  insert into public.chat_messages (id, tenant_id, channel_id, author_id, conteudo, anexo_path, anexo_nome, anexo_tipo, anexo_bytes)
  select foto, (select tenant from f), canal, auth.uid(), '', (select tenant from f) || '/' || canal || '/foto.jpg', 'foto.jpg', 'image/jpeg', 300000 from s
  returning id
) select id from x;
select tests.clear_authentication();
select is((select count(*)::int from r1), 1, 'mensagem so com anexo entra');

select tests.authenticate_as('ana@chatanexo.test');
select throws_ok(format($$ insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo)
                           values (%L::uuid, %L::uuid, %L::uuid, '  ') returning id $$,
                        (select tenant from f), (select canal from s), (select ana from u)),
  '23514', null, 'mensagem sem texto e sem anexo continua recusada');
select throws_ok(format($$ update public.chat_messages set anexo_path = 'outro.jpg' where id = %L::uuid $$, (select foto from s)),
  'P0001', null, 'o anexo nao se troca');

insert into public.chat_messages (id, tenant_id, channel_id, author_id, conteudo, anexo_path, anexo_nome, anexo_tipo, anexo_bytes)
select audio, (select tenant from f), canal, auth.uid(), 'bom dia a todos', (select tenant from f) || '/' || canal || '/audio.webm', 'audio.webm', 'audio/webm', 250000 from s
returning id;
update public.chat_messages set deleted_at = now() where id = (select audio from s) returning id;
select tests.clear_authentication();
select ok((select anexo_apagado_em is not null from public.chat_messages where id = (select audio from s)), 'apagar a mensagem marca o anexo');

-- 31 anexos de 10 MB (310 MB), do mais antigo ao mais novo.
insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo, anexo_path, anexo_nome, anexo_tipo, anexo_bytes, created_at)
select (select tenant from f), (select canal from s), (select ana from u), 'video ' || i,
       (select tenant from f) || '/' || (select canal from s) || '/v' || i || '.mp4', 'v.mp4', 'video/mp4', 10485760,
       now() - make_interval(days => 40 - i)
  from generate_series(1, 31) i;

select tests.authenticate_as('ana@chatanexo.test');
select public.chat_liberar_espaco(10485760);
select tests.clear_authentication();

select ok((select anexo_apagado_em is not null from public.chat_messages where conteudo = 'video 1'), 'passou de 300 MB: o mais antigo sai');
select ok((select anexo_apagado_em is null from public.chat_messages where conteudo = 'video 31'), 'o mais novo fica');
select is((select conteudo from public.chat_messages where conteudo = 'video 1'), 'video 1', 'o texto da mensagem continua');

select ok(not has_function_privilege('anon', 'public.chat_liberar_espaco(integer)', 'execute')
      and not has_function_privilege('anon', 'public.chat_anexo_marcado(text)', 'execute'), 'as funcoes novas nao abrem para anon');

select * from finish();
rollback;
