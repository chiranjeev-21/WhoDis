'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface JobStatus {
  job_id: string;
  status: string;
  progress: number;
  total_images: number | null;
  matched_images: number | null;
  current_message: string | null;
  result_folder_url: string | null;
  error_message: string | null;
}

export default function ProcessPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.jobId as string;
  
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState('');

  // Poll for job status
  useEffect(() => {
    if (!jobId) return;

    const pollStatus = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/job-status/${jobId}`);
        const status = response.data;
        
        setJobStatus(status);
        
        // If completed, redirect to results
        if (status.status === 'completed') {
          setTimeout(() => {
            router.push(`/results/${jobId}`);
          }, 2000);
        }
        
        // If failed, show error
        if (status.status === 'failed') {
          setError(status.error_message || 'Processing failed');
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to fetch job status');
      }
    };

    // Poll every 2 seconds
    const interval = setInterval(pollStatus, 2000);
    
    // Initial poll
    pollStatus();
    
    return () => clearInterval(interval);
  }, [jobId, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-red-500 text-5xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Processing Failed</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!jobStatus) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        {/* Status Icon */}
        <div className="text-center mb-6">
          {jobStatus.status === 'pending' && (
            <div className="text-yellow-500 text-5xl">⏳</div>
          )}
          {jobStatus.status === 'processing' && (
            <div className="text-purple-500 text-5xl animate-pulse">🔍</div>
          )}
          {jobStatus.status === 'completed' && (
            <div className="text-green-500 text-5xl">✅</div>
          )}
        </div>

        {/* Status Title */}
        <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
          {jobStatus.status === 'pending' && 'In Queue...'}
          {jobStatus.status === 'processing' && 'Processing Your Photos'}
          {jobStatus.status === 'completed' && 'All Done!'}
        </h2>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Progress</span>
            <span>{jobStatus.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-purple-600 to-blue-600 h-3 rounded-full transition-all duration-500"
              style={{ width: `${jobStatus.progress}%` }}
            />
          </div>
        </div>

        {/* Current Message */}
        {jobStatus.current_message && (
          <p className="text-center text-gray-600 mb-6">
            {jobStatus.current_message}
          </p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {jobStatus.total_images !== null && (
            <div className="bg-purple-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-600">
                {jobStatus.total_images}
              </div>
              <div className="text-sm text-gray-600">Total Images</div>
            </div>
          )}
          {jobStatus.matched_images !== null && (
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {jobStatus.matched_images}
              </div>
              <div className="text-sm text-gray-600">Matches Found</div>
            </div>
          )}
        </div>

        {/* Completed State */}
        {jobStatus.status === 'completed' && (
          <div className="text-center">
            <p className="text-gray-600 mb-4">
              Redirecting to results...
            </p>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
          </div>
        )}

        {/* Processing State */}
        {jobStatus.status === 'processing' && (
          <p className="text-center text-sm text-gray-500">
            This may take a few minutes. Don't close this page!
          </p>
        )}
      </div>
    </div>
  );
}
