import { createApp } from './app.js'
import { loadApiConfig } from './config.js'
import { registerWeb } from './web.js'

const config = loadApiConfig()
const app = await createApp(config)
await registerWeb(app)

try {
  await app.listen({ host: config.host, port: config.port })
} catch (error) {
  app.log.error(error)
  process.exitCode = 1
}
