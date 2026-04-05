'use client';

import { useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function Home() {
  const router = useRouter();
  const webcamRef = useRef<Webcam>(null);
  
  // Form state
  const [driveUrl, setDriveUrl] = useState('');
  const [email, setEmail] = useState('');
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Capture selfie from webcam
  const captureSelfie = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setSelfieImage(imageSrc);
      setShowCamera(false);
    }
  }, [webcamRef]);

  // Retake selfie
  const retakeSelfie = () => {
    setSelfieImage(null);
    setShowCamera(true);
  };

  // Validate Drive URL
  const validateDriveUrl = (url: string): boolean => {
    return url.includes('drive.google.com/drive/folders/');
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validation
    if (!validateDriveUrl(driveUrl)) {
      setError('Please enter a valid Google Drive folder URL');
      return;
    }
    
    if (!selfieImage) {
      setError('Please take a selfie');
      return;
    }
    
    setLoading(true);
    
    try {
      // Extract base64 from data URL
      const base64Image = selfieImage.split(',')[1];
      
      // Submit job
      const response = await axios.post(`${API_URL}/api/submit-job`, {
        drive_folder_url: driveUrl,
        selfie_base64: base64Image,
        user_email: email || null
      });
      
      const { job_id } = response.data;
      
      // Redirect to processing page
      router.push(`/process/${job_id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to submit job. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <h1 className="text-3xl font-bold text-gray-900">
            Who<span className="text-purple-600">Dis</span>
          </h1>
          <p className="text-gray-600 mt-1">Find all your photos instantly</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Get Your Photos in 3 Easy Steps
          </h2>
          <p className="text-gray-600 mb-8">
            Share your Drive folder, take a selfie, and we'll find all photos with you
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Step 1: Drive URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Step 1: Paste your Google Drive folder link
              </label>
              <input
                type="url"
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
              <p className="text-sm text-gray-500 mt-2">
                Make sure your folder is set to "Anyone with the link can view"
              </p>
            </div>

            {/* Step 2: Selfie */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Step 2: Take a selfie
              </label>
              
              {!showCamera && !selfieImage && (
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="w-full py-3 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                >
                  📷 Open Camera
                </button>
              )}

              {showCamera && !selfieImage && (
                <div className="space-y-4">
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    className="w-full rounded-lg"
                    videoConstraints={{
                      width: 1280,
                      height: 720,
                      facingMode: "user"
                    }}
                  />
                  <button
                    type="button"
                    onClick={captureSelfie}
                    className="w-full py-3 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                  >
                    📸 Capture
                  </button>
                </div>
              )}

              {selfieImage && (
                <div className="space-y-4">
                  <img 
                    src={selfieImage} 
                    alt="Your selfie" 
                    className="w-full rounded-lg border-2 border-purple-200"
                  />
                  <button
                    type="button"
                    onClick={retakeSelfie}
                    className="w-full py-2 px-4 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                  >
                    🔄 Retake
                  </button>
                </div>
              )}
            </div>

            {/* Step 3: Email (Optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Step 3: Email (optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-sm text-gray-500 mt-2">
                We'll email you when processing is complete (optional)
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !driveUrl || !selfieImage}
              className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : '🚀 Find My Photos'}
            </button>
          </form>
        </div>

        {/* How It Works */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-3xl mb-3">🔍</div>
            <h3 className="font-semibold mb-2">Smart Face Recognition</h3>
            <p className="text-sm text-gray-600">
              We use advanced AI to find every photo with you
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-3xl mb-3">🔒</div>
            <h3 className="font-semibold mb-2">100% Private</h3>
            <p className="text-sm text-gray-600">
              We never store your photos. They stay in your Drive.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="font-semibold mb-2">Super Fast</h3>
            <p className="text-sm text-gray-600">
              Get your organized photos in minutes, not hours
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
