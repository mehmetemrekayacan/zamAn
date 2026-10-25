/** Tarayıcı Storage sözleşmesini uygulayan, yalnızca bellekte yaşayan depo. */
export function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => { values.set(String(key), String(value)) },
    removeItem: (key) => { values.delete(String(key)) },
    clear: () => values.clear(),
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size },
  }
}
