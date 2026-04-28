import { defineSkill } from './registry.js';
import * as pipelineClient from '../sdk/pipeline/client.js';
import * as schemesClient from '../sdk/schemes/client.js';
import { computeRunStats } from '../sdk/pipeline/types.js';
import type { Pipeline } from '../sdk/pipeline/types.js';

/**
 * Pipeline 运行器 Skill
 * 触发流水线执行，支持参数传递和项目流水线关联
 */
defineSkill(
  {
    name: 'pipeline-runner',
    description: '触发流水线执行，支持自定义构建参数和项目关联',
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
        description: '需求项目 ID（用于关联项目流水线）',
        type: 'number',
        required: false,
      },
      {
        name: 'branch',
        description: '要构建的分支（覆盖默认分支）',
        type: 'string',
        required: false,
      },
      {
        name: 'environment',
        description: '部署环境: dev | test | staging | prod',
        type: 'string',
        required: false,
        enum: ['dev', 'test', 'staging', 'prod'],
      },
      {
        name: 'parameters',
        description: '额外的构建参数，JSON格式，如 {"key": "value"}',
        type: 'string',
        required: false,
      },
      {
        name: 'wait',
        description: '是否等待构建完成',
        type: 'boolean',
        required: false,
        default: false,
      },
      {
        name: 'timeout',
        description: '等待超时时间（分钟）',
        type: 'number',
        required: false,
        default: 10,
      },
    ],
    examples: [
      'dops skill run pipeline-runner --pipeline-id 123',
      'dops skill run pipeline-runner --pipeline-id 123 --demand-scheme-id 456 --environment test',
      'dops skill run pipeline-runner --pipeline-id 123 --branch feature/new-api --wait',
      'dops skill run pipeline-runner --pipeline-id 123 --parameters "{\"version\": \"1.2.3\"}"',
    ],
    tags: ['pipeline', 'run', 'trigger', 'execute', 'deploy'],
  },
  async (ctx) => {
    const { pipelineId, demandSchemeId, branch, environment, parameters, wait, timeout } = ctx.rawArgs as {
      pipelineId: number;
      demandSchemeId?: number;
      branch?: string;
      environment?: string;
      parameters?: string;
      wait?: boolean;
      timeout?: number;
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
          suggestions: ['检查 pipelineId 是否正确', '确认是否已登录', '使用 /pipeline list 查看可用流水线'],
        };
      }

      ctx.output.info(`\n🚀 准备触发流水线: ${pipeline.name}`);
      ctx.output.info(`   ID: ${pipeline.id}`);
      if (branch) ctx.output.info(`   分支: ${branch}`);
      if (environment) ctx.output.info(`   环境: ${environment}`);
      if (demandSchemeId) ctx.output.info(`   关联需求: ${demandSchemeId}`);

      // 构建参数
      const buildParams: Record<string, unknown> = {};
      
      if (branch) {
        buildParams.branch = branch;
      }
      
      if (environment) {
        buildParams.environment = environment;
        buildParams.deployEnv = environment;
      }
      
      if (demandSchemeId) {
        buildParams.demandSchemeId = demandSchemeId;
        buildParams.projectId = demandSchemeId;
      }

      // 解析额外参数
      if (parameters) {
        try {
          const extraParams = JSON.parse(parameters);
          Object.assign(buildParams, extraParams);
        } catch {
          return {
            success: false,
            error: '参数格式错误: parameters 必须是有效的 JSON 字符串',
            suggestions: ['示例: --parameters "{\\"key\\": \\"value\\"}"'],
          };
        }
      }

      ctx.output.info(`\n📦 构建参数:`);
      ctx.output.json(buildParams);

      // 确认执行
      const confirmed = await ctx.prompt.confirm(`\n确认触发流水线?`);
      if (!confirmed) {
        return {
          success: false,
          message: '用户取消操作',
        };
      }

      // 触发流水线：有 demandSchemeId 时使用项目流水线端点
      const result = await ctx.progress(
        '正在触发流水线...',
        demandSchemeId
          ? schemesClient.runSchemePipeline(demandSchemeId, pipeline.name, buildParams)
          : pipelineClient.runPipeline(pipeline.name, buildParams)
      );

      const taskId = result.task_id;
      ctx.output.success(`\n✅ 流水线已触发`);
      ctx.output.info(`   Task ID: ${taskId}`);

      // 如果需要等待完成
      if (wait) {
        const waitMinutes = timeout || 10;
        const maxAttempts = waitMinutes * 6; // 每10秒检查一次
        let attempts = 0;
        
        ctx.output.info(`\n⏳ 等待构建完成（最多 ${waitMinutes} 分钟）...`);
        
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // 等待10秒
          attempts++;
          
          try {
            // 如果有 demandSchemeId，可以查询状态
            if (demandSchemeId) {
              const status = await pipelineClient.getPipelineRunStatus(pipeline.name, demandSchemeId);
              const stats = computeRunStats(status);

              // 显示进度
              if (stats.running > 0) {
                ctx.output.info(`   [${attempts}/${maxAttempts}] 构建中... Running: ${stats.running}, Completed: ${stats.completed}, Failed: ${stats.failed}`);
              }

              // 检查是否完成
              if (stats.running === 0) {
                if (stats.failed > 0) {
                  return {
                    success: false,
                    data: { taskId, status, stats },
                    message: `构建失败: ${stats.failed} 个任务失败`,
                  };
                } else {
                  return {
                    success: true,
                    data: { taskId, status, stats },
                    message: `构建成功完成！Completed: ${stats.completed}`,
                  };
                }
              }
            } else {
              ctx.output.info(`   [${attempts}/${maxAttempts}] 等待中...`);
            }
          } catch (error) {
            // 状态查询失败，继续等待
          }
        }
        
        ctx.output.warning(`\n⚠️ 等待超时，流水线仍在运行中`);
        return {
          success: true,
          data: { taskId },
          message: `流水线已触发，但等待超时。Task ID: ${taskId}`,
          suggestions: ['使用 pipeline-status skill 查询最新状态'],
        };
      }

      return {
        success: true,
        data: { taskId, pipelineId, pipelineName: pipeline.name },
        message: `流水线 "${pipeline.name}" 已触发运行`,
        suggestions: [
          `使用 Task ID ${taskId} 查询状态`,
          wait ? '' : '使用 --wait 参数等待构建完成',
          '使用 pipeline-stopper skill 终止运行',
        ].filter(Boolean),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        suggestions: [
          '检查网络连接',
          '确认是否已登录',
          '检查流水线是否有执行权限',
        ],
      };
    }
  }
);
