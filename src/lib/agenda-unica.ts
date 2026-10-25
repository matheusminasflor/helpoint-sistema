// Agenda única (proposta "Helpoint no dia a dia", etapa 4 · Agenda, 2026-10-25): além dos eventos, os chamados
// agendados, os prazos dos meus chamados e as férias de quem é do meu setor. Puro, para o teste: o que cai em cada dia.
import { fromLocalISODate, toLocalISODate } from '@/lib/dates';

export interface ChamadoDaAgenda {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  sla_due_at: string | null;
  agendado_para: string | null;
  /** A categoria (nome) — no calendário do Marketing, "Criação de Arte", "Evento"… */
  category?: string | null;
}

export interface FeriasDaAgenda { user_id: string; nome: string; start_date: string; end_date: string }

export interface ItemDaAgenda {
  chave: string;
  tipo: 'agendado' | 'prazo' | 'ferias';
  /** "HH:mm" no dia; nulo nas férias, que ocupam o dia inteiro. */
  hora: string | null;
  titulo: string;
  detalhe: string;
  chamadoId?: string;
}

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Dia (local, `aaaa-mm-dd`) → os itens dele, de `de` a `ate`. */
export function itensDaAgenda(chamados: ChamadoDaAgenda[], ferias: FeriasDaAgenda[], de: string, ate: string, euId?: string) {
  const porDia = new Map<string, ItemDaAgenda[]>();
  const poeNoDia = (dia: string, item: ItemDaAgenda) => {
    if (dia < de || dia > ate) return;
    porDia.set(dia, [...(porDia.get(dia) ?? []), item]);
  };
  for (const c of chamados) {
    // Agendado: o prazo está parado até a hora marcada, então o que vale no dia é o agendamento, não o prazo.
    if (c.status === 'scheduled' && c.agendado_para) {
      poeNoDia(toLocalISODate(new Date(c.agendado_para)), {
        chave: `ag-${c.id}`, tipo: 'agendado', hora: hhmm(c.agendado_para), titulo: c.title,
        detalhe: `Chamado #${c.ticket_number} agendado${c.category ? ` · ${c.category}` : ''}`, chamadoId: c.id,
      });
    } else if (c.sla_due_at) {
      poeNoDia(toLocalISODate(new Date(c.sla_due_at)), {
        chave: `pz-${c.id}`, tipo: 'prazo', hora: hhmm(c.sla_due_at), titulo: c.title,
        detalhe: `Prazo do chamado #${c.ticket_number}${c.category ? ` · ${c.category}` : ''}`, chamadoId: c.id,
      });
    }
  }
  for (const f of ferias) {
    const fim = f.end_date < ate ? f.end_date : ate;
    for (let d = fromLocalISODate(f.start_date < de ? de : f.start_date); toLocalISODate(d) <= fim; d.setDate(d.getDate() + 1)) {
      poeNoDia(toLocalISODate(d), {
        chave: `fe-${f.user_id}-${f.start_date}-${toLocalISODate(d)}`, tipo: 'ferias', hora: null,
        titulo: f.user_id === euId ? 'Minhas férias' : `${f.nome} de férias`,
        detalhe: `De ${f.start_date.slice(8, 10)}/${f.start_date.slice(5, 7)} a ${f.end_date.slice(8, 10)}/${f.end_date.slice(5, 7)}`,
      });
    }
  }
  return porDia;
}
