import { timingSafeEqual } from 'node:crypto';
import {
  scheduleReminders,
  dispatchPushJobs,
} from '@/modules/reminders/service';
import {
  createPushSender,
  pushConfiguration,
} from '@/modules/reminders/push-transport';
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.REMINDER_SCHEDULER_SECRET;
  if (!secret)
    return Response.json(
      { message: 'Agendador não configurado.' },
      { status: 503 },
    );
  const supplied = Buffer.from(request.headers.get('authorization') || ''),
    expected = Buffer.from(`Bearer ${secret}`);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return new Response(null, { status: 401 });
  const config = pushConfiguration();
  if (!config)
    return Response.json(
      { message: 'Credenciais de notificações não configuradas.' },
      { status: 503 },
    );
  try {
    const result = await scheduleReminders();
    await dispatchPushJobs(createPushSender(config));
    return Response.json(
      { ...result, pushTransport: 'WEB_PUSH' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      {
        message:
          'Não foi possível concluir esta rodada. A fila permanece no servidor.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
