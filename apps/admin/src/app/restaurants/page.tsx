import React from 'react';

const DEMO_RESTAURANTS = [
  {
    id: 'rest-1-uuid',
    name: 'Biryani Bliss & Kebabs',
    slug: 'biryani-bliss-indiranagar',
    phone: '+91 80 4123 4567',
    gstin: '29AAAAA0000A1Z5',
    commissionRate: 15.0,
    isActive: true,
    isAcceptingOrders: true,
    rating: 4.6,
    address: '100 Feet Rd, HAL 2nd Stage, Indiranagar',
    coords: '12.9719° N, 77.6412° E',
  },
  {
    id: 'rest-2-uuid',
    name: 'South Kitchen Tiffin Express',
    slug: 'south-kitchen-indiranagar',
    phone: '+91 80 4987 6543',
    gstin: '29BBBBB1111B2Z6',
    commissionRate: 12.5,
    isActive: true,
    isAcceptingOrders: true,
    rating: 4.4,
    address: '12th Main Rd, Indiranagar',
    coords: '12.9740° N, 77.6385° E',
  },
];

export default function AdminRestaurantsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Restaurant Partners</h1>
          <p className="text-sm text-slate-500">
            Onboarding, GSTIN compliance, commission rates, and kitchen status
          </p>
        </div>
        <button className="px-4 py-2 bg-bocardo-500 text-white font-bold text-sm rounded-xl hover:bg-bocardo-600 transition">
          + Onboard New Restaurant
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="px-6 py-4">Restaurant</th>
              <th className="px-6 py-4">GSTIN & Compliance</th>
              <th className="px-6 py-4">Commission</th>
              <th className="px-6 py-4">PostGIS Geo</th>
              <th className="px-6 py-4">Rating</th>
              <th className="px-6 py-4">Kitchen Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {DEMO_RESTAURANTS.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <p className="font-bold text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-400">{r.address}</p>
                </td>
                <td className="px-6 py-4">
                  <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded text-slate-700 font-bold">
                    {r.gstin}
                  </span>
                </td>
                <td className="px-6 py-4 font-black text-slate-900">
                  {r.commissionRate}%
                </td>
                <td className="px-6 py-4 font-mono text-xs text-slate-500">
                  {r.coords}
                </td>
                <td className="px-6 py-4 font-bold text-emerald-600">
                  ★ {r.rating}
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                    Accepting Orders
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
