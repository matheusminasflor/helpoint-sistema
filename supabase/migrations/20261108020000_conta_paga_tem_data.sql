-- Conta paga tem data de pagamento.
--
-- DECISÃO DO DONO em 2026-09-27: "Sim, exigir a data."
--
-- O DEFEITO QUE ISSO FECHA. `settled_at` era opcional e nada obrigava a preenchê-la
-- quando o status virava `paid`. Aí TRÊS TELAS DISCORDAVAM SOBRE O MESMO DINHEIRO:
--
--   - a lista de lançamentos soma pelo status  → a conta entra em "Já pago";
--   - o fluxo de caixa agrupa por `settled_at` → a conta não entra em mês nenhum;
--   - os indicadores filtram por `settled_at`  → a conta não entra no realizado.
--
-- O valor saía do realizado sem sair do total, e nenhuma tela dava erro. É a mesma
-- família de "sem dado virando número plausível" que `docs/nao-funciona.md`
-- registra cinco vezes.
--
-- ONDE A REGRA MORA. No banco, não na tela. São três telas e um importador lendo a
-- mesma coluna; regra em uma delas não vale para as outras três (é a razão de
-- `CLAUDE.md` dizer que regra de negócio vive em trigger e função SQL).
--
-- A DATA É A DO BRASIL, não a do servidor: `(now() at time zone
-- 'America/Sao_Paulo')::date`. Com `current_date` (UTC), tudo liquidado depois das
-- 21h cairia no dia seguinte — e no último dia do mês, no MÊS seguinte do
-- realizado. É a regra 10 do pgTAP e a regra 4 das cinco, do lado do banco.
--
-- TRIGGER **E** CHECK, e não é cinto com suspensório: o trigger preenche (é o que o
-- dono pediu — marcar como paga sem informar data grava o dia de hoje), e o CHECK
-- afirma a invariante que o trigger produz. Trigger `BEFORE` roda antes da
-- validação de CHECK, então o CHECK nunca reprova escrita legítima. Ele existe para
-- o dia em que alguém apagar o trigger: aí a escrita falha alto, em vez de voltar a
-- gravar pago sem data em silêncio.

-- 1. As linhas que já estão assim. `due_date` é o mais honesto que existe: não há
--    registro de quando foi pago, e o vencimento é a data que a pessoa conhece.
--    Idempotente de propósito — ver a lição das migrations reaplicadas em
--    `docs/nao-funciona.md`.
update public.fin_entries
   set settled_at = due_date
 where status = 'paid'
   and settled_at is null;

-- 2. O preenchimento.
create or replace function public.fin_conta_paga_tem_data()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'paid' and new.settled_at is null then
    new.settled_at := (now() at time zone 'America/Sao_Paulo')::date;
  end if;

  -- Deixar de ser paga tira a data: senão a conta reaberta continuaria contando no
  -- realizado daquele mês, que é o defeito ao contrário. Só mexe quando a data foi
  -- posta por aqui ou pela tela — se a pessoa informou outro status E uma data, ela
  -- está dizendo algo, e não cabe a este trigger discordar.
  if tg_op = 'UPDATE' and new.status in ('pending', 'overdue') and old.status = 'paid'
     and new.settled_at is not distinct from old.settled_at then
    new.settled_at := null;
  end if;

  return new;
end;
$$;

comment on function public.fin_conta_paga_tem_data() is
  'Conta paga recebe a data do dia (fuso do Brasil) quando nenhuma é informada, e perde a data ao deixar de ser paga. Decisão do dono, 2026-09-27.';

drop trigger if exists fin_entries_paga_tem_data on public.fin_entries;
create trigger fin_entries_paga_tem_data
  before insert or update on public.fin_entries
  for each row execute function public.fin_conta_paga_tem_data();

-- 3. A invariante, afirmada.
alter table public.fin_entries drop constraint if exists fin_entries_paga_tem_data;
alter table public.fin_entries add constraint fin_entries_paga_tem_data
  check (status <> 'paid' or settled_at is not null);

-- Regra 14 do pgTAP: `create or replace` preserva a ACL, então não há revoke/grant
-- a refazer aqui. Função de trigger não é chamável por ninguém de fora de todo modo.
