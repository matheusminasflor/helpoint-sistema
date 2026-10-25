// Confirmação antes de apagar (proposta "Helpoint no dia a dia", defeito 15, 2026-10-24): seis lugares apagavam com
// um clique — as duas Caixinhas, o estoque de Compras, o do Marketing, o Jornal, o Chat e o anexo da notícia.
// Diz O QUE vai sumir (o nome, o valor) e as consequências; o botão de apagar fica em vermelho e separado.
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  /** O que vai ser apagado, ou null com a caixa fechada. */
  aberto: boolean;
  titulo: string;
  descricao: string;
  acao?: string;
  enviando?: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}

export function ConfirmarExclusao({ aberto, titulo, descricao, acao = 'Apagar', enviando = false, onCancelar, onConfirmar }: Props) {
  return (
    <AlertDialog open={aberto} onOpenChange={(o) => { if (!o) onCancelar(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction disabled={enviando} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => { e.preventDefault(); onConfirmar(); }}>
            {enviando ? 'Apagando…' : acao}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
