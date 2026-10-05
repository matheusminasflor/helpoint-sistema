// Prazos de atendimento do SETOR, na aba Chamados da configuração dele (LEVA P). A linha mostra o
// prazo que vale — o do setor, se houver, senão o padrão da empresa — e diz qual dos dois é.
//
// Antes eram três cópias (TI, RH e o molde de Comercial/Educacional) editando a mesma linha da
// empresa: mudar o prazo no Comercial mudava o do RH, sem aviso. O dono decidiu prazo por setor, e
// depois (2026-09-29) tirou a tela separada do padrão da empresa por redundante: o padrão fica como
// o ponto de partida de todo setor, e cada setor muda o seu aqui.
//
// 2026-10-04 (decisões do dono): os prazos são em tempo ÚTIL — o relógio só anda no expediente do
// setor, de segunda a sexta, fora feriados (`prazo_do_chamado`, migration 20261203050000). O
// expediente e a pausa do fim de semana ficam aqui; os feriados aparecem logo abaixo, só para ler
// (quem cadastra é o RH) — e o prazo também para no almoço de quem atende (cadastro do RH).
//
// Quem edita é quem configura o setor — `podeEditar` vem de `useConfiguracaoDosSetores().altera`,
// a mesma pergunta de `pode_configurar_setor` na policy `sla_policies_prazo_do_setor`.
import { useState } from 'react';
import { Clock, RotateCcw } from 'lucide-react';
import { FeriadosDaEmpresa } from '@/components/configuracoes/FeriadosDaEmpresa';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  useSLAPolicies, minutosDoDia, expedientePadrao, type Expediente, type PrazoDaPrioridade,
} from '@/hooks/useSLAPolicies';

const ROTULO_PRIORIDADE: Record<string, string> = {
  critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa',
};

/** Minutos úteis em texto de gente: 90 → "1h30 úteis"; 1200 num dia de 10h → "2 dias úteis". */
function formatarMinutos(min: number, minutosPorDia: number): string {
  if (min < 60) return `${min} min úteis`;
  if (min % minutosPorDia === 0) {
    const dias = min / minutosPorDia;
    return `${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'}`;
  }
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`} úteis`;
}

interface Props {
  /** O setor (`tickets.module`). */
  module: string;
  /** Nome do setor para os textos ("o RH"). */
  label: string;
  podeEditar: boolean;
}

