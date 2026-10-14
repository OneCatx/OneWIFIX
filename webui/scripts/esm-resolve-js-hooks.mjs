import { extname } from 'node:path'

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    const bare = specifier.split(/[?#]/, 1)[0]
    if (
      error?.code === 'ERR_MODULE_NOT_FOUND'
      && (bare.startsWith('./') || bare.startsWith('../'))
      && !extname(bare)
    ) {
      return nextResolve(`${specifier}.js`, context)
    }
    throw error
  }
}
