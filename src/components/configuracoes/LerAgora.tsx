import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

/**
 * "Ler agora" de uma leitura por robô (Kommo, reuniões), sem esperar o horário (dono, 2026-11-08). Só o dono e o admin
 * veem a tela de Integrações, e a função confere de novo (`_shared/servico-ou-admin.ts`).
 */
export function LerAgora({ funcao, tabela, nome }: { funcao: 'mkt-kommo-coletar' | 'google-reunioes'; tabela: string; nome: string }) {
  const qc = useQueryClient();
  const ler = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(funcao, { body: { source: 'botao' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => toast.success(`Leitura do ${nome} feita agora.`, { duration: 10000 }),
    onError: (e: Error) => toast.error(`A leitura do ${nome} falhou: ${e.message}`, { duration: 15000 }),
    // Deu certo ou não, o cartão mostra a situação nova.
    onSettled: () => qc.invalidateQueries({ queryKey: [tabela] }),
  });
  return (
    <Button size="sm" onClick={() => ler.mutate()} disabled={ler.isPending}>
      <RefreshCw className={cn('h-3.5 w-3.5 mr-1', ler.isPending && 'animate-spin')} aria-hidden="true" />
      {ler.isPending ? 'Lendo… (até 1 minuto)' : 'Ler agora'}
    </Button>
  );
}
