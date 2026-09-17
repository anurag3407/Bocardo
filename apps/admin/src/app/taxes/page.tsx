import React from 'react';
import { formatPaiseToRupees } from '@bocardo/shared-types';

export default function AdminTaxesPage() {
  const taxSummary = {
    grossFoodPaise: 120000000, // ₹12,00,000.00
    foodGst5Paise: 6000000, // ₹60,000.00 (Collected under Section 9(5) and remitted to Govt)
    platformFeesPaise: 1500000, // ₹15,000.00
    deliveryFeesPaise: 12000000, // ₹1,20,000.00
    serviceGst18Paise: 2430000, // ₹24,300.00 (18% on delivery + platform fee)
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">
          Section 9(5) CGST Dual-Tax Compliance Ledger
        </h1>
        <p className="text-sm text-slate-500">
          Statutory compliance audit report distinguishing Restaurant Food Invoices from Platform Convenience Services
        </p>
      </div>

      {/* Dual Invoice Architecture Explainer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-blue-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🏬</span>
            <h2 className="text-base font-bold text-slate-900">1. Restaurant Food Invoice (Sec 9(5))</h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Issued on behalf of restaurant partners. As an E-Commerce Operator (ECO), Bocardo collects
            5% Food GST from customers and deposits it directly with the GST Department under GSTR-8.
          </p>
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-500">Total 5% Food GST Remitted</span>
            <span className="text-lg font-black text-blue-600">
              {formatPaiseToRupees(taxSummary.foodGst5Paise)}
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">⚡</span>
            <h2 className="text-base font-bold text-slate-900">2. Platform Services Invoice</h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Issued directly by Bocardo for logistics, dispatch, and digital services. Subject to 18%
            GST on the sum of Delivery Fee and ₹5.00 Platform Service Fee.
          </p>
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-500">18% Service GST Payable</span>
            <span className="text-lg font-black text-emerald-600">
              {formatPaiseToRupees(taxSummary.serviceGst18Paise)}
            </span>
          </div>
        </div>
      </div>

      {/* Tax Audit Breakdown Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-black text-slate-900 mb-4">Current Month Dual-Tax Statement</h3>
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-slate-100 text-sm">
            <span className="text-slate-600">Gross Restaurant Food Sales (Excl. Tax)</span>
            <span className="font-bold text-slate-900">{formatPaiseToRupees(taxSummary.grossFoodPaise)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100 text-sm">
            <span className="text-slate-600">5% Section 9(5) CGST / SGST Remittance</span>
            <span className="font-bold text-blue-600">{formatPaiseToRupees(taxSummary.foodGst5Paise)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100 text-sm">
            <span className="text-slate-600">Platform Convenience Fees Collected (₹5 / order)</span>
            <span className="font-bold text-slate-900">{formatPaiseToRupees(taxSummary.platformFeesPaise)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100 text-sm">
            <span className="text-slate-600">Delivery Partner Logistics Fees</span>
            <span className="font-bold text-slate-900">{formatPaiseToRupees(taxSummary.deliveryFeesPaise)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100 text-sm">
            <span className="text-slate-600">18% GST on Logistics + Platform Fees</span>
            <span className="font-bold text-emerald-600">{formatPaiseToRupees(taxSummary.serviceGst18Paise)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
