// A ficha do salão (etapa 6): a etapa do funil, o contato (só do distribuidor e da equipe), as visitas e as vendas.
// R5: editar o salão (e o vendedor dele, pelo responsável), apagar o que não tem venda (o que tem vira "Perdido" —
// decisão do dono de 2026-10-26), "fiz a visita" sem precisar ter marcado, remarcar e cancelar a visita, o histórico
// das feitas, e corrigir ou apagar a venda.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Pencil, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmarExclusao } from '@/components/ui/ConfirmarExclusao';
import { AcoesDaVisita } from '@/components/distribuidor/AcoesDaVisita';
import { useAuth } from '@/contexts/AuthContext';
import { useNoPortal } from '@/hooks/useNoPortal';
import {
  ETAPAS_DO_SALAO, useAgendarVisita, useApagarSalao, useApagarVenda, useMudarSalao, usePessoasDaEquipe, useRegistrarVisitaFeita, useSalao,
  useSalvarContato, type ContatoDoSalao, type Salao, type VendaAoSalao,
} from '@/hooks/usePortalDoDistribuidor';
import { dataHora, diaCurto, fromLocalDateTimeInput } from '@/lib/dates';
import { mensagemDeErro } from '@/lib/supabase-result';
import { formatBRL } from '@/types/financeiro';
import { cn } from '@/lib/utils';

