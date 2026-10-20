// O painel do chamado da TI que traz uma lista de equipamentos para conferir (dono, 2026-10-20; 20270129100000):
//   • devolução do desligamento: em ordem / com avaria / não devolvido, e o Termo de Devolução assinado;
//   • conferência do mês: conferido / divergência.
// Fora de "em ordem" e "conferido" o motivo é obrigatório e avisa o gestor da pessoa, o RH e a diretoria (no banco).
import { useRef, useState } from 'react';
import { CheckCircle2, ClipboardCheck, FileDown, Loader2, Paperclip, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useDadosParaTermo, urlDoTermoAssinado } from '@/hooks/useTermos';
import {
  useAnexarTermoDeDevolucao, useChecagemDoChamado, useMarcarItem, type ItemDaChecagem, type SituacaoDoItem,
} from '@/hooks/useChecagemDeEquipamentos';
import {
  EMPRESA_PADRAO, gerarTermoDeDevolucaoPdf, nomeDoArquivoDaDevolucao, type SituacaoDaDevolucao,
} from '@/lib/termo-equipamento-pdf';

const OPCOES: Record<'devolucao' | 'conferencia', { valor: SituacaoDoItem; rotulo: string; classe: string }[]> = {
  devolucao: [
    { valor: 'ok', rotulo: 'Em ordem', classe: 'badge-success' },
    { valor: 'avaria', rotulo: 'Com avaria', classe: 'badge-warning' },
    { valor: 'nao_devolvido', rotulo: 'Não devolvido', classe: 'badge-danger' },
  ],
  conferencia: [
    { valor: 'conferido', rotulo: 'Conferido', classe: 'badge-success' },
    { valor: 'divergencia', rotulo: 'Divergência', classe: 'badge-danger' },
  ],
};
const pedeMotivo = (s: SituacaoDoItem) => s !== 'ok' && s !== 'conferido';

