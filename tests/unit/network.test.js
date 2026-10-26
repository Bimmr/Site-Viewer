import { describe, it, expect } from 'vitest'
import { RequestScheduler, shouldUseLiveCrawling, isAbortError } from '../../js/crawl/network.js'

const deferred = () => {
  let resolve
  const promise = new Promise(r => resolve = r)
  return { promise, resolve }
}

describe('RequestScheduler', () => {
  it('limits concurrent tasks per lane', async () => {
    const scheduler = new RequestScheduler({ tab: () => 2, fetch: () => 1 }, () => 0)
    let active = 0
    let maxActive = 0
    const task = async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 10))
      active--
    }

    await Promise.all(Array.from({ length: 6 }, () => scheduler.run('tab', task)))
    expect(maxActive).toBe(2)
  })

  it('waits between starting tasks', async () => {
    const scheduler = new RequestScheduler({ fetch: () => 10 }, () => 30)
    const starts = []
    await Promise.all(Array.from({ length: 3 }, () => scheduler.run('fetch', async () => starts.push(Date.now()))))

    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(25)
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(25)
  })

  it('removes queued tasks when aborted', async () => {
    const scheduler = new RequestScheduler({ tab: () => 1 }, () => 0)
    const blocker = deferred()
    const first = scheduler.run('tab', () => blocker.promise)

    const controller = new AbortController()
    let ran = false
    const second = scheduler.run('tab', async () => ran = true, controller.signal)
    controller.abort()
    blocker.resolve()

    await first
    await expect(second).rejects.toSatisfy(isAbortError)
    expect(ran).toBe(false)
  })

  it('passes results and errors through', async () => {
    const scheduler = new RequestScheduler({ fetch: () => 1 }, () => 0)
    await expect(scheduler.run('fetch', async () => 'ok')).resolves.toBe('ok')
    await expect(scheduler.run('fetch', async () => { throw new Error('nope') })).rejects.toThrow('nope')
  })
})

describe('shouldUseLiveCrawling', () => {
  it('flags client-side rendered pages', () => {
    expect(shouldUseLiveCrawling('<body><div id="root"></div><script src="/app.js"></script></body>')).toBe(true)
  })

  it('leaves static pages alone', () => {
    const text = 'Plenty of server rendered content. '.repeat(10)
    expect(shouldUseLiveCrawling(`<body><h1>Hello</h1><p>${text}</p></body>`)).toBe(false)
  })
})
