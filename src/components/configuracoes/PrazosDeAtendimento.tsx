// Prazos de atendimento — UM componente para os dois lugares onde prazo se edita (LEVA P):
//
//   * sem `module`: o PADRÃO DA EMPRESA, em Configurações › Empresa;
//   * com `module`: o prazo daquele SETOR, na aba Chamados da configuração dele. A linha mostra
//     o prazo que vale — o do setor, se houver, senão o padrão — e diz qual dos dois é.
//
// Antes eram três cópias (TI, RH e o molde de Comercial/Educacional) editando a mesma linha da
// empresa: mudar o prazo no Comercial mudava o do RH, sem aviso. O dono decidiu prazo por setor.
//
// Quem edita é dono ou admin — a mesma conta de `is_diretor`, que a policy de `sla_policies`
// faz no banco. Para os outros, a tabela aparece só para leitura.
import { useState } from 'react';
import { Clock, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useSLAPolicies, type PrazoDaPrioridade } from '@/hooks/useSLAPolicies';

const ROTULO_PRIORIDADE: Record<string, string> = {
  critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa',
};

/** Minutos em texto de gente: 90 → "1h30", 1440 → "1 dia". */
function formatarMinutos(min: number): string {
  if (min < 60) return `${min} min`;
  if (min % 1440 === 0) return `${min / 1440} ${min === 1440 ? 'dia' : 'dias'}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

interface Props {
  /** O setor (`tickets.module`). Sem ele, edita o padrão da empresa. */
  module?: string;
  /** Nome do setor para os textos ("o RH"). */
  label?: string;
}

export function PrazosDeAtendimento({ module, label }: Props) {
  const { role } = useAuth();
  const podeEditar = role === 'owner' || role === 'admin';
  const { prazos, isLoading, updatePolicy, salvarDoSetor, voltarAoPadrao } = useSLAPolicies(module);
  const [edicao, setEdicao] = useState<Record<string, { resposta: number; resolucao: number }>>({});

  const doSetor = !!module;

  const salvar = async (linha: PrazoDaPrioridade) => {
    const e = edicao[linha.priority];
    if (!e) return;
    if (doSetor) {
      await salvarDoSetor.mutateAsync({
        priority: linha.priority,
        first_response_time: e.resposta,
        resolution_time: e.resolucao,
        nome: `${label ?? module} — ${ROTULO_PRIORIDADE[linha.priority] ?? linha.priority}`,
      });
    } else if (linha.padrao) {
      await updatePolicy.mutateAsync({ id: linha.padrao.id, first_response_time: e.resposta, resolution_time: e.resolucao });
    }
    setEdicao((s) => { const c = { ...s }; delete c[linha.priority]; return c; });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" />Prazos de atendimento</CardTitle>
        <CardDescription>
          {doSetor
            ? `Quanto tempo ${label ?? 'o setor'} tem para responder e resolver cada chamado, por prioridade. Onde não houver prazo próprio, vale o padrão da empresa.`
            : 'O prazo padrão de todos os setores, por prioridade. Cada setor pode ter o próprio na configuração dele; quem não tiver usa este.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Prioridade</th>
                  <th className="px-3 py-2 font-semibold">1ª resposta (min)</th>
                  <th className="px-3 py-2 font-semibold">Resolução (min)</th>
                  {doSetor && <th className="px-3 py-2 font-semibold">Vale</th>}
                  {podeEditar && <th className="px-3 py-2 font-semibold text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {prazos.map((linha) => {
                  const vale = linha.doSetor ?? linha.padrao;
                  if (!vale) return null;
                  const e = edicao[linha.priority];
                  const resposta = e?.resposta ?? vale.first_response_time;
                  const resolucao = e?.resolucao ?? vale.resolution_time;
                  const mudar = (campo: 'resposta' | 'resolucao', valor: number) =>
                    setEdicao((s) => ({ ...s, [linha.priority]: { resposta, resolucao, [campo]: valor } }));
                  return (
                    <tr key={linha.priority} className="border-t">
                      <td className="px-3 py-2 font-medium">{ROTULO_PRIORIDADE[linha.priority] ?? linha.priority}</td>
                      <td className="px-3 py-2">
                        {podeEditar
                          ? <Input type="number" min={1} className="h-8 w-28" value={resposta} onChange={(ev) => mudar('resposta', Number(ev.target.value))} />
                          : formatarMinutos(resposta)}
                      </td>
                      <td className="px-3 py-2">
                        {podeEditar
                          ? <Input type="number" min={1} className="h-8 w-28" value={resolucao} onChange={(ev) => mudar('resolucao', Number(ev.target.value))} />
                          : formatarMinutos(resolucao)}
                        {podeEditar && <span className="ml-2 text-[11px] text-muted-foreground">= {formatarMinutos(resolucao)}</span>}
                      </td>
                      {doSetor && (
                        <td className="px-3 py-2">
                          {linha.doSetor
                            ? <Badge variant="secondary">Do setor</Badge>
                            : <Badge variant="outline">Padrão da empresa</Badge>}
                        </td>
                      )}
                      {podeEditar && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {e && (
                            <Button size="sm" onClick={() => salvar(linha)} disabled={salvarDoSetor.isPending || updatePolicy.isPending}>
                              {doSetor && !linha.doSetor ? 'Usar prazo próprio' : 'Salvar'}
                            </Button>
                          )}
                          {doSetor && linha.doSetor && !e && (
                            <Button size="sm" variant="ghost" onClick={() => voltarAoPadrao.mutate(linha.doSetor!.id)} disabled={voltarAoPadrao.isPending}>
                              <RotateCcw className="w-3.5 h-3.5 mr-1" />Voltar ao padrão
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
        )}
        {!podeEditar && (
          <p className="text-xs text-muted-foreground pt-2">Só o dono ou um admin da empresa muda prazos.</p>
        )}
      </CardContent>
    </Card>
  );
}
