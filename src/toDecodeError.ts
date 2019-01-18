import * as t from '.'
import { DecodeError, labeledProduct, leaf, indexedProduct, or, and } from './DecodeError'

type Forest<A> = Array<Tree<A>>

interface Tree<A> {
  value: A
  forest: Forest<A>
}

interface Node {
  key: string
  actual: unknown
  type: t.Decoder<any, any>
  message: string | undefined
}

const getNode = (context: t.Context, message: string | undefined): Node => {
  const contextEntry = context[0]
  return {
    key: contextEntry.key,
    actual: contextEntry.actual,
    type: contextEntry.type,
    message: context.length === 1 ? message : undefined
  }
}

const fromContext = (context: t.Context, message: string | undefined): Tree<Node> => {
  const value = getNode(context, message)
  const forest: Array<Tree<Node>> = []
  const subContext = context.slice(1)
  if (subContext.length > 0) {
    forest.push(fromContext(subContext, message))
  }
  return {
    value,
    forest
  }
}

export const fromError = (error: t.ValidationError): Tree<Node> => {
  return fromContext(error.context, error.message)
}

const concatTree = (forest: Forest<Node>, tree: Tree<Node>) => {
  const index = forest.findIndex(
    candidate => candidate.value.type === tree.value.type && candidate.value.key === tree.value.key
  )
  if (index !== -1) {
    const subForest = forest[index].forest
    concatForest(subForest, tree.forest)
  } else {
    forest.push(tree)
  }
}

const concatForest = (a: Forest<Node>, b: Forest<Node>) => {
  b.forEach(tree => {
    concatTree(a, tree)
  })
}

export const toTree = (errors: t.Errors): Tree<Node> => {
  const forest = [fromError(errors[0])]
  errors.slice(1).forEach(error => {
    concatTree(forest, fromError(error))
  })
  if (forest.length > 1 || forest.length === 0) {
    throw new Error('something went wrong')
  }
  return forest[0]
}

const getRoot = (codec: t.Decoder<any, any>, actual: unknown): DecodeError => {
  const _tag = (codec as any)._tag
  switch (_tag) {
    case 'DictionaryType':
    case 'InterfaceType':
      return labeledProduct(actual, codec.name, {})
    case 'TupleType':
    case 'ArrayType':
      return indexedProduct(actual, codec.name, [])
    case 'UnionType':
      return or(actual, codec.name, [])
    case 'IntersectionType':
      return and(actual, codec.name, [])
    case 'ExactType':
      return labeledProduct(actual, codec.name, {})
    case 'ReadonlyType':
      const readonlyRoot = getRoot((codec as any).type, actual)
      readonlyRoot.expected = codec.name
      return readonlyRoot
    default:
      throw new Error(`[toDecodeError] unhandled ${_tag}`)
  }
}

export const toDecodeError = (errors: t.Errors): DecodeError => {
  const toDecodeError = (tree: Tree<Node>): DecodeError => {
    const value = tree.value
    const forest = tree.forest
    if (forest.length > 0) {
      const root = getRoot(value.type, value.actual)
      switch (root.type) {
        case 'LabeledProduct':
          forest.forEach(tree => {
            root.errors[tree.value.key] = toDecodeError(tree)
          })
          return root
        case 'IndexedProduct':
          root.errors = forest.map<[number, DecodeError]>(tree => [+tree.value.key, toDecodeError(tree)])
          return root
        case 'Or':
        case 'And':
          root.errors = forest.map(toDecodeError)
          return root
      }
    }
    return leaf(value.actual, value.type.name, value.message)
  }
  return toDecodeError(toTree(errors))
}