export function PrazosDeAtendimento({ module, label, podeEditar }: Props) {
  const { prazos, isLoading, salvarDoSetor, voltarAoPadrao, pausaFimDeSemana, expediente, salvarRegra } = useSLAPolicies(module);
  const [edicao, setEdicao] = useState<Record<string, { resposta: number; resolucao: number }>>({});
  const [horario, setHorario] = useState<Expediente | null>(null);
  const porDia = minutosDoDia(expediente);
  const diaInteiro = !expediente.inicio || !expediente.fim;

  const salvar = async (linha: PrazoDaPrioridade) => {
    const e = edicao[linha.priority];
    if (!e) return;
    await salvarDoSetor.mutateAsync({
      priority: linha.priority,
      first_response_time: e.resposta,
      resolution_time: e.resolucao,
      nome: `${label} — ${ROTULO_PRIORIDADE[linha.priority] ?? linha.priority}`,
    });
    setEdicao((s) => { const c = { ...s }; delete c[linha.priority]; return c; });
  };

  const h = horario ?? expediente;
  const horarioValido = !!h.inicio && !!h.fim && h.fim > h.inicio;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" />Prazos de atendimento</CardTitle>
        <CardDescription>
          Quanto tempo {label} tem para responder e resolver cada chamado, por prioridade, em tempo útil: o relógio
          só anda no expediente, fora feriados. Onde não houver prazo próprio, vale o padrão da empresa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor={`exp-inicio-${module}`} className="text-sm font-medium">Expediente de {label}</Label>
              {diaInteiro && !horario ? (
                <p className="text-xs text-muted-foreground">
                  Dia inteiro (24 horas).
                  {podeEditar && (
                    <Button variant="link" size="sm" className="h-auto p-0 ml-2" onClick={() => setHorario(expedientePadrao(module))}>
                      Definir horário
                    </Button>
                  )}
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <Input id={`exp-inicio-${module}`} type="time" className="h-8 w-28" disabled={!podeEditar}
                    value={h.inicio ?? ''} onChange={(ev) => setHorario({ ...h, inicio: ev.target.value })} />
                  <span className="text-xs text-muted-foreground">às</span>
                  <Input id={`exp-fim-${module}`} type="time" className="h-8 w-28" aria-label="Fim do expediente" disabled={!podeEditar}
                    value={h.fim ?? ''} onChange={(ev) => setHorario({ ...h, fim: ev.target.value })} />
                </div>
              )}
            </div>
            {podeEditar && horario && (
              <Button size="sm" disabled={!horarioValido || salvarRegra.isPending}
                onClick={() => salvarRegra.mutate({ pausa: pausaFimDeSemana, expediente: horario }, { onSuccess: () => setHorario(null) })}>
                Salvar expediente
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Exemplo: com expediente das 8h às 18h, um chamado de 8 horas aberto às 17h conta 1 hora hoje e vence
            amanhã às 15h. Se quem atende tem horário de almoço no cadastro do RH, o relógio também para no almoço.
            Vale para os chamados abertos daqui em diante.
          </p>
          <div className="flex items-start justify-between gap-4 border-t pt-3">
            <div className="space-y-0.5">
              <Label htmlFor={`pausa-fds-${module}`} className="text-sm font-medium">Não contar sábado e domingo no prazo</Label>
              <p className="text-xs text-muted-foreground">
                Desligue se {label} trabalha no fim de semana: sábado e domingo passam a contar, no mesmo horário.
              </p>
            </div>
            <Switch
              id={`pausa-fds-${module}`}
              checked={pausaFimDeSemana}
              disabled={!podeEditar || salvarRegra.isPending}
              onCheckedChange={(v) => salvarRegra.mutate({ pausa: v, expediente })}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Prioridade</th>
                  <th className="px-3 py-2 font-semibold">1ª resposta (min úteis)</th>
                  <th className="px-3 py-2 font-semibold">Resolução (min úteis)</th>
                  <th className="px-3 py-2 font-semibold">Vale</th>
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
                          : formatarMinutos(resposta, porDia)}
                      </td>
                      <td className="px-3 py-2">
                        {podeEditar
                          ? <Input type="number" min={1} className="h-8 w-28" value={resolucao} onChange={(ev) => mudar('resolucao', Number(ev.target.value))} />
                          : formatarMinutos(resolucao, porDia)}
                        {podeEditar && <span className="ml-2 text-[11px] text-muted-foreground">= {formatarMinutos(resolucao, porDia)}</span>}
                      </td>
                      <td className="px-3 py-2">
                        {linha.doSetor
                          ? <Badge variant="secondary">Do setor</Badge>
                          : <Badge variant="outline">Padrão da empresa</Badge>}
                      </td>
                      {podeEditar && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {e && (
                            <Button size="sm" onClick={() => salvar(linha)} disabled={salvarDoSetor.isPending}>
                              {linha.doSetor ? 'Salvar' : 'Usar prazo próprio'}
                            </Button>
                          )}
                          {linha.doSetor && !e && (
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

        {/* Só para ler: quem cadastra é o RH, na aba Feriados das Configurações do RH (2026-10-04). */}
        <FeriadosDaEmpresa podeEditar={false} aviso="os da cidade e as pontes são cadastrados pelo RH, em Configurações do RH › Feriados." />

        {!podeEditar && (
          <p className="text-xs text-muted-foreground pt-2">
            Para mudar prazos ou expediente, é preciso "Configurações › Chamados: Alterar" no perfil de acesso deste setor.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
