'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface JobResult {
  job_id: string;
  status: string;
  matched_images: number;
  folder_url: string;
  preview_urls: string[];
}

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.jobId as string;
  
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;

    const fetchResults = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/results/${jobId}`);
        setResult(response.data);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to fetch results');
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [jobId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading results...</p>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-red-500 text-5xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-6">{error || 'Results not found'}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            Start New Search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <h1 className="text-3xl font-bold text-gray-900">
            Who<span className="text-purple-600">Dis</span>
          </h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Success Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          {/* Success Icon */}
          <div className="text-center mb-6">
            <div className="text-green-500 text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Found {result.matched_images} Photos!
            </h2>
            <p className="text-gray-600">
              Your photos have been organized and are ready to download
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <a
              href={result.folder_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-4 px-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition text-center"
            >
              📁 Open in Google Drive
            </a>
            <button
              onClick={() => router.push('/')}
              className="flex-1 py-4 px-6 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition"
            >
              🔄 Search Again
            </button>
          </div>

          {/* Preview Gallery */}
          {result.preview_urls.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Preview (first {result.preview_urls.length} photos)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {result.preview_urls.map((url, index) => (
                  <div
                    key={index}
                    className="aspect-square rounded-lg overflow-hidden shadow-md hover:shadow-lg transition"
                  >
                    <img
                      src={url}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
              {result.matched_images > result.preview_urls.length && (
                <p className="text-center text-gray-500 mt-4 text-sm">
                  + {result.matched_images - result.preview_urls.length} more photos in your folder
                </p>
              )}
            </div>
          )}
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="font-semibold text-gray-900 mb-2">What happens next?</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>✓ Your photos are now in a private Google Drive folder</li>
              <li>✓ You have full access to view and download them</li>
              <li>✓ The folder will be automatically deleted after 7 days</li>
              <li>✓ We never store your images - 100% privacy guaranteed</li>
            </ul>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="font-semibold text-gray-900 mb-2">Need help?</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>• Can't find all your photos? Try a clearer selfie</li>
              <li>• Photos in wrong folder? Check Drive sharing settings</li>
              <li>• Want to search again? Click "Search Again" above</li>
              <li>• Questions? Contact support@whodis.app</li>
            </ul>
          </div>
        </div>

        {/* Share Section */}
        <div className="mt-8 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg p-8 text-center text-white">
          <h3 className="text-2xl font-bold mb-2">Love WhoDis?</h3>
          <p className="mb-4">Share it with friends and family!</p>
          <div className="flex justify-center gap-4">
            <button className="bg-white text-purple-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition">
              Share on Twitter
            </button>
            <button className="bg-white text-purple-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition">
              Copy Link
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
