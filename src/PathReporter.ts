import { Reporter } from './Reporter'
import { Context, getFunctionName, ValidationError } from './index'

function stringify(v: any): string {
  return typeof v === 'function' ? getFunctionName(v) : JSON.stringify(v)
}

// const ignore = {
//   UnionType: null,
//   IntersectionType: null,
//   ExactType: null
// }

// function getKey(key: string, _codec: any, _position: number): string {
//   return key
//   // return position > 0 && codec._tag in ignore ? '_' : key
// }

function getContextPath(context: Context): string {
  let s = `: ${context[0].type.name}`
  for (let i = 1; i < context.length; i++) {
    const key = context[i].key
    s += `/${key}: ${context[i].type.name}`
  }
  return s
  // return context.map(({ key, type }, position) => `${getKey(key, type, position)}: ${type.name}`).join('/')
}

function getMessage(e: ValidationError): string {
  return e.message !== undefined
    ? e.message
    : `Invalid value ${stringify(e.value)} supplied to ${getContextPath(e.context)}`
}

/**
 * @since 1.0.0
 */
export function failure(es: Array<ValidationError>): Array<string> {
  return es.map(getMessage)
}

/**
 * @since 1.0.0
 */
export function success(): Array<string> {
  return ['No errors!']
}

/**
 * @since 1.0.0
 */
export const PathReporter: Reporter<Array<string>> = {
  report: validation => validation.fold(failure, success)
}
