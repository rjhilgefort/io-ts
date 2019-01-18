import * as assert from 'assert'
import { left } from 'fp-ts/lib/Either'
import * as t from '../src'
import { and, DecodeError, indexedProduct, labeledProduct, leaf, or } from '../src/DecodeError'
import { toDecodeError } from '../src/toDecodeError'
import { NumberFromString } from './helpers'

const assertDecodeError = (type: t.Mixed, value: unknown, error: DecodeError) => {
  assert.deepEqual(type.decode(value).mapLeft(errors => toDecodeError(errors)), left(error))
}

const C = t.type(
  {
    d: t.boolean
  },
  'C'
)

const TypeLabeledProduct = t.type(
  {
    a: t.string,
    b: t.number,
    c: C
  },
  'TypeLabeledProduct'
)

const DictionaryLabeledProduct = t.dictionary(t.keyof({ a: null, b: null }), t.number, 'DictionaryLabeledProduct')

const TupleIndexedProduct = t.tuple([t.string, t.number, C], 'IndexedProduct')

const ArrayIndexedProduct = t.array(C)

const E = t.type(
  {
    f: t.string
  },
  'E'
)

const IntersectionAnd = t.intersection([C, E], 'IntersectionAnd')

describe('toDecodeError', () => {
  describe('should account for custom messages', () => {
    it('Leaf', () => {
      const T = NumberFromString
      assertDecodeError(T, 'a', leaf('a', 'NumberFromString', 'cannot parse to a number'))
    })

    it('LabeledProduct', () => {
      const T = t.type({ a: NumberFromString }, 'T')
      assertDecodeError(
        T,
        { a: 'a' },
        labeledProduct({ a: 'a' }, 'T', { a: leaf('a', 'NumberFromString', 'cannot parse to a number') })
      )
    })

    it('IndexedProduct', () => {
      const T = t.tuple([t.string, NumberFromString], 'T')
      assertDecodeError(
        T,
        ['a', 'a'],
        indexedProduct(['a', 'a'], 'T', [[1, leaf('a', 'NumberFromString', 'cannot parse to a number')]])
      )
    })

    it('Or', () => {
      const T = t.union([t.boolean, NumberFromString], 'T')
      assertDecodeError(
        T,
        'a',
        or('a', 'T', [leaf('a', 'boolean'), leaf('a', 'NumberFromString', 'cannot parse to a number')])
      )
    })

    it('And', () => {
      const T = t.intersection([t.type({ a: t.boolean }, 'A'), t.type({ b: NumberFromString }, 'B')], 'T')
      assertDecodeError(
        T,
        { a: true, b: 'a' },
        and({ a: true, b: 'a' }, 'T', [
          labeledProduct({ a: true, b: 'a' }, 'B', { b: leaf('a', 'NumberFromString', 'cannot parse to a number') })
        ])
      )
    })
  })

  it('string', () => {
    assertDecodeError(t.string, null, leaf(null, 'string'))
  })

  it('type', () => {
    assertDecodeError(TypeLabeledProduct, null, leaf(null, 'TypeLabeledProduct'))
    assertDecodeError(
      TypeLabeledProduct,
      {},
      labeledProduct({}, 'TypeLabeledProduct', {
        a: leaf(undefined, 'string'),
        b: leaf(undefined, 'number'),
        c: leaf(undefined, 'C')
      })
    )
    assertDecodeError(
      TypeLabeledProduct,
      { a: 'a', b: 1, c: {} },
      labeledProduct({ a: 'a', b: 1, c: {} }, 'TypeLabeledProduct', {
        c: labeledProduct({}, 'C', {
          d: leaf(undefined, 'boolean')
        })
      })
    )
  })

  it('record', () => {
    assertDecodeError(DictionaryLabeledProduct, null, leaf(null, 'DictionaryLabeledProduct'))
    assertDecodeError(
      DictionaryLabeledProduct,
      { a: 'a' },
      labeledProduct({ a: 'a' }, 'DictionaryLabeledProduct', {
        a: leaf('a', 'number')
      })
    )
    assertDecodeError(
      DictionaryLabeledProduct,
      { c: 1 },
      labeledProduct({ c: 1 }, 'DictionaryLabeledProduct', {
        c: leaf('c', '"a" | "b"')
      })
    )
  })

  it('tuple', () => {
    assertDecodeError(TupleIndexedProduct, null, leaf(null, 'IndexedProduct'))
    assertDecodeError(
      TupleIndexedProduct,
      [],
      indexedProduct([], 'IndexedProduct', [
        [0, leaf(undefined, 'string')],
        [1, leaf(undefined, 'number')],
        [2, leaf(undefined, 'C')]
      ])
    )
    assertDecodeError(
      TupleIndexedProduct,
      ['a', 1],
      indexedProduct(['a', 1], 'IndexedProduct', [[2, leaf(undefined, 'C')]])
    )
    assertDecodeError(
      TupleIndexedProduct,
      ['a', 1, {}],
      indexedProduct(['a', 1, {}], 'IndexedProduct', [
        [
          2,
          labeledProduct({}, 'C', {
            d: leaf(undefined, 'boolean')
          })
        ]
      ])
    )
    assertDecodeError(
      TupleIndexedProduct,
      ['a', 1, { d: true }, 'additional'],
      indexedProduct(['a', 1, { d: true }, 'additional'], 'IndexedProduct', [[3, leaf('additional', 'never')]])
    )
  })

  it('array', () => {
    assertDecodeError(ArrayIndexedProduct, null, leaf(null, 'Array<C>'))
    assertDecodeError(ArrayIndexedProduct, [null], indexedProduct([null], 'Array<C>', [[0, leaf(null, 'C')]]))
    assertDecodeError(
      ArrayIndexedProduct,
      [{ d: true }, { d: null }],
      indexedProduct([{ d: true }, { d: null }], 'Array<C>', [
        [
          1,
          labeledProduct({ d: null }, 'C', {
            d: leaf(null, 'boolean')
          })
        ]
      ])
    )
  })

  it('union', () => {
    const T = t.union([t.string, C], 'T')

    assertDecodeError(T, null, or(null, 'T', [leaf(null, 'string'), leaf(null, 'C')]))

    assertDecodeError(
      T,
      {},
      or({}, 'T', [
        leaf({}, 'string'),
        labeledProduct({}, 'C', {
          d: leaf(undefined, 'boolean')
        })
      ])
    )
  })

  it('intersection', () => {
    assertDecodeError(IntersectionAnd, null, and(null, 'IntersectionAnd', [leaf(null, 'C'), leaf(null, 'E')]))
    assertDecodeError(
      IntersectionAnd,
      {},
      and({}, 'IntersectionAnd', [
        labeledProduct({}, 'C', {
          d: leaf(undefined, 'boolean')
        }),
        labeledProduct({}, 'E', {
          f: leaf(undefined, 'string')
        })
      ])
    )
  })

  it('readonly', () => {
    const T1 = t.readonly(t.type({ a: t.string }))
    assertDecodeError(T1, null, leaf(null, 'Readonly<{ a: string }>'))
    assertDecodeError(
      T1,
      {},
      labeledProduct({}, 'Readonly<{ a: string }>', {
        a: leaf(undefined, 'string')
      })
    )
    assertDecodeError(
      T1,
      { a: 1 },
      labeledProduct({ a: 1 }, 'Readonly<{ a: string }>', {
        a: leaf(1, 'string')
      })
    )
    const T2 = t.readonly(t.intersection([t.type({ a: t.string }), t.type({ b: t.number })]))
    assertDecodeError(
      T2,
      {},
      and({}, 'Readonly<({ a: string } & { b: number })>', [
        labeledProduct({}, '{ a: string }', {
          a: leaf(undefined, 'string')
        }),
        labeledProduct({}, '{ b: number }', {
          b: leaf(undefined, 'number')
        })
      ])
    )
  })

  it.skip('exact', () => {
    const T1 = t.exact(t.type({ a: t.string }))
    assertDecodeError(T1, null, leaf(null, 'ExactType<{ a: string }>'))
    assertDecodeError(
      T1,
      {},
      labeledProduct({}, 'ExactType<{ a: string }>', {
        a: leaf(undefined, 'string')
      })
    )
    assertDecodeError(
      T1,
      { a: 'a', b: 1 },
      labeledProduct({ a: 'a', b: 1 }, 'ExactType<{ a: string }>', {
        b: leaf(1, 'never')
      })
    )
    const T2 = t.exact(t.intersection([t.type({ a: t.string }), t.type({ b: t.number })]))
    assertDecodeError(T2, null, leaf(null, 'ExactType<({ a: string } & { b: number })>'))
  })
})
