import assert from 'node:assert/strict'
import test from 'node:test'
import { AutoTaskRunnerCore } from './autoTaskRunnerCore'

test('runs a pending local task with claude-code and reports completion', async () => {
  const calls: string[] = []
  const runner = new AutoTaskRunnerCore({
    startLocalTask: async (localTaskId) => {
      calls.push(`start:${localTaskId}`)
      return {
        promptPath: '/repo/task.md',
        promptContent: 'do the work'
      }
    },
    executeAgent: async (params) => {
      calls.push(`agent:${params.agentType}:${params.projectPath}:${params.taskContent}`)
      return {
        status: 'completed',
        output: 'done'
      }
    },
    finishLocalTask: async (localTaskId, params) => {
      calls.push(`finish:${localTaskId}:${params.success}:${params.result}`)
    }
  })

  await runner.run({
    id: 10,
    remoteTaskId: 99,
    projectLocalPath: '/repo',
    content: 'implement feature',
    status: 'pending'
  })

  assert.deepEqual(calls, [
    'start:10',
    'agent:claude-code:/repo:do the work',
    'finish:10:true:done'
  ])
})

test('reports failed when claude-code execution fails', async () => {
  const calls: string[] = []
  const runner = new AutoTaskRunnerCore({
    startLocalTask: async () => ({
      promptPath: '/repo/task.md',
      promptContent: 'do the work'
    }),
    executeAgent: async () => ({
      status: 'failed',
      output: 'partial',
      error: 'boom'
    }),
    finishLocalTask: async (localTaskId, params) => {
      calls.push(`finish:${localTaskId}:${params.success}:${params.result}`)
    }
  })

  await runner.run({
    id: 11,
    remoteTaskId: 100,
    projectLocalPath: '/repo',
    content: 'implement feature',
    status: 'pending'
  })

  assert.deepEqual(calls, ['finish:11:false:boom\n\npartial'])
})
