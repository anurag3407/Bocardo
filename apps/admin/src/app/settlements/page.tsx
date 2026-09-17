'use client';

import React, { useState } from 'react';
import { formatPaiseToRupees, SettlementStatus } from '@bocardo/shared-types';

interface SettlementRecord {
  id: string;
  partnerName: string;
  startDate: string;
  endDate: string;
  grossAmountPaise: number;
  commissionDeductedPaise: number;
  netPayoutPaise: number;
  status: SettlementStatus;
  bankUtrReference?: string;
  accountNumber: string;
  ifscCode: string;
}

const INITIAL_SETTLEMENTS: SettlementRecord[] = [
  {
    id: 'stl-9812-uuid',
    partnerName: 'Biryani Bliss & Kebabs',
    startDate: '2026-09-10',
    endDate: '2026-09-17',
    grossAmountPaise: 4200000, // ₹42,000.00
    commissionDeductedPaise: 630000, // 15% = ₹6,300.00
    netPayoutPaise: 3570000, // ₹35,700.00
    status: SettlementStatus.PENDING,
    accountNumber: '50200098128412',
    ifscCode: 'HDFC0001234',
  },
  {
    id: 'stl-9810-uuid',
    partnerName: 'South Kitchen Tiffin Express',
    startDate: '2026-09-10',
    endDate: '2026-09-17',
    grossAmountPaise: 2800000, // ₹28,000.00
    commissionDeductedPaise: 350000, // 12.5% = ₹3,500.00
    netPayoutPaise: 2450000, // ₹24,500.00
    status: SettlementStatus.PAID,
    bankUtrReference: 'HDFCN2628192019',
    accountNumber: '002805001294',
    ifscCode: 'ICIC0000028',
  },
];

export default function AdminSettlementsPage() {
  const [settlements, setSettlements] = useState<SettlementRecord[]>(INITIAL_SETTLEMENTS);
  const [selectedRecord, setSelectedRecord] = useState<SettlementRecord | null>(null);
  const [utrInput, setUtrInput] = useState('');

  const handleDownloadCsv = () => {
    const headers = 'Beneficiary Name,Account Number,IFSC Code,Amount INR,Settlement ID\n';
    const rows = settlements
      .filter((s) => s.status === SettlementStatus.PENDING)
      .map(
        (s) =>
          `"${s.partnerName}","${s.accountNumber}","${s.ifscCode}",${(
            s.netPayoutPaise / 100
          ).toFixed(2)},"${s.id}"`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bocardo_settlements_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleReconcileUtr = () => {
    if (!selectedRecord || !utrInput) return;

    setSettlements((prev) =>
      prev.map((s) =>
        s.id === selectedRecord.id
          ? { ...s, status: SettlementStatus.PAID, bankUtrReference: utrInput }
          : s
      )
    );

    setSelectedRecord(null);
    setUtrInput('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Weekly Offline Settlements Ledger</h1>
          <p className="text-sm text-slate-500">
            Net Payout = Food Subtotal - Commission (15%) - TDS/TCS. Batch corporate CSV and UTR entry.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleDownloadCsv}
            className="px-4 py-2 bg-slate-900 text-white font-bold text-sm rounded-xl hover:bg-slate-800 transition flex items-center gap-2"
          >
            <span>📥</span> Export Bank Transfer CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="px-6 py-4">Partner</th>
              <th className="px-6 py-4">Cycle</th>
              <th className="px-6 py-4">Gross Sales</th>
              <th className="px-6 py-4">Commission (15%)</th>
              <th className="px-6 py-4">Net Payout</th>
              <th className="px-6 py-4">Status & UTR</th>
              <th className="px-6 py-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {settlements.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <p className="font-bold text-slate-900">{s.partnerName}</p>
                  <p className="text-xs text-slate-400 font-mono">
                    {s.accountNumber} ({s.ifscCode})
                  </p>
                </td>
                <td className="px-6 py-4 text-xs text-slate-500">
                  {s.startDate} → {s.endDate}
                </td>
                <td className="px-6 py-4 font-bold text-slate-700">
                  {formatPaiseToRupees(s.grossAmountPaise)}
                </td>
                <td className="px-6 py-4 font-semibold text-rose-600">
                  -{formatPaiseToRupees(s.commissionDeductedPaise)}
                </td>
                <td className="px-6 py-4 font-black text-slate-900 text-base">
                  {formatPaiseToRupees(s.netPayoutPaise)}
                </td>
                <td className="px-6 py-4">
                  {s.status === SettlementStatus.PAID ? (
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                        PAID
                      </span>
                      <p className="text-[10px] font-mono font-bold text-slate-500 mt-1">
                        UTR: {s.bankUtrReference}
                      </p>
                    </div>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                      PENDING TRANSFER
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {s.status === SettlementStatus.PENDING && (
                    <button
                      onClick={() => setSelectedRecord(s)}
                      className="px-3 py-1.5 bg-bocardo-500 text-white font-bold text-xs rounded-lg hover:bg-bocardo-600 transition"
                    >
                      Enter Bank UTR
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* UTR Reconciliation Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-black text-slate-900">Reconcile Bank Payout</h3>
            <p className="text-xs text-slate-500 mt-1">
              Mark payout of {formatPaiseToRupees(selectedRecord.netPayoutPaise)} to{' '}
              {selectedRecord.partnerName} as completed.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Bank UTR (Transaction Reference Number)
              </label>
              <input
                type="text"
                placeholder="e.g. HDFCN2628192019"
                value={utrInput}
                onChange={(e) => setUtrInput(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-bocardo-500"
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 rounded-xl text-slate-600 font-bold text-sm hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleReconcileUtr}
                disabled={!utrInput}
                className="px-4 py-2 bg-emerald-600 text-white font-bold text-sm rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                Confirm & Mark PAID ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
