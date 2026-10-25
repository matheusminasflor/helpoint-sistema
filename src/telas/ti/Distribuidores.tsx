// TI › Distribuidores (Portal do Distribuidor, etapa 6; decisão 4 do dono, 2026-10-25): quem libera o cadastro é o
// Gestor da TI, ou quem da TI tem "Liberar distribuidor" no perfil. Aqui chegam os pedidos; liberar liga o
// distribuidor ao cliente do Forteplus (é de lá que vêm as notas, o estoque e a tabela de preço) e manda o e-mail.
import { useState } from 'react';
import { Copy, Store } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useTenantSlug } from '@/hooks/useTenantPath';
import {
  useClientesParaLigar, useDecidirDistribuidor, useDistribuidoresDaTI, type DistribuidorNaTI, type StatusDoDistribuidor,
} from '@/hooks/useDistribuidor';
import { mensagemDeErro } from '@/lib/supabase-result';
import { cn } from '@/lib/utils';

const ABAS: { status: StatusDoDistribuidor[]; rotulo: string }[] = [
  { status: ['pendente'], rotulo: 'Esperando' },
  { status: ['liberado'], rotulo: 'Liberados' },
  { status: ['recusado', 'suspenso'], rotulo: 'Recusados e suspensos' },
];
const ROTULO: Record<StatusDoDistribuidor, string> = { pendente: 'esperando', liberado: 'liberado', recusado: 'recusado', suspenso: 'suspenso' };
const cnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

