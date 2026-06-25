import { describe, test, expect } from 'vitest'
import { parseRange } from './pageRange.js'

describe('parseRange', () => {
  test('parsea página única', () => {
    expect(parseRange('3')).toEqual([3])
  })

  test('parsea lista de páginas', () => {
    expect(parseRange('1,3,5')).toEqual([1, 3, 5])
  })

  test('parsea rango con guión', () => {
    expect(parseRange('1-4')).toEqual([1, 2, 3, 4])
  })

  test('parsea rango mixto', () => {
    expect(parseRange('1,3-5,8')).toEqual([1, 3, 4, 5, 8])
  })

  test('devuelve array vacío para string vacío', () => {
    expect(parseRange('')).toEqual([])
  })

  test('devuelve array vacío para null', () => {
    expect(parseRange(null)).toEqual([])
  })

  test('elimina duplicados', () => {
    expect(parseRange('1,1,2')).toEqual([1, 2])
  })

  test('ordena las páginas', () => {
    expect(parseRange('5,1,3')).toEqual([1, 3, 5])
  })

  test('lanza error con página 0', () => {
    expect(() => parseRange('0,2')).toThrow()
  })

  test('lanza error con número negativo', () => {
    expect(() => parseRange('-1,2')).toThrow()
  })

  test('lanza error con rango invertido', () => {
    expect(() => parseRange('5-2')).toThrow()
  })

  test('lanza error con valor no numérico', () => {
    expect(() => parseRange('a,2')).toThrow()
  })
})
