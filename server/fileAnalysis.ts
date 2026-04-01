import { PDFParse } from 'pdf-parse';
import * as XLSX from 'xlsx';
import type {
  FileAnalysisSummary,
  FileDataKind,
  FileNumericColumnSummary,
  FileParseStatus,
  FileTextColumnSummary,
  StoredFileAnalysis,
} from '../src/types.js';

export interface ParsedColumn {
  name: string;
  type: string;
}

export interface ParsedFileResult {
  fileKind: FileDataKind;
  parseStatus: FileParseStatus;
  columns: ParsedColumn[];
  rows: Record<string, unknown>[];
  summary: FileAnalysisSummary;
  insights: string[];
  extractedText: string | null;
}

const MAX_EXTRACTED_TEXT_LENGTH = 120_000;

const STOP_WORDS = new Set([
  'a', 'about', 'after', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been',
  'before', 'being', 'between', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'for',
  'from', 'had', 'has', 'have', 'if', 'in', 'into', 'is', 'it', 'its', 'may', 'more', 'most',
  'no', 'not', 'of', 'on', 'or', 'other', 'our', 'out', 'over', 'should', 'such', 'than', 'that',
  'the', 'their', 'them', 'there', 'these', 'they', 'this', 'those', 'to', 'under', 'up', 'was',
  'we', 'were', 'what', 'when', 'which', 'while', 'who', 'will', 'with', 'within', 'would', 'you',
  'your',
]);

function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function countOccurrences(text: string, delimiter: string): number {
  return text.split(delimiter).length - 1;
}

function inferDelimiter(text: string): string | null {
  const lines = normalizeText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (lines.length < 2) {
    return null;
  }

  const candidates = [',', '\t', ';', '|'];
  let best: { delimiter: string; score: number } | null = null;

  for (const delimiter of candidates) {
    const counts = lines.map((line) => countOccurrences(line, delimiter));
    const nonZero = counts.filter((count) => count > 0);
    const consistent = new Set(nonZero).size === 1;

    if (nonZero.length >= 2 && consistent) {
      const score = nonZero[0];
      if (score > 0 && (!best || score > best.score)) {
        best = { delimiter, score };
      }
    }
  }

  return best?.delimiter ?? null;
}

function normalizeCellValue(value: unknown): string | number {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = normalizeCellValue(value);
  }
  return normalized;
}

function deriveColumns(rows: Record<string, unknown>[]): ParsedColumn[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }

  return keys.map((name) => {
    const sample = rows
      .map((row) => row[name])
      .filter((value) => value !== '' && value !== null && value !== undefined)
      .slice(0, 50);

    const allNumbers = sample.length > 0 && sample.every((value) => typeof value === 'number');
    return { name, type: allNumbers ? 'number' : 'text' };
  });
}

function createEmptyTabularResult(sheetNames: string[]): ParsedFileResult {
  return {
    fileKind: 'tabular',
    parseStatus: 'empty',
    columns: [],
    rows: [],
    summary: {
      kind: 'tabular',
      rowCount: 0,
      columnCount: 0,
      numericColumnCount: 0,
      textColumnCount: 0,
      missingCellCount: 0,
      sheetNames,
      numericColumns: [],
      textColumns: [],
    },
    insights: ['The file was saved, but no analyzable rows were detected yet.'],
    extractedText: null,
  };
}

