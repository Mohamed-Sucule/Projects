import { useState } from 'react';
import { download } from 'poster-kit/files';
import { fileName, renderPng, renderSvg } from '../poster/export';
import type { SkyMap } from '../sky/milkyway';
import { SIZES, exportSize, pixelBudget } from 'poster-kit/sizes';
import type { Poster } from '../state/poster';
import { Icon } from 'poster-kit/Icon';

type Job = 'png' | 'svg' | 'share' | null;

export function Downloads({ poster, map }: { poster: Poster; map: SkyMap | null }) {
  const [busy, setBusy] = useState<Job>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const out = exportSize(poster.size, poster.orientation, pixelBudget());
  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] });

  async function run(job: Exclude<Job, null>) {
    setBusy(job);
    setMessage(null);
    const started = performance.now();
    try {
      if (job === 'svg') {
        download(await renderSvg(poster, map), fileName(poster, 'svg'));
        setMessage({
          text: 'SVG saved. Text uses the poster’s fonts, embedded in the file.',
          tone: 'ok',
        });
      } else {
        const png = await renderPng(poster, map);
        const name = fileName(poster, 'png');
        if (job === 'share') {
          await navigator.share({
            files: [new File([png], name, { type: 'image/png' })],
            title: poster.title || poster.place.name,
          });
          setMessage({ text: 'Shared.', tone: 'ok' });
        } else {
          download(png, name);
          const secs = ((performance.now() - started) / 1000).toFixed(1);
          setMessage({
            text: `Saved ${name} (${(png.size / 1e6).toFixed(1)} MB, ${secs} s).`,
            tone: 'ok',
          });
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // share sheet dismissed
      setMessage({
        text: err instanceof Error ? err.message : 'Something went wrong',
        tone: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      setMessage({ text: 'Link copied. Anyone who opens it gets this exact sky.', tone: 'ok' });
    } catch {
      setMessage({ text: 'Could not copy. The address bar has the link too.', tone: 'error' });
    }
  }

  const size = SIZES[poster.size];
  return (
    <div className="downloads">
      <button
        type="button"
        className="button primary"
        disabled={busy !== null}
        onClick={() => void run('png')}
      >
        {busy === 'png' ? (
          <span className="spinner small" aria-hidden="true" />
        ) : (
          <Icon name="download" />
        )}
        {busy === 'png' ? 'Preparing your poster…' : 'Download'}
      </button>
      <p className="field-note center size-note">
        PNG, {out.width.toLocaleString()} × {out.height.toLocaleString()} px
        {out.dpi ? `, ready to print at ${size.label} (${out.dpi} dpi)` : ''}
      </p>
      <div className="row">
        <button
          type="button"
          className="button"
          disabled={busy !== null}
          onClick={() => void run('svg')}
        >
          {busy === 'svg' && <span className="spinner small" aria-hidden="true" />}
          SVG
        </button>
        {canShareFiles && (
          <button
            type="button"
            className="button"
            disabled={busy !== null}
            onClick={() => void run('share')}
            aria-label="Share"
          >
            <Icon name="share" /> <span className="button-label">Share</span>
          </button>
        )}
        <button
          type="button"
          className="button"
          onClick={() => void copyLink()}
          aria-label="Copy link"
        >
          <Icon name="link" /> <span className="button-label">Copy link</span>
        </button>
      </div>
      <p
        className={`field-note ${message?.tone === 'error' ? 'error' : ''}`}
        role="status"
        aria-live="polite"
      >
        {message?.text}
      </p>
    </div>
  );
}
