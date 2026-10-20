// TI › Termos de responsabilidade (dono, 2026-10-20): "seleciono o usuário, clico em gerar e já puxa o modelo"; o
// termo assinado é anexado e o equipamento fica atrelado a ele. Gerar: pessoa → dados do RH (completa o que faltar) →
// equipamentos dela no Inventário + cadastro rápido → PDF no modelo do dono. Depois: anexar o assinado e, quando o
// equipamento voltar, registrar a devolução (volta ao estoque).
import { useEffect, useMemo, useState } from 'react';
import { FileDown, FileSignature, Paperclip, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useAuth } from '@/contexts/AuthContext';
import { usePessoasDaEmpresa } from '@/hooks/useProjetos';
import {
  urlDoTermoAssinado, useAnexarTermoAssinado, useDadosParaTermo, useDevolverTermo, useEquipamentosDaPessoa, useGerarTermo,
  useTermos, type ItemDoTermo, type Termo,
} from '@/hooks/useTermos';
import { EMPRESA_PADRAO, gerarTermoPdf, nomeDoArquivoDoTermo } from '@/lib/termo-equipamento-pdf';
import { todayISO } from '@/lib/dates';
import { useTICategories } from '@/hooks/useTICategories';
import { formatDateBR } from '@/types/financeiro';

const SITUACAO: Record<Termo['status'], { rotulo: string; classe: string }> = {
  aguardando_assinatura: { rotulo: 'Aguardando assinatura', classe: 'badge-warning' },
  assinado: { rotulo: 'Assinado', classe: 'badge-success' },
  devolvido: { rotulo: 'Devolvido', classe: 'badge-neutral' },
};

const baixar = (t: Pick<Termo, 'empresa' | 'colaborador_nome' | 'cpf' | 'matricula' | 'setor' | 'responsavel_nome' | 'itens'>) =>
  gerarTermoPdf(t).save(nomeDoArquivoDoTermo(t.colaborador_nome));

