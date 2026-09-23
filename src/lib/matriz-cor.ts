// A escala de cor da matriz produto × cliente (§14 item 6 do documento do
// dono; Frente 4, §2 do plano). Um matiz só, cinco degraus de opacidade —
// intensidade quer dizer magnitude, e magnitude não muda de cor. `maximo`
// já vem pronto em toda linha de `com_matriz_produto_cliente` (a régua da
// matriz inteira, não desta linha), então esta função nunca recalcula
// máximo — só decide o degrau de UMA célula contra ele.
//
// Tokens existentes (`bg-primary/…`), nunca token novo nem lib de escala de
// cor (ponytail): opacidade sobre a mesma cor já resolve.
export interface DegrauIntensidade {
  /** Classe Tailwind do fundo, ou string vazia para célula sem movimento. */
  classe: string;
}

const SEM_FUNDO: DegrauIntensidade = { classe: '' };

// Correção da auditoria (item 4): no degrau mais forte de antes
// (`bg-primary/70`) o texto claro contrastava 2,93:1 com o fundo em fonte
// de 11px — abaixo do mínimo de 4,5:1. "O número continua legível em todo
// degrau" é o que vale; por isso os quatro degraus ficam mais claros e o
// texto escuro padrão da célula serve todos — não há mais campo
// `textoClaro` nem classe `text-primary-foreground` em lugar nenhum.
// Último degrau com `ate: Infinity` (em vez de 1.00): `proporcao <= 1`
// sempre é verdade, então um fallback fora do laço nunca era alcançado e
// ainda vazava o campo `ate` no objeto devolvido (item 9) — com Infinity o
// próprio laço resolve, sem precisar de fallback.
const DEGRAUS: { ate: number; classe: string }[] = [
  { ate: 0.10, classe: 'bg-primary/10' },
  { ate: 0.25, classe: 'bg-primary/25' },
  { ate: 0.40, classe: 'bg-primary/40' },
  { ate: Infinity, classe: 'bg-primary/55' },
];

/**
 * Decide o degrau de intensidade de uma célula. `maximo <= 0` (matriz sem
 * nenhum movimento) e `valor <= 0` (célula sem movimento) voltam sempre sem
 * fundo — nunca dividem por zero, nunca pintam tudo.
 */
export function degrauIntensidade(valor: number, maximo: number): DegrauIntensidade {
  if (valor <= 0 || maximo <= 0) return SEM_FUNDO;

  const proporcao = valor / maximo;
  for (const degrau of DEGRAUS) {
    if (proporcao <= degrau.ate) return { classe: degrau.classe };
  }
}
