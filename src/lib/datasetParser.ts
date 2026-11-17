import { MAX_IMPORT_FILE_BYTES } from '@/constants/trainer';

export interface ParsedDatasetResult {
  name: string;
  examples: number;
  size: string;
  content: string;
}

const SUPPORTED_EXTENSIONS = /\.(txt|md|jsonl|json)$/i;

/**
 * Validates and parses a user-selected TXT, Markdown, JSON, or JSONL file into JSONL lines.
 * Throws a user-facing Error message if validation or parsing fails.
 */
export async function parseDatasetFile(file: File): Promise<ParsedDatasetResult> {
  if (!SUPPORTED_EXTENSIONS.test(file.name)) {
    throw new Error('Choose a TXT, Markdown, JSON, or JSONL file.');
  }

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error('Use a file smaller than 500 KB for this browser preview.');
  }

  const text = await file.text();
  if (!text.trim()) {
    throw new Error('This file is empty. Add training content first.');
  }

  let lines: string[];

  try {
    if (/\.jsonl$/i.test(file.name)) {
      lines = text.trim().split('\n').filter(Boolean);
      lines.forEach((line) => JSON.parse(line));
    } else if (/\.json$/i.test(file.name)) {
      const parsed: unknown = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      lines = items.map((item) => JSON.stringify(item));
    } else {
      lines = text
        .split(/\n\s*\n/)
        .filter((segment) => segment.trim().length > 0)
        .map((chunk) => JSON.stringify({ text: chunk.trim() }));
    }
  } catch {
    throw new Error('Could not read the file. Check that JSON or JSONL is valid.');
  }

  return {
    name: file.name.replace(/\.[^.]+$/, ''),
    examples: lines.length,
    size: `${(file.size / 1024).toFixed(1)} KB`,
    content: lines.join('\n'),
  };
}
