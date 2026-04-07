'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface PlatformConfig {
  key: string;
  label: string;
  description: string;
  primary_copy_label: string;
  secondary_copy_label: string;
  card_noun: string;
}

interface SocialPack {
  title: string;
  image_files: string[];
  rationale: string;
  primary_copy: string;
  secondary_copy: string;
}

interface AssetSummary {
  file_name: string;
  caption: string;
  orientation: string;
  face_count: number;
  sharpness: number;
}

interface AnalysisResult {
  platform: PlatformConfig;
  analysis_mode: string;
  provider: string;
  model?: string | null;
  upload_name: string;
  total_images_in_zip: number;
  analyzed_images: number;
  summary: string;
  guidance: string[];
  warnings: string[];
  packs: SocialPack[];
  assets: AssetSummary[];
}

const fallbackPlatforms: PlatformConfig[] = [
  {
    key: 'instagram',
    label: 'Instagram',
    description: 'Build polished carousels and a caption that feels intentional.',
    primary_copy_label: 'Caption',
    secondary_copy_label: 'Carousel Hook',
    card_noun: 'Post Set',
  },
  {
    key: 'snapchat',
    label: 'Snapchat',
    description: 'Pick punchy story-ready images with overlay text that lands fast.',
    primary_copy_label: 'Story Script',
    secondary_copy_label: 'Overlay Text',
    card_noun: 'Story Flow',
  },
  {
    key: 'tinder',
    label: 'Tinder',
    description: 'Suggest dating-profile picks, ordering, and funny openers.',
    primary_copy_label: 'Profile Angle',
    secondary_copy_label: 'Funny Punchline',
    card_noun: 'Dating Pick',
  },
];

