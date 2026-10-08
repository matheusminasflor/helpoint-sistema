// As respostas do formulário da categoria, no chamado. Eram gravadas ao abrir e nenhuma tela as mostrava
// (dono, 2026-10-08, chamado #50: o atendente não via o formulário nem as caixas marcadas).
import { format } from 'date-fns';
import { ClipboardList } from 'lucide-react';
import { useTicketResponses, type TicketFormField } from '@/hooks/useTicketFormFields';

function valorLegivel(field: TicketFormField, valor: string) {
  switch (field.field_type) {
    // Gravados com toISOString() a partir da data local; new Date() devolve o dia que a pessoa escolheu.
    case 'date': return format(new Date(valor), 'dd/MM/yyyy');
    case 'delivery_datetime': return format(new Date(valor), "dd/MM/yyyy 'às' HH:mm");
    case 'checkbox': return valor.split(',').join(', ');
    default: return valor;
  }
}

export function TicketFormAnswers({ ticketId }: { ticketId: string }) {
  const { responses } = useTicketResponses(ticketId);
  // "Quem atende" já aparece em "Atribuído a"; o valor gravado é só o id da pessoa.
  const visiveis = responses
    .filter((r) => r.field && r.value && r.field.field_type !== 'assignee_select')
    .sort((a, b) => a.field.sort_order - b.field.sort_order);
  if (visiveis.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <ClipboardList className="w-3.5 h-3.5" />
        Respostas do formulário
      </h3>
      <dl className="space-y-3 text-sm">
        {visiveis.map((r) => (
          <div key={r.id}>
            <dt className="text-muted-foreground">{r.field.label}</dt>
            <dd className="font-medium whitespace-pre-wrap break-words">{valorLegivel(r.field, r.value!)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
