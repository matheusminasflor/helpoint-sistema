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
  /** No degrau mais forte o fundo é escuro o bastante para exigir texto claro. */
  textoClaro: boolean;
}

const SEM_FUNDO: DegrauIntensidade = { classe: '', textoClaro: false };

const DEGRAUS: { ate: number; classe: string; textoClaro: boolean }[] = [
  { ate: 0.05, classe: 'bg-primary/10', textoClaro: false },
  { ate: 0.20, classe: 'bg-primary/30', textoClaro: false },
  { ate: 0.50, classe: 'bg-primary/50', textoClaro: false },
  { ate: 1.00, classe: 'bg-primary/70', textoClaro: true },
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
    if (proporcao <= degrau.ate) return { classe: degrau.classe, textoClaro: degrau.textoClaro };
  }
  return DEGRAUS[DEGRAUS.length - 1];
}