function buildTabularResult(
  rows: Record<string, unknown>[],
  columns: ParsedColumn[],
  sheetNames: string[],
): ParsedFileResult {
  if (rows.length === 0 || columns.length === 0) {
    return createEmptyTabularResult(sheetNames);
  }

  const numericColumns: FileNumericColumnSummary[] = [];
  const textColumns: FileTextColumnSummary[] = [];
  let missingCellCount = 0;

  for (const column of columns) {
    const rawValues = rows.map((row) => row[column.name]);
    const numericValues = rawValues.filter((value): value is number => typeof value === 'number');
    const nullCount = rawValues.filter(
      (value) => value === '' || value === null || value === undefined,
    ).length;

    missingCellCount += nullCount;

    if (column.type === 'number' && numericValues.length > 0) {
      numericColumns.push({
        column: column.name,
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
        mean: numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length,
        median: median(numericValues),
        count: numericValues.length,
        nullCount,
      });
      continue;
    }

    const frequencies = new Map<string, number>();
    for (const value of rawValues) {
      const textValue = String(value ?? '').trim();
      if (!textValue) continue;
      frequencies.set(textValue, (frequencies.get(textValue) ?? 0) + 1);
    }

    textColumns.push({
      column: column.name,
      uniqueCount: frequencies.size,
      nullCount,
      topValues: [...frequencies.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count })),
    });
  }

  const summary: FileAnalysisSummary = {
    kind: 'tabular',
    rowCount: rows.length,
    columnCount: columns.length,
    numericColumnCount: numericColumns.length,
    textColumnCount: textColumns.length,
    missingCellCount,
    sheetNames,
    numericColumns,
    textColumns,
  };

  const insights: string[] = [
    `${formatCount(rows.length)} rows and ${columns.length} columns were stored for live analysis.`,
  ];

  if (sheetNames.length > 1) {
    insights.push(`Workbook data was merged from ${sheetNames.length} sheets.`);
  }

  const widestRange = [...numericColumns].sort(
    (a, b) => (b.max - b.min) - (a.max - a.min),
  )[0];
  if (widestRange) {
    insights.push(
      `"${widestRange.column}" shows the widest numeric spread (${widestRange.min.toLocaleString()} to ${widestRange.max.toLocaleString()}).`,
    );
  }

  const richestTextColumn = [...textColumns].sort((a, b) => b.uniqueCount - a.uniqueCount)[0];
  if (richestTextColumn) {
    const leaders = richestTextColumn.topValues
      .slice(0, 3)
      .map((item) => `${item.value} (${item.count})`)
      .join(', ');
    insights.push(
      `"${richestTextColumn.column}" has ${richestTextColumn.uniqueCount.toLocaleString()} unique values${leaders ? `; most common: ${leaders}` : ''}.`,
    );
  }

  if (missingCellCount > 0) {
    insights.push(`${formatCount(missingCellCount)} cells are blank or missing in the stored dataset.`);
  }

  return {
    fileKind: 'tabular',
    parseStatus: 'parsed',
    columns,
    rows,
    summary,
    insights,
    extractedText: null,
  };
}

function parseDelimitedText(
  text: string,
  delimiter: string,
  sheetNames: string[] = ['Imported data'],
): ParsedFileResult {
  const workbook = XLSX.read(text, {
    type: 'string',
    FS: delimiter,
    raw: true,
    dense: true,
    cellDates: true,
  });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true })
    .map((row) => normalizeRow(row));
  const columns = deriveColumns(rows);
  return buildTabularResult(rows, columns, sheetNames);
}

function parseWorkbook(data: Buffer): ParsedFileResult {
  const workbook = XLSX.read(data, {
    type: 'buffer',
    raw: true,
    dense: true,
    cellDates: true,
  });

  const sheetNames = workbook.SheetNames;
  const rows: Record<string, unknown>[] = [];

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils
      .sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true })
      .map((row) => normalizeRow(row));

    for (const row of sheetRows) {
      rows.push(sheetNames.length > 1 ? { __sheet: sheetName, ...row } : row);
    }
  }

  const columns = deriveColumns(rows);
  return buildTabularResult(rows, columns, sheetNames);
}

function parseJson(text: string): ParsedFileResult {
  const parsed = JSON.parse(text);
  const source = Array.isArray(parsed)
    ? parsed
    : parsed?.data ?? parsed?.results ?? parsed?.items ?? [parsed];

  const rows = source.map((item: unknown, index: number) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return normalizeRow(item as Record<string, unknown>);
    }
    return normalizeRow({ index: index + 1, value: item });
  });

  const columns = deriveColumns(rows);
  return buildTabularResult(rows, columns, ['JSON']);
}

