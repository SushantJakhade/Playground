import { TableColumn, TableRow } from '../../types';
import { formatCellValue } from '../../lib/formatters';
import { WidgetFrame } from '../WidgetFrame';
import type { TableWidget } from '../../types';

interface DataTableCardProps {
  widget: TableWidget;
  rows: TableRow[];
  query: string;
}

function matchesQuery(row: TableRow, filterKeys: string[], query: string) {
  if (!query) {
    return true;
  }

  return filterKeys.some((key) =>
    String(row[key] ?? '')
      .toLowerCase()
      .includes(query),
  );
}

function cellClassName(column: TableColumn) {
  return column.align === 'right' ? 'table-cell table-cell--right' : 'table-cell';
}

export function DataTableCard({
  widget,
  rows,
  query,
}: DataTableCardProps) {
  const filteredRows = rows.filter((row) => matchesQuery(row, widget.filterKeys, query));

  return (
    <WidgetFrame
      title={widget.title}
      description={widget.description}
      summary={widget.summary}
    >
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              {widget.columns.map((column) => (
                <th
                  className={cellClassName(column)}
                  key={column.key}
                  scope="col"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id}>
                {widget.columns.map((column) => (
                  <td className={cellClassName(column)} key={column.key}>
                    {formatCellValue(row[column.key], column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRows.length === 0 ? (
          <p className="empty-message">No rows match the active search.</p>
        ) : null}
      </div>
    </WidgetFrame>
  );
}
