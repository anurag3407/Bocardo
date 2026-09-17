import React from 'react';
import { formatPaiseToRupees } from '@bocardo/shared-types';

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Today's GMV</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{formatPaiseToRupees(14285000)}</p>
          <p className="text-xs text-emerald-600 font-bold mt-2">↑ 18.4% from last week</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Active Orders</p>
          <p className="text-3xl font-black text-slate-900 mt-2">38</p>
          <p className="text-xs text-slate-500 font-medium mt-2">12 Preparing • 18 Out for Delivery</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Online Riders</p>
          <p className="text-3xl font-black text-slate-900 mt-2">24</p>
          <p className="text-xs text-emerald-600 font-bold mt-2">91.6% sequential dispatch acceptance</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Platform Take-Rate</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{formatPaiseToRupees(2142750)}</p>
          <p className="text-xs text-slate-500 font-medium mt-2">15% avg hotel commission + ₹5 fee</p>
        </div>
      </div>

      {/* Live City Operations Map & Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">Bangalore Spatial Live Map</h2>
              <p className="text-xs text-slate-500">PostGIS 4326 Coordinate Feed & Redis GPS Streams</p>
            </div>
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full">
              Live Streaming (3s interval)
            </span>
          </div>

          {/* Interactive Map Visualizer */}
          <div className="h-96 bg-slate-900 rounded-xl relative overflow-hidden flex items-center justify-center border border-slate-800">
            {/* Grid Lines */}
            <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:30px_30px]" />

            {/* Simulated Live Entities */}
            <div className="absolute top-1/4 left-1/3 flex flex-col items-center">
              <span className="text-2xl animate-pulse">🏬</span>
              <span className="text-[10px] font-black bg-white px-1.5 py-0.5 rounded text-slate-900 shadow">
                Biryani Bliss (Indiranagar)
              </span>
            </div>

            <div className="absolute top-1/3 left-1/2 flex flex-col items-center">
              <span className="text-xl">🛵</span>
              <span className="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded shadow">
                Rider Ramesh (32 km/h)
              </span>
            </div>

            <div className="absolute bottom-1/4 right-1/3 flex flex-col items-center">
              <span className="text-2xl">📍</span>
              <span className="text-[10px] font-black bg-emerald-500 text-white px-1.5 py-0.5 rounded shadow">
                Customer (Indiranagar 100ft)
              </span>
            </div>

            <div className="absolute bottom-4 left-4 bg-slate-800/90 backdrop-blur px-4 py-2 rounded-lg text-xs text-slate-300 font-mono">
              PostGIS Centroid: 12.9716° N, 77.6408° E • ST_DWithin(4000m)
            </div>
          </div>
        </div>

        {/* Real-Time Telemetry & Audit Stream */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
          <h2 className="text-lg font-black text-slate-900 mb-4">Operations Audit Log</h2>
          <div className="space-y-4 flex-1 overflow-y-auto">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <p className="text-xs font-black text-emerald-900">OTP Handover Verified</p>
              <p className="text-xs text-emerald-700 mt-1">
                Order #ORD-8095 delivered. 4-digit code '4819' matched.
              </p>
              <span className="text-[10px] text-emerald-500 font-semibold">1 minute ago</span>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-xs font-black text-blue-900">1-to-1 Dispatch Accepted</p>
              <p className="text-xs text-blue-700 mt-1">
                Rider Ramesh Kumar accepted Order #ORD-8102 in 14s.
              </p>
              <span className="text-[10px] text-blue-500 font-semibold">3 minutes ago</span>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs font-black text-amber-900">Ghost Restaurant Check</p>
              <p className="text-xs text-amber-700 mt-1">
                Biryani Bliss accepted incoming order within 22s. Auto-refund disabled.
              </p>
              <span className="text-[10px] text-amber-500 font-semibold">5 minutes ago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
