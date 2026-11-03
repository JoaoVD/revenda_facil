import { requireActor } from '@/modules/auth/server';
import { fiscalDownload, fiscalFileInfo } from '@/modules/fiscal/service';
import { z } from 'zod';
export const runtime = 'nodejs';
export async function GET(
  _: Request,
  context: { params: Promise<{ id: string; format: string }> },
) {
  const actor = await requireActor();
  const parsed = z
    .object({
      id: z.uuid(),
      format: z.enum(['xml', 'pdf', 'danfe', 'cancel-xml']),
    })
    .safeParse(await context.params);
  if (!parsed.success)
    return new Response('Documento não encontrado.', { status: 404 });
  const { id, format } = parsed.data;
  const downloadFormat = format === 'danfe' ? 'pdf' : format;
  try {
    const info = await fiscalFileInfo(actor, id, downloadFormat);
    const data = await fiscalDownload(actor, id, downloadFormat);
    return new Response(Buffer.from(data), {
      headers: {
        'Content-Type': info.contentType,
        'Content-Disposition': `attachment; filename="homologacao-${id}${format === 'cancel-xml' ? '-cancelamento' : ''}.${info.extension}"`,
        'Content-Security-Policy':
          "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response(
      'Documento indisponível. Consulte sua situação fiscal.',
      { status: 404 },
    );
  }
}
