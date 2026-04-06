'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface JobResult {
  job_id: string;
  status: string;
  matched_images: number;
  folder_url: string;
  preview_urls: string[];
}

const resultNotes = [
  {
    title: 'Your results live in Drive',
    copy: 'Open the folder, download the keepers, or drop them straight into your socials workflow.',
  },
  {
    title: 'The originals stay untouched',
    copy: 'WhoDis creates a curated output instead of moving or mutating the source album.',
  },
  {
    title: 'Need a stronger pull?',
    copy: 'If something was missed, retake the selfie in clearer light and run it again.',
  },
];

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.jobId as string;

  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!jobId) {
      return;
    }

    const fetchResults = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/results/${jobId}`);
        setResult(response.data);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to fetch results.');
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [jobId]);

  const copyFolderLink = async () => {
    if (!result?.folder_url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result.folder_url);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      setCopied(false);
    }
  };

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden px-5 py-8 sm:px-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="animate-float absolute left-[12%] top-[16%] h-72 w-72 rounded-full bg-[#f0c17d]/30 blur-3xl" />
          <div className="animate-drift absolute right-[10%] top-[12%] h-80 w-80 rounded-full bg-[#71c1b8]/[0.18] blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
          <div className="glass-panel w-full rounded-[36px] px-6 py-10 text-center sm:px-8">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-white/50 bg-white/[0.55] shadow-[0_20px_50px_rgba(77,55,38,0.16)]">
              <div className="animate-pulse-glow h-14 w-14 rounded-full bg-[conic-gradient(from_90deg_at_50%_50%,#e06a45,#f0c17d,#1f8a86,#e06a45)]" />
            </div>
            <h1 className="mt-6 text-4xl font-semibold text-[#181311]">Pulling your highlights</h1>
            <p className="mt-3 text-base text-[#665b53]">We&apos;re loading the result folder and preview gallery now.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="relative min-h-screen overflow-hidden px-5 py-8 sm:px-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-0 top-20 h-72 w-72 rounded-full bg-[#efb88f]/30 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[#71c1b8]/[0.16] blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
          <div className="glass-panel w-full rounded-[36px] p-8 sm:p-10">
            <span className="section-kicker">
              <span className="h-2 w-2 rounded-full bg-[#d96b4f]" />
              Results unavailable
            </span>
            <h1 className="mt-5 text-4xl font-semibold text-[#181311] sm:text-5xl">We couldn&apos;t open this gallery.</h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-[#5f564f]">
              {error || 'The result folder could not be loaded.'}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => router.push('/')}
                className="primary-button shine px-6 py-4 text-sm font-semibold uppercase tracking-[0.16em]"
              >
                Start another scan
              </button>
              <button
                onClick={() => router.push('/')}
                className="secondary-button px-6 py-4 text-sm font-semibold uppercase tracking-[0.16em]"
              >
                Back home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Matches surfaced', value: result.matched_images.toString() },
    { label: 'Preview tiles', value: result.preview_urls.length.toString() },
    { label: 'Job tag', value: result.job_id.slice(0, 8).toUpperCase() },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden px-5 py-6 sm:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-drift absolute -left-8 top-16 h-72 w-72 rounded-full bg-[#efb985]/[0.28] blur-3xl" />
        <div className="animate-float absolute right-[-4rem] top-24 h-80 w-80 rounded-full bg-[#71c1b8]/[0.16] blur-3xl" />
        <div className="absolute bottom-[-6rem] left-1/3 h-80 w-80 rounded-full bg-[#d97554]/[0.12] blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <header className="soft-panel flex flex-col gap-4 rounded-full px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-2xl font-semibold text-[#181311]">WhoDis</p>
            <p className="text-sm text-[#665b53]">Results gallery</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#665b53]">
            <span className="rounded-full border border-black/10 bg-white/60 px-4 py-2">
              Job {result.job_id.slice(0, 8)}
            </span>
            <span className="rounded-full border border-black/10 bg-white/60 px-4 py-2">
              {result.matched_images} matches
            </span>
          </div>
        </header>

        <section className="grid gap-8 pt-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
          <div className="space-y-5">
            <div className="glass-panel rounded-[36px] p-6 sm:p-8">
              <span className="section-kicker">
                <span className="h-2 w-2 rounded-full bg-[#1f8a86]" />
                Gallery ready
              </span>
              <h1 className="mt-5 text-balance text-4xl font-semibold text-[#181311] sm:text-5xl lg:text-6xl">
                Found {result.matched_images} photos worth stealing back from the group chat.
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-[#5f564f]">
                Your filtered folder is live. Open it in Drive, skim the preview wall below, and grab the shots that
                actually belong on your camera roll.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {statCards.map((card) => (
                  <div
                    key={card.label}
                    className="soft-panel rounded-[26px] p-5"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#786b61]">{card.label}</p>
                    <p className="mt-3 font-display text-3xl font-semibold text-[#181311]">{card.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col gap-3">
                <a
                  href={result.folder_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="primary-button shine px-6 py-4 text-center text-sm font-semibold uppercase tracking-[0.16em]"
                >
                  Open Google Drive folder
                </a>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={copyFolderLink}
                    className="secondary-button px-6 py-4 text-sm font-semibold uppercase tracking-[0.16em]"
                  >
                    {copied ? 'Folder link copied' : 'Copy folder link'}
                  </button>
                  <button
                    onClick={() => router.push('/')}
                    className="secondary-button px-6 py-4 text-sm font-semibold uppercase tracking-[0.16em]"
                  >
                    Run another scan
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {resultNotes.map((note, index) => (
                <div
                  key={note.title}
                  className={`rounded-[30px] p-6 shadow-[0_18px_40px_rgba(89,57,35,0.1)] ${
                    index === 0
                        ? 'border border-[#edd4ab] bg-[#fff6e2]'
                      : index === 1
                        ? 'border border-[#bbe2dc] bg-[#edfaf7]'
                        : 'border border-black/[0.08] bg-white/[0.65]'
                  }`}
                >
                  <p className="text-xl font-semibold text-[#181311]">{note.title}</p>
                  <p className="mt-2 text-sm leading-7 text-[#5f564f]">{note.copy}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="glass-panel rounded-[36px] p-6 sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#786b61]">
                    Preview wall
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold text-[#181311]">Your first look at the keepers.</h2>
                </div>
                {result.preview_urls.length > 0 && (
                  <p className="text-sm text-[#665b53]">
                    Showing {result.preview_urls.length} of {result.matched_images}
                  </p>
                )}
              </div>

              {result.preview_urls.length > 0 ? (
                <div className="mt-8 grid auto-rows-[160px] grid-cols-2 gap-4 md:auto-rows-[185px] md:grid-cols-4">
                  {result.preview_urls.map((url, index) => {
                    const featured = index === 0 || index === 3;

                    return (
                      <div
                        key={url}
                        className={`group relative overflow-hidden rounded-[28px] border border-white/[0.45] bg-[#f4e8dc] shadow-[0_20px_40px_rgba(74,49,31,0.12)] ${
                          featured ? 'md:col-span-2 md:row-span-2' : ''
                        }`}
                      >
                        <img
                          src={url}
                          alt={`Matched photo ${index + 1}`}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(22,17,14,0.42)_100%)]" />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 pb-4">
                          <span className="rounded-full border border-white/20 bg-black/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                            Match {index + 1}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-8 rounded-[30px] border border-dashed border-black/[0.12] bg-white/[0.55] p-8 text-center">
                  <p className="text-2xl font-semibold text-[#181311]">No preview thumbnails yet.</p>
                  <p className="mt-3 text-base leading-7 text-[#665b53]">
                    The full Drive folder is still ready for you. Open it above to see everything.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-[34px] border border-[#211a17] bg-[#1b1715] p-7 text-white shadow-[0_26px_60px_rgba(32,21,16,0.24)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">What happens next</p>
              <h2 className="mt-3 text-3xl font-semibold">Keep the folder. Share the glory.</h2>
              <p className="mt-3 max-w-2xl text-base leading-8 text-white/[0.84]">
                Download your picks, send the folder to friends, or fire up another scan with a cleaner selfie if you
                want a tighter result set.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
