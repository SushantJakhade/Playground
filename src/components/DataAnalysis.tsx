import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type {
  DocumentFileSummary,
  FileNumericColumnSummary,
  StoredFileAnalysis,
  TabularFileSummary,
} from '../types';

interface Column {
  column_name: string;
  column_type: string;
}

interface AnalysisProps {
  token: string;
  fileId: number;
  onBack: () => void;
}

interface FileMeta {
  original_name: string;
  size: number;
  uploaded_by: string;
  created_at: string;
}

function formatDate(iso: string): string {
  return new Date(`${iso}Z`).toLocaleString();
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function DataAnalysis({ token, fileId, onBack }: AnalysisProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
  const [analysis, setAnalysis] = useState<StoredFileAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'table' | 'charts'>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/files/${fileId}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch(`/api/files/${fileId}/data`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch(`/api/files/${fileId}/analysis`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ])
      .then(([detail, data, analysisResponse]) => {
        if (detail.ok) setFileMeta(detail.file);
        if (data.ok) {
          setColumns(data.columns);
          setRows(data.rows);
        } else {
          setColumns([]);
          setRows([]);
        }
        if (analysisResponse.ok) {
          setAnalysis(analysisResponse.analysis);
        } else {
          setAnalysis(null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fileId, token]);

  if (loading) {
    return (
      <div className="analysis-loading">
        <div className="loading-bar" aria-hidden="true" />
        <p>Loading file data...</p>
      </div>
    );
  }

  const tabularSummary =
    analysis?.summary.kind === 'tabular'
      ? (analysis.summary as TabularFileSummary)
      : null;
  const documentSummary =
    analysis?.summary.kind === 'document'
      ? (analysis.summary as DocumentFileSummary)
      : null;
  const binarySummary = analysis?.summary.kind === 'binary' ? analysis.summary : null;

  const numericCols = columns.filter((c) => c.column_type === 'number');

  const fallbackNumericSummaries: FileNumericColumnSummary[] = numericCols.map((col) => {
    const values = rows.map((r) => Number(r[col.column_name])).filter((v) => !isNaN(v));
    return {
      column: col.column_name,
      min: d3.min(values) ?? 0,
      max: d3.max(values) ?? 0,
      mean: d3.mean(values) ?? 0,
      median: values.length > 0 ? d3.median(values) ?? 0 : 0,
      count: values.length,
      nullCount: rows.length - values.length,
    };
  });

  const numericSummaries = tabularSummary?.numericColumns.length
    ? tabularSummary.numericColumns
    : fallbackNumericSummaries;

  const filteredRows = searchQuery
    ? rows.filter((row) =>
        Object.values(row).some((value) =>
          String(value).toLowerCase().includes(searchQuery.toLowerCase()),
        ),
      )
    : rows;

  const overviewRowCount = tabularSummary?.rowCount ?? rows.length;
  const overviewColumnCount = tabularSummary?.columnCount ?? columns.length;

  return (
    <div className="analysis">
      <div className="analysis__header">
        <button className="ghost-button" onClick={onBack} type="button">
          Back to files
        </button>
        <div>
          <h2 className="analysis__title">{fileMeta?.original_name ?? `File #${fileId}`}</h2>
          <p className="analysis__meta">
            {analysis?.fileKind ? `${analysis.fileKind} analysis` : 'File analysis'}
            {fileMeta && ` • uploaded by ${fileMeta.uploaded_by} • ${formatDate(fileMeta.created_at)}`}
          </p>
        </div>
      </div>

      <div className="analysis__tabs">
        {(['overview', 'table', 'charts'] as const).map((tab) => (
          <button
            className="tab-button"
            aria-current={activeTab === tab ? 'page' : undefined}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {analysis && analysis.parseStatus !== 'parsed' && (
        <div className={`analysis__status analysis__status--${analysis.parseStatus}`}>
          <strong>Status:</strong> {analysis.parseStatus}
          {binarySummary && ` • ${binarySummary.message}`}
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="analysis__overview">
          <div className="analysis__stats-grid">
            <div className="analysis__stat-card">
              <span className="analysis__stat-label">Rows</span>
              <span className="analysis__stat-value">{overviewRowCount.toLocaleString()}</span>
            </div>
            <div className="analysis__stat-card">
              <span className="analysis__stat-label">Columns</span>
              <span className="analysis__stat-value">{overviewColumnCount.toLocaleString()}</span>
            </div>
            <div className="analysis__stat-card">
              <span className="analysis__stat-label">Parse Status</span>
              <span className="analysis__stat-value">{analysis?.parseStatus ?? 'unknown'}</span>
            </div>
            <div className="analysis__stat-card">
              <span className="analysis__stat-label">Generated</span>
              <span className="analysis__stat-value">
                {analysis ? formatDate(analysis.generatedAt) : 'Not available'}
              </span>
            </div>
          </div>

          {analysis?.insights.length ? (
            <div className="analysis__insights">
              <h3 className="analysis__section-title">Live Insights</h3>
              <div className="analysis__insight-grid">
                {analysis.insights.map((insight) => (
                  <article className="analysis__insight-card" key={insight}>
                    <p>{insight}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {tabularSummary && numericSummaries.length > 0 && (
            <>
              <h3 className="analysis__section-title">Numeric Summary</h3>
              <div className="file-table-wrapper">
                <table className="file-table">
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th style={{ textAlign: 'right' }}>Min</th>
                      <th style={{ textAlign: 'right' }}>Max</th>
                      <th style={{ textAlign: 'right' }}>Mean</th>
                      <th style={{ textAlign: 'right' }}>Median</th>
                      <th style={{ textAlign: 'right' }}>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {numericSummaries.map((summary) => (
                      <tr key={summary.column}>
                        <td><strong>{summary.column}</strong></td>
                        <td style={{ textAlign: 'right' }}>{formatNumber(summary.min)}</td>
                        <td style={{ textAlign: 'right' }}>{formatNumber(summary.max)}</td>
                        <td style={{ textAlign: 'right' }}>{formatNumber(summary.mean)}</td>
                        <td style={{ textAlign: 'right' }}>{formatNumber(summary.median)}</td>
                        <td style={{ textAlign: 'right' }}>{summary.count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tabularSummary?.textColumns.length ? (
            <>
              <h3 className="analysis__section-title">Text Column Distribution</h3>
              <div className="analysis__distributions">
                {tabularSummary.textColumns.slice(0, 6).map((column) => {
                  const maxCount = column.topValues[0]?.count ?? 1;

                  return (
                    <div className="analysis__dist-card" key={column.column}>
                      <h4>{column.column}</h4>
                      <p className="analysis__dist-unique">{column.uniqueCount} unique values</p>
                      <div className="analysis__dist-bars">
                        {column.topValues.map((value) => (
                          <div className="analysis__dist-row" key={`${column.column}-${value.value}`}>
                            <span className="analysis__dist-label" title={value.value}>
                              {value.value || '(empty)'}
                            </span>
                            <div className="analysis__dist-bar-track">
                              <div
                                className="analysis__dist-bar-fill"
                                style={{ width: `${(value.count / maxCount) * 100}%` }}
                              />
                            </div>
                            <span className="analysis__dist-count">{value.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {documentSummary && (
            <>
              <h3 className="analysis__section-title">Document Summary</h3>
              <div className="analysis__document-grid">
                <div className="analysis__document-card">
                  <span className="analysis__stat-label">Words</span>
                  <strong>{documentSummary.wordCount.toLocaleString()}</strong>
                </div>
                <div className="analysis__document-card">
                  <span className="analysis__stat-label">Lines</span>
                  <strong>{documentSummary.lineCount.toLocaleString()}</strong>
                </div>
                <div className="analysis__document-card">
                  <span className="analysis__stat-label">Paragraphs</span>
                  <strong>{documentSummary.paragraphCount.toLocaleString()}</strong>
                </div>
                <div className="analysis__document-card">
                  <span className="analysis__stat-label">Pages</span>
                  <strong>{documentSummary.pageCount?.toLocaleString() ?? 'N/A'}</strong>
                </div>
              </div>

              {documentSummary.topKeywords.length > 0 && (
                <div className="analysis__keywords">
                  {documentSummary.topKeywords.map((keyword) => (
                    <span className="analysis__keyword-chip" key={keyword.term}>
                      {keyword.term} · {keyword.count}
                    </span>
                  ))}
                </div>
              )}

              {documentSummary.preview && (
                <div className="analysis__preview-card">
                  <h4>Extracted Preview</h4>
                  <p>{documentSummary.preview}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'table' && (
        <div className="analysis__table-view">
          {rows.length > 0 ? (
            <>
              <input
                className="analysis__search"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rows..."
                type="search"
                value={searchQuery}
              />
              <div className="file-table-wrapper">
                <table className="file-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      {columns.map((col) => (
                        <th
                          key={col.column_name}
                          style={{ textAlign: col.column_type === 'number' ? 'right' : 'left' }}
                        >
                          {col.column_name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, 200).map((row, index) => (
                      <tr key={index}>
                        <td style={{ color: 'var(--muted)' }}>{index + 1}</td>
                        {columns.map((col) => (
                          <td
                            key={col.column_name}
                            style={{ textAlign: col.column_type === 'number' ? 'right' : 'left' }}
                          >
                            {String(row[col.column_name] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredRows.length > 200 && (
                <p className="analysis__truncation">Showing 200 of {filteredRows.length} rows</p>
              )}
            </>
          ) : analysis?.extractedText ? (
            <div className="analysis__preview-card">
              <h4>Extracted Text</h4>
              <pre className="analysis__document-text">{analysis.extractedText}</pre>
            </div>
          ) : (
            <p className="file-empty">No row-level data is available for this file.</p>
          )}
        </div>
      )}

      {activeTab === 'charts' && (
        <div className="analysis__charts">
          {numericCols.length === 0 ? (
            <p className="file-empty">No numeric columns found for charting.</p>
          ) : (
            numericCols.slice(0, 6).map((col) => (
              <BarChart
                key={col.column_name}
                column={col.column_name}
                rows={rows}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BarChart({ column, rows }: { column: string; rows: Record<string, unknown>[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const values = rows.map((row) => Number(row[column])).filter((value) => !isNaN(value));
    if (values.length === 0) return;

    const width = 400;
    const height = 200;
    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const binGenerator = d3.bin().thresholds(20);
    const bins = binGenerator(values);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const group = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
      .domain([bins[0]?.x0 ?? 0, bins[bins.length - 1]?.x1 ?? 1])
      .range([0, innerWidth]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(bins, (bin) => bin.length) ?? 1])
      .nice()
      .range([innerHeight, 0]);

    group.selectAll('rect')
      .data(bins)
      .join('rect')
      .attr('x', (bin) => x(bin.x0 ?? 0) + 1)
      .attr('y', (bin) => y(bin.length))
      .attr('width', (bin) => Math.max(0, x(bin.x1 ?? 0) - x(bin.x0 ?? 0) - 2))
      .attr('height', (bin) => innerHeight - y(bin.length))
      .attr('fill', 'var(--accent)')
      .attr('rx', 2)
      .attr('opacity', 0.8);

    group.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(5))
      .selectAll('text')
      .style('fill', 'var(--muted)');

    group.append('g')
      .call(d3.axisLeft(y).ticks(4))
      .selectAll('text')
      .style('fill', 'var(--muted)');

    group.selectAll('.domain, .tick line').attr('stroke', 'var(--border-strong)');
  }, [column, rows]);

  return (
    <div className="analysis__chart-card">
      <h4>{column}</h4>
      <p className="analysis__chart-subtitle">Distribution histogram</p>
      <svg ref={svgRef} className="analysis__chart-svg" />
    </div>
  );
}
