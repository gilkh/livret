import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const EMU_PER_PIXEL = 9525; // 914400 / 96

interface Block {
    type: string;
    props: any;
}

interface Page {
    title: string;
    blocks: Block[];
    bgColor?: string;
}

interface Template {
    name: string;
    pages: Page[];
}

export class PptxImporter {
    private zip: JSZip;
    private uploadDir: string;
    private baseUrl: string;

    constructor(uploadDir: string, baseUrl: string = '') {
        this.zip = new JSZip();
        this.uploadDir = uploadDir;
        this.baseUrl = baseUrl;
    }

    async parse(buffer: Buffer): Promise<Template> {
        this.zip = await JSZip.loadAsync(buffer);

        // 1. Get Presentation Size
        const presentationXml = await this.zip.file('ppt/presentation.xml')?.async('text');
        if (!presentationXml) throw new Error('Invalid PPTX: missing presentation.xml');

        const presentation = await parseStringPromise(presentationXml);
        const sldSz = presentation['p:presentation']['p:sldSz'][0]['$'];
        const pptWidth = parseInt(sldSz.cx);
        const pptHeight = parseInt(sldSz.cy);

        // Target width is 800 (from TemplateBuilder.tsx)
        const targetWidth = 800;
        const scaleFactor = targetWidth / (pptWidth / EMU_PER_PIXEL);

        // 2. Get Slides
        const sldIdLst = presentation['p:presentation']['p:sldIdLst']?.[0]?.['p:sldId'];
        if (!sldIdLst) return { name: 'Imported PPTX', pages: [] };

        // We need to map r:id to filename.
        const relsXml = await this.zip.file('ppt/_rels/presentation.xml.rels')?.async('text');
        const relMap: Record<string, string> = {};

        if (relsXml) {
            const rels = await parseStringPromise(relsXml);
            const relationships = rels.Relationships?.Relationship || [];
            relationships.forEach((r: any) => {
                if (r['$'] && r['$'].Id && r['$'].Target) {
                    relMap[r['$'].Id] = r['$'].Target;
                }
            });
        }

        const sortedSlideFiles = sldIdLst.map((sld: any) => {
            const rId = sld['$']['r:id'];
            const target = relMap[rId];
            return target ? target.replace('slides/', '') : null;
        }).filter((f: string | null) => f !== null) as string[];

        const pages: Page[] = [];

        for (const slideFile of sortedSlideFiles) {
            const page = await this.processSlide(slideFile, scaleFactor);
            pages.push(page);
        }

        return {
            name: 'Imported PPTX',
            pages
        };
    }

    private async processSlide(filename: string, scale: number): Promise<Page> {
        const xmlContent = await this.zip.file(`ppt/slides/${filename}`)?.async('text');
        if (!xmlContent) return { title: filename, blocks: [] };

        const slide = await parseStringPromise(xmlContent);
        const blocks: Block[] = [];

        // Load relationships for this slide (images)
        const relsFilename = `ppt/slides/_rels/${filename}.rels`;
        const relsContent = await this.zip.file(relsFilename)?.async('text');
        const relMap: Record<string, string> = {};
        if (relsContent) {
            const rels = await parseStringPromise(relsContent);
            const relationships = rels.Relationships?.Relationship || [];
            relationships.forEach((r: any) => {
                if (r['$'] && r['$'].Id && r['$'].Target) {
                    relMap[r['$'].Id] = r['$'].Target;
                }
            });
        }

        const spTree = slide['p:sld']['p:cSld'][0]['p:spTree'][0];

        // Iterate shapes
        const shapes = spTree['p:sp'] || [];
        for (const sp of shapes) {
            const block = await this.processShape(sp, scale);
            if (block) blocks.push(block);
        }

        // Iterate pictures
        const pics = spTree['p:pic'] || [];
        for (const pic of pics) {
            const block = await this.processPicture(pic, scale, relMap);
            if (block) blocks.push(block);
        }

        return {
            title: `Slide ${filename.replace('slide', '').replace('.xml', '')}`,
            blocks
        };
    }

    private getTransform(sp: any, scale: number) {
        const xfrm = sp['p:spPr'][0]['a:xfrm'][0];
        const off = xfrm['a:off'][0]['$'];
        const ext = xfrm['a:ext'][0]['$'];

        const x = (parseInt(off.x) / EMU_PER_PIXEL) * scale;
        const y = (parseInt(off.y) / EMU_PER_PIXEL) * scale;
        const width = (parseInt(ext.cx) / EMU_PER_PIXEL) * scale;
        const height = (parseInt(ext.cy) / EMU_PER_PIXEL) * scale;

        return { x, y, width, height };
    }

    private async processShape(sp: any, scale: number): Promise<Block | null> {
        try {
            // Check if it has text
            const txBody = sp['p:txBody'];
            if (!txBody) return null; // Just a shape without text? Maybe implement later.

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
            if (!text) return null;

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
        } catch (e) {
            console.error('Error processing shape', e);
            return null;
        }
    }

    private async processPicture(pic: any, scale: number, relMap: Record<string, string>): Promise<Block | null> {
        try {
            const blipFill = pic['p:blipFill'][0];
            const blip = blipFill['a:blip'][0];
            const embedId = blip['$']['r:embed'];

            if (!embedId || !relMap[embedId]) return null;

            let target = relMap[embedId];
            // Target is relative to ppt/slides/, e.g., "../media/image1.png"
            // We need path relative to zip root.
            // ppt/slides/ + ../media/image1.png -> ppt/media/image1.png
            const imagePath = path.posix.join('ppt/slides', target);

            const imgData = await this.zip.file(imagePath)?.async('nodebuffer');
            if (!imgData) return null;

            // Save image
            const ext = path.extname(target);
            const filename = `imported-${uuidv4()}${ext}`;
            const savePath = path.join(this.uploadDir, filename);

            // Ensure directory exists
            if (!fs.existsSync(this.uploadDir)) {
                fs.mkdirSync(this.uploadDir, { recursive: true });
            }

            fs.writeFileSync(savePath, imgData);

            const { x, y, width, height } = this.getTransform(pic, scale);

            // Use baseUrl if available
            const url = this.baseUrl
                ? `${this.baseUrl}/uploads/media/${filename}`
                : `/uploads/media/${filename}`;

            return {
                type: 'image',
                props: {
                    url,
                    x,
                    y,
                    width,
                    height
                }
            };

        } catch (e) {
            console.error('Error processing picture', e);
            return null;
        }
    }
}
