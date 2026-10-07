// Anexos do briefing (sem atividade) ou de uma atividade. Balde privado `projetos`, até 10 MB.
import { useRef } from 'react';
import { Paperclip, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { abrirAnexoDoBalde } from '@/lib/anexos-no-storage';
import { BALDE_DOS_PROJETOS, useAnexosDoProjeto } from '@/hooks/useProjetos';
import { useAuth } from '@/contexts/AuthContext';

export function AnexosDoProjeto({ projectId, taskId, podeApagarTodos }: { projectId: string; taskId: string | null; podeApagarTodos: boolean }) {
  const { user } = useAuth();
  const { lista, enviar, remover } = useAnexosDoProjeto(projectId, taskId);
  const input = useRef<HTMLInputElement>(null);
  const anexos = lista.data ?? [];
  return (
    <div className="space-y-2">
      {anexos.length === 0 && <p className="text-[13px] text-muted-foreground">Nenhum arquivo.</p>}
      <ul className="space-y-1">
        {anexos.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-[13px]">
            <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            <button type="button" className="text-primary hover:underline truncate text-left" onClick={() => abrirAnexoDoBalde(BALDE_DOS_PROJETOS, a.caminho)}>
              {a.nome}
            </button>
            {(podeApagarTodos || a.enviado_por === user?.id) && (
              <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" aria-label={`Remover ${a.nome}`} onClick={() => remover.mutate(a)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <input ref={input} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar.mutate(f); e.target.value = ''; }} />
      <Button variant="outline" size="sm" onClick={() => input.current?.click()} disabled={enviar.isPending}>
        <Paperclip className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
        {enviar.isPending ? 'Enviando…' : 'Anexar arquivo (até 10 MB)'}
      </Button>
    </div>
  );
}
