/**
 * 数据分析服务
 * 提供常用的数据分析工具
 */
export class AnalyticsService {
  /**
   * 计算平均值
   */
  mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * 计算中位数
   */
  median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * 计算标准差
   */
  stdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }

  /**
   * 计算百分位数
   */
  percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * 计算趋势
   * @returns 'increasing' | 'decreasing' | 'stable'
   */
  trend(values: number[], threshold: number = 0.1): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable';
    const half = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, half);
    const secondHalf = values.slice(half);
    const firstAvg = this.mean(firstHalf);
    const secondAvg = this.mean(secondHalf);
    const diff = secondAvg - firstAvg;

    if (Math.abs(diff) < firstAvg * threshold) return 'stable';
    return diff > 0 ? 'increasing' : 'decreasing';
  }

  /**
   * 频率统计
   */
  frequency<T>(items: T[]): Map<T, number> {
    const freq = new Map<T, number>();
    items.forEach((item) => {
      freq.set(item, (freq.get(item) || 0) + 1);
    });
    return freq;
  }

  /**
   * 分组统计
   */
  groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
    const groups = new Map<K, T[]>();
    items.forEach((item) => {
      const key = keyFn(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });
    return groups;
  }

  /**
   * 计算相关性
   */
  correlation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }
}

export const analyticsService = new AnalyticsService();
