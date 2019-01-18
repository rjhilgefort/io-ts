import * as t from '.'
import { DecodeError } from './DecodeError'

const getLabeledProductNextCodec = (codec: any, key: string, nextDecodeError: DecodeError): t.Any => {
  if (codec._tag === 'InterfaceType') {
    return codec.props[key]
  } else if (codec._tag === 'PartialType') {
    return t.union([codec.props[key], t.undefined])
  } else if (codec._tag === 'DictionaryType') {
    return nextDecodeError.expected === codec.domain.name ? codec.domain : codec.codomain
  } else if (codec._tag === 'ExactType' || codec._tag === 'StrictType') {
    return codec.type.props[key] || (t.never as any)
  } else if (codec._tag === 'ReadonlyType') {
    return getLabeledProductNextCodec(codec.type, key, nextDecodeError)
  } else if (codec._tag === 'RecursiveType') {
    return getLabeledProductNextCodec(codec.type, key, nextDecodeError)
  }
  throw new Error(`getLabeledProductNextCodec: unhandled ${codec._tag}`)
}

const getIndexedProductNextCodec = (codec: any, key: number): t.Any => {
  if (codec._tag === 'TupleType') {
    return key < codec.types.length ? codec.types[key] : t.never
  } else if (codec._tag === 'ArrayType' || codec._tag === 'ReadonlyArrayType') {
    return codec.type
  }
  throw new Error(`getIndexedProductNextCodec: unhandled ${codec._tag}`)
}

export const toErrors2 = (decodeError: DecodeError, codec: t.Any): t.Errors => {
  const errors: t.Errors = []
  const handle = (decodeError: DecodeError, context: t.Context, codec: any) => {
    switch (decodeError.type) {
      case 'Leaf':
        errors.push({ value: decodeError.actual, context, message: decodeError.message })
        break
      case 'LabeledProduct':
        for (const k in decodeError.errors) {
          const nextDecodeError = decodeError.errors[k]
          const nextCodec = getLabeledProductNextCodec(codec, k, nextDecodeError)
          handle(nextDecodeError, t.appendContext(context, k, nextCodec, nextDecodeError.actual), nextCodec)
        }
        break
      case 'IndexedProduct':
        decodeError.errors.forEach(([index, nextDecodeError]) => {
          const nextCodec = getIndexedProductNextCodec(codec, index)
          handle(nextDecodeError, t.appendContext(context, String(index), nextCodec, nextDecodeError.actual), nextCodec)
        })
        break
      case 'And':
        decodeError.errors.forEach(nextDecodeError => {
          const index = codec.types.findIndex((codec: t.Any) => codec.name === nextDecodeError.expected)
          const nextCodec = codec.types[index]
          handle(nextDecodeError, t.appendContext(context, String(index), nextCodec, nextDecodeError.actual), nextCodec)
        })
        break
      case 'Or':
        decodeError.errors.forEach(nextDecodeError => {
          const index = codec.types.findIndex((codec: t.Any) => {
            return codec.name === nextDecodeError.expected
          })
          const nextCodec = codec.types[index]
          handle(nextDecodeError, t.appendContext(context, String(index), nextCodec, nextDecodeError.actual), nextCodec)
        })
        break
    }
  }
  handle(decodeError, [{ key: '', type: codec, actual: decodeError.actual }], codec)
  return errors
}

const getContextEntry = (decodeError: DecodeError, key: string, codec: t.Any): t.ContextEntry => {
  return {
    key,
    type: codec,
    actual: decodeError.actual
  }
}

export const toErrors = (decodeError: DecodeError, codec: any): t.Errors => {
  const errors: t.Errors = []
  const visit = (decodeError: DecodeError, context: t.Context, codec: any) => {
    switch (decodeError.type) {
      case 'Leaf':
        errors.push({ value: decodeError.actual, context, message: decodeError.message })
        break
      case 'LabeledProduct':
        if (codec._tag === 'InterfaceType') {
          Object.keys(decodeError.errors).forEach(key => {
            const next = decodeError.errors[key]
            const nextCodec = codec.props[key]
            visit(next, t.appendContext(context, key, nextCodec, next.actual), nextCodec)
          })
          break
        } else if (codec._tag === 'DictionaryType') {
          Object.keys(decodeError.errors).forEach(key => {
            const next = decodeError.errors[key]
            const nextCodec = next.expected === codec.domain.name ? codec.domain : codec.codomain
            visit(next, t.appendContext(context, key, nextCodec, next.actual), nextCodec)
          })
          break
        } else if (codec._tag === 'ExactType') {
          const nexts = Object.keys(decodeError.errors).map<[string, DecodeError]>(key => [
            key,
            decodeError.errors[key]
          ])
          if (nexts.some(([_, next]) => next.expected === 'never')) {
            nexts.forEach(([key, next]) => {
              visit(next, t.appendContext(context, key, t.never, next.actual), t.never)
            })
          } else {
            visit(decodeError, context, codec.type)
          }
          break
        }
        throw new Error(`[toErrors][LabeledProduct] unhandled ${codec._tag}`)
      case 'IndexedProduct':
        if (codec._tag === 'TupleType') {
          decodeError.errors.forEach(([index, next]) => {
            const nextCodec = index > codec.types.length - 1 ? t.never : codec.types[index]
            visit(next, t.appendContext(context, String(index), nextCodec, next.actual), nextCodec)
          })
          break
        } else if (codec._tag === 'ArrayType') {
          decodeError.errors.forEach(([index, next]) => {
            const nextCodec = codec.type
            visit(next, t.appendContext(context, String(index), nextCodec, next.actual), nextCodec)
          })
          break
        }
        throw new Error(`[toErrors][IndexedProduct] unhandled ${codec._tag}`)
      case 'Or':
        if (codec._tag === 'UnionType') {
          decodeError.errors.forEach(next => {
            const index = codec.types.findIndex((codec: t.Any) => codec.name === next.expected)
            const nextCodec = codec.types[index]
            visit(next, t.appendContext(context, String(index), nextCodec, next.actual), nextCodec)
          })
          break
        }
        throw new Error(`[toErrors][Or] unhandled ${codec._tag}`)
      case 'And':
        if (codec._tag === 'IntersectionType') {
          decodeError.errors.forEach(next => {
            const index = codec.types.findIndex((codec: t.Any) => codec.name === next.expected)
            const nextCodec = codec.types[index]
            visit(next, t.appendContext(context, String(index), nextCodec, next.actual), nextCodec)
          })
          break
        } else if (codec._tag === 'ExactType') {
          if (decodeError.errors.some(next => next.expected === 'never')) {
            decodeError.errors.forEach(next => {
              console.log(decodeError)
              visit(next, t.appendContext(context, 'boh', t.never, next.actual), t.never)
            })
          } else {
            visit(decodeError, context, codec.type)
          }
          break
        }
        throw new Error(`[toErrors][And] unhandled ${codec._tag}`)
      default:
        throw new Error(`[toErrors] unhandled ${codec._tag}`)
    }
  }
  visit(decodeError, [getContextEntry(decodeError, '', codec)], codec)
  return errors
}
