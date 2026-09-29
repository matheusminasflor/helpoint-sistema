// Importar o histórico do sistema anterior de checklist (LEVA S, parte 6, 2026-09-29).
//
// O dono: "vamos cadastrar os usuários, e importar que no sistema eu consiga atrelar a função de
// cada um". Então: o arquivo exportado do sistema antigo entra aqui; a tela lista cada nome que
// aparece nele — as vendedoras e quem decidiu no Financeiro — e o dono escolhe o usuário do Helpoint
// de cada um. A prévia diz o que entra e o que fica de fora (e por quê) antes de gravar.
//
// Quem grava é `ped_carregar_historico`, só para dono/admin. Os autores e as datas originais são
// preservados. Rodar de novo não duplica: o protocolo já importado é pulado.
import { useMemo, useState } from 'react';
import { History, Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProfiles } from '@/hooks/useInventory';
import { useCarregarHistorico, type ResultadoDaCarga } from '@/hooks/usePedidosChecklist';

const NINGUEM = '__ninguem__';

interface Exportacao {
  checklists: {
    vendedor?: string;
    retornos?: { atendente?: string }[] | null;
    pagamentos?: { atendente?: string }[] | null;
    finalizacao?: { atendente?: string } | null;
  }[];
  colorimetria?: unknown[];
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Os nomes do arquivo, separados pelo papel que tinham no sistema antigo. */
function nomesDoArquivo(dados: Exportacao) {
  const vendedoras = new Set<string>();
  const financeiro = new Set<string>();
  for (const c of dados.checklists) {
    if (c.vendedor) vendedoras.add(c.vendedor);
    for (const r of c.retornos ?? []) if (r.atendente) financeiro.add(r.atendente);
    for (const p of c.pagamentos ?? []) if (p.atendente) financeiro.add(p.atendente);
    if (c.finalizacao?.atendente) financeiro.add(c.finalizacao.atendente);
  }
  return { vendedoras: [...vendedoras].sort(), financeiro: [...financeiro].sort() };
}

export function ImportarHistoricoDoChecklist() {
  const { profiles } = useProfiles();
  const carregar = useCarregarHistorico();
  const [dados, setDados] = useState<Exportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pessoas, setPessoas] = useState<Record<string, string>>({});
  const [previa, setPrevia] = useState<ResultadoDaCarga | null>(null);

  const nomes = useMemo(() => (dados ? nomesDoArquivo(dados) : null), [dados]);

  const lerArquivo = async (arquivo: File) => {
    setErro(null); setPrevia(null);
    try {
      const lido = JSON.parse(await arquivo.text()) as Exportacao;
      if (!Array.isArray(lido?.checklists)) throw new Error();
      setDados(lido);
      // Sugestão: o usuário cujo nome começa pelo nome do sistema antigo. O dono confere.
      const { vendedoras, financeiro } = nomesDoArquivo(lido);
      setPessoas(Object.fromEntries([...vendedoras, ...financeiro].flatMap((nome) => {
        const achado = profiles.find((p) => semAcento(p.full_name ?? '').startsWith(semAcento(nome)));
        return achado ? [[nome, achado.id]] : [];
      })));
    } catch {
      setDados(null);
      setErro('Este arquivo não é a exportação do sistema anterior de checklist.');
    }
  };

  const escolher = (nome: string, id: string) => {
    setPessoas((s) => {
      const novo = { ...s };
      if (id === NINGUEM) delete novo[nome]; else novo[nome] = id;
      return novo;
    });
    setPrevia(null);
  };

  const linha = (nome: string) => (
    <div key={nome} className="grid grid-cols-2 items-center gap-2">
      <span className="text-[12px] font-medium">{nome}</span>
      <Select value={pessoas[nome] ?? NINGUEM} onValueChange={(v) => escolher(nome, v)}>
        <SelectTrigger aria-label={`Usuário de ${nome}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NINGUEM}>Ninguém</SelectItem>
          {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Card className="p-4 space-y-3 lg:col-span-2">
      <div>
        <p className="flex items-center gap-2 text-[14px] font-semibold">
          <History className="w-4 h-4 text-primary" aria-hidden="true" /> Importar o histórico do sistema anterior
        </p>
        <p className="text-[12px] text-muted-foreground">
          O arquivo exportado do sistema de checklist que a equipe usava. Ligue cada nome ao usuário dele no Helpoint:
          cada checklist vira um lançamento da vendedora, com as recusas, pagamentos e finalizações do jeito que
          aconteceram (quem fez e quando). Rodar de novo não duplica nada.
        </p>
      </div>
      <input type="file" accept=".json,application/json" aria-label="Arquivo exportado do sistema anterior"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivo(f); }}
        className="block w-full text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground file:text-[13px] file:font-semibold" />
      {erro && <p className="text-[12px] badge-danger rounded-md px-2 py-1">{erro}</p>}

      {dados && nomes && (
        <>
          <p className="text-[12px]">
            <strong>{dados.checklists.length}</strong> checklists no arquivo
            {dados.colorimetria ? <> · {dados.colorimetria.length} produtos de colorimetria</> : null}.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[12px] font-semibold">Vendedoras</p>
              {nomes.vendedoras.map(linha)}
            </div>
            <div className="space-y-2">
              <p className="text-[12px] font-semibold">Quem conferiu no Financeiro</p>
              {nomes.financeiro.map(linha)}
            </div>
          </div>

          {previa && (
            <div className="rounded-lg border border-border p-3 text-[12px] space-y-1">
              <p className="font-semibold">Prévia — nada foi gravado ainda</p>
              <p><strong>{previa.carregaveis}</strong> checklists entram.</p>
              {previa.pulados.length > 0 && (
                <details open>
                  <summary className="cursor-pointer">{previa.pulados.length} ficam de fora</summary>
                  <ul className="pt-1">{previa.pulados.map((p) => <li key={p.protocolo}>{p.protocolo}: {p.motivo}</li>)}</ul>
                </details>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {!previa ? (
              <Button size="sm" disabled={carregar.isPending}
                onClick={async () => setPrevia(await carregar.mutateAsync({ pessoas, dados, confirmar: false }))}>
                {carregar.isPending ? 'Calculando…' : 'Ver prévia'}
              </Button>
            ) : (
              <Button size="sm" disabled={carregar.isPending || previa.carregaveis === 0}
                onClick={async () => { await carregar.mutateAsync({ pessoas, dados, confirmar: true }); setDados(null); setPrevia(null); }}>
                <Upload className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                {carregar.isPending ? 'Importando…' : `Importar ${previa.carregaveis} checklists`}
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
