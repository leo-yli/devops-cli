import { describe, it, expect } from 'vitest';
import { extractFeatureId } from './branch-resolver.js';

describe('extractFeatureId', () => {
  it('从 feature/1081265 提取 1081265', () => {
    expect(extractFeatureId('feature/1081265')).toBe('1081265');
  });

  it('从 feature/1081265-api-change 提取 1081265', () => {
    expect(extractFeatureId('feature/1081265-api-change')).toBe('1081265');
  });

  it('从 Feature/1081265 提取 1081265（忽略大小写）', () => {
    expect(extractFeatureId('Feature/1081265')).toBe('1081265');
  });

  it('非 feature 分支返回 null', () => {
    expect(extractFeatureId('main')).toBeNull();
    expect(extractFeatureId('develop')).toBeNull();
    expect(extractFeatureId('release/v1.0')).toBeNull();
    expect(extractFeatureId('bugfix/abc123')).toBeNull();
  });

  it('feature 后无数字返回 null', () => {
    expect(extractFeatureId('feature/abc')).toBeNull();
    expect(extractFeatureId('feature/')).toBeNull();
  });
});
