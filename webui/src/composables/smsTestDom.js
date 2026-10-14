const dataStores = new Map()

function memoryStorage() {
  const id = dataStores.size
  const data = new Map()
  dataStores.set(id, data)
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(String(key), String(value)) },
    removeItem: (key) => { data.delete(String(key)) },
  }
}

function fakeEl(tag = 'div') {
  const el = {
    nodeType: 1,
    nodeName: String(tag).toUpperCase(),
    tagName: String(tag).toUpperCase(),
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    childNodes: [],
    parentNode: null,
    nextSibling: null,
    style: {},
    attributes: Object.create(null),
    innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
    setAttribute(name, value) { this.attributes[name] = value },
    removeAttribute(name) { delete this.attributes[name] },
    getAttribute(name) { return this.attributes[name] ?? null },
    addEventListener() {},
    removeEventListener() {},
    appendChild(child) {
      child.parentNode = this
      this.childNodes.push(child)
      return child
    },
    insertBefore(child, ref) {
      child.parentNode = this
      const index = ref ? this.childNodes.indexOf(ref) : -1
      if (index >= 0) this.childNodes.splice(index, 0, child)
      else this.childNodes.push(child)
      return child
    },
    removeChild(child) {
      const index = this.childNodes.indexOf(child)
      if (index >= 0) this.childNodes.splice(index, 1)
      child.parentNode = null
      return child
    },
    get textContent() {
      return this.childNodes.map((child) => child.textContent || child.data || '').join('')
    },
    set textContent(value) {
      this.childNodes = []
      this._text = value
    },
    get ownerDocument() { return globalThis.document },
  }
  return el
}

if (!globalThis.window) globalThis.window = globalThis
if (!globalThis.history) {
  globalThis.history = { state: null, pushState() {}, replaceState() {}, go() {}, back() {}, forward() {} }
}
if (!globalThis.location) {
  globalThis.location = {
    href: 'http://127.0.0.1/sms',
    origin: 'http://127.0.0.1',
    protocol: 'http:',
    host: '127.0.0.1',
    hostname: '127.0.0.1',
    port: '',
    pathname: '/sms',
    search: '',
    hash: '',
    assign() {},
    replace() {},
  }
}
if (!globalThis.localStorage) globalThis.localStorage = memoryStorage()
if (!globalThis.sessionStorage) globalThis.sessionStorage = memoryStorage()
if (!globalThis.HTMLElement) globalThis.HTMLElement = class HTMLElement {}
if (!globalThis.SVGElement) globalThis.SVGElement = class SVGElement {}
if (!globalThis.Element) globalThis.Element = class Element {}
if (!globalThis.Node) {
  globalThis.Node = class Node {
    static ELEMENT_NODE = 1
    static TEXT_NODE = 3
    static COMMENT_NODE = 8
  }
}
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)
}
if (!globalThis.document || !globalThis.document.__smsTestDom) {
  const html = fakeEl('html')
  const body = fakeEl('body')
  html.appendChild(body)
  globalThis.document = {
    __smsTestDom: true,
    documentElement: html,
    body,
    visibilityState: 'visible',
    createElement: (tag) => fakeEl(tag),
    createElementNS: (_ns, tag) => fakeEl(tag),
    createTextNode: (text) => ({
      nodeType: 3,
      nodeValue: String(text),
      data: String(text),
      textContent: String(text),
      parentNode: null,
      get ownerDocument() { return globalThis.document },
    }),
    createComment: (text) => ({
      nodeType: 8,
      nodeValue: String(text),
      data: String(text),
      parentNode: null,
      get ownerDocument() { return globalThis.document },
    }),
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
  }
}
