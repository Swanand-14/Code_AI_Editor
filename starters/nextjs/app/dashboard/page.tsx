import Link from 'next/link';

export default function Dashboard() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="w-full max-w-2xl">
        <h1 className="text-4xl font-bold mb-8 text-center">Dashboard</h1>
        
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 mb-8">
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            Welcome to the Dashboard! You successfully navigated from the home page.
          </p>
          
          <div className="space-y-4">
            <Link 
              href="/"
              className="block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors text-center"
            >
              ← Back to Home
            </Link>
            
            <Link 
              href="/settings"
              className="block px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors text-center"
            >
              Go to Settings
            </Link>
          </div>
        </div>

        <div className="border-t border-gray-300 dark:border-gray-700 pt-8">
          <h2 className="text-2xl font-semibold mb-4">Test Navigation</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Try clicking the links above to test page navigation in your Next.js app.
          </p>
        </div>
      </div>
    </main>
  );
}
