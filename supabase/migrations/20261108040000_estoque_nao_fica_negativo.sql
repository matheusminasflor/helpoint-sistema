-- O saldo do lote não fica negativo.
--
-- O DEFEITO (achado na varredura de 2026-09-27). `exp_stock_moves` aceitava
-- `adjust` com **qualquer** sinal — o CHECK `exp_stock_moves_sign` só exige sinal
-- coerente para `in` (positivo) e `out` (negativo), e libera `adjust`. O único
-- trigger da tabela era `inject_tenant_id`. E `exp_lot_balances` é uma **view** que
-- soma os movimentos: não há coluna de saldo para um CHECK proteger.
--
-- Resultado: um ajuste negativo maior que o saldo levava o lote a estoque negativo
-- **sem aviso nenhum**. A tela dizia apenas "negativo tira", e `exp_scan` conferia
-- `<= 0` só na hora de bipar — depois do estrago. Saldo negativo não é um número
-- errado qualquer: é a separação prometendo mercadoria que não existe.
--
-- ONDE A REGRA MORA: aqui, e não na tela. São três caminhos escrevendo movimento
-- (a tela de estoque, `exp_pick_lot` e `exp_ship`), e regra em um deles não vale
-- para os outros dois.
--
-- VALE PARA TODO MUNDO, inclusive escrita de trigger — **sem** a isenção de
-- `pg_trigger_depth() > 1` da lição 8 do pgTAP. Aquela isenção existe para guarda de
-- PERMISSÃO ("isto é escrita do sistema, não do usuário"); esta é guarda FÍSICA:
-- estoque negativo é impossível venha de onde vier, e um caminho automático que o
-- produzisse seria o pior lugar para abrir exceção.
--
-- Só olha o lote do movimento, não a tabela toda: o custo é uma soma por escrita, e
-- movimento de estoque é raro comparado a leitura.

create or replace function public.exp_saldo_nao_fica_negativo()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_saldo numeric;
  v_codigo text;
begin
  -- Movimento que só ADICIONA não precisa de conferência.
  if new.quantity > 0 then
    return new;
  end if;

  -- O LOTE NÃO É DA EMPRESA? SAI DAQUI SEM OPINAR.
  --
  -- Lição 8 do pgTAP, aprendida de novo em 2026-09-27: a primeira versão deste
  -- trigger reprovou `expedicao_estoque.test.sql:207` ("empresa B nao lanca
  -- movimentacao contra o lote da empresa A"), que espera **23503** — a violação da
  -- chave estrangeira composta `(lot_id, tenant_id)`, que é quem guarda o
  -- isolamento entre empresas. Como o trigger `before` roda antes da FK, ele
  -- respondia primeiro e com a mensagem errada: "o lote tem 0 em estoque". Verdade
  -- inútil — o problema não é o saldo, é que o lote não é dela.
  --
  -- Guarda nova não pode responder por guarda velha. Sem lote casando por empresa,
  -- devolve `new` e deixa a FK dizer o que ela diz melhor.
  if not exists (
    select 1 from public.exp_lots l
     where l.id = new.lot_id and l.tenant_id = new.tenant_id
  ) then
    return new;
  end if;

  select coalesce(sum(m.quantity), 0) into v_saldo
    from public.exp_stock_moves m
   where m.lot_id = new.lot_id
     and m.tenant_id = new.tenant_id;

  -- `new.quantity` é negativo aqui, então somar é subtrair.
  if v_saldo + new.quantity < 0 then
    select l.code into v_codigo from public.exp_lots l where l.id = new.lot_id;
    raise exception
      'o lote % tem % em estoque e este movimento tiraria % — o saldo ficaria negativo',
      coalesce(v_codigo, new.lot_id::text), v_saldo, abs(new.quantity)
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.exp_saldo_nao_fica_negativo() is
  'Barra movimento que levaria o saldo do lote a negativo. Guarda fisica: vale para a tela, para exp_pick_lot, para exp_ship e para escrita de trigger. 2026-09-27.';

drop trigger if exists exp_stock_moves_saldo_nao_negativo on public.exp_stock_moves;
create trigger exp_stock_moves_saldo_nao_negativo
  before insert on public.exp_stock_moves
  for each row execute function public.exp_saldo_nao_fica_negativo();

-- Só `insert`: movimento de estoque é histórico e não se edita — não há policy de
-- UPDATE em `exp_stock_moves` que permita reescrever quantidade. Se um dia houver,
-- este trigger precisa cobrir `update` também, e o comentário fica aqui como aviso.