function buildDocumentResult(text: string, pageCount?: number): ParsedFileResult {
  const normalized = normalizeText(text);
  const storedText = truncateText(normalized, MAX_EXTRACTED_TEXT_LENGTH);
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const paragraphs = normalized
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);
  const words = normalized.match(/[A-Za-z0-9][A-Za-z0-9'/-]*/g) ?? [];
  const frequentTerms = new Map<string, number>();

  for (const word of words) {
    const term = word.toLowerCase();
    if (term.length < 3 || STOP_WORDS.has(term)) continue;
    frequentTerms.set(term, (frequentTerms.get(term) ?? 0) + 1);
  }

  const topKeywords = [...frequentTerms.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([term, count]) => ({ term, count }));

  const sampledNumbers = [...new Set(normalized.match(/[$€£]?\d[\d,.]*(?:%|[kKmMbB])?/g) ?? [])]
    .slice(0, 8);

  const summary: FileAnalysisSummary = {
    kind: 'document',
    characterCount: normalized.length,
    wordCount: words.length,
    lineCount: lines.length,
    paragraphCount: paragraphs.length,
    pageCount,
    preview: truncateText(lines.slice(0, 8).join(' '), 600),
    topKeywords,
    sampledNumbers,
  };

  const insights = [
    `${formatCount(words.length)} words were extracted from ${pageCount ? `${pageCount} pages` : `${lines.length} lines`}.`,
  ];

  if (topKeywords.length > 0) {
    insights.push(`Recurring terms: ${topKeywords.slice(0, 5).map((item) => item.term).join(', ')}.`);
  }

  if (sampledNumbers.length > 0) {
    insights.push(`Detected numeric references: ${sampledNumbers.slice(0, 5).join(', ')}.`);
  }

  if (storedText.length < normalized.length) {
    insights.push('The extracted text preview was truncated for storage efficiency.');
  }

  return {
    fileKind: 'document',
    parseStatus: normalized.trim() ? 'parsed' : 'empty',
    columns: [],
    rows: [],
    summary,
    insights,
    extractedText: storedText,
  };
}

function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex === -1 ? '' : filename.slice(dotIndex).toLowerCase();
}

function createUnsupportedResult(filename: string): ParsedFileResult {
  return {
    fileKind: 'binary',
    parseStatus: 'unsupported',
    columns: [],
    rows: [],
    summary: {
      kind: 'binary',
      message: `${filename} was saved to the database, but this file type is not yet parsed for interactive analysis.`,
    },
    insights: ['The original file is stored safely. Add a parser for this format to unlock structured analysis.'],
    extractedText: null,
  };
}

export async function analyzeUploadedFile(
  filename: string,
  mimeType: string,
  data: Buffer,
): Promise<ParsedFileResult> {
  const extension = getExtension(filename);
  const normalizedText = normalizeText(data.toString('utf-8'));

  try {
    if (extension === '.csv') {
      return parseDelimitedText(normalizedText, ',', ['CSV']);
    }

    if (extension === '.tsv') {
      return parseDelimitedText(normalizedText, '\t', ['TSV']);
    }

    if (extension === '.json') {
      return parseJson(normalizedText);
    }

    if (['.xlsx', '.xls', '.xlsm', '.xlsb', '.ods'].includes(extension)) {
      return parseWorkbook(data);
    }

    if (extension === '.pdf') {
      const parser = new PDFParse({ data: new Uint8Array(data) });
      try {
        const result = await parser.getText();
        return buildDocumentResult(result.text, result.total);
      } finally {
        await parser.destroy().catch(() => {});
      }
    }

    if (['.txt', '.md'].includes(extension) || mimeType.startsWith('text/')) {
      const delimiter = inferDelimiter(normalizedText);
      if (delimiter) {
        return parseDelimitedText(normalizedText, delimiter, ['Text import']);
      }
      return buildDocumentResult(normalizedText);
    }

    return createUnsupportedResult(filename);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parsing error';
    return {
      fileKind: extension === '.pdf' || mimeType.startsWith('text/') ? 'document' : 'binary',
      parseStatus: 'error',
      columns: [],
      rows: [],
      summary: {
        kind: 'binary',
        message: `The file was saved, but parsing failed: ${message}`,
      },
      insights: [`Parsing failed for ${filename}: ${message}`],
      extractedText: null,
    };
  }
}

export function serializeStoredAnalysis(
  fileId: number,
  parsed: ParsedFileResult,
  generatedAt: string,
): StoredFileAnalysis {
  return {
    fileId,
    fileKind: parsed.fileKind,
    parseStatus: parsed.parseStatus,
    summary: parsed.summary,
    insights: parsed.insights,
    extractedText: parsed.extractedText,
    generatedAt,
  };
}
