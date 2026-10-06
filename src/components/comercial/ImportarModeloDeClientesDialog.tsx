// Importar clientes pelo MODELO ÚNICO (2026-10-01).
//
// Junta as três importações que o cadastro tinha (CLIENTESXTABELA, a ficha do Forteplus e o modelo
// de carteiras): baixar o modelo (vazio ou com todos os clientes), preencher, escolher a vendedora de
// cada carteira citada, ver a PRÉVIA (a função calcula sem gravar) e importar. A planilha muda: quem
// muda aparece campo a campo, de → para, antes de gravar; célula vazia não mexe em nada.
//
// O molde é `ImportarCarteirasDialog.tsx`, o modelo anterior.
import { useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { readSheets } from '@/lib/planilha';
import { mensagemDeErro } from '@/lib/supabase-result';
import { todayISO } from '@/lib/dates';
import { baixarModeloUnico, lerModeloDeClientes, type LeituraDoModeloUnico } from '@/lib/modelo-de-clientes';
import { usePessoasElegiveisParaCarteira } from '@/hooks/useComercialCarteirasMetas';
import { usePodeGerirCarteiras } from '@/hooks/useAccessProfiles';
import {
  buscarClientesDoModeloUnico, useImportarModeloDeClientes, type ResultadoDoModelo,
} from '@/hooks/useModeloDeClientes';

const NINGUEM = '__definir_depois__';

const ROTULO: Record<string, string> = {
  ativo: 'ativo', razao_social: 'razão social', fantasia: 'fantasia', tabela_preco: 'tabela',
  documento: 'CNPJ/CPF', endereco: 'endereço', cep: 'CEP', cidade: 'cidade', estado: 'UF',
  email: 'e-mail', telefone: 'telefone', carteira: 'carteira', grupo: 'grupo',
};

const valor = (campo: string, v: string | null) =>
  campo === 'ativo' ? (v === 'true' ? 'SIM' : v === 'false' ? 'NÃO' : '—') : (v || '—');

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportarModeloDeClientesDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<LeituraDoModeloUnico | null>(null);
  const [responsaveis, setResponsaveis] = useState<Record<string, string>>({});
  const [previa, setPrevia] = useState<ResultadoDoModelo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const { data: pessoas = [] } = usePessoasElegiveisParaCarteira();
  const gereCarteiras = usePodeGerirCarteiras();
  const importar = useImportarModeloDeClientes();

  const reset = () => {
    setArquivo(null); setLeitura(null); setResponsaveis({}); setPrevia(null); setErro(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const baixar = async (comClientes: boolean) => {
    setErro(null);
    setBaixando(true);
    try {
      if (comClientes) baixarModeloUnico(await buscarClientesDoModeloUnico(), `clientes-${todayISO()}.xlsx`);
      else baixarModeloUnico([], 'modelo-clientes.xlsx');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setBaixando(false);
    }
  };

  const lerArquivo = async (file: File) => {
    setErro(null); setPrevia(null);
    try {
      const lida = lerModeloDeClientes(await readSheets(file));
      if (lida.linhas.length === 0) throw new Error('Nenhuma linha do arquivo tem CÓDIGO preenchido.');
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
    setPrevia(null); // a prévia era da escolha anterior
  };

  const enviar = (confirmar: boolean) => importar.mutateAsync({
    arquivo: arquivo ?? 'modelo-clientes.xlsx',
    linhas: leitura?.linhas ?? [],
    responsaveis: Object.entries(responsaveis).map(([carteira, responsavel]) => ({ carteira, responsavel })),
    confirmar,
  });

  const verPrevia = async () => setPrevia(await enviar(false));
  const confirmar = async () => { await enviar(true); reset(); onOpenChange(false); };

  // A mesma vendedora pode responder por mais de uma carteira (2026-10-01).
  const bloqueado = !leitura || importar.isPending;
  const carteiraDe = (nome: string) => previa?.carteiras.find((c) => c.carteira === nome);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar clientes pelo modelo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-[14px]">
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="font-semibold">1. Baixe o modelo</p>
            <p className="text-muted-foreground">
              Um arquivo só para o cadastro inteiro: código, ativo, razão social, fantasia, <strong>tabela de preço</strong>,
              CNPJ/CPF, endereço, CEP, cidade, UF, e-mail, telefone, <strong>carteira</strong> e grupo. Baixe com todos os
              clientes para completar o que falta, ou vazio para cadastrar do zero.
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
            <Label htmlFor="imp-modelo-clientes" className="font-semibold">2. Envie o modelo preenchido (.xlsx)</Label>
            <p className="text-muted-foreground">
              O que estiver na planilha manda: valor diferente do sistema <strong>muda</strong>, e a prévia mostra cada
              mudança antes de gravar. Célula vazia não muda nada. Código novo cria o cliente (precisa da razão social).
            </p>
            <input
              id="imp-modelo-clientes"
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
                <span className="font-normal text-muted-foreground">· {leitura.linhas.length} clientes</span>
              </p>

              {leitura.carteiras.length > 0 && (gereCarteiras ? (
                <>
                  <p className="font-semibold">3. Vendedora responsável de cada carteira</p>
                  <div className="space-y-2">
                    {leitura.carteiras.map((c) => {
                      const escolhida = responsaveis[c];
                      return (
                        <div key={c} className="rounded-lg border border-border p-3 grid gap-2 sm:grid-cols-2 sm:items-center">
                          <p className="font-semibold">{c}</p>
                          <Select value={escolhida ?? NINGUEM} onValueChange={(v) => escolher(c, v)}>
                            <SelectTrigger aria-label={`Vendedora responsável pela carteira ${c}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NINGUEM}>Definir depois</SelectItem>
                              {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="rounded-lg badge-warning p-3 text-[13px]">
                  As colunas CARTEIRA e GRUPO serão ignoradas: o seu perfil não gere as carteiras do Comercial.
                </p>
              ))}

              {(leitura.repetidos.length > 0 || leitura.recusados.length > 0) && (
                <details className="rounded-lg badge-warning p-3 text-[13px]" open>
                  <summary className="cursor-pointer font-semibold">Fica de fora do arquivo</summary>
                  <ul className="pt-1 space-y-0.5">
                    {leitura.repetidos.map((r) => (
                      <li key={`r-${r.codigo}`}><strong>{r.codigo}</strong> aparece em {r.onde.join(' e ')} — nenhuma das linhas entra</li>
                    ))}
                    {leitura.recusados.map((r, i) => <li key={`x-${i}`}>{r.motivo} (o resto da linha entra)</li>)}
                  </ul>
                </details>
              )}

              {previa && (
                <div className="space-y-2">
                  <p className="font-semibold">Prévia — nada foi gravado ainda</p>
                  <p>
                    <strong>{previa.novos.length}</strong> {previa.novos.length === 1 ? 'cliente novo' : 'clientes novos'}
                    {' · '}<strong>{previa.mudam.length}</strong> {previa.mudam.length === 1 ? 'muda' : 'mudam'}
                    {previa.tabelas_alteradas > 0 && <> · {previa.tabelas_alteradas} com tabela de preço trocada</>}
                  </p>
                  {previa.mudam.length > 0 && (
                    <details className="rounded-lg border border-border p-3 text-[13px]" open>
                      <summary className="cursor-pointer font-semibold">Quem muda, campo a campo</summary>
                      <ul className="pt-1 space-y-1 max-h-72 overflow-y-auto">
                        {previa.mudam.map((m) => (
                          <li key={m.codigo}>
                            <strong>{m.codigo}</strong> {m.nome}:{' '}
                            {m.campos.map((c) => `${ROTULO[c.campo] ?? c.campo} ${valor(c.campo, c.de)} → ${valor(c.campo, c.para)}`).join(' · ')}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {previa.novos.length > 0 && (
                    <details className="rounded-lg border border-border p-3 text-[13px]">
                      <summary className="cursor-pointer font-semibold">Clientes novos</summary>
                      <p className="pt-1">{previa.novos.map((n) => `${n.codigo} ${n.nome}`).join(', ')}</p>
                    </details>
                  )}
                  {previa.sem_razao.length > 0 && (
                    <p className="rounded-lg badge-warning p-3 text-[13px]">
                      {previa.sem_razao.length} código(s) novo(s) sem razão social ficam de fora: {previa.sem_razao.join(', ')}
                    </p>
                  )}
                  {previa.documentos_em_conflito.length > 0 && (
                    <p className="rounded-lg badge-warning p-3 text-[13px]">
                      CNPJ/CPF que já é de outro código, não gravado em: {previa.documentos_em_conflito.join(', ')}
                    </p>
                  )}
                  {leitura.carteiras.map((c) => {
                    const r = carteiraDe(c);
                    const pessoa = pessoas.find((p) => p.id === responsaveis[c])?.nome;
                    if (!r?.responsavel) return null;
                    const texto = r.responsavel === 'definido' ? `${pessoa ?? 'A vendedora'} será a responsável por ${c}.`
                      : r.responsavel === 'ja_era' ? `${pessoa ?? 'A vendedora'} já é a responsável por ${c}.`
                      : r.responsavel === 'carteira_ja_tem_responsavel' ? `${c} já tem outra responsável: não é trocada.`
                      : `${pessoa ?? 'A vendedora'} já está na carteira ${r.responsavel.split(':')[1]}: não é movida para ${c}.`;
                    return <p key={c} className="text-muted-foreground text-[13px]">{texto}</p>;
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
              {importar.isPending ? 'Importando...' : 'Importar clientes'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
