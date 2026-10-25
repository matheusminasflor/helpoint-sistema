import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePessoasDaEmpresa } from '@/hooks/useProjetos';
import { usePedir } from '@/hooks/useSolicitacoes';
import { TIPOS, TIPOS_DE_ACESSO, type TipoDeSolicitacao } from '@/config/solicitacoes';
import { unwrap } from '@/lib/supabase-result';
import { todayISO } from '@/lib/dates';

const numeroDigitado = (t: string) => Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);

/**
 * O pedido (etapa 4b): o tipo vem primeiro, e só os campos dele (Hick, Tesler — nome, setor e gestor o sistema já
 * sabe). Ao enviar, abre o pedido com as etapas.
 */
export function NovoPedidoDialog({ tipo, onFechar, onEnviado }: {
  tipo: TipoDeSolicitacao; onFechar: () => void; onEnviado: (id: string) => void;
}) {
  const cfg = TIPOS[tipo];
  const { user, tenantId } = useAuth();
  const pedir = usePedir();
  const [titulo, setTitulo] = useState('');
  const [detalhes, setDetalhes] = useState('');
  const [valor, setValor] = useState('');
  const [precisoAte, setPrecisoAte] = useState('');
  const [tipoDeAcesso, setTipoDeAcesso] = useState('sistema');
  const [para, setPara] = useState('');
  const [anexos, setAnexos] = useState<File[]>([]);
  useEffect(() => { setPara(user?.id ?? ''); }, [user?.id]);

  // Acesso: o gestor também pede para alguém da equipe. A lista é de quem ele é gestor (a pergunta do banco).
  // ponytail: uma pergunta por pessoa da empresa (16 em 2026-10-25); com centenas, uma função que devolva a equipe.
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const { data: equipe = [] } = useQuery({
    queryKey: ['solicitacoes', 'minha-equipe', tenantId, user?.id, pessoas.length],
    enabled: cfg.tipoDeAcesso === true && pessoas.length > 0,
    queryFn: async () => {
      const sim = await Promise.all(pessoas.filter((p) => p.id !== user?.id).map(async (p) =>
        (unwrap(await supabase.rpc('sou_gestor_de' as never, { p_user: p.id } as never)) ? p : null)));
      return sim.filter((p): p is NonNullable<typeof p> => !!p);
    },
  });

  const numero = numeroDigitado(valor);
  const falta = !titulo.trim() ? cfg.rotuloDoTitulo.charAt(0).toLowerCase() + cfg.rotuloDoTitulo.slice(1)
    : cfg.valor && !(numero > 0) ? 'o valor'
    : cfg.anexoObrigatorio && anexos.length === 0 ? cfg.anexoObrigatorio.toLowerCase()
    : null;

  const enviar = () => pedir.mutate({
    tipo, titulo, detalhes,
    valor: cfg.valor ? numero : null,
    preciso_ate: cfg.precisoAte ? precisoAte || null : null,
    para_id: cfg.tipoDeAcesso ? para : null,
    dados: cfg.tipoDeAcesso ? { tipo_acesso: tipoDeAcesso } : {},
    anexos,
  }, { onSuccess: (n) => onEnviado(n.id) });

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cfg.rotulo}</DialogTitle>
          <DialogDescription>{cfg.descricao}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {cfg.tipoDeAcesso && equipe.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="sol-para">Para quem</Label>
              <select id="sol-para" value={para} onChange={(e) => setPara(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm">
                <option value={user?.id ?? ''}>Para mim</option>
                {equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          )}
          {cfg.tipoDeAcesso && (
            <div className="space-y-1.5">
              <Label htmlFor="sol-tipo-acesso">Tipo</Label>
              <select id="sol-tipo-acesso" value={tipoDeAcesso} onChange={(e) => setTipoDeAcesso(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm">
                {TIPOS_DE_ACESSO.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="sol-titulo">{cfg.rotuloDoTitulo} *</Label>
            <Input id="sol-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={cfg.dicaDoTitulo} autoFocus />
          </div>
          {cfg.valor && (
            <div className="space-y-1.5">
              <Label htmlFor="sol-valor">Valor (R$) *</Label>
              <Input id="sol-valor" inputMode="decimal" className="w-40 tabular-nums" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
          )}
          {cfg.precisoAte && (
            <div className="space-y-1.5">
              <Label htmlFor="sol-ate">Preciso até</Label>
              <Input id="sol-ate" type="date" min={todayISO()} className="w-48" value={precisoAte} onChange={(e) => setPrecisoAte(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="sol-detalhes">Detalhes <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea id="sol-detalhes" rows={3} value={detalhes} onChange={(e) => setDetalhes(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sol-anexos">{cfg.anexoObrigatorio ? `${cfg.anexoObrigatorio} *` : 'Anexos (opcional)'}</Label>
            <Input id="sol-anexos" type="file" multiple onChange={(e) => setAnexos(Array.from(e.target.files ?? []))} />
          </div>
        </div>
        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {falta && <p className="text-[13px] text-muted-foreground sm:mr-auto">Falta {falta}.</p>}
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!!falta || pedir.isPending} onClick={enviar}>{pedir.isPending ? 'Enviando…' : 'Enviar pedido'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
