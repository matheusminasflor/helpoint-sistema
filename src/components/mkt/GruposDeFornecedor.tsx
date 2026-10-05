// Escolher os grupos de um fornecedor (vários) e criar grupo na hora; e a janela de renomear e
// apagar grupos. Decisão do dono, 2026-10-04 — ver `useGruposDeFornecedor`.
import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  useGruposDeFornecedor, useCriarGrupoDeFornecedor, useRenomearGrupoDeFornecedor, useApagarGrupoDeFornecedor,
} from '@/hooks/useGruposDeFornecedor';

function NovoGrupo({ onCriado }: { onCriado?: (id: string) => void }) {
  const criar = useCriarGrupoDeFornecedor();
  const [novo, setNovo] = useState('');

  const criarGrupo = async () => {
    if (!novo.trim()) return;
    try {
      const g = await criar.mutateAsync(novo);
      onCriado?.(g.id);
      setNovo('');
    } catch { /* o toast sai do hook */ }
  };

  return (
    <div className="flex gap-2">
      <Input
        value={novo}
        onChange={e => setNovo(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void criarGrupo(); } }}
        placeholder="Novo grupo (ex.: Embalagens)"
        className="h-8"
        aria-label="Nome do novo grupo"
      />
      <Button type="button" size="sm" variant="outline" onClick={criarGrupo} disabled={!novo.trim() || criar.isPending}>
        <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />Criar grupo
      </Button>
    </div>
  );
}

export function EscolhaDeGrupos({ marcados, onChange }: { marcados: string[]; onChange: (ids: string[]) => void }) {
  const { data: grupos = [] } = useGruposDeFornecedor();

  const alternar = (id: string) =>
    onChange(marcados.includes(id) ? marcados.filter(x => x !== id) : [...marcados, id]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {grupos.map(g => {
          const ativo = marcados.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={ativo}
              onClick={() => alternar(g.id)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
                ativo ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {ativo && <Check className="h-3 w-3" aria-hidden="true" />}
              {g.nome}
            </button>
          );
        })}
      </div>
      <NovoGrupo onCriado={id => onChange([...marcados, id])} />
    </div>
  );
}

export function GerenciarGrupos({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: grupos = [] } = useGruposDeFornecedor();
  const renomear = useRenomearGrupoDeFornecedor();
  const apagar = useApagarGrupoDeFornecedor();
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Grupos de fornecedores</DialogTitle>
          <DialogDescription>
            Renomeie ou apague grupos. Apagar um grupo só tira os fornecedores dele; os fornecedores continuam cadastrados.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border max-h-[50vh] overflow-y-auto">
          {grupos.map(g => (
            <li key={g.id} className="flex items-center gap-2 py-2">
              {editando?.id === g.id ? (
                <>
                  <Input
                    value={editando.nome}
                    onChange={e => setEditando({ id: g.id, nome: e.target.value })}
                    className="h-8"
                    autoFocus
                  />
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8" aria-label="Salvar nome"
                    disabled={!editando.nome.trim() || renomear.isPending}
                    onClick={() => renomear.mutate(editando, { onSuccess: () => setEditando(null) })}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Cancelar" onClick={() => setEditando(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : apagando === g.id ? (
                <>
                  <span className="flex-1 text-sm">Apagar "{g.nome}"?</span>
                  <Button size="sm" variant="destructive" disabled={apagar.isPending}
                    onClick={() => apagar.mutate(g.id, { onSuccess: () => setApagando(null) })}>
                    Apagar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setApagando(null)}>Cancelar</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{g.nome}</span>
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Renomear ${g.nome}`}
                    onClick={() => setEditando({ id: g.id, nome: g.nome })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label={`Apagar ${g.nome}`} onClick={() => setApagando(g.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </li>
          ))}
          {grupos.length === 0 && <li className="py-4 text-sm text-muted-foreground">Nenhum grupo ainda.</li>}
        </ul>
        <NovoGrupo />
      </DialogContent>
    </Dialog>
  );
}
