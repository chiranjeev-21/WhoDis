'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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

const statusMeta = {
  pending: {
    label: 'Queued',
    title: 'Warming up your scan',
    copy: 'We are spinning up the job and preparing the face match pipeline.',
    accent: '#44d2ff',
  },
  processing: {
    label: 'Scanning',
    title: 'Matching your face across the album',
    copy: 'WhoDis is scanning every image, comparing embeddings, and preparing your matched results.',
    accent: '#20c997',
  },
  completed: {
    label: 'Completed',
    title: 'Your results are ready',
    copy: 'The matches are ready. We are sending you to the results view now.',
    accent: '#8b5cf6',
  },
} as const;

const stageLabels = ['Queued', 'Scanning', 'Matching', 'Results'];

export default function ProcessPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.jobId as string;

  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!jobId) {
      return;
    }

    let redirectTimeout: ReturnType<typeof setTimeout> | undefined;
    let hasScheduledRedirect = false;
    let interval: ReturnType<typeof setInterval>;
    let consecutiveFailures = 0;

    const pollStatus = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/job-status/${jobId}`);
        const status = response.data as JobStatus;
        consecutiveFailures = 0;

        setJobStatus(status);

        if (status.status === 'completed' && !hasScheduledRedirect) {
          hasScheduledRedirect = true;
          clearInterval(interval);
          redirectTimeout = setTimeout(() => {
            router.push(`/results/${jobId}`);
          }, 1600);
        }

        if (status.status === 'failed') {
          clearInterval(interval);
          setError(status.error_message || 'Processing failed.');
        }
      } catch (err: any) {
        consecutiveFailures += 1;

        if (consecutiveFailures >= 5) {
          clearInterval(interval);
          setError(
            err.response?.status === 502
              ? 'The API worker restarted while processing. Please try again in a moment.'
              : err.response?.data?.detail || 'Failed to fetch job status.'
          );
        }
      }
    };

    interval = setInterval(pollStatus, 2000);
    pollStatus();

    return () => {
      clearInterval(interval);
      if (redirectTimeout) {
        clearTimeout(redirectTimeout);
      }
    };
  }, [jobId, router]);

  if (error) {
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
              Scan interrupted
            </span>
            <h1 className="mt-5 font-display text-4xl font-semibold text-white sm:text-5xl">
              This run hit a blocker.
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-slate-300">{error}</p>

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

  if (!jobStatus) {
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
            <h1 className="mt-6 font-display text-4xl font-semibold text-white">Loading your scan</h1>
            <p className="mt-3 text-base text-slate-400">Pulling the latest job status from the queue.</p>
          </div>
        </div>
      </div>
    );
  }

  const meta = statusMeta[jobStatus.status as keyof typeof statusMeta] || statusMeta.processing;
  const stageIndex =
    jobStatus.status === 'pending'
      ? 1
      : jobStatus.status === 'processing'
        ? Math.max(2, Math.min(3, Math.ceil((jobStatus.progress || 0) / 45) + 1))
        : 4;

  return (
    <div className="relative min-h-screen overflow-hidden px-5 py-6 sm:px-8">
      <div className="pointer-events-none absolute inset-0 subtle-grid opacity-25" />
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-drift absolute -left-10 top-14 h-72 w-72 rounded-full bg-cyan-400/12 blur-3xl" />
        <div className="animate-float absolute right-[-5rem] top-24 h-80 w-80 rounded-full bg-violet-500/12 blur-3xl" />
        <div className="absolute bottom-[-5rem] left-1/3 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <header className="panel-soft flex flex-col gap-4 rounded-full px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-2xl font-semibold text-white">WhoDis</p>
            <p className="text-sm text-slate-400">Live scan dashboard</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
              Job {jobStatus.job_id.slice(0, 8)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
              {jobStatus.progress}% complete
            </span>
          </div>
        </header>

        <section className="grid gap-8 pt-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
          <div className="panel rounded-[2rem] p-6 sm:p-8">
            <span className="eyebrow">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.accent }} />
              {meta.label}
            </span>

            <h1 className="mt-5 max-w-xl font-display text-4xl font-semibold text-white sm:text-5xl">
              {meta.title}
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-slate-300">{meta.copy}</p>

            <div className="mt-8 flex justify-center">
              <div
                className="flex h-52 w-52 items-center justify-center rounded-full p-3 shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
                style={{
                  background: `conic-gradient(${meta.accent} ${jobStatus.progress}%, rgba(255,255,255,0.08) 0)`,
                }}
              >
                <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-white/10 bg-[#07111f] text-center">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Progress</span>
                  <span className="mt-2 font-display text-5xl font-semibold text-white">{jobStatus.progress}%</span>
                  <span className="mt-1 text-sm text-slate-400">{jobStatus.status}</span>
                </div>
              </div>
            </div>

            {jobStatus.current_message && (
              <div className="panel-soft mt-8 rounded-[1.5rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current move</p>
                <p className="mt-2 text-base leading-7 text-slate-200">{jobStatus.current_message}</p>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="panel rounded-[2rem] p-6 sm:p-8">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Status pipeline</p>
                  <h2 className="mt-2 font-display text-3xl font-semibold text-white">Track the run clearly.</h2>
                </div>
                <p className="text-sm text-slate-400">Refreshes every 2 seconds</p>
              </div>

              <div className="mt-8 grid gap-4">
                {stageLabels.map((stage, index) => {
                  const complete = index < stageIndex;
                  const current = index === stageIndex - 1;

                  return (
                    <div
                      key={stage}
                      className={`rounded-[1.5rem] border px-4 py-4 ${
                        complete
                          ? 'border-white/10 bg-white/[0.04]'
                          : 'border-white/5 bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span
                          className="flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold"
                          style={{
                            background: complete ? `${meta.accent}22` : 'rgba(255,255,255,0.06)',
                            color: complete ? meta.accent : '#94a3b8',
                            border: complete ? `1px solid ${meta.accent}33` : '1px solid rgba(255,255,255,0.08)',
                          }}
                        >
                          0{index + 1}
                        </span>
                        <div className="flex-1">
                          <p className="text-lg font-semibold text-white">{stage}</p>
                          <p className="text-sm text-slate-400">
                            {current
                              ? 'This stage is active right now.'
                              : complete
                                ? 'Stage locked in.'
                                : 'Waiting in line.'}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                            current
                              ? 'bg-white text-slate-900'
                              : complete
                                ? 'bg-cyan-400/10 text-cyan-100'
                                : 'bg-white/5 text-slate-500'
                          }`}
                        >
                          {current ? 'Now' : complete ? 'Done' : 'Soon'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="panel-soft rounded-[1.75rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Images discovered</p>
                <p className="mt-3 font-display text-4xl font-semibold text-white">
                  {jobStatus.total_images ?? '...'}
                </p>
              </div>
              <div className="panel-soft rounded-[1.75rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Matches found</p>
                <p className="mt-3 font-display text-4xl font-semibold text-white">
                  {jobStatus.matched_images ?? '...'}
                </p>
              </div>
            </div>

            <div className="panel-soft rounded-[1.75rem] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Heads-up</p>
              <p className="mt-3 text-lg leading-8 text-slate-200">
                Keep this tab open. Once the scan wraps, we move you straight into the results gallery automatically.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
