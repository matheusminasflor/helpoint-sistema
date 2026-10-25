// Defeito 12 (2026-10-24): a Agenda ganha "Editar" e confirma antes de apagar o evento avulso. Roda uma vez.
import { readFileSync, writeFileSync } from 'node:fs';
const F = 'src/telas/Agenda.tsx';
let s = readFileSync(F, 'utf8');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('não achei: ' + de.slice(0, 70)); s = s.replace(de, para); };
troca("import { CalendarDays, Plus, Repeat, Trash2, ChevronLeft, ChevronRight, Filter } from 'lucide-react';",
  "import { CalendarDays, Plus, Repeat, Trash2, Pencil, ChevronLeft, ChevronRight, Filter } from 'lucide-react';\nimport { EventEditDialog, type EventoEditavel, type MudancaDoEvento } from '@/components/dashboard/EventEditDialog';\nimport { ConfirmarExclusao } from '@/components/ui/ConfirmarExclusao';");
troca("  const { events, eventDays, createEvent, deleteEvent } = useCalendarEvents(range);",
  `  const { events, eventDays, createEvent, deleteEvent, updateEvent } = useCalendarEvents(range);
  const [editando, setEditando] = useState<EventoEditavel | null>(null);
  // A mudança espera a escolha "só este / os próximos / todos" quando o evento se repete.
  const [mudancaPendente, setMudancaPendente] = useState<{ mudanca: MudancaDoEvento; mudouAHora: boolean } | null>(null);
  const [apagandoAvulso, setApagandoAvulso] = useState<{ id: string; title: string } | null>(null);`);
troca("        seriesId: ev.series_id,\n      }))", "        seriesId: ev.series_id,\n        start_at: ev.start_at,\n        rawDescription: ev.description ?? '',\n      }))");
troca("      deleteEvent.mutate({ id: item.id });\n    }\n  };", "      setApagandoAvulso({ id: item.id, title: item.title });\n    }\n  };\n\n" +
`  const salvarEdicao = (mudanca: MudancaDoEvento, mudouAHora: boolean) => {
    if (!editando) return;
    if (editando.seriesId) { setMudancaPendente({ mudanca, mudouAHora }); return; }
    updateEvent.mutate({ id: editando.id, scope: 'this', changes: mudanca }, { onSuccess: () => setEditando(null) });
  };
  const confirmarEscopoDaEdicao = (scope: RecurrenceScope) => {
    if (!editando || !mudancaPendente) return;
    // Para "os próximos" e "todos", a hora não vai junto: gravar o mesmo start_at em toda a série a empilharia
    // num horário só. Dia e hora mudam só em "só este".
    const { start_at, ...semHora } = mudancaPendente.mudanca;
    const changes = scope === 'this' ? mudancaPendente.mudanca : semHora;
    void start_at;
    updateEvent.mutate({ id: editando.id, scope, changes }, { onSuccess: () => { setEditando(null); setMudancaPendente(null); } });
  };`);
troca(`                  <button
                    onClick={() => handleDeleteClick(item)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive mt-0.5"
                    aria-label="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>`,
`                  <button
                    onClick={() => setEditando({ id: item.id, title: item.title, description: item.rawDescription, start_at: item.start_at, seriesId: item.seriesId })}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-foreground mt-0.5"
                    aria-label={\`Editar \${item.title}\`}
                  >
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(item)}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-destructive mt-0.5"
                    aria-label={\`Excluir \${item.title}\`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>`);
troca(`      <RecurrenceScopeDialog
        open={scopeDialog.open}`,
`      <EventEditDialog evento={editando} enviando={updateEvent.isPending}
        onCancelar={() => { setEditando(null); setMudancaPendente(null); }} onSalvar={salvarEdicao} />

      <RecurrenceScopeDialog
        open={!!mudancaPendente}
        onOpenChange={(o) => { if (!o) setMudancaPendente(null); }}
        mode="edit"
        eventTitle={editando?.title ?? ''}
        onConfirm={confirmarEscopoDaEdicao}
      />

      <ConfirmarExclusao aberto={!!apagandoAvulso} titulo="Excluir este evento?" acao="Excluir"
        descricao={apagandoAvulso ? \`“\${apagandoAvulso.title}” sai da sua agenda e não volta.\` : ''}
        enviando={deleteEvent.isPending} onCancelar={() => setApagandoAvulso(null)}
        onConfirmar={() => apagandoAvulso && deleteEvent.mutate({ id: apagandoAvulso.id }, { onSuccess: () => setApagandoAvulso(null) })} />

      <RecurrenceScopeDialog
        open={scopeDialog.open}`);
writeFileSync(F, s);
console.log('ok');
