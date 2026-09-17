import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'Bocardo Operations & Settlement Portal',
  description: 'Enterprise operations, real-time dispatch, and Section 9(5) CGST ledger',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
        {/* Sidebar */}
        <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between border-r border-slate-800">
          <div>
            <div className="p-6 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚡</span>
                <h1 className="text-xl font-black tracking-tight text-white">
                  Bocardo <span className="text-bocardo-500">Ops</span>
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-1">HQ Operations & Financial Ledger</p>
            </div>

            <nav className="p-4 space-y-1">
              <Link
                href="/"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <span>🗺️</span>
                <span>Live City Map</span>
              </Link>
              <Link
                href="/orders"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <span>📦</span>
                <span>Orders Stream</span>
              </Link>
              <Link
                href="/restaurants"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <span>🏬</span>
                <span>Restaurant Partners</span>
              </Link>
              <Link
                href="/settlements"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <span>💰</span>
                <span>Weekly Settlements</span>
              </Link>
              <Link
                href="/taxes"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <span>🧾</span>
                <span>Section 9(5) Taxes</span>
              </Link>
            </nav>
          </div>

          <div className="p-4 border-t border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-bocardo-500 flex items-center justify-center font-bold text-white text-sm">
                AM
              </div>
              <div>
                <p className="text-sm font-bold text-white">Anurag Mishra</p>
                <p className="text-xs text-emerald-400 font-semibold">● Platform Admin</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-y-auto">
          <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                ● Fastify Gateway: Connected (Port 3000)
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
                ● PostGIS 16: Active
              </span>
            </div>
            <div className="text-xs font-medium text-slate-500">
              Bangalore UTC+05:30 • Live Telemetry
            </div>
          </header>

          <div className="p-8 flex-1">{children}</div>
        </main>
      </body>
    </html>
  );
}
