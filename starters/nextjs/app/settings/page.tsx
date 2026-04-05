import Link from 'next/link';

export default function Settings() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="w-full max-w-2xl">
        <h1 className="text-4xl font-bold mb-8 text-center">Settings</h1>
        
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 mb-8">
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            This is the Settings page. Navigation between pages is working correctly!
          </p>
          
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
            <p className="text-green-700 dark:text-green-400 font-semibold">
              ✅ Navigation is working!
            </p>
            <p className="text-green-600 dark:text-green-500 text-sm mt-1">
              You successfully navigated from the Dashboard to Settings.
            </p>
          </div>
          
          <div className="space-y-4">
            <Link 
              href="/"
              className="block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors text-center"
            >
              ← Back to Home
            </Link>
            
            <Link 
              href="/dashboard"
              className="block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors text-center"
            >
              → Go to Dashboard
            </Link>
          </div>
        </div>

        <div className="border-t border-gray-300 dark:border-gray-700 pt-8">
          <h2 className="text-2xl font-semibold mb-4">Navigation Flow</h2>
          <ul className="text-gray-600 dark:text-gray-400 space-y-2">
            <li>✓ Home → Dashboard</li>
            <li>✓ Dashboard → Settings</li>
            <li>✓ Settings → Home/Dashboard</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