export default function DistribuidoresDaTI() {
  const lista = useDistribuidoresDaTI();
  const libera = useDepartmentPermissions('ti').can('distribuidores', 'liberar');
  const slug = useTenantSlug();
  const [aba, setAba] = useState(0);
  const [ligando, setLigando] = useState<DistribuidorNaTI | null>(null);
  const [negando, setNegando] = useState<{ d: DistribuidorNaTI; acao: 'recusar' | 'suspender' } | null>(null);
  const linhas = (lista.data ?? []).filter((d) => ABAS[aba].status.includes(d.status));
  const link = slug ? `${window.location.origin}/distribuidor?tenant=${slug}` : null;

  return (
    <div>
      <PageHeader title="Distribuidores" icon={Store}
        description="Os pedidos de acesso ao Portal do Distribuidor. Confira os dados, ligue ao cliente do Forteplus e libere." />
      <div className="p-4 sm:p-6 space-y-4">
        {link && (
          <Card className="p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px]">
              <p className="text-[14px] font-semibold">Link do portal para os distribuidores</p>
              <p className="text-[13px] text-muted-foreground break-all">{link}</p>
            </div>
            <Button variant="outline" className="h-10 gap-1.5" onClick={() => navigator.clipboard.writeText(link).then(
              () => toast.success('Link copiado.'), () => toast.error('Não copiou: selecione o link e copie.'))}>
              <Copy className="w-4 h-4" aria-hidden="true" /> Copiar
            </Button>
          </Card>
        )}
        <div className="inline-flex flex-wrap rounded-md border border-border p-0.5" role="group" aria-label="Situação">
          {ABAS.map((a, i) => {
            const n = (lista.data ?? []).filter((d) => a.status.includes(d.status)).length;
            return (
              <button key={a.rotulo} type="button" aria-pressed={aba === i} onClick={() => setAba(i)}
                className={cn('px-3 min-h-10 rounded text-[14px]', aba === i ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                {a.rotulo}{n ? ` (${n})` : ''}
              </button>
            );
          })}
        </div>
        {lista.error && <p className="text-[14px] text-status-danger">{mensagemDeErro(lista.error)}</p>}
        {!lista.isLoading && linhas.length === 0 && <p className="text-[14px] text-muted-foreground">Nada aqui.</p>}
        <ul className="space-y-3">
          {linhas.map((d) => {
            const dono = d.membros.find((m) => m.papel === 'dono');
            const vendedores = d.membros.filter((m) => m.papel === 'vendedor' && m.ativo).length;
            return (
              <li key={d.id}>
                <Card className="p-4 space-y-2">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="flex-1 min-w-[220px]">
                      <p className="text-[16px] font-semibold">{d.razao_social}</p>
                      <p className="text-[13px] text-muted-foreground">
                        CNPJ {cnpj(d.cnpj)}{d.cidade ? ` · ${d.cidade}${d.uf ? `/${d.uf}` : ''}` : ''}{d.telefone ? ` · ${d.telefone}` : ''}
                      </p>
                      <p className="text-[13px] text-muted-foreground">
                        Pediu {dia(d.created_at)}{dono ? ` · ${dono.nome || ''} ${dono.email}` : ''}
                        {d.com_cliente_codigo ? ` · cliente ${d.com_cliente_codigo}` : ''}{vendedores ? ` · ${vendedores} vendedor(es)` : ''}
                      </p>
                      {d.motivo && <p className="text-[13px] mt-1">{ROTULO[d.status]}: {d.motivo}</p>}
                    </div>
                    {libera && (
                      <div className="flex flex-wrap gap-2">
                        {d.status !== 'liberado' && <Button className="h-10" onClick={() => setLigando(d)}>{d.status === 'pendente' ? 'Liberar' : 'Liberar de novo'}</Button>}
                        {d.status === 'pendente' && <Button variant="outline" className="h-10" onClick={() => setNegando({ d, acao: 'recusar' })}>Recusar</Button>}
                        {d.status === 'liberado' && <Button variant="outline" className="h-10" onClick={() => setNegando({ d, acao: 'suspender' })}>Suspender</Button>}
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
      {ligando && <LigarAoCliente d={ligando} fechar={() => setLigando(null)} />}
      {negando && <Negar {...negando} fechar={() => setNegando(null)} />}
    </div>
  );
}

function LigarAoCliente({ d, fechar }: { d: DistribuidorNaTI; fechar: () => void }) {
  const [busca, setBusca] = useState('');
  const [escolhido, setEscolhido] = useState<string | null>(d.com_cliente_codigo);
  const clientes = useClientesParaLigar(d.id, busca);
  const decidir = useDecidirDistribuidor();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Liberar {d.razao_social}</DialogTitle>
          <DialogDescription>Escolha o cliente do Forteplus deste distribuidor. O de mesmo CNPJ aparece primeiro.
            Ao liberar, ele recebe o e-mail de acesso.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="busca-cliente">Procurar por nome, código ou CNPJ</Label>
          <Input id="busca-cliente" value={busca} onChange={(e) => setBusca(e.target.value)} className="h-10" />
        </div>
        {clientes.error && <p className="text-[14px] text-status-danger">{mensagemDeErro(clientes.error)}</p>}
        <ul className="max-h-72 overflow-y-auto divide-y divide-border rounded-md border border-border" role="radiogroup" aria-label="Cliente do Forteplus">
          {(clientes.data ?? []).map((c) => (
            <li key={c.codigo}>
              <button type="button" role="radio" aria-checked={escolhido === c.codigo} onClick={() => setEscolhido(c.codigo)}
                className={cn('w-full text-left px-3 py-2.5 min-h-11', escolhido === c.codigo && 'bg-primary/10')}>
                <span className="block text-[14px] font-medium">{c.razao_social}{c.mesmo_cnpj ? ' · mesmo CNPJ' : ''}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {c.codigo}{c.cidade ? ` · ${c.cidade}${c.estado ? `/${c.estado}` : ''}` : ''}{c.tabela_preco ? ` · tabela ${c.tabela_preco}` : ''}
                </span>
              </button>
            </li>
          ))}
          {!clientes.isLoading && (clientes.data ?? []).length === 0 && (
            <li className="px-3 py-3 text-[14px] text-muted-foreground">Nenhum cliente com o mesmo CNPJ. Procure pelo nome.</li>
          )}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>Voltar</Button>
          <Button disabled={!escolhido || decidir.isPending}
            onClick={() => escolhido && decidir.mutate({ id: d.id, acao: 'liberar', cliente: escolhido }, { onSuccess: fechar })}>
            Liberar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Negar({ d, acao, fechar }: { d: DistribuidorNaTI; acao: 'recusar' | 'suspender'; fechar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const decidir = useDecidirDistribuidor();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{acao === 'recusar' ? 'Recusar' : 'Suspender'} {d.razao_social}</DialogTitle>
          <DialogDescription>O motivo aparece para o distribuidor no portal.</DialogDescription>
        </DialogHeader>
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo" rows={3} />
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>Voltar</Button>
          <Button variant="destructive" disabled={!motivo.trim() || decidir.isPending}
            onClick={() => decidir.mutate({ id: d.id, acao, motivo }, { onSuccess: fechar })}>
            {acao === 'recusar' ? 'Recusar' : 'Suspender'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
