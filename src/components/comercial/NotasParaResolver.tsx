// Falta informar a nota (tópicos 2 e 3, dono, 2026-11-05): o pedido aprovado fica aqui até o comercial informar número,
// valor faturado e data de emissão, e volta se a nota digitada não bater com a importação do Forteplus de sexta.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useInformarNota, useNotasDoComercial, type NotaParaResolver } from '@/hooks/usePedidosChecklist';
import { useTenantPath } from '@/hooks/useTenantPath';
import { TITULOS, diasDesde } from '@/lib/notas-para-resolver';
import { lerValor } from '@/lib/checklist-de-pedidos';
import { todayISO } from '@/lib/dates';
import { formatBRL, formatDateBR } from '@/types/financeiro';

export function NotasParaResolver() {
  const { data: notas = [], isError } = useNotasDoComercial();
  const [aberta, setAberta] = useState<NotaParaResolver | null>(null);
  if (isError) return <p className="text-[13px] text-status-danger">Não consegui carregar as notas pendentes.</p>;
  if (notas.length === 0) return null;
  const pendentes = notas.filter((n) => n.situacao !== 'valor_diferente').length;
  return (
    <Card className="p-3 space-y-2">
      <h2 className="text-[14px] font-semibold">{pendentes ? `Falta informar a nota (${pendentes})` : 'Notas corrigidas pelo Forteplus'}</h2>
      <p className="text-[13px] text-muted-foreground">O pedido só conta na venda depois de informar a nota.</p>
      <ul className="divide-y divide-border">
        {notas.map((n) => {
          const t = TITULOS[n.situacao];
          const dias = n.aprovado_em ? diasDesde(n.aprovado_em, todayISO()) : null;
          return (
            <li key={n.pedido_id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span>
                <strong>{n.cliente}</strong> · pedido {n.numero} · {n.filial} · {formatBRL(n.valor_pedido)}
                {n.vendedor && <span className="text-muted-foreground"> · {n.vendedor}</span>}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`text-[12px] ${t.classe}`}>
                  {t.rotulo}{n.situacao === 'falta_nota' && dias !== null ? ` · aprovado há ${dias} ${dias === 1 ? 'dia' : 'dias'}` : ''}
                </Badge>
                {n.situacao === 'valor_diferente'
                  ? <span className="text-muted-foreground">Digitado {formatBRL(n.nota_valor ?? 0)}, Forteplus {formatBRL(n.forteplus_valor ?? 0)}</span>
                  : <Button size="sm" onClick={() => setAberta(n)}>{n.situacao === 'corrigir' ? 'Corrigir nota' : 'Informar nota'}</Button>}
              </span>
            </li>
          );
        })}
      </ul>
      {aberta && <DialogoDaNota nota={aberta} onClose={() => setAberta(null)} />}
    </Card>
  );
}

function DialogoDaNota({ nota, onClose }: { nota: NotaParaResolver; onClose: () => void }) {
  const informar = useInformarNota();
  const [numero, setNumero] = useState(nota.nota_fiscal ?? '');
  const [valor, setValor] = useState(nota.nota_valor ? String(nota.nota_valor).replace('.', ',') : '');
  const [emissao, setEmissao] = useState(nota.nota_em ?? '');
  const valorNumero = lerValor(valor);
  const incompleto = !numero.trim() || !valorNumero || !emissao || emissao > todayISO();
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Informar nota · pedido {nota.numero} · {nota.filial}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="nota-numero">Número da nota</Label>
            <Input id="nota-numero" inputMode="numeric" className="font-mono" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="nota-valor">Valor faturado na nota (R$)</Label>
            <Input id="nota-valor" inputMode="decimal" className="font-mono" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="nota-emissao">Data de emissão</Label>
            <Input id="nota-emissao" type="date" max={todayISO()} value={emissao} onChange={(e) => setEmissao(e.target.value)} /></div>
          {nota.nota_em && <p className="text-[13px] text-muted-foreground">Digitada em {formatDateBR(nota.nota_em)}: a importação não encontrou essa nota.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={incompleto || informar.isPending}
            onClick={() => informar.mutate({ pedidoId: nota.pedido_id, nota: numero, valor: valorNumero!, emissao }, { onSuccess: onClose })}>Salvar nota</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** No Início: quem tem nota para informar vê o aviso e vai direto para a lista. */
export function AvisoDeNotasNoInicio() {
  const { user } = useAuth();
  const tenantPath = useTenantPath();
  const { data: notas = [] } = useNotasDoComercial();
  const minhas = notas.filter((n) => n.vendedor_id === user?.id && n.situacao !== 'valor_diferente').length;
  if (minhas === 0) return null;
  return (
    <Link to={tenantPath('/comercial/pedidos')} className="block rounded-lg badge-warning px-3 py-2 text-[14px] font-medium">
      Você tem {minhas} {minhas === 1 ? 'pedido com nota para informar' : 'pedidos com nota para informar'}. Abrir pedidos
    </Link>
  );
}
