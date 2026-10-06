// Importação das carteiras pelo MODELO de planilha (LEVA R, 2026-09-29).
//
// O dono: "uma template padrão que baixamos, colocamos os dados e importamos, assim evita que qualquer
// planilha seja importada; e baixar a relação de todos os clientes no mesmo formato — baixo os 450,
// coloco a qual carteira pertence e importo novamente".
//
// Quatro passos: baixar o modelo (vazio ou com todos os clientes e a carteira atual de cada um);
// preencher a coluna CARTEIRA; escolher a vendedora responsável de cada carteira que o arquivo traz;
// conferir a PRÉVIA (a função do banco calcula sem gravar — mesma conta da gravação) e importar.
// A planilha manda: quem muda de carteira aparece na prévia, com de onde sai, antes de gravar.
//
// A importação só escreve carteira, grupo e vendedora responsável. Cadastro e vendas continuam
// vindo do Forteplus, e nenhuma importação do Forteplus mexe nesses três campos.
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { readSheets } from '@/lib/planilha';
import { mensagemDeErro } from '@/lib/supabase-result';
import { todayISO } from '@/lib/dates';
import { baixarModelo, lerModeloDeCarteiras, type LeituraDoModelo } from '@/lib/planilha-de-carteiras';
import {
  buscarClientesDoModelo, useImportarCarteiras, usePessoasElegiveisParaCarteira,
  type CarteiraParaImportar, type ResultadoDaCarteira,
} from '@/hooks/useComercialCarteirasMetas';

