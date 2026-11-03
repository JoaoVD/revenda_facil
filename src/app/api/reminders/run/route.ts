import { timingSafeEqual } from 'node:crypto';
import { scheduleReminders } from '@/modules/reminders/service';
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
  const result = await scheduleReminders();
  return Response.json(
    { ...result, pushTransport: 'NOT_CONFIGURED' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
