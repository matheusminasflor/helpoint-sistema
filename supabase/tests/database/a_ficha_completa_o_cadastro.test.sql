-- A FICHA DO FORTEPLUS COMPLETA O CADASTRO (migration 20261112010000)
--
-- O que se prova aqui é a RPC `com_importar_ficha_clientes`: ela casa a ficha com a
-- base pela RAZÃO SOCIAL — a ficha não tem código de cliente —, **só preenche coluna
-- vazia**, e para diante de dois casos em que adivinhar destruiria dado.
--
-- AS ASSERÇÕES QUE MAIS IMPORTAM, e nenhuma é o caminho feliz:
--
--   3 — **não sobrescreve.** O cadastro é editável na tela. Se a importação
--   sobrescrevesse, reimportar a ficha antiga apagaria a correção feita à mão, sem
--   aviso. É a diferença entre "a ficha é um complemento" e "a ficha é a verdade".
--   4 — **nome repetido fica de fora.** 450 clientes têm 440 nomes distintos no banco
--   real: dez nomes são ambíguos. Preencher "o primeiro que aparecer" gravaria o
--   endereço de um cliente na ficha de outro, e isso não dá para desfazer.
--   5 — **documento que já é de outro cliente fica de fora, e o resto da ficha
--   entra.** `com_clientes_documento_unico` derrubaria a importação inteira na linha
--   300; e é o índice que faz o SAC reconhecer uma pessoa só.
--   7 — **reimportar não conta preenchimento.** Um número que sobe a cada reimportação
--   não mede nada.
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-ficha', 'Ficha Forteplus', false) as a;

create temporary table u on commit drop as
select tests.create_user('cadastro@ficha.test', (select a from f)) as pessoa;

select tests.grant_module((select pessoa from u), (select a from f), 'comercial');
-- O cargo NÃO é decoração. A policy de INSERT de `com_vendas_importacoes` exige
-- `is_admin_or_higher` ou a permissão `comercial.vendas.importar`: ter o módulo não
-- basta para importar. Com só o módulo, a RPC morre em 42501 na primeira linha — e é
-- assim que tem de ser, importação sobrescreve cadastro da empresa inteira.
select tests.grant_role((select pessoa from u), 'admin');

-- A base ANTES da ficha, como o CSV de clientes × tabela a deixa: código, razão
-- social, tabela — e nada de endereço.
--
-- `C-3` já tem endereço e telefone digitados na tela (é o caso da asserção 3).
-- `C-4` e `C-5` têm a MESMA razão social (asserção 4).
-- `C-6` já é dono do CNPJ que a ficha vai atribuir a `C-7` (asserção 5).
insert into public.com_clientes (tenant_id, codigo, razao_social, ativo, origem, documento, endereco, telefone)
values ((select a from f), 'C-1', 'COMERCIAL UM LTDA',      true, 'cadastro', null, null, null),
       ((select a from f), 'C-2', 'COMERCIAL DOIS LTDA',    true, 'cadastro', null, null, null),
       ((select a from f), 'C-3', 'COMERCIAL TRES LTDA',    true, 'cadastro', null,
        'Endereco digitado na tela', '(31)90000-0000'),
       ((select a from f), 'C-4', 'NOME REPETIDO LTDA',     true, 'cadastro', null, null, null),
       ((select a from f), 'C-5', 'NOME REPETIDO LTDA',     true, 'cadastro', null, null, null),
       ((select a from f), 'C-6', 'JA TEM O CNPJ LTDA',     true, 'cadastro', '11222333000181', null, null),
       ((select a from f), 'C-7', 'QUER O MESMO CNPJ LTDA', true, 'cadastro', null, null, null);

select tests.authenticate_as('cadastro@ficha.test');

