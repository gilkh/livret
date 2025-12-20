"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="../test/types.d.ts" />
const templateUtils_1 = require("../utils/templateUtils");
describe('mergeAssignmentDataIntoTemplate', () => {
    it('merges language_toggle by stable block id', () => {
        const template = {
            pages: [
                {
                    blocks: [
                        { type: 'language_toggle', props: { blockId: 'b1', items: [{ lang: 'fr', active: true }] } }
                    ]
                }
            ]
        };
        const assignment = {
            data: {
                language_toggle_b1: [{ lang: 'fr', active: false }, { lang: 'en', active: true }]
            }
        };
        const merged = (0, templateUtils_1.mergeAssignmentDataIntoTemplate)(template, assignment);
        expect(merged.pages[0].blocks[0].props.items).toEqual([{ lang: 'fr', active: false }, { lang: 'en', active: true }]);
    });
});
