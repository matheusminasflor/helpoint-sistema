// Quem atende o chamado junto com o atendente (dono, 2026-10-13): a lista, "Chamar para atender junto"
// e tirar. Convida o atendente do chamado, o gestor do setor ou um administrador — de qualquer setor; quem
// atende junto pode sair sozinho. O banco confere tudo (20261230010000).
import { useState } from 'react';
import { UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { usePessoasDaEmpresa } from '@/hooks/useProjetos';
import { rotuloDoSetor } from '@/lib/setores';
import {
  useAtendemJunto, useAtenderJuntoAcoes, useConvitesDoChamado, usePossoChamarParaAtenderJunto,
} from '@/hooks/useAtenderJunto';

interface Props {
  ticketId: string;
  atendenteId: string | null;
  solicitanteId: string | null;
  encerrado: boolean;
}

export function AtendemJunto({ ticketId, atendenteId, solicitanteId, encerrado }: Props) {
  const { user } = useAuth();
  const { data: junto = [] } = useAtendemJunto(ticketId);
  const { data: convidados = [] } = useConvitesDoChamado(ticketId);
  const possoChamar = usePossoChamarParaAtenderJunto(ticketId);
  const { convidar, tirar } = useAtenderJuntoAcoes(ticketId);
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const [escolhido, setEscolhido] = useState('');
  const [chamando, setChamando] = useState(false);

  // Quem pode ser chamado: quem atende algum setor, menos o atendente, quem pediu e quem já está.
  const candidatos = pessoas.filter((p) => p.setores.length > 0 && p.id !== atendenteId && p.id !== solicitanteId
    && !junto.some((j) => j.user_id === p.id) && !convidados.some((j) => j.user_id === p.id));

  if (junto.length === 0 && convidados.length === 0 && !(possoChamar && !encerrado)) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" aria-hidden="true" /> Atendem junto
      </p>
      {junto.length === 0 && (
        <p className="text-[13px] text-muted-foreground">Chame alguém quando a demanda for para mais de uma pessoa: conta para todos quando resolver.</p>
      )}
      <ul className="space-y-1">
        {junto.map((j) => (
          <li key={j.user_id} className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">{j.nome}</span>
            {(possoChamar || j.user_id === user?.id) && (
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={tirar.isPending}
                aria-label={j.user_id === user?.id ? 'Sair do chamado' : `Tirar ${j.nome}`}
                title={j.user_id === user?.id ? 'Sair do chamado' : `Tirar ${j.nome}`}
                onClick={() => tirar.mutate(j.user_id)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </li>
        ))}
        {/* Convite que ainda espera o aceite (2026-10-14): aparece, mas ainda não conta. */}
        {convidados.map((j) => (
          <li key={`convite-${j.user_id}`} className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>{j.nome} <span className="text-[12px]">· aguardando aceite</span></span>
            {possoChamar && (
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={tirar.isPending}
                aria-label={`Cancelar o convite de ${j.nome}`} title={`Cancelar o convite de ${j.nome}`}
                onClick={() => tirar.mutate(j.user_id)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {possoChamar && !encerrado && (chamando ? (
        <div className="space-y-2">
          <Select value={escolhido} onValueChange={setEscolhido}>
            <SelectTrigger className="h-9 text-[14px]" aria-label="Quem vai atender junto"><SelectValue placeholder="Escolha a pessoa" /></SelectTrigger>
            <SelectContent>
              {candidatos.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nome} · {p.setores.map(rotuloDoSetor).join(', ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" disabled={!escolhido || convidar.isPending}
              onClick={() => convidar.mutate(escolhido, { onSuccess: () => { setEscolhido(''); setChamando(false); } })}>
              Chamar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setChamando(false); setEscolhido(''); }}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setChamando(true)}>
          <UserPlus className="w-3.5 h-3.5" aria-hidden="true" /> Chamar para atender junto
        </Button>
      ))}
    </div>
  );
}
