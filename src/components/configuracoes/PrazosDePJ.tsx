// Prazos para PJ do setor (dono, 2026-10-13; 20270101010000): "o PJ presta serviço para a Minasflor e para
// outras empresas — o SLA dele é diferente do interno". Aqui se marca quem do setor é PJ e a tabela de
// prazos dele, por urgência. Urgência sem prazo de PJ: o PJ usa o prazo comum de cima.
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { usePrazosDePJ, useSLAPolicies, type PrioridadeSLA } from '@/hooks/useSLAPolicies';
import { concessaoDoModulo, useMembrosDoSetor } from '@/hooks/useMembrosDoSetor';

const ROTULO: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' };

export function PrazosDePJ({ module, label, podeEditar }: { module: string; label: string; podeEditar: boolean }) {
  const { pjs, prazosPJ, marcar, salvar, tirar } = usePrazosDePJ(module);
  const { prazos } = useSLAPolicies(module);
  const { data: membros = [] } = useMembrosDoSetor(concessaoDoModulo(module));
  const [edicao, setEdicao] = useState<Record<string, { resposta: number; resolucao: number }>>({});

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div>
        <p className="text-sm font-medium">Prestadores PJ de {label}</p>
        <p className="text-xs text-muted-foreground">
          Quem presta serviço como PJ (atende a Minasflor e outras empresas). Chamado com um PJ atendendo usa os prazos de PJ abaixo;
          quem não está marcado usa os prazos de cima.
        </p>
      </div>
      {membros.length === 0 ? (
        <p className="text-xs text-muted-foreground">Ninguém tem acesso a este setor ainda.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {membros.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={pjs.includes(m.id)} disabled={!podeEditar || marcar.isPending}
                onCheckedChange={(v) => marcar.mutate({ userId: m.id, pj: !!v })} />
              {m.full_name || m.email}
            </label>
          ))}
        </div>
      )}

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Prioridade</th>
              <th className="px-3 py-2 font-semibold">1ª resposta do PJ (min úteis)</th>
              <th className="px-3 py-2 font-semibold">Resolução do PJ (min úteis)</th>
              <th className="px-3 py-2 font-semibold">Vale</th>
              {podeEditar && <th className="px-3 py-2 font-semibold text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {prazosPJ.map(({ priority, linha }) => {
              const comum = prazos.find((p) => p.priority === priority);
              const base = linha ?? comum?.doSetor ?? comum?.padrao;
              if (!base) return null;
              const e = edicao[priority];
              const resposta = e?.resposta ?? base.first_response_time;
              const resolucao = e?.resolucao ?? base.resolution_time;
              const mudar = (campo: 'resposta' | 'resolucao', valor: number) =>
                setEdicao((s) => ({ ...s, [priority]: { resposta, resolucao, [campo]: valor } }));
              return (
                <tr key={priority} className="border-t">
                  <td className="px-3 py-2 font-medium">{ROTULO[priority] ?? priority}</td>
                  <td className="px-3 py-2">
                    {podeEditar ? <Input type="number" min={1} className="h-8 w-28" value={resposta} onChange={(ev) => mudar('resposta', Number(ev.target.value))} /> : `${resposta} min`}
                  </td>
                  <td className="px-3 py-2">
                    {podeEditar ? <Input type="number" min={1} className="h-8 w-28" value={resolucao} onChange={(ev) => mudar('resolucao', Number(ev.target.value))} /> : `${resolucao} min`}
                  </td>
                  <td className="px-3 py-2">{linha ? <Badge variant="secondary">De PJ</Badge> : <Badge variant="outline">O comum</Badge>}</td>
                  {podeEditar && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {e && (
                        <Button size="sm" disabled={salvar.isPending}
                          onClick={() => salvar.mutate(
                            { priority: priority as PrioridadeSLA, first_response_time: resposta, resolution_time: resolucao, nome: `${label} — ${ROTULO[priority]} (PJ)` },
                            { onSuccess: () => setEdicao((s) => { const c = { ...s }; delete c[priority]; return c; }) },
                          )}>
                          {linha ? 'Salvar' : 'Usar prazo de PJ'}
                        </Button>
                      )}
                      {linha && !e && (
                        <Button size="sm" variant="ghost" disabled={tirar.isPending} onClick={() => tirar.mutate(linha.id)}>
                          <RotateCcw className="w-3.5 h-3.5 mr-1" />Usar o comum
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Vale para os chamados abertos daqui em diante, e para quem receber um chamado transferido.</p>
    </div>
  );
}
