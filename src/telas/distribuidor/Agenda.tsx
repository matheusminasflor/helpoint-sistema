// A agenda do distribuidor (etapa 6): as visitas marcadas, por dia, e o "fiz a visita" com o que aconteceu.
// Agendar é na ficha do salão (é ali que se sabe com quem).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useAgenda, useConcluirVisita, type Visita } from '@/hooks/usePortalDoDistribuidor';
import { diaCurto, toLocalISODate, todayISO } from '@/lib/dates';
import { mensagemDeErro } from '@/lib/supabase-result';

export default function AgendaDoDistribuidor() {
  const agenda = useAgenda();
  const hoje = todayISO();
  const porDia = new Map<string, Visita[]>();
  for (const v of agenda.data ?? []) {
    const d = toLocalISODate(new Date(v.quando));
    porDia.set(d, [...(porDia.get(d) ?? []), v]);
  }
  return (
    <>
      <h1 className="text-[24px] font-semibold">Agenda</h1>
      {agenda.error && <p className="text-[14px] text-status-danger">{mensagemDeErro(agenda.error)}</p>}
      {!agenda.isLoading && porDia.size === 0 && (
        <Card className="p-4 text-[14px] text-muted-foreground">Nenhuma visita marcada. Agende pela ficha do salão.</Card>
      )}
      {[...porDia.entries()].map(([dia, visitas]) => (
        <Card key={dia} className="p-4">
          <h2 className={dia < hoje ? 'text-[16px] font-semibold text-status-danger' : 'text-[16px] font-semibold'}>
            {dia === hoje ? 'Hoje' : diaCurto(dia)}{dia < hoje ? ' · atrasadas' : ''}
          </h2>
          <ul className="divide-y divide-border">{visitas.map((v) => <ItemDaAgenda key={v.id} v={v} />)}</ul>
        </Card>
      ))}
    </>
  );
}

function ItemDaAgenda({ v }: { v: Visita }) {
  const concluir = useConcluirVisita();
  const [aberto, setAberto] = useState(false);
  const [resultado, setResultado] = useState('');
  const hora = new Date(v.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (
    <li className="py-2.5 space-y-2">
      <div className="flex items-center gap-3">
        <Link to={`/distribuidor/saloes/${v.salao_id}`} className="flex-1 min-w-0 min-h-11 flex flex-col justify-center">
          <span className="text-[15px] truncate">{hora} · {v.salao?.nome}</span>
          {v.salao?.cidade && <span className="text-[13px] text-muted-foreground">{v.salao.cidade}</span>}
        </Link>
        {!aberto && <Button variant="outline" className="h-11" onClick={() => setAberto(true)}>Fiz a visita</Button>}
      </div>
      {aberto && (
        <div className="space-y-2">
          <Textarea rows={2} placeholder="Como foi? (deixou amostra, vai testar, comprou…)" aria-label="Como foi a visita"
            value={resultado} onChange={(e) => setResultado(e.target.value)} />
          <div className="flex gap-2">
            <Button className="h-11" disabled={concluir.isPending} onClick={() => concluir.mutate({ id: v.id, resultado })}>Registrar</Button>
            <Button variant="outline" className="h-11" onClick={() => setAberto(false)}>Voltar</Button>
          </div>
        </div>
      )}
    </li>
  );
}
