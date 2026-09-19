import assert from 'node:assert/strict';
import { thermalPrinterService, KotPrintJob } from './printer';

function makeJob(id: string): KotPrintJob {
  return {
    id,
    orderId: `order-${id}`,
    items: [{ name: 'Paneer Tikka', quantity: 1 }],
    orderTime: '12:45 PM',
  };
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 50 && !predicate(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function run() {
  thermalPrinterService.setTransport(async () => {
    throw new Error('printer disconnected');
  });
  thermalPrinterService.togglePrinterStatus();
  const second = makeJob('second');
  const first = makeJob('first');
  assert.equal(await thermalPrinterService.printKot(second), false);
  assert.equal(await thermalPrinterService.printKot(first), false);
  assert.equal(thermalPrinterService.getQueueCount(), 2);

  const printed: string[] = [];
  thermalPrinterService.setTransport(async (content) => {
    printed.push(content);
  });
  await thermalPrinterService.togglePrinterStatus();
  await waitFor(() => thermalPrinterService.getQueueCount() === 0);
  assert.equal(thermalPrinterService.getQueueCount(), 0);
  assert.equal(thermalPrinterService.getStatus(), 'CONNECTED');
  assert.equal(printed.length, 2);
  assert.match(printed[0]!, /ORDER-SE/);
  assert.match(printed[1]!, /ORDER-FI/);
  console.log('Thermal printer queue recovery tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
