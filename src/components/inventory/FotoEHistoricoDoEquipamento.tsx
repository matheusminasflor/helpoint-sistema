// A foto do equipamento e quem já o teve (dono, 2026-10-20; 20270129100000). A foto é tirada na entrega e serve para
// comparar na devolução e na conferência do mês — o caso do mouse trocado pelo pessoal. Balde privado
// `inventario-fotos`, caminho `<empresa>/<equipamento>/<arquivo>`; o histórico é gravado pelo banco a cada troca de dono.
import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, History, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';

const BALDE = 'inventario-fotos';

export function FotoDoEquipamento({ assetId, fotoPath, podeTrocar }: { assetId: string; fotoPath: string | null; podeTrocar: boolean }) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const arquivo = useRef<HTMLInputElement>(null);
  const { data: url } = useQuery({
    queryKey: ['foto-do-equipamento', tenantId, fotoPath],
    enabled: !!tenantId && !!fotoPath,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BALDE).createSignedUrl(fotoPath!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  const enviar = useMutation({
    mutationFn: async (foto: File) => {
      const path = `${tenantId}/${assetId}/${Date.now()}-${foto.name.replace(/[^\w.-]/g, '_')}`;
      const { error } = await supabase.storage.from(BALDE).upload(path, foto, { upsert: false });
      if (error) throw error;
      expectRows(await supabase.from('assets').update({ foto_path: path } as never).eq('id', assetId).select('id'), 'o equipamento');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); toast.success('Foto salva.'); },
    onError: (e: Error) => toast.error(`Não salvou a foto: ${e.message}`),
  });

  if (!fotoPath && !podeTrocar) return null;
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" aria-hidden="true" />Foto do equipamento</p>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt="Foto do equipamento" className="max-h-48 rounded-md border border-border object-contain" />
        </a>
      )}
      {!fotoPath && <p className="text-xs text-muted-foreground">Sem foto. Tire na entrega, com o patrimônio aparecendo, para comparar na devolução.</p>}
      {podeTrocar && (
        <>
          <Button type="button" size="sm" variant="outline" disabled={enviar.isPending} onClick={() => arquivo.current?.click()}>
            {enviar.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Camera className="w-4 h-4 mr-1" />}
            {fotoPath ? 'Trocar foto' : 'Adicionar foto'}
          </Button>
          <input ref={arquivo} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) enviar.mutate(f); }} />
        </>
      )}
    </div>
  );
}

export function HistoricoDoEquipamento({ assetId }: { assetId: string }) {
  const { tenantId } = useAuth();
  const { data: linhas = [] } = useQuery({
    queryKey: ['historico-do-equipamento', tenantId, assetId],
    enabled: !!tenantId,
    queryFn: async () => (unwrap(await supabase.from('asset_historico' as never)
      .select('id, de, ate, pessoa:profiles!asset_historico_pessoa_id_fkey(full_name, email)')
      .eq('asset_id', assetId)
      .order('de', { ascending: false })) ?? []) as unknown as {
        id: string; de: string; ate: string | null; pessoa: { full_name: string | null; email: string } | null;
      }[],
  });
  if (linhas.length === 0) return null;
  return (
    <div className="mt-4 space-y-1.5">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5"><History className="w-3.5 h-3.5" aria-hidden="true" />Quem já teve</p>
      <ul className="text-sm space-y-1">
        {linhas.map((l) => (
          <li key={l.id} className="flex flex-wrap gap-x-2">
            <b>{l.pessoa?.full_name || l.pessoa?.email || 'Pessoa removida'}</b>
            <span className="text-muted-foreground">
              {format(new Date(l.de), 'dd/MM/yyyy')} → {l.ate ? format(new Date(l.ate), 'dd/MM/yyyy') : 'hoje'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
