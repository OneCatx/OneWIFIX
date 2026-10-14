export function createLatestRequestGuard() {
  let generation = 0
  const normalizeKey = (key) => String(key || '').trim()

  return {
    begin(key) {
      generation += 1
      return { generation, key: normalizeKey(key) }
    },
    invalidate() {
      generation += 1
    },
    isCurrent(request, key) {
      return Boolean(
        request
        && request.generation === generation
        && request.key === normalizeKey(key),
      )
    },
  }
}
