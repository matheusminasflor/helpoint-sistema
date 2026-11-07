// A leitura da pauta e da transcrição (dono, 2026-11-07: "só texto jogado lá"). O texto continua sendo o do Google:
// aqui ele só ganha seções, responsáveis e falas por pessoa. Lei de Miller nos blocos, Von Restorff no que é da pessoa.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import {
  falasDaTranscricao, paragrafosDaSecao, proximasEtapas, secaoDaPauta, temposDoTexto, type SecaoDaPauta,
} from '@/lib/reunioes';

const SECOES: SecaoDaPauta[] = ['Resumo', 'Decisões', 'Próximas etapas', 'Detalhes'];
const CORES = ['badge-info', 'badge-success', 'badge-purple', 'badge-warning', 'badge-neutral'];
const corDe = (nome: string) => CORES[[...nome].reduce((s, c) => s + c.charCodeAt(0), 0) % CORES.length];
const iniciais = (nome: string) => nome.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
const sem = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function TextoComTempos({ texto, onHora }: { texto: string; onHora: (hora: string) => void }) {
  return (
    <>
      {temposDoTexto(texto).map((p, i) => (p.hora
        ? <button key={i} type="button" className="mx-0.5 text-[13px] text-primary underline tabular-nums" onClick={() => onHora(p.hora!)}>{p.hora}</button>
        : <span key={i}>{p.texto}</span>))}
    </>
  );
}

function Paragrafos({ texto, onHora }: { texto: string; onHora: (hora: string) => void }) {
  return (
    <div className="space-y-3">
      {paragrafosDaSecao(texto).map((p, i) => (
        <div key={i} className="space-y-1 max-w-[75ch]">
          {p.titulo && <h5 className="text-[14px] font-semibold">{p.titulo}</h5>}
          {p.corpo && <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words"><TextoComTempos texto={p.corpo} onHora={onHora} /></p>}
        </div>
      ))}
    </div>
  );
}

function Etapas({ texto, onHora }: { texto: string; onHora: (hora: string) => void }) {
  const { profile } = useAuth();
  const meuNome = sem(profile?.full_name ?? '').split(' ')[0];
  const etapas = proximasEtapas(texto);
  const eMinha = (pessoas: string[]) => !!meuNome && pessoas.some((p) => sem(p).split(' ')[0] === meuNome);
  const ordenadas = [...etapas.filter((e) => eMinha(e.pessoas)), ...etapas.filter((e) => !eMinha(e.pessoas))];
  return (
    <ul className="space-y-2">
      {ordenadas.map((e, i) => (
        <li key={i} className={`rounded-md border p-3 space-y-1 ${eMinha(e.pessoas) ? 'border-primary bg-primary/5' : 'border-border'}`}>
          <div className="flex flex-wrap items-center gap-1.5">
            {e.pessoas.map((p) => <span key={p} className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${corDe(p)}`}>{p}</span>)}
            {eMinha(e.pessoas) && <span className="text-[12px] font-semibold text-primary">Com você</span>}
          </div>
          {e.titulo && <p className="text-[14px] font-semibold">{e.titulo}</p>}
          <p className="text-[14px] leading-relaxed break-words max-w-[75ch]"><TextoComTempos texto={e.texto} onHora={onHora} /></p>
        </li>
      ))}
    </ul>
  );
}

export function PautaLegivel({ pauta, onHora }: { pauta: string; onHora: (hora: string) => void }) {
  const raiz = useRef<HTMLDivElement>(null);
  const secoes = SECOES.flatMap((titulo) => { const texto = secaoDaPauta(pauta, titulo); return texto ? [{ titulo, texto }] : []; });
  // Documento fora do padrão do Gemini vai como veio.
  if (secoes.length === 0) return <p className="text-[14px] whitespace-pre-wrap break-words max-w-[75ch]">{pauta}</p>;
  const ir = (titulo: string) => raiz.current?.querySelector(`[data-secao="${titulo}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div ref={raiz} className="space-y-4">
      <nav aria-label="Seções da pauta" className="flex flex-wrap gap-2">
        {secoes.map((s) => <button key={s.titulo} type="button" onClick={() => ir(s.titulo)} className="min-h-9 rounded-md border border-border px-3 text-[13px] font-semibold hover:bg-muted">{s.titulo}</button>)}
      </nav>
      {secoes.map((s) => (
        <section key={s.titulo} data-secao={s.titulo} className="rounded-md border border-border p-4 space-y-3 scroll-mt-4">
          <h4 className="text-[16px] font-bold">{s.titulo}</h4>
          {s.titulo === 'Próximas etapas' ? <Etapas texto={s.texto} onHora={onHora} /> : <Paragrafos texto={s.texto} onHora={onHora} />}
        </section>
      ))}
    </div>
  );
}

export function TranscricaoLegivel({ texto, horaAlvo }: { texto: string; horaAlvo: string | null }) {
  const [busca, setBusca] = useState('');
  const raiz = useRef<HTMLDivElement>(null);
  const todas = useMemo(() => falasDaTranscricao(texto), [texto]);
  const falas = useMemo(() => {
    const alvo = sem(busca.trim());
    return alvo ? todas.filter((f) => sem(`${f.nome} ${f.fala}`).includes(alvo)) : todas;
  }, [todas, busca]);
  // Vindo da pauta pela hora: a fala mais próxima daquele momento.
  const alvo = useMemo(() => {
    if (!horaAlvo) return null;
    return [...todas].reverse().find((f) => f.hora && f.hora <= horaAlvo) ?? todas[0] ?? null;
  }, [todas, horaAlvo]);
  useEffect(() => {
    if (alvo) raiz.current?.querySelector('[data-alvo="sim"]')?.scrollIntoView({ block: 'center' });
  }, [alvo]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <Input className="pl-8" aria-label="Buscar na transcrição" placeholder="Buscar por pessoa ou assunto" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {busca.trim() && <p className="text-[13px] text-muted-foreground">{falas.length} {falas.length === 1 ? 'trecho' : 'trechos'}</p>}
      <div ref={raiz} className="space-y-3">
        {falas.map((f) => (
          <article key={f.id} data-alvo={f === alvo ? 'sim' : undefined} className={`flex gap-2.5 rounded-md p-1.5 ${f === alvo ? 'bg-primary/5' : ''}`}>
            {f.nome ? <span aria-hidden="true" className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold ${corDe(f.nome)}`}>{iniciais(f.nome)}</span> : <span className="shrink-0 w-8" />}
            <div className="min-w-0">
              <p className="text-[13px]"><span className="font-semibold">{f.nome}</span> {f.hora && <span className="text-muted-foreground tabular-nums">{f.hora}</span>}</p>
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words max-w-[75ch]">{f.fala}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
