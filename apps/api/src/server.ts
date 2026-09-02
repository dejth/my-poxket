import { createApp } from './app.js'
import { loadApiConfig } from './config.js'

const config = loadApiConfig()
const app = await createApp(config)

try {
  await app.listen({ host: config.host, port: config.port })
} catch (error) {
  app.log.error(error)
  process.exitCode = 1
}
