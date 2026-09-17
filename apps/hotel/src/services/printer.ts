export interface KotPrintJob {
  id: string;
  orderId: string;
  items: Array<{ name: string; quantity: number; specialInstructions?: string }>;
  customerName?: string;
  deliveryAddress?: string;
  orderTime: string;
  isReprint?: boolean;
}

type PrinterStatus = 'CONNECTED' | 'DISCONNECTED' | 'PAPER_JAM';
type PrinterListener = (status: PrinterStatus, queueCount: number) => void;

class ThermalPrinterService {
  private status: PrinterStatus = 'CONNECTED';
  private printQueue: KotPrintJob[] = [];
  private listeners = new Set<PrinterListener>();

  subscribe(listener: PrinterListener) {
    this.listeners.add(listener);
    listener(this.status, this.printQueue.length);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.status, this.printQueue.length));
  }

  /**
   * Formats KOT ticket in ESC/POS raw command format (58mm / 80mm).
   */
  formatKotTicket(job: KotPrintJob): string {
    const divider = '================================';
    const lines = [
      '\x1B\x40', // ESC @ (Initialize printer)
      '\x1B\x61\x01', // Center align
      job.isReprint ? '*** DUPLICATE KOT REPRINT ***' : '*** KITCHEN ORDER TICKET (KOT) ***',
      `Order #${job.orderId.slice(0, 8).toUpperCase()}`,
      `Time: ${job.orderTime}`,
      divider,
      '\x1B\x61\x00', // Left align
      'QTY   ITEM',
      divider,
    ];

    job.items.forEach((item) => {
      lines.push(`${item.quantity.toString().padEnd(5)} ${item.name}`);
      if (item.specialInstructions) {
        lines.push(`      *NOTE: ${item.specialInstructions}`);
      }
    });

    lines.push(divider);
    lines.push('\x1B\x61\x01', 'Bocardo Partner Platform', '\x1D\x56\x41\x03'); // Cut paper

    return lines.join('\n');
  }

  /**
   * Queues and attempts to print a KOT ticket.
   */
  async printKot(job: KotPrintJob): Promise<boolean> {
    const rawContent = this.formatKotTicket(job);

    if (this.status !== 'CONNECTED') {
      console.warn(`🖨️ Printer ${this.status}. Queuing KOT for Order ${job.orderId} in local SQLite buffer.`);
      this.printQueue.push(job);
      this.notify();
      return false;
    }

    try {
      console.log('🖨️ [ESC/POS PRINTING KOT]:\n' + rawContent);
      return true;
    } catch (err) {
      console.error('🖨️ Thermal printer hardware error:', err);
      this.status = 'DISCONNECTED';
      this.printQueue.push(job);
      this.notify();
      return false;
    }
  }

  /**
   * Manual KOT Reprint button action.
   */
  async reprintKot(job: KotPrintJob): Promise<boolean> {
    return this.printKot({ ...job, isReprint: true });
  }

  /**
   * Flush queued jobs when printer reconnects.
   */
  async flushQueue(): Promise<void> {
    if (this.status !== 'CONNECTED') return;

    while (this.printQueue.length > 0) {
      const job = this.printQueue.shift();
      if (job) await this.printKot(job);
    }
    this.notify();
  }

  togglePrinterStatus() {
    this.status = this.status === 'CONNECTED' ? 'DISCONNECTED' : 'CONNECTED';
    console.log(`🖨️ Printer hardware status toggled to: ${this.status}`);
    if (this.status === 'CONNECTED') {
      this.flushQueue();
    }
    this.notify();
  }

  getStatus() {
    return this.status;
  }

  getQueueCount() {
    return this.printQueue.length;
  }
}

export const thermalPrinterService = new ThermalPrinterService();
