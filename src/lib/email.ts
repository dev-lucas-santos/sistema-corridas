import "server-only";

export function emailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Envio via Resend (API REST). Anexos em base64. */
export async function sendEmail(p: { to: string[]; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] }) {
  if (!emailConfigured()) throw new Error("E-mail não configurado (RESEND_API_KEY / EMAIL_FROM)");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM, to: p.to, subject: p.subject, html: p.html,
      attachments: p.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
