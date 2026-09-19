import { db } from '@bocardo/database';
import { socketService } from '../services/socket';

export function startOutboxWorker() {
  let running = false;
  const timer = setInterval(async () => {
    if (running || !socketService.getIo()) return;
    running = true;
    try {
      await db.withTransaction(async (client) => {
        const events = await client.query('SELECT * FROM realtime_outbox ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED');
        for (const event of events.rows) {
          socketService.getIo()?.to(event.room).emit(event.event, event.payload);
          await client.query('DELETE FROM realtime_outbox WHERE id = $1', [event.id]);
        }
      }, 'READ COMMITTED');
    } catch { console.error('Realtime outbox delivery failed; retrying'); }
    finally { running = false; }
  }, 1000);
  timer.unref();
  return () => clearInterval(timer);
}
