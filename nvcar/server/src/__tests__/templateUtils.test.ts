/// <reference path="../test/types.d.ts" />
import { mergeAssignmentDataIntoTemplate } from '../utils/templateUtils'

describe('mergeAssignmentDataIntoTemplate', () => {
  it('merges language_toggle by stable block id', () => {
    const template: any = {
      pages: [
        {
          blocks: [
            { type: 'language_toggle', props: { blockId: 'b1', items: [{ lang: 'fr', active: true }] } }
          ]
        }
      ]
    }

    const assignment: any = {
      data: {
        language_toggle_b1: [{ lang: 'fr', active: false }, { lang: 'en', active: true }]
      }
    }

    const merged = mergeAssignmentDataIntoTemplate(template, assignment)
    expect(merged.pages[0].blocks[0].props.items).toEqual([{ lang: 'fr', active: false }, { lang: 'en', active: true }])
  })
})