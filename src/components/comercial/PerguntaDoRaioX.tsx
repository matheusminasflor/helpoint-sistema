// A pergunta do Raio-X no lançamento (dono, 2026-11-05): dois cliques e duas frases, na hora da ligação. Desde 2026-11-10
// aparece, e é obrigatória, só no "Contato para venda" sem venda; o cliente parado ou em queda só muda o aviso. Vai para a
// ficha do cliente; o lançamento segue como sempre foi.
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  MOTIVOS, RESULTADOS_DO_CONTATO, TIPOS_DE_PROPOSTA, type Motivo, type RespostaDoLancamento, type ResultadoDoContato, type TipoDeProposta,
} from '@/lib/raio-x';

/** Uma opção em um clique. A cor segue a do Raio-X: vermelho é a dor, azul é o restante. */
export function Opcao({ ativa, cor = 'info', onClick, children }: {
  ativa: boolean; cor?: 'info' | 'danger'; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" aria-pressed={ativa} onClick={onClick}
      className={cn('rounded-full border border-border px-3 min-h-9 text-[13px]', ativa ? (cor === 'danger' ? 'badge-danger font-semibold' : 'badge-info font-semibold') : 'hover:bg-muted/60')}>
      {children}
    </button>
  );
}

export function PerguntaDoRaioX({ alerta, resposta, onChange }: {
  alerta: 'parado' | 'queda' | null; resposta: RespostaDoLancamento; onChange: (r: RespostaDoLancamento) => void;
}) {
  const muda = (campos: Partial<RespostaDoLancamento>) => onChange({ ...resposta, ...campos });
  return (
    <section className="rounded-lg border border-border p-3 space-y-3" aria-label="Raio-X do cliente">
      <div className="text-[13px] rounded-md badge-info px-2 py-1.5 space-y-0.5">
        <p className="font-semibold">Registro obrigatório em contato para venda sem pedido</p>
        <p>
          {alerta === 'parado' ? 'Cliente sem compras há mais de 120 dias. ' : alerta === 'queda' ? 'Cliente comprando abaixo da média. ' : ''}
          O motivo e a proposta compõem o Raio-X do cliente e orientam as próximas ações comerciais. Esta informação não altera os seus indicadores.
        </p>
      </div>
      <div className="space-y-1.5">
        <p className="text-[14px] font-medium">Como foi o contato?</p>
        <div className="flex flex-wrap gap-2">
          {RESULTADOS_DO_CONTATO.map((o) => (
            <Opcao key={o.valor} ativa={resposta.resultado === o.valor} onClick={() => muda({ resultado: o.valor as ResultadoDoContato })}>{o.rotulo}</Opcao>
          ))}
        </div>
      </div>
      {resposta.resultado === 'falou' && (
        <>
          <div className="space-y-1.5">
            <p className="text-[14px] font-medium">Por que a venda não foi fechada?</p>
            <div className="flex flex-wrap gap-2">
              {MOTIVOS.map((o) => (
                <Opcao key={o.valor} cor="danger" ativa={resposta.motivo === o.valor} onClick={() => muda({ motivo: o.valor as Motivo })}>{o.rotulo}</Opcao>
              ))}
            </div>
            {resposta.motivo === 'outros' && (
              <Input aria-label="Qual é o motivo" placeholder="Qual é o motivo?" value={resposta.motivoOutros} onChange={(e) => muda({ motivoOutros: e.target.value })} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="raio-x-descricao">Conte em poucas palavras</Label>
            <Textarea id="raio-x-descricao" rows={2} value={resposta.descricao} onChange={(e) => muda({ descricao: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="raio-x-proposta">O que você propôs? (opcional)</Label>
            <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
              <Select value={resposta.propostaTipo} onValueChange={(v) => muda({ propostaTipo: v as TipoDeProposta })}>
                <SelectTrigger aria-label="Tipo de proposta"><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS_DE_PROPOSTA.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>)}</SelectContent>
              </Select>
              <Input id="raio-x-proposta" value={resposta.proposta} onChange={(e) => muda({ proposta: e.target.value })} />
            </div>
          </div>
        </>
      )}
      {resposta.resultado && resposta.resultado !== 'falou' && (
        <p className="text-[13px] text-muted-foreground">Fica registrado como tentativa. O motivo pode ser perguntado no próximo contato.</p>
      )}
    </section>
  );
}
