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

const statusContent = {
  pending: {
    eyebrow: 'Queueing your scan',
    title: 'Warming up the sorter',
    copy: 'We are preparing the job and getting the face-matching pipeline ready.',
    accent: '#e1a24d',
    surface: 'bg-[#fff4de]',
    border: 'border-[#ecd2a2]',
  },
  processing: {
    eyebrow: 'Searching the folder',
    title: 'Separating you from the crowd',
    copy: 'WhoDis is scanning every image, comparing faces, and building your filtered gallery.',
    accent: '#1f8a86',
    surface: 'bg-[#eaf9f6]',
    border: 'border-[#b9e3de]',
  },
  completed: {
    eyebrow: 'Finished',
    title: 'Your photos are ready',
    copy: 'The best part is next. We are opening the results screen in a moment.',
    accent: '#e06a45',
    surface: 'bg-[#fff1eb]',
    border: 'border-[#efc2b4]',
  },
} as const;

const stageLabels = ['Queued', 'Scanning', 'Matching', 'Delivered'];

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

    let hasScheduledRedirect = false;
    let redirectTimeout: ReturnType<typeof setTimeout> | undefined;
    let interval: ReturnType<typeof setInterval>;

    const pollStatus = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/job-status/${jobId}`);
        const status = response.data as JobStatus;

        setJobStatus(status);

        if (status.status === 'completed' && !hasScheduledRedirect) {
          hasScheduledRedirect = true;
          clearInterval(interval);
          redirectTimeout = setTimeout(() => {
            router.push(`/results/${jobId}`);
          }, 1800);
        }

        if (status.status === 'failed') {
          clearInterval(interval);
          setError(status.error_message || 'Processing failed.');
        }
      } catch (err: any) {
        clearInterval(interval);
        setError(err.response?.data?.detail || 'Failed to fetch job status.');
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
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-0 top-20 h-72 w-72 rounded-full bg-[#efb88f]/30 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[#71c1b8]/[0.16] blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
          <div className="glass-panel w-full rounded-[36px] p-8 sm:p-10">
            <span className="section-kicker">
              <span className="h-2 w-2 rounded-full bg-[#d96b4f]" />
              Scan interrupted
            </span>
            <h1 className="mt-5 text-4xl font-semibold text-[#181311] sm:text-5xl">This run hit a snag.</h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-[#5f564f]">{error}</p>

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
                Back to home
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
        <div className="pointer-events-none absolute inset-0">
          <div className="animate-float absolute left-[12%] top-[16%] h-72 w-72 rounded-full bg-[#f0c17d]/30 blur-3xl" />
          <div className="animate-drift absolute right-[10%] top-[12%] h-80 w-80 rounded-full bg-[#71c1b8]/[0.18] blur-3xl" />
        </div>

        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
          <div className="glass-panel w-full rounded-[36px] px-6 py-10 text-center sm:px-8">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-white/50 bg-white/[0.55] shadow-[0_20px_50px_rgba(77,55,38,0.16)]">
              <div className="animate-pulse-glow h-14 w-14 rounded-full bg-[conic-gradient(from_180deg_at_50%_50%,#1f8a86,#e06a45,#e6ae58,#1f8a86)]" />
            </div>
            <h1 className="mt-6 text-4xl font-semibold text-[#181311]">Loading your scan room</h1>
            <p className="mt-3 text-base text-[#665b53]">Pulling the latest progress from the queue.</p>
          </div>
        </div>
      </div>
    );
  }

  const currentStatus =
    statusContent[jobStatus.status as keyof typeof statusContent] || statusContent.processing;

  const filledStages =
    jobStatus.status === 'pending'
      ? 1
      : jobStatus.status === 'processing'
        ? Math.max(2, Math.min(3, Math.ceil((jobStatus.progress || 0) / 40) + 1))
        : 4;

  return (
    <div className="relative min-h-screen overflow-hidden px-5 py-6 sm:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-drift absolute -left-8 top-16 h-72 w-72 rounded-full bg-[#efb985]/[0.28] blur-3xl" />
        <div className="animate-float absolute right-[-4rem] top-24 h-80 w-80 rounded-full bg-[#71c1b8]/[0.16] blur-3xl" />
        <div className="absolute bottom-[-6rem] left-1/3 h-80 w-80 rounded-full bg-[#d97554]/[0.12] blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl">
        <header className="soft-panel flex flex-col gap-4 rounded-full px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-2xl font-semibold text-[#181311]">WhoDis</p>
            <p className="text-sm text-[#665b53]">Live scan dashboard</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#665b53]">
            <span className="rounded-full border border-black/10 bg-white/60 px-4 py-2">
              Job {jobStatus.job_id.slice(0, 8)}
            </span>
            <span className="rounded-full border border-black/10 bg-white/60 px-4 py-2">
              {jobStatus.progress}% complete
            </span>
          </div>
        </header>

        <section className="grid gap-8 pt-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="glass-panel rounded-[36px] p-6 sm:p-8">
            <span className="section-kicker">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: currentStatus.accent }}
              />
              {currentStatus.eyebrow}
            </span>

            <h1 className="mt-5 text-4xl font-semibold text-[#181311] sm:text-5xl">
              {currentStatus.title}
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-[#5f564f]">{currentStatus.copy}</p>

            <div className="mt-8">
              <div
                className="mx-auto flex h-48 w-48 items-center justify-center rounded-full p-3 shadow-[0_24px_50px_rgba(77,55,38,0.18)]"
                style={{
                  background: `conic-gradient(${currentStatus.accent} ${jobStatus.progress}%, rgba(24, 19, 17, 0.09) 0)`,
                }}
              >
                <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-white/50 bg-[rgba(255,255,255,0.82)] text-center">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#786b61]">
                    Progress
                  </span>
                  <span className="mt-2 font-display text-5xl font-semibold text-[#181311]">
                    {jobStatus.progress}%
                  </span>
                  <span className="mt-1 text-sm text-[#665b53]">{jobStatus.status}</span>
                </div>
              </div>
            </div>

            {jobStatus.current_message && (
              <div className={`mt-8 rounded-[28px] border ${currentStatus.border} ${currentStatus.surface} p-5`}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#786b61]">
                  Current move
                </p>
                <p className="mt-2 text-base leading-7 text-[#433a35]">{jobStatus.current_message}</p>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="glass-panel rounded-[36px] p-6 sm:p-8">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#786b61]">
                    Stage tracker
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold text-[#181311]">A calmer way to wait.</h2>
                </div>
                <p className="text-sm text-[#665b53]">We refresh every 2 seconds.</p>
              </div>

              <div className="mt-8 grid gap-4">
                {stageLabels.map((label, index) => {
                  const isFilled = index < filledStages;
                  const isCurrent = index === filledStages - 1;

                  return (
                    <div
                      key={label}
                      className={`rounded-[24px] border px-4 py-4 transition ${
                        isFilled
                          ? 'border-black/10 bg-white/80'
                          : 'border-black/[0.06] bg-white/40'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span
                          className="flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold text-white"
                          style={{
                            backgroundColor: isFilled ? currentStatus.accent : 'rgba(24, 19, 17, 0.22)',
                            boxShadow: isCurrent
                              ? `0 10px 24px ${currentStatus.accent}44`
                              : 'none',
                          }}
                        >
                          0{index + 1}
                        </span>
                        <div className="flex-1">
                          <p className="text-lg font-semibold text-[#181311]">{label}</p>
                          <p className="text-sm text-[#665b53]">
                            {isCurrent
                              ? 'This stage is active right now.'
                              : isFilled
                                ? 'Completed and locked in.'
                                : 'Waiting in line.'}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                            isCurrent
                                ? 'bg-[#181311] text-white'
                              : isFilled
                                ? 'bg-[#f5ecde] text-[#5f564f]'
                                : 'bg-white/[0.55] text-[#91857a]'
                          }`}
                        >
                          {isCurrent ? 'Now' : isFilled ? 'Done' : 'Soon'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="soft-panel rounded-[28px] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#786b61]">
                  Images discovered
                </p>
                <p className="mt-2 font-display text-4xl font-semibold text-[#181311]">
                  {jobStatus.total_images ?? '...'}
                </p>
              </div>
              <div className="soft-panel rounded-[28px] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#786b61]">
                  Matches found
                </p>
                <p className="mt-2 font-display text-4xl font-semibold text-[#181311]">
                  {jobStatus.matched_images ?? '...'}
                </p>
              </div>
            </div>

            <div className="rounded-[30px] border border-black/[0.08] bg-[#1a1715] p-6 text-white shadow-[0_22px_55px_rgba(32,21,16,0.24)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/[0.65]">Pro tip</p>
              <p className="mt-3 text-lg leading-8 text-white/[0.88]">
                Keep this tab open. Once matching is done, we&apos;ll slide you straight into the results gallery.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
