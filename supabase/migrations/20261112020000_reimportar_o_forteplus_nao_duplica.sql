-- Reimportar o relatório do Forteplus não duplica a conta
--
-- O PROBLEMA, em número. A importação financeira insere e pronto: `useImportFinEntries`
-- monta o lote em `fin_imports` e faz `insert` em `fin_entries` sem chave nenhuma de
-- identidade. Subir o mesmo relatório duas vezes — ou dois relatórios cujos períodos
-- encavalam, que é o caso normal quando se exporta "do dia tal até hoje" — grava a
-- mesma parcela duas vezes. O realizado do mês dobra, e nada na tela acusa: os dois
-- lançamentos são idênticos e legítimos vistos um por um.
--
-- A CHAVE EXISTE E É DO FORTEPLUS. Nos dois relatórios a primeira coluna é `Cod`,
-- que identifica a PARCELA (medido: 204 linhas de contas a receber, 204 códigos
-- distintos; 40 de contas a pagar, 40 distintos). O leitor
-- (`src/lib/forteplus-fin.ts`) grava `forteplus:receber:53` em `external_id`.
--
-- POR QUE ÍNDICE ÚNICO PARCIAL, E NÃO UMA CONSTRAINT. `external_id` é nulo em tudo
-- que nasce à mão na tela, e nulo não colide com nulo — mas um único por
-- (tenant_id, external_id) sem o `where` é aceito pelo Postgres e engana quem lê o
-- schema depois, porque parece exigir a coluna. Com o `where external_id is not null`
-- o índice diz o que faz: **quem tem origem externa é único por origem**; quem é
-- manual não é tocado.
--
-- POR QUE POR TENANT. `tenant_id` continua no banco (ADR-010) e é a barreira de
-- segurança. O `Cod 53` do Forteplus da Minasflor não pode colidir com o `Cod 53` de
-- outra empresa — sem o tenant no índice, a segunda empresa a importar veria a
-- própria conta recusada por um `on conflict` que casou com a conta de outra.
--
-- O QUE O FRONT FAZ COM ISSO. `useImportFinEntries` passa a usar
-- `upsert(..., { onConflict: 'tenant_id,external_id' })` para as linhas COM
-- `external_id`. Reimportar então ATUALIZA a parcela (o saldo pode ter mudado: a
-- conta que estava pendente na semana passada pode estar paga hoje) em vez de criar
-- uma segunda. É o comportamento que o dono espera de "subi o relatório de novo".

create unique index if not exists fin_entries_external_unico
  on public.fin_entries (tenant_id, external_id)
  where external_id is not null;

comment on index public.fin_entries_external_unico is
  'Uma parcela por origem externa. É o que faz reimportar o relatório do Forteplus '
  'atualizar em vez de duplicar. Parcial porque lançamento manual tem external_id nulo.';

do $$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'fin_entries'
       and indexname = 'fin_entries_external_unico'
  ) then
    raise exception 'o índice fin_entries_external_unico não foi criado';
  end if;
  -- Que ele BARRA o segundo e NÃO barra dois manuais é prova de comportamento, e
  -- prova de comportamento é pgTAP: `reimportar_nao_duplica.test.sql`.
end $$;
