// Os feriados que param o relógio do prazo: os nacionais (prontos, `feriados_nacionais`) e os da
// empresa (`feriados_da_empresa`). Quem cadastra é o RH, na aba Feriados das Configurações do RH
// (correção do dono, 2026-10-04 — `pode_alterar_aba('rh','feriados')`, migration 20261205030000).
// A tela de prazos de cada setor mostra a mesma lista, só para ler.
import { useState } from 'react';
import { CalendarOff, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFeriados } from '@/hooks/useSLAPolicies';

const dataBR = (iso: string) => iso.split('-').reverse().join('/');

interface Props {
  podeEditar: boolean;
  /** Texto para quem só lê (ex.: "Quem cadastra é o RH."). */
  aviso?: string;
}

export function FeriadosDaEmpresa({ podeEditar, aviso }: Props) {
  const anoAtual = new Date().getFullYear();
  // O RH cadastra no fim do ano os feriados do ano seguinte.
  const [ano, setAno] = useState(anoAtual);
  const { nacionais, daEmpresa, adicionar, remover } = useFeriados(ano);
  const [data, setData] = useState('');
  const [nome, setNome] = useState('');

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium flex items-center gap-2"><CalendarOff className="w-4 h-4" />Feriados de {ano}</p>
          <p className="text-xs text-muted-foreground">
            Valem para a empresa toda: nesses dias o relógio do prazo dos chamados não anda. Os nacionais já vêm
            prontos; {podeEditar ? 'cadastre os da cidade e as pontes.' : aviso ?? 'os da cidade e as pontes são cadastrados pelo RH.'}
          </p>
        </div>
        <div className="flex gap-1">
          {[anoAtual, anoAtual + 1].map((a) => (
            <Button key={a} type="button" size="sm" variant={a === ano ? 'secondary' : 'ghost'} className="h-7 text-xs" onClick={() => setAno(a)}>
              {a}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-xs">
        {nacionais.map((f) => (
          <div key={f.data + f.nome} className="flex justify-between gap-2">
            <span className="text-muted-foreground font-mono">{dataBR(f.data)}</span>
            <span className="truncate">{f.nome}</span>
          </div>
        ))}
        {daEmpresa.map((f) => (
          <div key={f.id} className="flex justify-between items-center gap-2">
            <span className="text-muted-foreground font-mono">{dataBR(f.data)}</span>
            <span className="truncate flex items-center gap-1">
              {f.nome} <Badge variant="secondary" className="text-[10px]">da empresa</Badge>
              {podeEditar && (
                <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={`Remover ${f.nome}`}
                  disabled={remover.isPending} onClick={() => remover.mutate(f.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </span>
          </div>
        ))}
      </div>
      {podeEditar && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            adicionar.mutate({ data, nome }, { onSuccess: () => { setData(''); setNome(''); } });
          }}
        >
          <Input type="date" className="h-8 w-40" aria-label="Data do feriado" value={data} onChange={(ev) => setData(ev.target.value)} />
          <Input className="h-8 w-56" placeholder="Ex.: Aniversário da cidade" aria-label="Nome do feriado"
            value={nome} onChange={(ev) => setNome(ev.target.value)} />
          <Button size="sm" type="submit" disabled={!data || !nome.trim() || adicionar.isPending}>Cadastrar feriado</Button>
        </form>
      )}
    </div>
  );
}
