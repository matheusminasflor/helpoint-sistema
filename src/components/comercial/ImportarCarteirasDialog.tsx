// Importação inicial das carteiras pela planilha que a equipe usava fora do sistema (2026-09-29).
//
// O dono: "o sistema identifica as carteiras e pede o vendedor responsável por cada uma —
// 'Carteira Demais Estados – Selecionar vendedor', 'Carteira VIP – Selecionar vendedor'". É isso:
// uma linha por aba da planilha, com a carteira (sugerida, e trocável) e a vendedora.
//
// Três passos: escolher o arquivo; conferir a PRÉVIA (a função do banco calcula sem gravar —
// mesma conta da gravação); importar. O que não entra fica dito, com nome: conflitos (o mesmo
// código em dois clientes), clientes sem código, códigos que não existem no cadastro, e quem já
// está em outra carteira — "o sistema manda", a planilha não troca carteira de ninguém.
//
// A importação só escreve carteira, grupo e vendedora responsável. Cadastro e vendas continuam
// vindo do Forteplus, e nenhuma importação do Forteplus mexe nesses três campos.
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { readSheets } from '@/lib/planilha';
import { carteiraSugerida, lerPlanilhaDeCarteiras, type LeituraDeCarteiras } from '@/lib/planilha-de-carteiras';
import {
  useCarteiras, useImportarCarteiras, usePessoasElegiveisParaCarteira, useRenomeacoesCarteira,
  type CarteiraParaImportar, type ResultadoDaCarteira,
} from '@/hooks/useComercialCarteirasMetas';

const NINGUEM = '__definir_depois__';

