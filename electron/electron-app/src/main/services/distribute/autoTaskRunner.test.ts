import assert from 'node:assert/strict'
import test from 'node:test'
import { AutoTaskRunner } from './autoTaskRunner'
import type { AutoTaskRunnerTask } from './autoTaskRunnerCore'

const pendingTask: AutoTaskRunnerTask = {
  id: 1,
  remoteTaskId: 10,
  projectLocalPath: '/repo',
  content: 'work',
  status: 'pending'
}

test('does not run queued tasks when auto run is disabled', async () => {
  let started = 0
  const runner = new AutoTaskRunner({
    isEnabled: () => false,
    getTask: () => pendingTask,
    getPendingTasks: () => [pendingTask],
    startLocalTask: async () => {
      started += 1
      return { promptPath: '/repo/task.md', promptContent: 'work' }
    },
    executeAgent: async () => ({ status: 'completed', output: 'done' }),
    finishLocalTask: async () => {}
  })

  runner.enqueue(1)
  await runner.waitForIdle()

  assert.equal(started, 0)
})

test('runs pending tasks after auto run is enabled', async () => {
  let enabled = false
  const calls: string[] = []
  const runner = new AutoTaskRunner({
    isEnabled: () => enabled,
    getTask: () => pendingTask,
    getPendingTasks: () => [pendingTask],
    startLocalTask: async (localTaskId) => {
      calls.push(`start:${localTaskId}`)
      return { promptPath: '/repo/task.md', promptContent: 'work' }
    },
    executeAgent: async () => ({ status: 'completed', output: 'done' }),
    finishLocalTask: async (localTaskId, params) => {
      calls.push(`finish:${localTaskId}:${params.success}`)
    }
  })

  enabled = true
  runner.enqueuePending()
  await runner.waitForIdle()

  assert.deepEqual(calls, ['start:1', 'finish:1:true'])
})
