// Novo › RH (RH 100% por Solicitações, dono, 2026-11-06): a lista de assuntos abre o pedido, sem passar por chamado.
import { ChevronRight } from 'lucide-react';
import { ChipDoSetor } from '@/components/ui/ChipDoSetor';
import { ASSUNTOS_DO_RH, TIPOS, type TipoDeSolicitacao } from '@/config/solicitacoes';
import { tituloDaPorta } from '@/lib/estado-para-quem-pediu';

export function AssuntosDoRH({ onEscolher }: { onEscolher: (tipo: TipoDeSolicitacao) => void }) {
  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <ChipDoSetor setor="rh" forma="sigla" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{tituloDaPorta('rh')}</h1>
      </div>
      <p className="text-[14px] text-muted-foreground">Escolha o assunto.</p>
      <ul className="space-y-2">
        {ASSUNTOS_DO_RH.map((t) => (
          <li key={t}>
            <button type="button" onClick={() => onEscolher(t)}
              className="w-full min-h-14 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:border-primary/50 focus-visible:outline-2">
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-foreground">{TIPOS[t].rotulo}</span>
                <span className="block text-[13px] text-muted-foreground">{TIPOS[t].descricao}</span>
              </span>
              <ChevronRight className="w-5 h-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
