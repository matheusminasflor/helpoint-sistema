import { readFileSync, writeFileSync } from 'node:fs';
const CR = String.fromCharCode(13);
const f = 'supabase/functions/google-reunioes/index.ts';
let s = readFileSync(f, 'utf8').split(CR).join('');
const cauda = readFileSync('scratch_cauda.ts', 'utf8').split(CR).join('');
const i = s.indexOf('serve(async (req) => {');
if (i < 0) throw new Error('serve');
s = s.slice(0, i) + cauda;
const troca = (a, b) => { if (!s.includes(a)) throw new Error(a.slice(0, 80)); s = s.split(a).join(b); };
troca('import { createClient } from "https://esm.sh/@supabase/supabase-js@2";', 'import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";');
troca("(name contains 'Gemini' or name contains 'Participação' or name contains 'Recording' or name contains 'Gravação')", "(name contains 'Gemini' or name contains 'Transcri' or name contains 'Transcript' or name contains 'Participação' or name contains 'Recording' or name contains 'Gravação')");
troca('  attachments?: { fileId?: string; fileUrl?: string; title?: string; mimeType?: string }[];\n', '');
writeFileSync(f, s);

const g = 'src/telas/ConfiguracoesIntegracoes.tsx';
const bruto = readFileSync(g, 'utf8');
const crlf = bruto.includes(CR);
let t = bruto.split(CR).join('');
const troca2 = (a, b) => { if (!t.includes(a)) throw new Error(a.slice(0, 80)); t = t.split(a).join(b); };
{
  const a = t.indexOf("  { nome: 'Google Workspace (Agenda e Meet)'");
  const b = t.indexOf("  { nome: 'Kommo (leads por funil)'");
  if (a < 0 || b < a) throw new Error('google');
  t = t.slice(0, a) + t.slice(b);
}
troca2(`function CartaoDaIA() {`, `interface RoboDeReunioes { ok_em: string | null; caiu_em: string | null; ultimo_erro: string | null }

function CartaoDoGoogle() {
  const { tenantId } = useAuth();
  const { data: robo, isError } = useQuery({
    queryKey: ['reuniao-robo', tenantId],
    enabled: !!tenantId,
    queryFn: async () => unwrap(await supabase.from('reuniao_robo' as never).select('ok_em, caiu_em, ultimo_erro').maybeSingle()) as unknown as RoboDeReunioes | null,
  });
  const parado = !!robo?.caiu_em;
  const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <Cartao nome="Google Workspace (Agenda, Meet e Drive)" tom={parado || isError ? 'perigo' : robo?.ok_em ? 'ok' : 'neutro'}
      situacao={isError ? 'Sem informação' : parado ? 'Com problema' : robo?.ok_em ? 'Funcionando' : 'Aguardando a primeira leitura'}
      descricao="As reuniões da conta ti@minasflor.com entram sozinhas em Meu trabalho › Reuniões, a cada 30 minutos.">
      {robo?.ok_em && <p className="text-sm text-muted-foreground">Última leitura: {quando(robo.ok_em)}.</p>}
      {robo?.ultimo_erro && <p className="text-sm font-medium text-aviso">Atenção: {robo.ultimo_erro}.</p>}
    </Cartao>
  );
}

function CartaoDaIA() {`);
troca2("        <CartaoDaIA />\n", "        <CartaoDoGoogle />\n        <CartaoDaIA />\n");
writeFileSync(g, crlf ? t.split('\n').join(`${CR}\n`) : t);
