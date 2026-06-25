import { describe, test, expect } from 'vitest'
import { getSizeConfig, getNextSize, getScaleForWidth } from './thumbnailScale.js'

describe('getSizeConfig', () => {
  test('devuelve configuración sm', () => {
    expect(getSizeConfig('sm').width).toBe(80)
  })

  test('devuelve configuración md', () => {
    expect(getSizeConfig('md').width).toBe(120)
  })

  test('devuelve configuración lg', () => {
    expect(getSizeConfig('lg').width).toBe(160)
  })

  test('devuelve md para tamaño desconocido', () => {
    expect(getSizeConfig('xl').width).toBe(120)
  })
})

describe('getNextSize', () => {
  test('sm → md', () => expect(getNextSize('sm')).toBe('md'))
  test('md → lg', () => expect(getNextSize('md')).toBe('lg'))
  test('lg → sm (cicla)', () => expect(getNextSize('lg')).toBe('sm'))
})

describe('getScaleForWidth', () => {
  test('calcula escala correctamente', () => {
    expect(getScaleForWidth(120, 600)).toBeCloseTo(0.2)
  })

  test('escala 1:1 cuando target === pdf width', () => {
    expect(getScaleForWidth(300, 300)).toBe(1)
  })
})
