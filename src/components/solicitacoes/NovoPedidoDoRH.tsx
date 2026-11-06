// Os assuntos do RH com formulário próprio (RH 100% por Solicitações, dono, 2026-11-06). Férias e atestado gravam nas tabelas
// do RH, e o banco abre o pedido; RH › Aprovações decide. Os campos vieram dos formulários que esses assuntos tinham no chamado.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdmissionAccessEditor } from '@/components/helpdesk/AdmissionAccessEditor';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TIPOS, type TipoDeSolicitacao } from '@/config/solicitacoes';
import { useAuth } from '@/contexts/AuthContext';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useBatchCreateAccessGrants, type NewAccessGrant } from '@/hooks/useEmployeeAccessGrants';
import { useCreateVacationRequest, useUploadCertificate } from '@/hooks/useMeuRH';
import { usePessoasDaEmpresa } from '@/hooks/useProjetos';
import { usePedir } from '@/hooks/useSolicitacoes';
import { supabase } from '@/integrations/supabase/client';
import { todayISO } from '@/lib/dates';
import { unwrap } from '@/lib/supabase-result';


const OCORRENCIAS = ['Esqueci de bater', 'Batida errada', 'Outro'];
const CLASSE_DO_SELECT = 'h-10 w-full rounded-md border border-border bg-background px-2 text-sm';
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function SimOuNao({ id, rotulo, valor, onValor }: { id: string; rotulo: string; valor: string; onValor: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo} *</Label>
      <select id={id} value={valor} onChange={(e) => onValor(e.target.value)} className={CLASSE_DO_SELECT}>
        <option value="">Escolha…</option>
        <option>Sim</option>
        <option>Não</option>
      </select>
    </div>
  );
}

