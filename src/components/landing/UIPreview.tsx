import { StatusCell } from '@/components/workos/StatusCell';
import { PriorityCell } from '@/components/workos/PriorityCell';
import { Brain, Search, Bell, Star, Send, TrendingUp, AlertOctagon, CheckCircle2 } from 'lucide-react';

/**
 * Pré-visualizações da interface real do Helpoint, montadas com os mesmos
 * componentes e tokens do produto (nada de imagens de banco de imagens).
 */

function Chrome({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-card">
      <div className="h-9 flex items-center gap-2 px-3 border-b border-border bg-surface-2">
        <span className="w-2.5 h-2.5 rounded-full bg-monday-red/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-monday-yellow/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-monday-green/70" />
        <span className="ml-2 text-[11px] font-medium text-muted-foreground truncate">{title}</span>
      </div>
      {children}
    </div>
  );
}

const rows = [
  { ref: '#1042', title: 'Notebook não liga — Financeiro', status: 'open', priority: 'critical', owner: 'Ana' },
  { ref: '#1041', title: 'Instalar VPN no time comercial', status: 'in_progress', priority: 'medium', owner: 'Bruno' },
  { ref: '#1039', title: 'Troca de toner — Recepção', status: 'waiting_parts', priority: 'low', owner: 'Carla' },
  { ref: '#1036', title: 'Acesso ao ERP para novo colaborador', status: 'resolved', priority: 'high', owner: 'Diego' },
] as const;

export function TicketsBoardPreview() {
  return (
    <Chrome title="Helpoint · Chamados de TI">
      <div className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-8 rounded-md bg-secondary flex items-center gap-2 px-2.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-[11px] text-muted-foreground">Pesquisar chamados...</span>
          </div>
          <Bell className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 badge-info">
            <span className="text-[11px] font-bold">Fila da equipe</span>
            <span className="text-[10px] bg-white/20 px-1.5 rounded-full font-semibold">4</span>
          </div>
          {rows.map(r => (
            <div key={r.ref} className="flex items-center gap-2 px-3 h-9 border-b border-border last:border-0">
              <span className="font-mono text-[11px] font-bold text-primary w-10 shrink-0">{r.ref}</span>
              <span className="flex-1 text-[11px] text-foreground truncate">{r.title}</span>
              <div className="hidden sm:block scale-[0.78] origin-right">
                <PriorityCell priority={r.priority} size="sm" />
              </div>
              <div className="scale-[0.78] origin-right">
                <StatusCell status={r.status} size="sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Chrome>
  );
}

export function DashboardPreview() {
  const kpis = [
    { label: 'Abertos', value: '18', cls: 'bg-kpi-blue' },
    { label: 'Atrasados', value: '3', cls: 'bg-kpi-red' },
    { label: 'Resolvidos hoje', value: '11', cls: 'bg-kpi-green' },
    { label: 'SLA no prazo', value: '94%', cls: 'bg-kpi-purple' },
  ];
  return (
    <Chrome title="Helpoint · Painel do dia">
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {kpis.map(k => (
            <div key={k.label} className={`rounded-lg p-2.5 ${k.cls}`}>
              <div className="text-[18px] font-extrabold text-foreground leading-none">{k.value}</div>
              <div className="text-[10px] text-foreground/70 mt-1 font-medium">{k.label}</div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 badge-warning">
            <span className="text-[11px] font-bold">Hoje</span>
            <span className="text-[10px] bg-on-yellow-soft px-1.5 rounded-full font-semibold">3</span>
          </div>
          {[
            { icon: AlertOctagon, t: 'Servidor de arquivos lento', d: 'Vence às 14h' },
            { icon: TrendingUp, t: 'Revisar campanha de agosto', d: 'Marketing' },
            { icon: CheckCircle2, t: 'Checklist de qualidade — lote 22', d: 'SAC' },
          ].map(i => (
            <div key={i.t} className="flex items-center gap-2 px-3 h-9 border-b border-border last:border-0">
              <i.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="flex-1 text-[11px] text-foreground truncate">{i.t}</span>
              <span className="text-[10px] text-muted-foreground">{i.d}</span>
            </div>
          ))}
        </div>
      </div>
    </Chrome>
  );
}

export function LyraChatPreview() {
  return (
    <Chrome title="Helpoint · Lyra">
      <div className="p-3 space-y-2.5">
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-md bg-monday-purple flex items-center justify-center shrink-0">
            <Brain className="w-3.5 h-3.5 text-white" aria-hidden="true" />
          </div>
          <div className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-foreground/80 leading-relaxed">
            Bom dia! Você tem <b>3 chamados atrasados</b> e 1 contrato vencendo em 5 dias.
            O Wi-Fi da sala 3 gerou 12 chamados no mês — sugiro abrir uma manutenção preventiva.
          </div>
        </div>
        <div className="flex justify-end">
          <div className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-[11px] max-w-[75%]">
            Resuma os atrasados por responsável
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border px-2.5 h-9">
          <span className="flex-1 text-[11px] text-muted-foreground">Pergunte algo à Lyra...</span>
          <Send className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
        </div>
      </div>
    </Chrome>
  );
}

export function QualityPreview() {
  return (
    <Chrome title="Helpoint · Qualidade & SAC">
      <div className="p-3 space-y-2.5">
        <div className="rounded-lg border border-border p-3">
          <div className="text-[11px] font-bold text-foreground mb-1.5">Satisfação do cliente</div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(i => (
              <Star key={i} className={`w-4 h-4 ${i <= 4 ? 'text-monday-yellow fill-monday-yellow' : 'text-muted-foreground'}`} aria-hidden="true" />
            ))}
            <span className="ml-2 text-[11px] font-semibold text-foreground">4,2 / 5</span>
          </div>
        </div>
        {[
          { t: 'Reclamação — lote 118', s: 'in_progress' },
          { t: 'Laudo técnico emitido', s: 'resolved' },
          { t: 'Retorno do cliente pendente', s: 'waiting_user' },
        ].map(r => (
          <div key={r.t} className="flex items-center gap-2 rounded-lg border border-border px-3 h-9">
            <span className="flex-1 text-[11px] text-foreground truncate">{r.t}</span>
            <div className="scale-[0.78] origin-right">
              <StatusCell status={r.s as never} size="sm" />
            </div>
          </div>
        ))}
      </div>
    </Chrome>
  );
}
