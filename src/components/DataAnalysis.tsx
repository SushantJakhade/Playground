import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

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

interface NumericSummary {
  column: string;
  min: number;
  max: number;
  mean: number;
  median: number;
  count: number;
}

export function DataAnalysis({ token, fileId, onBack }: AnalysisProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'table' | 'charts'>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/files/${fileId}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch(`/api/files/${fileId}/data`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ])
      .then(([detail, data]) => {
        if (detail.ok) setFileMeta(detail.file);
        if (data.ok) {
          setColumns(data.columns);
          setRows(data.rows);
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

  const numericCols = columns.filter((c) => c.column_type === 'number');
  const textCols = columns.filter((c) => c.column_type === 'text');

  const numericSummaries: NumericSummary[] = numericCols.map((col) => {
    const values = rows.map((r) => Number(r[col.column_name])).filter((v) => !isNaN(v));
    const sorted = [...values].sort((a, b) => a - b);
    return {
      column: col.column_name,
      min: d3.min(values) ?? 0,
      max: d3.max(values) ?? 0,
      mean: d3.mean(values) ?? 0,
      median: sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0,
      count: values.length,
    };
  });

  const filteredRows = searchQuery
    ? rows.filter((row) =>
        Object.values(row).some((v) =>
          String(v).toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : rows;

  return (
    <div className="analysis">
      <div className="analysis__header">
        <button className="ghost-button" onClick={onBack} type="button">
          Back to files
        </button>
        <div>
          <h2 className="analysis__title">{fileMeta?.original_name ?? `File #${fileId}`}</h2>
          <p className="analysis__meta">
            {rows.length} rows, {columns.length} columns
            {fileMeta && ` — uploaded by ${fileMeta.uploaded_by}`}
          </p>
        </div>
      </div>

      <div className="analysis__tabs">
        {(['overview', 'table', 'charts'] as const).map((tab) => (
          <button
            className={`tab-button ${activeTab === tab ? '' : ''}`}
            aria-current={activeTab === tab ? 'page' : undefined}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="analysis__overview">
          <div className="analysis__stats-grid">
            <div className="analysis__stat-card">
              <span className="analysis__stat-label">Total Rows</span>
              <span className="analysis__stat-value">{rows.length.toLocaleString()}</span>
            </div>
            <div className="analysis__stat-card">
              <span className="analysis__stat-label">Columns</span>
              <span className="analysis__stat-value">{columns.length}</span>
            </div>
            <div className="analysis__stat-card">
              <span className="analysis__stat-label">Numeric Fields</span>
              <span className="analysis__stat-value">{numericCols.length}</span>
            </div>
            <div className="analysis__stat-card">
              <span className="analysis__stat-label">Text Fields</span>
              <span className="analysis__stat-value">{textCols.length}</span>
            </div>
          </div>

          {numericSummaries.length > 0 && (
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
                    {numericSummaries.map((s) => (
                      <tr key={s.column}>
                        <td><strong>{s.column}</strong></td>
                        <td style={{ textAlign: 'right' }}>{s.min.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td style={{ textAlign: 'right' }}>{s.max.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td style={{ textAlign: 'right' }}>{s.mean.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td style={{ textAlign: 'right' }}>{s.median.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td style={{ textAlign: 'right' }}>{s.count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {textCols.length > 0 && (
            <>
              <h3 className="analysis__section-title">Text Column Distribution</h3>
              <div className="analysis__distributions">
                {textCols.slice(0, 6).map((col) => {
                  const freq: Record<string, number> = {};
                  for (const row of rows) {
                    const val = String(row[col.column_name] ?? '');
                    freq[val] = (freq[val] ?? 0) + 1;
                  }
                  const top = Object.entries(freq)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);
                  const maxCount = top[0]?.[1] ?? 1;

                  return (
                    <div className="analysis__dist-card" key={col.column_name}>
                      <h4>{col.column_name}</h4>
                      <p className="analysis__dist-unique">{Object.keys(freq).length} unique values</p>
                      <div className="analysis__dist-bars">
                        {top.map(([val, count]) => (
                          <div className="analysis__dist-row" key={val}>
                            <span className="analysis__dist-label" title={val}>{val || '(empty)'}</span>
                            <div className="analysis__dist-bar-track">
                              <div
                                className="analysis__dist-bar-fill"
                                style={{ width: `${(count / maxCount) * 100}%` }}
                              />
                            </div>
                            <span className="analysis__dist-count">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'table' && (
        <div className="analysis__table-view">
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
                    <th key={col.column_name} style={{ textAlign: col.column_type === 'number' ? 'right' : 'left' }}>
                      {col.column_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 200).map((row, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--muted)' }}>{i + 1}</td>
                    {columns.map((col) => (
                      <td key={col.column_name} style={{ textAlign: col.column_type === 'number' ? 'right' : 'left' }}>
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

// ── Mini bar chart using D3 ──

function BarChart({ column, rows }: { column: string; rows: Record<string, unknown>[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const values = rows.map((r) => Number(r[column])).filter((v) => !isNaN(v));
    if (values.length === 0) return;

    const width = 400;
    const height = 200;
    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    // Create histogram bins
    const binGenerator = d3.bin().thresholds(20);
    const bins = binGenerator(values);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
      .domain([bins[0]?.x0 ?? 0, bins[bins.length - 1]?.x1 ?? 1])
      .range([0, innerW]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(bins, (d) => d.length) ?? 1])
      .nice()
      .range([innerH, 0]);

    g.selectAll('rect')
      .data(bins)
      .join('rect')
      .attr('x', (d) => x(d.x0 ?? 0) + 1)
      .attr('y', (d) => y(d.length))
      .attr('width', (d) => Math.max(0, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 2))
      .attr('height', (d) => innerH - y(d.length))
      .attr('fill', 'var(--accent)')
      .attr('rx', 2)
      .attr('opacity', 0.8);

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5))
      .selectAll('text')
      .style('fill', 'var(--muted)');

    g.append('g')
      .call(d3.axisLeft(y).ticks(4))
      .selectAll('text')
      .style('fill', 'var(--muted)');

    g.selectAll('.domain, .tick line').attr('stroke', 'var(--border-strong)');
  }, [column, rows]);

  return (
    <div className="analysis__chart-card">
      <h4>{column}</h4>
      <p className="analysis__chart-subtitle">Distribution histogram</p>
      <svg ref={svgRef} className="analysis__chart-svg" />
    </div>
  );
}
