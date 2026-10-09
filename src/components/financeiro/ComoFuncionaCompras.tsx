// "Como funciona" do fluxo de compras (pedido do dono, 2026-10-03): o passo a passo e o que cada
// decisão faz, em duas versões — para quem pede a compra e para quem aprova. O texto descreve as
// regras que o banco aplica (`compras_guarda_o_status`, `compras_exige_tres_orcamentos`,
// `compras_respeita_teto`, `compras_registra_decisao`, 20261130010000): se uma delas mudar, mude aqui.
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Para = 'quem-pede' | 'quem-aprova';

const PASSOS = [
  { titulo: '1. Pedir', texto: 'Em Nova solicitação › Compras, escolha a categoria de compra e preencha o produto, o setor que paga, a quantidade e os três orçamentos (fornecedor, valor unitário, frete grátis ou pago, prazo de entrega, link de compra e anexo) — o total de cada um sai sozinho. Se tiver um preferido, marque "Recomendo este" e, se quiser, diga por quê. A descrição do chamado é opcional. O pedido vira um chamado de Compras, "Aguardando aprovação" — o prazo de Compras fica parado até a decisão.' },
  { titulo: '2. Chega para quem decide', texto: 'Quem tem a caixinha "Aprovar / reprovar compra" recebe o aviso (com e-mail) e decide em Compras › Aprovar compras, que mostra há quanto tempo cada pedido espera e o tempo médio de decisão.' },
  { titulo: '3. Decidir', texto: 'Aprovar, Solicitar ajustes ou Recusar — veja abaixo o que cada uma faz. Quem pediu é avisado da decisão; aprovada, Compras também.' },
  { titulo: '4. Comprar', texto: 'Aprovada, o chamado fica "Aprovada · aguardando compra". Quem tem "Executar compra" registra a compra feita, a nota e o vencimento: o chamado vira Resolvido e a conta a pagar nasce no Financeiro. O "Resolver" comum não fecha compra aprovada.' },
];

const DECISOES = [
  { nome: 'Aprovar', texto: 'Escolha o orçamento vencedor (o recomendado por quem pediu vem marcado) e quantas unidades aprovar — menos ou mais do que o pedido; o total aprovado é o que vira conta a pagar. A observação é opcional. Com menos de três orçamentos, ou acima do teto mensal do setor (quando o Financeiro liga o teto), é preciso escrever o motivo.' },
  { nome: 'Solicitar ajustes', texto: 'Escreva o que precisa mudar (obrigatório). A compra volta para quem pediu, que corrige a quantidade e os orçamentos — produto e setor ficam — e reenvia. Volta para a fila de aprovação com a resposta dele.' },
  { nome: 'Recusar', texto: 'Escreva o motivo (obrigatório). A compra para aí; quem pediu é avisado com o motivo. Para pedir de novo, abre-se outro pedido.' },
];

export function ComoFuncionaCompras({ para }: { para: Para }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <HelpCircle className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Como funciona
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Como funciona a compra</DialogTitle>
          <DialogDescription>
            {para === 'quem-aprova'
              ? 'Você decide. Cada decisão fica registrada com seu nome, a data e a observação.'
              : 'Você pede. Acompanhe pelo chamado: cada decisão aparece lá, com quem decidiu e o porquê.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {PASSOS.map(p => (
            <div key={p.titulo}>
              <p className="font-medium">{p.titulo}</p>
              <p className="text-muted-foreground">{p.texto}</p>
            </div>
          ))}
          <div className="rounded-md border border-border p-3 space-y-2">
            <p className="font-medium">O que cada decisão faz</p>
            {DECISOES.map(d => (
              <p key={d.nome} className="text-muted-foreground"><span className="font-medium text-foreground">{d.nome}:</span> {d.texto}</p>
            ))}
          </div>
          {para === 'quem-pede' ? (
            <div className="rounded-md bg-muted/50 p-3 text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Dicas para aprovar mais rápido</p>
              Traga três orçamentos do mesmo item, com o frete e o prazo de entrega de cada um; anexe a proposta; use a observação de
              cada orçamento para a condição de pagamento. Se pedirem ajuste, responda o que mudou ao reenviar.
            </div>
          ) : (
            <div className="rounded-md bg-muted/50 p-3 text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Antes de decidir, confira</p>
              O histórico de compras do mesmo item (preço e fornecedor anteriores), os anexos de cada orçamento,
              a observação do solicitante e, se houver, o teto do setor no mês.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