export default function SocialStudioPage() {
  const router = useRouter();
  const [platforms, setPlatforms] = useState<PlatformConfig[]>(fallbackPlatforms);
  const [selectedPlatform, setSelectedPlatform] = useState('instagram');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [platformLoadError, setPlatformLoadError] = useState('');

  useEffect(() => {
    const fetchPlatforms = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/social-studio/platforms`);
        const incoming = response.data?.platforms;
        if (Array.isArray(incoming) && incoming.length > 0) {
          setPlatforms(incoming);
          setSelectedPlatform(incoming[0].key);
        }
      } catch {
        setPlatformLoadError('Using built-in platform presets because the API config could not be fetched.');
      }
    };

    fetchPlatforms();
  }, []);

  const selectedConfig =
    platforms.find((platform) => platform.key === selectedPlatform) || fallbackPlatforms[0];

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    setZipFile(nextFile);
    setError('');
  };

  const handleAnalyze = async () => {
    if (!zipFile) {
      setError('Choose a ZIP file first.');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('platform', selectedPlatform);
    formData.append('zip_file', zipFile);

    try {
      const response = await axios.post(`${API_URL}/api/social-studio/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(response.data);
    } catch (err: any) {
      setResult(null);
      setError(err.response?.data?.detail || 'Failed to analyze the uploaded ZIP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden px-5 py-6 sm:px-8">
      <div className="pointer-events-none absolute inset-0 subtle-grid opacity-25" />
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-drift absolute -left-10 top-14 h-72 w-72 rounded-full bg-cyan-400/12 blur-3xl" />
        <div className="animate-float absolute right-[-5rem] top-24 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute bottom-[-5rem] left-1/3 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <header className="panel-soft flex flex-col gap-4 rounded-full px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-2xl font-semibold text-white">WhoDis Social Studio</p>
            <p className="text-sm text-slate-400">Turn a ZIP of matched photos into platform-ready suggestions.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="ghost-button px-5 py-3 text-sm uppercase tracking-[0.16em]"
            >
              Home
            </button>
          </div>
        </header>

        <section className="grid gap-8 pt-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div className="space-y-5">
            <div className="panel rounded-[2rem] p-6 sm:p-8">
              <span className="eyebrow">
                <span className="h-2 w-2 rounded-full bg-cyan-300" />
                Upload your ZIP
              </span>
              <h1 className="mt-5 font-display text-4xl font-semibold text-white sm:text-5xl">
                Get platform-specific picks from one matched-photo dump.
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
                Drop in the ZIP you downloaded from WhoDis, choose where the photos are headed, and we&apos;ll build
                post-ready groupings, captions, and funny profile copy where it fits.
              </p>

              <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-[#09111f] p-5">
                <label className="mb-3 block text-sm font-medium text-slate-300">Matched photos ZIP</label>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={handleFileChange}
                  className="block w-full rounded-2xl border border-white/10 bg-[#050b15] px-4 py-4 text-sm text-slate-200 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-400/15 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-cyan-100"
                />
                <p className="mt-3 text-sm text-slate-400">
                  {zipFile ? `Ready: ${zipFile.name}` : 'Upload the ZIP you just downloaded from the results page.'}
                </p>
              </div>

              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Destination</p>
                <div className="mt-4 grid gap-4">
                  {platforms.map((platform) => {
                    const active = platform.key === selectedPlatform;
                    return (
                      <button
                        key={platform.key}
                        type="button"
                        onClick={() => setSelectedPlatform(platform.key)}
                        className={`rounded-[1.5rem] border p-5 text-left transition ${
                          active
                            ? 'border-cyan-300/40 bg-cyan-400/10'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-display text-2xl font-semibold text-white">{platform.label}</p>
                            <p className="mt-2 text-sm leading-6 text-slate-300">{platform.description}</p>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                            {platform.card_noun}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {platformLoadError && (
                <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-5 py-4 text-sm text-amber-100">
                  {platformLoadError}
                </div>
              )}

              {error && (
                <div className="mt-6 rounded-2xl border border-red-400/25 bg-red-400/10 px-5 py-4 text-sm text-red-100">
                  {error}
                </div>
              )}

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="accent-button px-6 py-4 text-sm uppercase tracking-[0.16em] disabled:pointer-events-none disabled:opacity-60"
                >
                  {loading ? 'Analyzing ZIP...' : `Build ${selectedConfig.label} Suggestions`}
                </button>
                <p className="flex items-center text-sm leading-6 text-slate-400">
                  With `HF_TOKEN`, the app runs a multimodal model on a focused set of your strongest shots, then
                  falls back gracefully if that path is unavailable.
                </p>
              </div>
            </div>

            <div className="panel-soft rounded-[2rem] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Why this is extensible</p>
              <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300">
                <p>The backend exposes platform metadata from a registry, so adding another destination is mostly config and prompts.</p>
                <p>The response shape is generic: packs, reasons, and two copy fields. That keeps the UI reusable.</p>
                <p>Image analysis is shared across platforms, while the recommendation logic stays platform-specific.</p>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {result ? (
              <>
                <div className="panel rounded-[2rem] p-6 sm:p-8">
                  <span className="eyebrow">
                    <span className="h-2 w-2 rounded-full bg-emerald-300" />
                    Analysis ready
                  </span>
                  <h2 className="mt-5 font-display text-4xl font-semibold text-white">
                    {result.platform.label} picks from {result.upload_name}
                  </h2>
                  <p className="mt-4 text-lg leading-8 text-slate-300">{result.summary}</p>

                  <div className="mt-8 grid gap-4 sm:grid-cols-3">
                    <div className="panel-soft rounded-[1.5rem] p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mode</p>
                      <p className="mt-3 font-display text-2xl font-semibold text-white">
                        {result.analysis_mode === 'ai' ? 'AI-assisted' : 'Local fallback'}
                      </p>
                    </div>
                    <div className="panel-soft rounded-[1.5rem] p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Analyzed</p>
                      <p className="mt-3 font-display text-2xl font-semibold text-white">
                        {result.analyzed_images}/{result.total_images_in_zip}
                      </p>
                    </div>
                    <div className="panel-soft rounded-[1.5rem] p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Provider</p>
                      <p className="mt-3 font-display text-2xl font-semibold text-white">{result.provider}</p>
                    </div>
                  </div>

                  {result.model && (
                    <div className="mt-4 rounded-[1.5rem] border border-white/8 bg-white/[0.03] px-5 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Model</p>
                      <p className="mt-3 text-sm leading-7 text-slate-300">{result.model}</p>
                    </div>
                  )}
                </div>

                {result.warnings.length > 0 && (
                  <div className="panel-soft rounded-[2rem] p-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/90">Heads-up</p>
                    <div className="mt-4 space-y-3">
                      {result.warnings.map((warning) => (
                        <div key={warning} className="rounded-[1.25rem] border border-amber-400/15 bg-amber-400/10 p-4 text-sm leading-7 text-amber-100">
                          {warning}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {result.packs.map((pack) => (
                    <div key={pack.title} className="panel rounded-[2rem] p-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
                            {result.platform.card_noun}
                          </p>
                          <h3 className="mt-2 font-display text-3xl font-semibold text-white">{pack.title}</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {pack.image_files.map((fileName) => (
                            <span
                              key={fileName}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300"
                            >
                              {fileName}
                            </span>
                          ))}
                        </div>
                      </div>

                      <p className="mt-5 text-base leading-7 text-slate-300">{pack.rationale}</p>

                      <div className="mt-6 grid gap-4">
                        <div className="panel-soft rounded-[1.5rem] p-5">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {result.platform.primary_copy_label}
                          </p>
                          <p className="mt-3 text-base leading-7 text-slate-200">{pack.primary_copy}</p>
                        </div>
                        <div className="panel-soft rounded-[1.5rem] p-5">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {result.platform.secondary_copy_label}
                          </p>
                          <p className="mt-3 text-base leading-7 text-slate-200">{pack.secondary_copy}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="panel-soft rounded-[2rem] p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Posting guidance</p>
                  <div className="mt-4 space-y-4">
                    {result.guidance.map((item, index) => (
                      <div key={item} className="flex gap-4 rounded-[1.25rem] border border-white/6 bg-white/[0.03] p-4">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-sm font-semibold text-cyan-100">
                          0{index + 1}
                        </span>
                        <p className="text-sm leading-7 text-slate-300">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="panel-soft rounded-[2rem] p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Analyzed assets</p>
                      <h3 className="mt-2 font-display text-3xl font-semibold text-white">What the system saw.</h3>
                    </div>
                    <p className="text-sm text-slate-400">{result.assets.length} images scored</p>
                  </div>

                  <div className="mt-6 space-y-3">
                    {result.assets.map((asset) => (
                      <div
                        key={asset.file_name}
                        className="flex flex-col gap-4 rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="font-medium text-slate-100">{asset.file_name}</p>
                          <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            <span>{asset.orientation}</span>
                            <span>{asset.face_count} face{asset.face_count === 1 ? '' : 's'}</span>
                            <span>Sharpness {asset.sharpness.toFixed(0)}</span>
                          </div>
                        </div>
                        <p className="text-sm leading-7 text-slate-300">{asset.caption}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="panel rounded-[2rem] p-8 sm:p-10">
                <span className="eyebrow">
                  <span className="h-2 w-2 rounded-full bg-cyan-300" />
                  Social packs
                </span>
                <h2 className="mt-5 font-display text-4xl font-semibold text-white sm:text-5xl">
                  The suggestions will land here.
                </h2>
                <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
                  Upload a ZIP and pick a platform to get grouped image recommendations, platform-native copy, and
                  guidance you can actually use.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
