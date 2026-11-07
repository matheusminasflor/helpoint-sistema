// Procura uma reunião na agenda de todas as contas da empresa e lê os próximos passos das anotações do Gemini
// (proposta "Combinados no Início", aprovada em 2026-11-04). Só leitura. Exige a chave service_role (verify_jwt = true).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRole } from "../_shared/require-service-role.ts";
import { FalhaDoGoogle, lerDoGoogle, textoDoDocumento, tokenDoGoogle } from "../_shared/google.ts";

interface Evento {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  organizer?: { email?: string };
  attendees?: { email?: string }[];
  hangoutLink?: string;
  attachments?: { fileId?: string; title?: string; mimeType?: string }[];
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

const normaliza = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** As seções do documento e quem fala na transcrição, sem devolver o conteúdo. */
function estruturaDoDocumento(texto: string) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim());
  const secoes = linhas.filter((l) => l.length > 0 && l.length < 50 && !/[.:,;]$/.test(l) && !l.startsWith('*')).slice(0, 40);
  const falas = new Map<string, number>();
  for (const m of texto.matchAll(/^\s*([\p{Lu}][\p{L}]+(?: [\p{L}]+){1,3}):/gmu)) falas.set(m[1], (falas.get(m[1]) ?? 0) + 1);
  const transcricao = texto.search(/transcri[cç][aã]o/i);
  return { secoes, falas: Object.fromEntries(falas), inicio_da_transcricao: transcricao, formato: texto.slice(transcricao, transcricao + 500) };
}

/** Quem entrou de fato na chamada, convidado ou não. */
async function quemEntrou(token: string, sala: string) {
  const filtro = encodeURIComponent(`space.meeting_code="${sala}"`);
  const { conferenceRecords = [] } = await lerDoGoogle<{ conferenceRecords?: { name: string; startTime: string }[] }>(token, `https://meet.googleapis.com/v2/conferenceRecords?filter=${filtro}`);
  const saida = [];
  for (const r of conferenceRecords.slice(0, 3)) {
    const { participants = [] } = await lerDoGoogle<{ participants?: { signedinUser?: { displayName?: string }; anonymousUser?: { displayName?: string } }[] }>(token, `https://meet.googleapis.com/v2/${r.name}/participants?pageSize=50`);
    saida.push({ inicio: r.startTime, pessoas: participants.map((p) => p.signedinUser?.displayName ?? p.anonymousUser?.displayName ?? 'Sem nome') });
  }
  return saida;
}

/** Do título "Próximas etapas" (ou "Next steps") até o fim do bloco. */
function proximasEtapas(texto: string) {
  const achou = /(pr[oó]ximas etapas|pr[oó]ximos passos|suggested next steps|next steps)/i.exec(texto);
  return achou ? texto.slice(achou.index, achou.index + 3000) : null;
}

serve(async (req) => {
  const recusa = requireServiceRole(req);
  if (recusa) return recusa;

  const { busca, de, ate, contas: extras = [] } = await req.json() as { busca: string; de: string; ate: string; contas?: string[] };
  if (!busca || !de || !ate) return json({ error: 'Informe busca, de e ate.' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: pessoas, error } = await supabase.from('profiles').select('email').not('email', 'is', null);
  if (error) return json({ error: error.message }, 500);

  const contas = [...new Set([...extras, ...pessoas.map((p) => p.email as string)])];
  const lidas: string[] = [];
  const foraDoWorkspace: string[] = [];
  const falhas: { codigo: string; mensagem: string }[] = [];
  const eventos = new Map<string, Evento>();
  const documentosDoDia = new Map<string, { titulo: string; dono: string; proximas_etapas: string | null; caracteres: number }>();

  for (const conta of contas) {
    try {
      const token = await tokenDoGoogle(conta);
      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
      url.searchParams.set('q', busca);
      url.searchParams.set('timeMin', de);
      url.searchParams.set('timeMax', ate);
      url.searchParams.set('singleEvents', 'true');
      const { items = [] } = await lerDoGoogle<{ items?: Evento[] }>(token, url.toString());
      lidas.push(conta);
      for (const e of items) eventos.set(e.id, e);

      // Reunião aberta na hora não tem evento: as anotações do Gemini ficam no Drive de quem organizou.
      const q = `mimeType = 'application/vnd.google-apps.document' and modifiedTime > '${new Date(de).toISOString()}' and modifiedTime < '${new Date(ate).toISOString()}' and (name contains 'Gemini' or name contains 'Transcri')`;
      const drive = new URL('https://www.googleapis.com/drive/v3/files');
      drive.searchParams.set('q', q);
      drive.searchParams.set('fields', 'files(id,name)');
      drive.searchParams.set('pageSize', '50');
      const { files = [] } = await lerDoGoogle<{ files?: { id: string; name: string }[] }>(token, drive.toString());
      for (const a of files) {
        if (documentosDoDia.has(a.id)) continue;
        documentosDoDia.set(a.id, { titulo: a.name, dono: conta, proximas_etapas: null, caracteres: 0 });
      }
    } catch (e) {
      if (e instanceof FalhaDoGoogle && e.codigo === 'invalid_grant') foraDoWorkspace.push(conta);
      else falhas.push({ codigo: e instanceof FalhaDoGoogle ? e.codigo : 'erro', mensagem: String((e as Error).message).slice(0, 200) });
    }
  }

  const reunioes = [];
  for (const e of eventos.values()) {
    const organizador = e.organizer?.email ?? null;
    const anexos = (e.attachments ?? []).filter((a) => a.mimeType === 'application/vnd.google-apps.document' && a.fileId);
    const documentos = [];
    if (organizador) {
      try {
        const token = await tokenDoGoogle(organizador);
        for (const a of anexos) {
          const texto = await textoDoDocumento(token, a.fileId!);
          documentos.push({ titulo: a.title, caracteres: texto.length, estrutura: estruturaDoDocumento(texto) });
        }
      } catch (erro) {
        documentos.push({ erro: String((erro as Error).message).slice(0, 200) });
      }
    }
    let entraram: unknown = null;
    const sala = e.hangoutLink?.split('/').pop();
    if (organizador && sala) {
      try {
        entraram = await quemEntrou(await tokenDoGoogle(organizador), sala);
      } catch (erro) {
        entraram = String((erro as Error).message).slice(0, 200);
      }
    }
    reunioes.push({
      entraram,
      titulo: e.summary, inicio: e.start?.dateTime ?? e.start?.date, organizador,
      convidados: e.attendees?.length ?? 0, meet: !!e.hangoutLink,
      anexos: (e.attachments ?? []).map((a) => a.title), documentos,
    });
  }

  return json({ contas: contas.length, lidas: lidas.length, fora_do_workspace: foraDoWorkspace, falhas: falhas.filter((x) => x.codigo !== 'unauthorized_client').slice(0, 5), recusadas: falhas.filter((x) => x.codigo === 'unauthorized_client').length, reunioes, documentos: [...documentosDoDia.values()] });
});
