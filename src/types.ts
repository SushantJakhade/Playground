export type RoleId = string;

export type WidgetKind =
  | 'hero'
  | 'metric-strip'
  | 'trend'
  | 'comparison'
  | 'bullet-list'
  | 'activity-feed'
  | 'table'
  | 'manifest'
  | 'spotlight';

export type WidgetSpan = 'compact' | 'balanced' | 'wide' | 'full';

export interface RoleTheme {
  accent: string;
  accentSoft: string;
  accentStrong: string;
  signal: string;
}

export interface MetricRecord {
  id: string;
  label: string;
  value: number;
  delta: number;
  trend: 'up' | 'down' | 'steady';
  unit: 'number' | 'percent' | 'currency' | 'days';
  context: string;
  sparkline: number[];
}

export interface TrendPoint {
  label: string;
  primary: number;
  benchmark: number;
  secondary?: number;
}

export interface ComparisonPoint {
  label: string;
  value: number;
  target?: number;
  note: string;
}

export interface BulletPoint {
  label: string;
  value: number;
  target: number;
  floor: number;
  stretch: number;
  unit: string;
  note: string;
}

export interface FeedItem {
  id: string;
  title: string;
  detail: string;
  category: string;
  severity: 'info' | 'attention' | 'critical';
  time: string;
}

export interface TableRow {
  id: string;
  [key: string]: string | number;
}

export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  format?: 'text' | 'number' | 'percent' | 'currency' | 'days';
}

export interface HeroWidget {
  id: string;
  kind: 'hero';
  title: string;
  description: string;
  span?: WidgetSpan;
  eyebrow: string;
  variant: 'command' | 'analysis' | 'portfolio';
  statIds: string[];
  highlights: string[];
  actionLabels: string[];
}

export interface MetricStripWidget {
  id: string;
  kind: 'metric-strip';
  title: string;
  description: string;
  span?: WidgetSpan;
  metricIds: string[];
}

export interface TrendWidget {
  id: string;
  kind: 'trend';
  title: string;
  description: string;
  span?: WidgetSpan;
  datasetId: string;
  summary: string;
}

export interface ComparisonWidget {
  id: string;
  kind: 'comparison';
  title: string;
  description: string;
  span?: WidgetSpan;
  datasetId: string;
  summary: string;
}

export interface BulletListWidget {
  id: string;
  kind: 'bullet-list';
  title: string;
  description: string;
  span?: WidgetSpan;
  datasetId: string;
  summary: string;
}

export interface ActivityFeedWidget {
  id: string;
  kind: 'activity-feed';
  title: string;
  description: string;
  span?: WidgetSpan;
  datasetId: string;
  summary: string;
}

export interface TableWidget {
  id: string;
  kind: 'table';
  title: string;
  description: string;
  span?: WidgetSpan;
  datasetId: string;
  summary: string;
  columns: TableColumn[];
  filterKeys: string[];
}

export interface ManifestWidget {
  id: string;
  kind: 'manifest';
  title: string;
  description: string;
  span?: WidgetSpan;
  notes: string[];
}

export interface SpotlightWidget {
  id: string;
  kind: 'spotlight';
  title: string;
  description: string;
  span?: WidgetSpan;
  items: string[];
  callsToAction: string[];
}

export type DashboardWidget =
  | HeroWidget
  | MetricStripWidget
  | TrendWidget
  | ComparisonWidget
  | BulletListWidget
  | ActivityFeedWidget
  | TableWidget
  | ManifestWidget
  | SpotlightWidget;

export interface ViewConfig {
  id: string;
  label: string;
  title: string;
  summary: string;
  widgets: DashboardWidget[];
}

export interface RoleConfig {
  id: RoleId;
  label: string;
  summary: string;
  description: string;
  accentLabel: string;
  capabilities: string[];
  defaultViewId: string;
  theme: RoleTheme;
  views: ViewConfig[];
}

export interface DashboardManifest {
  title: string;
  description: string;
  roles: Record<string, RoleConfig>;
}

export interface DataCatalog {
  metrics: Record<string, MetricRecord>;
  trends: Record<string, TrendPoint[]>;
  comparisons: Record<string, ComparisonPoint[]>;
  bulletSets: Record<string, BulletPoint[]>;
  feeds: Record<string, FeedItem[]>;
  tables: Record<string, TableRow[]>;
}

export interface DashboardMeta {
  environment: string;
  generatedAt: string;
  roleCount: number;
  seeded: boolean;
  source: string;
}

export interface DashboardBootstrap {
  manifest: DashboardManifest;
  data: DataCatalog;
  meta: DashboardMeta;
}