const NINGUEM = '__definir_depois__';

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
  const [leitura, setLeitura] = useState<LeituraDoModelo | null>(null);
  /** Carteira do arquivo → id da vendedora responsável (ausente = definir depois). */
  const [responsaveis, setResponsaveis] = useState<Record<string, string>>({});
  const [previa, setPrevia] = useState<ResultadoDaCarteira[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const { data: pessoas = [] } = usePessoasElegiveisParaCarteira();
  const importar = useImportarCarteiras();

  const nomeDaPessoa = (id: string | undefined) => pessoas.find((p) => p.id === id)?.nome;

  const reset = () => {
    setArquivo(null); setLeitura(null); setResponsaveis({}); setPrevia(null); setErro(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const baixar = async (comClientes: boolean) => {
    setErro(null);
    setBaixando(true);
    try {
      if (comClientes) baixarModelo(await buscarClientesDoModelo(), `carteiras-clientes-${todayISO()}.xlsx`);
      else baixarModelo([], 'modelo-carteiras.xlsx');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setBaixando(false);
    }
  };

  const lerArquivo = async (file: File) => {
    setErro(null); setPrevia(null);
    try {
      const lida = lerModeloDeCarteiras(await readSheets(file));
      if (lida.carteiras.length === 0) throw new Error('Nenhuma linha do arquivo tem a coluna CARTEIRA preenchida.');
      setLeitura(lida);
      setArquivo(file.name);
      setResponsaveis({});
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setLeitura(null);
    }
  };

  const escolher = (carteira: string, id: string) => {
    setResponsaveis((s) => {
      const novo = { ...s };
      if (id === NINGUEM) delete novo[carteira]; else novo[carteira] = id;
      return novo;
    });
    setPrevia(null); // a prévia é da escolha anterior: some, para ninguém importar outra coisa
  };

  // Uma pessoa fica em UMA carteira (regra do banco): escolher a mesma vendedora para duas
  // carteiras é dito aqui, antes da prévia.
  const repetidos = useMemo(() => {
    const ids = Object.values(responsaveis);
    return ids.filter((id, i) => ids.indexOf(id) !== i);
  }, [responsaveis]);

  const envio = (): CarteiraParaImportar[] => (leitura?.carteiras ?? []).map((c) => ({
    carteira: c.carteira,
    responsavel: responsaveis[c.carteira] ?? null,
    clientes: c.clientes,
  }));

  const verPrevia = async () => setPrevia(await importar.mutateAsync({ carteiras: envio(), confirmar: false }));
  const confirmar = async () => {
    await importar.mutateAsync({ carteiras: envio(), confirmar: true });
    reset();
    onOpenChange(false);
  };

  const bloqueado = !leitura || repetidos.length > 0 || importar.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar carteiras de planilha</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-[14px]">
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="font-semibold">1. Baixe o modelo</p>
            <p className="text-muted-foreground">
              Só o modelo do sistema é aceito. Baixe com todos os clientes do cadastro (já com a carteira e o grupo
              atuais de cada um) e preencha ou troque a coluna <strong>CARTEIRA</strong>. A coluna <strong>GRUPO</strong>{' '}
              junta códigos do mesmo cliente. As outras colunas são só para você se localizar.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => baixar(true)} disabled={baixando}>
                <Download className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                {baixando ? 'Gerando...' : 'Baixar todos os clientes no modelo'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => baixar(false)} disabled={baixando}>
                <Download className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                Baixar modelo vazio
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="imp-carteiras-arquivo" className="font-semibold">2. Envie o modelo preenchido (.xlsx)</Label>
            <p className="text-muted-foreground">
              O que estiver na planilha manda: cliente com outra carteira no sistema <strong>muda</strong> para a da
              planilha, e a prévia mostra quem muda antes de gravar. Célula de carteira vazia não muda nada — tirar
              cliente de carteira é pelo Cadastro de clientes.
            </p>
            <input
              id="imp-carteiras-arquivo"
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivo(f); }}
              className="block w-full text-[14px] file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground file:text-[14px] file:font-semibold"
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
                {leitura.semCarteira > 0 && (
                  <span className="font-normal text-muted-foreground">
                    · {leitura.semCarteira} {leitura.semCarteira === 1 ? 'linha' : 'linhas'} sem carteira (não mudam)
                  </span>
                )}
              </p>

              <p className="font-semibold">3. Vendedora responsável de cada carteira</p>
              <div className="space-y-2">
                {leitura.carteiras.map((c) => {
                  const escolhida = responsaveis[c.carteira];
                  return (
                    <div key={c.carteira} className="rounded-lg border border-border p-3 grid gap-2 sm:grid-cols-2 sm:items-center">
                      <p className="font-semibold">
                        {c.carteira} <span className="font-normal text-muted-foreground">· {c.clientes.length} clientes</span>
                      </p>
                      <Select value={escolhida ?? NINGUEM} onValueChange={(v) => escolher(c.carteira, v)}>
                        <SelectTrigger aria-label={`Vendedora responsável pela carteira ${c.carteira}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NINGUEM}>Definir depois</SelectItem>
                          {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {!!escolhida && repetidos.includes(escolhida) && (
                        <p className="sm:col-span-2 text-[13px] badge-danger rounded-md px-2 py-1">
                          A mesma pessoa foi escolhida para duas carteiras. Cada pessoa fica em uma carteira só.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {leitura.conflitos.length > 0 && (
                <details className="rounded-lg badge-warning p-3 text-[13px]" open>
                  <summary className="cursor-pointer font-semibold">
                    {leitura.conflitos.length} {leitura.conflitos.length === 1 ? 'código aparece' : 'códigos aparecem'} em
                    mais de uma linha — ficam de fora; corrija a planilha e envie de novo
                  </summary>
                  <ul className="pt-1 space-y-0.5">
                    {leitura.conflitos.map((c) => <li key={c.codigo}><strong>{c.codigo}</strong>: {c.onde.join(' e ')}</li>)}
                  </ul>
                </details>
              )}

              {previa && (
                <div className="space-y-2">
                  <p className="font-semibold">Prévia — nada foi gravado ainda</p>
                  {/* A função devolve as carteiras na ordem do envio. */}
                  {previa.map((p, i) => {
                    const sobreResponsavel = textoDoResponsavel(
                      p.responsavel, nomeDaPessoa(responsaveis[leitura.carteiras[i].carteira]));
                    return (
                      <div key={`${i}-${p.carteira}`} className="rounded-lg border border-border p-3 space-y-1">
                        <p className="font-semibold">
                          {p.carteira}
                          {p.carteira !== leitura.carteiras[i].carteira && (
                            <span className="font-normal text-muted-foreground"> (na planilha: {leitura.carteiras[i].carteira})</span>
                          )}
                        </p>
                        <p>
                          <strong>{p.entram}</strong> {p.entram === 1 ? 'cliente entra' : 'clientes entram'}
                          {p.mudam.length > 0 && <> · <strong>{p.mudam.length}</strong> {p.mudam.length === 1 ? 'muda' : 'mudam'} de carteira</>}
                          {p.ja_estavam > 0 && <> · {p.ja_estavam} já estavam nela</>}
                          {p.grupos > 0 && <> · {p.grupos} com grupo novo</>}
                        </p>
                        {sobreResponsavel && <p className="text-muted-foreground">{sobreResponsavel}</p>}
                        {p.mudam.length > 0 && (
                          <details className="text-[13px]" open>
                            <summary className="cursor-pointer">Quem muda de carteira</summary>
                            <ul className="pt-1">{p.mudam.map((d) => <li key={d.codigo}>{d.codigo} {d.nome} — sai de {d.de}</li>)}</ul>
                          </details>
                        )}
                        {p.nao_encontrados.length > 0 && (
                          <details className="text-[13px]">
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
