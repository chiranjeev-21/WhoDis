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
  result_mode: string;
  preview_urls: string[];
  zip_status: string;
  zip_error_message?: string | null;
  matched_files: {
    file_id: string;
    name: string;
    view_url: string;
    thumbnail_url?: string | null;
  }[];
}

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.jobId as string;

  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [zipMessage, setZipMessage] = useState('');
  const [zipError, setZipError] = useState('');
  const [shouldAutoDownloadZip, setShouldAutoDownloadZip] = useState(false);

  const fetchResults = async () => {
    if (!jobId) {
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/api/results/${jobId}`);
      setResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch results.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!jobId) {
      return;
    }

    fetchResults();
  }, [jobId]);

  useEffect(() => {
    if (result?.zip_status !== 'processing') {
      return;
    }

    const interval = setInterval(() => {
      fetchResults();
    }, 2000);

    return () => clearInterval(interval);
  }, [result?.zip_status, jobId]);

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

  const triggerZipDownload = () => {
    const link = document.createElement('a');
    link.href = `${API_URL}/api/results/${jobId}/download?ts=${Date.now()}`;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleZipAction = async () => {
    if (!result || !jobId) {
      return;
    }

    setZipError('');

    if (result.zip_status === 'ready') {
      setZipMessage('Your ZIP download should start shortly.');
      triggerZipDownload();
      return;
    }

    setShouldAutoDownloadZip(true);
    setZipMessage('Preparing your ZIP. Leave this tab open and we will start the download as soon as it is ready.');

    try {
      const response = await axios.post(`${API_URL}/api/results/${jobId}/prepare-download`);
      const nextStatus = response.data.zip_status as string;

      setResult((current) =>
        current
          ? {
              ...current,
              zip_status: nextStatus,
              zip_error_message: null,
            }
          : current
      );

      if (nextStatus === 'ready') {
        triggerZipDownload();
        setShouldAutoDownloadZip(false);
        setZipMessage('Your ZIP download should start shortly.');
      }
    } catch (err: any) {
      setShouldAutoDownloadZip(false);
      setZipError(err.response?.data?.detail || 'Failed to prepare ZIP download.');
      setZipMessage('');
    }
  };

  useEffect(() => {
    if (!result) {
      return;
    }

    if (result.zip_status === 'ready' && shouldAutoDownloadZip) {
      triggerZipDownload();
      setShouldAutoDownloadZip(false);
      setZipError('');
      setZipMessage('Your ZIP download should start shortly.');
      return;
    }

    if (result.zip_status === 'failed') {
      setShouldAutoDownloadZip(false);
      if (result.zip_error_message) {
        setZipError(result.zip_error_message);
      }
      if (!result.zip_error_message) {
        setZipMessage('');
      }
      return;
    }

    if (result.zip_status === 'processing') {
      setZipError('');
      setZipMessage('Preparing your ZIP. This can take a minute for larger albums.');
    }
  }, [result?.zip_status, result?.zip_error_message, shouldAutoDownloadZip]);

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden px-5 py-8 sm:px-8">
        <div className="pointer-events-none absolute inset-0 subtle-grid opacity-25" />
        <div className="pointer-events-none absolute inset-0">
          <div className="animate-drift absolute left-[10%] top-[12%] h-72 w-72 rounded-full bg-cyan-400/12 blur-3xl" />
          <div className="animate-float absolute right-[8%] top-[18%] h-80 w-80 rounded-full bg-violet-500/12 blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
          <div className="panel w-full rounded-[2rem] px-6 py-10 text-center sm:px-8">
            <div className="ring-glow mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-400/10">
              <div className="h-14 w-14 rounded-full bg-[conic-gradient(from_180deg_at_50%_50%,#44d2ff,#20c997,#8b5cf6,#44d2ff)]" />
            </div>
            <h1 className="mt-6 font-display text-4xl font-semibold text-white">Loading your results</h1>
            <p className="mt-3 text-base text-slate-400">Pulling the gallery and folder metadata now.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="relative min-h-screen overflow-hidden px-5 py-8 sm:px-8">
        <div className="pointer-events-none absolute inset-0 subtle-grid opacity-25" />
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-0 top-16 h-72 w-72 rounded-full bg-red-400/10 blur-3xl" />
          <div className="absolute right-0 top-28 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
          <div className="panel w-full rounded-[2rem] p-8 sm:p-10">
            <span className="eyebrow">
              <span className="h-2 w-2 rounded-full bg-red-300" />
              Results unavailable
            </span>
            <h1 className="mt-5 font-display text-4xl font-semibold text-white sm:text-5xl">
              We couldn&apos;t load this gallery.
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-slate-300">
              {error || 'The results payload was not available.'}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => router.push('/')}
                className="accent-button px-6 py-4 text-sm uppercase tracking-[0.16em]"
              >
                Start another scan
              </button>
              <button
                onClick={() => router.push('/')}
                className="ghost-button px-6 py-4 text-sm uppercase tracking-[0.16em]"
              >
                Back home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const notes =
    result.result_mode === 'source_links'
      ? [
          'Each tile opens the original photo in Google Drive.',
          'Download all matches as one ZIP if you want everything in one hit.',
          'Nothing was copied, so this avoids Google Drive quota issues.',
          'If the match set feels off, rerun with a cleaner selfie.',
        ]
      : [
          'Open the result folder directly in Google Drive and download the keepers.',
          'The source folder stays untouched. WhoDis creates a separate curated output.',
          'If the hit rate feels low, rerun with a cleaner selfie in brighter light.',
        ];

  const stats = [
    { label: 'Matches found', value: result.matched_images.toString() },
    { label: 'Preview tiles', value: result.preview_urls.length.toString() },
    { label: 'Job tag', value: result.job_id.slice(0, 8).toUpperCase() },
  ];
  const zipButtonLabel =
    result.zip_status === 'ready'
      ? 'Download ZIP'
      : result.zip_status === 'processing'
        ? 'Preparing ZIP...'
        : result.zip_status === 'failed'
          ? 'Retry ZIP'
          : 'Prepare ZIP';

  return (
    <div className="relative min-h-screen overflow-hidden px-5 py-6 sm:px-8">
      <div className="pointer-events-none absolute inset-0 subtle-grid opacity-25" />
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-drift absolute -left-10 top-14 h-72 w-72 rounded-full bg-cyan-400/12 blur-3xl" />
        <div className="animate-float absolute right-[-5rem] top-24 h-80 w-80 rounded-full bg-violet-500/12 blur-3xl" />
        <div className="absolute bottom-[-5rem] left-1/3 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <header className="panel-soft flex flex-col gap-4 rounded-full px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-2xl font-semibold text-white">WhoDis</p>
            <p className="text-sm text-slate-400">Results gallery</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
              Job {result.job_id.slice(0, 8)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
              {result.matched_images} matches
            </span>
          </div>
        </header>

        <section className="grid gap-8 pt-10 lg:grid-cols-[0.94fr_1.06fr] lg:items-start">
          <div className="space-y-5">
            <div className="panel rounded-[2rem] p-6 sm:p-8">
              <span className="eyebrow">
                <span className="h-2 w-2 rounded-full bg-cyan-300" />
                Results ready
              </span>
              <h1 className="mt-5 text-balance font-display text-4xl font-semibold text-white sm:text-5xl lg:text-6xl">
                Found {result.matched_images} photos that actually have you in them.
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
                {result.result_mode === 'source_links'
                  ? 'Open the matched originals directly in Drive, skim the preview wall, and keep the shots that matter.'
                  : 'Open the curated Drive folder, skim the preview wall, and keep the shots that matter without touching the original album.'}
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {stats.map((stat) => (
                  <div key={stat.label} className="panel-soft rounded-[1.5rem] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{stat.label}</p>
                    <p className="mt-3 font-display text-3xl font-semibold text-white">{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col gap-3">
                <a
                  href={result.folder_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="accent-button px-6 py-4 text-center text-sm uppercase tracking-[0.16em]"
                >
                  {result.result_mode === 'source_links' ? 'Open source Drive folder' : 'Open Google Drive folder'}
                </a>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {result.result_mode === 'source_links' && result.matched_files.length > 0 && (
                    <button
                      type="button"
                      onClick={handleZipAction}
                      disabled={result.zip_status === 'processing'}
                      className="ghost-button px-6 py-4 text-center text-sm uppercase tracking-[0.16em]"
                    >
                      {zipButtonLabel}
                    </button>
                  )}
                  <button
                    onClick={copyFolderLink}
                    className="ghost-button px-6 py-4 text-sm uppercase tracking-[0.16em]"
                  >
                    {copied ? 'Link copied' : 'Copy Drive link'}
                  </button>
                  <button
                    onClick={() => router.push('/')}
                    className="ghost-button px-6 py-4 text-sm uppercase tracking-[0.16em]"
                  >
                    Run another scan
                  </button>
                </div>

                {(zipMessage || zipError) && (
                  <div
                    className={`rounded-2xl px-5 py-4 text-sm leading-6 ${
                      zipError
                        ? 'border border-red-400/25 bg-red-400/10 text-red-100'
                        : 'border border-cyan-300/20 bg-cyan-400/10 text-cyan-100'
                    }`}
                  >
                    {zipError || zipMessage}
                  </div>
                )}
              </div>
            </div>

            <div className="panel-soft rounded-[2rem] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Next steps</p>
              <div className="mt-4 space-y-4">
                {notes.map((note, index) => (
                  <div key={note} className="flex gap-4 rounded-[1.25rem] border border-white/6 bg-white/[0.03] p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-sm font-semibold text-cyan-100">
                      0{index + 1}
                    </span>
                    <p className="text-sm leading-7 text-slate-300">{note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="panel rounded-[2rem] p-6 sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Preview wall</p>
                  <h2 className="mt-2 font-display text-3xl font-semibold text-white">Your first look at the keepers.</h2>
                </div>
                {result.preview_urls.length > 0 && (
                  <p className="text-sm text-slate-400">
                    Showing {result.preview_urls.length} of {result.matched_images}
                  </p>
                )}
              </div>

              {result.preview_urls.length > 0 ? (
                <div className="mt-8 grid auto-rows-[180px] grid-cols-2 gap-4 md:auto-rows-[210px] md:grid-cols-4">
                  {result.preview_urls.map((url, index) => {
                    const featured = index === 0 || index === 3;

                    return (
                      <div
                        key={url}
                        className={`group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#09111f] ${
                          featured ? 'md:col-span-2 md:row-span-2' : ''
                        }`}
                      >
                        <img
                          src={url}
                          alt={`Matched photo ${index + 1}`}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_42%,rgba(3,8,20,0.85)_100%)]" />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 pb-4">
                          <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                            Match {index + 1}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-8 rounded-[1.75rem] border border-dashed border-white/12 bg-white/[0.03] p-8 text-center">
                  <p className="text-2xl font-semibold text-white">No preview thumbnails available.</p>
                  <p className="mt-3 text-base leading-7 text-slate-400">
                    The matched results are still ready. Open them below in Drive.
                  </p>
                </div>
              )}
            </div>

            {result.matched_files.length > 0 && (
              <div className="panel-soft rounded-[2rem] p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Matched files</p>
                    <h2 className="mt-2 font-display text-3xl font-semibold text-white">Open the originals.</h2>
                  </div>
                  <p className="text-sm text-slate-400">{result.matched_files.length} Drive links ready</p>
                </div>

                <div className="mt-6 space-y-3">
                  {result.matched_files.map((file, index) => (
                    <div
                      key={file.file_id}
                      className="flex flex-col gap-4 rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Match {index + 1}
                        </p>
                        <p className="mt-2 truncate text-base text-slate-200">{file.name}</p>
                      </div>

                      <a
                        href={file.view_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ghost-button shrink-0 px-5 py-3 text-center text-sm uppercase tracking-[0.16em]"
                      >
                        Open in Drive
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="panel-soft rounded-[2rem] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Done with this run?</p>
              <p className="mt-3 text-lg leading-8 text-slate-200">
                Grab your favorites in Drive, then rerun with a cleaner selfie if you want a tighter match set.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
