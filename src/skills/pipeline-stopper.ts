import { defineSkill } from './registry.js';
import * as pipelineClient from '../sdk/pipeline/client.js';
import * as schemesClient from '../sdk/schemes/client.js';
import { computeRunStats } from '../sdk/pipeline/types.js';
import type { Pipeline, PipelineRunStatus } from '../sdk/pipeline/types.js';
import { resolveDemandSchemeFromCurrentBranch } from '../utils/branch-resolver.js';

/**
 * Pipeline 终止器 Skill
 * 终止正在运行的流水线，支持批量终止和项目流水线关联
 */
defineSkill(
  {
    name: 'pipeline-stopper',
    description: '终止正在运行的流水线，支持按流水线ID或任务ID终止',
    version: '1.0.0',
    author: 'devops-cli',
    parameters: [
      {
        name: 'pipelineName',
        description: '流水线名称',
        type: 'string',
        required: true,
      },
      {
        name: 'demandSchemeId',
        description: '需求项目 ID（用于查询项目流水线运行状态）',
        type: 'number',
        required: false,
      },
      {
        name: 'force',
        description: '强制终止，不提示确认',
        type: 'boolean',
        required: false,
        default: true,
      },
      {
        name: 'all',
        description: '终止该流水线所有正在运行的实例',
        type: 'boolean',
        required: false,
        default: false,
      },
    ],
    examples: [
      'dops skill run pipeline-stopper --pipeline-name acc-account',
      'dops skill run pipeline-stopper --pipeline-name acc-account --force',
      'dops skill run pipeline-stopper --pipeline-name acc-account --demand-scheme-id 456',
      'dops skill run pipeline-stopper --pipeline-name acc-account --all',
    ],
    tags: ['pipeline', 'stop', 'abort', 'cancel', 'terminate'],
  },
  async (ctx) => {
    const { pipelineName, demandSchemeId: rawDemandSchemeId, force, all } = ctx.rawArgs as {
      pipelineName: string;
      demandSchemeId?: number;
      force?: boolean;
      all?: boolean;
    };
    let demandSchemeId = rawDemandSchemeId || 0;

    // 自动从当前分支解析 demandSchemeId
    if (!demandSchemeId) {
      const resolved = await resolveDemandSchemeFromCurrentBranch();
      if (resolved) {
        demandSchemeId = resolved.id;
        ctx.output.info(`\n🔍 自动从当前分支解析到需求项目: ${resolved.name} (ID: ${resolved.id})`);
      }
    }

    if (!pipelineName) {
      return {
        success: false,
        error: '缺少必要参数: pipelineName',
        suggestions: ['使用 --pipeline-name 指定流水线名称', '使用 /pipeline list 查看可用流水线'],
      };
    }

    try {
      // 获取流水线信息
      let pipeline: Pipeline;
      try {
        pipeline = await ctx.progress(
          '正在获取流水线信息...',
          pipelineClient.getPipeline(pipelineName)
        );
      } catch (error: any) {
        if (error.name === 'AuthError' || error.statusCode === 401 || error.message?.includes('登录')) {
          return {
            success: false,
            error: '登录已过期，请重新登录',
            suggestions: ['运行 dops auth login --host https://ci.jlpay.com 登录'],
          };
        }
        return {
          success: false,
          error: `流水线 "${pipelineName}" 不存在或无法访问`,
          suggestions: ['检查 pipelineName 是否正确', '确认是否已登录'],
        };
      }

      ctx.output.info(`\n🛑 准备终止流水线: ${pipeline.pipeline_name}`);
      ctx.output.info(`   ID: ${pipeline.pipeline_id}`);

      // 查询运行状态
      let runningStatus: PipelineRunStatus | null = null;
      let stats: { running: number; completed: number; failed: number; total: number } | null = null;
      try {
        runningStatus = await pipelineClient.getPipelineRunStatus(pipeline.pipeline_name, demandSchemeId);
        stats = computeRunStats(runningStatus);
        ctx.output.info(`\n📊 当前运行状态:`);
        ctx.output.info(`   Running: ${stats.running}`);
        ctx.output.info(`   Completed: ${stats.completed}`);
        ctx.output.info(`   Failed: ${stats.failed}`);
        ctx.output.info(`   Total: ${stats.total}`);

        if (stats.running === 0) {
          return {
            success: false,
            error: '没有正在运行的流水线实例',
            suggestions: ['检查 demandSchemeId 是否正确', '该流水线当前未在运行'],
          };
        }
      } catch (error) {
        ctx.output.warning('无法获取运行状态，将继续尝试终止');
      }

      // 执行终止
      const result = await ctx.progress(
        '正在终止流水线...',
        demandSchemeId > 0
          ? schemesClient.abortSchemePipeline(demandSchemeId, pipeline.pipeline_name)
          : pipelineClient.abortPipeline(pipeline.pipeline_name)
      );

      if (result.status === 200 || result.status === 204) {
        ctx.output.success(`\n✅ 流水线终止成功`);
        if (result.context) {
          ctx.output.info(`   详情: ${result.context}`);
        }

        return {
          success: true,
          data: { pipelineName: pipeline.pipeline_name, result },
          message: `流水线 "${pipeline.pipeline_name}" 已终止`,
        };
      } else {
        return {
          success: false,
          error: `终止失败: ${result.context || `状态码 ${result.status}`}`,
          suggestions: ['流水线可能已完成或已终止', '检查是否有权限终止该流水线'],
        };
      }
    } catch (error: any) {
      if (error.name === 'AuthError' || error.statusCode === 401 || error.message?.includes('登录')) {
        return {
          success: false,
          error: '登录已过期，请重新登录',
          suggestions: ['运行 dops auth login --host https://ci.jlpay.com 登录'],
        };
      }
      // 处理特定错误
      if (error.message?.includes('404')) {
        return {
          success: false,
          error: '流水线不存在或已删除',
          suggestions: ['检查 pipelineName 是否正确'],
        };
      }

      if (error.message?.includes('409')) {
        return {
          success: false,
          error: '流水线当前状态不允许终止（可能已完成或已终止）',
          suggestions: ['使用 pipeline-status skill 查询当前状态'],
        };
      }

      return {
        success: false,
        error: error.message,
        suggestions: [
          '检查网络连接',
          '确认是否已登录',
          '检查是否有权限终止该流水线',
        ],
      };
    }
  }
);
