'use client';

import { useCallback, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const heroBadges = ['Google Drive in', 'Best shots out', 'Private by default'];

const spotlightStats = [
  { value: '< 3 min', label: 'from folder link to first matches' },
  { value: '1 selfie', label: 'to teach the model who to follow' },
  { value: '0 chaos', label: 'left in your group trip dump' },
];

const featureCards = [
  {
    eyebrow: 'Fast lane',
    title: 'Built for chaotic camera rolls',
    copy: 'Trips, weddings, reunions, college formals, spring break dumps. If the folder is messy, that is the point.',
    accent: 'from-[#f3c67c]/70 to-[#fff0d8]/30',
  },
  {
    eyebrow: 'Privacy first',
    title: 'No gallery migration required',
    copy: 'Your originals stay in Drive. WhoDis just scans, sorts, and hands back a clean folder of the photos you care about.',
    accent: 'from-[#82d1c9]/[0.55] to-[#effaf7]/30',
  },
];

const moments = [
  { name: 'Weekend recap', tag: '42 keepers', tone: 'from-[#ec8e63] to-[#f6c680]' },
  { name: 'Wedding camera roll', tag: 'Bride-side only', tone: 'from-[#2b8a86] to-[#7ed4cb]' },
  { name: 'Road trip folder', tag: 'Passenger princess arc', tone: 'from-[#9e7154] to-[#e8b98b]' },
  { name: 'Festival drop', tag: 'Main character mode', tone: 'from-[#3e4f69] to-[#8aa1b8]' },
];

const workflow = [
  {
    step: '01',
    title: 'Paste the shared folder',
    detail: 'Any Google Drive folder link works as long as it can be viewed by link.',
  },
  {
    step: '02',
    title: 'Capture one clear selfie',
    detail: 'That becomes your visual anchor while we scan the album.',
  },
  {
    step: '03',
    title: 'Collect your filtered gallery',
    detail: 'Open the polished results folder and post the good stuff.',
  },
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

  const fieldClassName =
    'w-full rounded-[22px] border border-black/10 bg-white/70 px-5 py-4 text-[15px] text-[#181311] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] outline-none transition placeholder:text-[#8c8178] focus:border-[#d26f4f] focus:bg-white';

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
      setError('Drop in a valid Google Drive folder link so we know where to scan.');
      return;
    }

    if (!selfieImage) {
      setError('Snap a selfie first so WhoDis knows which face to follow.');
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

      const { job_id } = response.data;
      router.push(`/process/${job_id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Submission failed. Give it another shot in a moment.');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-drift absolute -left-16 top-28 h-64 w-64 rounded-full bg-[#f1c17c]/[0.35] blur-3xl" />
        <div className="animate-float absolute right-[-5rem] top-20 h-80 w-80 rounded-full bg-[#67c0b7]/25 blur-3xl" />
        <div className="animate-drift absolute bottom-[-6rem] left-1/3 h-72 w-72 rounded-full bg-[#d97856]/[0.18] blur-3xl" />
      </div>

      <main className="relative mx-auto max-w-7xl px-5 pb-20 pt-6 sm:px-8 lg:px-10">
        <header className="soft-panel flex flex-col gap-5 rounded-full px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#181311] text-sm font-semibold tracking-[0.22em] text-white">
              WD
            </div>
            <div>
              <p className="font-display text-2xl font-semibold leading-none">WhoDis</p>
              <p className="mt-1 text-sm text-[#665b53]">Face-first sorting for wildly unorganized photo drops.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#665b53]">
            {heroBadges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-black/10 bg-white/60 px-4 py-2"
              >
                {badge}
              </span>
            ))}
          </div>
        </header>

        <section className="grid gap-10 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-8">
            <div className="space-y-5">
              <span className="section-kicker">
                <span className="h-2 w-2 rounded-full bg-[#e06a45]" />
                Personal highlight reel generator
              </span>

              <div className="space-y-4">
                <h1 className="max-w-3xl text-balance font-display text-5xl font-semibold leading-[0.92] tracking-[-0.06em] text-[#181311] sm:text-6xl lg:text-[4.8rem]">
                  Stop digging through the group dump for your own face.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-[#5f564f] sm:text-xl">
                  WhoDis turns a bloated Drive folder into a handpicked set of photos that actually feature you.
                  One link. One selfie. Zero doom-scrolling.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {spotlightStats.map((stat) => (
                <div
                  key={stat.label}
                  className="soft-panel rounded-[28px] p-5"
                >
                  <p className="font-display text-3xl font-semibold text-[#181311]">{stat.value}</p>
                  <p className="mt-2 text-sm leading-6 text-[#665b53]">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {featureCards.map((card) => (
                <div
                  key={card.title}
                  className={`relative overflow-hidden rounded-[30px] border border-black/[0.08] bg-gradient-to-br ${card.accent} p-6 shadow-[0_18px_45px_rgba(111,73,39,0.11)]`}
                >
                  <div className="relative z-10">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b4d39]">
                      {card.eyebrow}
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold text-[#181311]">{card.title}</h2>
                    <p className="mt-3 max-w-sm text-sm leading-7 text-[#574d47]">{card.copy}</p>
                  </div>
                </div>
              ))}
            </div>

            <section className="glass-panel overflow-hidden rounded-[36px] p-6 sm:p-8">
              <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7b6758]">
                    Why it feels good
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold text-[#181311] sm:text-4xl">
                    The entire experience is built around momentum.
                  </h2>
                  <div className="mt-6 space-y-4">
                    {workflow.map((item) => (
                      <div
                        key={item.step}
                        className="soft-panel rounded-[24px] p-4"
                      >
                        <div className="flex items-start gap-4">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#181311] text-sm font-semibold text-white">
                            {item.step}
                          </span>
                          <div>
                            <p className="text-lg font-semibold text-[#181311]">{item.title}</p>
                            <p className="mt-1 text-sm leading-6 text-[#665b53]">{item.detail}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {moments.map((moment, index) => (
                    <div
                      key={moment.name}
                      className={`relative overflow-hidden rounded-[28px] border border-white/50 bg-gradient-to-br ${moment.tone} p-5 text-white shadow-[0_20px_50px_rgba(71,41,21,0.18)] ${
                        index === 0 ? 'col-span-2 min-h-[180px]' : 'min-h-[210px]'
                      }`}
                    >
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.28),transparent_38%)]" />
                      <div className="relative flex h-full flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="rounded-full border border-white/30 bg-white/[0.15] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
                            Curated
                          </span>
                          <span className="text-xs font-medium text-white/[0.85]">{moment.tag}</span>
                        </div>
                        <div>
                          <p className="text-sm uppercase tracking-[0.18em] text-white/80">Scene</p>
                          <p className="mt-2 font-display text-2xl font-semibold leading-tight">
                            {moment.name}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <section className="relative">
            <div className="absolute inset-0 translate-x-4 translate-y-5 rounded-[36px] bg-[#e69468]/[0.18] blur-2xl" />
            <div className="glass-panel relative rounded-[36px] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[0.08] pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7b6758]">
                    Start a new pull
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold text-[#181311]">Build your highlight reel</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-[#665b53]">
                    Feed us the shared folder, capture your face, and we&apos;ll separate your shots from the noise.
                  </p>
                </div>
                <div className="rounded-full border border-[#e2c59b] bg-[#fff4de] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#7f5a37]">
                  Live beta
                </div>
              </div>

              <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
                <div className="rounded-[30px] border border-black/[0.08] bg-white/[0.55] p-4">
                  <div className="mb-4 flex items-start gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1f8a86] text-sm font-semibold text-white">
                      01
                    </span>
                    <div>
                      <p className="text-lg font-semibold text-[#181311]">Paste the Google Drive folder</p>
                      <p className="mt-1 text-sm leading-6 text-[#665b53]">
                        The folder should be viewable by link so we can scan every image inside.
                      </p>
                    </div>
                  </div>

                  <input
                    type="url"
                    value={driveUrl}
                    onChange={(e) => setDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className={fieldClassName}
                    required
                  />
                </div>

                <div className="rounded-[30px] border border-black/[0.08] bg-white/[0.55] p-4">
                  <div className="mb-4 flex items-start gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e06a45] text-sm font-semibold text-white">
                      02
                    </span>
                    <div>
                      <p className="text-lg font-semibold text-[#181311]">Give WhoDis one clean reference photo</p>
                      <p className="mt-1 text-sm leading-6 text-[#665b53]">
                        A front-facing selfie in decent light works best. We use it only to match photos in this job.
                      </p>
                    </div>
                  </div>

                  {!showCamera && !selfieImage && (
                    <button
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="secondary-button flex w-full items-center justify-between px-5 py-4 text-left"
                    >
                      <span>
                        <span className="block text-base font-semibold text-[#181311]">Open the camera</span>
                        <span className="mt-1 block text-sm text-[#665b53]">We only need one shot to start the scan.</span>
                      </span>
                      <span className="rounded-full bg-[#181311] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                        Launch
                      </span>
                    </button>
                  )}

                  {showCamera && !selfieImage && (
                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-[28px] border border-black/10 bg-[#1d1a19] p-2 shadow-[0_20px_60px_rgba(38,25,16,0.25)]">
                        <div className="relative overflow-hidden rounded-[22px]">
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
                          <div className="pointer-events-none absolute inset-0 border-[18px] border-white/10" />
                          <div className="pointer-events-none absolute inset-x-[18%] top-[14%] bottom-[12%] rounded-[36px] border border-white/30" />
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={captureSelfie}
                          className="primary-button shine flex-1 px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em]"
                        >
                          Capture this frame
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCamera(false)}
                          className="secondary-button px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em]"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )}

                  {selfieImage && (
                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-[28px] border border-black/10 bg-white p-2 shadow-[0_18px_40px_rgba(74,49,31,0.12)]">
                        <img
                          src={selfieImage}
                          alt="Captured selfie"
                          className="aspect-[4/5] w-full rounded-[22px] object-cover"
                        />
                      </div>

                      <div className="soft-panel flex flex-col gap-3 rounded-[24px] p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-base font-semibold text-[#181311]">Reference locked in</p>
                          <p className="mt-1 text-sm text-[#665b53]">Looks good. You can retake it if you want a cleaner frame.</p>
                        </div>
                        <button
                          type="button"
                          onClick={retakeSelfie}
                          className="secondary-button px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em]"
                        >
                          Retake
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-[30px] border border-black/[0.08] bg-white/[0.55] p-4">
                  <div className="mb-4 flex items-start gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#181311] text-sm font-semibold text-white">
                      03
                    </span>
                    <div>
                      <p className="text-lg font-semibold text-[#181311]">Optional email for the finish line</p>
                      <p className="mt-1 text-sm leading-6 text-[#665b53]">
                        Skip this if you want. It&apos;s just there in case you want a heads-up later.
                      </p>
                    </div>
                  </div>

                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className={fieldClassName}
                  />
                </div>

                {error && (
                  <div className="rounded-[24px] border border-[#e7b7aa] bg-[#fff5f2] px-5 py-4 text-sm leading-6 text-[#8a493a]">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !driveUrl || !selfieImage}
                  className="primary-button shine w-full px-6 py-5 text-sm font-semibold uppercase tracking-[0.18em] disabled:pointer-events-none disabled:opacity-60"
                >
                  {loading ? 'Launching your scan' : 'Find my photos'}
                </button>

                <p className="text-center text-xs uppercase tracking-[0.18em] text-[#786b61]">
                  No account setup. No gallery upload. Just your link and your face.
                </p>
              </form>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
