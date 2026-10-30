// "Minhas rotinas de hoje" no Início, antes dos chamados (dono, 2026-10-30; docs/proposta-rotinas.md). Pelas Leis de UX:
// o dia em três blocos (Miller); só o período de agora aberto (Hick); o que falta contado e à vista (Zeigarnik); a barra
// que enche (gradiente de meta); "Tudo feito hoje" no fim (pico-final); a linha inteira é o botão de marcar (Fitts).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Camera, Check, ChevronDown, ListChecks, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useDesmarcarRotina, useMarcarRotina, useMeusHorarios, useRotinasDeHoje, type RotinaDeHoje } from '@/hooks/useRotinas';
import { PERIODOS, ROTULO_DO_PERIODO, periodoAgora, type Periodo } from '@/lib/rotinas';
import { cn } from '@/lib/utils';

type Pedido = { rotina: RotinaDeHoje; modo: 'observacao' | 'anexo' | 'pular' };

export function RotinasDeHoje() {
  const tenantPath = useTenantPath();
  const { data: rotinas = [], isLoading } = useRotinasDeHoje();
  const { data: horarios } = useMeusHorarios();
  const marcar = useMarcarRotina();
  const desmarcar = useDesmarcarRotina();
  const agora = periodoAgora(format(new Date(), 'HH:mm'), horarios);
  const [abertos, setAbertos] = useState<Set<Periodo> | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);

  if (isLoading) return null;
  if (rotinas.length === 0) {
    return (
      <section className="panel flex flex-wrap items-center gap-3 px-4 py-4 sm:px-8">
        <ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />
        <p className="flex-1 text-[15px] text-muted-foreground">Nenhuma rotina para hoje.</p>
        <Button asChild variant="ghost" size="sm" className="font-semibold text-primary">
          <Link to={tenantPath('/rotinas')}>Cadastrar rotina</Link>
        </Button>
      </section>
    );
  }

  const feitas = rotinas.filter((r) => r.situacao).length;
  const tudoFeito = feitas === rotinas.length;
  // Aberto: o período de agora (e, depois dele, os anteriores que ficaram pela metade). A pessoa abre e fecha à vontade.
  const ordemAgora = PERIODOS.indexOf(agora);
  const padrao = new Set<Periodo>(PERIODOS.filter((p, i) =>
    p === agora || (i < ordemAgora && rotinas.some((r) => r.periodo === p && !r.situacao))));
  const estaAberto = (p: Periodo) => (abertos ?? padrao).has(p);
  const alternar = (p: Periodo) => setAbertos((s) => {
    const n = new Set(s ?? padrao);
    if (n.has(p)) n.delete(p); else n.add(p);
    return n;
  });

  const tocar = (r: RotinaDeHoje) => {
    if (r.situacao) { desmarcar.mutate(r); return; }
    if (r.pede === 'nada') { marcar.mutate({ rotina: r, situacao: 'feita' }); return; }
    setTexto(''); setArquivo(null); setPedido({ rotina: r, modo: r.pede });
  };
  const confirmar = () => {
    if (!pedido) return;
    const { rotina, modo } = pedido;
    marcar.mutate(
      modo === 'pular' ? { rotina, situacao: 'pulada', motivo: texto }
        : modo === 'observacao' ? { rotina, situacao: 'feita', observacao: texto }
          : { rotina, situacao: 'feita', arquivo: arquivo ?? undefined, observacao: texto || undefined },
      { onSuccess: () => setPedido(null) },
    );
  };
  const podeConfirmar = pedido?.modo === 'anexo' ? !!arquivo : texto.trim().length >= 3;

  return (
    <section className="panel px-4 pb-4 pt-5 sm:px-8 sm:pt-6" aria-label="Minhas rotinas de hoje">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-[22px] font-bold sm:text-[24px]">Minhas rotinas de hoje</h2>
        <span className={cn('estado', tudoFeito ? 'estado-concluido' : 'badge-info')}>{feitas} de {rotinas.length}</span>
        <div className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-muted" role="progressbar"
          aria-valuemin={0} aria-valuemax={rotinas.length} aria-valuenow={feitas} aria-label="Rotinas feitas hoje">
          <div className="h-full rounded-full bg-[hsl(var(--status-success))] transition-[width] duration-500" style={{ width: `${(feitas / rotinas.length) * 100}%` }} />
        </div>
        <Button asChild variant="ghost" size="sm" className="font-semibold text-primary">
          <Link to={tenantPath('/rotinas')}>Gerenciar</Link>
        </Button>
      </div>

      {tudoFeito ? (
        <p className="flex items-center gap-2 rounded-xl bg-[hsl(var(--badge-success-bg))] px-4 py-3 text-[15px] font-bold text-[hsl(var(--badge-success-text))]">
          <Check className="h-5 w-5" aria-hidden="true" />Tudo feito hoje. Bom trabalho!
        </p>
      ) : (
        <div className="space-y-2.5">
          {PERIODOS.map((p) => {
            const doPeriodo = rotinas.filter((r) => r.periodo === p);
            if (doPeriodo.length === 0) return null;
            const feitasNoPeriodo = doPeriodo.filter((r) => r.situacao).length;
            const aberto = estaAberto(p);
            const eAgora = p === agora;
            return (
              <div key={p} className={cn('overflow-hidden rounded-xl border', eAgora && 'border-primary ring-2 ring-primary/15')}>
                <button type="button" onClick={() => alternar(p)} aria-expanded={aberto}
                  className={cn('flex w-full items-center gap-2 px-4 py-2.5 text-left text-[15px] font-bold',
                    eAgora ? 'bg-primary/10 text-primary' : 'bg-muted/60 text-foreground')}>
                  {ROTULO_DO_PERIODO[p]}{eAgora && ' · agora'}
                  <span className={cn('ml-auto text-[13px] font-semibold', !eAgora && 'text-muted-foreground')}>
                    {feitasNoPeriodo === doPeriodo.length ? `${feitasNoPeriodo} de ${doPeriodo.length} feitas ✓` : `${feitasNoPeriodo} de ${doPeriodo.length}`}
                  </span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', aberto && 'rotate-180')} aria-hidden="true" />
                </button>
                {aberto && (
                  <ul className="divide-y">
                    {doPeriodo.map((r) => (
                      <LinhaDaRotina key={`${r.rotina_id}-${r.pessoa_id}`} r={r} ocupado={marcar.isPending || desmarcar.isPending}
                        onTocar={() => tocar(r)}
                        onPular={() => { setTexto(''); setPedido({ rotina: r, modo: 'pular' }); }} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!pedido} onOpenChange={(o) => !o && setPedido(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pedido?.modo === 'pular' ? 'Pular esta rotina hoje' : 'Marcar como feita'}</DialogTitle>
            <DialogDescription>{pedido?.rotina.titulo}</DialogDescription>
          </DialogHeader>
          {pedido?.modo === 'anexo' && (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center hover:bg-muted/40">
              <Camera className="h-7 w-7 text-primary" aria-hidden="true" />
              <span className="text-[15px] font-semibold">{arquivo ? arquivo.name : 'Tirar foto ou escolher arquivo'}</span>
              <span className="text-[13px] text-muted-foreground">Foto, PDF ou planilha, até 10 MB.</span>
              <input type="file" accept="image/*,application/pdf,.xlsx,.xls,.csv" className="sr-only"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            </label>
          )}
          <div className="space-y-1.5">
            <label htmlFor="rotina-texto" className="text-[14px] font-semibold">
              {pedido?.modo === 'pular' ? 'Por que não deu para fazer?' : pedido?.modo === 'anexo' ? 'Observação (opcional)' : 'Observação'}
            </label>
            <Textarea id="rotina-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={500}
              placeholder={pedido?.modo === 'pular' ? 'Ex.: o fornecedor não entregou' : 'Ex.: conferido, tudo certo'} />
            {pedido?.modo === 'pular' && <p className="text-[13px] text-muted-foreground">O gestor do setor vê o motivo.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPedido(null)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!podeConfirmar || marcar.isPending}>
              {marcar.isPending ? 'Salvando…' : pedido?.modo === 'pular' ? 'Pular hoje' : 'Marcar como feita'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function LinhaDaRotina({ r, ocupado, onTocar, onPular }: { r: RotinaDeHoje; ocupado: boolean; onTocar: () => void; onPular: () => void }) {
  const hora = r.feita_em ? format(new Date(r.feita_em), 'HH:mm') : '';
  return (
    <li className="flex items-start gap-2 px-2 py-1.5 sm:px-3">
      <button type="button" onClick={onTocar} disabled={ocupado}
        aria-label={r.situacao ? `Desfazer: ${r.titulo}` : `Marcar como feita: ${r.titulo}`}
        className="group flex min-h-[48px] flex-1 items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50 disabled:opacity-70">
        <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2',
          r.situacao === 'feita' ? 'border-[hsl(var(--status-success))] bg-[hsl(var(--status-success))] text-primary-foreground'
            : r.situacao === 'pulada' ? 'border-[hsl(var(--status-warning))] bg-[hsl(var(--status-warning))] text-primary-foreground'
              : 'border-muted-foreground/60 group-hover:border-primary')}>
          {r.situacao === 'feita' && <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />}
          {r.situacao === 'pulada' && <Undo2 className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-[15px] font-semibold leading-snug', r.situacao && 'text-muted-foreground line-through')}>{r.titulo}</span>
          {r.pessoa_nome && <span className="block text-[13px] font-semibold text-primary">Substituindo {r.pessoa_nome} (férias)</span>}
          {r.situacao === 'feita' && <span className="block text-[13px] text-muted-foreground">Feita às {hora}{r.feita_por_nome && r.pessoa_nome ? ` por ${r.feita_por_nome}` : ''}{r.observacao ? ` · ${r.observacao}` : ''}</span>}
          {r.situacao === 'pulada' && <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground"><span className="estado badge-warning">Pulada</span>{r.motivo}</span>}
          {!r.situacao && r.como_fazer && <span className="block text-[13px] text-muted-foreground line-clamp-2">{r.como_fazer}</span>}
          {!r.situacao && r.pede === 'anexo' && <span className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-semibold text-primary"><Camera className="h-3.5 w-3.5" aria-hidden="true" />Pede foto ou arquivo</span>}
          {!r.situacao && r.pede === 'observacao' && <span className="block text-[13px] font-semibold text-primary">Pede uma observação</span>}
        </span>
      </button>
      {!r.situacao && (
        <Button variant="ghost" size="sm" className="mt-2 shrink-0 text-muted-foreground" onClick={onPular} disabled={ocupado}>Pular</Button>
      )}
    </li>
  );
}
