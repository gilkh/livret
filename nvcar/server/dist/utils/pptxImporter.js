"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PptxImporter = void 0;
const jszip_1 = __importDefault(require("jszip"));
const xml2js_1 = require("xml2js");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const EMU_PER_PIXEL = 9525; // 914400 / 96
class PptxImporter {
    constructor(uploadDir) {
        this.zip = new jszip_1.default();
        this.uploadDir = uploadDir;
    }
    async parse(buffer) {
        this.zip = await jszip_1.default.loadAsync(buffer);
        // 1. Get Presentation Size
        const presentationXml = await this.zip.file('ppt/presentation.xml')?.async('text');
        if (!presentationXml)
            throw new Error('Invalid PPTX: missing presentation.xml');
        const presentation = await (0, xml2js_1.parseStringPromise)(presentationXml);
        const sldSz = presentation['p:presentation']['p:sldSz'][0]['$'];
        const pptWidth = parseInt(sldSz.cx);
        const pptHeight = parseInt(sldSz.cy);
        // Target width is 800 (from TemplateBuilder.tsx)
        const targetWidth = 800;
        const scaleFactor = targetWidth / (pptWidth / EMU_PER_PIXEL);
        // 2. Get Slides
        const slideFiles = [];
        // The order is defined in presentation.xml, but for simplicity we might just look for files
        // Better to look at relationships or the ID list in presentation.xml
        // For now, let's iterate through files in ppt/slides/
        // A more robust way: read ppt/_rels/presentation.xml.rels to find slide IDs and paths
        // But simple iteration of ppt/slides/slideX.xml usually works for simple cases.
        // Let's try to respect order from presentation.xml if possible, otherwise regex.
        const sldIdLst = presentation['p:presentation']['p:sldIdLst'][0]['p:sldId'];
        // We need to map r:id to filename.
        const relsXml = await this.zip.file('ppt/_rels/presentation.xml.rels')?.async('text');
        const rels = await (0, xml2js_1.parseStringPromise)(relsXml);
        const relMap = {};
        rels.Relationships.Relationship.forEach((r) => {
            relMap[r['$'].Id] = r['$'].Target;
        });
        const sortedSlideFiles = sldIdLst.map((sld) => {
            const rId = sld['$']['r:id'];
            const target = relMap[rId];
            return target.replace('slides/', ''); // target is usually "slides/slide1.xml"
        });
        const pages = [];
        for (const slideFile of sortedSlideFiles) {
            const page = await this.processSlide(slideFile, scaleFactor);
            pages.push(page);
        }
        return {
            name: 'Imported PPTX',
            pages
        };
    }
    async processSlide(filename, scale) {
        const xmlContent = await this.zip.file(`ppt/slides/${filename}`)?.async('text');
        if (!xmlContent)
            return { title: filename, blocks: [] };
        const slide = await (0, xml2js_1.parseStringPromise)(xmlContent);
        const blocks = [];
        // Load relationships for this slide (images)
        const relsFilename = `ppt/slides/_rels/${filename}.rels`;
        const relsContent = await this.zip.file(relsFilename)?.async('text');
        const relMap = {};
        if (relsContent) {
            const rels = await (0, xml2js_1.parseStringPromise)(relsContent);
            rels.Relationships.Relationship.forEach((r) => {
                relMap[r['$'].Id] = r['$'].Target;
            });
        }
        const spTree = slide['p:sld']['p:cSld'][0]['p:spTree'][0];
        // Iterate shapes
        const shapes = spTree['p:sp'] || [];
        for (const sp of shapes) {
            const block = await this.processShape(sp, scale);
            if (block)
                blocks.push(block);
        }
        // Iterate pictures
        const pics = spTree['p:pic'] || [];
        for (const pic of pics) {
            const block = await this.processPicture(pic, scale, relMap);
            if (block)
                blocks.push(block);
        }
        return {
            title: `Slide ${filename.replace('slide', '').replace('.xml', '')}`,
            blocks
        };
    }
    getTransform(sp, scale) {
        const xfrm = sp['p:spPr'][0]['a:xfrm'][0];
        const off = xfrm['a:off'][0]['$'];
        const ext = xfrm['a:ext'][0]['$'];
        const x = (parseInt(off.x) / EMU_PER_PIXEL) * scale;
        const y = (parseInt(off.y) / EMU_PER_PIXEL) * scale;
        const width = (parseInt(ext.cx) / EMU_PER_PIXEL) * scale;
        const height = (parseInt(ext.cy) / EMU_PER_PIXEL) * scale;
        return { x, y, width, height };
    }
    async processShape(sp, scale) {
        try {
            // Check if it has text
            const txBody = sp['p:txBody'];
            if (!txBody)
                return null; // Just a shape without text? Maybe implement later.
            const paragraphs = txBody[0]['a:p'];
            let text = '';
            let fontSize = 12;
            let color = '#000000';
            for (const p of paragraphs) {
                const runs = p['a:r'];
                if (runs) {
                    for (const r of runs) {
                        text += r['a:t'][0];
                        // Try to get font size and color from the first run
                        if (r['a:rPr']) {
                            const rPr = r['a:rPr'][0];
                            if (rPr['$'] && rPr['$'].sz) {
                                fontSize = parseInt(rPr['$'].sz) / 100; // PPT size is in 100th of point
                            }
                            // Color logic is complex in PPT (theme colors etc), simplified here
                            if (rPr['a:solidFill'] && rPr['a:solidFill'][0]['a:srgbClr']) {
                                color = '#' + rPr['a:solidFill'][0]['a:srgbClr'][0]['$'].val;
                            }
                        }
                    }
                }
                text += '\n';
            }
            text = text.trim();
            if (!text)
                return null;
            const { x, y, width, height } = this.getTransform(sp, scale);
            return {
                type: 'text',
                props: {
                    text,
                    x,
                    y,
                    fontSize: Math.round(fontSize * scale), // Scale font size too?
                    color,
                    width, // Text blocks in app might not use width/height constraint the same way, but let's keep it
                }
            };
        }
        catch (e) {
            console.error('Error processing shape', e);
            return null;
        }
    }
    async processPicture(pic, scale, relMap) {
        try {
            const blipFill = pic['p:blipFill'][0];
            const blip = blipFill['a:blip'][0];
            const embedId = blip['$']['r:embed'];
            if (!embedId || !relMap[embedId])
                return null;
            let target = relMap[embedId];
            // Target is relative to ppt/slides/, e.g., "../media/image1.png"
            // We need path relative to zip root.
            // ppt/slides/ + ../media/image1.png -> ppt/media/image1.png
            const imagePath = path_1.default.posix.join('ppt/slides', target);
            const imgData = await this.zip.file(imagePath)?.async('nodebuffer');
            if (!imgData)
                return null;
            // Save image
            const ext = path_1.default.extname(target);
            const filename = `imported-${(0, uuid_1.v4)()}${ext}`;
            const savePath = path_1.default.join(this.uploadDir, filename);
            // Ensure directory exists
            if (!fs_1.default.existsSync(this.uploadDir)) {
                fs_1.default.mkdirSync(this.uploadDir, { recursive: true });
            }
            fs_1.default.writeFileSync(savePath, imgData);
            const { x, y, width, height } = this.getTransform(pic, scale);
            return {
                type: 'image',
                props: {
                    url: `/uploads/media/${filename}`, // Assuming this is the public path
                    x,
                    y,
                    width,
                    height
                }
            };
        }
        catch (e) {
            console.error('Error processing picture', e);
            return null;
        }
    }
}
exports.PptxImporter = PptxImporter;