export function ChecagemDeEquipamentos({ ticketId, podeMarcar }: { ticketId: string; podeMarcar: boolean }) {
  const { profile } = useAuth();
  const { data: checagem } = useChecagemDoChamado(ticketId);
  const { data: dados } = useDadosParaTermo(checagem?.tipo === 'devolucao' ? checagem.colaborador_id : null);
  const marcar = useMarcarItem(ticketId);
  const anexar = useAnexarTermoDeDevolucao(ticketId);
  const arquivo = useRef<HTMLInputElement>(null);
  if (!checagem) return null;

  const devolucao = checagem.tipo === 'devolucao';
  const faltam = checagem.itens.filter((i) => !i.situacao).length;

  const baixarTermo = () => gerarTermoDeDevolucaoPdf({
    empresa: dados?.empresa || EMPRESA_PADRAO,
    colaborador_nome: dados?.nome || checagem.colaborador_nome || '',
    cpf: dados?.cpf ?? null,
    setor: dados?.setor ?? null,
    responsavel_nome: profile?.full_name ?? null,
    itens: checagem.itens.map((i) => ({
      descricao: i.descricao, patrimonio: i.patrimonio, serie: i.serie,
      situacao: i.situacao as SituacaoDaDevolucao, motivo: i.motivo,
    })),
  }).save(nomeDoArquivoDaDevolucao(checagem.colaborador_nome ?? 'colaborador'));

  const abrirTermo = async () => {
    const url = checagem.termo_path ? await urlDoTermoAssinado(checagem.termo_path) : null;
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4 space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        {devolucao ? <PackageCheck className="w-3.5 h-3.5" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
        {devolucao ? 'Devolução de equipamentos' : 'Conferência de equipamentos'}
      </h3>
      <p className="text-xs text-muted-foreground">
        {devolucao
          ? `Tudo o que estava no nome de ${checagem.colaborador_nome ?? 'quem saiu'}. Marque cada um, gere o Termo de Devolução, colha as assinaturas e anexe: só então o chamado resolve.`
          : 'Confira com cada pessoa se o equipamento está com ela (patrimônio e série batendo). Divergência pede o motivo e avisa o gestor, o RH e a diretoria.'}
      </p>

      {checagem.itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhum equipamento no nome da pessoa.</p>}
      <ul className="space-y-2">
        {checagem.itens.map((item) => (
          <LinhaDoItem key={item.id} item={item} opcoes={OPCOES[checagem.tipo]} mostraPessoa={!devolucao}
            podeMarcar={podeMarcar && !checagem.termo_path} ocupado={marcar.isPending}
            onMarcar={(situacao, motivo) => marcar.mutate({ itemId: item.id, situacao, motivo })} />
        ))}
      </ul>

      {devolucao && checagem.itens.length > 0 && (
        <div className="pt-2 border-t border-border space-y-2">
          {checagem.termo_path ? (
            <button type="button" onClick={abrirTermo} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
              <CheckCircle2 className="w-4 h-4 text-status-success" /> Termo de devolução assinado anexado — ver
            </button>
          ) : faltam > 0 ? (
            <p className="text-xs text-muted-foreground">Falta marcar {faltam} {faltam === 1 ? 'equipamento' : 'equipamentos'}.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={baixarTermo}><FileDown className="w-4 h-4 mr-1" /> Baixar termo de devolução</Button>
              {podeMarcar && (
                <>
                  <Button size="sm" disabled={anexar.isPending} onClick={() => arquivo.current?.click()}>
                    {anexar.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Paperclip className="w-4 h-4 mr-1" />}
                    Anexar assinado
                  </Button>
                  <input ref={arquivo} type="file" accept="application/pdf,image/*" className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) anexar.mutate({ checagemId: checagem.id, arquivo: f });
                    }} />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LinhaDoItem({ item, opcoes, mostraPessoa, podeMarcar, ocupado, onMarcar }: {
  item: ItemDaChecagem;
  opcoes: { valor: SituacaoDoItem; rotulo: string; classe: string }[];
  mostraPessoa: boolean;
  podeMarcar: boolean;
  ocupado: boolean;
  onMarcar: (s: SituacaoDoItem, motivo?: string) => void;
}) {
  const [escolhendo, setEscolhendo] = useState<SituacaoDoItem | null>(null);
  const [motivo, setMotivo] = useState('');
  const atual = opcoes.find((o) => o.valor === item.situacao);
  return (
    <li className="rounded-lg border border-border p-2.5 text-sm space-y-1.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {mostraPessoa && <p className="text-xs font-medium text-muted-foreground">{item.pessoa_nome ?? '—'}</p>}
          <p className="font-medium break-words">{item.descricao}</p>
          <p className="text-xs text-muted-foreground">
            Patrimônio {item.patrimonio ?? '—'}{item.serie ? ` · Série ${item.serie}` : ''}
          </p>
        </div>
        {atual && <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', atual.classe)}>{atual.rotulo}</span>}
      </div>
      {item.motivo && <p className="text-xs text-muted-foreground">Motivo: {item.motivo}</p>}
      {podeMarcar && (
        <div className="flex flex-wrap gap-1.5">
          {opcoes.map((o) => (
            <Button key={o.valor} type="button" size="sm" variant={item.situacao === o.valor ? 'default' : 'outline'}
              className="h-7 text-xs" disabled={ocupado}
              onClick={() => {
                if (pedeMotivo(o.valor)) { setEscolhendo(o.valor); setMotivo(item.motivo ?? ''); }
                else { setEscolhendo(null); onMarcar(o.valor); }
              }}>
              {o.rotulo}
            </Button>
          ))}
        </div>
      )}
      {escolhendo && (
        <form className="flex gap-1.5" onSubmit={(e) => {
          e.preventDefault();
          if (!motivo.trim()) return;
          onMarcar(escolhendo, motivo.trim());
          setEscolhendo(null);
        }}>
          <Input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-8 text-xs"
            placeholder="Motivo (ex.: levou para casa e deixou um mouse pessoal)" aria-label="Motivo" />
          <Button type="submit" size="sm" className="h-8 text-xs" disabled={!motivo.trim()}>Salvar</Button>
        </form>
      )}
    </li>
  );
}
