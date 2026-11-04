-- MAIS DO INSTAGRAM NOS INDICADORES DO MARKETING (proposta aprovada em 2026-11-04,
-- https://claude.ai/artifact/38uLvZFcbX9kXD2efuQxqZ; o dono tirou mensagens no Direct e cliques no link, que a Meta não
-- entrega ao robô). Tudo vem do coletor `mkt-meta-coletar`; nada aqui se lança à mão.
--   · alcance e visualizações da conta na semana;
--   · `publicacoes`: cada post, reels e story da semana com alcance, visualizações e interações (os 3 melhores e o alcance
--     médio por formato saem daqui). Story só tem número nas 24 h em que está no ar, por isso o coletor passa a cada 3 h
--     e guarda o maior alcance que viu;
--   · `mkt_publico_ig`: quem segue cada conta (gênero, idade, países, cidades) e quando fica online, uma linha por mês.

alter table public.mkt_redes_semana
  add column if not exists alcance integer check (alcance >= 0),
  add column if not exists visualizacoes integer check (visualizacoes >= 0),
  add column if not exists publicacoes jsonb;

create table if not exists public.mkt_publico_ig (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conta text not null check (length(btrim(conta)) > 0),
  mes date not null check (extract(day from mes) = 1),
  genero jsonb,
  idade jsonb,
  paises jsonb,
  cidades jsonb,
  -- Seguidores online por dia da semana (0 = domingo) e hora de Brasília: { "1": { "19": 1234, ... }, ... }.
  online jsonb,
  coletado_em timestamptz not null default now(),
  unique (tenant_id, conta, mes)
);

alter table public.mkt_publico_ig enable row level security;
-- O padrão do schema dá tudo a `authenticated`; aqui a tela só lê (sem o revoke, gravar dava zero linhas em vez de erro).
revoke all on public.mkt_publico_ig from public, anon, authenticated;
grant select on public.mkt_publico_ig to authenticated;
-- Só o coletor (chave de serviço) grava; quem vê os Indicadores do Marketing ou a Diretoria lê.
create policy mkt_publico_ig_le on public.mkt_publico_ig for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'reports', 'view')) or (select public.dir_pode_ver('indicadores'))));

-- O coletor passa a cada 3 horas (era uma vez, às 06h): é o que pega o alcance de cada story antes de ele sumir. O job
-- nasce na 20270212270000; aqui só muda o horário.
select cron.alter_job(jobid, schedule := '0 */3 * * *') from cron.job where jobname = 'mkt-meta-coletar';
