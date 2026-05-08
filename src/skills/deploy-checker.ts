import { defineSkill } from './registry.js';
import * as pipelineClient from '../sdk/pipeline/client.js';
import * as schemesClient from '../sdk/schemes/client.js';

/**
 * 部署前检查 Skill
 * 检查部署前置条件：需求项目状态、流水线状态、代码合并状态等
 */
defineSkill(
  {
    name: 'deploy-checker',
    description: '部署前检查工具，验证需求项目、流水线、代码合并等前置条件',
    version: '1.0.0',
    author: 'devops-cli',
    parameters: [
      {
        name: 'demandSchemeId',
        description: '需求项目 ID',
        type: 'number',
        required: true,
      },
      {
        name: 'pipelineName',
        description: '流水线名称（可选，不指定则检查所有关联流水线）',
        type: 'string',
        required: false,
      },
      {
        name: 'environment',
        description: '目标环境',
        type: 'string',
        required: false,
        default: 'staging',
        enum: ['dev', 'staging', 'prod'],
      },
    ],
    examples: [
      'dops skill run deploy-checker --demand-scheme-id 123',
      'dops skill run deploy-checker --demand-scheme-id 123 --pipeline-name acc-account --environment prod',
    ],
    tags: ['deploy', 'check', 'pre-deployment'],
  },
  async (ctx) => {
    const { demandSchemeId, pipelineName, environment = 'staging' } = ctx.rawArgs as {
      demandSchemeId: number;
      pipelineName?: string;
      environment: string;
    };

    if (!demandSchemeId) {
      return { success: false, error: '缺少必要参数: demandSchemeId' };
    }

    const checks: Array<{
      name: string;
      status: 'pass' | 'fail' | 'warning' | 'pending';
      message: string;
      details?: string;
    }> = [];

    try {
      // 1. 检查需求项目状态
      ctx.output.info('\n🔍 正在检查部署条件...');
      ctx.output.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      const demandScheme = await ctx.progress(
        '检查需求项目状态...',
        schemesClient.getDemandScheme(demandSchemeId)
      );

      if (demandScheme.is_delete) {
        checks.push({
          name: '需求项目存在',
          status: 'fail',
          message: `需求项目 "${demandScheme.name}" 已被删除`,
        });
      } else if (demandScheme.archived) {
        checks.push({
          name: '需求项目状态',
          status: 'warning',
          message: `需求项目 "${demandScheme.name}" 已归档`,
          details: '归档项目仍可部署，但建议确认是否必要',
        });
      } else {
        checks.push({
          name: '需求项目状态',
          status: 'pass',
          message: `需求项目 "${demandScheme.name}" 状态正常`,
          details: `分支: ${demandScheme.git_branch}`,
        });
      }

      // 2. 检查代码合并状态
      if (demandScheme.is_mr) {
        checks.push({
          name: '代码合并',
          status: 'pass',
          message: '代码已合并到主分支',
        });
      } else {
        checks.push({
          name: '代码合并',
          status: 'warning',
          message: '代码尚未合并到主分支',
          details: '建议先完成代码合并再部署到生产环境',
        });
      }

      // 3. 检查流水线状态
      const pipelinesToCheck: { name: string }[] = [];

      if (pipelineName) {
        const p = await pipelineClient.getPipeline(pipelineName);
        pipelinesToCheck.push({ name: p.pipeline_name });
      } else {
        const schemePipelines = await schemesClient.listSchemePipelines(demandScheme.scheme_id);
        for (const sp of schemePipelines.slice(0, 5)) {
          if (sp.pipeline_name) {
            try {
              const p = await pipelineClient.getPipeline(sp.pipeline_name);
              pipelinesToCheck.push({ name: p.pipeline_name });
            } catch {
              // 忽略
            }
          }
        }
      }

      for (const p of pipelinesToCheck) {
        try {
          const records = await pipelineClient.getPipelineRecords(p.name, demandSchemeId, 1, 1);
          if (records.data && records.data.length > 0) {
            const lastRun = records.data[0];
            if (lastRun.state === 1) {
              checks.push({
                name: `流水线 "${p.name}"`,
                status: 'pass',
                message: '最近一次构建成功',
                details: `Build #${lastRun.build_id}, 耗时 ${lastRun.cost_time / 1000}s`,
              });
            } else {
              checks.push({
                name: `流水线 "${p.name}"`,
                status: 'fail',
                message: '最近一次构建失败',
                details: `Build #${lastRun.build_id} 状态码: ${lastRun.state}`,
              });
            }
          } else {
            checks.push({
              name: `流水线 "${p.name}"`,
              status: 'warning',
              message: '暂无构建记录',
              details: '建议先触发一次构建验证',
            });
          }
        } catch (e: any) {
          checks.push({
            name: `流水线 "${p.name}"`,
            status: 'warning',
            message: '无法获取构建状态',
            details: e.message,
          });
        }
      }

      // 4. 环境特定检查
      if (environment === 'prod') {
        // 生产环境额外检查
        if (!demandScheme.is_mr) {
          checks.push({
            name: '生产环境发布条件',
            status: 'fail',
            message: '代码未合并，禁止发布到生产环境',
            details: '请完成 MR 合并后再发布',
          });
        } else {
          checks.push({
            name: '生产环境发布条件',
            status: 'pass',
            message: '代码已合并，符合发布条件',
          });
        }
      }

      // 输出检查结果
      ctx.output.info('\n📋 检查结果:\n');

      const passCount = checks.filter((c) => c.status === 'pass').length;
      const failCount = checks.filter((c) => c.status === 'fail').length;
      const warningCount = checks.filter((c) => c.status === 'warning').length;

      for (const check of checks) {
        const icon =
          check.status === 'pass'
            ? '✅'
            : check.status === 'fail'
            ? '❌'
            : check.status === 'warning'
            ? '⚠️'
            : '⏳';

        if (check.status === 'fail') {
          ctx.output.error(`${icon} ${check.name}`);
        } else if (check.status === 'warning') {
          ctx.output.warning(`${icon} ${check.name}`);
        } else {
          ctx.output.success(`${icon} ${check.name}`);
        }
        ctx.output.info(`   ${check.message}`);
        if (check.details) {
          ctx.output.info(`   ${check.details}`);
        }
        ctx.output.info('');
      }

      // 总结
      ctx.output.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      ctx.output.info(`✅ 通过: ${passCount}  |  ❌ 失败: ${failCount}  |  ⚠️ 警告: ${warningCount}`);

      const allPassed = failCount === 0;

      if (allPassed) {
        ctx.output.success('\n🎉 所有检查通过，可以安全部署！');
        if (warningCount > 0) {
          ctx.output.warning('注意处理以上警告项');
        }
      } else {
        ctx.output.error('\n⛔ 存在失败项，建议修复后再部署');
      }

      return {
        success: allPassed,
        message: `检查完成: ${passCount} 通过, ${failCount} 失败, ${warningCount} 警告`,
        data: {
          checks,
          summary: { pass: passCount, fail: failCount, warning: warningCount },
          canDeploy: allPassed,
        },
      };
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
        error: error.message,
        suggestions: ['确认 demandSchemeId 是否正确', '检查是否已登录平台'],
      };
    }
  }
);
