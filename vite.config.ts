import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

export default defineConfig({
  plugins: [react(), tailwindcss(), vercelApiDev()],
})

/**
 * Local-dev only: runs the files in /api inside the Vite dev server, so
 * `npm run dev` works end-to-end without the Vercel CLI.
 * On Vercel, the real platform runs /api instead and this plugin is unused.
 */
function vercelApiDev(): Plugin {
  const routes: { pattern: RegExp; file: string }[] = [
    { pattern: /^\/api\/celebrations\/?$/, file: '/api/celebrations/index.ts' },
    { pattern: /^\/api\/celebrations\/(?<id>[^/]+)\/?$/, file: '/api/celebrations/[id].ts' },
    { pattern: /^\/api\/cleanup\/?$/, file: '/api/cleanup.ts' },
  ]

  const readBody = (req: IncomingMessage) =>
    new Promise<unknown>((resolve) => {
      let raw = ''
      req.on('data', (chunk) => (raw += chunk))
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : undefined)
        } catch {
          resolve(raw)
        }
      })
    })

  return {
    name: 'vercel-api-dev',
    apply: 'serve',
    configureServer(server) {
      // Expose ALL .env vars (not only VITE_*) to the API code, like Vercel does.
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''))

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()

        const route = routes.find((r) => r.pattern.test(url.pathname))
        if (!route) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ error: 'Not found' }))
        }

        try {
          const params = url.pathname.match(route.pattern)?.groups ?? {}
          const mod = await server.ssrLoadModule(route.file)
          const vreq = Object.assign(req, {
            query: { ...Object.fromEntries(url.searchParams), ...params },
            body: await readBody(req),
            cookies: {},
          })
          const vres = Object.assign(res, {
            status(code: number) {
              res.statusCode = code
              return vres
            },
            json(body: unknown) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(body))
              return vres
            },
            send(body: unknown) {
              res.end(body)
              return vres
            },
          })
          await mod.default(vreq, vres)
        } catch (err) {
          server.ssrFixStacktrace(err as Error)
          next(err)
        }
      })
    },
  }
}
