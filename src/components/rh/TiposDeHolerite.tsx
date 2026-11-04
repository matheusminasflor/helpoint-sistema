import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  useAlterarTiposDeHolerite, useApagarTipoDeHolerite, useCriarTipoDeHolerite, useTiposDeHolerite,
  type TipoDeHolerite,
} from '@/hooks/useTiposDeHolerite';

/** A aba Holerites do RH: renomear, mudar a ordem, desativar. O tipo com holerite enviado não se apaga (o banco recusa). */
export function TiposDeHolerite({ podeAlterar }: { podeAlterar: boolean }) {
  const { data: tipos = [], isLoading } = useTiposDeHolerite();
  const criar = useCriarTipoDeHolerite();
  const alterar = useAlterarTiposDeHolerite();
  const apagar = useApagarTipoDeHolerite();
  const [novo, setNovo] = useState('');

  const adicionar = () => {
    if (!novo.trim()) return;
    criar.mutate({ nome: novo, ordem: Math.max(0, ...tipos.map((t) => t.ordem)) + 1 }, { onSuccess: () => setNovo('') });
  };
  // Renumera a lista inteira: os tipos vindos de holerites antigos nascem com a mesma ordem, e trocar os dois não bastaria.
  const mover = (de: number, para: number) => {
    const lista = [...tipos];
    const [tipo] = lista.splice(de, 1);
    lista.splice(para, 0, tipo);
    alterar.mutate(lista.map((t, i) => ({ id: t.id, ordem: i + 1 })).filter((m, i) => lista[i].ordem !== m.ordem));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tipos de holerite</CardTitle>
        <CardDescription>
          A lista que aparece ao enviar um holerite. Tipo que já tem holerite enviado não se apaga, só se desativa, e o
          holerite antigo continua com o nome dele.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {podeAlterar && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); adicionar(); }}>
            <Input aria-label="Nome do novo tipo" placeholder="Novo tipo (ex.: Vale-transporte)" maxLength={60}
              value={novo} onChange={(e) => setNovo(e.target.value)} />
            <Button type="submit" disabled={!novo.trim() || criar.isPending}>
              <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" />Novo tipo
            </Button>
          </form>
        )}
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
          <div className="rounded-md border border-border divide-y divide-border">
            {tipos.map((t, i) => (
              <LinhaDoTipo key={`${t.id}-${t.nome}`} tipo={t} podeAlterar={podeAlterar} primeiro={i === 0} ultimo={i === tipos.length - 1}
                onRenomear={(nome) => alterar.mutate([{ id: t.id, nome }])}
                onAtivar={(ativo) => alterar.mutate([{ id: t.id, ativo }])}
                onSubir={() => mover(i, i - 1)} onDescer={() => mover(i, i + 1)}
                onApagar={() => confirm(`Apagar o tipo "${t.nome}"?`) && apagar.mutate(t.id)} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LinhaDoTipo({ tipo, podeAlterar, primeiro, ultimo, onRenomear, onAtivar, onSubir, onDescer, onApagar }: {
  tipo: TipoDeHolerite; podeAlterar: boolean; primeiro: boolean; ultimo: boolean;
  onRenomear: (nome: string) => void; onAtivar: (ativo: boolean) => void;
  onSubir: () => void; onDescer: () => void; onApagar: () => void;
}) {
  const [nome, setNome] = useState(tipo.nome);
  const salvarNome = () => {
    const limpo = nome.trim();
    if (limpo && limpo !== tipo.nome) onRenomear(limpo);
    else setNome(tipo.nome);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <Input aria-label={`Nome do tipo ${tipo.nome}`} className="flex-1 min-w-[12rem]" maxLength={60} disabled={!podeAlterar}
        value={nome} onChange={(e) => setNome(e.target.value)} onBlur={salvarNome}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Switch checked={tipo.ativo} disabled={!podeAlterar} onCheckedChange={onAtivar} aria-label={`${tipo.nome} ativo`} />
        {tipo.ativo ? 'Ativo' : 'Desativado'}
      </label>
      {podeAlterar && (
        <div className="flex">
          <Button type="button" size="sm" variant="ghost" aria-label={`Subir ${tipo.nome}`} disabled={primeiro} onClick={onSubir}>
            <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
          <Button type="button" size="sm" variant="ghost" aria-label={`Descer ${tipo.nome}`} disabled={ultimo} onClick={onDescer}>
            <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
          <Button type="button" size="sm" variant="ghost" aria-label={`Apagar ${tipo.nome}`} onClick={onApagar}>
            <Trash2 className="w-3.5 h-3.5 text-status-danger" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
