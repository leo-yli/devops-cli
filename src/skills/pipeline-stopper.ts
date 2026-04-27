import { defineSkill } from './registry.js';
import * as pipelineClient from '../sdk/pipeline/client.js';
import * as schemesClient from '../sdk/schemes/client.js';
import type { Pipeline, PipelineRunStatus } from '../sdk/pipeline/types.js';

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
        name: 'pipelineId',
        description: '流水线 ID',
        type: 'number',
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
        default: false,
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
      'dops skill run pipeline-stopper --pipeline-id 123',
      'dops skill run pipeline-stopper --pipeline-id 123 --force',
      'dops skill run pipeline-stopper --pipeline-id 123 --demand-scheme-id 456',
      'dops skill run pipeline-stopper --pipeline-id 123 --all',
    ],
    tags: ['pipeline', 'stop', 'abort', 'cancel', 'terminate'],
  },
  async (ctx) => {
    const { pipelineId, demandSchemeId, force, all } = ctx.rawArgs as {
      pipelineId: number;
      demandSchemeId?: number;
      force?: boolean;
      all?: boolean;
    };

    if (!pipelineId) {
      return {
        success: false,
        error: '缺少必要参数: pipelineId',
        suggestions: ['使用 --pipeline-id 指定流水线ID', '使用 /pipeline list 查看可用流水线'],
      };
    }

    try {
      // 获取流水线信息
      let pipeline: Pipeline;
      try {
        pipeline = await ctx.progress(
          '正在获取流水线信息...',
          pipelineClient.getPipeline(String(pipelineId))
        );
      } catch (error) {
        return {
          success: false,
          error: `流水线 ${pipelineId} 不存在或无法访问`,
          suggestions: ['检查 pipelineId 是否正确', '确认是否已登录'],
        };
      }

      ctx.output.info(`\n🛑 准备终止流水线: ${pipeline.name}`);
      ctx.output.info(`   ID: ${pipeline.id}`);

      // 如果有 demandSchemeId，先查询运行状态
      let runningStatus: PipelineRunStatus | null = null;
      if (demandSchemeId) {
        try {
          runningStatus = await pipelineClient.getPipelineRunStatus(pipeline.name, demandSchemeId);
          ctx.output.info(`\n📊 当前运行状态:`);
          ctx.output.info(`   Running: ${runningStatus.running}`);
          ctx.output.info(`   Completed: ${runningStatus.completed}`);
          ctx.output.info(`   Failed: ${runningStatus.failed}`);
          ctx.output.info(`   Total: ${runningStatus.total}`);

          if (runningStatus.running === 0) {
            return {
              success: false,
              error: '没有正在运行的流水线实例',
              suggestions: ['检查 demandSchemeId 是否正确', '该流水线当前未在运行'],
            };
          }
        } catch (error) {
          ctx.output.warning('无法获取运行状态，将继续尝试终止');
        }
      }

      // 确认终止
      if (!force) {
        const message = all && runningStatus && runningStatus.running > 1
          ? `确认终止 "${pipeline.name}" 的所有 ${runningStatus.running} 个运行实例?`
          : `确认终止流水线 "${pipeline.name}"?`;
        
        const confirmed = await ctx.prompt.confirm(`\n${message}`);
        if (!confirmed) {
          return {
            success: false,
            message: '用户取消操作',
          };
        }
      }

      // 执行终止：有 demandSchemeId 时使用项目流水线端点
      const result = await ctx.progress(
        '正在终止流水线...',
        demandSchemeId
          ? schemesClient.abortSchemePipeline(demandSchemeId, pipeline.name)
          : pipelineClient.abortPipeline(pipeline.name)
      );

      if (result.status === 200 || result.status === 204) {
        ctx.output.success(`\n✅ 流水线终止成功`);
        if (result.context) {
          ctx.output.info(`   详情: ${result.context}`);
        }

        return {
          success: true,
          data: { pipelineId, pipelineName: pipeline.name, result },
          message: `流水线 "${pipeline.name}" 已终止`,
        };
      } else {
        return {
          success: false,
          error: `终止失败: ${result.context || `状态码 ${result.status}`}`,
          suggestions: ['流水线可能已完成或已终止', '检查是否有权限终止该流水线'],
        };
      }
    } catch (error: any) {
      // 处理特定错误
      if (error.message?.includes('404')) {
        return {
          success: false,
          error: '流水线不存在或已删除',
          suggestions: ['检查 pipelineId 是否正确'],
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
