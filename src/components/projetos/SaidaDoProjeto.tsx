// Sair do projeto (dono, 2026-11-02; docs/especificacao-projetos.md › Sair do projeto; 20270212200100).
//   · `SairDoProjeto`: o botão para quem foi chamado. Motivo obrigatório; com atividade aberta o banco recusa e diz
//     quantas são — a tela mostra a frase dele.
//   · `SaidasPendentes`: para quem criou (ou comanda) o projeto, cada saída ainda não resolvida, com o motivo, e as
//     duas saídas: chamar de volta ou escolher quem assume.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, UserPlus, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTenantPath } from '@/hooks/useTenantPath';
import { usePessoasDaEmpresa, useResolverSaida, useSaidasPendentes, useSairDoProjeto } from '@/hooks/useProjetos';
import { diaCurto, toLocalISODate } from '@/lib/dates';
import { mensagemDeErro } from '@/lib/supabase-result';

export function SairDoProjeto({ projectId, nome }: { projectId: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const sair = useSairDoProjeto();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const enviar = () => sair.mutate({ projectId, motivo: motivo.trim() }, {
    onSuccess: () => { toast.success('Você saiu do projeto. Quem criou foi avisado.'); navigate(tenantPath('/projetos')); },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}><LogOut className="w-4 h-4 mr-1.5" />Sair do projeto</Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sair do projeto "{nome}"?</DialogTitle>
            <DialogDescription>
              Quem criou o projeto será avisado com o motivo e escolhe quem assume no seu lugar. Só dá para sair sem
              tarefa aberta no projeto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-saida">Por que você está saindo?</Label>
            <Textarea id="motivo-saida" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: não participo dessa frente; fui marcado por engano." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={enviar} disabled={motivo.trim().length < 5 || sair.isPending}>Sair do projeto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SaidasPendentes({ projectId, quemComanda }: { projectId: string; quemComanda: boolean }) {
  const { data: saidas = [] } = useSaidasPendentes(projectId, quemComanda);
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const resolver = useResolverSaida(projectId);
  const [escolhido, setEscolhido] = useState<Record<string, string>>({});
  if (!quemComanda || saidas.length === 0) return null;

  const fazer = (saida: string, resolucao: 'voltou' | 'substituido') => resolver.mutate(
    { saida, resolucao, substituto: resolucao === 'substituido' ? escolhido[saida] : undefined },
    {
      onSuccess: () => toast.success(resolucao === 'voltou' ? 'Chamado de volta. A pessoa foi avisada.' : 'Pronto: quem assume entrou no projeto e foi avisado.'),
      onError: (e) => toast.error(mensagemDeErro(e)),
    },
  );

  return (
    <div className="mb-5 space-y-2" role="list" aria-label="Pessoas que saíram do projeto">
      {saidas.map((s) => (
        <div key={s.id} role="listitem" className="rounded-lg border border-status-warning/40 bg-status-warning/10 p-4 space-y-3">
          <p className="text-[14px]">
            <b>{s.nome}</b> saiu do projeto em {diaCurto(toLocalISODate(new Date(s.saiu_em)))}. Motivo: <i>"{s.motivo}"</i>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={escolhido[s.id] ?? ''} onValueChange={(v) => setEscolhido((e) => ({ ...e, [s.id]: v }))}>
              <SelectTrigger className="w-[240px] h-9" aria-label="Quem assume no lugar"><SelectValue placeholder="Quem assume no lugar…" /></SelectTrigger>
              <SelectContent>
                {pessoas.filter((p) => p.id !== s.user_id).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!escolhido[s.id] || resolver.isPending} onClick={() => fazer(s.id, 'substituido')}>
              <UserPlus className="w-4 h-4 mr-1.5" />Assume no lugar
            </Button>
            <Button size="sm" variant="outline" disabled={resolver.isPending} onClick={() => fazer(s.id, 'voltou')}>
              <Undo2 className="w-4 h-4 mr-1.5" />Chamar de volta
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
