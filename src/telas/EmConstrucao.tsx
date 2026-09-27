import { Link } from 'react-router-dom';
import { HardHat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Props {
  /** Nome do módulo, como a pessoa o conhece. Ex.: "CRM". */
  modulo: string;
  /** Uma linha dizendo o que está sendo feito, em vez de só "aguarde". */
  motivo?: string;
}

/**
 * Módulo desligado de propósito, com a razão na tela.
 *
 * A alternativa seria deixar a rota cair no "não encontrado", e aí quem
 * digitasse o endereço antigo — ou clicasse num link salvo — concluiria que o
 * sistema quebrou. Dizer "está em construção, e é por isto" custa uma tela e
 * evita um chamado.
 *
 * Nada foi apagado: as telas e os dados do módulo continuam onde estavam.
 */
export default function EmConstrucao({ modulo, motivo }: Props) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="max-w-md w-full p-6 text-center space-y-4">
        <span className="mx-auto w-12 h-12 rounded-full bg-status-warning/10 flex items-center justify-center">
          <HardHat className="w-6 h-6 text-status-warning" aria-hidden="true" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-foreground">{modulo} em construção</h1>
          <p className="text-sm text-muted-foreground">
            {motivo ?? `O ${modulo} está temporariamente fora do ar enquanto é retrabalhado. Nada do que já foi cadastrado se perdeu.`}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/inicio">Voltar para o início</Link>
        </Button>
      </Card>
    </div>
  );
}
