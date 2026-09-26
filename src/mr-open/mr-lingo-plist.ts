// Port of the subset of Lingo literal syntax that value()/XMLmaster.interpretXML
// accepts in the map, key, binding and actor text files. Bare identifiers
// (globals like gGameObjectLayer) and calls other than numeric point()/rgb()
// (random(450), member("x", "gfx")) are kept unevaluated for the consumer.
export type LingoSymbol = { sym: string }
export type LingoPoint = { x: number; y: number }
export type LingoRgb = { r: number; g: number; b: number }
export type LingoIdent = { ident: string }
export type LingoCall = { call: string; args: LingoValue[] }
export type LingoValue =
  | number
  | string
  | LingoSymbol
  | LingoPoint
  | LingoRgb
  | LingoIdent
  | LingoCall
  | LingoValue[]
  | { [key: string]: LingoValue }

export function isSymbol(v: LingoValue, name?: string): v is LingoSymbol {
  return typeof v === 'object' && v !== null && 'sym' in v && (name === undefined || v.sym === name)
}

export function isIdent(v: LingoValue, name?: string): v is LingoIdent {
  return typeof v === 'object' && v !== null && 'ident' in v && (name === undefined || v.ident === name)
}

export function isCall(v: LingoValue, name?: string): v is LingoCall {
  return typeof v === 'object' && v !== null && 'call' in v && (name === undefined || v.call === name)
}

export function parseLingo(text: string): LingoValue {
  const p = new Parser(text)
  const v = p.value()
  // The original map files end with one or more unbalanced ']' after the root
  // list (e.g. tvsDemo.txt); Lingo's value() tolerates them, so do we.
  p.skipTrailingBrackets()
  if (!p.atEnd()) p.fail('trailing characters')
  return v
}

class Parser {
  private i = 0
  constructor(private readonly s: string) {}

  atEnd(): boolean {
    return this.i >= this.s.length
  }

  fail(msg: string): never {
    throw new Error(`Lingo parse error at offset ${this.i}: ${msg}`)
  }

  skipWs(): void {
    while (!this.atEnd() && /\s/.test(this.s[this.i]!)) this.i++
  }

  skipTrailingBrackets(): void {
    this.skipWs()
    while (this.peek() === ']') {
      this.i++
      this.skipWs()
    }
  }

  private peek(): string {
    return this.s[this.i] ?? ''
  }

  private expect(ch: string): void {
    if (this.peek() !== ch) this.fail(`expected '${ch}'`)
    this.i++
  }

  value(): LingoValue {
    this.skipWs()
    const c = this.peek()
    if (c === '[') return this.list()
    if (c === '"') return this.string()
    if (c === '#') return this.symbol()
    if (/[-0-9.]/.test(c)) return this.number()
    if (/[A-Za-z]/.test(c)) return this.identOrCall()
    this.fail('unexpected character')
  }

  private list(): LingoValue {
    this.expect('[')
    this.skipWs()
    if (this.peek() === ':') {
      this.i++
      this.skipWs()
      this.expect(']')
      return {}
    }
    if (this.peek() === ']') {
      this.i++
      return []
    }
    // property list if first element is #sym followed by ':'
    const save = this.i
    if (this.peek() === '#') {
      this.symbol()
      this.skipWs()
      const isProp = this.peek() === ':'
      this.i = save
      if (isProp) return this.propList()
    }
    const items: LingoValue[] = []
    for (;;) {
      items.push(this.value())
      this.skipWs()
      if (this.peek() === ',') {
        this.i++
        continue
      }
      this.expect(']')
      return items
    }
  }

  private propList(): { [key: string]: LingoValue } {
    const out: { [key: string]: LingoValue } = Object.create(null) as { [key: string]: LingoValue }
    for (;;) {
      this.skipWs()
      const key = this.symbol().sym
      this.skipWs()
      this.expect(':')
      out[key] = this.value()
      this.skipWs()
      if (this.peek() === ',') {
        this.i++
        continue
      }
      this.expect(']')
      return out
    }
  }

  private string(): string {
    this.expect('"')
    const start = this.i
    while (!this.atEnd() && this.peek() !== '"') this.i++
    if (this.atEnd()) this.fail('unterminated string')
    const v = this.s.slice(start, this.i)
    this.i++
    return v
  }

  private symbol(): LingoSymbol {
    this.expect('#')
    const start = this.i
    while (/[A-Za-z0-9_]/.test(this.peek())) this.i++
    if (start === this.i) this.fail('empty symbol')
    return { sym: this.s.slice(start, this.i) }
  }

  private number(): number {
    const start = this.i
    if (this.peek() === '-') this.i++
    while (/[0-9.]/.test(this.peek())) this.i++
    const v = Number(this.s.slice(start, this.i))
    if (Number.isNaN(v)) this.fail('bad number')
    return v
  }

  private identOrCall(): LingoValue {
    const start = this.i
    while (/[A-Za-z0-9_]/.test(this.peek())) this.i++
    const name = this.s.slice(start, this.i)
    this.skipWs()
    if (this.peek() !== '(') return { ident: name }
    this.i++
    const args: LingoValue[] = []
    this.skipWs()
    if (this.peek() === ')') {
      this.i++
    } else {
      for (;;) {
        args.push(this.value())
        this.skipWs()
        if (this.peek() === ',') {
          this.i++
          continue
        }
        this.expect(')')
        break
      }
    }
    const nums = args.every((a) => typeof a === 'number') ? (args as number[]) : null
    if (nums && name === 'point' && nums.length === 2) return { x: nums[0]!, y: nums[1]! }
    if (nums && name === 'rgb' && nums.length === 3) return { r: nums[0]!, g: nums[1]!, b: nums[2]! }
    return { call: name, args }
  }
}
