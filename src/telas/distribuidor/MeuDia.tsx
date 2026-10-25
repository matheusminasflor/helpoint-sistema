// Meu dia do distribuidor (etapa 6; `dist_meu_dia`): as três perguntas da proposta, toda manhã — quem eu preciso
// visitar, quem eu preciso vender de novo, onde estou deixando dinheiro na mesa.
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useMeuDia } from '@/hooks/usePortalDoDistribuidor';
import { dataHora, diaCurto, toLocalISODate, todayISO } from '@/lib/dates';
import { mensagemDeErro } from '@/lib/supabase-result';

function Bloco({ titulo, vazio, children, n }: { titulo: string; vazio: string; n: number; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="text-[16px] font-semibold mb-2">{titulo}{n ? <span className="font-normal text-muted-foreground"> · {n}</span> : null}</h2>
      {n ? <ul className="divide-y divide-border">{children}</ul> : <p className="text-[14px] text-muted-foreground">{vazio}</p>}
    </Card>
  );
}

function Linha({ to, titulo, detalhe, destaque }: { to: string; titulo: string; detalhe: string; destaque?: string }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 py-2.5 min-h-11">
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] truncate">{titulo}</span>
          <span className="block text-[13px] text-muted-foreground truncate">{detalhe}</span>
        </span>
        {destaque && <span className="text-[13px] text-status-danger shrink-0">{destaque}</span>}
      </Link>
    </li>
  );
}

export default function MeuDiaDoDistribuidor() {
  const { data, isLoading, error } = useMeuDia();
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" aria-label="Carregando" /></div>;
  if (error || !data) return <p className="text-[14px] text-status-danger">{mensagemDeErro(error)}</p>;
  const hoje = todayISO();
  return (
    <>
      <h1 className="text-[24px] font-semibold">Meu dia</h1>
      <Bloco titulo="Quem visitar" n={data.visitas.length} vazio="Nenhuma visita para hoje. Agende na Agenda ou no salão.">
        {data.visitas.map((v) => (
          <Linha key={v.id} to={`/distribuidor/saloes/${v.salao_id}`} titulo={v.salao}
            detalhe={[dataHora(v.quando), v.cidade].filter(Boolean).join(' · ')}
            destaque={toLocalISODate(new Date(v.quando)) < hoje ? 'atrasada' : undefined} />
        ))}
      </Bloco>
      <Bloco titulo="Quem vender de novo" n={data.recompras.length}
        vazio="Nenhum salão passou do tempo de comprar de novo.">
        {data.recompras.map((r) => (
          <Linha key={r.salao_id} to={`/distribuidor/saloes/${r.salao_id}`} titulo={r.salao}
            detalhe={`comprou em ${diaCurto(r.ultima)} · compra a cada ${r.ciclo} dias${r.cidade ? ` · ${r.cidade}` : ''}`}
            destaque={r.atraso === 0 ? 'hoje' : `${r.atraso} dia${r.atraso === 1 ? '' : 's'} de atraso`} />
        ))}
      </Bloco>
      <Bloco titulo="Dinheiro na mesa" n={data.testando.length + data.acabando.length}
        vazio="Nenhum salão parado em teste e nenhum produto acabando.">
        {data.testando.map((t) => (
          <Linha key={t.salao_id} to={`/distribuidor/saloes/${t.salao_id}`} titulo={t.salao}
            detalhe={`testando há ${t.dias} dias: hora de fechar a venda${t.cidade ? ` · ${t.cidade}` : ''}`} />
        ))}
        {data.acabando.map((a) => (
          <Linha key={a.produto_codigo} to="/distribuidor/estoque" titulo={a.produto}
            detalhe={`vendeu ${a.vendeu_60_dias} em 60 dias e sobram ${a.saldo}: peça à Minasflor`} />
        ))}
      </Bloco>
    </>
  );
}
