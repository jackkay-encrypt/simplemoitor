// Metrics text report formatter (ported from Python)

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(size: number): string {
  let value = size || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  for (const unit of units) {
    if (value < 1024 || unit === 'TB') {
      if (unit === 'B') return `${Math.floor(value)} ${unit}`;
      return `${value.toFixed(2)} ${unit}`;
    }
    value = value / 1024;
  }
  return `${value.toFixed(2)} TB`;
}

interface MetricsData {
  hostname?: string;
  ip?: string;
  time?: string;
  cpu_percent?: number;
  cpu_count?: number;
  memory?: {
    total?: number;
    used?: number;
    available?: number;
    percent?: number;
  };
  uptime?: string;
  load_1?: number;
  load_5?: number;
  load_15?: number;
}

interface ServerInfo {
  server_id?: string;
  server_name?: string | null;
}

export function buildTextReport(server: ServerInfo, metrics: MetricsData, reason = 'scheduled'): string {
  const serverName = escapeHtml(server.server_name || metrics.hostname || server.server_id || '');
  const serverId = escapeHtml(server.server_id || '');
  const reasonText = reason === 'manual' ? '手动查询' : '定时汇报';

  const cpuPercent = Number(metrics.cpu_percent || 0);
  const cpuCount = Number(metrics.cpu_count || 1);
  const load1 = Number(metrics.load_1 || 0);
  const load5 = Number(metrics.load_5 || 0);
  const load15 = Number(metrics.load_15 || 0);
  const memPercent = Number(metrics.memory?.percent || 0);
  const memUsed = Number(metrics.memory?.used || 0);
  const memTotal = Number(metrics.memory?.total || 0);
  const memAvail = Number(metrics.memory?.available || 0);

  const lines = [
    '<b>服务器状态汇报</b>',
    '<i>SimpleMoitor v1.0</i>',
    '',
    `<b>服务器：</b>${serverName} (${serverId})`,
    `<b>类型：</b>${reasonText}`,
    `<b>主机：</b>${escapeHtml(metrics.hostname || '未知')}`,
    `<b>IP：</b>${escapeHtml(metrics.ip || '未知')}`,
    `<b>时间：</b>${escapeHtml(metrics.time || '未知')}`,
    `<b>运行时长：</b>${escapeHtml(metrics.uptime || '未知')}`,
    '',
    `<b>CPU：</b>${cpuPercent.toFixed(1)}%（${cpuCount} 核）`,
    `<b>负载：</b>${load1.toFixed(2)} / ${load5.toFixed(2)} / ${load15.toFixed(2)}`,
    `<b>内存：</b>${memPercent.toFixed(1)}%（已用 ${formatBytes(memUsed)} / 总计 ${formatBytes(memTotal)}，可用 ${formatBytes(memAvail)}）`,
  ];
  return lines.join('\n');
}