interface Escolha {
  carteira: string;
  responsavel: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function textoDoResponsavel(situacao: string | null, nome: string | undefined): string | null {
  if (!situacao) return null;
  if (situacao === 'definido') return `${nome ?? 'A vendedora'} será a responsável.`;
  if (situacao === 'ja_era') return `${nome ?? 'A vendedora'} já é a responsável.`;
  if (situacao === 'carteira_ja_tem_responsavel') return 'Esta carteira já tem outra responsável: a vendedora não é trocada.';
  if (situacao.startsWith('em_outra_carteira:')) {
    return `${nome ?? 'A vendedora'} já está na carteira ${situacao.split(':')[1]} (cada pessoa fica em uma carteira só): não é movida.`;
  }
  return null;
}

export function ImportarCarteirasDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<LeituraDeCarteiras | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [previa, setPrevia] = useState<ResultadoDaCarteira[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { data: carteiras = [] } = useCarteiras();
  const { data: renomeacoes = [] } = useRenomeacoesCarteira();
  const { data: pessoas = [] } = usePessoasElegiveisParaCarteira();
  const importar = useImportarCarteiras();

  const mapaDeRenomeacoes = useMemo(
    () => Object.fromEntries(renomeacoes.map((r) => [r.de, r.para])), [renomeacoes]);
  const nomeDaPessoa = (id: string | null) => pessoas.find((p) => p.id === id)?.nome;

  const reset = () => {
    setArquivo(null); setLeitura(null); setEscolhas({}); setPrevia(null); setErro(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const lerArquivo = async (file: File) => {
    setErro(null); setPrevia(null);
    try {
      const lida = lerPlanilhaDeCarteiras(await readSheets(file));
      if (lida.abas.length === 0) throw new Error('Nenhuma aba com as colunas CÓDIGO e CLIENTE foi encontrada nesta planilha.');
      setLeitura(lida);
      setArquivo(file.name);
      setEscolhas(Object.fromEntries(lida.abas.map((a) => [a.aba, {
        carteira: carteiraSugerida(a.aba, mapaDeRenomeacoes), responsavel: null,
      }])));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setLeitura(null);
    }
  };

  const mudar = (aba: string, parte: Partial<Escolha>) => {
    setEscolhas((s) => ({ ...s, [aba]: { ...s[aba], ...parte } }));
    setPrevia(null); // a prévia é da escolha anterior: some, para ninguém importar outra coisa
  };

  // Uma pessoa fica em UMA carteira (regra do banco): escolher a mesma vendedora para duas abas é
  // dito aqui, antes da prévia.
  const responsaveisRepetidos = useMemo(() => {
    const ids = Object.values(escolhas).map((e) => e.responsavel).filter(Boolean) as string[];
    return ids.filter((id, i) => ids.indexOf(id) !== i);
  }, [escolhas]);
  const semNome = Object.values(escolhas).some((e) => !e.carteira.trim());

  const envio = (): CarteiraParaImportar[] => (leitura?.abas ?? []).map((a) => ({
    carteira: escolhas[a.aba].carteira.trim(),
    responsavel: escolhas[a.aba].responsavel,
    clientes: a.clientes,
  }));

  const verPrevia = async () => setPrevia(await importar.mutateAsync({ carteiras: envio(), confirmar: false }));
  const confirmar = async () => {
    await importar.mutateAsync({ carteiras: envio(), confirmar: true });
    reset();
    onOpenChange(false);
  };

  const bloqueado = !leitura || semNome || responsaveisRepetidos.length > 0 || importar.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar carteiras de planilha</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-[13px]">
          <p className="text-muted-foreground">
            A planilha das carteiras (uma aba por carteira, com as colunas <strong>CÓDIGO</strong> e{' '}
            <strong>CLIENTE</strong>). A importação liga cada cliente, pelo código do Forteplus, à carteira da
            aba, e a carteira à vendedora escolhida. Ela <strong>não cria cliente</strong>, <strong>não traz
            venda</strong> e <strong>só preenche quem está sem carteira</strong> — quem já tem carteira no
            sistema fica como está.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="imp-carteiras-arquivo">Arquivo (.xlsx)</Label>
            <input
              id="imp-carteiras-arquivo"
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivo(f); }}
              className="block w-full text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground file:text-[13px] file:font-semibold"
            />
          </div>

          {erro && (
            <p className="flex items-center gap-2 rounded-lg badge-danger p-3 font-semibold">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />{erro}
            </p>
          )}

          {leitura && (
            <>
              <p className="flex items-center gap-2 font-semibold">
                <FileSpreadsheet className="w-4 h-4 text-primary" aria-hidden="true" />{arquivo}
              </p>

              {/* A lista de carteiras que o campo sugere: a do banco (metas, membros). */}
              <datalist id="imp-carteiras-sugestoes">
                {carteiras.map((c) => <option key={c} value={c} />)}
              </datalist>

              <div className="space-y-2">
                {leitura.abas.map((a) => {
                  const e = escolhas[a.aba];
                  const repetido = !!e.responsavel && responsaveisRepetidos.includes(e.responsavel);
                  return (
                    <div key={a.aba} className="rounded-lg border border-border p-3 space-y-2">
                      <p className="font-semibold">
                        Aba {a.aba} <span className="font-normal text-muted-foreground">
                          · {a.clientes.length} clientes
                          {a.clientes.some((c) => c.codigos.length > 1)
                            && ` (${a.clientes.filter((c) => c.codigos.length > 1).length} com mais de um código)`}
                        </span>
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor={`imp-cart-${a.aba}`} className="text-[12px]">Carteira</Label>
                          <Input id={`imp-cart-${a.aba}`} list="imp-carteiras-sugestoes" value={e.carteira}
                            onChange={(ev) => mudar(a.aba, { carteira: ev.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[12px]">Vendedora responsável</Label>
                          <Select value={e.responsavel ?? NINGUEM}
                            onValueChange={(v) => mudar(a.aba, { responsavel: v === NINGUEM ? null : v })}>
                            <SelectTrigger aria-label={`Vendedora responsável pela aba ${a.aba}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NINGUEM}>Definir depois</SelectItem>
                              {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {repetido && (
                        <p className="text-[12px] badge-danger rounded-md px-2 py-1">
                          A mesma pessoa foi escolhida para duas carteiras. Cada pessoa fica em uma carteira só.
                        </p>
                      )}
                      {a.semCodigo.length > 0 && (
                        <details className="text-[12px]">
                          <summary className="cursor-pointer text-muted-foreground">
                            {a.semCodigo.length} sem código na planilha — ficam de fora
                          </summary>
                          <p className="pt-1">{a.semCodigo.join('; ')}</p>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>

              {leitura.conflitos.length > 0 && (
                <details className="rounded-lg badge-warning p-3 text-[12px]" open>
                  <summary className="cursor-pointer font-semibold">
                    {leitura.conflitos.length} {leitura.conflitos.length === 1 ? 'código aparece' : 'códigos aparecem'} em
                    dois clientes — ficam de fora, para resolver no Cadastro de clientes
                  </summary>
                  <ul className="pt-1 space-y-0.5">
                    {leitura.conflitos.map((c) => <li key={c.codigo}><strong>{c.codigo}</strong>: {c.onde.join(' e ')}</li>)}
                  </ul>
                </details>
              )}

              {previa && (
                <div className="space-y-2">
                  <p className="font-semibold">Prévia — nada foi gravado ainda</p>
                  {/* A função devolve as carteiras na ordem do envio, que é a ordem das abas. */}
                  {previa.map((p, i) => {
                    const sobreResponsavel = textoDoResponsavel(
                      p.responsavel, nomeDaPessoa(escolhas[leitura.abas[i].aba]?.responsavel ?? null));
                    return (
                    <div key={`${i}-${p.carteira}`} className="rounded-lg border border-border p-3 space-y-1">
                      <p className="font-semibold">{p.carteira} <span className="font-normal text-muted-foreground">(aba {leitura.abas[i].aba})</span></p>
                      <p>
                        <strong>{p.entram}</strong> {p.entram === 1 ? 'cliente entra' : 'clientes entram'}
                        {p.ja_estavam > 0 && <> · {p.ja_estavam} já estavam nela</>}
                        {p.grupos > 0 && <> · {p.grupos} {p.grupos === 1 ? 'grupo criado' : 'grupos criados'}</>}
                      </p>
                      {sobreResponsavel && <p className="text-muted-foreground">{sobreResponsavel}</p>}
                      {p.divergentes.length > 0 && (
                        <details className="text-[12px]">
                          <summary className="cursor-pointer">{p.divergentes.length} já estão em outra carteira — não mudam</summary>
                          <ul className="pt-1">{p.divergentes.map((d) => <li key={d.codigo}>{d.codigo} {d.nome} — está em {d.carteira}</li>)}</ul>
                        </details>
                      )}
                      {p.nao_encontrados.length > 0 && (
                        <details className="text-[12px]">
                          <summary className="cursor-pointer">{p.nao_encontrados.length} códigos não existem no cadastro — ficam de fora</summary>
                          <p className="pt-1">{p.nao_encontrados.join(', ')}</p>
                        </details>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          {!previa ? (
            <Button onClick={verPrevia} disabled={bloqueado}>
              {importar.isPending ? 'Calculando...' : 'Ver prévia'}
            </Button>
          ) : (
            <Button onClick={confirmar} disabled={bloqueado}>
              <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
              {importar.isPending ? 'Importando...' : 'Importar carteiras'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