export function NovoPedidoDoRH({ tipo, onFechar, onEnviado }: {
  tipo: TipoDeSolicitacao; onFechar: () => void; onEnviado: (id: string) => void;
}) {
  const cfg = TIPOS[tipo];
  const { user, tenantId } = useAuth();
  const pedir = usePedir();
  const criarFerias = useCreateVacationRequest();
  const enviarAtestado = useUploadCertificate();
  const criarAcessos = useBatchCreateAccessGrants();
  const { can } = useDepartmentPermissions('rh');

  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [vender, setVender] = useState('');
  const [adiantar, setAdiantar] = useState('');
  const [dias, setDias] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ocorrencia, setOcorrencia] = useState('');
  const [horario, setHorario] = useState('');
  const [colaborador, setColaborador] = useState('');
  const [acessos, setAcessos] = useState<NewAccessGrant[]>([]);
  const [detalhes, setDetalhes] = useState('');

  const daPessoa = tipo === 'rh_admissao' || tipo === 'rh_desligamento';
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  // ponytail: uma pergunta por pessoa da empresa, como no pedido de acesso. Com centenas, uma função que devolva a equipe.
  const { data: equipe = [] } = useQuery({
    queryKey: ['solicitacoes', 'colaboradores-do-pedido', tenantId, user?.id, pessoas.length, can('solicitacoes', 'decidir')],
    enabled: daPessoa && pessoas.length > 0,
    queryFn: async () => {
      if (can('solicitacoes', 'decidir')) return pessoas;
      const sim = await Promise.all(pessoas.map(async (p) =>
        (unwrap(await supabase.rpc('sou_gestor_de' as never, { p_user: p.id } as never)) ? p : null)));
      return sim.filter((p): p is NonNullable<typeof p> => !!p);
    },
  });
  const nomeDoColaborador = equipe.find((p) => p.id === colaborador)?.nome ?? '';

  const diasDoAtestado = Number(dias);
  const falta = tipo === 'rh_ferias'
    ? (!inicio ? 'o início das férias' : !fim || fim < inicio ? 'o fim das férias' : !vender ? 'dizer se vende 1/3' : !adiantar ? 'dizer se adianta o 13º' : null)
    : tipo === 'rh_atestado'
      ? (!inicio ? 'a data do atestado' : !(diasDoAtestado > 0) ? 'quantos dias' : !arquivo ? 'o atestado' : null)
      : tipo === 'rh_ponto'
        ? (!inicio ? 'o dia' : !ocorrencia ? 'o que aconteceu' : null)
        : (!colaborador ? 'escolher o colaborador' : null);
  const enviando = pedir.isPending || criarFerias.isPending || enviarAtestado.isPending || criarAcessos.isPending;

  const enviar = () => {
    if (tipo === 'rh_ferias') {
      criarFerias.mutate({
        start_date: inicio, end_date: fim, type: 'ferias',
        notes: [`Vender 1/3: ${vender}`, `Adiantar a 1ª parcela do 13º: ${adiantar}`, detalhes.trim()].filter(Boolean).join('\n'),
      }, { onSuccess: (r) => onEnviado((r as unknown as { solicitacao_id: string }).solicitacao_id) });
    } else if (tipo === 'rh_atestado') {
      enviarAtestado.mutate({ file: arquivo!, issue_date: inicio, days_off: diasDoAtestado },
        { onSuccess: (r) => onEnviado((r as unknown as { solicitacao_id: string }).solicitacao_id) });
    } else if (tipo === 'rh_ponto') {
      pedir.mutate({
        tipo, titulo: `Ponto · ${dataCurta(inicio)} · ${ocorrencia}`,
        detalhes: [horario.trim() && `Horário certo: ${horario.trim()}`, detalhes.trim()].filter(Boolean).join('\n'),
        dados: { dia: inicio, ocorrencia, horario: horario.trim() || null }, anexos: [],
      }, { onSuccess: (n) => onEnviado(n.id) });
    } else {
      pedir.mutate({
        tipo, titulo: `${cfg.rotulo} · ${nomeDoColaborador}`, detalhes,
        dados: { colaborador_id: colaborador, colaborador_nome: nomeDoColaborador }, anexos: [],
      }, {
        onSuccess: async (n) => {
          const validos = acessos.filter((g) => g.name.trim());
          if (tipo === 'rh_admissao' && validos.length > 0) {
            await criarAcessos.mutateAsync({ employeeId: colaborador, employeeName: nomeDoColaborador, grants: validos });
          }
          onEnviado(n.id);
        },
      });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cfg.rotulo}</DialogTitle>
          <DialogDescription>{cfg.descricao}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {tipo === 'rh_ferias' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="rh-inicio">Início das férias *</Label>
                  <Input id="rh-inicio" type="date" min={todayISO()} value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="rh-fim">Fim das férias *</Label>
                  <Input id="rh-fim" type="date" min={inicio || todayISO()} value={fim} onChange={(e) => setFim(e.target.value)} /></div>
              </div>
              <SimOuNao id="rh-vender" rotulo="Vender 1/3 das férias?" valor={vender} onValor={setVender} />
              <SimOuNao id="rh-adiantar" rotulo="Adiantar a 1ª parcela do 13º?" valor={adiantar} onValor={setAdiantar} />
            </>
          )}
          {tipo === 'rh_atestado' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="rh-data">Data do atestado *</Label>
                  <Input id="rh-data" type="date" max={todayISO()} value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="rh-dias">Quantos dias *</Label>
                  <Input id="rh-dias" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="rh-arquivo">O atestado (foto ou PDF) *</Label>
                <Input id="rh-arquivo" type="file" accept="image/*,application/pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} /></div>
            </>
          )}
          {tipo === 'rh_ponto' && (
            <>
              <div className="space-y-1.5"><Label htmlFor="rh-dia">Dia *</Label>
                <Input id="rh-dia" type="date" max={todayISO()} className="w-48" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="rh-ocorrencia">O que aconteceu *</Label>
                <select id="rh-ocorrencia" value={ocorrencia} onChange={(e) => setOcorrencia(e.target.value)} className={CLASSE_DO_SELECT}>
                  <option value="">Escolha…</option>
                  {OCORRENCIAS.map((o) => <option key={o}>{o}</option>)}
                </select></div>
              <div className="space-y-1.5"><Label htmlFor="rh-horario">Horário certo <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Input id="rh-horario" value={horario} onChange={(e) => setHorario(e.target.value)} placeholder="Ex.: entrada às 08:02" /></div>
            </>
          )}
          {daPessoa && (
            <div className="space-y-1.5">
              <Label htmlFor="rh-colaborador">{tipo === 'rh_desligamento' ? 'Colaborador que está saindo *' : 'Colaborador que está entrando *'}</Label>
              <select id="rh-colaborador" value={colaborador} onChange={(e) => setColaborador(e.target.value)} className={CLASSE_DO_SELECT}>
                <option value="">Escolha…</option>
                {[...equipe].sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              {equipe.length === 0 && <p className="text-[13px] text-muted-foreground">Este pedido é feito pelo gestor da pessoa ou pelo RH.</p>}
              {tipo === 'rh_desligamento' && (
                <p className="text-[13px] text-muted-foreground">
                  A TI recebe um chamado com tudo o que está no nome da pessoa, para conferir a devolução de cada equipamento.
                </p>
              )}
            </div>
          )}
          {tipo === 'rh_admissao' && <AdmissionAccessEditor value={acessos} onChange={setAcessos} />}
          {tipo !== 'rh_atestado' && (
            <div className="space-y-1.5">
              <Label htmlFor="rh-detalhes">Detalhes <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Textarea id="rh-detalhes" rows={3} value={detalhes} onChange={(e) => setDetalhes(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {falta && <p className="text-[13px] text-muted-foreground sm:mr-auto">Falta {falta}.</p>}
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!!falta || enviando} onClick={enviar}>{enviando ? 'Enviando…' : 'Enviar pedido'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
