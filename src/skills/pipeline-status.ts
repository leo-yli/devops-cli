import { defineSkill } from './registry.js';
import * as pipelineClient from '../sdk/pipeline/client.js';
import { computeRunStats } from '../sdk/pipeline/types.js';
import type { Pipeline, ExecuteLog, PipelineRunStatus } from '../sdk/pipeline/types.js';

/**
 * Pipeline 状态查询 Skill
 * 查询流水线运行状态、历史记录和实时进度
 */
defineSkill(
  {
    name: 'pipeline-status',
    description: '查询流水线运行状态、历史记录和实时进度，支持项目流水线关联查询',
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
        description: '需求项目 ID（用于查询项目流水线运行状态和历史记录）',
        type: 'number',
        required: false,
      },
      {
        name: 'buildId',
        description: '特定构建 ID（用于查询阶段详情）',
        type: 'string',
        required: false,
      },
      {
        name: 'history',
        description: '显示历史记录数量',
        type: 'number',
        required: false,
        default: 5,
      },
      {
        name: 'watch',
        description: '持续监控状态变化',
        type: 'boolean',
        required: false,
        default: false,
      },
      {
        name: 'interval',
        description: '监控刷新间隔（秒）',
        type: 'number',
        required: false,
        default: 5,
      },
    ],
    examples: [
      'dops skill run pipeline-status --pipeline-name acc-account',
      'dops skill run pipeline-status --pipeline-name acc-account --demand-scheme-id 456',
      'dops skill run pipeline-status --pipeline-name acc-account --history 10',
      'dops skill run pipeline-status --pipeline-name acc-account --watch',
      'dops skill run pipeline-status --pipeline-name acc-account --demand-scheme-id 456 --build-id 789',
    ],
    tags: ['pipeline', 'status', 'monitor', 'query', 'history'],
  },
  async (ctx) => {
    const { pipelineName, demandSchemeId, buildId, history, watch, interval } = ctx.rawArgs as {
      pipelineName: string;
      demandSchemeId?: number;
      buildId?: string;
      history?: number;
      watch?: boolean;
      interval?: number;
    };

    if (!pipelineName) {
      return {
        success: false,
        error: '缺少必要参数: pipelineName',
        suggestions: ['使用 --pipeline-name 指定流水线名称'],
      };
    }

    try {
      // 获取流水线基本信息
      const pipeline = await ctx.progress(
        '正在获取流水线信息...',
        pipelineClient.getPipeline(pipelineName)
      );

      ctx.output.info(`\n📋 流水线信息: ${pipeline.pipeline_name}`);
      ctx.output.info(`   ID: ${pipeline.pipeline_id}`);
      ctx.output.info(`   应用: ${pipeline.app_name}`);
      ctx.output.info(`   创建时间: ${pipeline.create_time ? new Date(pipeline.create_time).toLocaleString() : 'N/A'}`);

      // 如果有 demandSchemeId，查询运行状态
      if (demandSchemeId) {
        const status = await ctx.progress(
          '正在查询运行状态...',
          pipelineClient.getPipelineRunStatus(pipeline.pipeline_name, demandSchemeId)
        );

        ctx.output.info(`\n📊 当前运行状态:`);

        // 从 stages/tasks/logs 计算统计数据
        const stats = computeRunStats(status);

        // 状态表格
        const statusRows = [
          ['状态', stats.running > 0 ? '🟢 运行中' : stats.failed > 0 ? '🔴 有失败' : '⚪ 空闲'],
          ['运行中', String(stats.running)],
          ['已完成', String(stats.completed)],
          ['失败', String(stats.failed)],
          ['总计', String(stats.total)],
        ];

        if (stats.total > 0) {
          const successRate = ((stats.completed / stats.total) * 100).toFixed(1);
          statusRows.push(['成功率', `${successRate}%`]);
        }

        ctx.output.table(['指标', '数值'], statusRows);

        // 查询历史记录
        const limit = history || 5;
        const records = await ctx.progress(
          `正在获取最近 ${limit} 次执行记录...`,
          pipelineClient.getPipelineRecords(pipeline.pipeline_name, demandSchemeId, limit, 1)
        );

        if (records.data && records.data.length > 0) {
          ctx.output.info(`\n📜 最近执行记录:`);
          
          const recordRows = records.data.map((record: ExecuteLog) => {
            const status = record.state === 1 ? '✅ 成功' : record.state === -1 ? '❌ 失败' : '⏳ 运行中';
            const duration = record.cost_time ? `${(record.cost_time / 1000).toFixed(0)}s` : '-';
            return [
              `Build #${record.build_id}`,
              status,
              duration,
            ];
          });
          
          ctx.output.table(['构建', '状态', '耗时'], recordRows);

          // 如果有指定 buildId 或最新记录，查询阶段详情
          const targetBuildId = buildId || records.data[0].build_id;
          if (targetBuildId) {
            try {
              const stageDetails = await pipelineClient.getPipelineStageDetails(
                pipeline.pipeline_name,
                demandSchemeId,
                String(targetBuildId)
              );

              if (stageDetails.stages && stageDetails.stages.length > 0) {
                ctx.output.info(`\n🔍 Build #${targetBuildId} 阶段详情:`);

                const stageRows = stageDetails.stages.map((stage, index) => {
                  const status = stage.state === 1 ? '✅' : stage.state === -1 ? '❌' : '⏳';
                  const duration = stage.cost_time ? `${(stage.cost_time / 1000).toFixed(0)}s` : '-';
                  return [
                    `${status} ${stage.stage_name || `Stage ${index + 1}`}`,
                    duration,
                  ];
                });

                ctx.output.table(['阶段', '耗时'], stageRows);
              }
            } catch (error) {
              // 阶段详情查询失败，不中断流程
            }
          }
        } else {
          ctx.output.info(`\n📭 暂无执行记录`);
        }

        // 持续监控模式
        if (watch) {
          const watchInterval = (interval || 5) * 1000;
          let watchCount = 0;
          const maxWatches = 60; // 最多监控5分钟（默认间隔5秒）

          ctx.output.info(`\n👁️  开始监控（按 Ctrl+C 停止）...`);
          
          while (watchCount < maxWatches) {
            await new Promise(resolve => setTimeout(resolve, watchInterval));
            watchCount++;
            
            try {
              const newStatus = await pipelineClient.getPipelineRunStatus(pipeline.pipeline_name, demandSchemeId);
              const newStats = computeRunStats(newStatus);
              const timestamp = new Date().toLocaleTimeString();

              if (newStats.running > 0) {
                ctx.output.info(`[${timestamp}] 🟢 Running: ${newStats.running}, Completed: ${newStats.completed}, Failed: ${newStats.failed}`);
              } else if (newStats.failed > 0) {
                ctx.output.error(`[${timestamp}] 🔴 构建失败: ${newStats.failed} 个任务`);
                break;
              } else if (newStats.completed > 0) {
                ctx.output.success(`[${timestamp}] ✅ 构建完成: ${newStats.completed} 个任务`);
                break;
              } else {
                ctx.output.info(`[${timestamp}] ⏳ 等待中...`);
              }
            } catch (error) {
              ctx.output.warning(`[${new Date().toLocaleTimeString()}] 状态查询失败`);
            }
          }
          
          if (watchCount >= maxWatches) {
            ctx.output.warning('\n⚠️ 监控超时');
          }
        }

        return {
          success: true,
          data: {
            pipeline,
            status,
            records: records.data,
          },
          message: `查询成功: ${pipeline.pipeline_name}`,
          suggestions: watch ? [] : ['使用 --watch 参数持续监控', '使用 --history 参数查看更多历史记录'],
        };
      }

      // 没有 demandSchemeId，只返回基本信息
      return {
        success: true,
        data: { pipeline },
        message: `流水线: ${pipeline.pipeline_name}`,
        suggestions: ['使用 --demand-scheme-id 查询详细运行状态和历史记录'],
      };
    } catch (error: any) {
      if (error.name === 'AuthError' || error.statusCode === 401 || error.message?.includes('登录')) {
        return {
          success: false,
          error: '登录已过期，请重新登录',
          suggestions: ['运行 dops auth login --host https://ci.jlpay.com 登录'],
        };
      }
      if (error.message?.includes('404')) {
        return {
          success: false,
          error: `流水线 "${pipelineName}" 不存在`,
          suggestions: ['检查 pipelineName 是否正确'],
        };
      }

      return {
        success: false,
        error: error.message,
        suggestions: [
          '检查网络连接',
          '确认是否已登录',
          '检查是否有权限查看该流水线',
        ],
      };
    }
  }
);
