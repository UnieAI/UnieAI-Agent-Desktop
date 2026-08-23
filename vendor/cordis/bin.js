#!/usr/bin/env node

import { Context } from '@unieai/cordis'
import { pathToFileURL } from 'node:url'
import Loader from '@unieai/cordis-plugin-loader'

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@unieai/cordis-plugin-include',
  config: {
    path: './cordis.yml',
  },
})