export default function SalaoDoDistribuidor() {
  const { id } = useParams();
  const { data, isLoading, error } = useSalao(id);
  const mudar = useMudarSalao();
  const [editando, setEditando] = useState(false);
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" aria-label="Carregando" /></div>;
  if (error) return <p className="text-[14px] text-status-danger">{mensagemDeErro(error)}</p>;
  if (!data?.salao) return <p className="text-[14px] text-muted-foreground">Salão não encontrado na sua carteira.</p>;
  const { salao, contatos, visitas, vendas } = data;
  const marcadas = visitas.filter((v) => !v.feita_em).sort((a, b) => a.quando.localeCompare(b.quando));
  const feitas = visitas.filter((v) => v.feita_em);
  return (
    <>
      <Link to="/distribuidor/saloes" className="inline-flex items-center gap-1 text-[14px] text-muted-foreground h-10">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Salões
      </Link>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h1 className="text-[24px] font-semibold">{salao.nome}</h1>
          <p className="text-[14px] text-muted-foreground">{[salao.endereco, [salao.cidade, salao.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')}</p>
          {salao.observacao && <p className="text-[14px] mt-1 whitespace-pre-line">{salao.observacao}</p>}
        </div>
        <Button variant="outline" className="h-11 gap-1.5 shrink-0" onClick={() => setEditando(true)}>
          <Pencil className="w-4 h-4" aria-hidden="true" /> Editar
        </Button>
      </div>
      <Card className="p-4 space-y-2">
        <h2 className="text-[16px] font-semibold">Etapa</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Etapa do funil">
          {ETAPAS_DO_SALAO.map((e) => (
            <button key={e.etapa} type="button" aria-pressed={salao.etapa === e.etapa} disabled={mudar.isPending}
              onClick={() => salao.etapa !== e.etapa && mudar.mutate({ id: salao.id, etapa: e.etapa })}
              className={cn('px-3 h-10 rounded-full border text-[14px]',
                salao.etapa === e.etapa ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground')}>
              {e.rotulo}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground">Nesta etapa desde {diaCurto(salao.etapa_desde)}.</p>
      </Card>
      <Button asChild className="w-full h-12 text-base"><Link to={`/distribuidor/vender?salao=${salao.id}`}>Registrar venda</Link></Button>
      <Contato salaoId={salao.id} contato={contatos[0]} />
      <Card className="p-4 space-y-3">
        <h2 className="text-[16px] font-semibold">Visitas</h2>
        <FizAVisita salaoId={salao.id} />
        <AgendarVisita salaoId={salao.id} />
        {marcadas.length > 0 && (
          <div>
            <h3 className="text-[14px] font-semibold text-muted-foreground">Marcadas</h3>
            <ul className="divide-y divide-border">
              {marcadas.map((v) => (
                <AcoesDaVisita key={v.id} v={v}><p className="text-[15px]">{dataHora(v.quando)}</p></AcoesDaVisita>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h3 className="text-[14px] font-semibold text-muted-foreground">Feitas</h3>
          {feitas.length === 0 ? <p className="text-[14px] text-muted-foreground">Nenhuma visita feita ainda.</p> : (
            <ul className="divide-y divide-border">
              {feitas.map((v) => (
                <li key={v.id} className="py-2">
                  <p className="text-[15px]">{dataHora(v.feita_em!)}</p>
                  {v.resultado && <p className="text-[14px] text-muted-foreground whitespace-pre-line">{v.resultado}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      <Card className="p-4">
        <h2 className="text-[16px] font-semibold mb-2">Vendas</h2>
        {vendas.length === 0 ? <p className="text-[14px] text-muted-foreground">Nenhuma venda registrada.</p> : (
          <ul className="divide-y divide-border">{vendas.map((v) => <LinhaDaVenda key={v.id} v={v} />)}</ul>
        )}
      </Card>
      {editando && <EditarSalaoDialog salao={salao} temVenda={vendas.length > 0} fechar={() => setEditando(false)} />}
    </>
  );
}

function LinhaDaVenda({ v }: { v: VendaAoSalao }) {
  const { papel } = useNoPortal();
  const { user } = useAuth();
  const apagar = useApagarVenda();
  const [confirmar, setConfirmar] = useState(false);
  const pode = papel === 'dono' || v.vendedor_id === user?.id;
  return (
    <li className="py-2 space-y-1">
      <div className="flex gap-3">
        <span className="flex-1 min-w-0">
          <span className="block text-[15px]">{diaCurto(v.data)}</span>
          <span className="block text-[13px] text-muted-foreground">{v.itens.map((i) => `${i.quantidade}× ${i.produto_nome}`).join(', ')}</span>
        </span>
        <span className="text-[15px] font-semibold tabular-nums">{formatBRL(Number(v.total))}</span>
      </div>
      {pode && (
        <div className="flex gap-2">
          <Button asChild variant="ghost" className="h-10"><Link to={`/distribuidor/vender?venda=${v.id}`}>Corrigir</Link></Button>
          <Button variant="ghost" className="h-10 text-status-danger" onClick={() => setConfirmar(true)}>Apagar</Button>
        </div>
      )}
      <ConfirmarExclusao aberto={confirmar} titulo="Apagar a venda?" enviando={apagar.isPending}
        descricao={`A venda de ${diaCurto(v.data)} (${formatBRL(Number(v.total))}) some, e os produtos voltam para o seu estoque.`}
        onCancelar={() => setConfirmar(false)} onConfirmar={() => apagar.mutate(v.id, { onSuccess: () => setConfirmar(false) })} />
    </li>
  );
}

function EditarSalaoDialog({ salao, temVenda, fechar }: { salao: Salao; temVenda: boolean; fechar: () => void }) {
  const { papel } = useNoPortal();
  const navigate = useNavigate();
  const mudar = useMudarSalao();
  const apagar = useApagarSalao();
  const pessoas = usePessoasDaEquipe();
  const [confirmar, setConfirmar] = useState(false);
  const [f, setF] = useState({ nome: salao.nome, cidade: salao.cidade ?? '', uf: salao.uf ?? '', endereco: salao.endereco ?? '',
    observacao: salao.observacao ?? '', responsavel_id: salao.responsavel_id });
  const campo = (k: 'nome' | 'cidade' | 'uf' | 'endereco', rotulo: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="space-y-1.5">
      <Label htmlFor={`e-${k}`}>{rotulo}</Label>
      <Input id={`e-${k}`} className="h-11 text-base" value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} {...extra} />
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar salão</DialogTitle>
          <DialogDescription>O contato (nome e telefone) se edita na ficha, no quadro Contato.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" id="editar-salao" onSubmit={(e) => {
          e.preventDefault();
          mudar.mutate({ id: salao.id, nome: f.nome.trim(), cidade: f.cidade.trim() || null, uf: f.uf.trim().toUpperCase() || null,
            endereco: f.endereco.trim() || null, observacao: f.observacao.trim() || null, responsavel_id: f.responsavel_id },
          { onSuccess: fechar });
        }}>
          {campo('nome', 'Nome do salão', { required: true })}
          <div className="grid grid-cols-[1fr_80px] gap-3">{campo('cidade', 'Cidade')}{campo('uf', 'UF', { maxLength: 2 })}</div>
          {campo('endereco', 'Endereço')}
          <div className="space-y-1.5">
            <Label htmlFor="e-obs">Observação</Label>
            <Textarea id="e-obs" rows={3} value={f.observacao} onChange={(e) => setF((p) => ({ ...p, observacao: e.target.value }))} />
          </div>
          {pessoas.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="e-resp">Quem atende este salão</Label>
              <select id="e-resp" className="h-11 w-full rounded-md border border-input bg-background px-3 text-base" value={f.responsavel_id}
                onChange={(e) => setF((p) => ({ ...p, responsavel_id: e.target.value }))}>
                {pessoas.map((m) => <option key={m.id} value={m.user_id!}>{m.nome || m.email}{m.papel === 'dono' ? ' (você)' : ''}</option>)}
              </select>
            </div>
          )}
        </form>
        {papel === 'dono' && (
          <p className="text-[13px] text-muted-foreground">
            {temVenda
              ? 'Este salão tem vendas registradas e não se apaga: se ele deixou de comprar, mude a etapa para Perdido.'
              : <>Cadastro errado ou repetido? <button type="button" className="underline text-status-danger min-h-11" onClick={() => setConfirmar(true)}>Apagar o salão</button></>}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>Voltar</Button>
          <Button type="submit" form="editar-salao" disabled={mudar.isPending || !f.nome.trim()}>Salvar</Button>
        </DialogFooter>
        <ConfirmarExclusao aberto={confirmar} titulo={`Apagar ${salao.nome}?`} enviando={apagar.isPending}
          descricao="O salão some da sua carteira, com o contato e as visitas dele."
          onCancelar={() => setConfirmar(false)}
          onConfirmar={() => apagar.mutate(salao.id, { onSuccess: () => navigate('/distribuidor/saloes') })} />
      </DialogContent>
    </Dialog>
  );
}

function Contato({ salaoId, contato }: { salaoId: string; contato?: ContatoDoSalao }) {
  const { distribuidor } = useNoPortal();
  const salvar = useSalvarContato();
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ nome: contato?.nome ?? '', telefone: contato?.telefone ?? '' });
  return (
    <Card className="p-4 space-y-2">
      <h2 className="text-[16px] font-semibold">Contato</h2>
      {!editando ? (
        <div className="flex items-center gap-3">
          <p className="flex-1 text-[15px]">{contato ? [contato.nome, contato.telefone].filter(Boolean).join(' · ') : 'Sem contato.'}</p>
          {contato?.telefone && (
            <Button asChild variant="outline" size="icon" className="h-11 w-11" aria-label={`Ligar para ${contato.telefone}`}>
              <a href={`tel:${contato.telefone.replace(/[^\d+]/g, '')}`}><Phone className="w-4 h-4" aria-hidden="true" /></a>
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={() => setEditando(true)}>{contato ? 'Editar' : 'Adicionar'}</Button>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate({ id: contato?.id, salao_id: salaoId, distribuidor_id: distribuidor.id, ...f }, { onSuccess: () => setEditando(false) });
        }}>
          <div className="space-y-1.5"><Label htmlFor="c-nome">Nome</Label>
            <Input id="c-nome" className="h-11 text-base" value={f.nome} onChange={(e) => setF((p) => ({ ...p, nome: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor="c-tel">Telefone</Label>
            <Input id="c-tel" className="h-11 text-base" inputMode="tel" value={f.telefone} onChange={(e) => setF((p) => ({ ...p, telefone: e.target.value }))} /></div>
          <div className="flex gap-2">
            <Button type="submit" className="h-11" disabled={salvar.isPending || (!f.nome.trim() && !f.telefone.trim())}>Salvar</Button>
            <Button type="button" variant="outline" className="h-11" onClick={() => setEditando(false)}>Voltar</Button>
          </div>
        </form>
      )}
      <p className="text-[12px] text-muted-foreground">Só você e a sua equipe veem o contato.</p>
    </Card>
  );
}

// "Fiz a visita" sem ter marcado antes: passou no salão, registra na hora.
function FizAVisita({ salaoId }: { salaoId: string }) {
  const { distribuidor } = useNoPortal();
  const registrar = useRegistrarVisitaFeita();
  const [aberto, setAberto] = useState(false);
  const [resultado, setResultado] = useState('');
  if (!aberto) return <Button className="w-full h-11" variant="outline" onClick={() => setAberto(true)}>Fiz uma visita agora</Button>;
  return (
    <div className="space-y-2">
      <Textarea rows={2} placeholder="Como foi? (deixou amostra, vai testar, comprou…)" aria-label="Como foi a visita"
        value={resultado} onChange={(e) => setResultado(e.target.value)} />
      <div className="flex gap-2">
        <Button className="h-11" disabled={registrar.isPending} onClick={() => registrar.mutate(
          { distribuidor_id: distribuidor.id, salao_id: salaoId, resultado },
          { onSuccess: () => { setAberto(false); setResultado(''); } })}>Registrar</Button>
        <Button variant="outline" className="h-11" onClick={() => setAberto(false)}>Voltar</Button>
      </div>
    </div>
  );
}

function AgendarVisita({ salaoId }: { salaoId: string }) {
  const { distribuidor } = useNoPortal();
  const agendar = useAgendarVisita();
  const [quando, setQuando] = useState('');
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
      e.preventDefault();
      agendar.mutate({ distribuidor_id: distribuidor.id, salao_id: salaoId, quando: fromLocalDateTimeInput(quando) },
        { onSuccess: () => setQuando('') });
    }}>
      <div className="space-y-1.5 flex-1 min-w-[200px]">
        <Label htmlFor="v-quando">Agendar visita</Label>
        <Input id="v-quando" type="datetime-local" className="h-11 text-base" value={quando} onChange={(e) => setQuando(e.target.value)} required />
      </div>
      <Button type="submit" variant="outline" className="h-11" disabled={!quando || agendar.isPending}>Agendar</Button>
    </form>
  );
}
