export function formatCurrency(value: number): string {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  // Plain number (no currency symbol), with thousands separators.
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(numeric);
}

export function parseAnyDate(val?: string | null): Date | null {
  if (!val) return null;
  const raw = String(val).trim();
  if (!raw || raw === '—') return null;

  // Numeric epoch timestamp (e.g. 1795073390616)
  if (/^\d{12,14}$/.test(raw)) {
    const d = new Date(Number(raw));
    if (!Number.isNaN(d.getTime())) return d;
  }

  // DD/MM/YYYY or DD-MM-YYYY (with optional HH:mm:ss)
  const dmyMatch = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(raw);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]) - 1;
    const year = Number(dmyMatch[3]);
    const hour = Number(dmyMatch[4] || 0);
    const min = Number(dmyMatch[5] || 0);
    const sec = Number(dmyMatch[6] || 0);
    const d = new Date(year, month, day, hour, min, sec);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // YYYY-MM-DD
  if (raw.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parts = raw.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // Standard Date parse (ISO strings, etc.)
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Formats any date into standard "DD/MM/YYYY HH:mm:ss" format.
 */
export function formatDateTime(isoOrDate?: string | null): string {
  const parsed = parseAnyDate(isoOrDate);
  if (!parsed) return isoOrDate ? String(isoOrDate) : '—';
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  const seconds = String(parsed.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

export function formatShortDate(isoOrDate?: string | null): string {
  return formatDateTime(isoOrDate);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Converts a Google Drive share/view URL to a thumbnail/preview URL for <img> tags.
 * If not a Google Drive URL, returns the original URL.
 */
export function getDriveThumbnailUrl(url?: string): string {
  if (!url) return '';
  const match = /\/file\/d\/([a-zA-Z0-9_-]+)/.exec(url) || /id=([a-zA-Z0-9_-]+)/.exec(url);
  if (match) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
  }
  return url;
}

/**
 * Compresses image files in the browser (max 1200px dimension, JPEG quality 0.7)
 * before uploading as a data URL to the Google Apps Script backend.
 * Reads non-image attachments (PDF, CSV, TXT) directly as base64 data URLs.
 */
export async function readFileAsPersistableDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    if (file.size > 2 * 1024 * 1024) {
      throw new Error('Non-image attachments must be under 2 MB.');
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1200;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}
