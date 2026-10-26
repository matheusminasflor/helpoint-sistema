// Passo 2 do "Novo" (rodada 3, etapa B; desenho aprovado em docs/proposta-rodada-3-visual.html): o setor escolhido
// mostra os assuntos dele, um por linha. Quem pede NÃO vê se o assunto passa pelo gestor ou vai direto a quem atende
// (decisão do dono: mostrar induz a escolher o assunto errado para fugir da aprovação). RH, Financeiro e Compras
// recebem "Pedido"; os outros setores, "Chamado".
import { ChevronRight } from 'lucide-react';
import { ChipDoSetor } from '@/components/ui/ChipDoSetor';
import { useTICategories, type TICategory, type TIModule } from '@/hooks/useTICategories';
import { tituloDaPorta } from '@/lib/estado-para-quem-pediu';
import { mensagemDeErro } from '@/lib/supabase-result';

interface AssuntosDoSetorProps {
  /** O módulo do chamado do setor (`tickets` é a TI). */
  modulo: string;
  onEscolher: (assunto: TICategory) => void;
}

export function AssuntosDoSetor({ modulo, onEscolher }: AssuntosDoSetorProps) {
  const { rootCategories, getSubcategories, isLoading, error } = useTICategories(modulo as TIModule);
  // "Outros" sempre por último (como na configuração das categorias).
  const assuntos = [...rootCategories].sort((a, b) => Number(/^outros$/i.test(a.name)) - Number(/^outros$/i.test(b.name)));
  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <ChipDoSetor setor={modulo} forma="sigla" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{tituloDaPorta(modulo)}</h1>
      </div>
      <p className="text-[14px] text-muted-foreground">Escolha o assunto.</p>
      {error && <p className="text-[14px] text-status-danger">{mensagemDeErro(error)}</p>}
      {isLoading && <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}</div>}
      {!isLoading && assuntos.length === 0 && (
        <p className="text-[14px] text-muted-foreground">Este setor ainda não tem assuntos cadastrados. Fale com o gestor do setor.</p>
      )}
      <ul className="space-y-2">
        {assuntos.map((a) => {
          const subs = getSubcategories(a.id).map((s) => s.name);
          return (
            <li key={a.id}>
              <button type="button" onClick={() => onEscolher(a)}
                className="w-full min-h-14 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:border-primary/50 focus-visible:outline-2">
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-foreground">{a.name}</span>
                  {subs.length > 0 && <span className="block text-[13px] text-muted-foreground truncate">{subs.join(', ')}</span>}
                </span>
                <ChevronRight className="w-5 h-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
