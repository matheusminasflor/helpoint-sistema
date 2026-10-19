-- JORNAL PARA SETORES ESCOLHIDOS (migration 20270128030000; dono, 2026-10-19). Ana é do Comercial, Bia do Financeiro,
-- Caio da TI; Pub publica (Jornal do Marketing). A notícia "Serie 76" é para Comercial e Financeiro, com aviso no chat.
--   1  sem setor escolhido, "setores" é recusado
--   2  quem é do Comercial lê
--   3  quem é do Financeiro lê
--   4  quem é da TI não lê
--   5  quem é da TI não abre o anexo
--   6  ao publicar, Ana e Bia recebem a mensagem direta de quem publicou; Caio não
--   7  publicar de novo (despublicar e publicar) não repete a mensagem
--   8  a função nova não abre para anon
--   9  a mensagem automática leva a notícia (20270128040000)
--  10  quem digita no chat não consegue pôr notícia na mensagem (fingir mensagem automática)
begin;
\ir _helpers.psql

select plan(10);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-jornal-setor', 'Jornal Setor', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@jsetor.test', (select a from f)) as ana,
       tests.create_user('bia@jsetor.test', (select a from f)) as bia,
       tests.create_user('caio@jsetor.test', (select a from f)) as caio,
       tests.create_user('pub@jsetor.test', (select a from f)) as pub;
select tests.grant_module((select ana from u), (select a from f), 'comercial');
select tests.grant_module((select bia from u), (select a from f), 'financeiro');
select tests.grant_module((select caio from u), (select a from f), 'ti');
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'marketing', 'Jornal Teste', '{"jornal": {"edit": true, "publish": true}}'::jsonb from f;
select tests.grant_module((select pub from u), (select a from f), 'marketing');
select tests.grant_profile((select pub from u), (select a from f), 'marketing', 'Jornal Teste');
grant select on f, u to authenticated;

select throws_ok($$ insert into public.jornal_noticias (tenant_id, titulo, tipo, publico) select a, 'x', 'aviso', 'setores' from f $$,
  '23514', null, 'sem setor escolhido, "setores" e recusado');

create temporary table n on commit drop as
with x as (
  insert into public.jornal_noticias (tenant_id, titulo, tipo, publico, setores, avisar_no_chat, autor_id)
  select a, 'Serie 76', 'aviso', 'setores', array['comercial', 'financeiro'], true, (select pub from u) from f returning id
) select id from x;
insert into public.jornal_anexos (tenant_id, noticia_id, nome, caminho) select a, (select id from n), 'fluxo.jpg', 'x/fluxo.jpg' from f;
grant select on n to authenticated;

select tests.authenticate_as('pub@jsetor.test');
update public.jornal_noticias set status = 'publicada' where id = (select id from n);
select tests.clear_authentication();

select tests.authenticate_as('ana@jsetor.test');
select is((select count(*)::int from public.jornal_noticias where titulo = 'Serie 76'), 1, 'quem e do Comercial le');
select tests.clear_authentication();
select tests.authenticate_as('bia@jsetor.test');
select is((select count(*)::int from public.jornal_noticias where titulo = 'Serie 76'), 1, 'quem e do Financeiro le');
select tests.clear_authentication();
select tests.authenticate_as('caio@jsetor.test');
select is((select count(*)::int from public.jornal_noticias where titulo = 'Serie 76'), 0, 'quem e da TI nao le');
select is((select count(*)::int from public.jornal_anexos), 0, 'quem e da TI nao abre o anexo');
select tests.clear_authentication();

create or replace function pg_temp.recebeu(p uuid) returns int language sql as $$
  select count(*)::int from public.chat_messages cm
    join public.chat_channel_members mb on mb.channel_id = cm.channel_id and mb.user_id = p
   where cm.author_id = (select pub from u) and cm.conteudo like 'Comunicado no Jornal: Serie 76%' $$;
select ok(pg_temp.recebeu((select ana from u)) = 1 and pg_temp.recebeu((select bia from u)) = 1 and pg_temp.recebeu((select caio from u)) = 0,
  'Ana e Bia recebem a mensagem direta; Caio nao');

select tests.authenticate_as('pub@jsetor.test');
update public.jornal_noticias set status = 'despublicada' where id = (select id from n);
update public.jornal_noticias set status = 'publicada' where id = (select id from n);
select tests.clear_authentication();
select is(pg_temp.recebeu((select ana from u)), 1, 'publicar de novo nao repete a mensagem');

select ok(not has_function_privilege('anon', 'public.jornal_e_para_mim(text, text[])', 'execute'), 'a funcao nova nao abre para anon');

-- 20270128040000: a mensagem do Jornal leva a notícia (selo "Mensagem automática" + "Ler a notícia").
select is((select count(*)::int from public.chat_messages where noticia_id = (select id from n)), 2,
  'a mensagem automatica leva a noticia');
-- A conversa abre num comando e a mensagem vai no seguinte: no mesmo comando a policy não enxerga a conversa recém-criada
-- (regra 13 do pgTAP).
create temporary table canal (id uuid) on commit drop;
grant select, insert on canal to authenticated;
select tests.authenticate_as('ana@jsetor.test');
insert into canal select public.chat_abrir_conversa((select caio from u));
insert into public.chat_messages (tenant_id, channel_id, author_id, conteudo, noticia_id)
select (select a from f), (select id from canal), (select ana from u), 'Falsa', (select id from n)
returning id;
select tests.clear_authentication();
select is((select noticia_id from public.chat_messages where conteudo = 'Falsa'), null::uuid,
  'quem digita no chat nao finge mensagem automatica');

select * from finish();
rollback;
