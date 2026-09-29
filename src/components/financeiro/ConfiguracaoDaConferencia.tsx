// Financeiro › Configurações › Conferência de pedidos (LEVA S, 2026-09-29): os itens que a vendedora
// responde em cada pedido e os motivos com que o Financeiro recusa. No sistema antigo eram listas
// fixas no código (manual §14, dívida 1 e 2); aqui são configuração, semeadas com as de hoje.
//
// Item e motivo já usados não se apagam — se desligam. O histórico continua dizendo o que foi
// conferido e por que foi recusado.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useItensDoChecklist, useMotivosDeRecusa, useSalvarItemDoChecklist, useSalvarMotivoDeRecusa,
} from '@/hooks/usePedidosChecklist';

export function ConfiguracaoDaConferencia({ podeAlterar }: { podeAlterar: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ItensDaConferencia podeAlterar={podeAlterar} />
      <MotivosDeRecusa podeAlterar={podeAlterar} />
    </div>
  );
}

function ItensDaConferencia({ podeAlterar }: { podeAlterar: boolean }) {
  const { data: itens = [] } = useItensDoChecklist(true);
  const salvar = useSalvarItemDoChecklist();
  const [novo, setNovo] = useState('');

  return (
    <Card className="p-4 space-y-3">
      <div>
        <p className="text-[14px] font-semibold">Itens que a vendedora confere</p>
        <p className="text-[12px] text-muted-foreground">
          Cada pedido responde todos os itens ligados: Sim, Não ou Não se aplica. "Não" impede o envio. O item com
          justificativa pede o texto quando a resposta é Sim.
        </p>
      </div>
      <ul className="divide-y divide-border rounded-md border border-border">
        {itens.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[12px]">
            <span className={`flex-1 min-w-[160px] ${i.ativo ? '' : 'text-muted-foreground line-through'}`}>
              {i.rotulo}{i.regra === 'st' && <span className="text-muted-foreground"> (conferido com o ST do espelho)</span>}
            </span>
            <label className="flex items-center gap-1.5">
              <Checkbox checked={i.pede_justificativa} disabled={!podeAlterar || salvar.isPending}
                onCheckedChange={(v) => salvar.mutate({ ...i, pede_justificativa: v === true })} />
              justificativa
            </label>
            <Switch checked={i.ativo} disabled={!podeAlterar || salvar.isPending} aria-label={`Ligar o item ${i.rotulo}`}
              onCheckedChange={(v) => salvar.mutate({ ...i, ativo: v })} />
          </li>
        ))}
      </ul>
      {podeAlterar && (
        <form className="flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          if (!novo.trim()) return;
          salvar.mutate(
            { rotulo: novo.trim(), ajuda: null, ordem: (itens.at(-1)?.ordem ?? 0) + 1, pede_justificativa: false, ativo: true },
            { onSuccess: () => setNovo('') },
          );
        }}>
          <Input placeholder="Novo item" value={novo} onChange={(e) => setNovo(e.target.value)} aria-label="Novo item da conferência" />
          <Button type="submit" size="sm" disabled={!novo.trim() || salvar.isPending}>
            <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Incluir
          </Button>
        </form>
      )}
    </Card>
  );
}

function MotivosDeRecusa({ podeAlterar }: { podeAlterar: boolean }) {
  const { data: motivos = [] } = useMotivosDeRecusa(true);
  const salvar = useSalvarMotivoDeRecusa();
  const [novo, setNovo] = useState('');

  return (
    <Card className="p-4 space-y-3">
      <div>
        <p className="text-[14px] font-semibold">Motivos de recusa</p>
        <p className="text-[12px] text-muted-foreground">
          A lista que o Financeiro marca ao devolver um checklist. É ela que vira o ranking de motivos nos indicadores.
        </p>
      </div>
      <ul className="divide-y divide-border rounded-md border border-border">
        {motivos.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-[12px]">
            <span className={`flex-1 ${m.ativo ? '' : 'text-muted-foreground line-through'}`}>{m.nome}</span>
            <Switch checked={m.ativo} disabled={!podeAlterar || salvar.isPending} aria-label={`Ligar o motivo ${m.nome}`}
              onCheckedChange={(v) => salvar.mutate({ ...m, ativo: v })} />
          </li>
        ))}
      </ul>
      {podeAlterar && (
        <form className="flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          if (!novo.trim()) return;
          salvar.mutate({ nome: novo.trim(), ordem: (motivos.at(-1)?.ordem ?? 0) + 1, ativo: true }, { onSuccess: () => setNovo('') });
        }}>
          <Input placeholder="Novo motivo" value={novo} onChange={(e) => setNovo(e.target.value)} aria-label="Novo motivo de recusa" />
          <Button type="submit" size="sm" disabled={!novo.trim() || salvar.isPending}>
            <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Incluir
          </Button>
        </form>
      )}
    </Card>
  );
}