export default function TermosDeResponsabilidade() {
  const { can } = useDepartmentPermissions('ti');
  const { data: termos = [], isLoading } = useTermos();
  const anexar = useAnexarTermoAssinado();
  const [gerando, setGerando] = useState(false);
  const [devolvendo, setDevolvendo] = useState<Termo | null>(null);

  const abrirAssinado = async (path: string) => {
    const url = await urlDoTermoAssinado(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Termos de responsabilidade" icon={FileSignature}
        description="O termo de entrega de equipamento de cada colaborador: gere no modelo da empresa, anexe o assinado e registre a devolução."
        actions={can('termos', 'create') && (
          <Button onClick={() => setGerando(true)}><Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />Gerar termo</Button>
        )} />
      <div className="p-4 lg:p-6">
        <Card className="overflow-hidden">
          {isLoading ? <Skeleton className="h-40 w-full" /> : termos.length === 0 ? (
            <EmptyState icon={FileSignature} title="Nenhum termo ainda"
              description='Clique em "Gerar termo", escolha o colaborador e os equipamentos.' />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Colaborador</th>
                    <th className="px-3 py-2 font-semibold">Equipamentos</th>
                    <th className="px-3 py-2 font-semibold">Gerado em</th>
                    <th className="px-3 py-2 font-semibold">Situação</th>
                    <th className="px-3 py-2 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {termos.map((t) => (
                    <tr key={t.id} className="border-b border-border align-top">
                      <td className="px-3 py-2">
                        <span className="font-medium">{t.colaborador_nome}</span>
                        {t.setor && <span className="block text-[12px] text-muted-foreground">{t.setor}</span>}
                      </td>
                      <td className="px-3 py-2">
                        {t.itens.map((i) => (
                          <span key={i.id} className="block">{i.descricao}{i.patrimonio ? <span className="text-muted-foreground"> · nº {i.patrimonio}</span> : null}</span>
                        ))}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{formatDateBR(t.created_at)}</td>
                      <td className="px-3 py-2">
                        <Badge className={SITUACAO[t.status].classe}>{SITUACAO[t.status].rotulo}</Badge>
                        {t.status === 'devolvido' && t.devolvido_em && (
                          <span className="block text-[12px] text-muted-foreground">em {formatDateBR(t.devolvido_em)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => baixar(t)}>
                            <FileDown className="w-4 h-4 mr-1" aria-hidden="true" />PDF
                          </Button>
                          {t.assinado_path ? (
                            <Button variant="outline" size="sm" onClick={() => abrirAssinado(t.assinado_path!)}>
                              <Paperclip className="w-4 h-4 mr-1" aria-hidden="true" />Assinado
                            </Button>
                          ) : can('termos', 'edit') && t.status !== 'devolvido' && (
                            <label className="inline-flex">
                              <span className="inline-flex items-center h-8 px-3 rounded-md border border-border text-[13px] font-medium cursor-pointer hover:bg-muted">
                                <Paperclip className="w-4 h-4 mr-1" aria-hidden="true" />{anexar.isPending ? 'Enviando…' : 'Anexar assinado'}
                              </span>
                              <input type="file" accept="application/pdf,image/*" className="sr-only" disabled={anexar.isPending}
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) anexar.mutate({ termoId: t.id, arquivo: f }); e.target.value = ''; }} />
                            </label>
                          )}
                          {can('termos', 'edit') && t.status !== 'devolvido' && (
                            <Button variant="outline" size="sm" onClick={() => setDevolvendo(t)}>
                              <RotateCcw className="w-4 h-4 mr-1" aria-hidden="true" />Devolução
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      {gerando && <GerarTermo onFechar={() => setGerando(false)} />}
      {devolvendo && <RegistrarDevolucao termo={devolvendo} onFechar={() => setDevolvendo(null)} />}
    </div>
  );
}

type Linha = ItemDoTermo & { chave: string; marcado: boolean };

function GerarTermo({ onFechar }: { onFechar: () => void }) {
  const { profile } = useAuth();
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const gerar = useGerarTermo();
  const [pessoa, setPessoa] = useState('');
  const { data: dados } = useDadosParaTermo(pessoa || null);
  const { data: doInventario } = useEquipamentosDaPessoa(pessoa || null);
  const [form, setForm] = useState({ nome: '', cpf: '', matricula: '', setor: '', empresa: EMPRESA_PADRAO, responsavel: profile?.full_name ?? '', local: '' });
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const { rootCategories: categoriasDoInventario } = useTICategories('inventory');

  // Escolheu a pessoa: o que o RH sabe preenche; o que ela já tem no Inventário vem marcado.
  useEffect(() => {
    if (!pessoa) return;
    const nome = pessoas.find((p) => p.id === pessoa)?.nome ?? '';
    setForm((f) => ({ ...f, nome: dados?.nome ?? nome, cpf: dados?.cpf ?? '', matricula: dados?.matricula ?? '',
      setor: dados?.setor ?? '', empresa: dados?.empresa ?? f.empresa }));
  }, [pessoa, dados, pessoas]);
  useEffect(() => {
    setLinhas((ls) => [
      ...(doInventario ?? []).map((a) => ({
        chave: a.id, asset_id: a.id, marcado: true, descricao: a.name,
        marca_modelo: [a.manufacturer, a.model].filter(Boolean).join(' / ') || null, patrimonio: a.asset_tag, estado: 'Em uso',
      })),
      ...ls.filter((l) => !l.asset_id),
    ]);
  }, [doInventario]);

  const escolhidos = linhas.filter((l) => l.marcado && l.descricao.trim());
  const valido = !!pessoa && form.nome.trim() !== '' && form.empresa.trim() !== '' && escolhidos.length > 0;
  const muda = (chave: string, campo: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...campo } : l)));
  const ordenadas = useMemo(() => [...pessoas].sort((a, b) => a.nome.localeCompare(b.nome)), [pessoas]);

  const salvar = () => {
    const itens = escolhidos.map(({ asset_id, descricao, marca_modelo, marca, modelo, categoria, patrimonio, estado }) => ({
      asset_id: asset_id ?? null, descricao, categoria: categoria ?? null, marca: marca ?? null, modelo: modelo ?? null, patrimonio, estado,
      // A coluna "Marca / Modelo" do PDF.
      marca_modelo: asset_id ? marca_modelo : [marca, modelo].map((v) => v?.trim()).filter(Boolean).join(' / ') || null,
    }));
    const termo = {
      colaborador_id: pessoa, colaborador_nome: form.nome, cpf: form.cpf || null, matricula: form.matricula || null,
      setor: form.setor || null, empresa: form.empresa, responsavel_nome: form.responsavel || null, local: form.local || null,
    };
    gerar.mutate({ termo, itens }, {
      onSuccess: () => { baixar({ ...termo, itens }); onFechar(); },
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Gerar termo de responsabilidade</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="termo-pessoa">Colaborador *</Label>
            <select id="termo-pessoa" value={pessoa} onChange={(e) => { setPessoa(e.target.value); setLinhas((ls) => ls.filter((l) => !l.asset_id)); }}
              className="h-9 w-full max-w-sm rounded-md border border-border bg-background px-2 text-sm">
              <option value="">Escolha…</option>
              {ordenadas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          {pessoa && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {([['nome', 'Nome completo *'], ['cpf', 'CPF'], ['matricula', 'Matrícula'], ['setor', 'Setor'],
                  ['empresa', 'Empresa *'], ['responsavel', 'Quem assina pela empresa']] as const).map(([k, r]) => (
                  <div key={k} className="space-y-1">
                    <Label htmlFor={`termo-${k}`}>{r}</Label>
                    <Input id={`termo-${k}`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Vem do cadastro do RH quando existe. CPF e matrícula preenchidos aqui ficam no RH para a próxima vez.</p>

              <div className="space-y-2">
                <p className="text-sm font-medium">Equipamentos *</p>
                {linhas.length === 0 && <p className="text-xs text-muted-foreground">Nada no Inventário no nome desta pessoa. Adicione abaixo.</p>}
                {/* Cada equipamento numa caixa (região comum): o que já está no Inventário vem pronto, só o estado muda;
                    o novo pede categoria, marca e modelo separados — vão assim para o Inventário (2026-10-20). */}
                {linhas.map((l) => (
                  <div key={l.chave} className="rounded-md border border-border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" aria-label="Entra no termo" checked={l.marcado} onChange={(e) => muda(l.chave, { marcado: e.target.checked })} />
                      {l.asset_id ? (
                        <span className="flex-1 text-sm">
                          <b>{l.descricao}</b> <span className="text-muted-foreground">· {l.marca_modelo ?? 'sem marca'} · nº {l.patrimonio} · já no Inventário</span>
                        </span>
                      ) : (
                        <>
                          <Input aria-label="Descrição" placeholder="O que é (ex.: Headset)" value={l.descricao} className="flex-1"
                            onChange={(e) => muda(l.chave, { descricao: e.target.value })} />
                          <select aria-label="Categoria" value={l.categoria ?? ''} onChange={(e) => muda(l.chave, { categoria: e.target.value || null })}
                            className="h-9 rounded-md border border-border bg-background px-2 text-sm">
                            <option value="">Categoria…</option>
                            {categoriasDoInventario.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                          </select>
                          <Button variant="ghost" size="icon" aria-label="Tirar este equipamento" onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}>
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </div>
                    <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 pl-6">
                      {!l.asset_id && (
                        <>
                          <Input aria-label="Marca" placeholder="Marca (ex.: Poly)" value={l.marca ?? ''} onChange={(e) => muda(l.chave, { marca: e.target.value })} />
                          <Input aria-label="Modelo" placeholder="Modelo (ex.: 3210)" value={l.modelo ?? ''} onChange={(e) => muda(l.chave, { modelo: e.target.value })} />
                          <Input aria-label="Nº patrimônio" placeholder="Nº patrimônio" value={l.patrimonio ?? ''} onChange={(e) => muda(l.chave, { patrimonio: e.target.value })} />
                        </>
                      )}
                      <Input aria-label="Estado" placeholder="Estado (Novo, Usado…)" value={l.estado ?? ''}
                        onChange={(e) => muda(l.chave, { estado: e.target.value })} />
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setLinhas((ls) => [...ls, {
                  chave: crypto.randomUUID(), asset_id: null, marcado: true, descricao: '', marca_modelo: null, categoria: null, marca: null,
                  modelo: null, patrimonio: null, estado: 'Novo',
                }])}>
                  <Plus className="w-4 h-4 mr-1" aria-hidden="true" />Adicionar equipamento
                </Button>
                <p className="text-xs text-muted-foreground">O equipamento adicionado aqui é cadastrado no Inventário, já no nome do colaborador.</p>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!valido || gerar.isPending} onClick={salvar}>
            <FileDown className="w-4 h-4 mr-1.5" aria-hidden="true" />{gerar.isPending ? 'Gerando…' : 'Gerar e baixar o PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegistrarDevolucao({ termo, onFechar }: { termo: Termo; onFechar: () => void }) {
  const devolver = useDevolverTermo();
  const [data, setData] = useState(todayISO());
  const [obs, setObs] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar devolução — {termo.colaborador_nome}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Os equipamentos deste termo voltam ao estoque do Inventário.</p>
          <div className="space-y-1.5">
            <Label htmlFor="dev-data">Data da devolução</Label>
            <input id="dev-data" type="date" value={data} onChange={(e) => setData(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dev-obs">Em que estado voltou</Label>
            <Input id="dev-obs" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: voltou inteiro, sem o cabo" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!data || devolver.isPending} onClick={() => devolver.mutate({ termoId: termo.id, data, obs }, { onSuccess: onFechar })}>
            Registrar devolução
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
