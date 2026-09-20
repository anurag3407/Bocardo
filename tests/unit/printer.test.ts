import assert from 'node:assert/strict';
import { thermalPrinterService, KotPrintJob } from '../../apps/hotel/src/services/printer';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Unit · ESC/POS Thermal Printer');

function makeJob(id: string, overrides: Partial<KotPrintJob> = {}): KotPrintJob {
  return {
    id,
    orderId: `order-${id}`,
    items: [{ name: 'Hyderabadi Dum Biryani', quantity: 2, specialInstructions: 'Extra spicy' }],
    orderTime: '12:45 PM',
    ...overrides,
  };
}

runSuite(suite, async () => {
  await suite.test('KOT ticket is valid ESC/POS with header, items and cut command', () => {
    const job = makeJob('101');
    const ticket = thermalPrinterService.formatKotTicket(job);
    assert.ok(ticket.includes('\x1B\x40'), 'missing printer init');
    assert.ok(ticket.includes('KITCHEN ORDER TICKET (KOT)'));
    assert.ok(ticket.includes(`Order #${job.orderId.slice(0, 8).toUpperCase()}`));
    assert.ok(ticket.includes('Hyderabadi Dum Biryani'));
    assert.ok(ticket.includes('*NOTE: Extra spicy'));
    assert.ok(ticket.includes('\x1D\x56\x41\x03'), 'missing paper cut command');
  });

  await suite.test('reprint tickets carry a duplicate banner', () => {
    const ticket = thermalPrinterService.formatKotTicket(makeJob('101', { isReprint: true }));
    assert.ok(ticket.includes('*** DUPLICATE KOT REPRINT ***'));
    assert.equal(ticket.includes('KITCHEN ORDER TICKET (KOT)'), false);
  });

  await suite.test('subscribers receive current status and queue depth immediately', () => {
    const events: Array<{ status: string; queueCount: number }> = [];
    const unsubscribe = thermalPrinterService.subscribe((status, queueCount) =>
      events.push({ status, queueCount })
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].queueCount, thermalPrinterService.getQueueCount());
    unsubscribe();
  });

  // --- Queue resilience scenario ---
  thermalPrinterService.setTransport(async () => {
    throw new Error('printer offline');
  });
  if (thermalPrinterService.getStatus() === 'CONNECTED') {
    await thermalPrinterService.togglePrinterStatus();
  }

  await suite.test('offline printer buffers KOTs in the local queue', async () => {
    assert.equal(thermalPrinterService.getStatus(), 'DISCONNECTED');
    const second = makeJob('second');
    const first = makeJob('first');
    assert.equal(await thermalPrinterService.printKot(second), false);
    assert.equal(await thermalPrinterService.printKot(first), false);
    assert.equal(thermalPrinterService.getQueueCount(), 2);
  });

  await suite.test('reconnect flush prints the queue FIFO and clears it', async () => {
    const printed: string[] = [];
    thermalPrinterService.setTransport(async (content) => {
      printed.push(content);
    });
    await thermalPrinterService.togglePrinterStatus(); // DISCONNECTED -> CONNECTED, flushes
    assert.equal(thermalPrinterService.getQueueCount(), 0);
    assert.equal(thermalPrinterService.getStatus(), 'CONNECTED');
    assert.equal(printed.length, 2);
    assert.match(printed[0]!, /ORDER-SE/);
    assert.match(printed[1]!, /ORDER-FI/);
  });

  await suite.test('hardware failure mid-print re-queues the job and drops the printer offline', async () => {
    thermalPrinterService.setTransport(async () => {
      throw new Error('paper jam');
    });
    const printed = await thermalPrinterService.printKot(makeJob('jam'));
    assert.equal(printed, false);
    assert.equal(thermalPrinterService.getStatus(), 'DISCONNECTED');
    assert.equal(thermalPrinterService.getQueueCount(), 1);

    // Recover for subsequent tests in this file.
    const recovered: string[] = [];
    thermalPrinterService.setTransport(async (content) => {
      recovered.push(content);
    });
    await thermalPrinterService.togglePrinterStatus();
    assert.equal(thermalPrinterService.getQueueCount(), 0);
    assert.equal(thermalPrinterService.getStatus(), 'CONNECTED');
    assert.match(recovered[0]!, /ORDER-JA/);
  });

  await suite.test('manual reprint flags the job but keeps the printer online', async () => {
    const printed: string[] = [];
    thermalPrinterService.setTransport(async (content) => {
      printed.push(content);
    });
    const ok = await thermalPrinterService.reprintKot(makeJob('again'));
    assert.equal(ok, true);
    assert.ok(printed[0]!.includes('DUPLICATE KOT REPRINT'));
    assert.equal(thermalPrinterService.getStatus(), 'CONNECTED');
  });
});
