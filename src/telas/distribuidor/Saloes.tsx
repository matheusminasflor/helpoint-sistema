// Salões do distribuidor (etapa 6): a carteira com o funil (novo → contato → visita → testando → cliente), a busca e
// o "lançar" salão novo. O dono vê todos; o vendedor, os dele.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useNoPortal } from '@/hooks/useNoPortal';
import { ETAPAS_DO_SALAO, rotuloDaEtapa, useCriarSalao, useSaloes, type EtapaDoSalao, type NovoSalao } from '@/hooks/usePortalDoDistribuidor';
import { useQueryState } from '@/hooks/useQueryState';
import { mensagemDeErro } from '@/lib/supabase-result';
import { cn } from '@/lib/utils';

export default function SaloesDoDistribuidor() {
  const saloes = useSaloes();
  const [etapa, setEtapa] = useQueryState<string>('etapa', '');
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const todos = saloes.data ?? [];
  const termo = busca.trim().toLowerCase();
  const linhas = todos.filter((s) => (!etapa || s.etapa === etapa)
    && (!termo || s.nome.toLowerCase().includes(termo) || (s.cidade ?? '').toLowerCase().includes(termo)));
  return (
    <>
      <div className="flex items-center gap-2">
        <h1 className="text-[24px] font-semibold flex-1">Salões</h1>
        <Button className="h-11 gap-1.5" onClick={() => setNovo(true)}><Plus className="w-4 h-4" aria-hidden="true" /> Novo salão</Button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Etapa do funil">
        {[{ etapa: '', rotulo: 'Todos' }, ...ETAPAS_DO_SALAO].map((e) => {
          const n = e.etapa ? todos.filter((s) => s.etapa === e.etapa).length : todos.length;
          return (
            <button key={e.etapa || 'todos'} type="button" aria-pressed={etapa === e.etapa} onClick={() => setEtapa(e.etapa)}
              className={cn('shrink-0 px-3 h-10 rounded-full border text-[14px]',
                etapa === e.etapa ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground')}>
              {e.rotulo} {n}
            </button>
          );
        })}
      </div>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar salão ou cidade" aria-label="Procurar salão"
          className="h-11 pl-9 text-base" />
      </div>
      {saloes.error && <p className="text-[14px] text-status-danger">{mensagemDeErro(saloes.error)}</p>}
      <Card className="divide-y divide-border">
        {linhas.map((s) => (
          <Link key={s.id} to={`/distribuidor/saloes/${s.id}`} className="flex items-center gap-3 px-4 py-3 min-h-11">
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] truncate">{s.nome}</span>
              <span className="block text-[13px] text-muted-foreground truncate">{[s.cidade, s.uf].filter(Boolean).join('/') || 'sem cidade'}</span>
            </span>
            <span className="text-[13px] text-muted-foreground shrink-0">{rotuloDaEtapa(s.etapa)}</span>
          </Link>
        ))}
        {!saloes.isLoading && linhas.length === 0 && (
          <p className="px-4 py-6 text-[14px] text-muted-foreground">
            {todos.length ? 'Nenhum salão com esse filtro.' : 'Nenhum salão ainda. Cadastre os salões que você atende e os que quer conquistar.'}
          </p>
        )}
      </Card>
      {novo && <NovoSalaoDialog fechar={() => setNovo(false)} />}
    </>
  );
}

function NovoSalaoDialog({ fechar }: { fechar: () => void }) {
  const { distribuidor } = useNoPortal();
  const criar = useCriarSalao();
  const [f, setF] = useState<NovoSalao>({ distribuidor_id: distribuidor.id, nome: '', cidade: distribuidor.cidade ?? '',
    uf: distribuidor.uf ?? '', endereco: '', etapa: 'novo', contato_nome: '', contato_telefone: '' });
  const campo = (k: keyof NovoSalao, rotulo: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="space-y-1.5">
      <Label htmlFor={`s-${k}`}>{rotulo}</Label>
      <Input id={`s-${k}`} className="h-11 text-base" value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} {...extra} />
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo salão</DialogTitle>
          <DialogDescription>O nome e o telefone do contato ficam só com você e a sua equipe.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" id="novo-salao" onSubmit={(e) => { e.preventDefault(); criar.mutate(f, { onSuccess: fechar }); }}>
          {campo('nome', 'Nome do salão', { required: true })}
          <div className="grid grid-cols-[1fr_80px] gap-3">{campo('cidade', 'Cidade')}{campo('uf', 'UF', { maxLength: 2 })}</div>
          {campo('endereco', 'Endereço')}
          <div className="space-y-1.5">
            <Label htmlFor="s-etapa">Etapa</Label>
            <select id="s-etapa" className="h-11 w-full rounded-md border border-input bg-background px-3 text-base" value={f.etapa}
              onChange={(e) => setF((p) => ({ ...p, etapa: e.target.value as EtapaDoSalao }))}>
              {ETAPAS_DO_SALAO.filter((x) => x.etapa !== 'perdido').map((x) => <option key={x.etapa} value={x.etapa}>{x.rotulo}</option>)}
            </select>
          </div>
          {campo('contato_nome', 'Contato (nome)')}
          {campo('contato_telefone', 'Telefone do contato', { inputMode: 'tel' })}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>Voltar</Button>
          <Button type="submit" form="novo-salao" disabled={criar.isPending || !f.nome.trim()}>Cadastrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
