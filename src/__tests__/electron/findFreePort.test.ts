import { describe, it, expect } from 'vitest'
import net from 'node:net'
import { findFreePort } from '../../../electron/findFreePort'

describe('findFreePort', () => {
  it('resolves a port number that can immediately be bound', async () => {
    const port = await findFreePort()
    expect(typeof port).toBe('number')
    expect(port).toBeGreaterThan(0)

    await new Promise<void>((resolve, reject) => {
      const server = net.createServer()
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => server.close(() => resolve()))
    })
  })

  it('can be called repeatedly without error', async () => {
    const ports = await Promise.all([findFreePort(), findFreePort(), findFreePort()])
    for (const p of ports) expect(p).toBeGreaterThan(0)
  })
})
