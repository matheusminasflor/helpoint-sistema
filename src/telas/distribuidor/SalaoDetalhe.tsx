// A ficha do salão (etapa 6): a etapa do funil, o contato (só do distribuidor e da equipe), as visitas e as vendas.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNoPortal } from '@/hooks/useNoPortal';
import {
  ETAPAS_DO_SALAO, useAgendarVisita, useMudarSalao, useSalao, useSalvarContato, type ContatoDoSalao,
} from '@/hooks/usePortalDoDistribuidor';
import { dataHora, diaCurto, fromLocalDateTimeInput } from '@/lib/dates';
import { mensagemDeErro } from '@/lib/supabase-result';
import { formatBRL } from '@/types/financeiro';
import { cn } from '@/lib/utils';

export default function SalaoDoDistribuidor() {
  const { id } = useParams();
  const { data, isLoading, error } = useSalao(id);
  const mudar = useMudarSalao();
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" aria-label="Carregando" /></div>;
  if (error) return <p className="text-[14px] text-status-danger">{mensagemDeErro(error)}</p>;
  if (!data?.salao) return <p className="text-[14px] text-muted-foreground">Salão não encontrado na sua carteira.</p>;
  const { salao, contatos, visitas, vendas } = data;
  return (
    <>
      <Link to="/distribuidor/saloes" className="inline-flex items-center gap-1 text-[14px] text-muted-foreground h-10">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Salões
      </Link>
      <div>
        <h1 className="text-[24px] font-semibold">{salao.nome}</h1>
        <p className="text-[14px] text-muted-foreground">{[salao.endereco, [salao.cidade, salao.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')}</p>
      </div>
      <Card className="p-4 space-y-2">
        <h2 className="text-[16px] font-semibold">Etapa</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Etapa do funil">
          {ETAPAS_DO_SALAO.map((e) => (
            <button key={e.etapa} type="button" aria-pressed={salao.etapa === e.etapa} disabled={mudar.isPending}
              onClick={() => salao.etapa !== e.etapa && mudar.mutate({ id: salao.id, etapa: e.etapa })}
              className={cn('px-3 h-10 rounded-full border text-[14px]',
                salao.etapa === e.etapa ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground')}>
              {e.rotulo}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground">Nesta etapa desde {diaCurto(salao.etapa_desde)}.</p>
      </Card>
      <Button asChild className="w-full h-12 text-base"><Link to={`/distribuidor/vender?salao=${salao.id}`}>Registrar venda</Link></Button>
      <Contato salaoId={salao.id} contato={contatos[0]} />
      <AgendarVisita salaoId={salao.id} />
      <Card className="p-4">
        <h2 className="text-[16px] font-semibold mb-2">Visitas</h2>
        {visitas.length === 0 ? <p className="text-[14px] text-muted-foreground">Nenhuma visita ainda.</p> : (
          <ul className="divide-y divide-border">
            {visitas.map((v) => (
              <li key={v.id} className="py-2">
                <p className="text-[15px]">{dataHora(v.quando)} · {v.feita_em ? 'feita' : 'agendada'}</p>
                {v.resultado && <p className="text-[13px] text-muted-foreground">{v.resultado}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-4">
        <h2 className="text-[16px] font-semibold mb-2">Vendas</h2>
        {vendas.length === 0 ? <p className="text-[14px] text-muted-foreground">Nenhuma venda registrada.</p> : (
          <ul className="divide-y divide-border">
            {vendas.map((v) => (
              <li key={v.id} className="py-2 flex gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px]">{diaCurto(v.data)}</span>
                  <span className="block text-[13px] text-muted-foreground truncate">
                    {v.itens.map((i) => `${i.quantidade}× ${i.produto_nome}`).join(', ')}
                  </span>
                </span>
                <span className="text-[15px] font-semibold tabular-nums">{formatBRL(Number(v.total))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Contato({ salaoId, contato }: { salaoId: string; contato?: ContatoDoSalao }) {
  const { distribuidor } = useNoPortal();
  const salvar = useSalvarContato();
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ nome: contato?.nome ?? '', telefone: contato?.telefone ?? '' });
  return (
    <Card className="p-4 space-y-2">
      <h2 className="text-[16px] font-semibold">Contato</h2>
      {!editando ? (
        <div className="flex items-center gap-3">
          <p className="flex-1 text-[15px]">{contato ? [contato.nome, contato.telefone].filter(Boolean).join(' · ') : 'Sem contato.'}</p>
          {contato?.telefone && (
            <Button asChild variant="outline" size="icon" className="h-11 w-11" aria-label={`Ligar para ${contato.telefone}`}>
              <a href={`tel:${contato.telefone.replace(/[^\d+]/g, '')}`}><Phone className="w-4 h-4" aria-hidden="true" /></a>
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={() => setEditando(true)}>{contato ? 'Editar' : 'Adicionar'}</Button>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate({ id: contato?.id, salao_id: salaoId, distribuidor_id: distribuidor.id, ...f }, { onSuccess: () => setEditando(false) });
        }}>
          <div className="space-y-1.5"><Label htmlFor="c-nome">Nome</Label>
            <Input id="c-nome" className="h-11 text-base" value={f.nome} onChange={(e) => setF((p) => ({ ...p, nome: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor="c-tel">Telefone</Label>
            <Input id="c-tel" className="h-11 text-base" inputMode="tel" value={f.telefone} onChange={(e) => setF((p) => ({ ...p, telefone: e.target.value }))} /></div>
          <div className="flex gap-2">
            <Button type="submit" className="h-11" disabled={salvar.isPending || (!f.nome.trim() && !f.telefone.trim())}>Salvar</Button>
            <Button type="button" variant="outline" className="h-11" onClick={() => setEditando(false)}>Voltar</Button>
          </div>
        </form>
      )}
      <p className="text-[12px] text-muted-foreground">Só você e a sua equipe veem o contato.</p>
    </Card>
  );
}

function AgendarVisita({ salaoId }: { salaoId: string }) {
  const { distribuidor } = useNoPortal();
  const agendar = useAgendarVisita();
  const [quando, setQuando] = useState('');
  return (
    <Card className="p-4">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
        e.preventDefault();
        agendar.mutate({ distribuidor_id: distribuidor.id, salao_id: salaoId, quando: fromLocalDateTimeInput(quando) },
          { onSuccess: () => setQuando('') });
      }}>
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <Label htmlFor="v-quando">Agendar visita</Label>
          <Input id="v-quando" type="datetime-local" className="h-11 text-base" value={quando} onChange={(e) => setQuando(e.target.value)} required />
        </div>
        <Button type="submit" variant="outline" className="h-11" disabled={!quando || agendar.isPending}>Agendar</Button>
      </form>
    </Card>
  );
}
