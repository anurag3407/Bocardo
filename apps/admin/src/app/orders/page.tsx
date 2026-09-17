import React from 'react';
import { formatPaiseToRupees, OrderStatus } from '@bocardo/shared-types';

const DEMO_ADMIN_ORDERS = [
  {
    id: 'ord-8102-uuid-9812',
    customerName: 'Anurag Mishra',
    customerPhone: '+91 98*** **210',
    restaurantName: 'Biryani Bliss & Kebabs',
    status: OrderStatus.PREPARING,
    totalAmountPaise: 78000,
    deliveryOtp: '4819',
    razorpayOrderId: 'order_mock_81029812',
    createdAt: '12:42 PM',
  },
  {
    id: 'ord-8099-uuid-7714',
    customerName: 'Priya Sharma',
    customerPhone: '+91 97*** **432',
    restaurantName: 'South Kitchen Tiffin Express',
    status: OrderStatus.OUT_FOR_DELIVERY,
    totalAmountPaise: 34000,
    deliveryOtp: '9214',
    razorpayOrderId: 'order_mock_80997714',
    createdAt: '12:35 PM',
  },
  {
    id: 'ord-8095-uuid-6652',
    customerName: 'Vikram Rao',
    customerPhone: '+91 99*** **888',
    restaurantName: 'Biryani Bliss & Kebabs',
    status: OrderStatus.DELIVERED,
    totalAmountPaise: 32000,
    deliveryOtp: '1104',
    razorpayOrderId: 'order_mock_80956652',
    createdAt: '12:28 PM',
  },
];

export default function AdminOrdersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Real-Time Orders Stream</h1>
          <p className="text-sm text-slate-500">
            Monitoring active orders across all restaurants with BOLA audit trails
          </p>
        </div>
        <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-full">
          Auto-Refreshing
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="px-6 py-4">Order ID</th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Restaurant</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Amount</th>
              <th className="px-6 py-4">Handover OTP</th>
              <th className="px-6 py-4">Razorpay ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {DEMO_ADMIN_ORDERS.map((order) => (
              <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-mono font-bold text-slate-900">
                  #{order.id.slice(0, 8).toUpperCase()}
                </td>
                <td className="px-6 py-4">
                  <p className="font-bold text-slate-900">{order.customerName}</p>
                  <p className="text-xs text-slate-400">{order.customerPhone}</p>
                </td>
                <td className="px-6 py-4 font-semibold text-slate-800">
                  {order.restaurantName}
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    {order.status}
                  </span>
                </td>
                <td className="px-6 py-4 font-black text-slate-900">
                  {formatPaiseToRupees(order.totalAmountPaise)}
                </td>
                <td className="px-6 py-4">
                  <span className="font-mono bg-amber-50 px-2 py-1 rounded border border-amber-200 font-black text-amber-800">
                    {order.deliveryOtp}
                  </span>
                </td>
                <td className="px-6 py-4 font-mono text-xs text-slate-500">
                  {order.razorpayOrderId}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
