'use client';

import { useCallback, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const steps = ['Paste folder', 'Take selfie', 'Get results'];

export default function Home() {
  const router = useRouter();
  const webcamRef = useRef<Webcam>(null);

  const [driveUrl, setDriveUrl] = useState('');
  const [email, setEmail] = useState('');
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const inputClassName =
    'w-full rounded-2xl border border-white/10 bg-[#09111f] px-4 py-4 text-[15px] text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-[#0c1628]';

  const captureSelfie = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();

    if (imageSrc) {
      setSelfieImage(imageSrc);
      setShowCamera(false);
    }
  }, []);

  const retakeSelfie = () => {
    setSelfieImage(null);
    setShowCamera(true);
  };

  const validateDriveUrl = (url: string): boolean => {
    return url.includes('drive.google.com/drive/folders/');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateDriveUrl(driveUrl)) {
      setError('Paste a valid Google Drive folder link.');
      return;
    }

    if (!selfieImage) {
      setError('Take one selfie first.');
      return;
    }

    setLoading(true);

    try {
      const base64Image = selfieImage.split(',')[1];
      const response = await axios.post(`${API_URL}/api/submit-job`, {
        drive_folder_url: driveUrl,
        selfie_base64: base64Image,
        user_email: email || null,
      });

      router.push(`/process/${response.data.job_id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Submission failed. Try again.');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-drift absolute -left-20 top-16 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="animate-float absolute right-[-5rem] top-24 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between py-2">
          <div className="flex items-center gap-4">
            <div className="ring-glow flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/10 text-sm font-semibold tracking-[0.24em] text-cyan-100">
              WD
            </div>
            <div>
              <p className="font-display text-2xl font-semibold text-white">WhoDis</p>
              <p className="text-sm text-slate-500">Find your shots fast.</p>
            </div>
          </div>

          <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
            Google Drive
          </div>
        </header>

        <section className="grid flex-1 gap-12 py-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="max-w-2xl space-y-8">
            <span className="eyebrow">
              <span className="h-2 w-2 rounded-full bg-cyan-300" />
              Minimal photo sorting
            </span>

            <div className="space-y-5">
              <h1 className="max-w-3xl text-balance font-display text-5xl font-semibold leading-[0.92] text-white sm:text-6xl lg:text-[4.75rem]">
                Paste a folder. Take a selfie. Get your photos.
              </h1>
              <p className="max-w-xl text-lg leading-8 text-slate-300 sm:text-xl">
                WhoDis finds the photos with you in them and puts them in one clean result folder.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {steps.map((step, index) => (
                <div
                  key={step}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-slate-200"
                >
                  <span className="mr-2 text-slate-500">0{index + 1}</span>
                  {step}
                </div>
              ))}
            </div>

            <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
              Originals stay in Drive.
            </p>
          </div>

          <section id="scan-form" className="relative">
            <div className="panel relative rounded-[2rem] p-5 sm:p-6">
              <div className="mb-6 flex items-start justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">New scan</p>
                  <h2 className="mt-2 font-display text-3xl font-semibold text-white">Start here</h2>
                </div>
                <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
                  Ready
                </div>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="panel-soft rounded-[1.5rem] p-4">
                  <label className="mb-3 block text-sm font-medium text-slate-300">Drive folder</label>
                  <input
                    type="url"
                    value={driveUrl}
                    onChange={(e) => setDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className={inputClassName}
                    required
                  />
                </div>

                <div className="panel-soft rounded-[1.5rem] p-4">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <label className="text-sm font-medium text-slate-300">Selfie</label>
                    {selfieImage && <span className="text-xs uppercase tracking-[0.16em] text-cyan-200">Captured</span>}
                  </div>

                  {!showCamera && !selfieImage && (
                    <button
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="ghost-button flex w-full items-center justify-between px-5 py-4 text-left"
                    >
                      <span className="text-slate-200">Open camera</span>
                      <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Launch</span>
                    </button>
                  )}

                  {showCamera && !selfieImage && (
                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#050b15] p-2">
                        <div className="relative overflow-hidden rounded-[1.1rem]">
                          <Webcam
                            ref={webcamRef}
                            audio={false}
                            screenshotFormat="image/jpeg"
                            className="aspect-[4/5] w-full object-cover"
                            videoConstraints={{
                              width: 1280,
                              height: 720,
                              facingMode: 'user',
                            }}
                          />
                          <div className="pointer-events-none absolute inset-0 border-[18px] border-black/20" />
                          <div className="pointer-events-none absolute inset-x-[18%] top-[14%] bottom-[12%] rounded-[2rem] border border-cyan-300/30" />
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={captureSelfie}
                          className="accent-button flex-1 px-6 py-4 text-sm uppercase tracking-[0.16em]"
                        >
                          Capture
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCamera(false)}
                          className="ghost-button px-6 py-4 text-sm uppercase tracking-[0.16em]"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )}

                  {selfieImage && (
                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-[1.5rem] border border-cyan-300/15 bg-[#050b15] p-2">
                        <img
                          src={selfieImage}
                          alt="Captured selfie"
                          className="aspect-[4/5] w-full rounded-[1.1rem] object-cover"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={retakeSelfie}
                        className="ghost-button w-full px-5 py-3 text-sm uppercase tracking-[0.16em]"
                      >
                        Retake
                      </button>
                    </div>
                  )}
                </div>

                <div className="panel-soft rounded-[1.5rem] p-4">
                  <label className="mb-3 block text-sm font-medium text-slate-300">Email optional</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    className={inputClassName}
                  />
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-400/25 bg-red-400/10 px-5 py-4 text-sm leading-6 text-red-100">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !driveUrl || !selfieImage}
                  className="accent-button w-full px-6 py-5 text-sm uppercase tracking-[0.18em] disabled:pointer-events-none disabled:opacity-60"
                >
                  {loading ? 'Launching scan' : 'Find my photos'}
                </button>
              </form>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
