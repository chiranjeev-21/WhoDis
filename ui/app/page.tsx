'use client';

import { useCallback, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const metrics = [
  { value: '2-3 min', label: 'average run from link to results' },
  { value: '1 selfie', label: 'needed to lock your face' },
  { value: '0 manual sorting', label: 'left for your group album' },
];

const features = [
  {
    title: 'Built for shared chaos',
    copy: 'Trips, weddings, college events, festival drops. Paste the folder and let the model do the cleanup.',
  },
  {
    title: 'Private by default',
    copy: 'WhoDis scans what is already in Drive and gives you a cleaner result folder back. No giant re-upload step.',
  },
  {
    title: 'Feels instant',
    copy: 'The interface is tuned like a product dashboard, not a hacked-together upload page.',
  },
];

const steps = [
  'Paste the Google Drive folder',
  'Snap one clear front-facing selfie',
  'Open your curated results gallery',
];

const previewCards = [
  { label: 'Pool day dump', stat: '146 photos' },
  { label: 'Weekend trip', stat: '38 matches' },
  { label: 'Night out set', stat: 'Ready to post' },
];

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
      setError('Paste a valid Google Drive folder link so we know what to scan.');
      return;
    }

    if (!selfieImage) {
      setError('Take one selfie first so WhoDis knows which face to track.');
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
      setError(err.response?.data?.detail || 'Submission failed. Try again in a moment.');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 subtle-grid opacity-30" />
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-drift absolute -left-16 top-20 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="animate-float absolute right-[-4rem] top-24 h-80 w-80 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="animate-drift absolute bottom-[-5rem] left-1/3 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      <main className="relative mx-auto max-w-7xl px-5 pb-16 pt-6 sm:px-8 lg:px-10">
        <header className="panel-soft flex flex-col gap-4 rounded-full px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="ring-glow flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/35 bg-cyan-400/10 text-sm font-semibold tracking-[0.24em] text-cyan-100">
              WD
            </div>
            <div>
              <p className="font-display text-2xl font-semibold">WhoDis</p>
              <p className="text-sm text-slate-400">AI photo sorting for people who are done digging.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">Google Drive</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">Face Match</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">Private Output</span>
          </div>
        </header>

        <section className="grid gap-10 pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-8">
            <div className="space-y-6">
              <span className="eyebrow">
                <span className="h-2 w-2 rounded-full bg-cyan-300" />
                Face-first photo retrieval
              </span>

              <div className="space-y-5">
                <h1 className="max-w-4xl text-balance font-display text-5xl font-semibold leading-[0.92] text-white sm:text-6xl lg:text-[5rem]">
                  Find every photo of you in the shared folder without scrolling for an hour.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
                  Drop in the Drive link, give the model one clean selfie, and get a polished results folder back in minutes.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <a href="#scan-form" className="accent-button px-6 py-4 text-center text-sm uppercase tracking-[0.16em]">
                  Start the scan
                </a>
                <div className="ghost-button flex items-center justify-center px-6 py-4 text-sm uppercase tracking-[0.16em] text-slate-200">
                  No account setup required
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {metrics.map((metric) => (
                <div key={metric.label} className="panel-soft rounded-3xl p-5">
                  <p className="font-display text-3xl font-semibold text-white">{metric.value}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{metric.label}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.title} className="panel-soft rounded-3xl p-6">
                  <div className="mb-4 h-10 w-10 rounded-2xl bg-gradient-to-br from-cyan-400/25 to-violet-500/25" />
                  <h2 className="text-xl font-semibold text-white">{feature.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-400">{feature.copy}</p>
                </div>
              ))}
            </div>

            <div className="panel rounded-[2rem] p-6 sm:p-8">
              <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">How it works</p>
                  <h2 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl">
                    A clean three-step flow instead of a clunky upload maze.
                  </h2>

                  <div className="mt-6 space-y-4">
                    {steps.map((step, index) => (
                      <div key={step} className="panel-soft rounded-[1.5rem] p-4">
                        <div className="flex items-start gap-4">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-sm font-semibold text-cyan-100">
                            0{index + 1}
                          </span>
                          <div>
                            <p className="text-lg font-semibold text-white">{step}</p>
                            <p className="mt-1 text-sm text-slate-400">
                              {index === 0 && 'Use a shared Google Drive folder link.'}
                              {index === 1 && 'One selfie is enough to lock your identity.'}
                              {index === 2 && 'Open the curated folder and keep the best shots.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="panel-soft relative overflow-hidden rounded-[1.75rem] p-5 sm:col-span-2">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(68,210,255,0.2),transparent_42%)]" />
                    <div className="relative">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Live preview</p>
                      <h3 className="mt-2 text-2xl font-semibold text-white">Your results start to feel real before the scan even finishes.</h3>
                    </div>
                  </div>

                  {previewCards.map((card) => (
                    <div key={card.label} className="panel-soft rounded-[1.75rem] p-5">
                      <p className="text-sm font-medium text-slate-400">{card.label}</p>
                      <p className="mt-6 font-display text-3xl font-semibold text-white">{card.stat}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <section id="scan-form" className="relative">
            <div className="pointer-events-none absolute -right-4 top-10 hidden h-48 w-48 rounded-full bg-cyan-400/12 blur-3xl lg:block" />
            <div className="pointer-events-none absolute -left-8 bottom-12 hidden h-44 w-44 rounded-full bg-violet-500/12 blur-3xl lg:block" />

            <div className="panel relative rounded-[2rem] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Scan console</p>
                  <h2 className="mt-2 font-display text-3xl font-semibold text-white">Launch a new run</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                    Paste the folder, give us one reference image, and we&apos;ll build your keepers folder automatically.
                  </p>
                </div>
                <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
                  Engine online
                </div>
              </div>

              <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
                <div className="panel-soft rounded-[1.75rem] p-4">
                  <div className="mb-4 flex items-start gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-white">
                      01
                    </span>
                    <div>
                      <p className="text-lg font-semibold text-white">Google Drive folder</p>
                      <p className="mt-1 text-sm text-slate-400">The folder should be viewable by link so every image can be scanned.</p>
                    </div>
                  </div>

                  <input
                    type="url"
                    value={driveUrl}
                    onChange={(e) => setDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className={inputClassName}
                    required
                  />
                </div>

                <div className="panel-soft rounded-[1.75rem] p-4">
                  <div className="mb-4 flex items-start gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-sm font-semibold text-cyan-100">
                      02
                    </span>
                    <div>
                      <p className="text-lg font-semibold text-white">Reference selfie</p>
                      <p className="mt-1 text-sm text-slate-400">Use a clear front-facing shot in decent light for the best matching results.</p>
                    </div>
                  </div>

                  {!showCamera && !selfieImage && (
                    <button
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="ghost-button flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                    >
                      <div>
                        <span className="block text-base font-semibold text-white">Open camera</span>
                        <span className="mt-1 block text-sm text-slate-400">Capture one shot and keep moving.</span>
                      </div>
                      <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">
                        Launch
                      </span>
                    </button>
                  )}

                  {showCamera && !selfieImage && (
                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#050b15] p-2">
                        <div className="relative overflow-hidden rounded-[1.25rem]">
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
                          <div className="pointer-events-none absolute inset-x-[18%] top-[14%] bottom-[12%] rounded-[2rem] border border-cyan-300/35 shadow-[0_0_40px_rgba(68,210,255,0.15)]" />
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={captureSelfie}
                          className="accent-button flex-1 px-6 py-4 text-sm uppercase tracking-[0.16em]"
                        >
                          Capture frame
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
                      <div className="overflow-hidden rounded-[1.75rem] border border-cyan-300/15 bg-[#050b15] p-2">
                        <img
                          src={selfieImage}
                          alt="Captured selfie"
                          className="aspect-[4/5] w-full rounded-[1.25rem] object-cover"
                        />
                      </div>

                      <div className="panel-soft flex flex-col gap-3 rounded-[1.5rem] p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-base font-semibold text-white">Reference locked</p>
                          <p className="mt-1 text-sm text-slate-400">This shot is ready to drive the face match.</p>
                        </div>
                        <button
                          type="button"
                          onClick={retakeSelfie}
                          className="ghost-button px-5 py-3 text-sm uppercase tracking-[0.16em]"
                        >
                          Retake
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="panel-soft rounded-[1.75rem] p-4">
                  <div className="mb-4 flex items-start gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-white">
                      03
                    </span>
                    <div>
                      <p className="text-lg font-semibold text-white">Optional email</p>
                      <p className="mt-1 text-sm text-slate-400">Skip this if you want. It just gives you a heads-up later.</p>
                    </div>
                  </div>

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

                <p className="text-center text-xs uppercase tracking-[0.18em] text-slate-500">
                  No gallery upload. No account wall. Just your folder and your face.
                </p>
              </form>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
