// Um lugar só decide como o e-mail transacional sai das edge functions.
// EMAIL_PROVIDER=resend (padrão) usa a API da Resend; =smtp usa qualquer
// servidor SMTP (Hostinger, por exemplo). Trocar de fornecedor é trocar
// variável de ambiente, sem tocar em quem envia.
//
// Os e-mails de login (confirmação, recuperação, convite do GoTrue) não
// passam por aqui: o GoTrue os envia sozinho, por SMTP (supabase/config.toml).

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  /** "Nome <endereco@dominio>" ou só o endereço. */
  from: string;
};

export type SendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

type Provider = "resend" | "smtp";

function provider(): Provider {
  return Deno.env.get("EMAIL_PROVIDER") === "smtp" ? "smtp" : "resend";
}

/**
 * Null quando há o que é preciso para enviar; senão, o código de erro que a
 * função deve devolver. Chame antes de gravar qualquer coisa: criar o usuário
 * e só então descobrir que o e-mail não sai deixa a conta pela metade.
 */
export function emailConfigError(): string | null {
  if (provider() === "smtp") {
    const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].filter((k) => !Deno.env.get(k));
    return missing.length ? "email_not_configured" : null;
  }
  return Deno.env.get("RESEND_API_KEY") ? null : "email_not_configured";
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const cfg = emailConfigError();
  if (cfg) return { ok: false, error: cfg };
  try {
    return provider() === "smtp" ? await viaSmtp(input) : await viaResend(input);
  } catch (e) {
    return { ok: false, error: `send_exception: ${String(e)}`.slice(0, 500) };
  }
}

async function viaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const { Resend } = await import("https://esm.sh/resend@2.0.0");
  const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
  const { data, error } = await resend.emails.send({
    from: input.from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
  });
  if (error) {
    const msg = typeof error === "string" ? error : (error as { message?: string }).message ?? JSON.stringify(error);
    return { ok: false, error: `resend: ${msg}`.slice(0, 500) };
  }
  return { ok: true, id: data?.id };
}

// ponytail: caminho ainda não exercitado num projeto real (só o Resend está
// ligado). Se o edge runtime não abrir o socket TLS do nodemailer, a saída é
// trocar por denomailer, que a documentação da Supabase usa — só esta função muda.
async function viaSmtp(input: SendEmailInput): Promise<SendEmailResult> {
  const nodemailer = (await import("npm:nodemailer@6.9.16")).default;
  const port = Number(Deno.env.get("SMTP_PORT")) || 465;
  const transport = nodemailer.createTransport({
    host: Deno.env.get("SMTP_HOST"),
    port,
    secure: port === 465,
    auth: { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_PASS") },
  });
  const info = await transport.sendMail({
    from: input.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });
  return { ok: true, id: info.messageId };
}
