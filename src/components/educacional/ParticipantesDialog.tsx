import { useMemo, useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useSACCustomers } from '@/hooks/useSACCustomers';
import {
  useParticipantes, useInscrever, useSituacaoParticipante, vagasRestantes,
  SITUACOES_PARTICIPANTE, type Turma,
} from '@/hooks/useTreinamentos';
import { dataHora } from '@/lib/dates';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  turma: Turma;
  /** Para quem o treinamento é: limita a lista de quem dá para inscrever. */
  audience: string;
}

/**
 * Quem está na turma, e o que aconteceu com cada um.
 *
 * O aluno externo é o **cliente do SAC** (decisão do dono): quem já tem cadastro
 * e login no portal. Não há lista de aluno à parte — cadastrar a mesma pessoa
 * duas vezes é de onde vem quase todo dado errado em sistema.
 */
export function ParticipantesDialog({ open, onOpenChange, turma, audience }: Props) {
  const { data: participantes = [], isLoading } = useParticipantes(turma.id);
  const { data: funcionarios = [] } = useTechnicians();
  const { data: clientes = [] } = useSACCustomers();
  const inscrever = useInscrever(turma.id);
  const situacao = useSituacaoParticipante(turma.id);

  const [escolhido, setEscolhido] = useState('');

  const aceitaFuncionario = audience === 'interno' || audience === 'ambos';
  const aceitaCliente = audience === 'externo' || audience === 'ambos';

  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of funcionarios) m.set(f.id, f.full_name || f.email);
    for (const c of clientes) m.set(c.id, c.razao_social || c.full_name || c.email);
    return m;
  }, [funcionarios, clientes]);

  // Quem já está na turma não aparece para inscrever de novo — a não ser que
  // tenha cancelado, e aí inscrever é justamente o que traz de volta.
  const jaNaTurma = new Set(
    participantes.filter(p => p.status !== 'cancelado')
      .map(p => p.profile_id ?? p.customer_profile_id)
      .filter((v): v is string => !!v),
  );

  const vagas = vagasRestantes(turma, participantes);
  const lotada = vagas === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Participantes da turma</DialogTitle>
          <DialogDescription>
            {dataHora(turma.starts_at)}
            {turma.location ? ` · ${turma.location}` : ''}
            {vagas != null ? ` · ${vagas} ${vagas === 1 ? 'vaga livre' : 'vagas livres'}` : ' · sem limite de vagas'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Inscrever alguém</Label>
            <div className="flex gap-2 flex-wrap">
              <Select value={escolhido} onValueChange={setEscolhido} disabled={lotada}>
                <SelectTrigger className="flex-1 min-w-[14rem]">
                  <SelectValue placeholder={lotada ? 'A turma está lotada' : 'Escolha quem participa'} />
                </SelectTrigger>
                <SelectContent>
                  {aceitaFuncionario && funcionarios.filter(f => !jaNaTurma.has(f.id)).map(f => (
                    <SelectItem key={`f:${f.id}`} value={`f:${f.id}`}>
                      {f.full_name || f.email} · funcionário
                    </SelectItem>
                  ))}
                  {aceitaCliente && clientes.filter(c => !jaNaTurma.has(c.id)).map(c => (
                    <SelectItem key={`c:${c.id}`} value={`c:${c.id}`}>
                      {c.razao_social || c.full_name} · cliente
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!escolhido || lotada || inscrever.isPending}
                onClick={() => {
                  const [tipo, id] = escolhido.split(':');
                  inscrever.mutate(
                    tipo === 'f' ? { profile_id: id } : { customer_profile_id: id },
                    { onSuccess: () => setEscolhido('') },
                  );
                }}
              >
                <UserPlus className="w-4 h-4 mr-1.5" aria-hidden="true" />
                Inscrever
              </Button>
            </div>
            {lotada && (
              <p className="text-[11px] text-muted-foreground">
                Cancele alguém ou aumente as vagas da turma para inscrever mais gente.
              </p>
            )}
          </div>

          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : participantes.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center">
              <Users className="w-6 h-6 mx-auto text-muted-foreground mb-2" aria-hidden="true" />
              <p className="text-[13px] text-muted-foreground">
                Ninguém inscrito ainda nesta turma.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {participantes.map(p => {
                const quem = p.profile_id ?? p.customer_profile_id ?? '';
                return (
                  <li key={p.id} className="px-3 py-2 flex items-center gap-2 flex-wrap">
                    <div className="flex-1 min-w-[12rem]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] text-foreground">
                          {nomePorId.get(quem) ?? 'pessoa removida do cadastro'}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {p.profile_id ? 'funcionário' : 'cliente'}
                        </Badge>
                      </div>
                      {p.completed_at && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Concluiu em {dataHora(p.completed_at)}
                        </p>
                      )}
                    </div>
                    <Select
                      value={p.status}
                      onValueChange={(status) => situacao.mutate({ id: p.id, status })}
                    >
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SITUACOES_PARTICIPANTE.map(s => (
                          <SelectItem key={s.valor} value={s.valor}>{s.rotulo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