-- A ficha, no formato que o leitor do front produz. O nome vem com caixa e espaço
-- diferentes de propósito: o casamento normaliza, e é isso que faz o arquivo real
-- casar ("  comercial um ltda " tem de achar 'COMERCIAL UM LTDA').
create temporary table r on commit drop as
select public.com_importar_ficha_clientes('pgtap-ficha.xlsx', jsonb_build_array(
  jsonb_build_object('razao_social', '  comercial um ltda ', 'documento', '33555888000188',
    'endereco', 'Rua Um, 10', 'cep', '30110-001', 'cidade', 'Belo Horizonte',
    'estado', 'mg', 'email', 'um@ficha.test', 'telefone', '(31)3333-1111'),
  jsonb_build_object('razao_social', 'COMERCIAL DOIS LTDA', 'documento', null,
    'endereco', 'Rua Dois, 20', 'cep', null, 'cidade', 'Campinas',
    'estado', 'SP', 'email', null, 'telefone', null),
  jsonb_build_object('razao_social', 'COMERCIAL TRES LTDA', 'documento', '44666999000188',
    'endereco', 'Endereco da ficha', 'cep', '70000-003', 'cidade', 'Brasilia',
    'estado', 'DF', 'email', 'tres@ficha.test', 'telefone', '(61)3333-3333'),
  jsonb_build_object('razao_social', 'NOME REPETIDO LTDA', 'documento', '55777111000109',
    'endereco', 'Rua do Ambiguo', 'cep', null, 'cidade', null, 'estado', null,
    'email', null, 'telefone', null),
  jsonb_build_object('razao_social', 'QUER O MESMO CNPJ LTDA', 'documento', '11222333000181',
    'endereco', 'Rua do Conflito, 7', 'cep', null, 'cidade', null, 'estado', null,
    'email', null, 'telefone', '(31)97777-7777'),
  jsonb_build_object('razao_social', 'NAO EXISTE NA BASE LTDA', 'documento', null,
    'endereco', 'Rua de Ninguem', 'cep', null, 'cidade', null, 'estado', null,
    'email', null, 'telefone', null)
)) as resumo;

-- 1. Preenche o que estava vazio, e a UF vira maiúscula (o CHECK exige).
select is(
  (select row(documento, endereco, cep, cidade, estado, email, telefone)::text
     from public.com_clientes where codigo = 'C-1'),
  row('33555888000188', 'Rua Um, 10', '30110-001', 'Belo Horizonte', 'MG',
      'um@ficha.test', '(31)3333-1111')::text,
  'preenche as sete colunas do cliente que estava vazio, e a UF sobe para maiuscula'
);

-- 2. Casa mesmo com caixa e espaço diferentes — é o que faz o arquivo real casar.
select is(
  (select cidade from public.com_clientes where codigo = 'C-2'),
  'Campinas',
  'casa pela razao social normalizada, e o campo que a ficha nao traz fica nulo'
);
select ok(
  (select cep is null and email is null from public.com_clientes where codigo = 'C-2'),
  'o que a ficha nao traz continua nulo, e nao vira string vazia'
);

-- 3. NÃO SOBRESCREVE o que alguém digitou na tela.
select is(
  (select row(endereco, telefone)::text from public.com_clientes where codigo = 'C-3'),
  row('Endereco digitado na tela', '(31)90000-0000')::text,
  'nao sobrescreve endereco nem telefone digitados na tela'
);
select is(
  (select cidade from public.com_clientes where codigo = 'C-3'),
  'Brasilia',
  'mas preenche a cidade, que estava vazia: a ficha completa, nao substitui'
);

-- 4. Nome repetido: NENHUM dos dois é tocado.
select ok(
  (select count(*)::int from public.com_clientes
    where razao_social = 'NOME REPETIDO LTDA' and endereco is null) = 2,
  'nome repetido nao preenche nenhum dos dois: adivinhar gravaria o endereco no cliente errado'
);

-- 5. Documento em conflito fica de fora, o RESTO da ficha entra.
select is(
  (select row(documento, endereco, telefone)::text
     from public.com_clientes where codigo = 'C-7'),
  row(null, 'Rua do Conflito, 7', '(31)97777-7777')::text,
  'documento que ja e de outro cliente fica de fora, e o resto da ficha entra'
);

-- 6. O resumo conta a verdade: 4 casaram (C-1, C-2, C-3, C-7), 1 não casou
--    (NAO EXISTE), 1 ambíguo (NOME REPETIDO), 1 documento em conflito.
select is(
  (select row(
     (resumo->>'casaram')::int, (resumo->>'nao_casaram')::int, (resumo->>'ambiguos')::int,
     (resumo->>'documentos_em_conflito')::int)::text from r),
  row(4, 1, 1, 1)::text,
  'o resumo conta casaram, nao casaram, ambiguos e documento em conflito'
);

-- 7. REIMPORTAR: casa os mesmos e não preenche mais nada.
--    Número de "preenchidos" que sobe a cada reimportacao nao mede nada.
select is(
  (select (public.com_importar_ficha_clientes('pgtap-ficha.xlsx', jsonb_build_array(
     jsonb_build_object('razao_social', 'COMERCIAL UM LTDA', 'documento', '33555888000188',
       'endereco', 'Rua Um, 10', 'cep', '30110-001', 'cidade', 'Belo Horizonte',
       'estado', 'MG', 'email', 'um@ficha.test', 'telefone', '(31)3333-1111')
   ))->>'preenchidos')::int),
  0,
  'reimportar a mesma ficha casa de novo e preenche zero'
);

select tests.clear_authentication();

select * from finish();
rollback;
